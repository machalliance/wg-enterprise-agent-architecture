/**
 * The payment engine's validation gate.
 *
 * This is the agent's ground truth. It is computed from the instruction as it
 * currently stands, never from a stored verdict — so when the agent applies a
 * repair and re-validates, the result genuinely reflects the change. An engine
 * that returned a canned answer would let the agent believe it had fixed
 * something it had not, which is the failure mode a feedback loop exists to
 * prevent.
 */

import { abaValid, amountCheck, bicCheck, ibanCheck } from "./codes.ts";
import type { ReferenceData } from "./refdata.ts";
import type { Finding, Instruction, ValidationResult } from "./types.ts";

function finding(
  code: string,
  field: string,
  observed: string,
  additionalInformation: string,
  ref: ReferenceData,
): Finding {
  return {
    code,
    meaning: ref.statusReasonCodes[code] ?? "Unregistered code",
    field,
    observed,
    additionalInformation,
  };
}

function isStructuredAddress(
  address: Instruction["creditor"]["postalAddress"],
): boolean {
  // CBPR+ from 14 Nov 2026 accepts fully structured or hybrid. Both require
  // TownName and Country; fully unstructured is rejected.
  return Boolean(address.townName) && Boolean(address.country);
}

export function validateInstruction(
  instruction: Instruction,
  ref: ReferenceData,
): ValidationResult {
  const findings: Finding[] = [];
  const scheme = ref.schemeRules[instruction.scheme];

  // --- Creditor account -----------------------------------------------------
  const rawIban = instruction.creditorAccount.iban;
  if (rawIban) {
    const check = ibanCheck(rawIban, ref.ibanCountryLengths);
    if (!check.structurallyValid) {
      findings.push(
        finding(
          "AC01",
          "creditorAccount.iban",
          rawIban,
          `IBAN fails structural validation for country ${check.country}.`,
          ref,
        ),
      );
    } else if (!check.checkDigitsValid) {
      findings.push(
        finding(
          "AC01",
          "creditorAccount.iban",
          rawIban,
          "IBAN check digits fail ISO 7064 MOD 97-10. Mod-97 detects the error but does not locate it.",
          ref,
        ),
      );
    } else if (check.wasNormalised) {
      findings.push(
        finding(
          "AC01",
          "creditorAccount.iban",
          rawIban,
          "IBAN carries separators or lowercase characters and is not in transmission form.",
          ref,
        ),
      );
    }
  }

  // --- Creditor agent -------------------------------------------------------
  const bic = instruction.creditorAgent.bicfi;
  if (bic) {
    const check = bicCheck(bic);
    if (!check.wellFormed) {
      findings.push(
        finding("RC01", "creditorAgent.bicfi", bic, "BIC does not match the ISO 9362 pattern.", ref),
      );
    } else if (check.length === 8) {
      // An 8-character BICFI is valid under ISO 9362 — the branch code is
      // optional. Requiring 11 is this bank's usage rule, not the standard's,
      // and saying so matters: the repair is only deterministic because the
      // expansion to XXX is defined, not because the input was malformed.
      findings.push(
        finding(
          "RC01",
          "creditorAgent.bicfi",
          bic,
          "8-character BIC supplied; this institution's usage guideline requires the 11-character form.",
          ref,
        ),
      );
    } else if (ref.bicDirectory[check.input] === undefined) {
      findings.push(
        finding("RC01", "creditorAgent.bicfi", bic, "BIC is not present in the institution directory.", ref),
      );
    }
  }

  const member = instruction.creditorAgent.clearingSystemMemberId;
  if (member && !abaValid(member)) {
    findings.push(
      finding(
        "RC08",
        "creditorAgent.clearingSystemMemberId",
        member,
        "Routing number fails the 3-7-1 weighted checksum.",
        ref,
      ),
    );
  }

  // --- Amount ---------------------------------------------------------------
  const amount = amountCheck(
    instruction.amount.value,
    instruction.amount.currency,
    ref.currencyMinorUnits,
  );
  if (!amount.valid) {
    findings.push(
      finding(
        "CH16",
        "amount.value",
        `${instruction.amount.value} ${instruction.amount.currency}`,
        amount.expectedDecimals === null
          ? `Currency ${instruction.amount.currency} has no registered minor unit.`
          : `${instruction.amount.currency} carries ${amount.expectedDecimals} minor unit(s) under ISO 4217.`,
        ref,
      ),
    );
  }

  // --- Charge bearer --------------------------------------------------------
  const chargeRule = ref.chargeBearerRules[instruction.scheme];
  if (chargeRule && !chargeRule.allowed.includes(instruction.chargeBearer)) {
    findings.push(
      finding(
        "BE19",
        "chargeBearer",
        instruction.chargeBearer,
        `${instruction.scheme} permits ${chargeRule.allowed.join("/")} only.`,
        ref,
      ),
    );
  }

  // --- Purpose --------------------------------------------------------------
  if (scheme?.purposeCodeRequired && !instruction.purposeCode) {
    findings.push(
      finding(
        "CH21",
        "purposeCode",
        "(absent)",
        `${instruction.scheme} requires an ExternalPurpose1Code. The correct value depends on the commercial intent of the payment, which is not carried in the message.`,
        ref,
      ),
    );
  } else if (
    instruction.purposeCode &&
    ref.purposeCodes[instruction.purposeCode] === undefined
  ) {
    findings.push(
      finding("CH16", "purposeCode", instruction.purposeCode, "Purpose code is not registered.", ref),
    );
  }

  // --- Creditor address -----------------------------------------------------
  if (
    scheme?.structuredAddressRequired &&
    !isStructuredAddress(instruction.creditor.postalAddress)
  ) {
    findings.push(
      finding(
        "BE04",
        "creditor.postalAddress",
        (instruction.creditor.postalAddress.addressLines ?? []).join(" | ") || "(absent)",
        "Fully unstructured address. From 15 November 2026 CBPR+ requires TownName and Country at minimum.",
        ref,
      ),
    );
  }

  // --- Beneficiary identity -------------------------------------------------
  const registryKey =
    instruction.creditorAccount.iban !== undefined
      ? ibanCheck(instruction.creditorAccount.iban, ref.ibanCountryLengths).normalised
      : `${instruction.creditorAccount.domicile}:${instruction.creditorAccount.otherId}`;
  const account = ref.accountRegistry[registryKey];
  if (account && account.accountHolder !== instruction.creditor.name) {
    findings.push(
      finding(
        "BE01",
        "creditor.name",
        instruction.creditor.name,
        `Name on account is "${account.accountHolder}". A name difference is not proof of a typo — it can be a trading name, a successor entity, or the wrong account.`,
        ref,
      ),
    );
  }
  if (account && !account.currencies.includes(instruction.amount.currency)) {
    findings.push(
      finding(
        "AM03",
        "amount.currency",
        instruction.amount.currency,
        `Account is registered for ${account.currencies.join("/")}. This is either a data error or a genuine multi-currency arrangement; the message cannot tell you which.`,
        ref,
      ),
    );
  }

  return {
    txId: instruction.txId,
    txSts: findings.length === 0 ? "ACTC" : "RJCT",
    findings,
  };
}

export function validateBatch(
  instructions: Instruction[],
  ref: ReferenceData,
): ValidationResult[] {
  return instructions.map((i) => validateInstruction(i, ref));
}
