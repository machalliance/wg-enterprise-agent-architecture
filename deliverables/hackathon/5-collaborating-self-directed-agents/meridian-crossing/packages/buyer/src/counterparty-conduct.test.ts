import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CounterpartyConduct } from "./counterparty-conduct.js";

/**
 * The good-faith arithmetic, tested directly now that it is a unit.
 *
 * `reputation-stall.test.ts` covers three of these rules end-to-end through `runNegotiation`, which is
 * the right place for "does the buyer walk away". What it cannot reach cheaply is the rule the comments
 * argue hardest for and that no test pinned: "engaged" must mean MONOTONE progress, because an
 * oscillating counterparty passes both a per-round movement test and a cumulative one. RidgeLine is
 * exactly that counterparty, and the reason the rule is written the way it is.
 */

const STEP = 2; // the mandate's counterStepUsd — the movement that counts as a real concession

describe("CounterpartyConduct", () => {
  it("passes no judgment on the opening offer — it is the baseline", () => {
    const c = new CounterpartyConduct(100, STEP);
    assert.equal(c.observe(100), null);
    assert.equal(c.lastConcessionUsd, undefined, "there is no movement to report before a second offer");
    assert.deepEqual(c.concessionHistory, []);
  });

  it("charges nothing for a good-faith concession", () => {
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    assert.equal(c.observe(97), null);
    assert.equal(c.lastConcessionUsd, 3);
    assert.deepEqual(c.concessionHistory, [3]);
  });

  it("calls a price moving AWAY from a deal a probe", () => {
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    assert.equal(c.observe(102), "probe");
    // A probe is not a negative concession — it is no concession at all.
    assert.equal(c.lastConcessionUsd, 0);
  });

  it("calls a hold a stall from a counterparty that has never engaged", () => {
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    assert.equal(c.observe(100), "stall");
  });

  it("stops charging for a hold once the counterparty HAS engaged — a limit is not bad faith", () => {
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    c.observe(97); // a real concession, >= counterStepUsd
    assert.equal(c.observe(97), null, "holding after conceding is the honest signal 'this is my limit'");
    assert.equal(c.observe(97), null);
  });

  it("does not count a concession SMALLER than the mandate's step as engagement", () => {
    // "Engaged" has to mean the same thing here as it does everywhere else, which is what passing
    // `counterStepUsd` in is for.
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    c.observe(99.5); // below the $2 step
    assert.equal(c.observe(99.5), "stall");
  });

  it("an OSCILLATING counterparty never earns the benefit of the doubt", () => {
    // The rule this test exists for. Ridge swings around its opening: half its rounds look like
    // concessions to a per-round test, and the swings reach far enough from the open to pass a
    // cumulative one. What separates it from an honest seller at its limit is that it RE-RAISES, so a
    // single probe forfeits engagement permanently — every later hold is a stall again.
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    assert.equal(c.observe(102), "probe");
    assert.equal(c.observe(98), null, "a downward swing is still movement, so it is not itself a signal");
    // 100 -> 98 is a $2 move from the open and the best price seen, so a non-monotone reading of
    // "engaged" would clear it here. It must not: the counterparty already re-raised once.
    assert.equal(c.observe(98), "stall", "an oscillator that re-raised must not be credited as engaged");
  });

  it("records the concession CURVE, not a summary, and hands out a copy", () => {
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    c.observe(96);
    c.observe(94.5);
    c.observe(94.5);
    assert.deepEqual(c.concessionHistory, [4, 1.5, 0]);
    // The reasoner may be an LLM adapter; it must not be able to mutate the buyer's own record.
    c.concessionHistory.push(999);
    assert.deepEqual(c.concessionHistory, [4, 1.5, 0]);
  });

  it("treats float dust as the same price, in both directions", () => {
    // Prices arrive as floats through JSON and a cents-rounding wire codec; `100.0000001` is a hold, not
    // a probe, and a lint that says otherwise would down-weight an honest counterparty for rounding.
    const c = new CounterpartyConduct(100, STEP);
    c.observe(100);
    assert.equal(c.observe(100 + 1e-9), "stall", "dust upward is a hold, not a probe");
    assert.equal(c.observe(100 - 1e-9), "stall", "dust downward is a hold, not a concession");
  });
});
