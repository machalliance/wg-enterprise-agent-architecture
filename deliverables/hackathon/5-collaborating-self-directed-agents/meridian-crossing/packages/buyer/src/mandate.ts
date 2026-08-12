import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { DeliveryTerms, TrustLevel, isCentPrecise } from "@meridian/protocol";
import type { Scenario } from "@meridian/agent-runtime";

/**
 * The buyer's PRIVATE commercial mandate. This is the judgment the negotiation contract asked for: a policy engine
 * that decides what the buyer's agent may *commit it to* in a deal with an outside party. It holds
 * the book's four tiers, a reservation price, and a cross-deal spend cap — and it lives ONLY in the
 * buyer process. Nothing here is ever published to the directory or placed in a wire message.
 *
 * Two fields are load-bearing for information minimization and MUST never leak:
 *   - `reservationUnitPriceUsd` — the most the buyer would pay. A seller that learns it captures the
 *     entire surplus between the buyer's bid and its bound.
 *   - `maxTotalCommittedUsd`    — the cap ACROSS all concurrent negotiations. Leaking it reveals how
 *     much room the buyer has left this quarter.
 * `PRIVATE_MANDATE_FIELDS` names them so the no-leak lint test can assert neither key nor value ever
 * appears in an outbound message (see mandate.test.ts).
 */

/** One tier band: the price/lead-time ceiling and the minimum trust it requires. */
export interface Tier {
  priceAtOrBelow: number;
  leadTimeAtOrBelow: number;
  counterparty: TrustLevel;
}

/** Adversarial-counterparty budget: bound the buyer's patience so it can never loop forever. */
export interface NegotiationBudget {
  maxRounds: number;
  maxWallClockMs: number;
}

export interface Mandate {
  sku: string;
  /** From the shared shortfall (scenario.json), not private. */
  unitsNeeded: number;
  deadlineDays: number;

  /** PRIVATE. The highest unit price the buyer may EVER commit to. Above it → PROHIBITED. */
  reservationUnitPriceUsd: number;
  /** Where the buyer would like to land. Opening counters aim here. */
  targetUnitPriceUsd: number;
  /** The buyer never bids above this on the wire — kept strictly below reservation so a counterparty
   *  cannot infer the reservation by watching the bids climb. */
  maxBidUsd: number;
  /** The SMALLEST move worth putting on the wire. Not a ladder step — bids are reciprocal (see
   *  strategy.ts): the buyer moves roughly what the supplier just moved. A staircase indexed by round
   *  number ignores the counterparty entirely, which is not how anyone negotiates. */
  counterStepUsd: number;
  /** Stop bargaining when the supplier's LAST concession falls below this. This is the buyer's stopping
   *  rule, and it is a judgement about diminishing returns rather than a countdown: a negotiator stops
   *  when pressure stops paying, not after a pre-agreed number of exchanges. `budget.maxRounds` is only
   *  a runaway guard behind it. */
  minConcessionPerRoundUsd: number;

  maxUnitsPerDeal: number;
  /** PRIVATE. Cap on committed spend ACROSS all concurrent deals (enforced by the commitment ledger). */
  maxTotalCommittedUsd: number;
  approvedDeliveryTerms: DeliveryTerms[];

  tiers: {
    autonomousSettle: Tier;
    notifyOnSettle: Tier;
  };

  budget: NegotiationBudget;
  /** Reputation floor: a counterparty scoring below this is walked away from early. */
  reputationWalkawayBelow: number;
}

/** The mandate keys whose key OR value must never appear in any outbound wire message. */
export const PRIVATE_MANDATE_FIELDS = ["reservationUnitPriceUsd", "maxTotalCommittedUsd"] as const;

/**
 * The quantity the buyer actually ASKS ANY ONE SUPPLIER FOR: the whole shortfall, or the per-deal cap
 * when the shortfall is larger than one deal may be. Split procurement is what makes the second case
 * legal — an oversized shortfall is filled across suppliers, never by one over-cap deal.
 *
 * Shared because `counterTerms` and `classify` MUST agree on it and did not. `counterTerms` capped the
 * ask at `maxUnitsPerDeal` while `classify` graded the answer against the full `unitsNeeded`, so a
 * supplier that offered precisely the capped quantity the buyer had just requested was graded a partial
 * fill and fell to APPROVE_BEFORE_COMMIT — while a supplier offering the FULL shortfall was PROHIBITED
 * for breaching the same cap. Every leg of a split therefore needed a human, which is the opposite of
 * the behaviour classify.ts's own comment describes. One expression, one place, so they cannot diverge.
 */
export function requestedUnits(mandate: Mandate): number {
  return Math.min(mandate.unitsNeeded, mandate.maxUnitsPerDeal);
}

