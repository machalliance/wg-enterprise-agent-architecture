import type { Terms } from "@meridian/protocol";

/**
 * The cross-deal spend cap, extended outward from Archetype 4's spend limits. The book's point:
 * the cap is ACROSS concurrent deals, not per deal. Two negotiations that each pass per-deal policy
 * can still, together, breach the buyer's total exposure — so the check must be shared state, checked
 * atomically the instant before an ACCEPT goes out.
 *
 * A "reservation" is money the buyer is about to promise: `authorizeSettle` holds it the instant before
 * the ACCEPT goes out, so a concurrent deal sees the exposure immediately. It is finalized once the
 * ACCEPT is away (the ACCEPT IS the settle) or released if the send fails. Because Node is single-threaded,
 * `tryReserve` is a synchronous check-and-hold: concurrent negotiations serialize at that call, so the
 * cap can never be double-spent by two ACCEPTs racing.
 *
 * In settlement this same number becomes the bound on the agent's scoped payment authorization (Stripe Shared
 * Payment Token): the policy that governs what the agent may COMMIT TO and the credential that governs
 * what it can SPEND are the same cap, enforced twice.
 */

export function dealValueUsd(terms: Terms): number {
  return terms.unitPriceUsd * terms.units;
}

export interface Reservation {
  negotiationId: string;
  supplierDid: string;
  amountUsd: number;
  /** Units this deal would commit — reserved against the shortfall so two deals cannot each claim it. */
  units: number;
  state: "pending" | "committed";
}

export interface ReserveResult {
  ok: boolean;
  /** Present when ok=false: the shortfall that would have breached the cap. */
  reason?: string;
}

export class CommitmentLedger {
  private readonly reservations = new Map<string, Reservation>();

  /**
   * @param capUsd   the cross-deal spend cap (a private mandate number).
   * @param capUnits the total units the buyer needs — reserved across deals so concurrent settles cannot
   *                 each commit the SAME shortfall. `unitsNeeded` is public (from the scenario), unlike
   *                 the dollar cap. Defaults to unbounded for callers that only exercise the spend cap.
   */
  constructor(
    private readonly capUsd: number,
    private readonly capUnits: number = Number.POSITIVE_INFINITY,
  ) {}

  /** Sum of every pending + committed reservation — the buyer's current total dollar exposure. */
  committedUsd(): number {
    let total = 0;
    for (const r of this.reservations.values()) total += r.amountUsd;
    return total;
  }

  /** Sum of every pending + committed reservation's units — the shortfall already spoken for. */
  committedUnits(): number {
    let total = 0;
    for (const r of this.reservations.values()) total += r.units;
    return total;
  }

  remainingUsd(): number {
    return Math.max(0, this.capUsd - this.committedUsd());
  }

  remainingUnits(): number {
    return Math.max(0, this.capUnits - this.committedUnits());
  }

  /**
   * Atomically check both caps and, if there is room, hold `amountUsd`/`units` as a pending reservation.
   * Returns ok=false WITHOUT reserving when the deal would push total spend OR total units past their cap
   * — the caller then escalates that deal instead of settling it. Rejects non-finite/non-positive amounts
   * and non-integer/negative unit counts up front. Idempotent per negotiationId ONLY when the repeated
   * call carries the SAME supplier, amount, and units; a differing re-reservation is a conflict, not a
   * silent no-op.
   */
  tryReserve(negotiationId: string, supplierDid: string, amountUsd: number, units = 0): ReserveResult {
    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return { ok: false, reason: "invalid reservation amount" };
    }
    if (!Number.isInteger(units) || units < 0) {
      return { ok: false, reason: "invalid reservation units" };
    }
    const existing = this.reservations.get(negotiationId);
    if (existing) {
      return existing.supplierDid === supplierDid && existing.amountUsd === amountUsd && existing.units === units
        ? { ok: true }
        : { ok: false, reason: "reservation conflicts with an existing hold on this negotiation" };
    }
    if (this.committedUsd() + amountUsd > this.capUsd) {
      return {
        ok: false,
        // Names only public figures (committed spend + this deal's value are both derivable from wire
        // prices). The cap itself is a private mandate number — it is NEVER put in this reason, because
        // this reason surfaces in the buyer's trail (streamed to the dashboard) and the approval UI.
        reason:
          `cross-deal spend cap reached: committed $${this.committedUsd().toLocaleString()} + this deal $` +
          `${amountUsd.toLocaleString()} exceeds the buyer's private cap`,
      };
    }
    if (this.committedUnits() + units > this.capUnits) {
      // unitsNeeded is public, so this reason may name the figures without leaking a private number.
      return {
        ok: false,
        reason:
          `cross-deal unit cap reached: committed ${this.committedUnits().toLocaleString()}u + this deal ` +
          `${units.toLocaleString()}u exceeds the ${this.capUnits.toLocaleString()}u shortfall`,
      };
    }
    this.reservations.set(negotiationId, {
      negotiationId,
      supplierDid,
      amountUsd,
      units,
      state: "pending",
    });
    return { ok: true };
  }

  /**
   * Promote a pending reservation to committed once its settling ACCEPT is away.
   *
   * RETURNS whether there was anything to promote. `if (r) r.state = …` alone made a missing reservation
   * indistinguishable from a promoted one, and missing is a real state: the kill switch's
   * `releaseAllPending()` can delete a still-pending hold in the window between `authorizeSettle` and
   * `bindSettle`. The caller then committed nothing, reported nothing, and sent the ACCEPT anyway — the
   * buyer bound to a deal its own ledger had no record of, with the freed headroom handed to the next
   * negotiation. Silence was the whole bug, so the answer is now a value callers must act on.
   */
  commit(negotiationId: string): boolean {
    const r = this.reservations.get(negotiationId);
    if (!r) return false;
    r.state = "committed";
    return true;
  }

  /**
   * Release a reservation — a settle that fell through, or one revoked by the kill switch.
   *
   * PENDING ONLY. A committed reservation is money the buyer has already promised with a sent ACCEPT,
   * and per the module note above there is no un-commit: dropping it would under-report exposure and
   * hand the freed headroom to a later deal, which is precisely the double-spend the cross-deal cap
   * exists to prevent. Both callers (`abandonSettle` on a kill-switch sever, and the kill switch's own
   * sweep) are severing deals that never reached the wire, so this narrowing costs them nothing.
   */
  release(negotiationId: string): void {
    const r = this.reservations.get(negotiationId);
    if (r?.state === "pending") this.reservations.delete(negotiationId);
  }

  /** Release EVERY still-pending reservation (deals that have not yet sent their ACCEPT). The
   *  kill switch's money-side action. */
  releaseAllPending(): string[] {
    const revoked: string[] = [];
    for (const [id, r] of this.reservations) {
      if (r.state === "pending") {
        revoked.push(id);
        this.reservations.delete(id);
      }
    }
    return revoked;
  }

  snapshot(): Reservation[] {
    return [...this.reservations.values()];
  }
}
