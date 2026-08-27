import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CheckpointStore, initialState, type AgentState } from "./checkpoint.js";

/**
 * Durable checkpoint store (M2). Exercises the two properties that make the
 * checkpoint useful for governance: it survives a restart (resume-from-latest),
 * and it is tamper-evident (a modified row breaks the hash chain). Also covers
 * the retention-prune-keeps-the-chain-intact case — the exact regression that
 * was found and fixed during the build, where anchoring verification at
 * "genesis" falsely flagged every pruned chain.
 *
 * RETENTION is read at module load (default 50); rather than shell out to set a
 * lower value, the prune test simply writes past 50 and checks the invariant.
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meridian-ckpt-"));
  dbPath = join(dir, "checkpoint.db");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** A distinct per-cycle snapshot (its own working memory). Accumulation across
 *  cycles is the caller's job and is covered by its own test below. */
function stateForCycle(cycle: number): AgentState {
  const s = initialState();
  s.workingMemory.currentCycle = cycle;
  s.workingMemory.recentObservations = [{ cycle, sku: "MER-TENT-3S", action: "observe", outcome: "stable" }];
  if (cycle % 4 === 0) {
    s.longTermContext.learnedPatterns.push({
      pattern: `pattern-from-cycle-${cycle}`,
      confidence: 0.8,
      since: `cycle_${cycle}`,
    });
  }
  return s;
}

describe("checkpoint store", () => {
  it("persists checkpoints and resumes from the latest after a 'restart'", () => {
    const store = new CheckpointStore(dbPath);
    for (let c = 1; c <= 6; c++) store.save(c, stateForCycle(c));
    store.close();

    // A fresh instance = a process restart reading the same DB file.
    const resumed = new CheckpointStore(dbPath);
    const latest = resumed.loadLatest();
    assert.ok(latest, "there is a checkpoint to resume from");
    assert.equal(latest.cycleNumber, 6, "resumes from the last cycle");
    assert.equal(resumed.count(), 6);
    resumed.close();
  });

  it("separates working memory (per-cycle) from long-term context (accumulating)", () => {
    // The store persists whatever snapshot it is handed; ACCUMULATION is the
    // caller's job (the loop resumes the prior state, appends to long-term
    // context, and saves again). This models that: carry the context forward.
    const store = new CheckpointStore(dbPath);
    const carried = initialState();
    for (let c = 1; c <= 8; c++) {
      carried.workingMemory.currentCycle = c;
      // Working memory is REPLACED each cycle (only the latest observation).
      carried.workingMemory.recentObservations = [
        { cycle: c, sku: "MER-TENT-3S", action: "observe", outcome: "stable" },
      ];
      // Long-term context GROWS: a new pattern on cycles 4 and 8, carried across.
      if (c % 4 === 0) {
        carried.longTermContext.learnedPatterns.push({
          pattern: `pattern-from-cycle-${c}`,
          confidence: 0.8,
          since: `cycle_${c}`,
        });
      }
      store.save(c, structuredClone(carried));
    }
    const latest = store.loadLatest()!;
    // Working memory reflects only the last cycle...
    assert.equal(latest.workingMemory.currentCycle, 8);
    assert.equal(latest.workingMemory.recentObservations.length, 1);
    // ...while long-term context accumulated across cycles 4 and 8.
    assert.equal(latest.longTermContext.learnedPatterns.length, 2, "patterns accumulated across cycles");
    store.close();
  });

  it("cold start returns null", () => {
    const store = new CheckpointStore(dbPath);
    assert.equal(store.loadLatest(), null);
    assert.equal(store.count(), 0);
    store.close();
  });

  it("verifies an intact hash chain", () => {
    const store = new CheckpointStore(dbPath);
    for (let c = 1; c <= 5; c++) store.save(c, stateForCycle(c));
    const result = store.verifyChain();
    assert.equal(result.ok, true);
    assert.equal(store.count(), 5, "the verified chain is non-empty");
    store.close();
  });

  it("detects tampering with a checkpoint's long-term context", () => {
    const store = new CheckpointStore(dbPath);
    for (let c = 1; c <= 6; c++) store.save(c, stateForCycle(c));
    store.close();

    // Rewrite cycle 3's long-term context directly in the DB, leaving its hash.
    const raw = new DatabaseSync(dbPath);
    raw
      .prepare("UPDATE checkpoints SET long_term_context = ? WHERE cycle_number = 3")
      .run(JSON.stringify({ learnedPatterns: [{ pattern: "TAMPERED", confidence: 1, since: "evil" }], categoryBaselines: {} }));
    raw.close();

    const result = new CheckpointStore(dbPath).verifyChain();
    assert.equal(result.ok, false, "tampering is detected");
    assert.ok(result.brokenAtId !== null, "reports where the chain broke");
  });

  it("prunes to the retention limit AND keeps the surviving chain verifiable", () => {
    // The regression: after pruning, the oldest surviving row's prior_hash points
    // at a deleted row, so a genesis-anchored check would wrongly report a break.
    const RETENTION = 50; // module default
    const store = new CheckpointStore(dbPath);
    for (let c = 1; c <= RETENTION + 5; c++) store.save(c, stateForCycle(c));
    assert.equal(store.count(), RETENTION, "count is capped at the retention limit");
    assert.equal(store.loadLatest()!.cycleNumber, RETENTION + 5, "the latest is still the most recent save");
    assert.equal(store.verifyChain().ok, true, "the pruned chain still verifies (the fixed bug)");
    store.close();
  });
});
