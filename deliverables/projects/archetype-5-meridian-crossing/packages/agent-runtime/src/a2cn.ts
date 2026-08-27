import { createHash } from "node:crypto";
import { z } from "zod";
import {
  canonicalize,
  parseSignedEnvelope,
  PartyIdentity,
  type NegotiationType,
  type ReasonCode,
  type SignedEnvelope,
  type Terms,
} from "@meridian/protocol";
import { verifyDetached, type VerifyResult } from "./identity.js";
import { sanitiseRationale } from "./rationale.js";

/**
 * The A2CN codec, aligned to the REAL A2CN v0.2.0 specification
 * (github.com/A2CN-protocol/A2CN, spec/a2cn-spec-v0.2.0.md + spec/schemas/). A2CN
 * (Agent-to-Agent Commercial Negotiation Protocol) is an open, Apache-2.0 protocol that occupies
 * exactly the negotiation slot in the stack `MCP → A2A → A2CN → AP2/ACP`. This translates a Meridian
 * negotiation envelope to and from an A2CN `goods_procurement` message.
 *
 * WHAT'S FAITHFUL TO THE REAL SPEC (verified 2026-07 against the published repo):
 *   - snake_case message envelope: message_type, message_id, session_id, in_reply_to, round_number,
 *     sequence_number, sender_did, sender_verification_method, timestamp, terms, protocol_act_hash,
 *     protocol_act_signature (§7.1).
 *   - the base `terms` object: total_value + currency (integers, MINOR UNITS) + line_items[] with
 *     {id, description, quantity, unit, unit_price, total}, and the `goods_procurement` extension's
 *     required `delivery_days` (§ schemas/terms/goods_procurement).
 *   - real message_type values (offer / counteroffer / acceptance / rejection / withdrawal) and real
 *     terminal states COMPLETED / REJECTED_FINAL / WITHDRAWN / TIMED_OUT (§8.2). NOTE: the earlier
 *     bespoke build used "IMPASSE" from A2CN's marketing page; the normative v0.2.0 spec does not —
 *     it uses REJECTED_FINAL / TIMED_OUT. This codec follows the spec.
 *   - protocol-act signing (§7.3): the signed object {protocol_version, session_id, round_number,
 *     sequence_number, message_type, sender_did, timestamp, expires_at, terms} is JCS-canonicalized,
 *     SHA-256'd to `protocol_act_hash = base64url(SHA-256(jcs))`, and signed as a compact JWS whose
 *     payload is base64url(ASCII(protocol_act_hash)). We use EdDSA (A2CN permits ES256|EdDSA) over the
 *     agents' existing Ed25519 DID keys, so no new key material and the identity layer is reused, not
 *     replaced — this is A2CN's own commit-authority signature, verified against the sender's DID.
 *   - acceptance signing (§7.4): an `acceptance` carries a SECOND signature over {session_id,
 *     round_number, sequence_number, accepted_offer_id, accepted_protocol_act_hash}, where the hash
 *     MUST equal the accepted offer's `protocol_act_hash`. This is what welds an acceptance to the
 *     exact act it closes, and it is the spec's own defence against acceptance replay. NOTHING here
 *     may key off `terminal_state`, which A2CN deliberately leaves unsigned: an earlier build derived
 *     ACCEPT-vs-CONFIRM from it, which let one edited string promote a non-binding acceptance into a
 *     settled order. Meridian now settles on a single ACCEPT, so there is nothing to disambiguate.
 *
 * DOCUMENTED SIMPLIFICATIONS (see docs/a2cn-alignment.md):
 *   - A2CN messages carry no recipient (A2A addresses it at the transport layer). Section 16 (the A2A
 *     composition binding) is not in the published spec text yet — it rides in the OQ-011 proposal — so
 *     we define a minimal binding: the DataPart payload is a WRAPPER, `{a2cn, recipient_did}`, and the
 *     `a2cn` member is a conforming A2CN message with nothing of ours added to it.
 *
 *     `recipient_did` used to sit INSIDE the message, next to the spec's own fields. It verified fine
 *     here (nothing signs it) but it meant the object we called an A2CN message was not one: a
 *     conforming implementation validating it against `spec/schemas/` saw an unexpected member, and the
 *     one property this codec exists to hold — that our bytes are A2CN's bytes — was not actually true.
 *     Moving the field out costs a nesting level and buys back exact conformance.
 *   - `message_id` and `in_reply_to` are OUTSIDE the protocol-act signature, for the same reason
 *     `recipient_did` is: §7.3.1 enumerates the signed object and neither field is in it. So
 *     `verifyA2cn` accepts a message whose correlation identifiers were altered in transit, and
 *     `decodeA2cnUnverified` surfaces the altered values as `correlationId` / `inReplyTo`.
 *
 *     THE RESIDUAL GAP, stated precisely so nobody has to rediscover its shape: `rememberActHash` can
 *     key an offer under a tampered `message_id`, so the later ACCEPT cites an id the counterparty
 *     recorded differently. What that produces is a REJECTED acceptance — the counterparty's
 *     `verifyAcceptance` refuses it before any §9 record is generated — not a forged or altered deal.
 *     The economically meaningful fields (terms, session, round, sequence, sender, timestamp, expiry)
 *     are all signed, and `accepted_protocol_act_hash` binds an acceptance to the exact act it closes.
 *     An attacker who can rewrite these fields can therefore break a negotiation, which it could also
 *     do by dropping the message; it cannot move value.
 *
 *     Closing it properly means either extending the signed object beyond what the spec enumerates —
 *     which would make our protocol_act_hash incompatible with any conforming implementation, the one
 *     thing this codec exists to preserve — or an authenticated transport session binding the
 *     identifiers, which is Section 16's job and is not published yet. Both are deferred with the
 *     `recipient_did` binding above, because they are the same missing piece of the spec.
 *   - The buyer's opening RFQ has no price; A2CN offers require total_value. We encode it as an `offer`
 *     with an unpriced line item, total_value 0 and custom_terms.meridian_opening_rfq=true. A production
 *     deployment would use A2CN's session_invitation (Component 8), which needs discovery endpoints
 *     out of scope here.
 *   - Level-3 messages (delivery/dispute) are not modelled. The §9 transaction record IS — see
 *     transaction-record.ts, which replaced the old reconcile() precisely because reconcile required
 *     one org to read another's log.
 *   - Meridian never SETS `expires_at`, so its own offers do not lapse. `verifyA2cn` fully enforces the
 *     field on inbound messages, so a counterparty that sets one is honoured; the gap is one-directional.
 *     It is deliberate rather than pending: an expiry is a wall-clock timestamp inside the signed act, so
 *     emitting one would make every protocol_act_hash depend on the moment it was produced — which breaks
 *     the byte-stable fixture in seed/a2cn/ and the run-to-run reproducibility the demo is built on. A
 *     production deployment sets it from an offer-lifetime policy and accepts the non-determinism.
 *
 * Nothing Meridian-specific is LOAD-BEARING on the wire any more: the commit model was collapsed to
 * A2CN's single acceptance, which removed the field this codec used to protect itself with. What remains
 * in `custom_terms` — the opening-RFQ marker, the §9 party declaration, the rationale — is informational,
 * and every key is prefixed `meridian_`. The prefix is the point: `custom_terms` is A2CN's own extension
 * point and a future spec version may define keys in it, so an unprefixed `opening_rfq` or `a2cn_party`
 * was a name we did not own and could silently acquire a second meaning on a version bump.
 */

