import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DecisionTrail, type DecisionRecord } from "./decision-trail.js";

/**
 * Decision trail (M4): the accountability record. The two properties that matter
 * most are tamper-evidence (a modified record breaks the hash chain from that
 * point) and causal traversal ("why did this happen?"). Both are exercised here
 * against real files in a temp dir.
 */

let dir: string;
let trailPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meridian-trail-"));
  trailPath = join(dir, "decision-trail.jsonl");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Minimal but complete decision input; overrides let a test set causal links. */
function decision(
  sku: string,
  overrides: Partial<Omit<DecisionRecord, "kind" | "id" | "timestamp" | "priorRecordHash" | "hash">> = {},
) {
  return {
    cycleNumber: 1,
    trigger: { type: "market_signal" as const, signal: { sku } },
    reasoning: { summary: `repriced ${sku}`, causalPriorDecisions: [] as string[] },
    proposedAction: { tool: "set_price", args: { sku, newPrice: 205 }, changePct: 3 },
    policyResult: {
      tier: "PERMIT" as const,
      rule: "PERMIT:WITHIN_AUTONOMOUS_BAND",
      explanation: "within band",
      context: { sku, category: "outdoor-tents", currentPrice: 199, cost: 118 },
    },
    outcome: { executed: true, resultPrice: 205 },
    ...overrides,
  };
}

describe("decision trail", () => {
  it("appends decisions and reads them back in order", () => {
    const t = new DecisionTrail(trailPath);
    t.appendDecision(decision("MER-TENT-3S"));
    t.appendDecision(decision("MER-HYD-2L"));
    const all = t.readAll();
    assert.equal(all.length, 2);
    assert.equal(all[0]!.kind, "decision");
  });

  it("verifies an intact hash chain", () => {
    const t = new DecisionTrail(trailPath);
    t.appendDecision(decision("MER-TENT-3S"));
    t.appendDecision(decision("MER-HYD-2L"));
    t.appendDecision(decision("MER-PACK-30"));
    const result = t.verifyChain();
    assert.equal(result.ok, true);
    assert.equal(result.brokenAtId, null);
    assert.equal(t.readAll().length, 3, "the chain we verified is non-empty");
  });

  it("detects tampering with a record, at the exact record id", () => {
    const t = new DecisionTrail(trailPath);
    t.appendDecision(decision("MER-TENT-3S"));
    const target = t.appendDecision(decision("MER-HYD-2L"));
    t.appendDecision(decision("MER-PACK-30"));
    assert.equal(t.verifyChain().ok, true, "intact before tampering");

    // Tamper: rewrite the middle record's proposed price, leaving its stored hash.
    const lines = readFileSync(trailPath, "utf8").split("\n").filter(Boolean);
    const idx = lines.findIndex((l) => (JSON.parse(l) as DecisionRecord).id === target.id);
    assert.ok(idx >= 0, "found the record to tamper with");
    const rec = JSON.parse(lines[idx]!) as DecisionRecord;
    (rec.proposedAction.args as { newPrice: number }).newPrice = 9999;
    lines[idx] = JSON.stringify(rec);
    writeFileSync(trailPath, lines.join("\n") + "\n");

    const result = new DecisionTrail(trailPath).verifyChain();
    assert.equal(result.ok, false, "tampering is detected");
    assert.equal(result.brokenAtId, target.id, "detected at the tampered record");
  });

  it("traces a causal chain back through causalPriorDecisions", () => {
    const t = new DecisionTrail(trailPath);
    const first = t.appendDecision(decision("MER-TENT-2P"));
    const second = t.appendDecision(
      decision("MER-TENT-3S", {
        reasoning: { summary: "raised 3S after 2P cut shifted demand", causalPriorDecisions: [first.id] },
      }),
    );
    const chain = t.causalChain(second.id);
    assert.equal(chain.length, 2, "the second decision and the one it built on");
    assert.deepEqual(
      chain.map((c) => c.id).sort(),
      [first.id, second.id].sort(),
    );
  });

  it("appends observations that reference a prior decision without mutating it", () => {
    const t = new DecisionTrail(trailPath);
    const d = t.appendDecision(decision("MER-TENT-3S"));
    t.appendObservation(d.id, { conversionChange: 0.12, note: "conversion up after the cut" });
    const all = t.readAll();
    assert.equal(all.length, 2);
    const obs = all.find((r) => r.kind === "observation");
    assert.ok(obs, "the observation was appended");
    // The chain still verifies with a mixed decision+observation sequence.
    assert.equal(t.verifyChain().ok, true);
  });
});


describe("anomaly records — the agent's judgment made durable", () => {
  function anomaly(sku: string) {
    return {
      cycleNumber: 4,
      sku,
      observation: "FeedX quotes ~75% below normal across the catalog",
      suspectedCause: "feed pricing error, not a genuine price move",
      actionTaken: "flagged for operator; no price change made",
    };
  }

  it("appends an anomaly and reads it back as kind:anomaly with its fields intact", () => {
    const t = new DecisionTrail(trailPath);
    const rec = t.appendAnomaly(anomaly("MER-TENT-3S"));
    assert.equal(rec.kind, "anomaly");
    assert.ok(rec.id && rec.hash, "anomaly must get an id and a hash");

    const all = t.readAll();
    const anomalies = all.filter((r) => r.kind === "anomaly");
    assert.equal(anomalies.length, 1, "exactly one anomaly should have been written");
    const a = anomalies[0]! as typeof rec;
    assert.equal(a.sku, "MER-TENT-3S");
    assert.match(a.observation, /75%/);
    assert.match(a.suspectedCause, /feed/i);
    assert.match(a.actionTaken, /no price change/i);
  });

  it("hash-chains anomalies alongside decisions; the chain stays valid", () => {
    const t = new DecisionTrail(trailPath);
    t.appendDecision(decision("MER-TENT-3S"));
    t.appendAnomaly(anomaly("MER-HYD-2L")); // agent catches bad data mid-run
    t.appendDecision(decision("MER-PACK-30"));
    // Non-vacuous: we actually wrote a mix of kinds.
    const kinds = t.readAll().map((r) => r.kind);
    assert.deepEqual(kinds, ["decision", "anomaly", "decision"]);
    assert.deepEqual(t.verifyChain(), { ok: true, brokenAtId: null });
  });

  it("detects tampering with an anomaly record at its exact id", () => {
    const t = new DecisionTrail(trailPath);
    t.appendDecision(decision("MER-TENT-3S"));
    const target = t.appendAnomaly(anomaly("MER-HYD-2L"));
    t.appendDecision(decision("MER-PACK-30"));
    assert.equal(t.verifyChain().ok, true, "chain intact before tampering");

    // Rewrite the anomaly's observation on disk without recomputing its hash.
    const lines = readFileSync(trailPath, "utf8").split("\n").filter(Boolean);
    const tampered = lines.map((l) => {
      const r = JSON.parse(l);
      if (r.id === target.id) r.observation = "actually a real 75% competitor price war";
      return JSON.stringify(r);
    });
    writeFileSync(trailPath, tampered.join("\n") + "\n");

    const result = t.verifyChain();
    assert.equal(result.ok, false, "tampering must be detected");
    assert.equal(result.brokenAtId, target.id, "and pinpointed to the anomaly record");
  });
})
