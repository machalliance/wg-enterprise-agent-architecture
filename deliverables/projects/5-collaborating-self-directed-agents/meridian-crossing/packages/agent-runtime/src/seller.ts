import {
  makeEnvelope,
  NegotiationBody,
  termsMatch,
  type Envelope,
  type Terms,
} from "@meridian/protocol";
import { IllegalTransition, NegotiationTracker, type MoveView } from "./negotiation.js";
import { sanitiseRationale, safeOutboundRationale } from "./rationale.js";
import { describeDisposition, sellerDisposition } from "./disposition.js";
import type { Trail } from "./trail.js";

/**
 * The supplier-side reasoning engine, shared mechanism driven by each supplier's PRIVATE
 * objective. The three supplier behaviours in the scenario are just different `SellerParams`:
 *   - Summit (cooperative): opens above the buyer's likely target, concedes each round → lands
 *     inside the envelope → the SETTLE.
 *   - Alpine (firm): concedes too, but a hard floor sits just OUTSIDE the buyer's envelope → the
 *     buyer can never auto-settle → the ESCALATE (mandate policy).
 *   - RidgeLine (adversarial): a jitter that oscillates around the opening and never trends down →
 *     the buyer exhausts its round budget → the WALK-AWAY.
 *
 * The engine only ever emits verbs a SUPPLIER may send under the request/reply transport: QUOTE and
 * COUNTER (replies to buyer moves), WALKAWAY, and a transport-level ACK. The buyer is the party that
 * sends ACCEPT, and an ACCEPT of the supplier's own signed offer settles on its own — the supplier
 * has nothing left to consent to, so there is no CONFIRM. Every reply is validated against the shared
 * state machine before it goes out, so an illegal buyer move is rejected at the receiver too.
 */
export interface SellerParams {
  behaviour: string;
  /** Units this supplier can actually field (from its catalog maxUnits). */
  capacityUnits: number;
  /** The lead time it offers — its own best (catalog minLeadTimeDays). */
  leadTimeDays: number;
  deliveryTerms?: Terms["deliveryTerms"];
  openingPriceUsd: number;
  /** Will not sell below this. Set outside the buyer's envelope to force escalate/walk-away. */
  floorPriceUsd: number;
  /** Fraction shaved off the standing price each round, toward the floor. */
  concessionRate: number;
  /** Adversarial oscillation amplitude — non-zero makes the price wander, never trend down. */
  jitterUsd?: number;
  /** This organization's display name, declared on its QUOTE (see the §9 party block). Defaults to the
   *  DID's own label. */
  orgName?: string;
}

/**
 * The LLM-driven supplier turn. The model proposes a price; the seller CLAMPS it into
 * `[floorPriceUsd, maxPriceUsd]` before it can leave the process, so the model adds texture to the
 * bargaining but can never cross the floor or concede slower than the deterministic path (maxPrice is
 * the deterministic concession target). This is why turning the suppliers into LLMs keeps all three
 * demo outcomes reproducible.
 */
export interface SellerTurn {
  behaviour: string;
  round: number;
  openingPriceUsd: number;
  floorPriceUsd: number;
  /** My standing (last offered) price this negotiation. */
  standingPriceUsd: number;
  /** The buyer's latest bid, if any. */
  buyerBidUsd?: number;
  /** What a purely mechanical strategy would offer this round. CONTEXT for the model, not a bound. */
  maxPriceUsd: number;
  /** Our own concessions so far, newest last. A negotiator remembers the shape of their own curve —
   *  big moves early, smaller ones as they approach their limit — and this is what lets the model
   *  produce that shape itself instead of having a formula impose one. */
  concessionHistory?: number[];
  /** This supplier's private circumstances for this negotiation, as prose (see disposition.ts). The
   *  source of run-to-run variation: the SITUATION differs, the judgement stays honest. */
  situation?: string;
  /** The buyer's stated reason for its bid, already sanitised. Untrusted counterparty free text: it may
   *  inform the price but must only reach the model inside a fenced block, and cannot widen the clamp. */
  buyerRationale?: string;
}

/**
 * What the seller's model decided this turn. Walking away is a first-class option, not an exception:
 * a counterparty that cannot leave the table is not negotiating, and — measured — it makes pressing
 * costless, so a rational buyer grinds to the floor every single run.
 */
