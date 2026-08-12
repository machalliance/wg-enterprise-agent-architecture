import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog, loadScenario, loadSupplierPolicy } from "@meridian/agent-runtime";
import { loadMandate } from "./mandate.js";
import { ADVERSARIAL, COOPERATIVE, FIRM } from "./seller-fixtures.js";

/**
 * The scenario's PREMISES, asserted against the seed files the running agents actually load.
 *
 * Every claim below is stated in prose somewhere — `seed/supplier-policy.json`'s `_role` notes, the
 * header comments in each `packages/supplier-<id>/src/index.ts`, the `_capNote` in `seed/mandate.json`
 * — and until now none of it was executable. That mattered because the numbers live in one place and the
 * behaviour they produce is asserted somewhere else entirely: the suites that check "Alpine escalates"
 * and "Summit settles" run against the exaggerated fixtures in `seller-fixtures.ts`, NOT against the
 * seed. So an edit to a seed floor could invert the demo's whole narrative — Alpine quietly becoming a
 * supplier the buyer settles with autonomously — while every existing test stayed green, because no
 * test read the edited number.
 *
 * These are relationship assertions, deliberately. Pinning the literals would just be a seventh copy of
 * them; what has to hold is that each supplier still occupies its role RELATIVE to the buyer's mandate
 * and to the other suppliers. Tuning a price inside its band stays free; tuning one across a band that
 * decides an outcome now fails here, next to the reason it is not allowed to move.
 */

const scenario = loadScenario();
const mandate = loadMandate(scenario);
const summit = loadSupplierPolicy("summit");
const cascade = loadSupplierPolicy("cascade");
const alpine = loadSupplierPolicy("alpine");
const ridge = loadSupplierPolicy("ridge");

