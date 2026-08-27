/**
 * Circuit breakers & anomaly detection (M5).
 *
 * These guards are CUMULATIVE — they judge the agent's behaviour over a window,
 * independent of whether any single action passes policy (M3). An agent that
 * makes 200 individually-valid price changes in a minute is anomalous.
 *
 *   Rate limiter      caps set_price count per rolling window (e.g. 15/hour,
 *                     burst 5/5min).
 *   Magnitude limiter caps cumulative revenue impact per window (e.g. $50k/hour).
 *   Anomaly detector  compares this window's action rate to a learned baseline
 *                     via a z-score, producing NORMAL/MINOR/SIGNIFICANT/EXTREME.
 *
 * Graduated response: MINOR logs, SIGNIFICANT alerts, EXTREME (or any hard
 * limiter breach) HALTS. All state is in-memory in the control plane; the
 * policy server reports each proposed action and gets back an allow/halt verdict.
 */

export type AnomalyLevel = "NORMAL" | "MINOR" | "SIGNIFICANT" | "EXTREME";

export interface Baseline {
  avgActionsPerHour: number;
  stdDevActionsPerHour: number;
}

export interface BreakerConfig {
  rate: { maxPerHour: number; burstMaxPer5Min: number };
  magnitude: { maxRevenueImpactPerHour: number };
  baseline: Baseline;
}

export const DEFAULT_BREAKER_CONFIG: BreakerConfig = {
  rate: { maxPerHour: 15, burstMaxPer5Min: 5 },
  magnitude: { maxRevenueImpactPerHour: 50_000 },
  baseline: { avgActionsPerHour: 8, stdDevActionsPerHour: 3 },
};

export interface ProposedActionImpact {
  sku: string;
  currentPrice: number;
  newPrice: number;
  estimatedWeeklyUnits: number;
}

export interface BreakerVerdict {
  allow: boolean;
  level: AnomalyLevel;
  /** Reasons that fired, e.g. ["rate_limit_hour", "magnitude_limit"]. */
  reasons: string[];
  metrics: {
    actionsThisHour: number;
    actionsThis5Min: number;
    cumulativeRevenueImpactThisHour: number;
    anomalyZScore: number;
  };
}

interface ActionEvent {
  at: number; // epoch ms
  revenueImpact: number;
}

const HOUR_MS = 60 * 60 * 1000;
const FIVE_MIN_MS = 5 * 60 * 1000;

/** Revenue impact of a proposed change = |Δprice| * estimated weekly units. */
export function revenueImpact(a: ProposedActionImpact): number {
  return Math.abs(a.newPrice - a.currentPrice) * a.estimatedWeeklyUnits;
}

export class CircuitBreakers {
  private events: ActionEvent[] = [];

  constructor(private readonly config: BreakerConfig = DEFAULT_BREAKER_CONFIG) {}

  private prune(now: number): void {
    // Keep only the last hour of events (the widest window we evaluate).
    this.events = this.events.filter((e) => now - e.at <= HOUR_MS);
  }

  private countSince(now: number, windowMs: number): number {
    return this.events.filter((e) => now - e.at <= windowMs).length;
  }

  private revenueSince(now: number, windowMs: number): number {
    return this.events
      .filter((e) => now - e.at <= windowMs)
      .reduce((sum, e) => sum + e.revenueImpact, 0);
  }

  private anomalyLevel(actionsThisHour: number): { level: AnomalyLevel; z: number } {
    const { avgActionsPerHour, stdDevActionsPerHour } = this.config.baseline;
    const z =
      stdDevActionsPerHour > 0
        ? (actionsThisHour - avgActionsPerHour) / stdDevActionsPerHour
        : 0;
    if (z > 3) return { level: "EXTREME", z };
    if (z > 2) return { level: "SIGNIFICANT", z };
    if (z > 1.5) return { level: "MINOR", z };
    return { level: "NORMAL", z };
  }

  /**
   * Evaluate a proposed action WITHOUT recording it. Returns whether it may
   * proceed and why. If it would breach a hard limiter or push anomaly to
   * EXTREME, allow=false (the caller should halt).
   */
  evaluate(action: ProposedActionImpact, now: number = Date.now()): BreakerVerdict {
    this.prune(now);
    const impact = revenueImpact(action);

    // Prospective counts INCLUDING this action.
    const actionsThisHour = this.countSince(now, HOUR_MS) + 1;
    const actionsThis5Min = this.countSince(now, FIVE_MIN_MS) + 1;
    const cumulativeRevenueImpactThisHour = this.revenueSince(now, HOUR_MS) + impact;

    const reasons: string[] = [];
    if (actionsThisHour > this.config.rate.maxPerHour) reasons.push("rate_limit_hour");
    if (actionsThis5Min > this.config.rate.burstMaxPer5Min) reasons.push("rate_limit_burst");
    if (cumulativeRevenueImpactThisHour > this.config.magnitude.maxRevenueImpactPerHour) {
      reasons.push("magnitude_limit");
    }

    const { level, z } = this.anomalyLevel(actionsThisHour);
    if (level === "EXTREME") reasons.push("anomaly_extreme");

    const allow = reasons.length === 0;
    return {
      allow,
      level,
      reasons,
      metrics: {
        actionsThisHour: actionsThisHour - 1, // reported = already-recorded count
        actionsThis5Min: actionsThis5Min - 1,
        cumulativeRevenueImpactThisHour: cumulativeRevenueImpactThisHour - impact,
        anomalyZScore: Number(z.toFixed(2)),
      },
    };
  }

  /** Record an action that actually executed (updates the windows). */
  record(action: ProposedActionImpact, now: number = Date.now()): void {
    this.prune(now);
    this.events.push({ at: now, revenueImpact: revenueImpact(action) });
  }

  /** Current window metrics for the dashboard/status endpoint. */
  snapshot(now: number = Date.now()): BreakerVerdict["metrics"] & { level: AnomalyLevel } {
    this.prune(now);
    const actionsThisHour = this.countSince(now, HOUR_MS);
    const { level, z } = this.anomalyLevel(actionsThisHour);
    return {
      actionsThisHour,
      actionsThis5Min: this.countSince(now, FIVE_MIN_MS),
      cumulativeRevenueImpactThisHour: this.revenueSince(now, HOUR_MS),
      anomalyZScore: Number(z.toFixed(2)),
      level,
    };
  }

  reset(): void {
    this.events = [];
  }
}