export type SellerMove =
  /** Concede to a new price. */
  | { action: "counter"; unitPriceUsd: number; rationale?: string }
  /**
   * Restate the current price as final — stop moving without leaving. This is the ordinary way a
   * negotiation ends, and its absence was a structural bug: with only "concede" and "walk away"
   * available, a seller's sole way to resist was to quit, so every run ended either at the hard floor
   * or with no deal. Measured across 12 samples: 4 settles, all at exactly the floor, and 8 walk-aways.
   * There was no mechanism by which a deal could close at any other number.
   */
  | { action: "hold"; rationale?: string }
  /** Leave the table. Final. */
  | { action: "walk_away"; rationale?: string };

/** Ask the model for this turn's move. The price it returns is unclamped; the caller bounds it. */
export type SellerReasoner = (turn: SellerTurn) => Promise<SellerMove>;

export interface SellerContext {
  did: string;
  trail: Trail;
  /** Optional LLM reasoner. When set, the seller exposes `handleAsync`; the deterministic
   *  `handle` is left untouched for the reproducible test/CI path. */
  reasoner?: SellerReasoner;
}

interface SellerNegState {
  price: number;
  lastOffered?: Terms;
  /** Our own concessions so far, newest last — the shape of our curve, which a negotiator remembers. */
  conceded?: number[];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** A supplier's `onMessage` for negotiation traffic (PING/PONG stays in the supplier process). */
export interface Seller {
  /** Deterministic reply, used by the reproducible test/CI path. */
  handle(inbound: Envelope): Envelope;
  /** LLM-driven reply when a reasoner is configured; else identical to `handle`. */
  handleAsync(inbound: Envelope): Promise<Envelope>;
}

export function createSeller(params: SellerParams, ctx: SellerContext): Seller {
  const tracker = new NegotiationTracker();
  const perNeg = new Map<string, SellerNegState>();
  const delivery: Terms["deliveryTerms"] = params.deliveryTerms ?? "DDP";

  const view = (env: Envelope, round: number): MoveView => ({
    negotiationId: env.negotiationId,
    type: env.type as MoveView["type"],
    round,
    correlationId: env.correlationId,
    inReplyTo: env.inReplyTo,
  });

  function reply(
    inbound: Envelope,
    type: "QUOTE" | "COUNTER" | "ACK" | "WALKAWAY",
    body: NegotiationBody,
    /** Whether to advance our state machine for this outbound. False for the WALKAWAY acknowledgement:
     *  the buyer's inbound WALKAWAY already drove us terminal, so re-admitting the mirror would be an
     *  illegal move. The ack is a courtesy reply, not a new turn — so it must NOT re-admit (this is
     *  what lets both half-trails record the clean close instead of the supplier throwing). */
    admit = true,
  ): Envelope {
    const out = makeEnvelope({
      type,
      from: ctx.did,
      to: inbound.from,
      negotiationId: inbound.negotiationId,
      inReplyTo: inbound.correlationId,
      body,
    });
    // Advance our OWN copy of the state machine before the reply leaves the process.
    if (admit) tracker.admit(view(out, body.round));
    ctx.trail.append({
      direction: "sent",
      negotiationId: out.negotiationId,
      correlationId: out.correlationId,
      inReplyTo: out.inReplyTo,
      to: out.to,
      type,
      round: body.round,
      terms: body.terms,
      reasonCode: body.reasonCode,
    });
    return out;
  }

  /** The deterministic next concession price for a COUNTER — the anchor the LLM path clamps against. */
  function deterministicBase(inbound: Envelope, replyRound: number): number {
    const st = perNeg.get(inbound.negotiationId) ?? { price: params.openingPriceUsd };
    if (params.jitterUsd) {
      const swing = params.jitterUsd * (replyRound % 2 === 0 ? 1 : -1);
      return round2(clamp(params.openingPriceUsd + swing, params.floorPriceUsd, params.openingPriceUsd + params.jitterUsd));
    }
    return round2(Math.max(params.floorPriceUsd, st.price * (1 - params.concessionRate)));
  }

  /**
   * Does this ACCEPT bind me? Only an ACCEPT of the EXACT terms I last offered does: I already signed
   * that offer, so there is nothing further to consent to. Anything else is neither a counter-proposal
   * nor a walk-away — it is an illegal move.
   */
  function acceptBindsMe(accepted: Partial<Terms> | undefined, mine: Terms | undefined): boolean {
    return Boolean(
      accepted &&
        mine &&
        accepted.sku !== undefined &&
        termsMatch(accepted as Terms, mine) &&
        (accepted.unitPriceUsd ?? 0) >= params.floorPriceUsd,
    );
  }

  /**
   * Receiver-side gate: admit an inbound buyer move, rejecting anything that is not a legal successor —
   * visibly, on the trail. Shared by `process` and the LLM walk-away path so a move can never be
   * answered without first passing the same check.
   */
  function admitInbound(inbound: Envelope, body: { round: number; terms?: Partial<Terms> }): void {
    // An ACCEPT of terms I never offered must be refused BEFORE it is admitted. Admitting first moved
    // the tracker to SETTLED and only then threw, so a rejected ACCEPT still left this negotiation
    // recorded as a closed deal — with no reply signed and nothing on the buyer's side to match it.
    if (inbound.type === "ACCEPT" && !acceptBindsMe(body.terms, perNeg.get(inbound.negotiationId)?.lastOffered)) {
      ctx.trail.append({
        event: "rejected-accept",
        negotiationId: inbound.negotiationId,
        correlationId: inbound.correlationId,
        reason: "ACCEPT does not match the terms I last offered (or is below my floor)",
      });
      throw new IllegalTransition(
        inbound.negotiationId,
        tracker.state(inbound.negotiationId),
        "ACCEPT",
        "ACCEPT does not match the terms I last offered",
      );
    }
    try {
      tracker.admit(view(inbound, body.round));
    } catch (err) {
      if (err instanceof IllegalTransition) {
        ctx.trail.append({
          event: "rejected-transition",
          negotiationId: inbound.negotiationId,
          correlationId: inbound.correlationId,
          type: inbound.type,
          reason: err.detail,
        });
      }
      throw err;
    }
    ctx.trail.append({
      direction: "received",
      negotiationId: inbound.negotiationId,
      correlationId: inbound.correlationId,
      from: inbound.from,
      type: inbound.type,
      round: body.round,
      terms: body.terms,
    });
  }

  /**
   * The full deterministic reply logic. `counterOverride` lets `handleAsync` substitute an
   * LLM-chosen — but already-clamped — concession price for a COUNTER; everything else (the state
   * machine, floor checks, the ACCEPT/WALKAWAY branches) is identical to the deterministic path.
   */
  function process(inbound: Envelope, counterOverride?: number, holdFirm = false): Envelope {
      const body = NegotiationBody.parse(inbound.body);
      admitInbound(inbound, body);

      const replyRound = body.round + 1;
      const st = perNeg.get(inbound.negotiationId) ?? { price: params.openingPriceUsd };

      switch (inbound.type) {
        case "RFQ": {
          const asked = body.terms ?? {};
          const quote: Terms = {
            sku: asked.sku ?? "UNKNOWN-SKU",
            units: Math.min(params.capacityUnits, asked.units ?? params.capacityUnits),
            unitPriceUsd: round2(params.openingPriceUsd),
            leadTimeDays: params.leadTimeDays,
            deliveryTerms: delivery,
          };
          perNeg.set(inbound.negotiationId, { price: quote.unitPriceUsd, lastOffered: quote });
          // Declare who we are on our first message — Meridian's stand-in for A2CN's SessionAck, and
          // the source §9 requires for `parties.responder.organization_name` / `agent_id`.
          return reply(inbound, "QUOTE", {
            round: replyRound,
            terms: quote,
            party: { organization_name: params.orgName ?? ctx.did.replace(/^did:web:/, ""), agent_id: ctx.did },
          });
        }

        case "COUNTER": {
          const buyerTerms = body.terms;
          const buyerBid = buyerTerms?.unitPriceUsd ?? 0;
          // Where I'm willing to move to this round: an LLM-chosen price (already clamped by the
          // caller into [floor, deterministic base]) if present, else the deterministic concession.
          const base = counterOverride ?? deterministicBase(inbound, replyRound);
          // If the buyer already meets my next position, close the gap by countering AT their bid
          // (never below floor) — a signal for them to ACCEPT. Otherwise concede toward the floor.
          //
          // Deliberately NOT also capped at `st.price`, though the LLM path below clamps to it under
          // "a seller cannot re-raise mid-negotiation". That cap can only ever bind when the buyer bids
          // ABOVE the standing offer, and in that case countering at the buyer's own number is the
          // behaviour `seller.test.ts` fixes as an invariant: never counter below the money already on
          // the table. Echoing a buyer's overbid is not the seller unilaterally re-raising, and taking
          // it is what a real seller does. The two rules only ever meet here, and this one wins.
          //
          // EXCEPT on a hold. `holdFirm` means the reasoner chose to restate the standing price as final,
          // and this branch quietly overrode that: with `buyerBid >= base` the seller replied at the
          // buyer's number instead, which for an overbid is ABOVE its own standing offer — the very
          // re-raise the caller's clamp to `current` had just prevented. Echoing an overbid is right when
          // the seller is still moving; a hold is the statement that it is not.
          const replyPrice = !holdFirm && buyerBid >= base ? Math.max(params.floorPriceUsd, buyerBid) : base;
          const offered: Terms = {
            sku: buyerTerms?.sku ?? st.lastOffered?.sku ?? "UNKNOWN-SKU",
            units: buyerTerms?.units ?? st.lastOffered?.units ?? params.capacityUnits,
            unitPriceUsd: round2(replyPrice),
            leadTimeDays: st.lastOffered?.leadTimeDays ?? params.leadTimeDays,
            deliveryTerms: st.lastOffered?.deliveryTerms ?? delivery,
          };
          perNeg.set(inbound.negotiationId, {
            price: offered.unitPriceUsd,
            lastOffered: offered,
            conceded: [...(st.conceded ?? []), round2(Math.max(0, st.price - offered.unitPriceUsd))],
          });
          return reply(inbound, "COUNTER", {
            round: replyRound,
            terms: offered,
            // Public facts only: our own movement and the buyer's bid. Never the floor.
            rationale:
              buyerBid >= base
                ? `meeting your $${buyerBid}/u`
                : `moving to $${offered.unitPriceUsd}/u from $${st.price}/u`,
          });
        }

        case "ACCEPT":
          // Getting here means `admitInbound` already established that this ACCEPT names the exact
          // terms I last offered, and so BINDS me — I signed that offer, there is nothing further to
          // consent to and no CONFIRM to send. All that goes back is a transport-level ACK, which is
          // not a negotiation turn and is never recorded on a half-trail: the settlement evidence is
          // the buyer's signed ACCEPT plus my own signed offer that it names.
          return reply(inbound, "ACK", { round: replyRound }, false);

        case "WALKAWAY":
          // Buyer disengaged; our machine is already terminal from admitting the inbound WALKAWAY.
          // Acknowledge with a mirror WALKAWAY but do NOT re-admit it (that would be an illegal second
          // terminal move) — so both half-trails record the clean close instead of the supplier throwing.
          return reply(inbound, "WALKAWAY", { round: replyRound, reasonCode: "DONE" }, false);

        default:
          throw new IllegalTransition(
            inbound.negotiationId,
            tracker.state(inbound.negotiationId),
            inbound.type as MoveView["type"],
            "supplier received a verb it cannot answer",
          );
      }
  }

  return {
    handle(inbound: Envelope): Envelope {
      return process(inbound);
    },
    async handleAsync(inbound: Envelope): Promise<Envelope> {
      // Only a COUNTER has a price to reason about, and only when a reasoner is configured. For every
      // other verb (and the adversarial jitter path) the deterministic reply stands — the model never
      // gets to alter the state machine, only to pick where inside [floor, deterministic base] to land.
      if (!ctx.reasoner || inbound.type !== "COUNTER" || params.jitterUsd) return process(inbound);
      const body = NegotiationBody.parse(inbound.body);
      const replyRound = body.round + 1;
      const st = perNeg.get(inbound.negotiationId) ?? { price: params.openingPriceUsd };
      const detBase = deterministicBase(inbound, replyRound);
      let move: SellerMove;
      try {
        move = await ctx.reasoner({
          behaviour: params.behaviour,
          round: replyRound,
          openingPriceUsd: params.openingPriceUsd,
          floorPriceUsd: params.floorPriceUsd,
          standingPriceUsd: st.price,
          buyerBidUsd: body.terms?.unitPriceUsd,
          // The deterministic concession, passed as CONTEXT ("what a mechanical strategy would do"),
          // NOT as a bound. It used to be the clamp ceiling, which meant arithmetic chose the price and
          // the model only picked inside a range already decided for it — every run pinned as a result.
          maxPriceUsd: detBase,
          concessionHistory: [...(st.conceded ?? [])],
          // Private circumstances for THIS negotiation. Same seed → same disposition; a fresh session id
          // → a different one. This is where run-to-run variation comes from, and it is a situation to
          // weigh rather than a rule that fires (see disposition.ts).
          situation: describeDisposition(sellerDisposition(inbound.negotiationId, ctx.did)),
          // Sanitised at the codec boundary; fenced inside the prompt. See rationale.ts.
          buyerRationale: sanitiseRationale(body.rationale),
        });
      } catch {
        // Gateway hiccup — fall back to the deterministic concession for this turn. Scoped to the
        // reasoner call alone: it used to wrap the whole branch below, so an IllegalTransition raised
        // while admitting the buyer's move was swallowed as if the model had been unreachable.
        return process(inbound);
      }

      // The supplier can END the negotiation. That is a real option a seller owns, and its absence is
      // what made pressing costless for the buyer: with no risk of losing the deal, grinding to the
      // floor was simply correct, and five identical runs proved it.
      if (move.action === "walk_away") {
        // Admit the buyer's inbound move through the SAME gate process() uses, before anything is
        // emitted. Admitting it in a swallow-everything try meant an illegal inbound move still drew a
        // signed WALKAWAY — a terminal message answering a turn this agent had refused to accept.
        admitInbound(inbound, body);
        // The ONLY path that puts the seller model's own free text on the wire — COUNTER and HOLD both
        // rebuild their rationale from public facts in `process()`. So it is the only one that can leak
        // the floor, and `sanitiseRationale` does not check for that: it strips control characters, not
        // secrets. The system prompt says "Never name your floor", which is a request to a language
        // model, not a guarantee. Gate it the way the buyer gates its reservation price instead.
        const safeReason = safeOutboundRationale(move.rationale, [String(params.floorPriceUsd)]);
        ctx.trail.append({
          event: "seller-walked",
          negotiationId: inbound.negotiationId,
          reason: safeReason ?? "no longer worth continuing",
        });
        return reply(inbound, "WALKAWAY", {
          round: replyRound,
          reasonCode: "OUT_OF_TERMS",
          rationale: safeReason,
        });
      }
      // The only bounds are the FUNDAMENTALS: never below this supplier's own floor, and never above
      // its standing offer (a seller cannot re-raise mid-negotiation). How much to concede, and when
      // to slow down, is the model's judgement — that is what negotiating is. It is deliberately free
      // to concede badly; the prompt frames the floor as a failure, and the floor is the hard stop.
      // HOLD: restate the standing price as final. Not a stall — the buyer can still accept, and
      // "this is my best price" is how most negotiations actually end. Without this the seller could
      // only concede or quit, so a deal could never close anywhere except the hard floor.
      // Re-read the standing price AFTER the reasoner await. `st` was captured before an async call
      // that can take seconds (an LLM turn), and `perNeg` is shared across every negotiation this
      // seller is running — a concurrent round on the same negotiationId may have moved the price down
      // in the meantime. Clamping against the stale upper bound would let this reply exceed the price
      // the supplier has since published, which is the re-raise the clamp exists to prevent.
      const current = perNeg.get(inbound.negotiationId)?.price ?? st.price;
      const holdFirm = move.action === "hold";
      // Narrowed inline rather than through `holdFirm`, which TS cannot use to discriminate the union.
      const chosen = move.action === "hold" ? current : move.unitPriceUsd;
      const clamped = round2(clamp(chosen, params.floorPriceUsd, current));
      // `holdFirm` is threaded through so `process` does not substitute the buyer's bid for the price we
      // just decided to restate — see the replyPrice comment there.
      return process(inbound, clamped, holdFirm);
    },
  };
}