/** A2CN version this codec targets (matches the schema $id `.../0.2` and required `a2cn_version`). */
export const A2CN_VERSION = "0.2" as const;
export const A2CN_DEAL_TYPE = "goods_procurement" as const;
/**
 * The A2CN A2A extension URI, advertised on the agent card and matched by `cardSupportsA2cn`.
 *
 * This is the value the spec publishes verbatim (§16.2). An earlier build invented a
 * `github.com/.../ext/oq-011` string, which meant a real A2CN agent's card would never match ours —
 * and the failure was SILENT, because not matching just falls back to `meridian`, which is the
 * designed behaviour. Nothing would have looked broken; A2CN simply would never have been used.
 */
export const A2CN_EXTENSION_URI = "https://a2cn.io/extensions/commercial-negotiation/v1" as const;

export const A2cnMessageType = z.enum([
  "offer",
  "counteroffer",
  "acceptance",
  "rejection",
  "withdrawal",
]);
export type A2cnMessageType = z.infer<typeof A2cnMessageType>;

export const A2cnTerminalState = z.enum(["COMPLETED", "REJECTED_FINAL", "WITHDRAWN", "TIMED_OUT"]);
export type A2cnTerminalState = z.infer<typeof A2cnTerminalState>;

/** A `goods_procurement` line item: base fields + the deal-type extension's part numbers / UOM. */
export const A2cnLineItem = z.object({
  id: z.string().optional(),
  description: z.string().optional(),
  quantity: z.number().int().nonnegative(),
  unit: z.string().optional(),
  unit_price: z.number().int().optional(), // MINOR UNITS (cents)
  total: z.number().int().optional(), // MINOR UNITS (cents)
  manufacturer_part_number: z.string().optional(),
  internal_part_number: z.string().optional(),
  unit_of_measure: z.string().optional(),
});
export type A2cnLineItem = z.infer<typeof A2cnLineItem>;

/** The base A2CN `terms` object + the `goods_procurement` extension fields (delivery_days, UOM). */
export const A2cnTerms = z.object({
  total_value: z.number().int(), // MINOR UNITS (cents); required by the base terms schema
  currency: z.string(),
  line_items: z.array(A2cnLineItem).optional(),
  delivery_terms: z.object({ incoterms: z.enum(["FOB", "DDP"]) }).optional(),
  delivery_days: z.number().int().positive().optional(), // goods_procurement (required for that type)
  unit_of_measure: z.string().optional(),
  custom_terms: z.record(z.string(), z.unknown()).optional(),
});
export type A2cnTerms = z.infer<typeof A2cnTerms>;

/**
 * A signed A2CN message — the spec's own fields and NOTHING else. Addressing lives one level up, in
 * `A2cnWirePayload`, because A2CN has no recipient field and adding one made this object non-conforming.
 */
export const A2cnMessage = z.object({
  a2cn_version: z.literal(A2CN_VERSION),
  deal_type: z.literal(A2CN_DEAL_TYPE),
  message_type: A2cnMessageType,
  message_id: z.uuid(),
  session_id: z.uuid(),
  in_reply_to: z.uuid().optional(),
  round_number: z.number().int().positive(),
  sequence_number: z.number().int().nonnegative(),
  sender_did: z.string(),
  sender_verification_method: z.string(),
  timestamp: z.iso.datetime(),
  /** §7.3.1 signs this, and `verifyA2cn` enforces it WHEN PRESENT, so an inbound offer that carries an
   *  expiry stops being usable once it lapses. Meridian itself never emits one — see the expiry entry
   *  under DOCUMENTED SIMPLIFICATIONS — so for our own traffic this is an inbound-only defence. */
  expires_at: z.iso.datetime().optional(),
  terms: A2cnTerms.optional(),
  terminal_state: A2cnTerminalState.optional(),
  accepted_offer_id: z.uuid().optional(), // on an acceptance: the offer message_id being accepted
  /** §7.4: MUST match the `protocol_act_hash` of the offer this acceptance accepts. */
  accepted_protocol_act_hash: z.string().optional(),
  protocol_act_hash: z.string(),
  protocol_act_signature: z.string(), // compact JWS (EdDSA)
  /** §7.4: a SECOND signature, over the acceptance object — present on `acceptance` messages. */
  acceptance_signature: z.string().optional(),
});
export type A2cnMessage = z.infer<typeof A2cnMessage>;

