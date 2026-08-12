import { z } from "zod";
import { Envelope, SignedEnvelope } from "./envelope.js";

/**
 * The negotiation message contract. This is the chapter's core claim made executable: "two
 * agents built on different stacks cannot negotiate unless they share a message contract." Everything
 * here is validated by zod on BOTH send and receive, so neither side can emit — or be fooled by — an
 * ill-formed offer. Ambiguity is the named enemy ("a disputed tent order, with money attached"); the
 * schema plus the shared state machine (agent-runtime/negotiation.ts) remove it.
 */

/**
 * Is this a whole number of cents? The single money-precision policy for the whole system.
 *
 * Both wire profiles have to agree on a price to the last digit, because the §9 transaction record is
 * hashed from the decoded terms and the two orgs compare hashes rather than logs. A2CN carries minor
 * units, so anything finer than a cent is unrepresentable there and the two halves diverge.
 */
export function isCentPrecise(usd: number): boolean {
  return Number.isFinite(usd) && Math.round(usd * 100) / 100 === usd;
}

/** Round to whole cents, the same way `toCents` does. Use at the point a price is CHOSEN, so nothing
 *  sub-cent is ever offered; inbound values are rejected rather than rounded (see `Terms`). */
export function roundToCents(usd: number): number {
  return Math.round(usd * 100) / 100;
}

/** The structure of an offer. Every commercial dimension either side can move is a field here. */
export const DeliveryTerms = z.enum(["FOB", "DDP"]);
export type DeliveryTerms = z.infer<typeof DeliveryTerms>;

export const Terms = z.object({
  sku: z.string(),
  units: z.number().int().positive(),
  /**
   * CENT PRECISION, enforced. USD has two decimal places, and anything finer cannot survive the round
   * trip: the a2cn profile carries money in minor units, so $86.585 goes out as 8659 cents and comes
   * back as $86.59 while the meridian half still holds $86.585. Both sides then derive the §9
   * transaction record from "the same" agreed terms and get DIFFERENT `record_hash` values — the
   * agreement proof failing with nothing visibly wrong on either side, which is the worst shape a bug
   * can take in this system.
   *
   * Rejected rather than silently rounded: rounding an inbound price changes what the counterparty
   * actually said, and this value is about to be signed. `isCentPrecise` is the shared policy — see
   * `toCents` in a2cn.ts, which rounds the same way.
   */
  unitPriceUsd: z
    .number()
    .positive()
    .refine(isCentPrecise, { message: "unitPriceUsd must be in whole cents (at most 2 decimal places)" }),
  leadTimeDays: z.number().int().positive(),
  deliveryTerms: DeliveryTerms.default("DDP"),
});
export type Terms = z.infer<typeof Terms>;

/**
 * The turn verbs. Direction is fixed by the request/reply transport (A2A sendMessage is one-shot):
 *   RFQ     buyer  → supplier : I need these terms, quote me
 *   QUOTE   supplier → buyer  : here are my terms
 *   COUNTER either → either   : revised terms, referencing inReplyTo
 *   ACCEPT  either → either   : I accept the terms in inReplyTo — THIS IS THE SETTLE
 *   WALKAWAY either → either  : clean disengagement, with a reason code
 *
 * There is no CONFIRM. A single ACCEPT settles, matching A2CN §7.4, where an acceptance is welded to
 * the offer it closes and needs no second message. Both sides still end up holding a signed record of
 * the SAME terms — the seller signed the offer, the buyer signed the ACCEPT that names it — so a
 * settled order remains provable by either party from its own half-trail alone. What the old
 * two-message commit additionally bought was a revocation window between ACCEPT and CONFIRM, in which
 * the kill switch could un-commit; that window is deliberately gone. An ACCEPT binds when it is sent,
 * so the kill switch now stops deals BEFORE the ACCEPT rather than unwinding one after it.
 */
export const NEGOTIATION_TYPES = [
  "RFQ",
  "QUOTE",
  "COUNTER",
  "ACCEPT",
  "WALKAWAY",
] as const;
export const NegotiationType = z.enum(NEGOTIATION_TYPES);
export type NegotiationType = z.infer<typeof NegotiationType>;

/** Why a negotiation ended without a settle — carried on WALKAWAY. `DONE` is the amicable one: the
 *  exchange is simply over (a settled sibling deal took the units), not a breakdown. */
export const ReasonCode = z.enum(["OUT_OF_TERMS", "BUDGET_EXHAUSTED", "TIMEOUT", "POLICY", "DONE"]);
export type ReasonCode = z.infer<typeof ReasonCode>;

/**
 * The body every negotiation message carries. `round` is monotonic per negotiationId so the full
 * turn sequence is reconstructable from either half-trail alone. `terms` is partial on an RFQ (the
 * buyer may omit price) and full on a QUOTE/COUNTER/ACCEPT.
 */
/**
 * The party-identity block A2CN carries on SessionInit (initiator) / SessionAck (responder), and which
 * §9 requires the transaction record's `organization_name` / `agent_id` to be derived from.
 *
 * Meridian has no separate session handshake — a negotiation opens straight at the RFQ — so each side
 * declares itself on the FIRST message it sends: the buyer on its RFQ, the supplier on its QUOTE. That
 * preserves the property §9 actually depends on: both values come from protocol messages BOTH parties
 * hold, so both derive them identically rather than one guessing at the other's name.
 */
