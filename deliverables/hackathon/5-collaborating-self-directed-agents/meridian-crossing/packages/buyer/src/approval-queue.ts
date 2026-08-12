import type { Terms } from "@meridian/protocol";
import type { ApprovalReceipt } from "@meridian/agent-runtime";
import type { Tier } from "./classify.js";

/**
 * The human approval queue. Tier 3 (APPROVE_BEFORE_COMMIT) does not walk away and does not
 * settle — it HOLDS. The best terms reached are enqueued here with the reason they could not
 * auto-settle, and NOTHING is committed until an operator approves. This is the alpine path made
 * concrete: the negotiation ends buyer-side in a held state, waiting on a person.
 *
 * The queue is deliberately dumb: it records items and their operator disposition. It does not itself
 * re-open a negotiation on approval (that is a follow-on action); its job is to be the gate that
 * proves "nothing is committed until a human approves."
 */
export interface ApprovalItem {
  id: string;
  supplierDid: string;
  agentName: string;
  negotiationId: string;
  terms: Terms;
  tier: Tier;
  reason: string;
  status: "pending" | "approved" | "rejected" | "timed_out";
  /** The paused act's hash — what precisely the operator is being asked to approve. Carried into the
   *  A2CN §14 ApprovalReceipt so the signed decision is bound to THIS offer and no other. */
  offerHash: string;
  /** Deal value and the autonomous ceiling it crossed, recorded on the receipt. */
  amountUsd: number;
  thresholdUsd: number;
  /** The signed operator receipt, once one exists. Absent until a human actually approves. */
  receipt?: ApprovalReceipt;
}

/** How an awaited approval resolved. `timeout` means no operator acted within the window. */
export type ApprovalDecision = "approved" | "rejected" | "timeout";

/** The decision plus, on an approval, the signed artifact that authorises transmitting the act. */
export interface ApprovalOutcome {
  decision: ApprovalDecision;
  receipt?: ApprovalReceipt;
}

/** Deep copy of a receipt, or undefined when there is none. Kept as one helper so every exit from the
 *  queue copies identically — a receipt that leaks by reference from any single path defeats the rest. */
function cloneReceipt(receipt?: ApprovalReceipt): ApprovalReceipt | undefined {
  return receipt === undefined ? undefined : structuredClone(receipt);
}

export class ApprovalQueue {
  /** The LIVE items — mutated only through this class's own methods; never handed out by reference. */
  private readonly items: ApprovalItem[] = [];
  private seq = 0;
  /** The set of waiters PER item id (usually one, the negotiation coroutine). A Set so a second
   *  awaitDecision for the same id ADDS a waiter rather than overwriting — every caller is then settled
   *  together by the one operator decision or timeout, none left hanging. */
  private readonly waiters = new Map<string, Set<(o: ApprovalOutcome) => void>>();

  /** A defensive copy so callers can neither mutate the queue's items nor their nested terms.
   *
   *  The receipt is DEEP-copied. Spreading the item and cloning `terms` left `receipt` shared by
   *  reference, and it is the one field with meaningful nesting of its own (`scope`, `references`), so a
   *  caller holding a snapshot could mutate the signed §14 evidence still held in the live queue — the
   *  artifact whose whole purpose is to be the unaltered record of what a human approved. `structuredClone`
   *  rather than another hand-written spread, so nesting added to the receipt later stays covered. */
  private snapshot(item: ApprovalItem): ApprovalItem {
    return { ...item, terms: { ...item.terms }, receipt: cloneReceipt(item.receipt) };
  }

  /** The live item (internal use only — external callers get snapshots). */
  private live(id: string): ApprovalItem | undefined {
    return this.items.find((i) => i.id === id);
  }

  /** Settle every waiter for an id with the same decision, then clear them.
   *
   *  Each waiter gets its OWN copy of the receipt. There is normally one waiter, but the Set exists
   *  precisely because there can be several, and handing them all the same object means one caller's
   *  mutation is visible to the others and to the queue. */
  private settleWaiters(id: string, decision: ApprovalDecision, receipt?: ApprovalReceipt): void {
    const set = this.waiters.get(id);
    if (!set) return;
    this.waiters.delete(id);
    for (const resolve of set) resolve({ decision, receipt: cloneReceipt(receipt) });
  }

