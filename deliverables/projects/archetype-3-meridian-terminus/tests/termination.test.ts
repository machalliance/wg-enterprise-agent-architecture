/**
 * Termination and the trail.
 *
 * A goal-directed agent that cannot declare an ending is an autonomous agent
 * nobody decided to build, so the three endings get their own tests — including
 * the one that says an agent cannot claim success while work is outstanding.
 */

import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { accountFor } from "../agent/lib/policy.ts";
import { RunStore } from "../agent/lib/store.ts";
import { Trail, verifyTrail } from "../agent/lib/trail.ts";

test("the step ceiling is reached, not merely requested", () => {
  const run = new RunStore("dry-run", { maxSteps: 3 });
  assert.equal(run.budgetState().exhausted, false);
  run.countStep();
  run.countStep();
  run.countStep();
  assert.equal(run.budgetState().exhausted, false, "the ceiling itself is allowed");
  run.countStep();
  const state = run.budgetState();
  assert.equal(state.exhausted, true);
  assert.match(state.reason ?? "", /step ceiling of 3/);
});

test("the tool-call ceiling is independent of the step ceiling", () => {
  const run = new RunStore("dry-run");
  for (let i = 0; i <= run.mandate.budget.maxToolCalls; i += 1) run.countToolCall();
  assert.match(run.budgetState().reason ?? "", /tool-call ceiling/);
});

test("dry-run computes but does not commit", () => {
  const run = new RunStore("dry-run");
  const before = run.instruction("TX-004")?.chargeBearer;
  run.writeField("TX-004", "chargeBearer", "SLEV");
  assert.equal(run.instruction("TX-004")?.chargeBearer, before, "dry run must not mutate");

  const live = new RunStore("commit");
  live.writeField("TX-004", "chargeBearer", "SLEV");
  assert.equal(live.instruction("TX-004")?.chargeBearer, "SLEV");
});

test("each run gets its own working copy", () => {
  const a = new RunStore("commit");
  a.writeField("TX-004", "chargeBearer", "SLEV");
  const b = new RunStore("commit");
  assert.equal(b.instruction("TX-004")?.chargeBearer, "SHAR", "seed leaked between runs");
});

test("success cannot be claimed while an instruction is unaccounted for", () => {
  const accounting = accountFor([
    { txId: "TX-001", passes: true, frozen: false, handled: true },
    { txId: "TX-005", passes: false, frozen: false, handled: false },
  ]);
  assert.deepEqual(accounting.unaccounted, ["TX-005"]);
});

test("an escalated instruction is accounted for even though it still fails", () => {
  const accounting = accountFor([
    { txId: "TX-005", passes: false, frozen: false, handled: true },
  ]);
  assert.deepEqual(accounting.unaccounted, []);
  assert.deepEqual(accounting.stillFailing, ["TX-005"]);
});

test("the outcome record names every instruction exactly once", () => {
  const run = new RunStore("commit");
  run.recordEscalation({
    txId: "TX-005",
    queue: "CLIENT-SERVICE",
    reasonCode: "CH21",
    rationale: "intent",
    proposal: null,
    at: new Date().toISOString(),
  });
  const outcome = run.close("BLOCKED", "one outstanding", ["TX-005"]);
  const named = [
    ...outcome.repaired,
    ...outcome.escalated.map((e) => e.txId),
    ...outcome.untouched,
  ];
  assert.equal(new Set(named).size, named.length, "an instruction appears twice");
  assert.equal(named.length, run.batch.instructions.length);
});

test("the trail is hash-chained", () => {
  const trail = new Trail("chain-test", false);
  trail.append("goal", 0, "opened");
  trail.append("tool-call", 1, "validate_instruction", { txId: "TX-001" });
  trail.append("termination", 2, "closed");

  assert.equal(trail.records[0].prevHash, "0".repeat(64));
  assert.equal(trail.records[1].prevHash, trail.records[0].hash);
  assert.equal(trail.records[2].prevHash, trail.records[1].hash);
});

test("verifyTrail detects an edited record", () => {
  // Written to disk and re-read, because verification has to work against the
  // artefact a reviewer actually receives rather than an in-memory array.
  const dir = mkdtempSync(join(tmpdir(), "terminus-"));
  const good = join(dir, "good.jsonl");
  const edited = join(dir, "edited.jsonl");

  const trail = new Trail("verify-test", false);
  trail.append("goal", 0, "opened");
  trail.append("tool-call", 1, "apply_repair", { txId: "TX-002", field: "creditorAgent.bicfi" });
  trail.append("termination", 2, "closed");
  const lines = trail.records.map((r) => JSON.stringify(r));

  writeFileSync(good, `${lines.join("\n")}\n`, "utf8");
  assert.deepEqual(verifyTrail(good), { ok: true, brokenAt: null });

  // Change one field of the middle record and leave its stored hash alone —
  // the way someone would edit a log they wanted to look different.
  const middle = JSON.parse(lines[1]) as { summary: string };
  middle.summary = "apply_repair (approved)";
  const tampered = [lines[0], JSON.stringify(middle), lines[2]];
  writeFileSync(edited, `${tampered.join("\n")}\n`, "utf8");

  const result = verifyTrail(edited);
  assert.equal(result.ok, false, "an edited record was accepted");
  assert.equal(result.brokenAt, 2, "the break should be reported at the edited record");
});

test("verifyTrail reports a missing file rather than passing it", () => {
  const result = verifyTrail(join(tmpdir(), "does-not-exist.jsonl"));
  assert.equal(result.ok, false);
});
