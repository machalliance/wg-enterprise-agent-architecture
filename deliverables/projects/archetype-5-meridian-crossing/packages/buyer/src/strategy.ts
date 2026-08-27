import { roundToCents, type ReasonCode, type Terms, type TrustLevel } from "@meridian/protocol";
import { requestedUnits, type Mandate } from "./mandate.js";
import { classify, isSettleTier, type Tier } from "./classify.js";
import type { RivalQuote } from "./quote-board.js";

/**
 * The buyer's bounded reasoner. The negotiation contract asked "settle, escalate, or walk away?"; the
 * mandate answers it with its tiers instead of a single reservation flag. On each supplier turn it classifies the
 * standing offer and proposes the next legal move. The COMMERCIAL judgment lives here; protocol
 * legality is guaranteed elsewhere (the state machine + zod contract).
 *
 * The four terminal branches the chapter names fall out of the tier the offer lands in:
 *   - AUTONOMOUS_SETTLE / NOTIFY_ON_SETTLE → ACCEPT   (→ settle; notify handled at commit time)
 *   - not settleable, round/time budget remains → COUNTER (climb toward maxBid, never past it)
 *   - not settleable, budget spent, inside reservation → ESCALATE (hold for approval — the alpine path)
 *   - not settleable, budget spent, above reservation → WALKAWAY (BUDGET_EXHAUSTED — the ridge path)
 *
 * What this reasoner may bid is capped at `maxBidUsd`, strictly below the reservation, so the sequence
 * of bids a counterparty observes can never be used to triangulate the buyer's bound.
 */
export type Decision =
  | { action: "ACCEPT"; terms: Terms; tier: Tier; rationale: string }
  | { action: "COUNTER"; terms: Terms; rationale: string }
  | { action: "ESCALATE"; terms: Terms; tier: Tier; rationale: string }
  | { action: "WALKAWAY"; reasonCode: ReasonCode; rationale: string };

export interface DecisionContext {
  /** The supplier's standing offer this turn. */
  offer: Terms;
  /** How many counters the buyer has already sent in this negotiation. */
  countersSent: number;
  /** The very first price the supplier quoted — the baseline for measuring concession. */
  firstOfferPriceUsd: number;
  /** The counterparty's trust level — an input to the tier classification. */
  trust: TrustLevel;
  /** True once the round budget is spent OR the wall-clock budget is exceeded. The gate both reasoners
   *  consult to decide whether another COUNTER is still permitted. */
  budgetExhausted: boolean;
  /** WHICH half of that budget ran out, kept separate because they are different terminal facts and §10
   *  maps them to different A2CN terminals. Optional so a caller that only knows the combined gate still
   *  type-checks; `decide` then falls back to reporting round exhaustion, as it always did. */
  roundsExhausted?: boolean;
  wallClockExpired?: boolean;
  /** The buyer's OWN previous bid, if it has countered yet. "How far apart are we" is the fact a
   *  negotiator actually reasons from, and its absence is part of why an LLM buyer falls back to
   *  echoing a constant. Public by construction — it was on the wire the moment it was sent. */
  lastBidUsd?: number;
  /** How much the supplier moved THIS round (previous offer − current offer). Undefined on the first
   *  offer, when there is no movement to measure. */
  lastConcessionUsd?: number;
  /** Every movement the supplier has made, newest last. The SHAPE is the information a negotiator reads:
   *  $6, $4, $2, $0.50 says "nearly done"; $2, $2, $2 says "there is more here". Given as history rather
   *  than reduced to a threshold, because judging it is the model's job. */
  concessionHistory?: number[];
  /** The counterparty's stated reason for its price, already SANITISED (see sanitiseRationale). Free
   *  text authored by an adversary: it may inform the decision but must only ever reach a model inside
   *  a delimited untrusted block, and it can never change what the mandate permits. */
  counterpartyRationale?: string;
  /** How many suppliers Meridian is negotiating with in parallel for this shortfall, including this one
   *  (see index.ts — `Promise.allSettled` over every candidate that cleared the trust gate, with a commit
   *  coordinator picking the winner). The buyer's BATNA, and the model needs it: told nothing, it assumes
   *  each negotiation is its only shot and pays near its ceiling rather than lose a deal it cannot lose.
   *  Measured — 7 of 20 runs settled at $93 against a $94 ceiling before this was passed through. */
  parallelNegotiations?: number;
  /** What Meridian's OTHER suppliers are currently quoting, cheapest first — see QuoteBoard for why the
   *  buyer comparing its own received quotes is not the cross-org read we deleted. This is the concrete
   *  form of the BATNA: `parallelNegotiations` says an alternative exists, this says what it costs. */
  rivalQuotes?: readonly RivalQuote[];
}

