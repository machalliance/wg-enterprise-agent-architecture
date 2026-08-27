import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { describeDisposition, sellerDisposition } from "./disposition.js";

/**
 * The seller's private circumstances — where run-to-run variation comes from, and why it is not a dice
 * roll in the decision path. People do not randomise their decisions; their situations differ and they
 * decide sensibly given the situation.
 */
describe("seller disposition", () => {
  const DID = "did:web:summit-gear.example";

  // NEGOTIATION_SEED pins every disposition to one value, so an inherited one would make the variation
  // and full-range cases below fail for a reason that has nothing to do with the code under test.
  // Cleared for the suite and restored exactly — including "was not set" — so running these tests
  // cannot alter the environment of whatever runs next in the same process.
  const savedSeed = process.env.NEGOTIATION_SEED;
  const restoreSeed = (): void => {
    if (savedSeed === undefined) delete process.env.NEGOTIATION_SEED;
    else process.env.NEGOTIATION_SEED = savedSeed;
  };
  before(() => { delete process.env.NEGOTIATION_SEED; });
  after(restoreSeed);

  it("is stable for a given session — same seed, same disposition", () => {
    const a = sellerDisposition("session-1", DID);
    const b = sellerDisposition("session-1", DID);
    assert.deepEqual(a, b, "replayable: randomness you cannot reproduce is a debugging tax");
  });

  it("differs across sessions, and across suppliers within one session", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 40; i++) seen.add(JSON.stringify(sellerDisposition(`session-${i}`, DID)));
    assert.ok(seen.size > 4, `40 sessions should span several dispositions, saw ${seen.size}`);
    assert.notDeepEqual(
      sellerDisposition("same-session", "did:web:summit-gear.example"),
      sellerDisposition("same-session", "did:web:alpine-supply.example"),
      "two suppliers in one run are not in identical circumstances",
    );
  });

  it("spans the full range of each trait across enough sessions", () => {
    const hungers = new Set<string>();
    const patience = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const d = sellerDisposition(`s${i}`, DID);
      hungers.add(d.dealHunger);
      patience.add(d.patienceForGrinding);
    }
    assert.equal(hungers.size, 3, "all three deal-hunger states occur");
    assert.equal(patience.size, 3, "all three patience levels occur");
  });

  it("NEGOTIATION_SEED pins it, so a demo can be replayed exactly", () => {
    process.env.NEGOTIATION_SEED = "pinned";
    try {
      assert.deepEqual(sellerDisposition("any-session", DID), sellerDisposition("a-different-session", DID));
    } finally {
      // Back to the suite's cleared state; `after` puts the caller's original value back.
      delete process.env.NEGOTIATION_SEED;
    }
  });

  it("renders as circumstances to weigh, never as a rule to apply", () => {
    const text = describeDisposition(sellerDisposition("session-1", DID));
    assert.match(text, /private — the buyer cannot see/, "it is asymmetric information, which is the point");
    // No thresholds. Handing the model "walk after 3 rounds" would just relocate the hardcoded rule
    // into the prompt, which is the thing this design is trying to stop doing.
    assert.ok(!/\bwalk (after|at|when)\b/i.test(text), "no encoded stopping rule");
    assert.ok(!/\d+ rounds?\b/i.test(text), "no round thresholds");
  });
});
