import type { Terms } from "@meridian/protocol";

/**
 * The buyer's live view of every quote on its own desk.
 *
 * WHY THIS IS NOT THE THING WE DELETED. `reconcile()` was removed from this codebase because it had the
 * buyer read the SUPPLIER's log off disk — one organisation inspecting another's private records, which
 * no protocol grants and no real counterparty would permit. This is the opposite: every entry here is a
 * quote a supplier addressed TO Meridian, held in Meridian's own memory, shared between Meridian's own
 * concurrent negotiation threads. A buyer comparing the offers it received is not a boundary violation;
 * it is the entire reason anyone requests more than one quote.
 *
 * So there is deliberately no signing, no trust gate and no envelope here. Those exist to protect data
 * crossing an org boundary, and nothing here crosses one. The board never leaves the buyer process, and
 * it is created per run — see index.ts / server.ts, alongside the CommitCoordinator.
 *
 * WHY IT IS SEPARATE FROM CommitCoordinator. The coordinator is a BARRIER: it learns each negotiation's
 * position once, at the end, when that thread has stopped moving. That is too late to negotiate with.
 * Leverage has to arrive mid-flight — "your rival is quoting less than you" only changes behaviour while
 * there are still rounds left to change. Same data, incompatible timing, so they stay separate.
 *
 * RACY BY DESIGN. Negotiations run concurrently (`Promise.allSettled`), so what a thread reads here
 * depends on how far its rivals happen to have progressed. That is not a defect to be locked away — it
 * is exactly the position a human buyer is in. You act on the quotes you have so far, and a quote that
 * lands after you have already decided is simply information you did not have.
 */

/** One supplier's latest known position, as Meridian sees it. All fields come off the wire — public terms. */
export interface RivalQuote {
  supplierDid: string;
  agentName: string;
  /** Their standing offer the last time this thread heard from them. */
  unitPriceUsd: number;
  leadTimeDays: number;
  units: number;
  /** Where that negotiation has got to. A walked rival is not an alternative, and the buyer must see that. */
  status: "negotiating" | "walked" | "closed";
}

export class QuoteBoard {
  #byDid = new Map<string, RivalQuote>();

  /**
   * Record (or overwrite) a supplier's latest offer. Called once per round by each negotiation.
   *
   * Terms arrive off the wire PARTIAL — every field is optional in the contract, because not every
   * negotiation verb carries a full set. A message with no unit price is not a quote and must not land on
   * the board: posting it would either crash a comparison or, worse, register a rival at `undefined` and
   * quietly drop it out of the cheapest-first ordering. So this is a no-op unless there is a price.
   */
  post(supplierDid: string, agentName: string, terms: Partial<Terms>): void {
    if (typeof terms.unitPriceUsd !== "number") return;
    const prev = this.#byDid.get(supplierDid);
    this.#byDid.set(supplierDid, {
      supplierDid,
      agentName,
      unitPriceUsd: terms.unitPriceUsd,
      leadTimeDays: terms.leadTimeDays ?? prev?.leadTimeDays ?? 0,
      units: terms.units ?? prev?.units ?? 0,
      status: prev?.status === "negotiating" || prev === undefined ? "negotiating" : prev.status,
    });
  }

  /** Mark how a negotiation ended, so rivals stop treating a dead thread as a live alternative. */
  close(supplierDid: string, status: "walked" | "closed"): void {
    const prev = this.#byDid.get(supplierDid);
    if (prev) this.#byDid.set(supplierDid, { ...prev, status });
  }

  /** Every quote EXCEPT the caller's own. Sorted cheapest first — the order a buyer reads them in. */
  rivalsOf(supplierDid: string): RivalQuote[] {
    return [...this.#byDid.values()]
      .filter((q) => q.supplierDid !== supplierDid)
      .sort((a, b) => a.unitPriceUsd - b.unitPriceUsd);
  }
}
