/**
 * The policy layer. Everything the agent is allowed to do is decided here, and
 * nothing here consults the model.
 *
 * Three rules carry the whole design:
 *
 *   1. Screening is evaluated BEFORE failure analysis, not after. An instruction
 *      under any screening state other than CLEAR is Tier C regardless of what
 *      is wrong with it. The agent never gets as far as forming an opinion.
 *
 *   2. A Tier C instruction is frozen field-by-field, not just flagged. There is
 *      no code path in this file that returns a proposed value for a frozen
 *      instruction — `candidateRepairs` returns an empty array before it looks
 *      at a single finding.
 *
 *   3. Tier A requires a citation. A repair with no reference-data entry behind
 *      it is not deterministic by definition, so it is not Tier A.
 *
 * Rule 2 is the one to read twice. Modifying the field that caused an
 * interdiction and resubmitting is the conduct in Lloyds TSB (2009 — the bank's
 * own word for it was "repair"), Deutsche Bank (2015 — a named repair queue),
 * Commerzbank (2015), Credit Agricole (2015) and UniCredit (2019, where OFAC
 * listed "manual manipulation and resubmission of payments rejected by U.S.
 * financial institutions" as an aggravating factor). The control is structural
 * rather than instructional because an instruction is something a model can
 * reason its way around and a missing return value is not.
 */

import { amountCheck, bicCheck, ibanCheck } from "./codes.ts";
import type { Mandate, ReferenceData } from "./refdata.ts";
import type {
  Disposition,
  Instruction,
  RepairProposal,
  Screening,
  Tier,
  ValidationResult,
} from "./types.ts";

export interface TieredProposal extends RepairProposal {
  tier: Tier;
  /** For Tier B: the question the human is actually being asked. */
  question?: string;
  /** For Tier B: which queue owns the decision. */
  owner?: string;
}

/** Codes whose correct value is a reference-data lookup, not a judgement. */
const TIER_A_CODES = new Set(["RC01", "CH16", "BE19"]);

/**
 * Codes that need a person even when a candidate value is obvious, and which
 * desk that person sits on. The queue definitions are in `seed/mandate.json`;
 * routing to a queue that does not own the question is how an escalation
 * becomes a second queue's problem two days later.
 */
const TIER_B_OWNERS: Record<string, string> = {
  AC01: "PAYMENT-REPAIR-L1",
  BE01: "CLIENT-SERVICE", // beneficiary identity — confirm with the payer
  AM03: "TREASURY-OPS", // currency vs account domicile — a funding question
  CH21: "CLIENT-SERVICE", // purpose code — commercial intent
  RC08: "PAYMENT-REPAIR-L1",
  BE04: "PAYMENT-REPAIR-L1",
};

/**
 * The tier of an instruction as a whole. Screening first, always.
 */
export function classify(
  instruction: Instruction,
  validation: ValidationResult,
  screening: Screening | undefined,
  mandate: Mandate,
): Disposition {
  const state = screening?.state ?? "CLEAR";

  if (state !== "CLEAR") {
    return {
      txId: instruction.txId,
      tier: "C",
      rationale:
        state === "BLOCKED"
          ? "Confirmed match against a designated party. The instruction does not proceed in any form; property is blocked and reported."
          : state === "TRAVEL_RULE_REVIEW"
            ? "Originator/beneficiary information is under FATF R.16 completeness review. As the ordering institution we owe accurate originator information, and INR.16 defines accurate as verified. Supplying the value ourselves does not make it verified — it makes it look verified, which is the failure mode rather than the fix."
            : "Sanctions filter raised a possible match. Adjudication belongs to a trained human; no field of this instruction may be modified.",
      owner: screening?.queue ?? "SANCTIONS-L2",
      codes: [screening?.disclosureToCounterparty ?? "RR04"],
      frozen: true,
    };
  }

  // Note the order. Screening is evaluated above this line, so an instruction
  // that is clean on every field but sitting under a hold never reaches here.
  // "Passes validation" and "may be released" are different questions, and a
  // desk that conflates them releases the one payment it must not.
  if (validation.txSts === "ACTC") {
    return {
      txId: instruction.txId,
      tier: "A",
      rationale: "Passes validation and is screened clear. Nothing to do.",
      owner: null,
      codes: [],
      frozen: false,
    };
  }

  const codes = validation.findings.map((f) => f.code);
  const overMandate =
    Number(instruction.amount.value) >
      Number(mandate.writeScope.maxInstructionValue.value) &&
    instruction.amount.currency === mandate.writeScope.maxInstructionValue.currency;

  if (overMandate) {
    return {
      txId: instruction.txId,
      tier: "B",
      rationale: `Instruction value exceeds the desk's mandate ceiling of ${mandate.writeScope.maxInstructionValue.value} ${mandate.writeScope.maxInstructionValue.currency}.`,
      owner: "TREASURY-OPS",
      codes,
      frozen: false,
    };
  }

  // AC01 lives in both tiers and the difference is the whole point. A lowercase
  // IBAN is presentation; a failed check digit is a guess about where the money
  // goes. Only the first is deterministic, so only the first is Tier A.
  const deterministic = (f: (typeof validation.findings)[number]): boolean => {
    if (f.code === "AC01") {
      return (
        f.additionalInformation.includes("transmission form") &&
        (instruction.creditorAccount.iban ?? "") !== ""
      );
    }
    return TIER_A_CODES.has(f.code);
  };

  const tier: Tier = validation.findings.every(deterministic) ? "A" : "B";

  if (tier === "A") {
    return {
      txId: instruction.txId,
      tier: "A",
      rationale:
        "Every finding resolves to a single correct value from standing reference data. No judgement is exercised.",
      owner: null,
      codes,
      frozen: false,
    };
  }

  const owner =
    TIER_B_OWNERS[
      validation.findings.find((f) => TIER_B_OWNERS[f.code] !== undefined)?.code ??
        "AC01"
    ] ?? "PAYMENT-REPAIR-L1";

  return {
    txId: instruction.txId,
    tier: "B",
    rationale:
      "At least one finding turns on identity or commercial intent, neither of which is carried in the message. A candidate value may be proposed; it may not be committed by the agent.",
    owner,
    codes,
    frozen: false,
  };
}

