import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createSeller, loadCatalog, loadScenario, loadSigner, verifySignedEnvelope } from "@meridian/agent-runtime";
import type { Terms } from "@meridian/protocol";
import { QuoteBoard } from "./quote-board.js";
import { userPrompt } from "./llm.js";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";
import type { DecisionContext } from "./strategy.js";

/**
 * Meridian's shared quote view, and the one control that has to hold around it.
 *
 * A competing quote is the buyer's most useful lever, but WHO is quoting and WHAT they quoted are the
 * rival's confidential terms. The prompt asks the model not to name them; a prompt is guidance, and a
 * model writing free text will sooner or later name them anyway. The last test drives the real
 * `runNegotiation` with a reasoner that deliberately leaks both, and asserts nothing reaches the wire.
 */

const OFFER: Terms = { sku: "SKU-1", units: 100, unitPriceUsd: 92, leadTimeDays: 10, deliveryTerms: "DDP" };

describe("QuoteBoard", () => {
  it("shows a thread its rivals, cheapest first, and never itself", () => {
    const b = new QuoteBoard();
    b.post("did:web:a", "Alpha", { ...OFFER, unitPriceUsd: 99 });
    b.post("did:web:b", "Beta", { ...OFFER, unitPriceUsd: 91 });
    b.post("did:web:c", "Gamma", { ...OFFER, unitPriceUsd: 95 });

    const seen = b.rivalsOf("did:web:c");
    assert.deepEqual(seen.map((q) => q.agentName), ["Beta", "Alpha"]);
    assert.ok(!seen.some((q) => q.supplierDid === "did:web:c"), "a thread must not read its own quote back");
  });

  it("keeps only the latest offer per supplier", () => {
    const b = new QuoteBoard();
    b.post("did:web:a", "Alpha", { ...OFFER, unitPriceUsd: 99 });
    b.post("did:web:a", "Alpha", { ...OFFER, unitPriceUsd: 93 });
    assert.deepEqual(b.rivalsOf("did:web:z").map((q) => q.unitPriceUsd), [93]);
  });

  // A rival registered without a price would sort as `undefined` and silently fall out of the ordering,
  // so the buyer would negotiate against a cheapest-rival number that was never quoted.
  it("ignores a message that carries no price", () => {
    const b = new QuoteBoard();
    b.post("did:web:a", "Alpha", { units: 100 });
    assert.equal(b.rivalsOf("did:web:z").length, 0);
  });

  it("marks a walked thread so siblings stop counting it as an option", () => {
    const b = new QuoteBoard();
    b.post("did:web:a", "Alpha", OFFER);
    b.close("did:web:a", "walked");
    assert.equal(b.rivalsOf("did:web:z")[0]!.status, "walked");
  });
});

