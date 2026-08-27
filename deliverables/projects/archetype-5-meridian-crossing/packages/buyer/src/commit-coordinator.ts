import type { Terms } from "@meridian/protocol";
import { isSettleTier, type Tier } from "./classify.js";

/**
 * The commit barrier across a run's parallel negotiations. It makes ONE guarantee: no supplier is
 * committed to until every OTHER parallel negotiation has revealed its best-and-final position, so the
 * buyer is never in the situation of having bound to one supplier before it knew what another would
 * offer. This is the "choice point" the demo is meant to reach — negotiate all the way down, THEN pick.
 *
 * Mechanically it reuses the exact pause the escalate→approve→settle path already relies on: a
 * negotiation that reaches a committable offer goes quiet on its live channel and awaits a verdict here
 * instead of committing on its own. The supplier holds its per-negotiation state with no expiry, so a
 * later ACCEPT on the same channel settles cleanly.
 *
 * The choice rule, once every participant has reported:
 *   - If ANY offer is within autonomous policy (a settle tier), the buyer picks the BEST of those and
 *     commits it itself — every other supplier stands down, and no human is bothered.
 *   - Only when NO offer is within policy (every committable offer is APPROVE_BEFORE_COMMIT) does the
 *     human decide: each such offer is told to `escalate` and takes its own human-approval path.
 *
 * Each negotiation reports EXACTLY ONCE:
 *   - `offer(candidate)` — it reached a committable offer; returns a promise resolving to "commit"
 *     (selected — settle it), "escalate" (out-of-policy and nothing in policy beat it — ask the human),
 *     or "standDown" (a better/in-policy offer was chosen — walk away).
 *   - `withdraw()` — it walked away or errored, so it is not a candidate at all.
 * If nobody offered, the barrier resolves to a no-op.
 */
export type CommitVerdict = "commit" | "escalate" | "standDown";

export interface CommitCandidate {
  negotiationId: string;
  supplierDid: string;
  agentName: string;
  terms: Terms;
  tier: Tier;
}

/**
 * The choice made at the barrier, for the buyer's selection trail event. `mode` is "autonomous" when an
 * in-policy offer won (and `winner` names it) or "human" when every committable offer was out of policy
 * and the decision passes to the operator (`winner` absent).
 */
export interface CommitSelection {
  mode: "autonomous" | "human";
  winner?: CommitCandidate;
  candidates: CommitCandidate[];
}

/**
 * Default selection: the lowest unit price wins. Ties break toward the tighter tier (an autonomous
 * settle over a notify-on-settle), then the shorter lead time, then more units — all PUBLIC terms, so
 * the choice never depends on a private mandate number. Returns the index of the winning candidate.
 */
export function selectBestCandidate(cands: CommitCandidate[]): number {
  const tierRank: Record<Tier, number> = {
    AUTONOMOUS_SETTLE: 0,
    NOTIFY_ON_SETTLE: 1,
    APPROVE_BEFORE_COMMIT: 2,
    PROHIBITED: 3,
  };
  let best = 0;
  for (let i = 1; i < cands.length; i++) {
    const a = cands[i]!.terms;
    const b = cands[best]!.terms;
    if (a.unitPriceUsd !== b.unitPriceUsd) {
      if (a.unitPriceUsd < b.unitPriceUsd) best = i;
      continue;
    }
    if (tierRank[cands[i]!.tier] !== tierRank[cands[best]!.tier]) {
      if (tierRank[cands[i]!.tier] < tierRank[cands[best]!.tier]) best = i;
      continue;
    }
    if (a.leadTimeDays !== b.leadTimeDays) {
      if (a.leadTimeDays < b.leadTimeDays) best = i;
      continue;
    }
    if (a.units > b.units) best = i;
  }
  return best;
}

export class CommitCoordinator {
  #participants: number;
  #reported = 0;
  #settled = false;
  #pending: Array<{ cand: CommitCandidate; resolve: (v: CommitVerdict) => void }> = [];
  #select: (cands: CommitCandidate[]) => number;
  #onSelect?: (selection: CommitSelection) => void;

