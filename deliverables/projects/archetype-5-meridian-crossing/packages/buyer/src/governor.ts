import type { Terms } from "@meridian/protocol";
import type { Mandate } from "./mandate.js";
import type { Tier } from "./classify.js";
import { CommitmentLedger, dealValueUsd } from "./commitments.js";
import { ReputationBook } from "./reputation.js";
import { ApprovalQueue } from "./approval-queue.js";
import { KillSwitch } from "./kill-switch.js";
import { OversightChannel } from "./oversight.js";

/**
 * `bindSettle` found no reservation to promote. A DISTINCT type because the settle path's catch has to
 * tell it apart from every other failure there: everything else in that catch threw with the ACCEPT
 * already on the wire ("we did not hear back" — the reservation must stand), while this one threw
 * BEFORE the send, so nothing reached the supplier and the deal is severed, not unknown. Reporting
 * `settle-unknown` for it would tell an operator a payment might be outstanding when none is.
 */
export class SettleBindError extends Error {
  override readonly name = "SettleBindError";
}

/**
 * The Governor bundles the buyer's private policy state that is SHARED across every concurrent
 * negotiation: the mandate, the cross-deal commitment ledger, the reputation book, the approval queue,
 * the kill switch, and the oversight channel. One Governor per buyer run; each negotiation consults it.
 *
 * The single most important method is `authorizeSettle`. The tier logic (classify) decides a deal is
 * *commercially* committable; this decides whether it may ACTUALLY settle right now given the shared
 * safeguards — kill switch, suspend-on-disconnect, and the cross-deal cap. Any of them can turn a
 * would-be settle into a hold. This is where "policy governs what the agent may commit YOU to" stops
 * being about one deal and becomes about the buyer's whole exposure.
 */
export class Governor {
  readonly ledger: CommitmentLedger;
  readonly reputation: ReputationBook;
  readonly approvals: ApprovalQueue;
  readonly killSwitch: KillSwitch;
  readonly oversight: OversightChannel;

  constructor(
    readonly mandate: Mandate,
    opts: {
      ledger?: CommitmentLedger;
      reputation?: ReputationBook;
      approvals?: ApprovalQueue;
      killSwitch?: KillSwitch;
      oversight?: OversightChannel;
    } = {},
  ) {
    this.ledger = opts.ledger ?? new CommitmentLedger(mandate.maxTotalCommittedUsd, mandate.unitsNeeded);
    this.reputation = opts.reputation ?? ReputationBook.fromSeed();
    this.approvals = opts.approvals ?? new ApprovalQueue();
    this.killSwitch = opts.killSwitch ?? new KillSwitch();
    this.oversight = opts.oversight ?? new OversightChannel();
    // The kill switch's money-side action: release every reservation not yet committed on trip.
    // (Block bodies so the listeners return void, not the discarded revoked-id arrays.)
    this.killSwitch.onTrip(() => { this.ledger.releaseAllPending(); });
    // A trip also unblocks any negotiation waiting on a human approval: reject the pending holds
    // so the coroutine wakes and severs the deal instead of hanging until the approval window elapses.
    this.killSwitch.onTrip(() => { this.approvals.rejectAllPending(); });
  }

  /**
   * Decide whether a tier-approved settle may proceed NOW. Runs the shared safeguards in order:
   *   1. kill switch tripped        → no settle (the run is being torn down)
   *   2. oversight channel down      → suspend-on-disconnect: hold rather than commit un-reportably
   *   3. cross-deal cap breached     → hold: this deal + everything else committed exceeds the cap
   * On success it RESERVES the deal value against the cap (a pending hold a concurrent negotiation will
   * see immediately) and returns ok. On any failure it returns a reason the caller escalates with.
   */
  authorizeSettle(
    negotiationId: string,
    supplierDid: string,
    terms: Terms,
  ): { ok: true } | { ok: false; reason: string } {
    if (this.killSwitch.active) {
      return { ok: false, reason: `kill switch active (${this.killSwitch.reason})` };
    }
    if (!this.oversight.connected) {
      return { ok: false, reason: "oversight channel down — new commitments suspended" };
    }
    const reserve = this.ledger.tryReserve(negotiationId, supplierDid, dealValueUsd(terms), terms.units);
    if (!reserve.ok) return { ok: false, reason: reserve.reason ?? "cross-deal spend cap" };
    return { ok: true };
  }

