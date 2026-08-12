import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Relationship drift detection. Every settled deal can pass per-deal policy and still,
 * over time, trend AGAINST the buyer — a supplier that quietly ratchets its price up deal after deal,
 * each one just inside the envelope. Per-deal policy never catches this; comparing a counterparty's
 * settlements over time does. The flag is advisory: it does not block a deal, it tells the buying team
 * to look at a relationship that is drifting.
 *
 * Seeded from seed/history.json so the flag is reproducible; in production this reads the buyer's own
 * settlement trail.
 */
export interface PastSettlement {
  at: string;
  unitPriceUsd: number;
  units: number;
  leadTimeDays: number;
}

export interface DriftFlag {
  supplierDid: string;
  flagged: boolean;
  firstPriceUsd: number;
  lastPriceUsd: number;
  totalRiseUsd: number;
  detail: string;
}

interface HistoryFile {
  settlements: Record<string, PastSettlement[]>;
}

function historyPath(): string {
  return fileURLToPath(new URL("../../../seed/history.json", import.meta.url));
}

export function loadHistory(): Record<string, PastSettlement[]> {
  const path = historyPath();
  if (!existsSync(path)) return {};
  try {
    const settlements = (JSON.parse(readFileSync(path, "utf8")) as HistoryFile).settlements ?? {};
    // detectDrift treats array order as time order (first/last price, adjacent-pair monotonicity), so
    // sort each supplier's settlements chronologically here — unordered history would mis-flag drift.
    // `at` is an ISO-8601 timestamp, so lexical order is chronological order.
    for (const list of Object.values(settlements)) list.sort((a, b) => a.at.localeCompare(b.at));
    return settlements;
  } catch {
    return {};
  }
}

/**
 * Flag a counterparty whose price is monotonically rising across its settlements. `minRiseUsd` is the
 * total climb (first→last) that counts as drift rather than noise.
 */
export function detectDrift(
  supplierDid: string,
  settlements: PastSettlement[],
  minRiseUsd = 3,
): DriftFlag {
  const base: DriftFlag = {
    supplierDid,
    flagged: false,
    firstPriceUsd: settlements[0]?.unitPriceUsd ?? 0,
    lastPriceUsd: settlements[settlements.length - 1]?.unitPriceUsd ?? 0,
    totalRiseUsd: 0,
    detail: "insufficient history",
  };
  if (settlements.length < 2) return base;

  let monotonic = true;
  for (let i = 1; i < settlements.length; i++) {
    const cur = settlements[i];
    const prev = settlements[i - 1];
    if (cur && prev && cur.unitPriceUsd < prev.unitPriceUsd) monotonic = false;
  }
  const rise = base.lastPriceUsd - base.firstPriceUsd;
  const flagged = monotonic && rise >= minRiseUsd;
  return {
    ...base,
    totalRiseUsd: Number(rise.toFixed(2)),
    flagged,
    detail: flagged
      ? `price rose $${rise.toFixed(2)}/u across ${settlements.length} settlements ` +
        `($${base.firstPriceUsd} → $${base.lastPriceUsd}) — each deal passed policy, the trend did not`
      : `no sustained upward drift across ${settlements.length} settlements`,
  };
}