/**
 * Candidate repairs for an instruction.
 *
 * Note the first three lines. A frozen instruction returns an empty array before
 * any finding is inspected, so there is no branch of this function capable of
 * emitting a modified field for an instruction under a screening state. The
 * accompanying test asserts that property over every instruction x every field.
 */
export function candidateRepairs(
  instruction: Instruction,
  validation: ValidationResult,
  disposition: Disposition,
  ref: ReferenceData,
): TieredProposal[] {
  if (disposition.frozen) return [];

  const out: TieredProposal[] = [];

  for (const f of validation.findings) {
    switch (f.code) {
      case "AC01": {
        const raw = instruction.creditorAccount.iban ?? "";
        const check = ibanCheck(raw, ref.ibanCountryLengths);
        if (check.repairableByNormalisation) {
          out.push({
            txId: instruction.txId,
            field: "creditorAccount.iban",
            from: raw,
            to: check.normalised,
            tier: "A",
            citation:
              "ISO 13616 — separators and case are presentation only; the normalised value passes ISO 7064 MOD 97-10, so the account identified is unchanged.",
          });
        }
        // A failed check digit yields no candidate. Mod-97 detects the error
        // without locating it, so any value the agent produced would be a guess
        // about where the money goes.
        break;
      }

      case "RC01": {
        const raw = instruction.creditorAgent.bicfi ?? "";
        const check = bicCheck(raw);
        if (check.expandedTo11 && ref.bicDirectory[check.expandedTo11]) {
          out.push({
            txId: instruction.txId,
            field: "creditorAgent.bicfi",
            from: raw,
            to: check.expandedTo11,
            tier: "A",
            citation: `ISO 9362 — an 8-character BIC denotes the head office and expands with branch code XXX. Directory entry ${check.expandedTo11}: ${ref.bicDirectory[check.expandedTo11].institution}.`,
          });
        }
        break;
      }

      case "CH16": {
        if (f.field === "amount.value") {
          const check = amountCheck(
            instruction.amount.value,
            instruction.amount.currency,
            ref.currencyMinorUnits,
          );
          if (check.canonical !== null) {
            out.push({
              txId: instruction.txId,
              field: "amount.value",
              from: instruction.amount.value,
              to: check.canonical,
              tier: "A",
              citation: `ISO 4217 — ${instruction.amount.currency} carries ${check.expectedDecimals} minor unit(s). Only trailing zeros are removed, so the value is unchanged.`,
            });
          }
        }
        break;
      }

      case "BE19": {
        const rule = ref.chargeBearerRules[instruction.scheme];
        if (rule && rule.allowed.length === 1) {
          out.push({
            txId: instruction.txId,
            field: "chargeBearer",
            from: instruction.chargeBearer,
            to: rule.allowed[0],
            tier: "A",
            citation: `Scheme rule — ${instruction.scheme} permits ${rule.allowed[0]} only, so the correct value is not a choice.`,
          });
        } else if (rule) {
          out.push({
            txId: instruction.txId,
            field: "chargeBearer",
            from: instruction.chargeBearer,
            to: rule.recommended,
            tier: "B",
            owner: "PAYMENT-REPAIR-L1",
            question: `${instruction.scheme} permits ${rule.allowed.join("/")}. Charge allocation is a commercial term between the parties — confirm ${rule.recommended}.`,
            citation: `Scheme rule — ${instruction.scheme} permits ${rule.allowed.join("/")}; ${rule.recommended} is the scheme's recommendation, not a determination.`,
          });
        }
        break;
      }

      case "CH21": {
        if (f.field === "purposeCode") {
          const hint = inferPurposeFromRemittance(instruction, ref);
          out.push({
            txId: instruction.txId,
            field: "purposeCode",
            from: "(absent)",
            to: hint.code,
            tier: "B",
            owner: "CLIENT-SERVICE",
            question: `Remittance reads "${instruction.remittanceInformation.unstructured.join(" ")}". Confirm the purpose is ${hint.code} (${ref.purposeCodes[hint.code]}).`,
            citation: `ExternalPurpose1Code ${hint.code} — ${hint.basis}. This is a reading of free text, not a lookup.`,
          });
        }
        break;
      }

      case "BE01": {
        const key =
          instruction.creditorAccount.iban !== undefined
            ? ibanCheck(instruction.creditorAccount.iban, ref.ibanCountryLengths).normalised
            : `${instruction.creditorAccount.domicile}:${instruction.creditorAccount.otherId}`;
        const account = ref.accountRegistry[key];
        if (account) {
          out.push({
            txId: instruction.txId,
            field: "creditor.name",
            from: instruction.creditor.name,
            to: account.accountHolder,
            tier: "B",
            owner: "CLIENT-SERVICE",
            question: `Instruction names "${instruction.creditor.name}"; the account is held by "${account.accountHolder}". Confirm these are the same party before the name is changed.`,
            citation:
              "Account registry — the registry name is a candidate, not a confirmation. A name difference can be a trading name, a successor entity, or the wrong account entirely.",
          });
        }
        break;
      }

      case "AM03":
      case "RC08":
      case "BE04":
      default:
        // No candidate. These are detections without a determinable value.
        break;
    }
  }

  return out;
}