/**
 * What actually travels in the A2A `DataPart`: our minimal §16 binding. The A2CN message is carried
 * verbatim under `a2cn`; `recipient_did` is the transport-layer addressing A2CN leaves to A2A.
 *
 * Signed by nothing, and it cannot be — §7.3.1 enumerates the signed object and no recipient appears in
 * it. `checkAddressedTo` at the A2A boundary is what stops a valid message being replayed to a different
 * supplier, for BOTH profiles; see the note on `verifyA2cn`.
 */
export const A2cnWirePayload = z.object({
  a2cn: A2cnMessage,
  recipient_did: z.string(),
});
export type A2cnWirePayload = z.infer<typeof A2cnWirePayload>;

/** Parse the A2CN message itself (the `a2cn` member, or a bare conforming message). */
export function parseA2cnMessage(value: unknown): A2cnMessage {
  return A2cnMessage.parse(value);
}

/** Parse the wire payload — the wrapper plus the message inside it. */
export function parseA2cnWire(value: unknown): A2cnWirePayload {
  return A2cnWirePayload.parse(value);
}

/** The minimal signer capability the codec needs — a subset of the identity `Signer`. */
export interface A2cnSigner {
  readonly keyId: string;
  signDetached(data: Buffer): Buffer;
}

const NEGOTIATION_VERBS: ReadonlySet<string> = new Set([
  "RFQ",
  "QUOTE",
  "COUNTER",
  "ACCEPT",
  "WALKAWAY",
]);
export function isNegotiationVerb(type: string): type is NegotiationType {
  return NEGOTIATION_VERBS.has(type);
}

// --- verb / terminal mapping -------------------------------------------------

/**
 * Does this deal carry a price at all?
 *
 * The same predicate `verifyDealArithmetic` keys on, for the same reason: an unpriced line and a line
 * priced at zero are different facts, so this asks whether `unit_price` is PRESENT rather than whether any
 * number is above zero. `total_value` is consulted too, so a terms object that states a total without
 * itemising it still counts as priced — the documented shape of an unpriced opening is `total_value: 0`
 * with no `unit_price` anywhere, and anything else is somebody quoting a price.
 */
function isPricedDeal(deal: A2cnTerms | undefined): boolean {
  if (!deal) return false;
  if ((deal.line_items ?? []).some((l) => l.unit_price !== undefined)) return true;
  return deal.total_value !== 0;
}

/** A WALKAWAY's reasonCode → A2CN terminal state (§8.2 vocabulary). A2CN is coarser than Meridian:
 *  POLICY / OUT_OF_TERMS / BUDGET_EXHAUSTED all collapse to REJECTED_FINAL ("max rounds / no deal"). */
export function reasonToA2cnTerminal(reasonCode?: ReasonCode): A2cnTerminalState {
  switch (reasonCode) {
    case "DONE":
      return "WITHDRAWN";
    case "TIMEOUT":
      return "TIMED_OUT";
    default:
      return "REJECTED_FINAL"; // POLICY, OUT_OF_TERMS, BUDGET_EXHAUSTED, undefined
  }
}

/** A2CN terminal state → a representative Meridian reasonCode (lossy where A2CN is coarser). */
export function a2cnTerminalToReason(terminal: A2cnTerminalState): ReasonCode {
  switch (terminal) {
    case "WITHDRAWN":
      return "DONE";
    case "TIMED_OUT":
      return "TIMEOUT";
    case "COMPLETED":
      return "DONE";
    case "REJECTED_FINAL":
    default:
      return "POLICY";
  }
}

/** WALKAWAY message_type by terminal state: a clean disengage/timeout is a withdrawal; a substantive
 *  no-deal is a rejection. */
function walkawayMessageType(terminal: A2cnTerminalState): A2cnMessageType {
  return terminal === "REJECTED_FINAL" ? "rejection" : "withdrawal";
}

function verbToMessageType(verb: NegotiationType, reasonCode?: ReasonCode): A2cnMessageType {
  switch (verb) {
    case "RFQ":
      return "offer"; // buyer's opening (round 1), unpriced
    case "QUOTE":
    case "COUNTER":
      return "counteroffer"; // every priced response
    case "ACCEPT":
      return "acceptance"; // one acceptance settles, exactly as A2CN models it
    case "WALKAWAY":
      return walkawayMessageType(reasonToA2cnTerminal(reasonCode));
  }
}

/**
 * Reconstruct the Meridian verb from A2CN semantics. Every branch keys off `message_type`, which is
 * INSIDE the signed protocol act (§7.3.1) — so the verb a receiver derives is covered by the sender's
 * signature and cannot be changed in flight.
 *
 * This used to read the unsigned `terminal_state` to tell an ACCEPT from a CONFIRM, which is what made
 * a lone acceptance promotable to a settled order by editing one unsigned string. With the commit
 * collapsed to a single ACCEPT there is nothing left to disambiguate, so the field is no longer read
 * for anything load-bearing — matching A2CN, which never gave it meaning in the first place.
 */
