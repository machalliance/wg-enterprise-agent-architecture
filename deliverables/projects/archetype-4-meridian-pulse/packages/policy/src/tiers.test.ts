import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { classify, changePercent, type Mandate, type PriceContext } from "./tiers.js";

/**
 * Tier classification acceptance suite (M3). Runs against the REAL shipped mandate
 * (seed/mandate.json) rather than a hand-built one, so the test fails if the
 * mandate's thresholds drift from what the classifier assumes. The classifier is
 * pure, so no gateway, policy server, or commerce DB is needed here — this is the
 * whole point of keeping the decision logic in a side-effect-free module.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));
// dist/tiers.test.js -> ../../../seed/mandate.json (same walk the server uses).
const SEED_DIR = resolve(__dirname, "..", "..", "..", "seed");
const mandate = JSON.parse(readFileSync(resolve(SEED_DIR, "mandate.json"), "utf8")) as Mandate;

/** In-scope hero tent, comfortably above cost — the baseline for band tests. */
function tent(currentPrice = 199, cost = 118): PriceContext {
  return { sku: "MER-TENT-3S", category: "outdoor-tents", currentPrice, cost };
}

describe("tier classification — against the shipped mandate", () => {
  it("small in-scope change is PERMIT (autonomous band)", () => {
    const ctx = tent();
    const d = classify({ sku: ctx.sku, newPrice: 205, reason: "match competitor" }, ctx, mandate);
    assert.equal(d.tier, "PERMIT");
    assert.equal(d.rule, "PERMIT:WITHIN_AUTONOMOUS_BAND");
    // ~3% is genuinely inside the autonomous band, not merely "not escalated".
    assert.ok(d.changePct <= mandate.tiers.autonomous.maxPriceChangePct);
  });

  it("change past the autonomous band but within notify is NOTIFY", () => {
    const ctx = tent();
    // 199 -> 219 is ~10%: above autonomous (5%), below notify ceiling (15%).
    const d = classify({ sku: ctx.sku, newPrice: 219, reason: "demand up" }, ctx, mandate);
    assert.equal(d.tier, "NOTIFY");
    assert.ok(d.changePct > mandate.tiers.autonomous.maxPriceChangePct);
    assert.ok(d.changePct <= mandate.tiers.notify.maxPriceChangePct);
  });

  it("change beyond the notify threshold is ESCALATE", () => {
    const ctx = tent();
    // 199 -> 239 is ~20%, past the 15% notify ceiling.
    const d = classify({ sku: ctx.sku, newPrice: 239, reason: "spike" }, ctx, mandate);
    assert.equal(d.tier, "ESCALATE");
    assert.equal(d.rule, "ESCALATE:EXCEEDS_NOTIFY_THRESHOLD");
    assert.ok(d.changePct > mandate.tiers.notify.maxPriceChangePct);
  });

  it("below-cost price is DENIED, and DENIED wins over everything else", () => {
    const ctx = tent();
    // 100 < cost 118 AND it is also a >15% move — the below-cost rule must take precedence.
    const d = classify({ sku: ctx.sku, newPrice: 100, reason: "fire sale" }, ctx, mandate);
    assert.equal(d.tier, "DENIED");
    assert.equal(d.rule, "DENIED:BELOW_COST");
  });

  it("out-of-write-scope category escalates (the block deferred from M1)", () => {
    // MER-BOOT-GTX is premium-footwear — outside the agent's write scope. Even a
    // tiny change must not execute autonomously; it goes to a human.
    const ctx: PriceContext = { sku: "MER-BOOT-GTX", category: "premium-footwear", currentPrice: 219, cost: 92 };
    const d = classify({ sku: ctx.sku, newPrice: 217, reason: "reposition" }, ctx, mandate);
    assert.equal(d.tier, "ESCALATE");
    assert.equal(d.rule, "ESCALATE:OUT_OF_SCOPE_CATEGORY");
    assert.ok(!mandate.writeScopeCategories.includes(ctx.category), "premium-footwear must be out of write scope");
  });

  it("a flagged SKU escalates even for an otherwise-autonomous change", () => {
    const flagged = mandate.tiers.approve.flaggedSkus[0];
    assert.ok(flagged, "the mandate must define at least one flagged SKU for this test to mean anything");
    // Flagged SKUs are in-scope categories, so only the flag should push them to ESCALATE.
    const ctx: PriceContext = { sku: flagged, category: "outdoor-tents", currentPrice: 469, cost: 240 };
    const d = classify({ sku: flagged, newPrice: 475, reason: "tiny bump" }, ctx, mandate);
    assert.equal(d.tier, "ESCALATE");
    assert.equal(d.rule, "ESCALATE:FLAGGED_SKU");
    assert.ok(d.changePct <= mandate.tiers.autonomous.maxPriceChangePct, "the change itself is within the autonomous band — only the flag escalates it");
  });

  it("every decision carries the context it evaluated, for the trail", () => {
    const ctx = tent();
    const d = classify({ sku: ctx.sku, newPrice: 205, reason: "x" }, ctx, mandate);
    assert.deepEqual(d.context, ctx);
    assert.ok(d.explanation.length > 0);
  });
});

describe("changePercent", () => {
  it("is symmetric in magnitude and expressed as a percentage", () => {
    assert.equal(changePercent(100, 110), 10);
    assert.equal(changePercent(100, 90), 10);
  });

  it("treats a non-positive current price as an infinite change (guards divide-by-zero)", () => {
    assert.equal(changePercent(0, 10), Infinity);
    assert.equal(changePercent(-5, 10), Infinity);
  });
});
