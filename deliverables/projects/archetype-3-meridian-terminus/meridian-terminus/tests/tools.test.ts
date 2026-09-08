/**
 * The tool layer, exercised directly.
 *
 * `policy.test.ts` proves the policy functions behave. That is not the same as
 * proving the *tools* behave, and the difference is exactly where a guarantee
 * goes missing: a correct `guardRepair` is worth nothing if `apply_repair`
 * forgets to call it. So these tests import the real tool modules and invoke
 * their `execute` and `approval` members with a stub session context — the same
 * entry points eve uses.
 *
 * Trails are disabled here via TERMINUS_TRAIL=off so the suite does not litter
 * trails/ with fixtures that a reviewer would mistake for runs.
 */

process.env.TERMINUS_TRAIL = "off";

import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import applyRepair from "../agent/tools/apply_repair.ts";
import closeBatch from "../agent/tools/close_batch.ts";
import escalateToDesk from "../agent/tools/escalate_to_desk.ts";
import getScreeningStatus from "../agent/tools/get_screening_status.ts";
import listRepairQueue from "../agent/tools/list_repair_queue.ts";
import lookupReferenceData from "../agent/tools/lookup_reference_data.ts";
import validateInstructionTool from "../agent/tools/validate_instruction.ts";
import { resetRuns, runFor } from "../agent/lib/store.ts";
import { resetTrails } from "../agent/lib/trail.ts";

let n = 0;
/** A fresh session id per test, so module-level run state never leaks. */
function ctx(): { session: { id: string } } {
  n += 1;
  return { session: { id: `test-${n}` } };
}

// `any` here is deliberate and confined to the harness: eve's ToolContext
// carries a sandbox handle and stream plumbing these tools never touch, and
// constructing one would test the stub rather than the tool.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const run = (tool: any, input: unknown, c = ctx()) => tool.execute(input, c);

/**
 * `approval` may be a helper object (`always()`, `once()`, `never()`) or an
 * authored policy function. Narrowing it here doubles as the assertion that
 * `apply_repair` carries a real policy rather than a helper — swapping the
 * policy for `always()` would make every Tier A repair prompt a human and every
 * Tier C repair *offer a person the button*, which is the failure this whole
 * design is arranged to avoid.
 */