function messageTypeToVerb(msg: A2cnMessage): NegotiationType {
  switch (msg.message_type) {
    case "offer":
      // A2CN's `offer` is an OPENING POSITION, and in the ordinary case it carries a price. Meridian only
      // ever EMITS the unpriced kind — the `total_value: 0` stand-in for `session_invitation` — and this
      // branch used to return RFQ unconditionally, which read our own encoding back correctly and misread
      // everyone else's. A conforming counterparty opening with a priced offer was decoded as a request
      // for a quote CARRYING a price: schema-valid (RFQ is not a PRICE_VERB, so partial terms pass), and
      // the receiving agent then quotes against a number the sender meant as its offer. Silent, and the
      // sender's own signature covers the terms that were misread.
      //
      // A priced opening is, in Meridian's vocabulary, a QUOTE. Mapping it there does not make an
      // unsolicited opening WORK — `admitInbound` still refuses a QUOTE with no RFQ before it, which is
      // the correct answer for a negotiation model that opens at the RFQ — but it turns a silent misread
      // into the state machine's own loud refusal, and it decodes a priced re-offer mid-session correctly.
      return isPricedDeal(msg.terms) ? "QUOTE" : "RFQ";
    case "counteroffer":
      // A2CN has ONE priced-response type; Meridian distinguishes the opening QUOTE from every later
      // COUNTER, so the distinction has to be recovered on decode. It is recovered from position, which
      // is exact rather than heuristic: `round_number` is `meridian round + 1` and Meridian's round
      // counts messages, so round_number 1 is the RFQ (encoded as `offer`, never reaching this branch)
      // and round_number 2 is the reply to it — which the state machine only ever allows to be the
      // supplier's QUOTE. Every priced message after that is a COUNTER.
      //
      // `=== 2`, not `<= 2`: the old bound also claimed round_number 1, a slot that cannot hold a
      // counteroffer, which read as though the boundary were approximate. It is not.
      //
      // Deliberately not carried as a signed `custom_terms` marker instead. That would put a
      // Meridian-private distinction inside the A2CN act — changing every protocol_act_hash, breaking
      // the byte-stable seed/a2cn/ fixture — to encode something the message's own position already
      // determines. If the state machine ever admits a priced reply at another round, THAT is what
      // changes, and this mapping must change with it: see `admitInbound` for the allowed transitions.
      return msg.round_number === 2 ? "QUOTE" : "COUNTER";
    case "acceptance":
      return "ACCEPT";
    case "rejection":
    case "withdrawal":
      return "WALKAWAY";
  }
}

// --- terms mapping (minor units) ---------------------------------------------

const toCents = (usd: number): number => Math.round(usd * 100);
const fromCents = (cents: number): number => Math.round(cents) / 100;

function termsToDeal(terms: Partial<Terms> | undefined, isRfq: boolean): A2cnTerms | undefined {
  if (!terms || terms.sku === undefined || terms.units === undefined) return undefined;
  const priced = terms.unitPriceUsd !== undefined;
  const line: A2cnLineItem = {
    id: "1",
    description: terms.sku,
    internal_part_number: terms.sku,
    quantity: terms.units,
    unit: "EA",
  };
  // Derive the totals from the ROUNDED unit price, not from the raw USD product. Rounding each
  // independently let them disagree: at $86.585/u × 100, `unit_price` rounds to 8659¢ while
  // `toCents(8658.5)` gives 865850¢ — so `total !== unit_price * units`, by 50¢, inside a SIGNED
  // offer. A counterparty recomputing the line (or a human reading the invoice) sees arithmetic that
  // does not add up and cannot tell which figure is authoritative.
  const unitCents = priced ? toCents(terms.unitPriceUsd!) : 0;
  const totalCents = unitCents * terms.units;
  if (priced) {
    line.unit_price = unitCents;
    line.total = totalCents;
  }
  const deal: A2cnTerms = {
    total_value: priced ? totalCents : 0,
    currency: "USD",
    line_items: [line],
  };
  if (terms.leadTimeDays !== undefined) deal.delivery_days = terms.leadTimeDays;
  if (terms.deliveryTerms !== undefined) deal.delivery_terms = { incoterms: terms.deliveryTerms };
  if (isRfq) deal.custom_terms = { [OPENING_RFQ_KEY]: true };
  return deal;
}

function dealToTerms(deal: A2cnTerms | undefined): Partial<Terms> | undefined {
  if (!deal) return undefined;
  // Meridian's `Terms` models ONE line item. A2CN's does not, so a counterparty may legitimately send a
  // multi-line deal — and taking `[0]` silently discarded the rest, handing the negotiation a cheaper,
  // smaller deal than the one that was actually signed. The buyer would then bargain over, accept, and
  // pay for terms the counterparty's signature never covered, with nothing anywhere reporting a
  // mismatch. Refusing is the only safe answer while the internal model is single-line: `receiveInbound`
  // turns undefined terms into a rejected message, which is loud and recoverable, unlike quiet
  // truncation. Supporting multi-line deals properly means widening `Terms`, not choosing an item here.
  if ((deal.line_items?.length ?? 0) > 1) return undefined;
  const line = deal.line_items?.[0];
  if (!line) return undefined;
  const terms: Partial<Terms> = {
    sku: line.description ?? line.internal_part_number ?? "UNKNOWN-SKU",
    units: line.quantity,
  };
  if (line.unit_price !== undefined) terms.unitPriceUsd = fromCents(line.unit_price);
  if (deal.delivery_days !== undefined) terms.leadTimeDays = deal.delivery_days;
  if (deal.delivery_terms !== undefined) terms.deliveryTerms = deal.delivery_terms.incoterms;
  return terms;
}

// --- protocol-act signing (§7.3) ---------------------------------------------

const b64url = (data: Buffer | string): string =>
  (typeof data === "string" ? Buffer.from(data, "utf8") : data).toString("base64url");

/**
 * The §7.4 acceptance object: `{session_id, round_number, sequence_number, accepted_offer_id,
 * accepted_protocol_act_hash}`, JCS-canonicalized and SHA-256'd. `accepted_protocol_act_hash` MUST
 * equal the accepted offer's `protocol_act_hash`, which is what binds an acceptance to the exact
 * protocol act it closes — the spec's own answer to acceptance replay.
 */
function acceptanceHash(msg: A2cnMessage): string {
  const acc = canonicalize({
    session_id: msg.session_id,
    round_number: msg.round_number,
    sequence_number: msg.sequence_number,
    accepted_offer_id: msg.accepted_offer_id,
    accepted_protocol_act_hash: msg.accepted_protocol_act_hash,
  });
  return createHash("sha256").update(acc, "utf8").digest("base64url");
}

