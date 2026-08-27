import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  CircuitBreakers,
  DEFAULT_BREAKER_CONFIG,
  revenueImpact,
  type BreakerConfig,
  type ProposedActionImpact,
} from "./breakers.js";

/**
 * Circuit breakers (M5). Every method takes an explicit `now`, so these tests
 * drive time deterministically instead of sleeping — the windows (5-minute burst,
 * 1-hour rate/magnitude) are exercised by passing timestamps, not by wall clock.
 */

const T0 = 1_700_000_000_000; // fixed epoch base for readable offsets
const MIN = 60_000;

/** A small in-scope change: |45-44| * 150 units = $150 revenue impact. */
function small(): ProposedActionImpact {
  return { sku: "MER-HYD-1L", currentPrice: 44, newPrice: 45, estimatedWeeklyUnits: 150 };
}

describe("revenueImpact", () => {
  it("is |Δprice| × estimated weekly units, sign-independent", () => {
    assert.equal(revenueImpact({ sku: "x", currentPrice: 100, newPrice: 90, estimatedWeeklyUnits: 10 }), 100);
    assert.equal(revenueImpact({ sku: "x", currentPrice: 90, newPrice: 100, estimatedWeeklyUnits: 10 }), 100);
  });
});

describe("rate limiter", () => {
  it("allows the burst quota, then trips on the one that exceeds it", () => {
    const b = new CircuitBreakers();
    const allowed: boolean[] = [];
    // Seven rapid actions within the same 5-minute window (burst cap is 5).
    for (let i = 0; i < 7; i++) {
      const v = b.evaluate(small(), T0 + i * 1000);
      allowed.push(v.allow);
      if (v.allow) b.record(small(), T0 + i * 1000);
    }
    assert.deepEqual(allowed, [true, true, true, true, true, false, false], "first 5 allowed, then burst limit");
  });

  it("reports rate_limit_burst as the reason at the trip", () => {
    const b = new CircuitBreakers();
    for (let i = 0; i < DEFAULT_BREAKER_CONFIG.rate.burstMaxPer5Min; i++) {
      b.record(small(), T0 + i * 1000);
    }
    const v = b.evaluate(small(), T0 + 6000);
    assert.equal(v.allow, false);
    assert.ok(v.reasons.includes("rate_limit_burst"), `expected rate_limit_burst, got ${v.reasons.join(",")}`);
  });

  it("does not trip once the burst window has passed", () => {
    const b = new CircuitBreakers();
    for (let i = 0; i < 5; i++) b.record(small(), T0 + i * 1000); // fill the burst window
    // 6 minutes later, the 5-minute burst window has rolled off.
    const v = b.evaluate(small(), T0 + 6 * MIN);
    assert.equal(v.allow, true, "burst window expired, action allowed again");
  });
});

describe("magnitude limiter", () => {
  it("halts a single action whose revenue impact exceeds the hourly cap", () => {
    const b = new CircuitBreakers();
    // |1 - 469| × 200 = $93,600 > $50,000 cap.
    const huge: ProposedActionImpact = { sku: "MER-TENT-EXP", currentPrice: 469, newPrice: 1, estimatedWeeklyUnits: 200 };
    const v = b.evaluate(huge, T0);
    assert.equal(v.allow, false);
    assert.ok(v.reasons.includes("magnitude_limit"));
  });
});

describe("anomaly detector", () => {
  it("escalates NORMAL → MINOR → SIGNIFICANT → EXTREME as the hourly count climbs", () => {
    // Isolate anomaly from the rate/magnitude limiters so only the z-score can fire.
    const cfg: BreakerConfig = {
      rate: { maxPerHour: 100_000, burstMaxPer5Min: 100_000 },
      magnitude: { maxRevenueImpactPerHour: 1e12 },
      baseline: { avgActionsPerHour: 8, stdDevActionsPerHour: 3 },
    };
    const b = new CircuitBreakers(cfg);
    const levels: string[] = [];
    // Spread across the hour so the burst window never matters; only the hourly count grows.
    for (let i = 0; i < 20; i++) {
      const v = b.evaluate(small(), T0 + i * 1000);
      levels.push(v.level);
      if (v.allow) b.record(small(), T0 + i * 1000);
    }
    // z = (n - 8) / 3, evaluated on the prospective count (n includes the action):
    //   MINOR > 1.5 ⇒ n > 12.5 ⇒ at the 13th eval; SIGNIFICANT > 2 ⇒ n > 14; EXTREME > 3 ⇒ n > 17.
    assert.equal(levels[0], "NORMAL");
    assert.ok(levels.includes("MINOR"), "reached MINOR");
    assert.ok(levels.includes("SIGNIFICANT"), "reached SIGNIFICANT");
    const firstExtreme = levels.indexOf("EXTREME");
    assert.equal(firstExtreme, 17, "EXTREME at the 18th action (n=18, z=3.33)");
  });

  it("halts with anomaly_extreme once the level is EXTREME", () => {
    const cfg: BreakerConfig = {
      rate: { maxPerHour: 100_000, burstMaxPer5Min: 100_000 },
      magnitude: { maxRevenueImpactPerHour: 1e12 },
      baseline: { avgActionsPerHour: 8, stdDevActionsPerHour: 3 },
    };
    const b = new CircuitBreakers(cfg);
    for (let i = 0; i < 17; i++) b.record(small(), T0 + i * 1000); // 17 already recorded
    const v = b.evaluate(small(), T0 + 18_000); // 18th is EXTREME
    assert.equal(v.allow, false);
    assert.ok(v.reasons.includes("anomaly_extreme"));
    assert.equal(v.level, "EXTREME");
  });
});

describe("snapshot", () => {
  it("reports the current window counts without mutating them", () => {
    const b = new CircuitBreakers();
    b.record(small(), T0);
    b.record(small(), T0 + 1000);
    const snap = b.snapshot(T0 + 2000);
    assert.equal(snap.actionsThisHour, 2);
    assert.equal(snap.actionsThis5Min, 2);
    assert.equal(snap.cumulativeRevenueImpactThisHour, 300); // 2 × $150
    // A second snapshot is identical — snapshot is read-only.
    assert.deepEqual(b.snapshot(T0 + 2000), snap);
  });

  it("reset clears the windows", () => {
    const b = new CircuitBreakers();
    b.record(small(), T0);
    b.reset();
    assert.equal(b.snapshot(T0).actionsThisHour, 0);
  });
});
