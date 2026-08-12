import type { SellerParams } from "@meridian/agent-runtime";

/**
 * The seller behaviours the in-process buyer suites negotiate against.
 *
 * WHY THIS FILE EXISTS. These three objects were declared independently in five test files
 * (mandate, demo, a2cn, accountability, e2e). All five agreed with each other and ALL FIVE disagreed
 * with `seed/supplier-policy.json`, which opens by declaring itself the single source for these numbers
 * and warning that a second copy is "a measurement bug waiting to happen". `mandate.test.ts` described
 * its copy as "mirrored from the three supplier processes" — by then it was not mirroring anything: the
 * seed had moved (summit's floor 86, concession 0.02; alpine's concession 0.015) and every copy still
 * said 80/0.06 and 0.05. Five copies is not five chances to notice; it is five places the drift hides.
 *
 * WHY THESE NUMBERS ARE NOT THE SEED'S. They are deliberately EXAGGERATED, and that is the point of
 * keeping them separate rather than reading the seed here:
 *
 *   - The seed drives the DEMO, and is tuned so a human watching sees a negotiation with real texture —
 *     summit concedes 2% a round, so it takes many rounds to converge and the price is a decision rather
 *     than arithmetic (see the `_concessionNote` in the seed).
 *   - These fixtures drive UNIT TESTS, which must reach a settle/escalate/walk in a handful of rounds
 *     inside `node --test`. Summit at the real 2% would need most of the 20-round budget to cross the
 *     buyer's band, so a test asserting "this settles" would be asserting the round budget, not the tier
 *     logic it means to cover.
 *
 * So the divergence is intentional. What was NOT intentional is that nothing recorded which parts of the
 * relationship are load-bearing, so a seed edit could break the scenario's premise while every suite kept
 * passing against the old one. `scenario-premises.test.ts` is the other half of this fix: it asserts the
 * RELATIONSHIPS (alpine's floor above the buyer's ceiling, summit's floor below cascade's, and so on)
 * directly against the seed, so the seed is guarded by tests even though the fixtures below are not
 * derived from it.
 *
 * Rule of thumb when editing: a number here only has to preserve the ROLE (cooperative settles, firm
 * escalates, adversarial never converges). A number in the seed has to preserve the role AND the
 * relationships the premises test names.
 */
export interface SellerFixture {
  /** The price this seller opens at. */
  opening: number;
  /** The price it will not go below — for FIRM, deliberately above the buyer's autonomous band. */
  floor: number;
  /** Fraction of the standing price conceded per round. */
  concession: number;
  /** Alternating-round price swing, for the counterparty that oscillates instead of converging. */
  jitter?: number;
}

/**
 * Concedes fast enough to land inside the buyer's envelope within a couple of rounds. The suites that
 * assert a SETTLE use this. Floor 80 (the seed says 86) so a test can push a price war to its end
 * without spending the round budget getting there.
 */
export const COOPERATIVE: SellerFixture = { opening: 98, floor: 80, concession: 0.06 };

/**
 * Concedes in good faith but holds a floor ABOVE the buyer's notify-on-settle ceiling ($94), so its best
 * possible price never fits and the deal must go to a human. The suites that assert an ESCALATE use this.
 *
 * The floor of 95 is the one number here that matches the seed exactly, and it must: "above the buyer's
 * ceiling" is the entire behaviour under test, not a speed adjustment. `scenario-premises.test.ts`
 * asserts the same relationship holds for the seed's own value.
 */
export const FIRM: SellerFixture = { opening: 108, floor: 95, concession: 0.05 };

/**
 * Never concedes; swings its price on alternating reply rounds so it trends UP from its opening. The
 * suites that assert a reputation-driven WALK use this. Matches the seed, because "does not converge" is
 * the behaviour under test and there is nothing to accelerate.
 */
export const ADVERSARIAL: SellerFixture = { opening: 100, floor: 99, concession: 0, jitter: 2 };

/** A fixture as the `SellerParams` subset `createSeller` takes, so call sites spread one object. */
export function sellerParams(fixture: SellerFixture): Partial<SellerParams> {
  const params: Partial<SellerParams> = {
    openingPriceUsd: fixture.opening,
    floorPriceUsd: fixture.floor,
    concessionRate: fixture.concession,
  };
  // Spread into a `SellerParams` whose `jitterUsd` is optional — setting it to `undefined` explicitly is
  // not the same as leaving it out once the object is spread over a default, so only set it when present.
  if (fixture.jitter !== undefined) params.jitterUsd = fixture.jitter;
  return params;
}
