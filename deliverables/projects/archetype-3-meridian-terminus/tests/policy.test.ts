/**
 * The acceptance suite for the policy layer.
 *
 * The test that matters most is `hard stop is structural, not instructional`.
 * Everything else here checks that the desk does its job; that one checks that
 * it cannot do the job it must never do.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  loadBatch,
  loadMandate,
  loadReferenceData,
  loadScreening,
} from "../agent/lib/refdata.ts";
import {
  accountFor,
  candidateRepairs,
  classify,
  guardRepair,
  isScreeningRelevant,
} from "../agent/lib/policy.ts";
import { projectField } from "../agent/lib/store.ts";
import { validateInstruction } from "../agent/lib/validate.ts";

const ref = loadReferenceData();
const mandate = loadMandate();
const screening = loadScreening();
const batch = loadBatch();

function setup(txId: string) {
  const instruction = batch.instructions.find((i) => i.txId === txId);
  assert.ok(instruction, `seed is missing ${txId}`);
  const validation = validateInstruction(instruction, ref);
  const scr = screening[txId];
  const disposition = classify(instruction, validation, scr, mandate);
  return { instruction, validation, screening: scr, disposition };
}

// ---------------------------------------------------------------------------
// The hard stop
// ---------------------------------------------------------------------------

test("hard stop is structural, not instructional", () => {
  // Every instruction under a screening state, crossed with every field the
  // mandate would otherwise permit. Not one combination may yield a write or a
  // proposed value.
  const held = Object.entries(screening).filter(([, s]) => s.state !== "CLEAR");
  assert.ok(held.length >= 2, "seed must contain at least two screened instructions");

  for (const [txId] of held) {
    const { instruction, validation, screening: scr, disposition } = setup(txId);

    assert.equal(disposition.tier, "C", `${txId} must be Tier C`);
    assert.equal(disposition.frozen, true, `${txId} must be frozen`);

    // No candidate value is produced, for any reason.
    const candidates = candidateRepairs(instruction, validation, disposition, ref);
    assert.deepEqual(candidates, [], `${txId} produced a repair candidate`);

    // No field is writable, including fields with nothing to do with the match.
    for (const field of mandate.writeScope.repairableFields) {
      const verdict = guardRepair(field, disposition, scr, mandate);
      assert.equal(verdict.allowed, false, `${txId}.${field} was permitted`);
      assert.equal(verdict.hardStop, true, `${txId}.${field} refused for the wrong reason`);
    }
  }
});

test("a screened instruction that passes validation is still not finished", () => {
  const { validation, disposition } = setup("TX-008");
  assert.equal(validation.txSts, "ACTC", "TX-008 should be clean on every field");
  assert.equal(disposition.frozen, true, "and still frozen");

  const accounting = accountFor([
    { txId: "TX-008", passes: true, frozen: true, handled: false },
  ]);
  assert.deepEqual(accounting.unaccounted, ["TX-008"]);
});

test("the disclosure code never reveals a screening match", () => {
  // There is no dedicated "sanctions hit" status reason code, deliberately. The
  // codes a bank discloses say something true about the message and nothing
  // about the filter.
  //
  // TX-008: RR04 RegulatoryReason, which is deliberately opaque.
  assert.deepEqual(setup("TX-008").disposition.codes, ["RR04"]);
  // TX-009: RR03 MissingCreditorNameOrAddress — accurate about the address, and
  // silent about the review it triggered.
  assert.deepEqual(setup("TX-009").disposition.codes, ["RR03"]);

  const forbidden = ["AM07", "FR01", "SANC", "OFAC"];
  for (const txId of ["TX-008", "TX-009"]) {
    for (const code of setup(txId).disposition.codes) {
      assert.equal(forbidden.includes(code), false, `${txId} disclosed ${code}`);
    }
  }
});

// ---------------------------------------------------------------------------
// Tier A — deterministic repair
// ---------------------------------------------------------------------------

test("tier A repairs are deterministic, cited, and actually resolve the finding", () => {
  for (const txId of ["TX-001", "TX-002", "TX-003", "TX-004"]) {
    const { instruction, validation, disposition } = setup(txId);
    assert.equal(disposition.tier, "A", `${txId} should be Tier A`);

    const candidates = candidateRepairs(instruction, validation, disposition, ref);
    assert.ok(candidates.length > 0, `${txId} produced no candidate`);

    for (const candidate of candidates) {
      assert.equal(candidate.tier, "A");
      assert.ok(
        candidate.citation.length > 20,
        `${txId} candidate has no usable citation`,
      );
      const after = validateInstruction(
        projectField(instruction, candidate.field, candidate.to),
        ref,
      );
      assert.ok(
        !after.findings.some((f) => f.field === candidate.field),
        `${txId} repair to ${candidate.field} did not clear its finding`,
      );
    }
  }
});

test("a Tier A repair never changes the amount, only its representation", () => {
  const { instruction, validation, disposition } = setup("TX-003");
  const candidate = candidateRepairs(instruction, validation, disposition, ref).find(
    (c) => c.field === "amount.value",
  );
  assert.ok(candidate);
  assert.equal(Number(candidate.from), Number(candidate.to));
});

// ---------------------------------------------------------------------------
// Tier B — proposal only
// ---------------------------------------------------------------------------

test("a failed IBAN check digit yields no candidate at all", () => {
  // Mod-97 detects without locating. A "repaired" check digit is a guess about
  // where the money goes, so the correct number of candidates is zero — not one
  // marked Tier B.
  const broken = structuredClone(batch.instructions[0]);
  broken.creditorAccount.iban = "DE89370400440532013001";
  const validation = validateInstruction(broken, ref);
  assert.ok(validation.findings.some((f) => f.code === "AC01"));

  const disposition = classify(broken, validation, { state: "CLEAR", screenedAt: "" }, mandate);
  assert.equal(disposition.tier, "B");
  assert.deepEqual(candidateRepairs(broken, validation, disposition, ref), []);
});

test("identity and intent are proposals with a question attached", () => {
  for (const txId of ["TX-005", "TX-006"]) {
    const { instruction, validation, disposition } = setup(txId);
    assert.equal(disposition.tier, "B", `${txId} should be Tier B`);
    const candidates = candidateRepairs(instruction, validation, disposition, ref);
    assert.ok(candidates.length > 0);
    for (const candidate of candidates) {
      assert.equal(candidate.tier, "B");
      assert.ok(candidate.question, `${txId} proposal must state what is being confirmed`);
      assert.ok(candidate.owner, `${txId} proposal must name an owner`);
    }
  }
});

test("a currency mismatch is a detection, not a repair", () => {
  const { instruction, validation, disposition } = setup("TX-007");
  assert.ok(validation.findings.some((f) => f.code === "AM03"));
  assert.deepEqual(candidateRepairs(instruction, validation, disposition, ref), []);
});

test("a currency mismatch routes to the desk that owns funding, not identity", () => {
  // Routing to a queue that does not own the question is how an escalation
  // becomes a second queue's problem two days later.
  const { disposition } = setup("TX-007");
  assert.equal(disposition.owner, "TREASURY-OPS");
});

test("a failed ABA checksum yields no candidate either", () => {
  // Same arithmetic argument as the IBAN: the 3-7-1 weighting detects a
  // single-digit error without locating it.
  const broken = structuredClone(batch.instructions.find((i) => i.txId === "TX-007")!);
  broken.creditorAgent.clearingSystemMemberId = "121000247";
  const validation = validateInstruction(broken, ref);
  assert.ok(validation.findings.some((f) => f.code === "RC08"), "RC08 should be raised");

  const disposition = classify(broken, validation, { state: "CLEAR", screenedAt: "" }, mandate);
  assert.equal(disposition.tier, "B");
  const candidates = candidateRepairs(broken, validation, disposition, ref);
  assert.equal(
    candidates.some((c) => c.field === "creditorAgent.clearingSystemMemberId"),
    false,
    "a routing number was guessed",
  );
});

// ---------------------------------------------------------------------------
// Write scope
// ---------------------------------------------------------------------------

test("the mandate's field list is an allow-list, not a deny-list", () => {
  const { screening: scr, disposition } = setup("TX-001");
  // Present in neither list: unreachable, and refused as out of scope rather
  // than as a hard stop.
  const verdict = guardRepair("creditor.lei", disposition, scr, mandate);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.hardStop, false);
});

test("debtor-side fields cannot be written at all", () => {
  const { screening: scr, disposition } = setup("TX-001");
  for (const field of ["debtorAccount.iban", "debtor.name", "amount.currency", "uetr"]) {
    assert.equal(guardRepair(field, disposition, scr, mandate).allowed, false, field);
  }
});

test("screening-relevant fields are named and cover the creditor identity", () => {
  assert.ok(isScreeningRelevant("creditor.name", mandate));
  assert.ok(isScreeningRelevant("creditor.postalAddress", mandate));
  assert.ok(isScreeningRelevant("creditor.postalAddress.townName", mandate));
  assert.equal(isScreeningRelevant("amount.value", mandate), false);
});

// ---------------------------------------------------------------------------
// Seed premises — if these drift, every assertion above is testing fiction
// ---------------------------------------------------------------------------

test("the seed still contains the scenario the docs describe", () => {
  const results = batch.instructions.map((i) => ({
    txId: i.txId,
    validation: validateInstruction(i, ref),
    disposition: classify(i, validateInstruction(i, ref), screening[i.txId], mandate),
  }));

  const byTier = (t: string) =>
    results.filter((r) => r.validation.txSts === "RJCT" || r.disposition.frozen)
      .filter((r) => r.disposition.tier === t)
      .map((r) => r.txId);

  assert.deepEqual(byTier("A"), ["TX-001", "TX-002", "TX-003", "TX-004"]);
  assert.deepEqual(byTier("B"), ["TX-005", "TX-006", "TX-007"]);
  assert.deepEqual(byTier("C"), ["TX-008", "TX-009"]);

  const clean = results
    .filter((r) => r.validation.txSts === "ACTC" && !r.disposition.frozen)
    .map((r) => r.txId);
  assert.deepEqual(clean, ["TX-010", "TX-011", "TX-012"]);
});
