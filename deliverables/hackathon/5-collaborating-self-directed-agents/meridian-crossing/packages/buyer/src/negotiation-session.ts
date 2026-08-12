import {
  NegotiationTracker,
  looksLikeInjection,
  sanitiseRationale,
  type HalfTrail,
  type MoveView,
  type Signer,
  type Trail,
  type WireProfile,
} from "@meridian/agent-runtime";
import {
  makeEnvelope,
  parseNegotiationEnvelope,
  parseNegotiationMsg,
  type CapabilityAd,
  type Envelope,
  type NegotiationMsg,
  type SignedEnvelope,
  type Terms,
} from "@meridian/protocol";
import type { NegotiationChannel } from "./negotiate.js";
import type { QuoteBoard } from "./quote-board.js";

/**
 * One negotiation's MESSAGE LAYER: validate, admit to the state machine, sign, record, send, and record
 * the reply. Everything that happens to a message and nothing about what to say next.
 *
 * Split out of `driveNegotiation`, which had grown to hold the whole negotiation in one function —
 * transport, trail, half-trail, reputation heuristics, budget, the commit barrier, human approval,
 * settlement and the §9 record — as four closures over a dozen mutable locals. The judgment layer that
 * remains there is the interesting part and it was hard to read past the plumbing.
 *
 * Two pieces of state live here rather than in the caller because they are properties of the LAST
 * EXCHANGE, not of the negotiation's strategy: the counterparty's raw signed bytes (which A2CN §14.1(3)
 * binds an ApprovalReceipt to) and its sanitised rationale. They were assigned by a closure and read
 * from the enclosing scope, which is the same relationship, unnamed.
 */
export interface SessionDeps {
  negotiationId: string;
  buyerDid: string;
  ad: CapabilityAd;
  signer: Signer;
  channel: NegotiationChannel;
  /** The profile the buyer ENCODES its own outbound with. Its SENT half-trail records carry this
   *  profile's bytes — a valid proof of the buyer's authorship regardless of what the supplier speaks,
   *  which is why a mixed-profile pair still derives one shared transaction record. */
  outboundProfile: WireProfile;
  trail: Trail;
  halfTrail?: HalfTrail;
  /** Sink for every outbound signed envelope — the no-leak lint reads exactly what went on the wire. */
  onOutbound?: (signed: SignedEnvelope) => void;
  /** Meridian's own desk. Each supplier's standing offer is posted here every round so the sibling
   *  negotiations can press against a live competing price. */
  quoteBoard?: QuoteBoard;
}

function moveView(env: Envelope, round: number): MoveView {
  return {
    negotiationId: env.negotiationId,
    type: env.type as MoveView["type"],
    round,
    correlationId: env.correlationId,
    inReplyTo: env.inReplyTo,
  };
}

export class NegotiationSession {
  readonly #d: SessionDeps;
  readonly #tracker = new NegotiationTracker();

  /** The raw signed bytes of the counterparty's standing offer. A2CN §14.1(3) binds an ApprovalReceipt
   *  to the PAUSED ACT's hash, so the operator approves one specific offer rather than "this deal". */
  lastOfferRaw: unknown;
  /** The counterparty's stated reason for its price, sanitised. Adversary-authored free text. */
  counterpartyRationale: string | undefined;

  constructor(deps: SessionDeps) {
    this.#d = deps;
  }

  /** Append the buyer's own signed SENT record for an outbound negotiation message. */
  recordSent(signed: SignedEnvelope): void {
    const { halfTrail, outboundProfile, signer, ad } = this.#d;
    halfTrail?.record({
      direction: "SENT",
      envelope: signed,
      wirePayload: outboundProfile.encode(signed, signer),
      wireProfile: outboundProfile.name,
      counterpartyDid: ad.did,
    });
  }

