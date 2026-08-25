import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  A2CN_PROFILE,
  MERIDIAN_PROFILE,
  createSeller,
  detectWireProfile,
  isNegotiationVerb,
  loadCatalog,
  loadScenario,
  loadSigner,
  looksLikeA2cn,
  openHalfTrail,
  readHalfTrail,
  transactionRecordFromTrail,
  verifyTransactionRecord,
  verifyChain,
  type HalfTrail,
  type Seller,
  type SellerParams,
  type Signer,
  type SupplierId,
} from "@meridian/agent-runtime";
import type { SignedEnvelope, TrailRecord } from "@meridian/protocol";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";
import { COOPERATIVE } from "./seller-fixtures.js";

/**
 * Accountability acceptance suite — accountability when no one sees the whole picture. Every criterion runs over
 * the REAL negotiation code path (`runNegotiation`) wired to the real seller engine through an
 * in-process channel, so the buyer and supplier each keep their OWN signed half-trail with no shared
 * store between them — exactly the archetype's constraint. Agreement is then proven the A2CN §9 way:
 * each org derives a transaction record from ITS OWN messages and the two hashes are compared. No org
 * reads another's log, here or anywhere else in the system.
 *
 * A2CN wire profile interaction under test: the two records agree only when both sides recorded the deal
 * under the SAME profile. A mixed `meridian`/`a2cn` pair derives DIFFERENT, non-comparable record hashes,
 * because `offer_chain_hash` is built from the A2CN `protocol_act_hash`, which exists only on an A2CN
 * wire. The agreed terms are identical either way; it is the hashes that cannot be compared across
 * profiles — which is why `selectWireProfile` negotiates a single profile up front.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);

// Seller behaviours: ./seller-fixtures.js (deliberately not the seed's numbers — see that file).

interface Party {
  did: string;
  ad: ReturnType<typeof loadCatalog>;
  seller: Seller;
  signer: Signer;
}

function summitParty(): Party {
  const ad = loadCatalog("summit" as SupplierId);
  const params: SellerParams = {
    behaviour: "cooperative",
    capacityUnits: ad.maxUnits,
    leadTimeDays: ad.minLeadTimeDays,
    openingPriceUsd: COOPERATIVE.opening,
    floorPriceUsd: COOPERATIVE.floor,
    concessionRate: COOPERATIVE.concession,
  };
  // The seller's own free-form trail is irrelevant here; the half-trail is what accountability audits.
  return { did: ad.did, ad, seller: createSeller(params, { did: ad.did, trail: { append() {} } }), signer: loadSigner(ad.did) };
}

function tmpTrail(name: string, signer: Signer): { trail: HalfTrail; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "meridian-m5-"));
  const file = join(dir, `${name}.half-trail.jsonl`);
  return { trail: openHalfTrail(file, signer), file };
}

/**
 * An in-process channel that ALSO records the supplier's half-trail (its RECEIVED of the buyer's
 * message and its SENT reply), pushing each side's exchange through the chosen wire profile so the
 * recorded `wirePayload` is the real signed bytes. `profile` selects meridian vs a2cn for the
 * supplier's half — the buyer records its own half under meridian (the default) either way, which is
 * exactly the mixed-profile case the cross-profile test exercises.
 */
function recordingChannel(party: Party, supplier: HalfTrail, profile: "meridian" | "a2cn"): NegotiationChannel {
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      // Only NEGOTIATION verbs go on a half-trail, exactly as startAgent does. The ACK that answers a
      // settling ACCEPT is transport plumbing, not a turn: recording it would leave a one-sided entry
      // (the buyer never records an ACK), which would corrupt the derived record's message count.
      const wp = profile === "a2cn" ? A2CN_PROFILE : MERIDIAN_PROFILE;
      const wireIn = wp.encode(signed, buyerSigner);
      if (!wp.verify(wireIn).ok) throw new Error("buyer message rejected");
      const inbound = wp.decode(wireIn);
      const inProfile = looksLikeA2cn(wireIn) ? "a2cn" : "meridian";
      if (isNegotiationVerb(inbound.type)) {
        supplier.record({ direction: "RECEIVED", envelope: inbound, wirePayload: wireIn, wireProfile: inProfile, counterpartyDid: inbound.from });
      }
      const reply = party.seller.handle(inbound);
      const wireOut = wp.encode(party.signer.sign(reply), party.signer);
      if (!wp.verify(wireOut).ok) throw new Error("seller reply rejected");
      const env = wp.decode(wireOut);
      const outProfile = looksLikeA2cn(wireOut) ? "a2cn" : "meridian";
      if (isNegotiationVerb(env.type)) {
        supplier.record({ direction: "SENT", envelope: env, wirePayload: wireOut, wireProfile: outProfile, counterpartyDid: env.to });
      }
      return { env, raw: wireOut, wireProfile: outProfile };
    },
  };
}