function inferPurposeFromRemittance(
  instruction: Instruction,
  ref: ReferenceData,
): { code: string; basis: string } {
  const text = instruction.remittanceInformation.unstructured.join(" ").toUpperCase();
  if (/INVOICE|INV |SUPPLY|SUPPLIER/.test(text) && ref.purposeCodes.SUPP) {
    return { code: "SUPP", basis: 'remittance text names an invoice and a supply relationship' };
  }
  if (/PO |PURCHASE|GOODS|HARDWARE/.test(text) && ref.purposeCodes.GDDS) {
    return { code: "GDDS", basis: "remittance text names a purchase order for goods" };
  }
  if (/FEE|SERVICE|RETAINER|AUDIT|CONSULT/.test(text) && ref.purposeCodes.SCVE) {
    return { code: "SCVE", basis: "remittance text names a service" };
  }
  return { code: "OTHR", basis: "no discriminating term found in the remittance text" };
}

export interface GuardVerdict {
  allowed: boolean;
  reason: string;
  /** Set when the refusal is a compliance stop rather than a scope miss. */
  hardStop: boolean;
}

/**
 * The last gate before a write. Called by the repair tool AND by its approval
 * policy, so a denial cannot be routed around by approving it.
 */
export function guardRepair(
  field: string,
  disposition: Disposition,
  screening: Screening | undefined,
  mandate: Mandate,
): GuardVerdict {
  const state = screening?.state ?? "CLEAR";

  if (state !== "CLEAR") {
    return {
      allowed: false,
      hardStop: true,
      reason: `Instruction is under screening state ${state}. No field may be modified, and no modified value may be proposed. Route to ${screening?.queue ?? "SANCTIONS-L2"} with the instruction untouched.`,
    };
  }

  if (disposition.frozen) {
    return {
      allowed: false,
      hardStop: true,
      reason: "Instruction is frozen. No write is permitted.",
    };
  }

  if (mandate.writeScope.neverRepairable.some((p) => field === p || field.startsWith(`${p}.`))) {
    return {
      allowed: false,
      hardStop: false,
      reason: `${field} is outside the desk's write scope under mandate ${mandate.mandateId}. Changing it is a different authority's decision.`,
    };
  }

  if (!mandate.writeScope.repairableFields.includes(field)) {
    return {
      allowed: false,
      hardStop: false,
      reason: `${field} is not in the mandate's repairable-field list. The list is an allow-list: anything not named is unreachable.`,
    };
  }

  return { allowed: true, hardStop: false, reason: "Within write scope." };
}

export interface Accounting {
  stillFailing: string[];
  frozen: string[];
  unaccounted: string[];
}

/**
 * What is still outstanding at close.
 *
 * An instruction is done when it passes validation AND is screened clear, or
 * when it has been handed to a named owner. Passing validation is not on its own
 * enough: a screened instruction with nothing wrong on any field is still not
 * releasable, and a desk that counted it as finished would release the one
 * payment it must not.
 */
export function accountFor(
  items: { txId: string; passes: boolean; frozen: boolean; handled: boolean }[],
): Accounting {
  const stillFailing = items.filter((i) => !i.passes).map((i) => i.txId);
  const frozen = items.filter((i) => i.frozen).map((i) => i.txId);
  const unaccounted = items
    .filter((i) => (!i.passes || i.frozen) && !i.handled)
    .map((i) => i.txId);
  return { stillFailing, frozen, unaccounted };
}

/** True when the field is one a sanctions filter reads. */
export function isScreeningRelevant(field: string, mandate: Mandate): boolean {
  return mandate.screeningRelevantFields.fields.some(
    (p) => field === p || field.startsWith(`${p}.`),
  );
}