/** The §7.3.1 signed object — the full protocol act, not just the terms (prevents replay). */
function protocolAct(msg: A2cnMessage): Record<string, unknown> {
  const act: Record<string, unknown> = {
    protocol_version: A2CN_VERSION,
    session_id: msg.session_id,
    round_number: msg.round_number,
    sequence_number: msg.sequence_number,
    message_type: msg.message_type,
    sender_did: msg.sender_did,
    timestamp: msg.timestamp,
  };
  // §7.3.1 lists `expires_at` in the signed object. Omitted only when the message carries none, so a
  // message WITH an expiry can never have it stripped or extended without breaking the signature.
  if (msg.expires_at !== undefined) act.expires_at = msg.expires_at;
  if (msg.terms) act.terms = msg.terms;
  return act;
}

/** protocol_act_hash = base64url(SHA-256(JCS(act))). We reuse `canonicalize` as JCS — it emits members
 *  in RFC 8785's UTF-16 code-unit order, including for the numeric-looking keys an operator can put in
 *  `custom_terms` (where JS object ordering alone would have put "2" before "10"). */
function protocolActHash(msg: A2cnMessage): string {
  const jcs = canonicalize(protocolAct(msg));
  return createHash("sha256").update(jcs, "utf8").digest("base64url");
}

/** Build a compact EdDSA JWS whose payload segment is base64url(ASCII(protocol_act_hash)). */
function buildJws(hash: string, signer: A2cnSigner): string {
  const header = b64url(JSON.stringify({ alg: "EdDSA", typ: "a2cn-act" }));
  const payload = b64url(hash);
  const signingInput = `${header}.${payload}`;
  const sig = signer.signDetached(Buffer.from(signingInput, "ascii"));
  return `${signingInput}.${b64url(sig)}`;
}

/** Verify a compact EdDSA JWS against `senderDid`'s verification method, binding it to `hash`. */
function verifyJws(jws: string, hash: string, senderDid: string, verificationMethod: string): boolean {
  const parts = jws.split(".");
  if (parts.length !== 3) return false;
  const header = parts[0]!;
  const payload = parts[1]!;
  const sig = parts[2]!;
  if (payload !== b64url(hash)) return false; // the JWS must sign THIS act's hash
  return verifyDetached(
    senderDid,
    verificationMethod,
    Buffer.from(`${header}.${payload}`, "ascii"),
    Buffer.from(sig, "base64url"),
  );
}

// --- encode / decode ---------------------------------------------------------

interface NegBody {
  round: number;
  terms?: Partial<Terms>;
  reasonCode?: ReasonCode;
  party?: { organization_name: string; agent_id: string };
  rationale?: string;
}

/**
 * Our three `custom_terms` keys, all under a `meridian_` namespace.
 *
 * `custom_terms` is A2CN's sanctioned extension point, which means the spec may itself define keys there
 * in a later version. Two of these were originally unprefixed (`opening_rfq`, `a2cn_party`) — names we do
 * not own, in a namespace we share with the standard. A v0.3 that defined either one would not break
 * anything loudly; our value would simply also be read as the spec's, which is the failure mode a
 * namespace exists to prevent. Nothing else in this codec depends on the spelling, so it is cheap to own.
 *
 * PARTY: A2CN carries each org's name on SessionInit/SessionAck (§6.3/§6.4), which Meridian does not
 * implement — it opens straight at the RFQ. §9 nonetheless requires the transaction record's party names
 * to be derived from protocol messages, so the declaration rides on the first message each side sends,
 * inside the signed act. Purely informational per §9 ("not cryptographically bound"); the authoritative
 * identity is the DID.
 *
 * RATIONALE: §13.9.2 tells an implementation to carry a `rationale` "for the A2CN rationale field" — but
 * §7.1's offer/counteroffer schema defines no such field (only `rejection`/`withdrawal` carry
 * `reason_code` / `reason_description`). That is an inconsistency in v0.2.0, so until it is resolved the
 * rationale rides here — which is also, per §13.6, exactly the field a receiver must treat as untrusted.
 *
 * OPENING_RFQ: marks the unpriced opening `offer` that stands in for `session_invitation` (Component 8).
 */
const PARTY_KEY = "meridian_party" as const;
const RATIONALE_KEY = "meridian_rationale" as const;
const OPENING_RFQ_KEY = "meridian_opening_rfq" as const;

/** Every `custom_terms` key this codec may write. Exported so the acceptance suite can assert that the
 *  wire carries these and nothing else — an unnamespaced key reaching the wire is the regression. */
export const A2CN_CUSTOM_TERMS_KEYS = [PARTY_KEY, RATIONALE_KEY, OPENING_RFQ_KEY] as const;

/**
 * `message_id` → `protocol_act_hash`, for every A2CN message this process has decoded.
 *
 * §7.4 requires an acceptance to carry the `protocol_act_hash` of the offer it accepts, but an
 * encoder only holds the offer's id (`inReplyTo`). Rather than thread the hash through every
 * `WireProfile.encode` call site — none of which have session context — we record it at the point
 * messages are read. That mirrors the protocol's own precondition: you can only accept an offer you
 * actually received, and the two always happen in the same process (the buyer decodes a QUOTE then
 * encodes the ACCEPT that settles it).
 *
 * Bounded by messages seen in one run. A long-lived deployment should key this per session and evict
 * on terminal state; for a demo process the whole map is a few hundred entries at most.
 */
const actHashByMessageId = new Map<string, { actHash: string; sessionId: string }>();

/** Remember an inbound message's act hash AND the session it belongs to, so a later acceptance can cite
 *  it (§7.4) and be checked against the session it claims to be closing. */
function rememberActHash(msg: A2cnMessage): void {
  actHashByMessageId.set(msg.message_id, { actHash: msg.protocol_act_hash, sessionId: msg.session_id });
}