  enqueue(item: Omit<ApprovalItem, "id" | "status">): ApprovalItem {
    // Clone the incoming terms AND the receipt so the caller cannot mutate what the queue holds after
    // enqueuing. The spread copies `receipt` by reference, and it is the one field with nesting of its
    // own (`scope`, `references`) — so without this the caller keeps a live handle on the signed §14
    // evidence, which is the artifact whose entire purpose is to be unaltered.
    const entry: ApprovalItem = {
      ...item,
      terms: { ...item.terms },
      receipt: cloneReceipt(item.receipt),
      id: `apr-${++this.seq}`,
      status: "pending",
    };
    this.items.push(entry);
    return this.snapshot(entry);
  }

  /**
   * Resolve when this item is approved/rejected, or `timeout` after `timeoutMs`. If the item was
   * already decided, resolves immediately. Used by the negotiation coroutine to hold a live deal open
   * until a human acts, so approval drives a genuine signed ACCEPT rather than a replayed one. Multiple
   * concurrent awaiters of the same id are all settled by the one decision/timeout — no waiter is lost.
   */
  awaitDecision(id: string, timeoutMs: number): Promise<ApprovalOutcome> {
    const item = this.live(id);
    if (item && item.status !== "pending") {
      // A settled item resolves immediately; a timed-out one maps back to the "timeout" decision.
      const decision: ApprovalDecision = item.status === "timed_out" ? "timeout" : (item.status as ApprovalDecision);
      return Promise.resolve({ decision, receipt: cloneReceipt(item.receipt) });
    }
    return new Promise<ApprovalOutcome>((resolve) => {
      const timer = setTimeout(() => {
        // Move the item to a TERMINAL timed_out state so it leaves pending() and can no longer be
        // approved — a stale approval must not resurrect a deal the negotiation already abandoned.
        const it = this.live(id);
        if (it && it.status === "pending") it.status = "timed_out";
        this.settleWaiters(id, "timeout");
      }, timeoutMs);
      const waiter = (o: ApprovalOutcome): void => {
        clearTimeout(timer);
        resolve(o);
      };
      const set = this.waiters.get(id) ?? new Set<(o: ApprovalOutcome) => void>();
      set.add(waiter);
      this.waiters.set(id, set);
    });
  }

  pending(): ApprovalItem[] {
    return this.items.filter((i) => i.status === "pending").map((i) => this.snapshot(i));
  }

  /** Reject every still-pending item (e.g. when the kill switch trips), unblocking any waiter. */
  rejectAllPending(): void {
    for (const item of this.items) if (item.status === "pending") this.reject(item.id);
  }

  all(): ApprovalItem[] {
    return this.items.map((i) => this.snapshot(i));
  }

  find(id: string): ApprovalItem | undefined {
    const item = this.live(id);
    return item ? this.snapshot(item) : undefined;
  }

  /**
   * Record the operator's approval. The signed §14 receipt is REQUIRED: without it the approval is an
   * unsigned assertion, which is exactly the evidence gap this exists to close. A caller with no
   * receipt cannot approve.
   */
  approve(id: string, receipt: ApprovalReceipt): ApprovalItem | undefined {
    const item = this.live(id);
    if (item && item.status === "pending") {
      item.status = "approved";
      // CLONED on the way in, like every other path through this class. Stored by reference, the
      // caller's later mutation of `scope` or `references` rewrote the live queue artifact — the signed
      // record of what a human approved, changed after the fact by whoever still held the object.
      item.receipt = cloneReceipt(receipt);
      this.settleWaiters(id, "approved", receipt);
    }
    return item ? this.snapshot(item) : undefined;
  }

  reject(id: string): ApprovalItem | undefined {
    const item = this.live(id);
    if (item && item.status === "pending") {
      item.status = "rejected";
      this.settleWaiters(id, "rejected");
    }
    return item ? this.snapshot(item) : undefined;
  }
}