const approvalPolicy = applyRepair.approval;
if (typeof approvalPolicy !== "function") {
  throw new Error("apply_repair must carry an authored approval policy, not a helper");
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const approve = (toolInput: unknown, id: string) =>
  approvalPolicy({
    session: { id },
    toolName: "apply_repair",
    callId: `call-${id}`,
    approvedTools: [],
    toolInput,
  } as any);

beforeEach(() => {
  resetRuns();
  resetTrails();
  process.env.REPAIR_MODE = "commit";
});

// ---------------------------------------------------------------------------
// apply_repair — the only writer
// ---------------------------------------------------------------------------

test("apply_repair refuses a frozen instruction and says it is a hard stop", async () => {
  const result = await run(applyRepair, {
    txId: "TX-009",
    field: "creditor.postalAddress",
    value: "DUBAI",
    citation: "CBPR+ structured address requirement, TownName and Country",
  });
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  assert.equal(result.hardStop, true);
  assert.match(result.reason, /TRAVEL_RULE_REVIEW/);
  assert.match(result.guidance, /untouched/);
});

test("apply_repair refuses every writable field on a frozen instruction", async () => {
  const mandate = runFor("scope-probe").mandate;
  for (const field of mandate.writeScope.repairableFields) {
    const result = await run(applyRepair, {
      txId: "TX-008",
      field,
      value: "ANYTHING",
      citation: "a citation long enough to pass the length check",
    });
    assert.equal(result.ok, false, `${field} was not refused`);
    assert.equal(result.hardStop, true, `${field} refused for the wrong reason`);
  }
});

test("the approval policy denies a frozen instruction rather than asking a human", async () => {
  // Asking would put an approve button in front of the one person who must
  // never be offered one, so the correct answer is denied, not user-approval.
  const verdict = await approve(
    { txId: "TX-008", field: "creditor.name", value: "X", citation: "y" },
    "approval-1",
  );
  assert.equal(typeof verdict, "object");
  assert.equal((verdict as { type: string }).type, "denied");
});

test("the approval policy auto-allows a Tier A candidate and prompts for anything else", async () => {
  const tierA = await approve(
    { txId: "TX-002", field: "creditorAgent.bicfi", value: "DEUTDEFFXXX", citation: "ISO 9362" },
    "approval-2",
  );
  assert.equal(tierA, "not-applicable");

  // A value the agent invented is never Tier A, however plausible. DEUTDEFF500
  // is a well-formed BIC for a real institution — it is simply not the one the
  // expansion rule produces.
  const invented = await approve(
    { txId: "TX-002", field: "creditorAgent.bicfi", value: "DEUTDEFF500", citation: "ISO 9362" },
    "approval-3",
  );
  assert.equal(invented, "user-approval");
});

test("apply_repair refuses a repair with no usable citation", async () => {
  const result = await run(applyRepair, {
    txId: "TX-002",
    field: "creditorAgent.bicfi",
    value: "DEUTDEFFXXX",
    citation: "because",
  });
  assert.equal(result.ok, false);
  assert.match(result.reason, /reference-data entry/);
});

test("apply_repair commits a Tier A repair and reports the engine's verdict", async () => {
  const c = ctx();
  const result = await run(
    applyRepair,
    {
      txId: "TX-002",
      field: "creditorAgent.bicfi",
      value: "DEUTDEFFXXX",
      citation: "ISO 9362 — an 8-character BIC expands with branch code XXX.",
    },
    c,
  );
  assert.equal(result.ok, true);
  assert.equal(result.tier, "A");
  assert.equal(result.revalidation.before.txSts, "RJCT");
  assert.equal(result.revalidation.after.txSts, "ACTC");
  assert.deepEqual(result.revalidation.resolved, ["RC01"]);
  assert.equal(runFor(c.session.id).instruction("TX-002")?.creditorAgent.bicfi, "DEUTDEFFXXX");
});

test("apply_repair in dry-run reports the outcome without committing it", async () => {
  process.env.REPAIR_MODE = "dry-run";
  const c = ctx();
  const result = await run(
    applyRepair,
    {
      txId: "TX-004",
      field: "chargeBearer",
      value: "SLEV",
      citation: "Scheme rule — SEPA permits SLEV only.",
    },
    c,
  );
  assert.equal(result.ok, true);
  assert.equal(result.mode, "dry-run");
  // The outcome is still computed — a dry run that could not tell you whether
  // the fix works would only prove the agent was willing to try.
  assert.equal(result.revalidation.after.txSts, "ACTC");
  assert.equal(runFor(c.session.id).instruction("TX-004")?.chargeBearer, "SHAR");
});

test("apply_repair refuses a field outside the mandate as out-of-scope, not a hard stop", async () => {
  const result = await run(applyRepair, {
    txId: "TX-001",
    field: "debtorAccount.iban",
    value: "GB33BUKB20201555555555",
    citation: "a citation long enough to pass the length check",
  });
  assert.equal(result.ok, false);
  assert.equal(result.hardStop, false);
});

// ---------------------------------------------------------------------------
// escalate_to_desk
// ---------------------------------------------------------------------------

test("escalate_to_desk strips a proposal from a frozen escalation and reroutes it", async () => {
  const result = await run(escalateToDesk, {
    txId: "TX-009",
    queue: "PAYMENT-REPAIR-L1",
    reasonCode: "BE04",
    rationale: "address needs structuring",
    proposal: {
      field: "creditor.postalAddress",
      value: "DUBAI, AE",
      citation: "CBPR+",
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.proposalStripped, true);
  assert.equal(result.proposalCarried, false);
  assert.equal(result.routedTo, "SANCTIONS-L2");
  assert.equal(result.queueRewritten, true);
});

test("escalate_to_desk carries a proposal for an unfrozen instruction", async () => {
  const result = await run(escalateToDesk, {
    txId: "TX-006",
    queue: "CLIENT-SERVICE",
    reasonCode: "BE01",
    rationale: "name does not match the registry",
    proposal: {
      field: "creditor.name",
      value: "NORDWIND TEXTILHANDEL GMBH",
      citation: "account registry",
    },
  });
  assert.equal(result.proposalCarried, true);
  assert.equal(result.proposalStripped, false);
});

// ---------------------------------------------------------------------------
// close_batch — termination
// ---------------------------------------------------------------------------

test("close_batch refuses GOAL_ACHIEVED while instructions are unaccounted for", async () => {
  const result = await run(closeBatch, {
    termination: "GOAL_ACHIEVED",
    narrative: "all done",
  });
  assert.equal(result.ok, false);
  assert.equal(result.refused, true);
  // TX-008 passes validation and is still outstanding, because it is held.
  assert.ok(result.unaccounted.includes("TX-008"));
  assert.ok(result.unaccounted.includes("TX-005"));
});

test("close_batch accepts BLOCKED and names what is outstanding", async () => {
  const c = ctx();
  const result = await run(
    closeBatch,
    { termination: "BLOCKED", narrative: "needs a person" },
    c,
  );
  assert.equal(result.ok, true);
  assert.equal(result.outcome.termination, "BLOCKED");
  assert.ok(result.outcome.stillFailing.length > 0);
});

// ---------------------------------------------------------------------------
// The budget ceiling, enforced where it is enforced
// ---------------------------------------------------------------------------

test("tools return BUDGET_EXHAUSTED once the ceiling is passed", async () => {
  const c = ctx();
  const store = runFor(c.session.id);
  for (let i = 0; i <= store.mandate.budget.maxToolCalls; i += 1) store.countToolCall();

  const result = await run(validateInstructionTool, { txId: "TX-001" }, c);
  assert.equal(result.ok, false);
  assert.equal(result.terminal, "BUDGET_EXHAUSTED");
  assert.match(result.guidance, /close_batch/);
});

test("close_batch still works when the budget is spent", async () => {
  // Otherwise the agent is told to close and then prevented from closing.
  const c = ctx();
  const store = runFor(c.session.id);
  for (let i = 0; i <= store.mandate.budget.maxToolCalls; i += 1) store.countToolCall();

  const result = await run(
    closeBatch,
    { termination: "BUDGET_EXHAUSTED", narrative: "ran out" },
    c,
  );
  assert.equal(result.ok, true);
  assert.equal(result.outcome.termination, "BUDGET_EXHAUSTED");
});

// ---------------------------------------------------------------------------
// Read-side tools
// ---------------------------------------------------------------------------

test("list_repair_queue never hides an instruction under a screening hold", async () => {
  const result = await run(listRepairQueue, { onlyFailing: true });
  const ids = result.queue.map((r: { txId: string }) => r.txId);
  // TX-008 passes validation. A queue filtered to failures would drop it, which
  // is why the filter has an exception rather than a warning in a comment.
  assert.ok(ids.includes("TX-008"), "a held instruction was filtered out of the queue");
  assert.equal(
    result.queue.find((r: { txId: string }) => r.txId === "TX-008").underScreeningHold,
    true,
  );
  assert.equal(ids.includes("TX-010"), false, "a clean instruction leaked into the queue");
});

test("get_screening_status is read-only and says so", async () => {
  const held = await run(getScreeningStatus, { txId: "TX-008" });
  assert.equal(held.state, "POTENTIAL_MATCH");
  assert.equal(held.writesPermitted, false);
  assert.equal(held.disclosureCode, "RR04");

  const clear = await run(getScreeningStatus, { txId: "TX-001" });
  assert.equal(clear.writesPermitted, true);
});

test("an unscreened instruction is not treated as clear", async () => {
  const result = await run(getScreeningStatus, { txId: "TX-999" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /not a CLEAR result/);
});

test("lookup_reference_data offers no candidate for a frozen instruction", async () => {
  const result = await run(lookupReferenceData, { txId: "TX-009", include: [] });
  assert.equal(result.frozen, true);
  assert.deepEqual(result.candidates, []);
});

test("lookup_reference_data reports findings it cannot resolve", async () => {
  const result = await run(lookupReferenceData, { txId: "TX-007", include: [] });
  assert.deepEqual(result.candidates, []);
  assert.ok(
    result.candidatesWithoutRepair.some((c: { code: string }) => c.code === "AM03"),
    "an unresolvable finding must be reported, not silently dropped",
  );
});