describe("the alternatives block the buyer actually reads", () => {
  const mandate = loadMandate(loadScenario());
  const ctx = (over: Partial<DecisionContext>): DecisionContext => ({
    offer: OFFER,
    firstOfferPriceUsd: 98,
    countersSent: 2,
    budgetExhausted: false,
    trust: "VERIFIED",
    ...over,
  });

  it("tells a buyer with no alternatives not to threaten, but not to stop pressing either", () => {
    const p = userPrompt(mandate, ctx({ parallelNegotiations: 1 }));
    assert.match(p, /nowhere to go/);
    assert.match(p, /does NOT mean pay what you are asked/);
  });

  it("names a cheaper rival as leverage", () => {
    const p = userPrompt(
      mandate,
      ctx({ parallelNegotiations: 2, rivalQuotes: [{ supplierDid: "did:web:a", agentName: "Alpha", unitPriceUsd: 88, leadTimeDays: 12, units: 100, status: "negotiating" }] }),
    );
    assert.match(p, /Alpha: \$88\/u/);
    assert.match(p, /BELOW this supplier's price/);
  });

  // The failure this guards is the measured one: with every alternative dearer, the buyer concluded it
  // had no leverage at all and settled at its ceiling. A weak BATNA removes the walk threat, nothing else.
  it("tells a buyer whose alternatives are all dearer to keep pressing without bluffing", () => {
    const p = userPrompt(
      mandate,
      ctx({ parallelNegotiations: 2, rivalQuotes: [{ supplierDid: "did:web:a", agentName: "Alpha", unitPriceUsd: 99, leadTimeDays: 12, units: 100, status: "negotiating" }] }),
    );
    assert.match(p, /do not bluff about leaving/);
    assert.match(p, /not a\s*\n?\s*reason to stop pressing/);
  });

  // A cleared counterparty can still quote a price it never means to honour, and the buyer has no way to
  // tell in the moment. It must therefore not read a cheap quote as permission to abandon a real deal.
  it("frames a cheaper rival as a reason to press, not a reason to leave", () => {
    const p = userPrompt(
      mandate,
      ctx({ parallelNegotiations: 2, rivalQuotes: [{ supplierDid: "did:web:a", agentName: "Lowball", unitPriceUsd: 1, leadTimeDays: 12, units: 100, status: "negotiating" }] }),
    );
    assert.match(p, /a quote is not a commitment/);
    assert.match(p, /NOT by itself a reason to leave/);
    assert.match(p, /would genuinely sign today/);
  });

  it("reports a walked rival as gone rather than as a live alternative", () => {
    const p = userPrompt(
      mandate,
      ctx({ parallelNegotiations: 2, rivalQuotes: [{ supplierDid: "did:web:a", agentName: "Alpha", unitPriceUsd: 88, leadTimeDays: 12, units: 100, status: "walked" }] }),
    );
    assert.match(p, /Alpha: walked away/);
    assert.doesNotMatch(p, /BELOW this supplier's price/, "a walked rival is not leverage");
  });
});

describe("a rival's identity never reaches the wire", () => {
  /**
   * Drive the real negotiation with a reasoner that names the rival every turn, and assert the name never
   * appears on the wire. `safeOutboundRationale` drops the whole string rather than partially redacting it
   * — the right call, since a partial redaction leaks structure — so the leaked rationale is suppressed
   * outright. The `clean` run is the control: without it this test would pass just as happily against a
   * buyer that never sent a rationale at all, which is the failure mode that makes suppression tests lie.
   */
  const run = async (rationale: string): Promise<string[]> => {
    const scenario = loadScenario();
    const mandate = loadMandate(scenario);
    const buyerDid = scenario.shortfall.buyer;
    const buyerSigner = loadSigner(buyerDid);
    const ad = loadCatalog("summit");
    const sellerSigner = loadSigner(ad.did);
    const seller = createSeller(
      { behaviour: "cooperative", capacityUnits: ad.maxUnits, leadTimeDays: ad.minLeadTimeDays, openingPriceUsd: 98, floorPriceUsd: 86, concessionRate: 0.02, orgName: ad.agentName },
      { did: ad.did, trail: { append() {} } },
    );

    // A rival already on Meridian's desk, at a price the buyer would love to wave around.
    const quoteBoard = new QuoteBoard();
    quoteBoard.post("did:web:alpine-supply.example", "Alpine Supply Co", { ...OFFER, unitPriceUsd: 87 });

    const sentRationales: string[] = [];
    const channel: NegotiationChannel = {
      async send(signed): Promise<ChannelReply> {
        if (!verifySignedEnvelope(signed).ok) throw new Error("rejected");
        const r = (signed.body as { rationale?: string }).rationale;
        if (typeof r === "string") sentRationales.push(r);
        const out = sellerSigner.sign(seller.handle(signed));
        return { env: out, raw: out, wireProfile: "meridian" };
      },
    };

    await runNegotiation({
      buyerDid,
      signer: buyerSigner,
      mandate,
      governor: new Governor(mandate),
      trust: "VERIFIED",
      ad,
      trail: { append() {} },
      channel,
      quoteBoard,
      parallelNegotiations: 2,
      reasoner: async (_m, c) =>
        c.countersSent >= 3
          ? { action: "WALKAWAY", reasonCode: "DONE", rationale }
          : {
              action: "COUNTER",
              terms: { ...c.offer, unitPriceUsd: Math.max(86, c.offer.unitPriceUsd - 3) },
              rationale,
            },
    });
    return sentRationales;
  };

  it("still sends an innocuous rationale", async () => {
    const sent = await run("We have a lower quote in hand and need you to meet it.");
    assert.ok(sent.length > 0, "control failed: no rationale reached the wire at all");
  });

  it("suppresses a rationale that names the rival, however the reasoner phrases it", async () => {
    const sent = await run("Alpine Supply Co quoted us $87 per unit, so beat it.");
    for (const r of sent) assert.ok(!r.includes("Alpine Supply Co"), `leaked the rival's identity: ${r}`);
  });

  // Prices are deliberately NOT suppressed — see the comment at the negotiate.ts call site. The buyer's own
  // bid routinely equals a rival's quote as the two converge, so forbidding the figure would drop the
  // buyer's reasoning precisely when it matters and protect nothing the buyer is not about to send anyway.
  it("does not suppress a rationale merely for stating a figure", async () => {
    const sent = await run("We have a competing quote at $87 per unit.");
    assert.ok(sent.some((r) => r.includes("87")), "a bare figure should survive; only attribution is secret");
  });
});
