import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MarketDataStore } from "./store.js";
import { ScenarioDriver, groupIntoBeats } from "./scenario-driver.js";

/**
 * Manual demo mode: the presenter advances the market scenario one BEAT at a
 * time instead of letting it fire on a wall clock. These tests pin the two
 * properties that make that safe to demo:
 *
 *   1. Beats are grouped correctly — a beat's continuation events (the demand
 *      rise that accompanies the competitor undercut, say) travel WITH it, so a
 *      single step lands the whole moment. This is the exact bug the grouping
 *      key guards against: only the first event of a beat is tagged with a
 *      `demoBeat`, so grouping on that tag alone would strand the rest in the
 *      ambient group. We group on `phase` instead.
 *   2. Stepping a beat actually MOVES THE MARKET. The assertions read the store
 *      back and check the values changed — a step that returned a tidy summary
 *      but mutated nothing would pass a shape-only test and fail live.
 *
 * All of this runs against the REAL seed timeline (loaded by the driver's
 * constructor), so if the timeline drifts, these fail rather than certifying a
 * stale fixture.
 */

describe("scenario driver — beat grouping (against the shipped timeline)", () => {
  const beats = new ScenarioDriver(new MarketDataStore()).getBeats();

  it("groups the timeline into the five demo beats in play order", () => {
    // Non-vacuous: the timeline must actually have events to group.
    assert.ok(beats.length > 0, "no beats — the driver loaded an empty timeline");
    assert.deepEqual(
      beats.map((b) => b.beat),
      [0, 2, 3, 4, 5],
      "beats should be steady-state(0) → undercut(2) → spike(3) → glitch(4) → recovery(5)",
    );
    assert.deepEqual(
      beats.map((b) => b.phase),
      ["steady-state", "competitor-undercut", "demand-spike", "flash-crash", "recovery"],
    );
  });

  it("keeps each beat whole — continuation events travel with their beat", () => {
    // The regression this guards: grouping by `demoBeat` alone put these at 1.
    const sizes = Object.fromEntries(beats.map((b) => [b.phase, b.events.length]));
    assert.equal(sizes["steady-state"], 3);
    assert.equal(sizes["competitor-undercut"], 2, "undercut is the price drop AND its demand rise");
    assert.equal(sizes["demand-spike"], 3, "spike is two demand signals AND the inventory draw");
    assert.equal(sizes["flash-crash"], 1);
    assert.equal(sizes["recovery"], 1);
  });

  it("only the beat's lead event carries a demoBeat tag (why we group on phase)", () => {
    // This is the fact the grouping depends on: if every event were tagged we
    // could group on demoBeat. It documents WHY phase is the key.
    const undercut = beats.find((b) => b.phase === "competitor-undercut");
    assert.ok(undercut);
    const tagged = undercut.events.filter((e) => e.demoBeat !== undefined);
    assert.equal(tagged.length, 1, "exactly one event in the beat is demoBeat-tagged");
    assert.equal(tagged[0]!.demoBeat, 2);
  });

  it("groupIntoBeats orders by earliest event, not insertion order", () => {
    // Feed it shuffled input; it must still come back in play order.
    const shuffled = [
      { atSeconds: 210, type: "competitor_prices_bulk_update" as const, phase: "recovery", source: "FeedX", restoreBaseline: true },
      { atSeconds: 5, type: "demand_signal" as const, phase: "steady-state", sku: "X", trend: "stable" as const, magnitude: 0 },
      { atSeconds: 35, type: "competitor_price_change" as const, phase: "competitor-undercut", sku: "Y", competitor: "Z", newPrice: 1, demoBeat: 2 },
    ];
    const grouped = groupIntoBeats(shuffled);
    assert.deepEqual(
      grouped.map((b) => b.phase),
      ["steady-state", "competitor-undercut", "recovery"],
    );
  });
});