/** True when the standing offer is committable under the mandate (either settle tier). */
export function committable(mandate: Mandate, offer: Terms, trust: TrustLevel): boolean {
  return isSettleTier(classify(mandate, offer, trust));
}

/**
 * The price the buyer bids next — RECIPROCAL, not a ladder.
 *
 * The old rule was `target + (n-1) * step`: a staircase indexed by round number that ignored the
 * counterparty completely. Nobody negotiates that way. This moves by roughly what the supplier just
 * moved — match a concession, stonewall a stonewaller — which is the oldest rule in bargaining and
 * makes the buyer's behaviour a response rather than a schedule.
 *
 * The first counter opens at target. After that: last bid plus the supplier's own last concession,
 * floored at `counterStepUsd` (the smallest move worth sending) and capped at `maxBidUsd`.
 */
export function counterBid(mandate: Mandate, ctx: Pick<DecisionContext, "lastBidUsd" | "lastConcessionUsd">): number {
  if (ctx.lastBidUsd === undefined) return mandate.targetUnitPriceUsd;
  const reciprocal = Math.max(mandate.counterStepUsd, ctx.lastConcessionUsd ?? 0);
  return Math.min(mandate.maxBidUsd, ctx.lastBidUsd + reciprocal);
}

/**
 * Has the supplier stopped moving enough to be worth another round?
 *
 * A rule of thumb for the DETERMINISTIC reasoner only — the offline/CI path that has no model to ask.
 * When an LLM is driving, this is not consulted: whether a counterparty is still worth pressing is a
 * judgement, and the movement history goes into the prompt so the model can make it. Encoding it as a
 * threshold and applying it to both paths is what made the LLM runs identical.
 *
 * `budget.maxRounds` sits behind both as a runaway guard, not as a stopping rule.
 */
export function bargainingHasStalled(mandate: Mandate, ctx: DecisionContext): boolean {
  return ctx.lastConcessionUsd !== undefined && ctx.lastConcessionUsd < mandate.minConcessionPerRoundUsd;
}

/**
 * The price that may actually go on the wire. Two independent ceilings, both of which must hold:
 *
 *   - `maxBidUsd` — the PRIVATE bound, so the observed bid sequence can never triangulate the reservation.
 *   - the seller's own standing offer — a buyer that bids ABOVE the price already on the table is
 *     negotiating against itself and handing the counterparty free margin. Nothing upstream enforces
 *     this: the mandate cap is one-sided (it only stops bids that are too HIGH for the buyer's bound,
 *     and a bid above the standing offer is comfortably inside that bound), and the tier classifier
 *     runs on the SELLER's terms, not the buyer's. So it has to be enforced here.
 *
 * Applied by BOTH reasoners. It matters most for the LLM one, which will otherwise happily propose a
 * number worse than what it has already been offered, but the deterministic ramp can cross a conceding
 * seller too whenever the standing offer is un-committable for a non-price reason (e.g. lead time).
 */
export function boundedBid(mandate: Mandate, offer: Terms, proposed: number): number {
  // Rounded to whole cents here, at the one point BOTH reasoners pass through. `proposed` is a raw
  // number — a ramp step or, more to the point, whatever an LLM emitted — and a sub-cent bid cannot
  // survive the a2cn round trip, so the two halves of the deal would derive different §9 record hashes.
  // Rounding at the moment the price is CHOSEN means the buyer never offers one; `Terms` rejects any
  // that arrive from outside (see `isCentPrecise`).
  return roundToCents(Math.min(mandate.maxBidUsd, proposed, offer.unitPriceUsd));
}

/** A buyer counter mirrors the supplier's non-price terms and substitutes the buyer's bid price. Units
 *  are capped at `maxUnitsPerDeal` (while never asking for more than the shortfall) so an oversized
 *  shortfall is filled through valid split procurement rather than one deal that breaches the per-deal cap. */
export function counterTerms(mandate: Mandate, offer: Terms, bidPriceUsd: number): Terms {
  return {
    sku: offer.sku,
    // The same helper `classify` grades against — see `requestedUnits`. Inlined here as
    // `Math.min(...)`, this expression and classify's quantity check drifted apart and made every
    // split-procurement leg unsettleable.
    units: requestedUnits(mandate),
    unitPriceUsd: bidPriceUsd,
    leadTimeDays: offer.leadTimeDays,
    deliveryTerms: offer.deliveryTerms,
  };
}

