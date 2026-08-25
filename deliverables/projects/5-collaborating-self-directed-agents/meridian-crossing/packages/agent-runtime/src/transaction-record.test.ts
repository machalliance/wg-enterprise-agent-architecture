import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeEnvelope, type Envelope, type Terms } from "@meridian/protocol";
import { loadCatalog, loadScenario, loadSigner } from "./index.js";
import { A2CN_PROFILE, MERIDIAN_PROFILE } from "./wire-profile.js";
import {
  A2CN_RECORD_NAMESPACE,
  buildTransactionRecord,
  uuidV5,
  transactionRecordHash,
  verifyTransactionRecord,
  type RecordMessage,
} from "./transaction-record.js";

/**
 * A2CN §9 — the deterministic transaction record that REPLACED `reconcile()`.
 *
 * The property under test is the one that made the replacement worth doing: two parties, each holding
 * only its own copy of the messages, derive a byte-identical record. Agreement is then one string
 * comparison rather than one org opening the other's log.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const supplierDid = loadCatalog("summit").did;
const supplierSigner = loadSigner(supplierDid);

const NEG = "00000000-0000-4000-8000-000000000001";
const CID_RFQ = "11111111-1111-4111-8111-111111111111";
const CID_QUOTE = "22222222-2222-4222-8222-222222222222";
const CID_ACCEPT = "33333333-3333-4333-8333-333333333333";
const TERMS: Terms = { sku: "MER-TENT-3S", units: 100, unitPriceUsd: 92, leadTimeDays: 14, deliveryTerms: "DDP" };

function env(type: Envelope["type"], from: string, to: string, cid: string, body: unknown, inReplyTo?: string, at = "2026-07-15T12:00:00.000Z"): Envelope {
  return { ...makeEnvelope({ type, from, to, negotiationId: NEG, inReplyTo, body }), correlationId: cid, sentAt: at };
}

/** The three messages of a minimal settled deal, in order. */
function exchange(): Envelope[] {
  return [
    env("RFQ", buyerDid, supplierDid, CID_RFQ, { round: 0, terms: { sku: TERMS.sku, units: TERMS.units } }, undefined, "2026-07-15T12:00:00.000Z"),
    env("QUOTE", supplierDid, buyerDid, CID_QUOTE, { round: 1, terms: TERMS }, CID_RFQ, "2026-07-15T12:00:01.000Z"),
    env("ACCEPT", buyerDid, supplierDid, CID_ACCEPT, { round: 2, terms: TERMS }, CID_QUOTE, "2026-07-15T12:00:02.000Z"),
  ];
}

/** Encode each message the way the given side would have recorded it. */
function asRecorded(messages: Envelope[], profile: "meridian" | "a2cn"): RecordMessage[] {
  const wp = profile === "a2cn" ? A2CN_PROFILE : MERIDIAN_PROFILE;
  return messages.map((e) => {
    const signer = e.from === buyerDid ? buyerSigner : supplierSigner;
    const wirePayload = wp.encode(signer.sign(e), signer);
    return { envelope: wp.decode(wirePayload), wirePayload };
  });
}