describe("scenario premises — the seed still produces the scenario it describes", () => {
  it("every seller's floor is at or below its opening price", () => {
    // Not pedantry: the seller engine concedes DOWN from the opening toward the floor, so an inverted
    // pair makes the first quote already below the floor and the concession schedule meaningless.
    for (const [id, policy] of Object.entries({ summit, cascade, alpine, ridge })) {
      assert.ok(
        policy.floorPriceUsd <= policy.openingPriceUsd,
        `${id} floor $${policy.floorPriceUsd} is above its opening $${policy.openingPriceUsd}`,
      );
    }
  });

  it("Alpine's floor lands in the ESCALATE band — above the settle ceiling, at or below the reservation", () => {
    // Both bounds decide the outcome, and only the lower one is ever mentioned in the prose.
    //
    // Below the notify ceiling, Alpine's best price becomes a deal the buyer settles on its own and the
    // demo loses the human-approval path entirely. ABOVE the reservation, `classify` returns PROHIBITED
    // rather than APPROVE_BEFORE_COMMIT — so the buyer WALKS instead of escalating, which loses the same
    // path in the opposite direction and looks like a supplier bug rather than a mandate boundary.
    assert.ok(
      alpine.floorPriceUsd > mandate.tiers.notifyOnSettle.priceAtOrBelow,
      `Alpine floor $${alpine.floorPriceUsd} is inside the buyer's settle band ` +
        `($${mandate.tiers.notifyOnSettle.priceAtOrBelow}) — it would settle autonomously, not escalate`,
    );
    assert.ok(
      alpine.floorPriceUsd <= mandate.reservationUnitPriceUsd,
      `Alpine floor $${alpine.floorPriceUsd} is above the buyer's reservation — classify() returns ` +
        `PROHIBITED, so the buyer walks away instead of escalating to a human`,
    );
  });

  it("Cascade can win a clean AUTONOMOUS settle — its floor and lead time are both inside the tight band", () => {
    // The point of the competitive supplier is that it is a CREDIBLE threat, which requires that the
    // buyer could actually take its deal without a human. A floor above the autonomous band makes it
    // pressure the buyer cannot act on.
    assert.ok(
      cascade.floorPriceUsd <= mandate.tiers.autonomousSettle.priceAtOrBelow,
      `Cascade floor $${cascade.floorPriceUsd} is outside the autonomous band ` +
        `($${mandate.tiers.autonomousSettle.priceAtOrBelow}) — it can no longer win a deal on its own`,
    );
    assert.ok(
      loadCatalog("cascade").minLeadTimeDays <= mandate.tiers.autonomousSettle.leadTimeAtOrBelow,
      `Cascade's advertised lead time is outside the autonomous band, so even its best price escalates`,
    );
  });

  it("Summit still wins a price war pushed to the end — its floor is strictly below Cascade's", () => {
    // The settle narrative depends on this ordering, not on either number. Invert it and Cascade becomes
    // the supplier that wins every run, which is a different demo than the one the docs describe.
    assert.ok(
      summit.floorPriceUsd < cascade.floorPriceUsd,
      `Summit floor $${summit.floorPriceUsd} is not below Cascade's $${cascade.floorPriceUsd} — ` +
        `Cascade now wins a war pushed to the end`,
    );
  });

  it("Cascade is the cheaper quote from round one, and concedes faster", () => {
    // Both are what give the buyer something to push Summit with WHILE it still has rounds to use it.
    // A rival that only becomes cheaper at the end arrives after the leverage is worth anything.
    assert.ok(
      cascade.openingPriceUsd < summit.openingPriceUsd,
      `Cascade opens at $${cascade.openingPriceUsd}, not below Summit's $${summit.openingPriceUsd} — ` +
        `the buyer has no cheaper live quote to negotiate with`,
    );
    assert.ok(
      cascade.concessionRate > summit.concessionRate,
      `Cascade concedes at ${cascade.concessionRate}, not faster than Summit's ${summit.concessionRate} — ` +
        `it no longer reaches its floor early and holds the pressure on`,
    );
  });

  it("Cascade is a trade-off against Summit, not a strictly dominant option", () => {
    // If Cascade were cheaper AND faster it would simply be the right answer every time, and the
    // coordinator's lead-time tiebreak would never be exercised by the demo.
    assert.ok(
      loadCatalog("cascade").minLeadTimeDays > loadCatalog("summit").minLeadTimeDays,
      `Cascade's lead time no longer trails Summit's — it is now strictly better on both axes`,
    );
  });

  it("RidgeLine never converges — no concession, and a live jitter", () => {
    // The reputation gate's good-faith test is written against exactly this behaviour: a counterparty
    // whose price does not trend down. Give Ridge a concession rate and the walk-away it exists to
    // produce becomes a slow settle.
    assert.equal(ridge.concessionRate, 0, "RidgeLine concedes — it would eventually converge");
    assert.ok((ridge.jitterUsd ?? 0) > 0, "RidgeLine has no jitter — its price no longer moves at all");
  });
});

describe("test fixtures still occupy the roles they are named for", () => {
  // The fixtures are deliberately NOT derived from the seed (see seller-fixtures.ts for why), so their
  // ROLES need the same guard the seed's do — otherwise "the cooperative one settles" is a claim resting
  // on nothing but the constant's name.
  it("COOPERATIVE can reach the autonomous band; FIRM cannot reach any settle band", () => {
    assert.ok(
      COOPERATIVE.floor <= mandate.tiers.autonomousSettle.priceAtOrBelow,
      "the COOPERATIVE fixture can no longer settle autonomously — suites asserting a SETTLE are broken",
    );
    assert.ok(
      FIRM.floor > mandate.tiers.notifyOnSettle.priceAtOrBelow &&
        FIRM.floor <= mandate.reservationUnitPriceUsd,
      "the FIRM fixture no longer lands in the escalate band — suites asserting an ESCALATE are broken",
    );
  });

  it("ADVERSARIAL does not converge", () => {
    assert.equal(ADVERSARIAL.concession, 0, "the ADVERSARIAL fixture concedes — it would not be walked from");
    assert.ok((ADVERSARIAL.jitter ?? 0) > 0, "the ADVERSARIAL fixture no longer moves its price");
  });
});