export function decide(mandate: Mandate, ctx: DecisionContext): Decision {
  const { offer, trust } = ctx;
  const tier = classify(mandate, offer, trust);

  // Settleable as-is → ACCEPT. Whether it is autonomous or notify-on-settle rides on the tier; the
  // notification (and the cross-deal cap / suspend-on-disconnect gates) are applied at commit time.
  if (isSettleTier(tier)) {
    return {
      action: "ACCEPT",
      terms: offer,
      tier,
      rationale:
        `offer $${offer.unitPriceUsd}/u, ${offer.leadTimeDays}d, ${offer.units}u classifies ${tier}`,
    };
  }

  // Keep bargaining while the supplier is still moving AND the runaway guard has not tripped. The
  // stalled check is the substantive one: it is why a negotiation ends.
  if (!ctx.budgetExhausted && !bargainingHasStalled(mandate, ctx)) {
    const bid = boundedBid(mandate, offer, counterBid(mandate, ctx));
    return {
      action: "COUNTER",
      terms: counterTerms(mandate, offer, bid),
      rationale:
        `offer $${offer.unitPriceUsd}/u not yet committable (${tier}); they moved ` +
        `$${(ctx.lastConcessionUsd ?? 0).toFixed(2)}/u so bidding $${bid}/u`,
    };
  }

  // Bargaining is over — either they stopped moving or the guard tripped. Fork by tier, not guesswork.
  if (tier === "APPROVE_BEFORE_COMMIT") {
    const concession = ctx.firstOfferPriceUsd - offer.unitPriceUsd;
    return {
      action: "ESCALATE",
      terms: offer,
      tier,
      rationale:
        `best terms $${offer.unitPriceUsd}/u (conceded $${concession.toFixed(2)}/u) inside reservation ` +
        `but beyond the notify band — holding for human approval`,
    };
  }

  // PROHIBITED at budget exhaustion OR a stall — never committable; disengage cleanly.
  // Name the trigger that actually fired, in the reasonCode as well as the prose. Three different things
  // end a negotiation here and they are not interchangeable downstream: `reasonToA2cnTerminal` maps
  // TIMEOUT and BUDGET_EXHAUSTED to different A2CN terminals, and an operator auditing why Meridian
  // walked reads the code, not the sentence. Reporting BUDGET_EXHAUSTED for all three said "we spent our
  // 20 rounds" about a negotiation that stopped at round 2 because the counterparty stonewalled — which
  // is the single most common walkaway in the demo, and the one it described wrongly.
  // The prose names the TIER, not a guessed price reason. "still above reservation" was true only for the
  // commonest case: `classify` also returns PROHIBITED for a lead time past the deadline, an unapproved
  // delivery term, a quantity over the per-deal cap or not matching the shortfall — and for every one of
  // those the old sentence asserted something false about a price that was perfectly acceptable. The tier
  // is the authority on committability, so it is what gets reported, with the terms alongside it so an
  // operator can see which dimension is off without the rationale having to re-derive it.
  const cause = walkawayCause(mandate, ctx);
  return {
    action: "WALKAWAY",
    reasonCode: cause.reasonCode,
    rationale:
      `${cause.trigger}; best offer $${offer.unitPriceUsd}/u, ${offer.units}u, ${offer.leadTimeDays}d ` +
      `${offer.deliveryTerms} classifies ${tier} and is not committable — walking away`,
  };
}

/**
 * Why bargaining ended, as the §10 reason code plus the phrase that goes in the trail.
 *
 * Order matters: wall-clock is checked first because it is the one cause that can fire with rounds to
 * spare, so attributing it to the round budget would be strictly wrong. A stall is the residual — the
 * supplier is still inside both budgets and simply stopped moving, which is OUT_OF_TERMS rather than any
 * budget code: nothing of ours ran out.
 */
function walkawayCause(
  mandate: Mandate,
  ctx: DecisionContext,
): { reasonCode: ReasonCode; trigger: string } {
  if (ctx.wallClockExpired) {
    return {
      reasonCode: "TIMEOUT",
      trigger: `wall-clock budget of ${mandate.budget.maxWallClockMs}ms elapsed`,
    };
  }
  // `?? ctx.budgetExhausted` keeps the pre-split behaviour for callers that pass only the combined gate:
  // budget spent with no cause given is reported as round exhaustion, exactly as before.
  if (ctx.roundsExhausted ?? ctx.budgetExhausted) {
    return { reasonCode: "BUDGET_EXHAUSTED", trigger: `${mandate.budget.maxRounds} rounds spent` };
  }
  return { reasonCode: "OUT_OF_TERMS", trigger: "supplier stopped conceding" };
}