  /**
   * Promote this settle's reservation to committed BEFORE its ACCEPT goes on the wire.
   *
   * The binding moment is the send, not the reply — "THE ACCEPT IS THE SETTLE", per `settle()` in
   * negotiate.ts. While the reservation stayed `pending` across that await, a kill switch tripping
   * mid-flight ran `releaseAllPending()` and deleted the hold for a deal the buyer was already bound
   * to; `confirmSettle` then found nothing to promote and silently committed nothing. The deal
   * disappeared from the ledger, `committedUsd()` under-reported, and the freed headroom was available
   * to the next negotiation.
   *
   * Committing first makes the hold survive both the kill switch and the release path, which is the
   * fail-safe direction: the worst case is exposure reported for an ACCEPT that failed to serialize
   * locally, and `settle()` already chose to hold the reservation on every failure in that window
   * rather than free money against a deal whose fate it cannot know.
   *
   * THROWS when there is no reservation left to promote, rather than doing nothing.
   *
   * Be precise about why, because the reachability is not obvious. `releaseAllPending()` is what could
   * delete this hold, and the kill switch runs it from a timer or an HTTP handler — so it can only
   * interleave at an `await`. Today there is NO await between `authorizeSettle` and this call:
   * `settle()` reserves, builds the envelope, and calls `exchangeSettling`, whose body runs
   * synchronously right through to `channel.send`. So the window is currently closed, and the silent
   * `if (r)` was passing on that accident rather than on a guarantee.
   *
   * That is exactly the kind of invariant that dies quietly. One `await` added anywhere in that stretch
   * — a signer that becomes async, a pre-send policy check, an audit write — reopens it, and the old
   * behaviour was to send the ACCEPT anyway: the buyer bound to a deal its own ledger had forgotten,
   * `committedUsd()` under-reporting, and the freed headroom handed to the next negotiation. That is
   * the failure the note above claims to have fixed, so it must not be able to return unannounced.
   *
   * Throwing is safe by the reasoning `exchangeSettling` already records: this runs BEFORE the bytes
   * leave, so a local failure here is the one window where severing costs nothing. The caller must
   * treat it as a sever, never a retry — a retry would re-enter a settle whose money was revoked on
   * purpose. Neither call site wraps `runNegotiation` in a retry; a throw propagates out as a walked
   * negotiation, which is the intended outcome.
   */
  bindSettle(negotiationId: string): void {
    if (!this.ledger.commit(negotiationId)) {
      throw new SettleBindError(
        `no reservation to bind for ${negotiationId} — the hold was released before the ACCEPT was sent ` +
          `(kill switch: ${this.killSwitch.active ? this.killSwitch.reason : "not active"}). Severing rather than sending.`,
      );
    }
  }

  /** Confirm a settle whose ACCEPT is away. The ledger hold was already committed by `bindSettle`;
   *  `commit` is idempotent, so this stays correct for callers that settle without the pre-bind. */
  confirmSettle(negotiationId: string, supplierDid: string, terms: Terms, tier: Tier): void {
    this.ledger.commit(negotiationId);
    if (tier === "NOTIFY_ON_SETTLE") {
      // The return value is CHECKED. `notify` answers false when the channel is down, and discarding that
      // meant the one tier whose entire definition is "settle, but tell a human" could commit a deal with
      // nobody told and nothing recording that fact. The ledger commit stands either way — the deal is
      // real and must be on the books — but the missed notification is now queued on the channel (it
      // flushes on reconnect) and reported here, because silence is the one outcome this must not produce.
      const delivered = this.oversight.notify({
        kind: "settle",
        supplierDid,
        negotiationId,
        message: `settled ${terms.units}u @ $${terms.unitPriceUsd}/u — notify-on-settle tier`,
      });
      if (!delivered) {
        console.error(
          "[governor] NOTIFY_ON_SETTLE deal committed but the oversight channel is DOWN — notification queued for reconnect.",
          { negotiationId, supplierDid, units: terms.units, unitPriceUsd: terms.unitPriceUsd },
        );
      }
    }
  }

  /** Release a reservation for a settle that did not confirm (or was revoked). */
  abandonSettle(negotiationId: string): void {
    this.ledger.release(negotiationId);
  }
}
