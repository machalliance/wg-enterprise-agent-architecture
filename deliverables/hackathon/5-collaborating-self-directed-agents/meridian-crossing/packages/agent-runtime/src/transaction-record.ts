import { createHash } from "node:crypto";
import {
  Terms,
  canonicalize,
  signaturePayload,
  type SignedEnvelope,
  type TrailRecord,
} from "@meridian/protocol";
import { detectWireProfile } from "./wire-profile.js";
import { looksLikeA2cn, parseA2cnWire } from "./a2cn.js";


/**
 * A2CN §9: the deterministic, content-addressed TRANSACTION RECORD.
 *
 * This replaces `reconcile()`, and the reason is architectural rather than cosmetic. Reconcile proved
 * two half-trails agreed — but only by reading BOTH of them, which meant the buyer opening the
 * supplier's private log off a shared filesystem. That works in a one-machine demo and is impossible
 * anywhere else; worse, it contradicts the whole premise that each organization keeps records no one
 * else can see.
 *
 * §9 inverts it. Each party derives the SAME record from the messages it already holds, hashes it, and
 * the two compare one string. Quoting the spec:
 *
 *   "Both parties generate the transaction record independently upon seeing a valid Acceptance. For
 *    both records to be identical, all fields MUST be deterministically derivable from the protocol
 *    messages alone."
 *
 * So `record_hash` equality IS the agreement proof, and it travels as 43 characters instead of a log.
 *
 * DETERMINISM NOTES — where the spec's schema is not literally derivable from messages, and what we
 * pin it to so both sides still agree:
 *   - `generated_at` would be wall-clock, which differs per party. Pinned to the ACCEPTANCE's own
 *     `timestamp`: it is the moment the record describes, and it is on the wire.
 *   - `record_id` IS specified: UUID v5 over `session_id` under A2CN's namespace (§9.4 / Appendix A).
 *   - `parties.*.organization_name` / `agent_id` come from each side's own `body.party` declaration on
 *     its first message — Meridian's stand-in for SessionInit/SessionAck, which it does not have.
 *     `mandate_type` is a constant: every party here proves commit-authority with a VC.
 *   - `offer_chain_hash` uses each message's real `protocol_act_hash` under `a2cn`; `meridian` is not
 *     an A2CN wire at all, so it falls back to the canonical envelope hash. See `actHashOf`.
 *
 * SCOPE OF THE AGREEMENT PROOF, because it is narrower than the rest of the codec's: `agreed_terms` below
 * is Meridian's own `Terms` — dollars, camelCase — not A2CN's cents/snake_case terms object, and
 * `record_type`/`record_version` are constants of ours. That is deliberate (it is what lets a `meridian`
 * half and an `a2cn` half of one deal hash identically), and the cost is that `record_hash` proves
 * agreement between two implementations of THIS codec, not with a conforming third party. Documented under
 * "Known limits" in docs/a2cn-alignment.md; do not read the per-field conformance notes above as covering
 * the record as a whole.
 */

export const RECORD_TYPE = "a2cn_transaction_record" as const;
export const RECORD_VERSION = "0.1" as const;

export interface TransactionParty {
  organization_name: string;
  did: string;
  agent_id: string;
  verification_method: string;
  mandate_type: string;
}

export interface TransactionRecord {
  record_type: typeof RECORD_TYPE;
  record_version: typeof RECORD_VERSION;
  record_id: string;
  session_id: string;
  generated_at: string;
  parties: { initiator: TransactionParty; responder: TransactionParty };
  deal_type: string;
  currency: string;
  subject: string;
  subject_reference: string;
  agreed_terms: Terms;
  negotiation_summary: {
    total_rounds: number;
    total_messages: number;
    session_created_at: string;
    first_offer_at: string;
    accepted_at: string;
    initiating_party_did: string;
    accepting_party_did: string;
  };
  final_offer: {
    message_id: string;
    sender_did: string;
    protocol_act_hash: string;
    protocol_act_signature: string;
  };
  final_acceptance: {
    message_id: string;
    sender_did: string;
    accepted_protocol_act_hash: string;
    acceptance_signature: string;
  };
  offer_chain_hash: string;
  record_hash: string;
}

const sha256 = (s: string): string => createHash("sha256").update(s, "utf8").digest("base64url");

/**
 * A2CN's own namespace UUID for record ids (§9.4 / Appendix A). The spec calls out that earlier drafts
 * used an invalid namespace string and that implementations MUST use this one.
 */
