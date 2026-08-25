import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeEnvelope, NegotiationBody, type Envelope, type Terms } from "@meridian/protocol";
import { createSeller, type SellerParams } from "./seller.js";
import type { Trail } from "./trail.js";

/**
 * The SELLER-side counterpart to the buyer's `boundedBid` guard: a supplier must never counter BELOW the
 * price the buyer has already offered to pay. Doing so is the seller negotiating against itself — it
 * concedes money the counterparty had already agreed to hand over.
 *
 * The engine does hold that line today, but only as a side effect of the "close the gap" branch in
 * `process()` (`buyerBid >= base ? max(floor, buyerBid) : base`). Nothing named it and nothing tested it,
 * so a rewrite of that heuristic could drop the protection silently — which is precisely how the buyer
 * side lost it. These tests pin the invariant itself, independent of how the concession is computed.
 */

const nullTrail: Trail = { append() {} };
const BUYER = "did:web:buyer.example";
const SELLER = "did:web:seller.example";

function params(over: Partial<SellerParams> = {}): SellerParams {
  return {
    behaviour: "cooperative",
    capacityUnits: 4000,
    leadTimeDays: 14,
    openingPriceUsd: 98,
    floorPriceUsd: 80,
    concessionRate: 0.06,
    ...over,
  };
}

function counterFromBuyer(negotiationId: string, round: number, unitPriceUsd: number, inReplyTo: string): Envelope {
  const terms: Terms = { sku: "MER-TENT-3S", units: 100, unitPriceUsd, leadTimeDays: 14, deliveryTerms: "DDP" };
  return makeEnvelope({ type: "COUNTER", from: BUYER, to: SELLER, negotiationId, inReplyTo, body: { round, terms } });
}

function priceOf(env: Envelope): number {
  return NegotiationBody.parse(env.body).terms!.unitPriceUsd!;
}

/** Open a negotiation and return the seller plus its QUOTE. */
function open(p: SellerParams = params()) {
  const seller = createSeller(p, { did: SELLER, trail: nullTrail });
  const negotiationId = `neg-${p.openingPriceUsd}-${p.floorPriceUsd}-${p.concessionRate}`;
  const rfq = makeEnvelope({
    type: "RFQ", from: BUYER, to: SELLER, negotiationId,
    body: { round: 0, terms: { sku: "MER-TENT-3S", units: 100, leadTimeDays: 21 } as Partial<Terms> },
  });
  const quote = seller.handle(rfq);
  return { seller, negotiationId, quote };
}

describe("seller never counters below the buyer's standing bid", () => {
  it("holds across a full concession sequence down to the floor", () => {
    const { seller, negotiationId, quote } = open();
    let last = quote;
    // A buyer walking up 84 → 94: every one of these bids is at or above the seller's floor of 80, so
    // the "close the gap" branch is exercised repeatedly.
    for (const [i, bid] of [84, 86, 88, 90, 92, 94].entries()) {
      const inbound = counterFromBuyer(negotiationId, 2 + i * 2, bid, last.correlationId);
      last = seller.handle(inbound);
      assert.ok(
        priceOf(last) >= bid,
        `seller countered $${priceOf(last)}/u against a standing buyer bid of $${bid}/u — below the money already on the table`,
      );
      assert.ok(priceOf(last) >= 80, "and never below its own floor");
    }
  });

  it("counters AT the buyer's bid when the bid already meets its concession target", () => {
    // A bid comfortably above the first concession (98 * 0.94 = 92.12) → the seller should close at 95,
    // not drop to 92.12 and hand back the difference.
    const { seller, negotiationId, quote } = open();
    const reply = seller.handle(counterFromBuyer(negotiationId, 2, 95, quote.correlationId));
    assert.equal(priceOf(reply), 95);
  });

  it("still concedes normally when the buyer's bid is below its target", () => {
    const { seller, negotiationId, quote } = open();
    const reply = seller.handle(counterFromBuyer(negotiationId, 2, 70, quote.correlationId));
    assert.equal(priceOf(reply), 92.12, "conceded one step from 98, not down to the buyer's 70");
    assert.ok(priceOf(reply) > 70, "and stayed above the buyer's bid");
  });

  it("holds even when an LLM reasoner proposes the floor against a high buyer bid", async () => {
    // The seller's LLM path bounds a proposal by the FUNDAMENTALS only — its floor and its standing
    // offer — and then runs the SAME gap-closing branch, so a model that wants to dump to the floor
    // still cannot undercut the buyer's own bid.
    const p = params();
    const seller = createSeller(p, { did: SELLER, trail: nullTrail, reasoner: async () => ({ action: "counter" as const, unitPriceUsd: p.floorPriceUsd }) });
    const negotiationId = "neg-llm";
    const rfq = makeEnvelope({
      type: "RFQ", from: BUYER, to: SELLER, negotiationId,
      body: { round: 0, terms: { sku: "MER-TENT-3S", units: 100, leadTimeDays: 21 } as Partial<Terms> },
    });
    const quote = await seller.handleAsync(rfq);
    const reply = await seller.handleAsync(counterFromBuyer(negotiationId, 2, 93, quote.correlationId));
    assert.equal(priceOf(reply), 93, "closed at the buyer's bid despite the model proposing the floor");
  });

  it("never sells below its floor even if the buyer bids under it", () => {
    const { seller, negotiationId, quote } = open();
    const reply = seller.handle(counterFromBuyer(negotiationId, 2, 40, quote.correlationId));
    assert.ok(priceOf(reply) >= 80, `countered $${priceOf(reply)}/u, under the $80 floor`);
  });
});