  /**
   * @param participants how many negotiations share this barrier — each reports exactly once.
   * @param opts.select   choose the winning candidate index (defaults to lowest unit price).
   * @param opts.onSelect notified once with the winner + full field, for a buyer-side selection trail event.
   */
  constructor(
    participants: number,
    opts: { select?: (cands: CommitCandidate[]) => number; onSelect?: (s: CommitSelection) => void } = {},
  ) {
    this.#participants = participants;
    this.#select = opts.select ?? selectBestCandidate;
    this.#onSelect = opts.onSelect;
  }

  offer(cand: CommitCandidate): Promise<CommitVerdict> {
    // A late offer stands down instead of queueing. Once #settled, `#maybeResolve` returns immediately,
    // so a candidate pushed after the barrier resolved would never have its promise settled at all —
    // the negotiation awaiting it hangs forever, holding the reservation it took to get here. It also
    // inflates #reported past #participants, which is a lie about how many desks answered.
    if (this.#settled) return Promise.resolve("standDown");
    return new Promise<CommitVerdict>((resolve) => {
      this.#pending.push({ cand, resolve });
      this.#reported += 1;
      this.#maybeResolve();
    });
  }

  withdraw(): void {
    // Same guard, same reason: a withdrawal after the decision is a no-op, not another vote.
    if (this.#settled) return;
    this.#reported += 1;
    this.#maybeResolve();
  }

  #maybeResolve(): void {
    if (this.#settled || this.#reported < this.#participants) return;
    this.#settled = true;
    if (this.#pending.length === 0) return;
    const candidates = this.#pending.map((p) => p.cand);
    // Prefer an in-policy (settle-tier) offer: the buyer commits the best of those itself.
    const inPolicy = this.#pending.filter((p) => isSettleTier(p.cand.tier));
    if (inPolicy.length > 0) {
      // `#select` is injectable, so its result is an input to be checked, not a fact. The `!` asserted
      // an in-range index: an out-of-range one (or a throw) left `winner` undefined, and then EVERY
      // pending promise resolved "standDown" — or none of them resolved at all, and each negotiation
      // awaiting this barrier hung forever holding its reservation against the cross-deal cap. A
      // selector bug must not be able to strand the run; escalate to a human instead, which is the
      // defined outcome for "the buyer cannot pick one itself".
      let winner: (typeof inPolicy)[number] | undefined;
      try {
        const index = this.#select(inPolicy.map((p) => p.cand));
        if (Number.isInteger(index) && index >= 0 && index < inPolicy.length) winner = inPolicy[index];
        else console.error(`[commit-coordinator] selector returned an out-of-range index (${index}) — escalating`);
      } catch (err) {
        console.error("[commit-coordinator] selector threw — escalating:", err);
      }
      if (winner) {
        const chosen = winner;
        for (const p of this.#pending) p.resolve(p === chosen ? "commit" : "standDown");
        this.#notify({ mode: "autonomous", winner: chosen.cand, candidates });
        return;
      }
      // fall through to the human path — every pending offer is still resolved below
    }
    // Nothing is in policy (or selection failed) — every committable offer needs a human.
    for (const p of this.#pending) p.resolve("escalate");
    this.#notify({ mode: "human", candidates });
  }

  /**
   * Report the selection, and never let that report strand the run.
   *
   * TWO defences, because the callback is a caller-supplied side effect and this barrier is the only
   * thing every parallel negotiation is waiting on. It is invoked AFTER every pending promise has been
   * resolved, and its throw is swallowed here.
   *
   * The live callback calls `trail.append`, which writes to a file and can therefore throw. Called
   * before the resolve loops, that throw propagated out of `#maybeResolve` — into the `new Promise`
   * executor in `offer()`, which turns it into a rejection of whichever negotiation happened to report
   * last, while every SIBLING promise was simply never resolved. Those coroutines then waited forever,
   * each still holding its reservation against the cross-deal cap, and `#settled` was already true so
   * nothing could retry. The same throw arriving via `withdraw()` was worse still: that path is not
   * inside a promise executor, so it surfaced in `runNegotiationCore`'s `finally` and REPLACED whatever
   * real error was already unwinding.
   *
   * A lost selection trail entry is a missing log line. A stranded barrier is a hung run.
   */
  #notify(selection: CommitSelection): void {
    try {
      this.#onSelect?.(selection);
    } catch (err) {
      console.error("[commit-coordinator] onSelect threw — selection stands, trail entry lost:", err);
    }
  }
}