/** Run one Summit negotiation to a settle, returning both freshly-written half-trails. */
async function settleAndCollect(profile: "meridian" | "a2cn"): Promise<{
  buyer: TrailRecord[];
  supplier: TrailRecord[];
  supplierDid: string;
  negotiationId: string;
}> {
  const mandate = loadMandate(scenario);
  const governor = new Governor(mandate);
  const party = summitParty();
  const buyerHt = tmpTrail("buyer", buyerSigner);
  const supplierHt = tmpTrail("summit", party.signer);

  const outcome = await runNegotiation({
    buyerDid,
    signer: buyerSigner,
    mandate,
    governor,
    trust: "VERIFIED",
    ad: party.ad,
    trail: { append() {} },
    halfTrail: buyerHt.trail,
    channel: recordingChannel(party, supplierHt.trail, profile),
  });

  assert.equal(outcome.result, "SETTLED", "Summit should settle");
  // Read the half-trails back from disk — proving they are durable, independent stores, not in-memory.
  return {
    buyer: readHalfTrail(buyerHt.file),
    supplier: readHalfTrail(supplierHt.file),
    supplierDid: party.did,
    negotiationId: outcome.negotiationId,
  };
}

describe("accountability", () => {
  it("buyer and supplier each hold their own signed, hash-chained half-trail; neither wrote the other's", async () => {
    const { buyer, supplier, supplierDid } = await settleAndCollect("meridian");

    assert.ok(buyer.length > 0 && supplier.length > 0, "both halves have records");
    assert.ok(verifyChain(buyer).ok, "buyer chain intact");
    assert.ok(verifyChain(supplier).ok, "supplier chain intact");
    // No cross-writing: every record in a half is signed by that org and by no other.
    assert.ok(buyer.every((r) => r.signerDid === buyerDid), "buyer signed every buyer record");
    assert.ok(supplier.every((r) => r.signerDid === supplierDid), "supplier signed every supplier record");
  });

  it("both sides independently derive the SAME transaction record (A2CN §9)", async () => {
    const { buyer, supplier, negotiationId } = await settleAndCollect("meridian");
    // Each record is built from ONE org's own messages. The test holds both halves only because a test
    // is an omniscient observer; neither agent ever reads the other's store — that is precisely what
    // §9 removes, and why reconcile() is gone.
    const ours = transactionRecordFromTrail(buyer, negotiationId);
    const theirs = transactionRecordFromTrail(supplier, negotiationId);

    assert.ok(ours && theirs, "both parties derived a record");
    assert.equal(ours!.record_hash, theirs!.record_hash, "independently derived records must be identical");
    assert.ok(verifyTransactionRecord(ours!), "the record's own hash re-derives");
    assert.ok(ours!.agreed_terms.unitPriceUsd > 0 && ours!.agreed_terms.units > 0, "settled terms recovered");
    assert.equal(ours!.negotiation_summary.total_messages, theirs!.negotiation_summary.total_messages);
  });

  it("a MIXED-profile deal does not produce one shared record — and that is correct", async () => {
    const { buyer, supplier, negotiationId } = await settleAndCollect("a2cn");
    assert.ok(supplier.some((r) => r.wireProfile === "a2cn"), "supplier half is a2cn");
    assert.ok(buyer.some((r) => r.wireProfile === "meridian"), "buyer half is meridian");

    // §9 builds `offer_chain_hash` from each message's real `protocol_act_hash`, which exists only on
    // an A2CN wire. Two sides that recorded the same deal under DIFFERENT profiles therefore derive
    // different records. An earlier version papered over this by hashing profile-independent
    // substitutes — which made mixed pairs match, at the cost of producing a record no conforming A2CN
    // implementation would agree with. Conformance won: A2CN assumes both parties speak A2CN, and
    // `selectWireProfile` negotiates that up front.
    const ours = transactionRecordFromTrail(buyer, negotiationId);
    const theirs = transactionRecordFromTrail(supplier, negotiationId);
    assert.ok(ours && theirs, "each side still derives its own record");
    assert.notEqual(ours!.record_hash, theirs!.record_hash, "mixed profiles are not comparable by design");
    // They still describe the same deal — only the act-hash basis differs.
    assert.deepEqual(ours!.agreed_terms, theirs!.agreed_terms, "the agreed terms are identical either way");
  });

  it("tampering is caught, and the derived record is immune to trail-metadata edits", async () => {
    const { buyer, supplier, negotiationId } = await settleAndCollect("meridian");
    const honest = transactionRecordFromTrail(buyer, negotiationId);
    // Asserted, not assumed. Without this the comparison below is `undefined === undefined` whenever
    // derivation fails, so the tamper check passes VACUOUSLY and the only symptom is a TypeError further
    // down — which is exactly how an intermittent derivation bug hid here.
    assert.ok(honest, "the honest record derived, so the comparison below means something");

    // Mutate a settled record's claimed terms — a delivery-dispute style falsification.
    const idx = supplier.findIndex((r) => r.termsHash !== "");
    assert.ok(idx >= 0, "found a record carrying terms to tamper");
    const tampered = supplier.map((r, i) => (i === idx ? { ...r, termsHash: "deadbeefdeadbeef" } : r));
    assert.equal(verifyChain(tampered).ok, false, "the hash chain detects the mutation");
    assert.equal(verifyChain(supplier).ok, true, "the untampered original still verifies");

    // The DERIVED record does not move, and that is the point: it is built from the counterparty's
    // SIGNED payloads, not from the mutable bookkeeping around them. An org cannot change what it
    // agreed to by editing its own log — it can only produce a log that fails its own chain check.
    const afterTamper = transactionRecordFromTrail(tampered, negotiationId);
    assert.equal(afterTamper?.record_hash, honest?.record_hash, "metadata edits cannot rewrite the deal");

    // Editing the RECORD itself is caught by its own content address.
    const forged = { ...honest!, agreed_terms: { ...honest!.agreed_terms, unitPriceUsd: 1 } };
    assert.equal(verifyTransactionRecord(forged), false, "a forged record fails its own hash");
  });

  it("the buyer alone can prove the settled deal, from Summit's signed offer (standalone non-repudiation)", async () => {
    // With the commit collapsed to a single ACCEPT there is no supplier CONFIRM to point at. The
    // property is unchanged, though: the buyer's own half holds Summit's SIGNED offer AND the buyer's
    // signed ACCEPT naming it, so both halves of the agreement are provable from one trail alone.
    const { buyer, supplierDid } = await settleAndCollect("meridian");

    const accept = buyer.find((r) => r.direction === "SENT" && r.msgType === "ACCEPT");
    assert.ok(accept, "buyer holds its own ACCEPT as a SENT record");
    const acceptEnv = detectWireProfile(accept!.wirePayload).decode(accept!.wirePayload);

    // The offer that ACCEPT closes — authored and signed by Summit, held on the BUYER's trail.
    const offer = buyer.find((r) => r.direction === "RECEIVED" && r.correlationId === acceptEnv.inReplyTo);
    assert.ok(offer, "buyer holds Summit's signed offer, the one its ACCEPT names");

    const prof = detectWireProfile(offer!.wirePayload);
    assert.equal(prof.verify(offer!.wirePayload).ok, true, "Summit's offer signature verifies");
    assert.equal(prof.decode(offer!.wirePayload).from, supplierDid, "authored by Summit's DID");
    // Same terms on both sides of the agreement — what makes this a settlement and not two messages.
    assert.equal(offer!.termsHash, accept!.termsHash, "the ACCEPT settles exactly what Summit offered");
  });

  it("the buyer's half contains protocol-level evidence only — no supplier-internal reasoning", async () => {
    const { buyer } = await settleAndCollect("meridian");
    const dump = JSON.stringify(buyer);
    for (const secret of ["floorPriceUsd", "openingPriceUsd", "concessionRate", "reservation"]) {
      assert.equal(dump.includes(secret), false, `buyer half must not leak '${secret}'`);
    }
  });
});
