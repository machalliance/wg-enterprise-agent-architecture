import type { Terms, TrustLevel } from "@meridian/protocol";
import { requestedUnits, type Mandate } from "./mandate.js";

/**
 * The tier a set of terms falls into under the mandate — the book's four tiers, made executable.
 * This is the ONE decision everything turns on: given a committable offer and how much the
 * counterparty is trusted, what may the agent do with it?
 *
 *   AUTONOMOUS_SETTLE     Tier 1 — commit with no human. The summit path.
 *   NOTIFY_ON_SETTLE      Tier 2 — commit, then tell the buying team. (settle, still no approval)
 *   APPROVE_BEFORE_COMMIT Tier 3 — HOLD; a human must approve before any ACCEPT. The alpine path.
 *   PROHIBITED            Tier 4 — never commit; walk away if pushed. The ridgeline path.
 */
export type Tier =
  | "AUTONOMOUS_SETTLE"
  | "NOTIFY_ON_SETTLE"
  | "APPROVE_BEFORE_COMMIT"
  | "PROHIBITED";

/** The two settle tiers — the ones where the buyer actually commits (with or without a notification). */
export function isSettleTier(tier: Tier): boolean {
  return tier === "AUTONOMOUS_SETTLE" || tier === "NOTIFY_ON_SETTLE";
}

/**
 * Classify a standing offer against the private mandate and the counterparty's trust level. Notice
 * what this function does NOT take: the counterparty's identity, message history, or anything the
 * seller could influence beyond the terms it actually offered. The reservation price is READ here and
 * never returned — it shapes the decision without ever being nameable on the wire.
 *
 * Ordering matters. A hard block (rejected trust, price above reservation, unmeetable deadline, a
 * delivery clause the buyer never approved) is Tier 4 BEFORE any tier band is consulted — you cannot
 * "settle autonomously" into a prohibited deal just because the price looks good.
 */
export function classify(mandate: Mandate, terms: Terms, trust: TrustLevel): Tier {
  // Tier 4 — hard blocks.
  if (trust === "REJECTED") return "PROHIBITED";
  if (terms.unitPriceUsd > mandate.reservationUnitPriceUsd) return "PROHIBITED";
  if (terms.leadTimeDays > mandate.deadlineDays) return "PROHIBITED";
  if (!mandate.approvedDeliveryTerms.includes(terms.deliveryTerms)) return "PROHIBITED";
  // The per-deal unit cap is a hard block on the ACCEPT path too, not just on buyer counters
  // (counterTerms): a supplier-offered quantity above it must never settle autonomously. An oversized
  // shortfall is filled through valid split procurement, never one over-cap deal no human approved.
  if (terms.units > mandate.maxUnitsPerDeal) return "PROHIBITED";

  const t = mandate.tiers;
  // EXACTLY the quantity this buyer ASKED FOR, not "at least" it. `>=` treated a surplus as satisfying
  // the requirement, so a supplier answering a 100-unit RFQ with 200 units cleared the autonomous tier
  // and the buyer bought — and paid for — twice what it needed, with no human in the loop. The per-deal
  // cap above does not catch this: an excess that stays under `maxUnitsPerDeal` is exactly the case that
  // slipped through.
  //
  // Both directions fall to APPROVE_BEFORE_COMMIT rather than settling: a short quantity already did
  // (see tier 3 below), and a surplus is the same kind of mismatch between what was asked for and what
  // is on the table.
  //
  // Measured against `requestedUnits`, NOT `mandate.unitsNeeded`. Those are the same number until the
  // shortfall exceeds `maxUnitsPerDeal`, and then they diverge in the worst way: `counterTerms` asks
  // each supplier for the capped quantity, so a supplier answering that ask EXACTLY was graded a
  // partial fill and held for a human, while a supplier offering the full shortfall was PROHIBITED by
  // the per-deal cap above. Split procurement — the documented behaviour for an oversized shortfall —
  // had no path that could settle at all. The paragraph this comment replaced asserted the opposite.
  const fullQuantity = terms.units === requestedUnits(mandate);

  // Tier 1 — fully autonomous. Requires VERIFIED trust, full quantity, and terms inside the tightest
  // band. LIMITED trust can never reach here (it falls through to APPROVE_BEFORE_COMMIT below).
  if (
    trust === "VERIFIED" &&
    fullQuantity &&
    terms.unitPriceUsd <= t.autonomousSettle.priceAtOrBelow &&
    terms.leadTimeDays <= t.autonomousSettle.leadTimeAtOrBelow
  ) {
    return "AUTONOMOUS_SETTLE";
  }

  // Tier 2 — settle but notify the team.
  if (
    trust === "VERIFIED" &&
    fullQuantity &&
    terms.unitPriceUsd <= t.notifyOnSettle.priceAtOrBelow &&
    terms.leadTimeDays <= t.notifyOnSettle.leadTimeAtOrBelow
  ) {
    return "NOTIFY_ON_SETTLE";
  }

  // Tier 3 — inside the reservation but beyond the notify band, a partial quantity, or LIMITED trust:
  // committable only with a human in the loop.
  return "APPROVE_BEFORE_COMMIT";
}
