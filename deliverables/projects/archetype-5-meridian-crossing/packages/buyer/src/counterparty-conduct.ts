/** A price movement that warrants down-weighting the counterparty's reputation. */
export type ConductSignal = "probe" | "stall";

/**
 * What the counterparty's PRICE has actually done across the negotiation — the arithmetic behind the
 * good-faith test, separated from the policy decision of what to do about it.
 *
 * The caller keeps the policy: this reports "that was a probe" or "that was a stall", and the caller
 * decides that a probe costs reputation and that reputation below a floor ends the deal. The split is
 * what lets the rules below be stated once, in one place, instead of as five interacting `let`s in the
 * middle of the turn loop.
 *
 * THE RULES, and the failures behind them:
 *
 * A flat round is only bad faith from a counterparty that has never actually engaged. Once a supplier
 * has made a real concession, holding its price is the honest signal "this is my limit" — it is how
 * negotiation ends, not evidence of bad faith, and the buyer's own reasoner is told exactly that ("a
 * hold is a signal, not an insult"; see llm.ts). Penalising it anyway made the two halves of the buyer
 * disagree, and it was measurable: at 0.05 a round, a supplier seeded at 0.9 crossed the 0.2 floor after
 * 14 held rounds, so the buyer abandoned deals it was winning — 2 of 3 walks in a 12-run sample were
 * this gate firing on Summit, whose seeded score is 0.9.
 *
 * "Engaged" has to be MONOTONE progress, and that is not a detail. A per-round test ("did they move at
 * all?") is fooled by an adversary that oscillates: RidgeLine swings ±$2 by round parity, so half its
 * rounds look like concessions. Net movement from the opening is fooled too — those swings reach $97
 * from a $100 open, which passes any cumulative threshold. What actually separates a seller at its limit
 * from one jerking the buyer around is that the honest one never re-raises. So a counterparty that has
 * EVER moved its price up forfeits the benefit of the doubt, and the rest is measured against the best
 * price it has actually offered.
 *
 * `counterStepUsd` is the mandate's own notion of a step that counts, passed in so "engaged" means the
 * same thing to the trust gate as it does everywhere else.
 */
export class CounterpartyConduct {
  /** Prices within this of each other are the same price — a float-comparison guard, not a policy knob. */
  static readonly EPS = 0.005;

  readonly #firstOfferPriceUsd: number;
  readonly #counterStepUsd: number;
  #prevOfferPrice: number;
  /** The best price this counterparty has actually put on the table. */
  #bestOfferSeen: number;
  /** Whether it has ever moved its price the wrong way. */
  #everProbed = false;
  #sawFirstOffer = false;
  #lastConcessionUsd: number | undefined;
  readonly #concessionHistory: number[] = [];

  constructor(firstOfferPriceUsd: number, counterStepUsd: number) {
    this.#firstOfferPriceUsd = firstOfferPriceUsd;
    this.#counterStepUsd = counterStepUsd;
    this.#prevOfferPrice = firstOfferPriceUsd;
    this.#bestOfferSeen = firstOfferPriceUsd;
  }

  /**
   * Fold this round's standing offer in, and report the signal it warrants (null for a good-faith
   * concession, and for the opening offer, which sets the baseline and is not yet a judgment).
   */
  observe(unitPriceUsd: number): ConductSignal | null {
    let signal: ConductSignal | null = null;
    if (this.#sawFirstOffer) {
      // `hasEngaged` reads `#bestOfferSeen` BEFORE this round folds into it — the question is whether the
      // counterparty had already engaged by the time it made this move, not whether this move engages.
      const hasEngaged = !this.#everProbed && this.#firstOfferPriceUsd - this.#bestOfferSeen >= this.#counterStepUsd;
      if (unitPriceUsd > this.#prevOfferPrice + CounterpartyConduct.EPS) {
        this.#everProbed = true;
        signal = "probe";
      } else if (unitPriceUsd > this.#prevOfferPrice - CounterpartyConduct.EPS && !hasEngaged) {
        signal = "stall";
      }
    }
    this.#bestOfferSeen = Math.min(this.#bestOfferSeen, unitPriceUsd);
    // Movement this round, measured before `#prevOfferPrice` is overwritten. A price INCREASE counts as
    // zero movement — a probe is not a concession.
    this.#lastConcessionUsd = this.#sawFirstOffer ? Math.max(0, this.#prevOfferPrice - unitPriceUsd) : undefined;
    if (this.#lastConcessionUsd !== undefined) {
      this.#concessionHistory.push(Math.round(this.#lastConcessionUsd * 100) / 100);
    }
    this.#sawFirstOffer = true;
    this.#prevOfferPrice = unitPriceUsd;
    return signal;
  }

  /** The supplier's movement in the round just observed. Undefined before it has answered twice. */
  get lastConcessionUsd(): number | undefined {
    return this.#lastConcessionUsd;
  }

  /** Every movement the supplier has made, newest last — the curve, not a summary of it. Copied, because
   *  it goes to a reasoner that may be an LLM adapter and must not be able to mutate the record. */
  get concessionHistory(): number[] {
    return [...this.#concessionHistory];
  }
}