export const A2CN_RECORD_NAMESPACE = "f4a2c1e0-8b3d-4f7a-9c2e-1d5b6a8f3e7c" as const;

/**
 * RFC 4122 UUID v5 (SHA-1, name-based). §9.4: "record_id — UUID v5 computed from the session_id, using
 * the A2CN-specific namespace UUID". Hand-rolled because Node ships no v5 generator and the algorithm
 * is small: SHA-1(namespace_bytes ‖ name), then stamp version 5 and the RFC 4122 variant.
 */
export function uuidV5(name: string, namespace: string): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(Buffer.concat([ns, Buffer.from(name, "utf8")])).digest();
  h[6] = (h[6]! & 0x0f) | 0x50; // version 5
  h[8] = (h[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * The per-message act hash the offer chain is built from.
 *
 * Under `a2cn` this is the message's OWN `protocol_act_hash`, exactly as §9 specifies — so a record we
 * derive is the same one a conforming A2CN implementation derives. Under `meridian` there is no such
 * field (it is not an A2CN message), so we fall back to the canonical hash of the signed envelope.
 *
 * CONSEQUENCE, stated plainly: a deal recorded as `meridian` on one side and `a2cn` on the other no
 * longer yields one shared record. That is correct rather than unfortunate — A2CN assumes both parties
 * speak A2CN, and `selectWireProfile` exists to agree the profile up front. Conformance beats a
 * convenience the spec never promised.
 */
export function actHashOf(wirePayload: unknown, envelope: SignedEnvelope): string {
  if (looksLikeA2cn(wirePayload)) return parseA2cnWire(wirePayload).a2cn.protocol_act_hash;
  return sha256(signaturePayload(envelope));
}

/** The signature bytes §9 preserves as evidence, taken from whichever profile carried the message. */
function signaturesOf(wirePayload: unknown, envelope: SignedEnvelope): { act: string; acceptance: string; acceptedActHash: string } {
  if (looksLikeA2cn(wirePayload)) {
    const m = parseA2cnWire(wirePayload).a2cn;
    return { act: m.protocol_act_signature, acceptance: m.acceptance_signature ?? "", acceptedActHash: m.accepted_protocol_act_hash ?? "" };
  }
  // meridian has one signature over the whole envelope; it plays both roles.
  return { act: envelope.sig, acceptance: envelope.sig, acceptedActHash: "" };
}

/**
 * Build a party block. §9: `organization_name` and `agent_id` "MUST be derived from the corresponding
 * fields in the SessionInit (for initiator) and SessionAck (for responder) messages" — i.e. from
 * protocol messages both parties hold, never from local knowledge.
 *
 * Meridian carries that block as `body.party` on the first message each side sends (see
 * PartyIdentity). When it is present we use it, which is the conformant path. When it is absent — an
 * older trail, or a peer that does not send one — we fall back to the DID's own `did:web` label, which
 * is at least public and identical for both parties. The spec marks both fields "informational only,
 * not cryptographically bound"; `did` and `verification_method` are the authoritative identity.
 */
function partyOf(msg: RecordMessage | undefined, did: string, verificationMethod: string): TransactionParty {
  const declared = (msg?.envelope.body as { party?: { organization_name?: string; agent_id?: string } } | undefined)?.party;
  return {
    organization_name: declared?.organization_name ?? did.replace(/^did:web:/, ""),
    did,
    agent_id: declared?.agent_id ?? did,
    // Meridian proves commit-authority with a W3C Verifiable Credential from the trust anchor; that is
    // the same for every party here, so it is a constant rather than a per-message field.
    mandate_type: "VerifiableCredential",
    verification_method: verificationMethod,
  };
}

/** One boundary-crossing message as THIS org recorded it — the only input the record is built from. */
export interface RecordMessage {
  envelope: SignedEnvelope;
  wirePayload: unknown;
}

/** The negotiation round a recorded message belongs to. Messages without one sort last rather than first,
 *  so an unmodelled entry can never displace the RFQ that must open the session. */
function roundOf(m: RecordMessage): number {
  const round = (m.envelope.body as { round?: unknown } | undefined)?.round;
  return typeof round === "number" && Number.isFinite(round) ? round : Number.POSITIVE_INFINITY;
}

/**
 * Build the §9 record for one settled negotiation from THIS org's own messages. Returns null when the
 * negotiation did not settle (no ACCEPT), which is not an error — a walked deal has no record.
 *
 * Every input is a message that crossed the boundary, so the counterparty holds the identical set and
 * derives a byte-identical record. Nothing here reads another organization's store.
 */
export function buildTransactionRecord(messages: RecordMessage[], negotiationId: string): TransactionRecord | null {
  const scoped = messages
    .filter((m) => m.envelope.negotiationId === negotiationId)
    // Ordered by ROUND first, because round is the causal order and a timestamp is not.
    //
    // This used to sort on `sentAt` (millisecond resolution) with a `correlationId` tie-break. That tie-break
    // did make both sides agree — which is what it was for — but agreeing on a CAUSALLY IMPOSSIBLE order is
    // no help: when the RFQ and the QUOTE answering it landed in the same millisecond, the random-UUID
    // comparison put the reply first roughly half the time, `scoped[0]` was then not the RFQ, and the
    // `first.envelope.type !== "RFQ"` guard below returned null. The §9 record — the agreement proof both
    // parties derive independently — simply failed to exist, intermittently, on fast machines. It surfaced as
    // a ~1-in-4 flake in accountability.test.ts.
    //
    // `round` is carried in the SIGNED body and increments once per message (RFQ 1, QUOTE 2, COUNTER 3, …),
    // so it is a total order, identical on both sides, and impossible to invert. `sentAt` and
    // `correlationId` remain as tie-breaks for any message that carries no round, which keeps the old
    // behaviour for inputs this function does not model rather than reordering them arbitrarily.
    .sort((a, b) => {
      const ra = roundOf(a);
      const rb = roundOf(b);
      if (ra !== rb) return ra - rb;
      if (a.envelope.sentAt !== b.envelope.sentAt) return a.envelope.sentAt.localeCompare(b.envelope.sentAt);
      return a.envelope.correlationId.localeCompare(b.envelope.correlationId);
    });
  if (scoped.length === 0) return null;

  const acceptance = scoped.find((m) => m.envelope.type === "ACCEPT");
  if (!acceptance) return null; // not settled — no record to generate
  const offer = scoped.find((m) => m.envelope.correlationId === acceptance.envelope.inReplyTo);
  if (!offer) return null; // an ACCEPT whose offer we do not hold cannot be recorded

  const parsedTerms = Terms.safeParse((acceptance.envelope.body as { terms?: unknown } | undefined)?.terms);
  if (!parsedTerms.success) return null;
  const terms = parsedTerms.data;

  const offerActHash = actHashOf(offer.wirePayload, offer.envelope);
  const offerSigs = signaturesOf(offer.wirePayload, offer.envelope);
  const acceptSigs = signaturesOf(acceptance.wirePayload, acceptance.envelope);
  const first = scoped[0]!;

  // The session must open with an RFQ for the role derivation below to mean anything — `first` IS the
  // initiator, so a scoped set that starts anywhere else (a partial trail, a replayed fragment) would
  // silently name the wrong party as buyer. Refuse rather than emit a confidently wrong record.
  if (first.envelope.type !== "RFQ") return null;
  const initiatorDid = first.envelope.from;
  // The responder is the first OTHER party to speak — not `offer.envelope.from`. The offer is whatever
  // message the ACCEPT replies to, and when the SUPPLIER accepts the buyer's COUNTER that message was
  // sent BY the buyer: both roles then resolved to the buyer's DID, and the record claimed a deal
  // between one organisation and itself, signed by both halves.
  const responderMsg = scoped.find((m) => m.envelope.from !== initiatorDid);
  if (!responderMsg) return null; // only one party ever spoke — not a negotiation
  const responderDid = responderMsg.envelope.from;

  // The first message that actually carried a price. An RFQ is a request, not an offer, so a session
  // whose RFQ names no price starts its offer clock at the QUOTE. Falls back to the accepted offer,
  // which is always priced, so this can never be undefined.
  const firstOffer =
    scoped.find((m) => {
      const t = (m.envelope.body as { terms?: { unitPriceUsd?: unknown } } | undefined)?.terms;
      return t !== undefined && t.unitPriceUsd !== undefined;
    }) ?? offer;

  const rounds = new Set(scoped.map((m) => (m.envelope.body as { round?: number } | undefined)?.round ?? 0));
  /** The first message a given DID sent that declared who it is (§9's SessionInit/SessionAck role). */
  const declaredBy = (did: string): RecordMessage | undefined =>
    scoped.find((m) => m.envelope.from === did && (m.envelope.body as { party?: unknown } | undefined)?.party !== undefined);

  const record: TransactionRecord = {
    record_type: RECORD_TYPE,
    record_version: RECORD_VERSION,
    // §9.4: UUID v5 over the session_id under A2CN's own namespace — NOT a bespoke digest.
    record_id: uuidV5(negotiationId, A2CN_RECORD_NAMESPACE),
    session_id: negotiationId,
    // Deterministic by construction — see the DETERMINISM NOTES above.
    generated_at: acceptance.envelope.sentAt,
    parties: {
      // Each side's own declaration, taken from the first message IT sent that carried one.
      initiator: partyOf(declaredBy(initiatorDid), initiatorDid, first.envelope.didKeyId),
      responder: partyOf(declaredBy(responderDid), responderDid, responderMsg.envelope.didKeyId),
    },
    deal_type: "goods_procurement",
    currency: "USD",
    subject: terms.sku,
    subject_reference: terms.sku,
    // The DECODED Meridian terms, not the profile's encoding — so a meridian half and an a2cn half of
    // the same deal (dollars vs cents) still hash identically.
    agreed_terms: terms,
    negotiation_summary: {
      total_rounds: rounds.size,
      total_messages: scoped.length,
      session_created_at: first.envelope.sentAt,
      // The FIRST priced message, not the accepted one. `offer` is whatever the ACCEPT replies to —
      // the last offer in the session — so on any negotiation longer than one round this reported the
      // final counter's timestamp under a field named `first_offer_at`, collapsing the whole bargaining
      // window to zero for anyone measuring time-to-first-offer from the §9 record.
      first_offer_at: firstOffer.envelope.sentAt,
      accepted_at: acceptance.envelope.sentAt,
      initiating_party_did: first.envelope.from,
      accepting_party_did: acceptance.envelope.from,
    },
    final_offer: {
      message_id: offer.envelope.correlationId,
      sender_did: offer.envelope.from,
      protocol_act_hash: offerActHash,
      protocol_act_signature: offerSigs.act,
    },
    final_acceptance: {
      message_id: acceptance.envelope.correlationId,
      sender_did: acceptance.envelope.from,
      // The acceptance's own §7.4 field when the wire carried one, else the offer's act hash. §9.5
      // step 4 requires this to equal `final_offer.protocol_act_hash`; both forms satisfy that.
      accepted_protocol_act_hash: acceptSigs.acceptedActHash || offerActHash,
      acceptance_signature: acceptSigs.acceptance,
    },
    // "SHA-256 of the JCS-serialized array of all protocol_act_hash values in chronological order."
    offer_chain_hash: sha256(canonicalize(scoped.map((m) => actHashOf(m.wirePayload, m.envelope)))),
    record_hash: "",
  };
  record.record_hash = transactionRecordHash(record);
  return record;
}

/**
 * "SHA-256 of the JCS-serialized transaction record with `record_hash` set to the empty string."
 *
 * `record_hash` is the ONLY field blanked. Everything else in the record is hashed as it stands,
 * including the preserved `protocol_act_signature` and `acceptance_signature` strings — so editing a
 * signature breaks the content address rather than sliding past it.
 *
 * The record therefore binds the agreement whole: the signatures, the content-derived
 * `final_offer.protocol_act_hash` and `final_acceptance.accepted_protocol_act_hash` (see `actHashOf`),
 * the terms, the parties, and the entire offer chain.
 */
export function transactionRecordHash(record: TransactionRecord): string {
  return sha256(
    canonicalize({
      ...record,
      record_hash: "",
    }),
  );
}

/** Re-derive and compare — proof a record has not been edited since it was generated. */
export function verifyTransactionRecord(record: TransactionRecord): boolean {
  return record.record_hash === transactionRecordHash(record);
}

/**
 * Build the record straight from an org's own half-trail. This is the normal entry point: a half-trail
 * already holds every boundary-crossing message with the exact signed bytes that carried it.
 */
export function transactionRecordFromTrail(records: TrailRecord[], negotiationId: string): TransactionRecord | null {
  const messages: RecordMessage[] = [];
  for (const r of records) {
    if (r.negotiationId !== negotiationId) continue;
    try {
      messages.push({ envelope: detectWireProfile(r.wirePayload).decode(r.wirePayload), wirePayload: r.wirePayload });
    } catch {
      // A record whose payload will not decode cannot contribute; the record simply will not form,
      // which is the correct outcome — better than silently hashing a partial history.
      return null;
    }
  }
  return buildTransactionRecord(messages, negotiationId);
}
