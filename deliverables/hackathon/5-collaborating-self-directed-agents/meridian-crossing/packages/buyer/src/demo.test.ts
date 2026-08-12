import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  DEFAULT_LLM_MODEL,
  createSeller,
  llmConfigFromEnv,
  loadCatalog,
  loadScenario,
  loadSigner,
  issueApprovalReceipt,
  OPERATOR_DID,
  makeEventHub,
  openHalfTrail,
  openTrail,
  projectHalfTrail,
  verifySignedEnvelope,
  type Seller,
  type SellerParams,
  type SellerReasoner,
  type Signer,
  type SupplierId,
  type Trail,
} from "@meridian/agent-runtime";
import { makeEnvelope, type CapabilityAd, type SignedEnvelope, type Terms } from "@meridian/protocol";
import { loadMandate, privateValues } from "./mandate.js";
import { assertStructureHidesSecrets } from "./leak-lint.js";
import { Governor } from "./governor.js";
import type { ApprovalItem, ApprovalOutcome } from "./approval-queue.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";
import { COOPERATIVE, FIRM } from "./seller-fixtures.js";

/**
 * Demo-experience acceptance suite — the logic the demo experience adds ON TOP of the real negotiation path:
 * the per-org event hub the dashboard streams, the human-in-the-loop approval that drives a REAL
 * settle, the kill switch severing a deal held for approval, the supplier LLM price clamp, and — the
 * strict one — that NOTHING streamed to the dashboard ever carries the private reservation or cap.
 *
 * Everything runs in-process against the real `runNegotiation` + `createSeller`, no network, so it is
 * part of `pnpm test` and gates regressions in CI exactly like the other suites.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const nullTrail: Trail = { append() {} };

// Seller behaviours: ./seller-fixtures.js (deliberately not the seed's numbers — see that file).

interface Party {
  did: string;
  ad: CapabilityAd;
  seller: Seller;
  signer: Signer;
}

function makeParty(id: SupplierId, behaviour: string, params: Partial<SellerParams>, reasoner?: SellerReasoner): Party {
  const ad = loadCatalog(id);
  const sellerParams: SellerParams = {
    behaviour,
    capacityUnits: ad.maxUnits,
    leadTimeDays: ad.minLeadTimeDays,
    openingPriceUsd: 0,
    floorPriceUsd: 0,
    concessionRate: 0,
    ...params,
  };
  return { did: ad.did, ad, seller: createSeller(sellerParams, { did: ad.did, trail: nullTrail, reasoner }), signer: loadSigner(ad.did) };
}

/** An in-process meridian channel — verify the buyer's envelope, run the seller, sign + verify reply. */
function channelFor(party: Party): NegotiationChannel {
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      if (!verifySignedEnvelope(signed).ok) throw new Error("buyer message rejected");
      const signedReply = party.signer.sign(await party.seller.handleAsync(signed));
      if (!verifySignedEnvelope(signedReply).ok) throw new Error("seller reply rejected");
      return { env: signedReply, raw: signedReply as unknown, wireProfile: "meridian" };
    },
  };
}

const firmAlpine = (): Party =>
  makeParty("alpine" as SupplierId, "firm", { openingPriceUsd: FIRM.opening, floorPriceUsd: FIRM.floor, concessionRate: FIRM.concession });
const coopSummit = (): Party =>
  makeParty("summit" as SupplierId, "cooperative", { openingPriceUsd: COOPERATIVE.opening, floorPriceUsd: COOPERATIVE.floor, concessionRate: COOPERATIVE.concession });

/** Approve the way the server does: with a receipt signed by the OPERATOR's key (§14.1). */
function operatorApprove(governor: Governor, item: ApprovalItem): ApprovalOutcome {
  const receipt = issueApprovalReceipt(
    {
      decision: "approve",
      sessionId: item.negotiationId,
      offerHash: item.offerHash,
      amountUsd: item.amountUsd,
      thresholdUsd: item.thresholdUsd,
      now: new Date(),
    },
    loadSigner(OPERATOR_DID),
  );
  governor.approvals.approve(item.id, receipt);
  return { decision: "approved", receipt };
}