describe("scenario driver — manual stepping moves the market", () => {
  it("is in manual mode only when asked; timed is the default", () => {
    assert.equal(new ScenarioDriver(new MarketDataStore()).isManual, false);
    assert.equal(new ScenarioDriver(new MarketDataStore(), { mode: "timed" }).isManual, false);
    assert.equal(new ScenarioDriver(new MarketDataStore(), { mode: "manual" }).isManual, true);
  });

  it("advances exactly one beat per step, in order, then reports done", () => {
    const driver = new ScenarioDriver(new MarketDataStore(), { mode: "manual" });
    const total = driver.getBeats().length;
    assert.ok(total >= 5, "expected the five demo beats");

    const seen: (number | null)[] = [];
    for (let i = 0; i < total; i++) {
      const r = driver.stepBeat();
      seen.push(r.beat);
      assert.equal(r.remaining, total - (i + 1), "remaining must count down by one per step");
      assert.equal(r.done, i === total - 1, "done only on the final beat");
      assert.ok(r.applied.length > 0, "every beat applies at least one event");
    }
    assert.deepEqual(seen, [0, 2, 3, 4, 5]);

    // Idempotent past the end: extra steps are a no-op, not a crash.
    const past = driver.stepBeat();
    assert.deepEqual(past, { beat: null, applied: [], remaining: 0, done: true });
  });

  it("stepping the undercut beat actually changes competitor price AND demand", () => {
    const store = new MarketDataStore();
    const driver = new ScenarioDriver(store, { mode: "manual" });

    // Capture the BEFORE state and assert it differs from the target — otherwise
    // a no-op step would pass this test vacuously.
    const beforeQuotes = store.getCompetitorPrices("MER-TENT-3S");
    assert.ok(beforeQuotes, "MER-TENT-3S must exist in the seed catalog");
    const alpineBefore = beforeQuotes.find((q) => q.name === "AlpineDirect")?.price;
    const demandBefore = store.getDemandSignal("MER-TENT-3S");
    assert.ok(demandBefore, "MER-TENT-3S must have a demand signal");
    assert.notEqual(alpineBefore, 188.6, "seed price must differ from the beat's target, or the test is vacuous");
    assert.equal(demandBefore.trend, "stable", "seed demand is stable before the undercut");

    // Advance past the ambient beat (0), then the undercut beat (2).
    const b0 = driver.stepBeat();
    assert.equal(b0.beat, 0);
    const b2 = driver.stepBeat();
    assert.equal(b2.beat, 2);

    // AFTER: the market moved — competitor price dropped and demand turned elastic.
    const afterQuotes = store.getCompetitorPrices("MER-TENT-3S")!;
    const alpineAfter = afterQuotes.find((q) => q.name === "AlpineDirect")?.price;
    assert.equal(alpineAfter, 188.6, "the undercut beat must set AlpineDirect to the timeline price");
    const demandAfter = store.getDemandSignal("MER-TENT-3S")!;
    assert.equal(demandAfter.trend, "rising", "the undercut beat must flip demand to rising");
    assert.ok(demandAfter.magnitude > 0, "rising demand must carry a positive magnitude");
  });

  it("stepping the glitch beat zeroes the FeedX quotes (the breaker trigger)", () => {
    const store = new MarketDataStore();
    const driver = new ScenarioDriver(store, { mode: "manual" });

    // Find a SKU that carries a FeedX quote and record its non-zero baseline.
    const feedxSku = store
      .listSkus()
      .map((s) => s.sku)
      .find((sku) => store.getCompetitorPrices(sku)?.some((q) => q.name === "FeedX"));
    assert.ok(feedxSku, "the seed must have at least one FeedX-quoted SKU for this beat to matter");
    const before = store.getCompetitorPrices(feedxSku)!.find((q) => q.name === "FeedX")!.price;
    assert.ok(before > 0, "baseline FeedX price must be non-zero, or the glitch is a no-op");

    // Advance to the flash-crash beat (0 → 2 → 3 → 4).
    let step = driver.stepBeat();
    while (step.phase !== "flash-crash" && !step.done) step = driver.stepBeat();
    assert.equal(step.phase, "flash-crash");

    const after = store.getCompetitorPrices(feedxSku)!.find((q) => q.name === "FeedX")!.price;
    assert.equal(after, 0, "the glitch beat must set every FeedX quote to $0.00");
  });
});