describe("A2CN §9 transaction record", () => {
  it("derives even when the RFQ and its QUOTE share a timestamp and the reply's id sorts first", () => {
    // REGRESSION. Ordering used to be `sentAt` (millisecond resolution) with a `correlationId` tie-break.
    // Both sides agreed on that order, which is what it was for — but they agreed on a causally IMPOSSIBLE
    // one: when a reply landed in the same millisecond as the message it answered, the random-UUID
    // comparison put the reply first about half the time, so `scoped[0]` was not the RFQ and the
    // "session must open with an RFQ" guard returned null. The §9 record — the proof both parties derive
    // independently — intermittently failed to exist on a fast machine (a ~1-in-4 flake in
    // accountability.test.ts). Round is the causal order and cannot invert.
    const SAME = "2026-07-15T12:00:00.000Z";
    const CID_QUOTE_LOW = "00000000-0000-4000-8000-0000000000aa";
    // The fixture only tests anything if it actually reproduces the inversion.
    assert.ok(CID_QUOTE_LOW < CID_RFQ, "the QUOTE's id must sort BEFORE the RFQ's for this to be a regression");

    const msgs = [
      env("RFQ", buyerDid, supplierDid, CID_RFQ, { round: 0, terms: { sku: TERMS.sku, units: TERMS.units } }, undefined, SAME),
      env("QUOTE", supplierDid, buyerDid, CID_QUOTE_LOW, { round: 1, terms: TERMS }, CID_RFQ, SAME),
      env("ACCEPT", buyerDid, supplierDid, CID_ACCEPT, { round: 2, terms: TERMS }, CID_QUOTE_LOW, SAME),
    ];
    const ours = buildTransactionRecord(asRecorded(msgs, "meridian"), NEG);
    assert.ok(ours, "the record still derives when every message shares a timestamp");
    // Roles come from message ORDER, so an inverted sort would also have mislabelled the parties.
    assert.equal(ours.parties.initiator.did, buyerDid, "the RFQ sender is the initiator");
    assert.equal(ours.parties.responder.did, supplierDid, "the other party is the responder");
    assert.equal(ours.agreed_terms.unitPriceUsd, TERMS.unitPriceUsd);
  });

  it("both parties derive an identical record from their own copies", () => {
    const msgs = exchange();
    // Two independent derivations. In production these run in different processes on different hosts;
    // the inputs are the same messages because each crossed the boundary between them.
    const buyer = buildTransactionRecord(asRecorded(msgs, "meridian"), NEG);
    const supplier = buildTransactionRecord(asRecorded(msgs, "meridian"), NEG);

    assert.ok(buyer && supplier);
    assert.equal(buyer!.record_hash, supplier!.record_hash);
    assert.deepEqual(buyer, supplier, "the whole record, not just the hash");
  });

  it("two A2CN parties derive the same record", () => {
    const msgs = exchange();
    const a = buildTransactionRecord(asRecorded(msgs, "a2cn"), NEG);
    const b = buildTransactionRecord(asRecorded(msgs, "a2cn"), NEG);
    assert.ok(a && b);
    assert.equal(a!.record_hash, b!.record_hash, "the conformant path: both sides on A2CN");
  });

  it("does NOT claim agreement across different wire profiles", () => {
    // §9's offer chain is built from real `protocol_act_hash` values, which exist only on an A2CN wire.
    // Two sides recording the same deal under different profiles therefore derive different records —
    // by design. A2CN assumes both parties speak A2CN; `selectWireProfile` agrees that up front.
    const msgs = exchange();
    const meridianSide = buildTransactionRecord(asRecorded(msgs, "meridian"), NEG)!;
    const a2cnSide = buildTransactionRecord(asRecorded(msgs, "a2cn"), NEG)!;
    assert.notEqual(meridianSide.record_hash, a2cnSide.record_hash);
    assert.deepEqual(meridianSide.agreed_terms, a2cnSide.agreed_terms, "same deal, different basis");
  });

  it("record_id is a UUID v5 over session_id in A2CN's namespace (§9.4)", () => {
    const record = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    assert.equal(record.record_id, uuidV5(NEG, A2CN_RECORD_NAMESPACE));
    assert.match(record.record_id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
      "version 5 and RFC 4122 variant bits must be set");
    // Known-answer check against RFC 4122's published DNS-namespace vector, so a bug in the bit
    // stamping cannot hide behind our own namespace.
    assert.equal(uuidV5("www.example.org", "6ba7b810-9dad-11d1-80b4-00c04fd430c8"), "74738ff5-5367-5958-9aee-98fffdcd1876");
  });

  it("record_hash covers the preserved signatures (§9 blanks only record_hash)", () => {
    const record = buildTransactionRecord(asRecorded(exchange(), "a2cn"), NEG)!;
    assert.ok(record.final_offer.protocol_act_signature.length > 0, "the offer signature is preserved");
    const swapped = { ...record, final_offer: { ...record.final_offer, protocol_act_signature: "tampered" } };
    assert.equal(verifyTransactionRecord(swapped), false, "editing a signature must break the hash");
  });

  it("captures the agreed terms and the parties, and self-verifies", () => {
    const record = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    assert.equal(record.record_type, "a2cn_transaction_record");
    assert.deepEqual(record.agreed_terms, TERMS);
    assert.equal(record.parties.initiator.did, buyerDid, "the RFQ sender initiated");
    assert.equal(record.parties.responder.did, supplierDid, "the offer's author responded");
    assert.equal(record.negotiation_summary.total_messages, 3);
    assert.equal(record.negotiation_summary.accepting_party_did, buyerDid);
    assert.equal(record.final_offer.message_id, CID_QUOTE, "the offer the ACCEPT closes");
    assert.equal(record.final_acceptance.message_id, CID_ACCEPT);
    assert.ok(verifyTransactionRecord(record), "record_hash re-derives from the content");
  });

  it("any edit to the record breaks its content address", () => {
    const record = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    const edits = [
      { ...record, agreed_terms: { ...record.agreed_terms, unitPriceUsd: 1 } },
      { ...record, session_id: "99999999-9999-4999-8999-999999999999" },
      { ...record, parties: { ...record.parties, responder: { ...record.parties.responder, did: "did:web:impostor.example" } } },
      { ...record, offer_chain_hash: "tampered" },
    ];
    for (const e of edits) assert.equal(verifyTransactionRecord(e), false, "a forged record must fail its own hash");
  });

  it("a different deal derives a different record", () => {
    const cheaper = exchange().map((e) =>
      e.type === "RFQ" ? e : { ...e, body: { ...(e.body as object), terms: { ...TERMS, unitPriceUsd: 50 } } },
    );
    const a = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    const b = buildTransactionRecord(asRecorded(cheaper, "meridian"), NEG)!;
    assert.notEqual(a.record_hash, b.record_hash, "settling different terms cannot produce the same proof");
  });

  it("produces no record for a negotiation that never settled", () => {
    const noAccept = exchange().filter((e) => e.type !== "ACCEPT");
    assert.equal(buildTransactionRecord(asRecorded(noAccept, "meridian"), NEG), null);
    assert.equal(buildTransactionRecord([], NEG), null, "no messages at all");
  });

  it("refuses to record an ACCEPT whose offer this party does not hold", () => {
    // Without the offer there is nothing to bind the acceptance to, so no record can form — the §9
    // analogue of refusing to settle an offer you cannot produce.
    const orphaned = exchange().filter((e) => e.type !== "QUOTE");
    assert.equal(buildTransactionRecord(asRecorded(orphaned, "meridian"), NEG), null);
  });

  it("orders the offer chain deterministically when timestamps collide", () => {
    // Same-millisecond messages must not let the two parties sort differently and derive two chains.
    const sameMs = exchange().map((e) => ({ ...e, sentAt: "2026-07-15T12:00:00.000Z" }));
    const one = buildTransactionRecord(asRecorded(sameMs, "meridian"), NEG);
    const other = buildTransactionRecord(asRecorded([...sameMs].reverse(), "meridian"), NEG);
    assert.ok(one && other);
    assert.equal(one!.record_hash, other!.record_hash, "input order must not change the record");
  });

  it("scopes to one negotiation, ignoring other deals in the same trail", () => {
    const otherNeg = exchange().map((e) => ({ ...e, negotiationId: "44444444-4444-4444-8444-444444444444" }));
    const mixed = [...asRecorded(exchange(), "meridian"), ...asRecorded(otherNeg, "meridian")];
    const scoped = buildTransactionRecord(mixed, NEG)!;
    const alone = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    assert.equal(scoped.record_hash, alone.record_hash, "an unrelated deal in the same log must not bleed in");
    assert.equal(scoped.negotiation_summary.total_messages, 3);
  });

  it("recomputes the same hash from an unchanged record", () => {
    const record = buildTransactionRecord(asRecorded(exchange(), "meridian"), NEG)!;
    assert.equal(transactionRecordHash(record), record.record_hash);
  });

  it("first_offer_at is the FIRST priced message, not the accepted one", () => {
    // The single-round `exchange()` hides this: there, the first offer and the accepted offer are the
    // same QUOTE. Reading `first_offer_at` off the accepted offer therefore looked right until a
    // negotiation ran more than one round, at which point it reported the LAST counter's timestamp and
    // collapsed the whole bargaining window to zero for anyone measuring time-to-first-offer.
    const CID_C1 = "55555555-5555-4555-8555-555555555555";
    const CID_C2 = "66666666-6666-4666-8666-666666666666";
    const multi = [
      env("RFQ", buyerDid, supplierDid, CID_RFQ, { round: 0, terms: { sku: TERMS.sku, units: TERMS.units } }, undefined, "2026-07-15T12:00:00.000Z"),
      env("QUOTE", supplierDid, buyerDid, CID_QUOTE, { round: 1, terms: { ...TERMS, unitPriceUsd: 99 } }, CID_RFQ, "2026-07-15T12:00:01.000Z"),
      env("COUNTER", buyerDid, supplierDid, CID_C1, { round: 2, terms: { ...TERMS, unitPriceUsd: 85 } }, CID_QUOTE, "2026-07-15T12:00:02.000Z"),
      env("COUNTER", supplierDid, buyerDid, CID_C2, { round: 3, terms: TERMS }, CID_C1, "2026-07-15T12:00:03.000Z"),
      env("ACCEPT", buyerDid, supplierDid, CID_ACCEPT, { round: 4, terms: TERMS }, CID_C2, "2026-07-15T12:00:04.000Z"),
    ];
    const record = buildTransactionRecord(asRecorded(multi, "meridian"), NEG)!;
    const summary = record.negotiation_summary;
    assert.equal(summary.first_offer_at, "2026-07-15T12:00:01.000Z", "the opening QUOTE, not the accepted counter");
    assert.equal(summary.accepted_at, "2026-07-15T12:00:04.000Z");
    // The accepted offer is the round-3 COUNTER at :03 — the value this field used to report.
    assert.notEqual(summary.first_offer_at, "2026-07-15T12:00:03.000Z", "not the accepted offer's timestamp");
    assert.ok(summary.first_offer_at < summary.accepted_at, "there is a measurable bargaining window");
  });

  it("names two DIFFERENT parties when the SUPPLIER accepts the buyer's counter", () => {
    // The responder used to be read off the accepted offer's sender. When the supplier accepts a
    // buyer-sent COUNTER, that sender IS the buyer — so both roles resolved to the buyer's DID and the
    // record described a deal between one organisation and itself.
    const CID_C1 = "77777777-7777-4777-8777-777777777777";
    const supplierAccepts = [
      env("RFQ", buyerDid, supplierDid, CID_RFQ, { round: 0, terms: { sku: TERMS.sku, units: TERMS.units } }, undefined, "2026-07-15T12:00:00.000Z"),
      env("QUOTE", supplierDid, buyerDid, CID_QUOTE, { round: 1, terms: { ...TERMS, unitPriceUsd: 99 } }, CID_RFQ, "2026-07-15T12:00:01.000Z"),
      env("COUNTER", buyerDid, supplierDid, CID_C1, { round: 2, terms: TERMS }, CID_QUOTE, "2026-07-15T12:00:02.000Z"),
      env("ACCEPT", supplierDid, buyerDid, CID_ACCEPT, { round: 3, terms: TERMS }, CID_C1, "2026-07-15T12:00:03.000Z"),
    ];
    const record = buildTransactionRecord(asRecorded(supplierAccepts, "meridian"), NEG)!;
    assert.equal(record.parties.initiator.agent_id, buyerDid, "the RFQ sender initiated");
    assert.equal(record.parties.responder.agent_id, supplierDid, "the other party responded");
    assert.notEqual(record.parties.initiator.agent_id, record.parties.responder.agent_id);
  });

  it("produces no record when the scoped messages do not open with an RFQ", () => {
    // A partial trail or a replayed fragment would otherwise name whoever spoke first as the buyer.
    const truncated = asRecorded(exchange(), "meridian").slice(1);
    assert.equal(buildTransactionRecord(truncated, NEG), null);
  });
});