  /** Validate, admit, sign, record and emit an outbound envelope. Returns the signed form. */
  #emit(env: Envelope, round: number, extra: Record<string, unknown> = {}): SignedEnvelope {
    const { trail, signer, onOutbound } = this.#d;
    parseNegotiationEnvelope(env); // send-side zod check
    this.#tracker.admit(moveView(env, round));
    const body = env.body as { terms?: Terms; reasonCode?: string };
    trail.append({
      direction: "sent",
      negotiationId: env.negotiationId,
      correlationId: env.correlationId,
      inReplyTo: env.inReplyTo,
      to: env.to,
      type: env.type,
      round,
      terms: body.terms,
      reasonCode: body.reasonCode,
      ...extra,
    });
    const signed = signer.sign(env);
    this.recordSent(signed);
    onOutbound?.(signed);
    return signed;
  }

  /** Send one negotiation move and return the supplier's verified, parsed reply. */
  async exchange(env: Envelope, round: number): Promise<NegotiationMsg> {
    const { trail, halfTrail, quoteBoard, ad } = this.#d;
    const signed = this.#emit(env, round);
    const { env: rawReply, raw, wireProfile } = await this.#d.channel.send(signed);
    const reply = parseNegotiationMsg(rawReply);
    this.#tracker.admit(moveView(reply, reply.body.round));
    this.lastOfferRaw = raw;
    // Untrusted counterparty free text. Sanitised here so nothing downstream holds the raw string, and
    // flagged on the trail when it reads like an instruction rather than a reason (§13.6's logging clause).
    this.counterpartyRationale = sanitiseRationale(reply.body.rationale);
    if (this.counterpartyRationale && looksLikeInjection(this.counterpartyRationale)) {
      trail.append({
        event: "suspicious-rationale",
        negotiationId: reply.negotiationId,
        from: reply.from,
        rationale: this.counterpartyRationale,
        note: "counterparty rationale reads like an injected instruction; passed to the reasoner fenced and cannot change policy",
      });
    }
    // Record the counterparty's raw signed reply as the buyer's non-repudiation artifact.
    halfTrail?.record({
      direction: "RECEIVED",
      envelope: reply,
      wirePayload: raw,
      wireProfile,
      counterpartyDid: reply.from,
    });
    trail.append({
      direction: "received",
      negotiationId: reply.negotiationId,
      correlationId: reply.correlationId,
      inReplyTo: reply.inReplyTo,
      from: reply.from,
      type: reply.type,
      round: reply.body.round,
      terms: reply.body.terms,
      reasonCode: reply.body.reasonCode,
    });
    // Publish this supplier's standing offer to Meridian's own desk, so the sibling negotiations can see
    // what it is asking while they still have rounds left to use it.
    if (reply.body.terms) quoteBoard?.post(ad.did, ad.agentName, reply.body.terms);
    return reply;
  }

  /**
   * Send the settling ACCEPT and return the supplier's raw reply.
   *
   * Kept separate from `exchange` because the reply to an ACCEPT is an ACK — a transport
   * acknowledgement, not a negotiation verb — so it must not be pushed through `parseNegotiationMsg`,
   * admitted to the state machine (the ACCEPT already drove us to SETTLED), or recorded on the
   * half-trail. Only the ACCEPT is recorded, which is correct: the ACCEPT plus the supplier's signed
   * offer that it names is the whole settlement evidence, on both sides.
   *
   * `bindBeforeSend` runs as the LAST STATEMENT before the bytes leave, and the caller passes the
   * reservation bind. That placement is load-bearing in BOTH directions and is why this is a callback
   * rather than something the caller does before calling:
   *
   *   - It must PRECEDE the send, because the send is the binding moment ("THE ACCEPT IS THE SETTLE").
   *     Left pending across that await, a kill switch tripping mid-flight released the hold for a deal
   *     the buyer was already committed to.
   *   - It must not precede it by MORE than this. Run before the zod check, the tracker admit, the trail
   *     write, the signing or the outbound sink, a throw in any of them committed ledger headroom for an
   *     ACCEPT that never reached the wire and never would — money reported as spent against a deal the
   *     supplier cannot possibly hold. Those failures are local and knowable, unlike a send that fails
   *     mid-flight, so they are the one window where releasing is correct.
   */
  async exchangeSettling(env: Envelope, round: number, bindBeforeSend: () => void): Promise<Envelope> {
    const { trail } = this.#d;
    // `#emit` admits the ACCEPT → SETTLED locally, before it goes out.
    const signed = this.#emit(env, round);
    bindBeforeSend();
    const { env: ack } = await this.#d.channel.send(signed);
    trail.append({
      direction: "received",
      negotiationId: ack.negotiationId,
      correlationId: ack.correlationId,
      inReplyTo: ack.inReplyTo,
      from: ack.from,
      type: ack.type,
    });
    return ack;
  }

  /** Send a WALKAWAY on the wire, best-effort — a supplier already terminal may not reply cleanly. */
  async walkaway(reasonCode: string, round: number, replyCorrelationId: string): Promise<void> {
    const { negotiationId, buyerDid, ad, trail, halfTrail, signer, onOutbound } = this.#d;
    const env = makeEnvelope({
      type: "WALKAWAY",
      from: buyerDid,
      to: ad.did,
      negotiationId,
      inReplyTo: replyCorrelationId,
      body: { round, reasonCode },
    });
    parseNegotiationEnvelope(env);
    try {
      this.#tracker.admit(moveView(env, round));
    } catch {
      /* our machine may already be terminal; the walk-away still stands */
    }
    trail.append({
      direction: "sent",
      negotiationId,
      correlationId: env.correlationId,
      inReplyTo: env.inReplyTo,
      to: env.to,
      type: "WALKAWAY",
      round,
      reasonCode,
    });
    // NOT `#emit`: the tracker admit above is deliberately tolerant of an already-terminal machine, and
    // the trail entry omits `terms`. Sharing the helper would have to reintroduce both differences as
    // flags, which is more coupling than the six duplicated lines it would save.
    const signed = signer.sign(env);
    this.recordSent(signed);
    onOutbound?.(signed);
    try {
      // Record the supplier's mirror WALKAWAY too, so both half-trails stay paired (every message a
      // SENT on one side and a RECEIVED on the other) on a walked negotiation.
      const { env: mirror, raw, wireProfile } = await this.#d.channel.send(signed);
      halfTrail?.record({
        direction: "RECEIVED",
        envelope: mirror,
        wirePayload: raw,
        wireProfile,
        counterpartyDid: mirror.from,
      });
    } catch {
      /* supplier already closed — ignore */
    }
  }
}
