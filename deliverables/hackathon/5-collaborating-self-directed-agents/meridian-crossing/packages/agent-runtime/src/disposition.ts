import { createHash } from "node:crypto";

/**
 * A seller's private circumstances for one negotiation — the reason two competent negotiators land in
 * different places on different days.
 *
 * WHY THIS EXISTS. Five identical LLM runs settled at exactly the seller's floor every time. Not a
 * prompt failure: the seller could not walk away, so pressing cost the buyer nothing, and
 * press-to-the-floor was simply the correct strategy. Giving the seller a walk option only helps if
 * *when* it walks can differ — otherwise the optimum just moves somewhere else and pins there instead.
 *
 * The tempting fix is `if (random() < 0.3) walk`. That is wrong twice: it is exactly the hardcoded
 * decision logic this codebase is trying to get rid of, and a dice roll is not a behaviour — it produces
 * variation with no reason behind it, so the trail cannot explain what happened and neither can a demo.
 *
 * People do not randomise their decisions. Their SITUATIONS differ, and they decide sensibly given the
 * situation. So the draw happens here, once, before the negotiation starts: how badly this supplier
 * needs the deal, whether it has another buyer, how close its quarter-end is, how much grinding it will
 * absorb. Each is a real business fact a seller knows and the buyer does not — the information asymmetry
 * that makes negotiation a negotiation. The buyer has to infer it from behaviour.
 *
 * DETERMINISM. The draw is a hash of the negotiationId, not `Math.random()`. A fresh UUID per session
 * means every demo run differs; pinning the id (or `NEGOTIATION_SEED`) makes a run reproducible, so CI
 * and the offline path stay byte-identical. Randomness you cannot replay is a debugging tax.
 */

export interface SellerDisposition {
  /** How much this supplier needs the deal — drives tolerance for a grinding buyer. */
  dealHunger: "hungry" | "steady" | "comfortable";
  /** Its BATNA. Another buyer in hand is what makes walking away credible. */
  alternatives: "another buyer is asking about this SKU" | "no other interest in this SKU this quarter";
  /** Time pressure, which cuts against holding out. */
  timePressure: "quarter-end is two weeks away" | "plenty of runway left this quarter";
  /** How many rounds of trivial movement it will absorb before it has had enough. */
  patienceForGrinding: "low" | "medium" | "high";
}

const HUNGER: SellerDisposition["dealHunger"][] = ["hungry", "steady", "comfortable"];
const ALTERNATIVES: SellerDisposition["alternatives"][] = [
  "another buyer is asking about this SKU",
  "no other interest in this SKU this quarter",
];
const TIME: SellerDisposition["timePressure"][] = [
  "quarter-end is two weeks away",
  "plenty of runway left this quarter",
];
const PATIENCE: SellerDisposition["patienceForGrinding"][] = ["low", "medium", "high"];

/** Stable per (seed, salt) byte — the draw, without an RNG. */
function pick<T>(seed: string, salt: string, options: readonly T[]): T {
  const h = createHash("sha256").update(`${seed}:${salt}`, "utf8").digest();
  return options[h[0]! % options.length]!;
}

/**
 * Draw this supplier's circumstances for one negotiation. Same seed → same disposition, always.
 * `NEGOTIATION_SEED` overrides the session id so a demo can be pinned to a disposition it liked.
 */
export function sellerDisposition(negotiationId: string, did: string): SellerDisposition {
  const seed = `${process.env.NEGOTIATION_SEED ?? negotiationId}:${did}`;
  return {
    dealHunger: pick(seed, "hunger", HUNGER),
    alternatives: pick(seed, "alt", ALTERNATIVES),
    timePressure: pick(seed, "time", TIME),
    patienceForGrinding: pick(seed, "patience", PATIENCE),
  };
}

/**
 * Render the disposition as private context for the seller's system prompt. Deliberately prose, not
 * numbers: these are circumstances to weigh, not thresholds to compute against. Handing a model
 * "walkAfter: 3 rounds" would just move the hardcoded rule into the prompt.
 */
export function describeDisposition(d: SellerDisposition): string {
  const hunger = {
    hungry: "You are short of quota and this deal matters to you.",
    steady: "Your quarter is on track; this deal is useful but not critical.",
    comfortable: "You are comfortably ahead of quota and do not need this deal.",
  }[d.dealHunger];
  const patience = {
    low: "You have little patience for a buyer who grinds over pennies once you are near your limit.",
    medium: "You will absorb some haggling, but not endless rounds of trivial movement.",
    high: "You are willing to go many rounds if the buyer keeps engaging in good faith.",
  }[d.patienceForGrinding];
  return [
    "YOUR SITUATION THIS QUARTER (private — the buyer cannot see any of this):",
    `  ${hunger}`,
    `  Right now, ${d.alternatives}.`,
    `  On timing, ${d.timePressure}.`,
    `  ${patience}`,
  ].join("\n");
}