/**
 * The private NUMBERS that must never appear in an outbound message, as strings for the value-side leak
 * checks — the counterpart to `PRIVATE_MANDATE_FIELDS`, which names only the keys.
 *
 * `maxBidUsd` is deliberately NOT here. It is private as a BOUND but not as a number: `boundedBid` caps
 * the buyer's COUNTER at it, so a firm supplier drives the bid to exactly the ceiling and the buyer
 * then puts that figure on the wire itself, as its own offer. Listing it would make this lint fail on
 * the buyer doing precisely what it is supposed to do. What must not leak is the CLAIM that the number
 * is a limit — see `withheldFromPrompt`.
 */
export function privateValues(mandate: Mandate): string[] {
  return [String(mandate.reservationUnitPriceUsd), String(mandate.maxTotalCommittedUsd)];
}

/**
 * The numbers that must not reach the model — `privateValues` plus the bid ceiling.
 *
 * The ceiling splits from the wire list here because the two channels disclose different things. On the
 * wire, `94` is one offer among a sequence and says nothing about where the bound is. In the PROMPT it
 * is presented as the buyer's limit, and a model told its ceiling anchors on it: 4/4 runs settled at
 * exactly that figure, which is why it was withheld rather than merely framed. Same number, different
 * disclosure.
 */
export function withheldFromPrompt(mandate: Mandate): string[] {
  return [...privateValues(mandate), String(mandate.maxBidUsd)];
}

const posUsd = z.number().positive().finite();
const posInt = z.number().int().positive();
const TierSchema = z.object({
  priceAtOrBelow: posUsd,
  leadTimeAtOrBelow: posInt,
  counterparty: TrustLevel,
});

/**
 * Runtime schema for the fully-resolved mandate. The seed file is JSON on disk and a test may pass
 * arbitrary `overrides`, so nothing is trusted by type assertion: every number must be finite and
 * positive, and the price ladder MUST satisfy `target <= maxBid < reservation` (otherwise the buyer
 * could bid at/above its own bound, or leak it by bidding straight to it). Validated BEFORE any
 * arithmetic runs on these values.
 */
const MandateSchema = z
  .object({
    sku: z.string().min(1),
    unitsNeeded: posInt,
    deadlineDays: posInt,
    reservationUnitPriceUsd: posUsd,
    targetUnitPriceUsd: posUsd,
    // CENT-PRECISE, unlike its siblings. `boundedBid` caps a proposal at this value and then rounds the
    // result to whole cents (a sub-cent bid cannot survive the a2cn round trip), and rounding happens
    // AFTER the cap — so a sub-cent ceiling like 94.005 rounds up to 94.01 and the bid crosses the private
    // bound the cap exists to enforce. Rejecting the un-representable ceiling at load time is the fix that
    // cannot be forgotten at a call site.
    maxBidUsd: posUsd.refine(isCentPrecise, {
      message: "maxBidUsd must be in whole cents (at most 2 decimal places), or boundedBid can round above it",
    }),
    counterStepUsd: posUsd,
    minConcessionPerRoundUsd: posUsd,
    maxUnitsPerDeal: posInt,
    maxTotalCommittedUsd: posUsd,
    approvedDeliveryTerms: z.array(DeliveryTerms).min(1),
    tiers: z.object({ autonomousSettle: TierSchema, notifyOnSettle: TierSchema }),
    budget: z.object({ maxRounds: posInt, maxWallClockMs: posInt }),
    reputationWalkawayBelow: z.number().min(0).max(1),
  })
  .refine((m) => m.targetUnitPriceUsd <= m.maxBidUsd && m.maxBidUsd < m.reservationUnitPriceUsd, {
    message: "mandate price ladder must satisfy targetUnitPriceUsd <= maxBidUsd < reservationUnitPriceUsd",
  });

function mandatePath(): string {
  return fileURLToPath(new URL("../../../seed/mandate.json", import.meta.url));
}

/**
 * Load the mandate from seed/mandate.json and overlay the shared shortfall (units/deadline come from
 * the scenario so the private policy file never duplicates them). Optional `overrides` let a test
 * exercise the cross-deal cap or the round budget without editing the seed file. The merged result is
 * schema-validated, so a malformed seed file OR a malformed override is rejected before it can reach
 * the pricing/cap arithmetic.
 */
export function loadMandate(scenario: Scenario, overrides: Partial<Mandate> = {}): Mandate {
  const file = JSON.parse(readFileSync(mandatePath(), "utf8")) as Record<string, unknown>;
  const { unitsNeeded, deadlineDays } = scenario.shortfall;
  return MandateSchema.parse({
    sku: file.sku,
    unitsNeeded,
    deadlineDays,
    reservationUnitPriceUsd: file.reservationUnitPriceUsd,
    targetUnitPriceUsd: file.targetUnitPriceUsd,
    maxBidUsd: file.maxBidUsd,
    counterStepUsd: file.counterStepUsd,
    minConcessionPerRoundUsd: file.minConcessionPerRoundUsd,
    maxUnitsPerDeal: file.maxUnitsPerDeal,
    maxTotalCommittedUsd: file.maxTotalCommittedUsd,
    approvedDeliveryTerms: file.approvedDeliveryTerms,
    tiers: file.tiers,
    budget: file.budget,
    reputationWalkawayBelow: file.reputationWalkawayBelow,
    ...overrides,
  });
}
