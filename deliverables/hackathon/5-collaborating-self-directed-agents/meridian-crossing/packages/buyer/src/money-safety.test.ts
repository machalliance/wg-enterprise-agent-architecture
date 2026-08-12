import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadScenario } from "@meridian/agent-runtime";
import type { Terms } from "@meridian/protocol";
import { classify } from "./classify.js";
import { CommitmentLedger } from "./commitments.js";
import { Governor, SettleBindError } from "./governor.js";
import { KillSwitch } from "./kill-switch.js";
import { boundedBid, counterTerms, decide } from "./strategy.js";
import { loadMandate } from "./mandate.js";

/** Money- and units-safety unit tests for the CodeRabbit findings on the ledger, kill switch, mandate. */

const scenario = loadScenario();

describe("CommitmentLedger reservation guards", () => {
  it("rejects non-finite / non-positive amounts and non-integer / negative units", () => {
    const ledger = new CommitmentLedger(1_000, 100);
    assert.equal(ledger.tryReserve("n", "did:a", Number.NaN, 1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", Number.POSITIVE_INFINITY, 1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", Number.NEGATIVE_INFINITY, 1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", 0, 1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", -5, 1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", 10, 1.5).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", 10, -1).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", 10, Number.POSITIVE_INFINITY).ok, false);
    assert.equal(ledger.tryReserve("n", "did:a", 10, Number.NaN).ok, false);
    assert.equal(ledger.committedUsd(), 0, "no bad reservation was recorded");
  });

  it("is idempotent only for an identical re-reservation; a differing one is a conflict", () => {
    const ledger = new CommitmentLedger(1_000, 100);
    assert.equal(ledger.tryReserve("n1", "did:a", 100, 10).ok, true);
    assert.equal(ledger.tryReserve("n1", "did:a", 100, 10).ok, true, "same terms → idempotent no-op");
    // Each identity field is enforced: amount, supplier, and units must ALL match to be idempotent.
    const conflictAmount = ledger.tryReserve("n1", "did:a", 200, 10);
    assert.equal(conflictAmount.ok, false, "different amount on the same negotiation is a conflict");
    assert.match(conflictAmount.reason ?? "", /conflict/i);
    const conflictSupplier = ledger.tryReserve("n1", "did:b", 100, 10);
    assert.equal(conflictSupplier.ok, false, "different supplier on the same negotiation is a conflict");
    const conflictUnits = ledger.tryReserve("n1", "did:a", 100, 20);
    assert.equal(conflictUnits.ok, false, "different units on the same negotiation is a conflict");
    assert.equal(ledger.committedUsd(), 100, "the original hold is unchanged");
  });

  it("enforces a cross-deal UNIT cap independently of the spend cap", () => {
    // Huge dollar cap so only the unit cap can bite. capUnits = 3000 (the shortfall).
    const ledger = new CommitmentLedger(10_000_000, 3000);
    assert.equal(ledger.tryReserve("n1", "did:a", 100, 3000).ok, true, "first full-shortfall deal fits");
    const second = ledger.tryReserve("n2", "did:b", 100, 3000);
    assert.equal(second.ok, false, "a second full-shortfall deal exceeds the unit cap");
    assert.match(second.reason ?? "", /unit cap/i);
    assert.equal(ledger.committedUnits(), 3000, "only the first deal's units are held");
  });
});

describe("KillSwitch listener isolation", () => {
  it("runs every listener even when one throws, then reports the failure", async () => {
    const ks = new KillSwitch();
    let secondRan = false;
    ks.onTrip(() => {
      throw new Error("first listener boom");
    });
    ks.onTrip(() => {
      secondRan = true;
    });
    // trip() is async now (it awaits async listeners), so a listener failure rejects rather than
    // throwing synchronously. The latch still trips synchronously before any await.
    assert.equal(ks.active, false, "not yet tripped");
    const pending = ks.trip("halt");
    assert.equal(ks.active, true, "the switch latches synchronously, before awaiting listeners");
    await assert.rejects(pending, /kill-switch listeners failed/);
    assert.equal(secondRan, true, "a throwing listener must not skip the later revocations");
  });

  it("awaits an async listener before trip() resolves", async () => {
    const ks = new KillSwitch();
    let halted = false;
    ks.onTrip(async () => {
      await Promise.resolve();
      halted = true; // stand-in for an async transfer-halt
    });
    await ks.trip("halt");
    assert.equal(halted, true, "trip() must not resolve until the async side effect has settled");
  });
});

describe("counterTerms unit cap", () => {
  it("caps counter units at maxUnitsPerDeal for an oversized shortfall", () => {
    // Force a shortfall larger than a single deal may carry.
    const mandate = loadMandate(scenario, { unitsNeeded: 10_000, maxUnitsPerDeal: 4000 });
    const offer: Terms = { sku: mandate.sku, units: 10_000, unitPriceUsd: 95, leadTimeDays: 14, deliveryTerms: "DDP" };
    const counter = counterTerms(mandate, offer, mandate.maxBidUsd);
    assert.equal(counter.units, 4000, "a counter never asks for more than one deal may carry");
  });

  it("classifies a split leg against the quantity the buyer ASKED for, not the whole shortfall", () => {
    // The two halves of split procurement had drifted apart. `counterTerms` asked each supplier for the
    // capped 4000; `classify` graded the answer against the full 10,000 `unitsNeeded`. So a supplier
    // answering the ask exactly was graded a partial fill (APPROVE_BEFORE_COMMIT) while one offering the
    // whole shortfall was PROHIBITED by the per-deal cap — leaving no settleable path at all, which is
    // the opposite of what classify.ts's own comment described.
    const mandate = loadMandate(scenario, { unitsNeeded: 10_000, maxUnitsPerDeal: 4000 });
    const leg: Terms = {
      sku: mandate.sku,
      units: 4000, // exactly what counterTerms requested
      unitPriceUsd: mandate.tiers.autonomousSettle.priceAtOrBelow,
      leadTimeDays: mandate.tiers.autonomousSettle.leadTimeAtOrBelow,
      deliveryTerms: mandate.approvedDeliveryTerms[0]!,
    };
    assert.equal(classify(mandate, leg, "VERIFIED"), "AUTONOMOUS_SETTLE", "a matching split leg settles");

    // The guards this must NOT have loosened: both directions of quantity mismatch still need a human,
    // and an over-cap deal is still prohibited outright.
    assert.equal(classify(mandate, { ...leg, units: 3999 }, "VERIFIED"), "APPROVE_BEFORE_COMMIT", "a short leg still holds");
    assert.equal(classify(mandate, { ...leg, units: 4001 }, "VERIFIED"), "PROHIBITED", "an over-cap leg is still prohibited");
  });

  it("still requires the exact shortfall when one deal can carry it", () => {
    // The common case, where requestedUnits === unitsNeeded: a surplus must not settle autonomously.
    // This is the guarantee the quantity check was added for, and the split fix must not have traded it.
    const mandate = loadMandate(scenario); // 100 needed, 4000 per-deal cap
    const base: Terms = {
      sku: mandate.sku,
      units: mandate.unitsNeeded,
      unitPriceUsd: mandate.tiers.autonomousSettle.priceAtOrBelow,
      leadTimeDays: mandate.tiers.autonomousSettle.leadTimeAtOrBelow,
      deliveryTerms: mandate.approvedDeliveryTerms[0]!,
    };
    assert.equal(classify(mandate, base, "VERIFIED"), "AUTONOMOUS_SETTLE");
    assert.equal(classify(mandate, { ...base, units: 200 }, "VERIFIED"), "APPROVE_BEFORE_COMMIT", "a surplus still needs a human");
  });
});

describe("bindSettle refuses to send an ACCEPT for a hold that is gone", () => {
  it("throws rather than silently committing nothing", () => {
    // `CommitmentLedger.commit` was `if (r) r.state = "committed"` — a missing reservation and a
    // promoted one were indistinguishable. The kill switch's `releaseAllPending()` deletes exactly this
    // hold, and the ACCEPT still went out: the buyer bound to a deal its own ledger had forgotten,
    // `committedUsd()` under-reporting, and the freed headroom handed to the next negotiation.
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const terms: Terms = { sku: mandate.sku, units: mandate.unitsNeeded, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" };

    assert.deepEqual(governor.authorizeSettle("neg-1", "did:web:summit", terms), { ok: true });
    const held = governor.ledger.committedUsd();
    assert.ok(held > 0, "the reservation exists before the switch trips");

    governor.ledger.releaseAllPending(); // what the kill switch does on trip
    assert.throws(() => governor.bindSettle("neg-1"), SettleBindError, "a vanished hold must be announced, not ignored");
  });

  it("commits normally when the hold is still there", () => {
    // Non-vacuity: the throw above must be the missing hold, not `bindSettle` being broken outright.
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const terms: Terms = { sku: mandate.sku, units: mandate.unitsNeeded, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" };
    governor.authorizeSettle("neg-2", "did:web:summit", terms);
    assert.doesNotThrow(() => governor.bindSettle("neg-2"));
    // And the hold is now beyond the kill switch's reach, which is the whole point of binding early.
    governor.ledger.releaseAllPending();
    assert.ok(governor.ledger.committedUsd() > 0, "a committed reservation survives releaseAllPending");
  });
});

describe("boundedBid never bids above the price already on the table", () => {
  const mandate = loadMandate(scenario);
  const offerAt = (unitPriceUsd: number): Terms => ({
    sku: mandate.sku, units: mandate.unitsNeeded, unitPriceUsd, leadTimeDays: 14, deliveryTerms: "DDP",
  });

  it("floors a proposal that is worse than the seller's standing offer", () => {
    // The regression this guards: a reasoner (in practice the LLM) proposing $85 when the seller has
    // already conceded to $80 used to pass straight through — the buyer settled ABOVE the standing
    // offer and handed the counterparty the difference.
    assert.equal(boundedBid(mandate, offerAt(80), 85), 80);
  });

  it("still lets the buyer bid BELOW the standing offer — bargaining down is unaffected", () => {
    assert.equal(boundedBid(mandate, offerAt(80), 75), 75);
  });

  it("still enforces the private maxBid ceiling when the offer is high", () => {
    assert.equal(boundedBid(mandate, offerAt(108), 999), mandate.maxBidUsd);
  });

  it("holds through decide(): a counter never exceeds the offer it is responding to", () => {
    // An offer cheap enough to undercut the deterministic ramp but un-committable on LEAD TIME, so the
    // reasoner counters instead of accepting — the exact case where the ramp could cross the seller.
    const offer = offerAt(81);
    offer.leadTimeDays = 45;
    const d = decide(mandate, { offer, countersSent: 5, firstOfferPriceUsd: 108, trust: "VERIFIED", budgetExhausted: false });
    assert.equal(d.action, "COUNTER");
    assert.ok(
      d.action === "COUNTER" && d.terms.unitPriceUsd <= offer.unitPriceUsd,
      `counter $${d.action === "COUNTER" ? d.terms.unitPriceUsd : "?"}/u must not exceed the $${offer.unitPriceUsd}/u on the table`,
    );
  });
});

describe("loadMandate runtime validation", () => {
  it("rejects a price ladder that is not target <= maxBid < reservation", () => {
    assert.throws(() => loadMandate(scenario, { maxBidUsd: 999 }), /price ladder/i);
  });
  it("rejects non-positive numeric fields", () => {
    assert.throws(() => loadMandate(scenario, { reservationUnitPriceUsd: -1 }));
    assert.throws(() => loadMandate(scenario, { maxTotalCommittedUsd: 0 }));
  });
});