/** Test seam: forget every recorded act hash. */
export function resetA2cnActHashes(): void {
  actHashByMessageId.clear();
}

/**
 * Encode a signed Meridian negotiation envelope as a signed A2CN message. Requires a `signer` (the
 * A2CN protocol-act signature is produced fresh here — it is A2CN's own signature, not the meridian one).
 */
export function encodeA2cn(signed: SignedEnvelope, signer: A2cnSigner): A2cnWirePayload {
  const verb = signed.type;
  if (!isNegotiationVerb(verb)) throw new Error(`A2CN codec only encodes negotiation verbs, got '${verb}'`);
  const body = (signed.body ?? {}) as NegBody;
  const a2cnRound = body.round + 1; // A2CN rounds are 1-based; Meridian's are 0-based
  const messageType = verbToMessageType(verb, body.reasonCode);

  const msg: A2cnMessage = {
    a2cn_version: A2CN_VERSION,
    deal_type: A2CN_DEAL_TYPE,
    message_type: messageType,
    message_id: signed.correlationId,
    session_id: signed.negotiationId,
    // Both from the same source, and deliberately so. Meridian's `round` counts MESSAGES, not
    // round-trips — every sender sets `round: inbound.round + 1` (see `replyRound` in seller.ts and the
    // `reply.body.round + 1` sites in negotiate.ts) — so RFQ/QUOTE/COUNTER/… run 0,1,2,3 and `a2cnRound`
    // is already the 1-based per-message counter `sequence_number` is defined to be. They coincide
    // because Meridian has one counter where A2CN names two, not because sequence_number is unset.
    //
    // It must NOT become a stateful counter incremented inside this function. `encodeA2cn` is called
    // more than once for the same logical message — once for the wire (message.ts) and once to record
    // the exact bytes on the half-trail (agent.ts, negotiate.ts) — so a mutable counter would hand those
    // two encodings different sequence numbers, hence different protocol_act_hashes, and the
    // non-repudiation artifact would no longer match what actually crossed the boundary. This function
    // is a pure function of the envelope, and the half-trail's whole value depends on it staying one.
    round_number: a2cnRound,
    sequence_number: a2cnRound,
    sender_did: signed.from,
    sender_verification_method: signed.didKeyId,
    timestamp: signed.sentAt,
    protocol_act_hash: "", // filled below
    protocol_act_signature: "", // filled below
  };
  if (signed.inReplyTo !== undefined) msg.in_reply_to = signed.inReplyTo;
  const deal = termsToDeal(body.terms, verb === "RFQ");
  if (deal) msg.terms = deal;
  // Carry the sender's self-declaration so the far side can derive the same §9 party block. custom_terms
  // hangs off `terms`, so a message with no terms has nowhere to put it. The two riders differ in what
  // that costs, so they are handled differently rather than both being dropped on the floor:
  //   party      §9-load-bearing. Losing it gives the receiver a DIFFERENT party block (DID-derived)
  //              from the one the sender recorded, so the two §9 records disagree over a field neither
  //              side can see went missing. Fail loudly. In practice unreachable: a party is declared
  //              only on the first message each side sends, and RFQ/QUOTE always carry terms.
  //   rationale  informational, and A2CN v0.2.0 genuinely has no carrier for it on a terms-less
  //              rejection/withdrawal (see RATIONALE_KEY). Dropping it there is a documented limit of
  //              the mapping, not a lost commitment.
  if (body.party) {
    if (!msg.terms) {
      throw new Error(`A2CN ${verb} declares a §9 party but carries no terms to attach custom_terms to`);
    }
    msg.terms.custom_terms = { ...msg.terms.custom_terms, [PARTY_KEY]: body.party };
  }
  if (body.rationale && msg.terms) msg.terms.custom_terms = { ...msg.terms.custom_terms, [RATIONALE_KEY]: body.rationale };
  const isAcceptance = verb === "ACCEPT";
  if (isAcceptance) {
    // §7.4: an acceptance MUST cite the offer it closes AND that offer's protocol act hash. Both are
    // required, so a missing one fails closed here rather than emitting an acceptance the receiver
    // cannot bind — an unbound acceptance is exactly the replayable artifact §7.4 exists to prevent.
    if (signed.inReplyTo === undefined) {
      throw new Error("A2CN acceptance must reply to the offer it accepts (§7.4 accepted_offer_id)");
    }
    const accepted = actHashByMessageId.get(signed.inReplyTo);
    if (accepted === undefined) {
      throw new Error(
        `A2CN acceptance cannot cite the protocol act of an offer this process never saw (${signed.inReplyTo}, §7.4)`,
      );
    }
    msg.accepted_offer_id = signed.inReplyTo;
    msg.accepted_protocol_act_hash = accepted.actHash;
    // An acceptance completes the A2CN session. Recorded because it is TRUE, not because anything
    // depends on it — no verb, state, or trust decision reads this field (see messageTypeToVerb).
    msg.terminal_state = "COMPLETED";
  } else if (verb === "WALKAWAY") {
    msg.terminal_state = reasonToA2cnTerminal(body.reasonCode);
  }

  const hash = protocolActHash(msg);
  msg.protocol_act_hash = hash;
  msg.protocol_act_signature = buildJws(hash, signer);
  // §7.4's SECOND signature, over the acceptance object. Produced after the act hash exists because
  // an acceptance is signed independently of the act it closes.
  if (isAcceptance) msg.acceptance_signature = buildJws(acceptanceHash(msg), signer);
  // Validate our own output at the boundary, message first and wrapper second. The message goes through
  // A2CN's schema alone, which strips anything that is not an A2CN field — so the object we hand out
  // under `a2cn` is conforming by construction, and our binding field cannot ride along inside it.
  const out = parseA2cnWire({ a2cn: parseA2cnMessage(msg), recipient_did: signed.to });
  rememberActHash(out.a2cn);
  return out;
}