describe("demo experience", () => {
  it("approval APPROVES a held Alpine deal → a real signed ACCEPT settle", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const party = firmAlpine();
    const outcome = await runNegotiation({
      channel: channelFor(party),
      signer: buyerSigner,
      buyerDid,
      mandate,
      governor,
      trust: "VERIFIED",
      ad: party.ad,
      trail: nullTrail,
      // Approve the moment it is enqueued: the held deal must then proceed to a real signed ACCEPT.
      onEscalation: async (item) => operatorApprove(governor, item),
    });
    assert.equal(outcome.result, "SETTLED", "an approved escalation must settle");
    assert.ok(outcome.terms && outcome.terms.unitPriceUsd >= FIRM.floor, "settled at/above the supplier floor");
    assert.ok(governor.ledger.committedUsd() > 0, "the approved settle committed spend");
  });

  it("REJECTING a held deal leaves it escalated and uncommitted", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const party = firmAlpine();
    const outcome = await runNegotiation({
      channel: channelFor(party),
      signer: buyerSigner,
      buyerDid,
      mandate,
      governor,
      trust: "VERIFIED",
      ad: party.ad,
      trail: nullTrail,
      onEscalation: async (item) => (governor.approvals.reject(item.id), { decision: "rejected" as const }),
    });
    assert.equal(outcome.result, "ESCALATE", "a rejected escalation stays held");
    assert.equal(governor.ledger.committedUsd(), 0, "nothing is committed on a rejected hold");
  });

  it("kill switch during the approval wait severs the held deal", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const party = firmAlpine();
    const outcome = await runNegotiation({
      channel: channelFor(party),
      signer: buyerSigner,
      buyerDid,
      mandate,
      governor,
      trust: "VERIFIED",
      ad: party.ad,
      trail: nullTrail,
      // Trip the kill switch while the deal is parked for a human: onTrip rejects pending approvals so
      // the waiter resolves, and the negotiation must sever rather than settle.
      onEscalation: (item) => {
        governor.killSwitch.trip("test kill during approval");
        return governor.approvals.awaitDecision(item.id, 2000);
      },
    });
    assert.equal(outcome.result, "WALKED", "a kill mid-approval severs the deal");
    assert.equal(governor.ledger.committedUsd(), 0, "no spend is committed after a kill");
  });

  it("NOTHING streamed to the dashboard carries the reservation price or the cap", async () => {
    const mandate = loadMandate(scenario);
    // Run every streamed record through the SAME tokeniser `safeOutboundRationale` uses on the way out.
    //
    // This used to be a hand-built regex around `String(n)` plus trailing zeros. It grew a long history
    // of near-misses — word boundaries so a correlationId "96bba…" would not false-fire, a guard so the
    // integer 96 would not match the prefix of an unrelated "96.5", `\.0+` because currency is written
    // "96.00" — and every one of those was a real fix. But the shape was wrong underneath: it could only
    // ever recognise the spelling `String()` produces, decorated. `9,168`, `9.168k` and `9.168e3` are
    // exactly what `safeOutboundRationale` exists to catch, and exactly what this could not see. A test
    // asserting "no private number reaches the dashboard" was passing while the guarantee in its own
    // title was breakable.
    //
    // The tokeniser already solves the boundary problems the regex was patched for: it reads NUMBERS out
    // of the text rather than matching characters, so "96bba" speaks no 96 and "96.5" speaks 96.5.
    const secrets = privateValues(mandate);
    const hub = makeEventHub("buyer");
    const dir = mkdtempSync(join(tmpdir(), "meridian-m6-"));
    const trail = openTrail(join(dir, "buyer.jsonl"), hub); // publishes every record to the hub (= SSE)
    const governor = new Governor(mandate);

    // A settle (Summit) AND a held-then-approved escalate (Alpine) — the paths that emit tier/gate text.
    for (const party of [coopSummit(), firmAlpine()]) {
      await runNegotiation({
        channel: channelFor(party),
        signer: buyerSigner,
        buyerDid,
        mandate,
        governor,
        trust: "VERIFIED",
        ad: party.ad,
        trail,
        onEscalation: async (item) => operatorApprove(governor, item),
      });
    }

    assert.ok(hub.history().length > 0, "the hub received the streamed trail");
    for (const { rec } of hub.history()) {
      // The structural walk covers BOTH halves of a trail record: the typed numeric fields (a price
      // leaks as `unitPriceUsd: 96`, a number) and the prose ones (`rationale`, `detail`, `reason`,
      // where a model writes "$9,168.00" and only a tokeniser sees the value). Stringifying the record
      // and tokenising that instead would read the correlationId's digits as spoken numbers — see
      // `numbersIn` for why the walk distinguishes prose from identifiers.
      assertStructureHidesSecrets(rec, secrets, "a streamed record");
    }
  });

  it("EventHub replays history and fans out to live subscribers", () => {
    const hub = makeEventHub("summit");
    hub.publish({ event: "a" });
    const seen: unknown[] = [];
    const off = hub.subscribe((r) => seen.push(r.rec));
    hub.publish({ event: "b" });
    assert.equal(hub.history().length, 2, "history holds both records");
    assert.equal(seen.length, 1, "a subscriber sees only records after it subscribed");
    assert.deepEqual(hub.history(0).map((r) => r.rec), [{ event: "b" }], "sinceSeq replays only newer records");
    off();
    hub.publish({ event: "c" });
    assert.equal(seen.length, 1, "an unsubscribed listener stops receiving");
  });

  it("the supplier LLM price is bounded by FUNDAMENTALS only — its floor and no re-raise", async () => {
    // The model chooses how much to concede; the seller only enforces the two things that are not
    // judgement. It used to be clamped to the deterministic concession as well, which meant arithmetic
    // picked the price and the model merely selected inside a range already decided — every LLM run
    // produced the same number as a result.
    const build = (proposed: number): Seller =>
      makeParty("summit" as SupplierId, "cooperative", { openingPriceUsd: 98, floorPriceUsd: 80, concessionRate: 0.06 }, async () => ({ action: "counter" as const, unitPriceUsd: proposed })).seller;
    const did = loadCatalog("summit" as SupplierId).did;
    const negId = "clamp-test";
    async function firstCounterPrice(seller: Seller): Promise<number> {
      const rfq = makeEnvelope({ type: "RFQ", from: buyerDid, to: did, negotiationId: negId, body: { round: 0, terms: { sku: "MER-TENT-3S", units: 3000, leadTimeDays: 21 } as Partial<Terms> } });
      const quote = seller.handle(rfq); // QUOTE @ opening (98), state now NEGOTIATING
      const counter = makeEnvelope({ type: "COUNTER", from: buyerDid, to: did, negotiationId: negId, inReplyTo: quote.correlationId, body: { round: 2, terms: { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: 40, leadTimeDays: 21 } } });
      const reply = await seller.handleAsync(counter);
      return (reply.body as { terms: Terms }).terms.unitPriceUsd;
    }
    // Standing offer after the QUOTE is the opening price, 98; floor is 80.
    assert.equal(await firstCounterPrice(build(1)), 80, "below the floor is clamped UP to the floor — the hard limit");
    assert.equal(await firstCounterPrice(build(9999)), 98, "above the standing offer is clamped down — a seller cannot re-raise");
    // And in between, the model's number stands: conceding a lot, or barely at all, is its call.
    assert.equal(await firstCounterPrice(build(90)), 90, "a big concession is allowed");
    assert.equal(await firstCounterPrice(build(97.5)), 97.5, "a token concession is allowed — the model may negotiate badly");
  });

  it("projectHalfTrail exposes only safe display fields, scoped by negotiation", () => {
    const dir = mkdtempSync(join(tmpdir(), "meridian-m6ht-"));
    const ht = openHalfTrail(join(dir, "buyer.half-trail.jsonl"), buyerSigner);
    const supplierDidX = loadCatalog("summit" as SupplierId).did;
    const rec = (negId: string, price: number): string => {
      const env = makeEnvelope({ type: "COUNTER", from: buyerDid, to: supplierDidX, negotiationId: negId, body: { round: 2, terms: { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: price, leadTimeDays: 21 } } });
      ht.record({ direction: "SENT", envelope: env, wirePayload: env, wireProfile: "meridian", counterpartyDid: supplierDidX });
      return env.correlationId;
    };
    const a1 = rec("neg-A", 88);
    const a2 = rec("neg-A", 90);
    rec("neg-B", 95);

    const all = projectHalfTrail(ht.entries());
    const scoped = projectHalfTrail(ht.entries(), "neg-A");
    assert.equal(all.length, 3, "unscoped returns every record");
    assert.equal(scoped.length, 2, "scoping filters to one negotiation");
    assert.deepEqual(Object.keys(scoped[0]!).sort(), ["correlationId", "direction", "msgType", "round", "seq", "wireProfile"]);
    const json = JSON.stringify(all);
    for (const forbidden of ["wirePayload", "sig", "recordHash", "termsHash", "signerDid"]) {
      assert.ok(!json.includes(forbidden), `projection must not expose '${forbidden}'`);
    }
    assert.deepEqual(scoped.map((r) => r.correlationId), [a1, a2], "correlationIds — the join key the panel shows — are preserved in order");
  });

  it("llmConfigFromEnv is null without a gateway and defaults the model when one is set", () => {
    const saved = {
      base: process.env.LLM_BASE_URL,
      model: process.env.LLM_MODEL,
      buyerModel: process.env.BUYER_LLM_MODEL,
    };
    try {
      delete process.env.LLM_BASE_URL;
      delete process.env.LLM_MODEL;
      // The per-agent override wins over LLM_MODEL, so it must also be cleared or it would mask the default.
      delete process.env.BUYER_LLM_MODEL;
      assert.equal(llmConfigFromEnv("buyer"), null, "no gateway → deterministic fallback");
      process.env.LLM_BASE_URL = "https://example.test/v1";
      assert.equal(llmConfigFromEnv("buyer")?.model, DEFAULT_LLM_MODEL, "a gateway with no model named uses the default");
    } finally {
      if (saved.base === undefined) delete process.env.LLM_BASE_URL; else process.env.LLM_BASE_URL = saved.base;
      if (saved.model === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = saved.model;
      if (saved.buyerModel === undefined) delete process.env.BUYER_LLM_MODEL; else process.env.BUYER_LLM_MODEL = saved.buyerModel;
    }
  });
});