export const PartyIdentity = z.object({
  organization_name: z.string().min(1),
  agent_id: z.string().min(1),
});
export type PartyIdentity = z.infer<typeof PartyIdentity>;

export const NegotiationBody = z.object({
  terms: Terms.partial().optional(),
  round: z.number().int().nonnegative(),
  reasonCode: ReasonCode.optional(),
  // Pre-agreed dispute terms referenced BEFORE commit — the hook accountability builds on.
  disputeTermsRef: z.string().optional(),
  /** Who is speaking. Sent on the first message from each side; see PartyIdentity. */
  party: PartyIdentity.optional(),
  /** WHY this price — the sender's stated reason, as A2CN §13.9.2 recommends an LLM decision carry.
   *  Free text. A receiver MUST treat it as untrusted (§13.6): sanitise before it reaches any model,
   *  and never let it change what policy permits. See agent-runtime/rationale.ts. */
  rationale: z.string().max(240).optional(),
});
export type NegotiationBody = z.infer<typeof NegotiationBody>;

/**
 * Per-VERB body requirements, enforced at the envelope boundary because that is the only place `type`
 * and `body` are both in hand.
 *
 * `NegotiationBody` has to keep `terms` partial and `reasonCode` optional, because one shape serves every
 * verb: an RFQ legitimately carries terms with no price, and an ACCEPT carries no reason. The cost of that
 * generality was that NOTHING ever required the fields a verb cannot function without. An incomplete
 * COUNTER validated, and `unitPriceUsd` missing from a price message reads downstream as absent-then-zero
 * — a zero bid that is structurally legal, signed, and recorded on both half-trails.
 *
 * So the verb decides:
 *   - QUOTE / COUNTER / ACCEPT are PRICE messages. Terms must be complete — the full `Terms` contract,
 *     cent-precise price included, not a partial.
 *   - WALKAWAY must say why. `reasonCode` is what §10 maps to an A2CN terminal state; without it the
 *     audit log records a disengagement with no cause.
 *   - RFQ stays partial by design: it is a request, and the price is the thing being asked for.
 *
 * Applied to BOTH the unsigned and signed schemas, so an incomplete message is refused on the way out
 * (before signing) and on the way in (after signature verification) rather than reaching business logic.
 */
const PRICE_VERBS: ReadonlySet<string> = new Set(["QUOTE", "COUNTER", "ACCEPT"]);

function checkBodyMatchesVerb(
  value: { type: string; body: z.infer<typeof NegotiationBody> },
  ctx: z.RefinementCtx,
): void {
  if (PRICE_VERBS.has(value.type)) {
    const verdict = Terms.safeParse(value.body.terms);
    if (!verdict.success) {
      ctx.addIssue({
        code: "custom",
        path: ["body", "terms"],
        message:
          `${value.type} requires complete terms: ` +
          verdict.error.issues.map((i) => `${i.path.join(".") || "terms"} ${i.message}`).join("; "),
      });
    }
  }
  if (value.type === "WALKAWAY" && value.body.reasonCode === undefined) {
    ctx.addIssue({
      code: "custom",
      path: ["body", "reasonCode"],
      message: "WALKAWAY requires a reasonCode (it is what §10 maps to an A2CN terminal state)",
    });
  }
}

/**
 * An UNSIGNED negotiation envelope — what a sender builds and validates before signing. Narrows the
 * base Envelope's open `type`/`body` to the negotiation contract.
 */
export const NegotiationEnvelope = Envelope.extend({
  type: NegotiationType,
  body: NegotiationBody,
}).superRefine(checkBodyMatchesVerb);
export type NegotiationEnvelope = z.infer<typeof NegotiationEnvelope>;

/**
 * A SIGNED negotiation message on the wire. A deal is committed by a single ACCEPT naming the offer
 * it closes. Both half-trails still hold a signed record of the SAME agreed terms — one side's
 * signed offer and the other's signed ACCEPT of it — which is what makes a settled order "provable by
 * either party independently" without a second message.
 */
export const NegotiationMsg = SignedEnvelope.extend({
  type: NegotiationType,
  body: NegotiationBody,
}).superRefine(checkBodyMatchesVerb);
export type NegotiationMsg = z.infer<typeof NegotiationMsg>;

/** Validate an unsigned negotiation envelope (send-side check, before signing). Throws on malformed. */
export function parseNegotiationEnvelope(value: unknown): NegotiationEnvelope {
  return NegotiationEnvelope.parse(value);
}

/** Validate a signed negotiation message (receive-side check, after signature verify). Throws. */
export function parseNegotiationMsg(value: unknown): NegotiationMsg {
  return NegotiationMsg.parse(value);
}

/** True when both fully-specified term sets describe the same deal — the check that an ACCEPT names
 *  exactly the terms the counterparty last offered, and so genuinely binds it. */
export function termsMatch(a: Terms, b: Terms): boolean {
  return (
    a.sku === b.sku &&
    a.units === b.units &&
    a.unitPriceUsd === b.unitPriceUsd &&
    a.leadTimeDays === b.leadTimeDays &&
    a.deliveryTerms === b.deliveryTerms
  );
}