/**
 * Decode a signed A2CN message back into a Meridian SignedEnvelope WITHOUT verifying (schema +
 * reconstruction only). The A2CN JWS is carried in the `sig` slot and the verification method in
 * `didKeyId`, so downstream shape validation (parseNegotiationMsg) holds; authenticity is checked by
 * `verifyA2cn`, not the meridian envelope check.
 */
export function decodeA2cnUnverified(raw: unknown): SignedEnvelope {
  const { a2cn: msg, recipient_did } = parseA2cnWire(raw);
  // NOTE: deliberately does NOT record the act hash. `verifyAcceptance` resolves an acceptance's cited
  // offer against that map, so anything remembered here — before a single signature has been checked —
  // would let an unverified payload seed the offer an acceptance is then "bound" to. Only `verifyA2cn`
  // and `encodeA2cn` populate it, i.e. acts this agent has authenticated or authored itself.
  const verb = messageTypeToVerb(msg);
  const meridianRound = msg.round_number - 1;
  const terms = dealToTerms(msg.terms);

  const body: NegBody = { round: meridianRound };
  if (terms) body.terms = terms;
  // custom_terms is the field §13.6 tells a receiver to treat as untrusted, so the party declaration is
  // parsed with the protocol's own schema rather than cast into shape. An adversary-shaped value is
  // simply absent, exactly as if no party had been declared.
  const declared = PartyIdentity.safeParse(msg.terms?.custom_terms?.[PARTY_KEY]);
  if (declared.success) body.party = declared.data;
  // Sanitised at the boundary, so nothing downstream ever holds the raw adversary string.
  const rationale = sanitiseRationale(msg.terms?.custom_terms?.[RATIONALE_KEY]);
  if (rationale) body.rationale = rationale;
  // Only a WALKAWAY's reason label is read back off `terminal_state`, and it merely picks between
  // three terminal, non-committing outcomes — the verb itself comes from the signed `message_type`.
  if (verb === "WALKAWAY" && msg.terminal_state) body.reasonCode = a2cnTerminalToReason(msg.terminal_state);

  return parseSignedEnvelope({
    negotiationId: msg.session_id,
    correlationId: msg.message_id,
    inReplyTo: msg.in_reply_to,
    from: msg.sender_did,
    to: recipient_did,
    sentAt: msg.timestamp,
    type: verb,
    body,
    sig: msg.protocol_act_signature,
    didKeyId: msg.sender_verification_method,
  });
}

/**
 * §7.4: an `acceptance` must carry a second signature over `{session_id, round_number,
 * sequence_number, accepted_offer_id, accepted_protocol_act_hash}`, signed by the same sender. This is
 * the spec's own defence against acceptance replay — the acceptance is welded to one specific protocol
 * act, so a signature valid for one offer cannot be lifted onto another.
 */
function verifyAcceptance(msg: A2cnMessage): VerifyResult {
  if (msg.message_type !== "acceptance") return { ok: true, reason: "not an acceptance" };
  if (!msg.acceptance_signature) {
    return { ok: false, reason: "A2CN acceptance carries no acceptance_signature (§7.4)" };
  }
  // Both citation fields are mandatory on an acceptance. A signature over `{..., accepted_offer_id:
  // undefined, accepted_protocol_act_hash: undefined}` verifies perfectly well and binds NOTHING —
  // the welding to a specific act only exists if the fields it welds are actually there.
  if (!msg.accepted_offer_id) {
    return { ok: false, reason: "A2CN acceptance cites no accepted_offer_id (§7.4)" };
  }
  if (!msg.accepted_protocol_act_hash) {
    return { ok: false, reason: "A2CN acceptance cites no accepted_protocol_act_hash (§7.4)" };
  }
  // §7.4's actual requirement: the cited hash MUST equal the accepted offer's own protocol_act_hash.
  // Checking the signature alone only proves the sender chose these two values — it says nothing about
  // whether they describe a real offer. Resolve the offer we recorded and compare, so an acceptance can
  // only ever close an act this agent actually saw.
  const offer = actHashByMessageId.get(msg.accepted_offer_id);
  if (offer === undefined) {
    return { ok: false, reason: `A2CN acceptance cites an offer this agent never saw (${msg.accepted_offer_id}, §7.4)` };
  }
  if (offer.actHash !== msg.accepted_protocol_act_hash) {
    return { ok: false, reason: "A2CN accepted_protocol_act_hash is not the cited offer's protocol act (§7.4)" };
  }
  // The cited offer must belong to THIS session. Without it the two checks above are satisfied by any
  // genuine offer this agent ever saw, so an acceptance in session B could close an offer made in
  // session A — cross-session replay that binds the counterparty to a price it quoted somewhere else,
  // with every signature verifying. The registry is process-wide and long-lived, which is exactly what
  // makes the other sessions reachable.
  if (offer.sessionId !== msg.session_id) {
    return {
      ok: false,
      reason: `A2CN acceptance cites an offer from another session (offer ${msg.accepted_offer_id} belongs to ${offer.sessionId}, not ${msg.session_id}, §7.4)`,
    };
  }
  const ok = verifyJws(
    msg.acceptance_signature,
    acceptanceHash(msg),
    msg.sender_did,
    msg.sender_verification_method,
  );
  return ok
    ? { ok: true, reason: "acceptance signature valid" }
    : { ok: false, reason: "A2CN acceptance_signature does not verify (§7.4)" };
}

/** Verify an A2CN message: the protocol_act_hash must match the recomputed hash, and the JWS must check
 *  out against the sender's DID verification method (plus the §7.4 acceptance checks, and `expires_at`
 *  when the sender set one).
 *
 *  It does NOT authenticate the fields §7.3.1 leaves out of the act — `recipient_did` above all, which
 *  lives in the binding wrapper and is signed by nothing here. Addressing is therefore checked at the
 *  transport boundary instead (`checkAddressedTo` in agent.ts), and must be: a valid A2CN message
 *  replayed to a different recipient verifies perfectly through this function. */
