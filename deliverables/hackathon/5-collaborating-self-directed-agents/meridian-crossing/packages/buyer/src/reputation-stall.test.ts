import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog, loadScenario, loadSigner, verifySignedEnvelope } from "@meridian/agent-runtime";
import { makeEnvelope, type Envelope, type Terms } from "@meridian/protocol";
import { Governor } from "./governor.js";
import { loadMandate } from "./mandate.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";

/**
 * What the reputation gate is allowed to conclude from a flat round.
 *
 * The gate exists to stop the buyer spending its round budget on a counterparty acting in bad faith. It
 * is NOT a patience meter. Once the seller gained a `hold` move (see agent-runtime/seller.ts), holding a
 * price became the ordinary way a negotiation reaches its end, and the buyer's own reasoner is told so in
 * as many words. The gate was still charging 0.05 a round for it, so a supplier seeded at 0.9 crossed the
 * 0.2 floor after 14 held rounds and the buyer abandoned deals it was winning — 2 of 3 walks in a 12-run
 * sample. These tests pin the distinction that fixes it: bad faith is never having engaged, not having
 * stopped moving.
 */

const SKU = "MER-TENT-3S";

/** A seller that concedes `concessions` times, then holds its price for ever. */
function scriptedSeller(opening: number, step: number, concessions: number) {
  let price = opening;
  let offers = 0;
  return (inbound: Envelope, did: string): Envelope => {
    const round = ((inbound.body as { round?: number }).round ?? 0) + 1;
    // A settling ACCEPT is answered with a transport ACK, not another offer.
    if (inbound.type === "ACCEPT") {
      return makeEnvelope({
        type: "ACK",
        from: did,
        to: inbound.from,
        negotiationId: inbound.negotiationId,
        inReplyTo: inbound.correlationId,
        body: { round },
      });
    }
    const terms: Terms = { sku: SKU, units: 100, unitPriceUsd: price, leadTimeDays: 14, deliveryTerms: "DDP" };
    const type = offers === 0 ? "QUOTE" : "COUNTER";
    offers += 1;
    if (offers <= concessions) price = Math.round((price - step) * 100) / 100;
    return makeEnvelope({
      type,
      from: did,
      to: inbound.from,
      negotiationId: inbound.negotiationId,
      inReplyTo: inbound.correlationId,
      body: { round, terms },
    });
  };
}

async function run(opening: number, step: number, concessions: number) {
  const scenario = loadScenario();
  const mandate = loadMandate(scenario);
  const buyerDid = scenario.shortfall.buyer;
  const buyerSigner = loadSigner(buyerDid);
  const ad = loadCatalog("summit");
  const sellerSigner = loadSigner(ad.did);
  const reply = scriptedSeller(opening, step, concessions);
  const governor = new Governor(mandate);

  const channel: NegotiationChannel = {
    async send(signed): Promise<ChannelReply> {
      if (!verifySignedEnvelope(signed).ok) throw new Error("rejected");
      const out = sellerSigner.sign(reply(signed, ad.did));
      return { env: out, raw: out, wireProfile: "meridian" };
    },
  };

  const signals: string[] = [];
  const outcome = await runNegotiation({
    buyerDid,
    signer: buyerSigner,
    mandate,
    governor,
    trust: "VERIFIED",
    ad,
    trail: {
      append(r: Record<string, unknown>) {
        if (r["event"] === "reputation") signals.push(String(r["signal"]));
      },
    },
    channel,
  });
  return { outcome, signals, score: governor.reputation.score(ad.did), floor: mandate.reputationWalkawayBelow };
}

describe("the reputation gate and a held price", () => {
  // The regression. Summit's seeded score is 0.9; a supplier that concedes properly and then holds must
  // not be treated as untrustworthy, however long it holds.
  it("does not penalise a supplier that conceded first and then holds", async () => {
    const { signals, score, floor } = await run(98, 2, 4);
    assert.ok(!signals.includes("stall"), `held price scored as a stall: ${signals.join(",")}`);
    assert.ok(score >= floor, `score ${score} fell to/below the walkaway floor ${floor}`);
  });

  // The behaviour that must survive the fix: a counterparty that never moves at all is still bad faith.
  it("still penalises a supplier that never moves from its opening", async () => {
    const { signals, score } = await run(98, 0, 0);
    assert.ok(signals.includes("stall"), "a supplier that never conceded should be scored as stalling");
    assert.ok(score < 0.9, "the stonewaller's score should have been down-weighted");
  });

  it("still treats a price moving AWAY from a deal as a probe", async () => {
    // Negative step: the seller raises its price every round. Opening must sit ABOVE the mandate's
    // committable band, or the buyer accepts the first offer and never observes a second one.
    const { signals } = await run(98, -2, 99);
    assert.ok(signals.includes("probe"), `rising price not scored as a probe: ${signals.join(",")}`);
  });
});