export function verifyA2cn(raw: unknown): VerifyResult {
  let msg: A2cnMessage;
  try {
    msg = parseA2cnWire(raw).a2cn;
  } catch (err) {
    return { ok: false, reason: `malformed A2CN message: ${err instanceof Error ? err.message : String(err)}` };
  }
  const expected = protocolActHash(msg);
  if (msg.protocol_act_hash !== expected) {
    return { ok: false, reason: "protocol_act_hash does not match the message contents (tampered)" };
  }
  const ok = verifyJws(msg.protocol_act_signature, msg.protocol_act_hash, msg.sender_did, msg.sender_verification_method);
  if (!ok) return { ok: false, reason: "A2CN protocol-act signature does not verify" };
  // §7.3.1 puts `expires_at` inside the signed act, which stops it being EXTENDED in flight but says
  // nothing about honouring it. A lapsed offer whose signature still checks out is a replayable offer,
  // so the receiver is where the expiry has to bite.
  if (msg.expires_at !== undefined) {
    const expiresAt = Date.parse(msg.expires_at);
    if (!Number.isFinite(expiresAt)) return { ok: false, reason: "A2CN expires_at is not a parseable timestamp" };
    if (expiresAt <= Date.now()) return { ok: false, reason: "A2CN message has expired (§7.3.1 expires_at)" };
  }
  const arithmetic = verifyDealArithmetic(msg.terms);
  if (!arithmetic.ok) return arithmetic;
  const accepted = verifyAcceptance(msg);
  if (!accepted.ok) return accepted;
  rememberActHash(msg); // a verified offer can be cited by the acceptance we send back (§7.4)
  return { ok: true, reason: "A2CN protocol-act + acceptance signatures valid" };
}

/**
 * A priced deal must add up: `line.total === line.unit_price * quantity`, and `total_value` must equal
 * the sum of the lines.
 *
 * A signature proves a counterparty AUTHORED these numbers; it says nothing about whether they are
 * consistent with each other. `encodeA2cn` derives both totals from the rounded unit price so ours
 * always agree — but that is our encoder's discipline, not a property of anything we receive. A
 * perfectly-signed offer quoting $86.59/u × 100 with a total of $8,000 verified here and settled at
 * whichever figure each side happened to read: the buyer negotiates on `unit_price`, while
 * `total_value` is what an invoice or a §9 record downstream would carry.
 *
 * Checked in MINOR UNITS, where the values are integers and the comparison is exact — no float epsilon,
 * and no rounding decision to get wrong. Unpriced lines (the opening RFQ) are skipped: `total_value: 0`
 * with no `unit_price` is the documented shape for a request, not an inconsistency.
 */
export function verifyDealArithmetic(deal: A2cnTerms | undefined): VerifyResult {
  if (!deal) return { ok: true, reason: "no terms to check" };
  let sum = 0;
  let priced = false;
  for (const line of deal.line_items ?? []) {
    if (line.unit_price === undefined) continue; // unpriced line (opening RFQ)
    priced = true;
    const expected = line.unit_price * line.quantity;
    if (line.total !== undefined && line.total !== expected) {
      return {
        ok: false,
        reason: `A2CN line item '${line.id}' does not add up: unit_price ${line.unit_price} x ${line.quantity} = ${expected}, but total is ${line.total}`,
      };
    }
    sum += line.total ?? expected;
  }
  // Keyed on whether any line is PRICED, not on `sum > 0`. The old guard conflated the two, and the gap
  // between them was a hole: an all-unpriced RFQ sums to 0, so `sum > 0` was false and ANY total_value
  // sailed through unchecked — the request shape whose documented contract is `total_value: 0` could
  // carry an arbitrary figure into a §9 record. A genuinely-zero priced deal (free units, a fully
  // discounted line) lands here too, and it should: 0 is then the sum, and it must still match.
  if (priced) {
    if (deal.total_value !== sum) {
      return {
        ok: false,
        reason: `A2CN total_value ${deal.total_value} does not equal the sum of its line items (${sum})`,
      };
    }
  } else if (deal.total_value !== 0) {
    return {
      ok: false,
      reason: `A2CN deal has no priced line items, so total_value must be 0, but it is ${deal.total_value}`,
    };
  }
  return { ok: true, reason: "deal arithmetic is self-consistent" };
}

/** Convenience: decode + verify, throwing on a bad signature (used by round-trip tests). */
export function decodeA2cn(raw: unknown): SignedEnvelope {
  const verdict = verifyA2cn(raw);
  if (!verdict.ok) throw new Error(verdict.reason);
  return decodeA2cnUnverified(raw);
}

/** True when a wire payload is an A2CN-bound payload (used by the auto-detecting receiver). Keys off the
 *  binding wrapper AND the message inside it, so a bare Meridian envelope can never match.
 *
 *  DISCRIMINATION, NOT VALIDATION — deliberately. This answers only "which wire profile is this?"; the
 *  profile's own `parseA2cnWire`/`verifyA2cn` then reject anything malformed, `recipient_did` included.
 *  Tightening this to a full shape check looks stricter and is not: an A2CN wrapper with a bad address
 *  would fall through to `parseSignedEnvelope` and be rejected as "not a signed envelope", which
 *  misidentifies the profile of a payload that is plainly A2CN and hides the field actually at fault. */
export function looksLikeA2cn(raw: unknown): boolean {
  if (typeof raw !== "object" || raw === null) return false;
  const inner = (raw as Record<string, unknown>).a2cn;
  if (typeof inner !== "object" || inner === null) return false;
  const r = inner as Record<string, unknown>;
  return r.a2cn_version === A2CN_VERSION && typeof r.message_type === "string" && typeof r.protocol_act_hash === "string";
}
