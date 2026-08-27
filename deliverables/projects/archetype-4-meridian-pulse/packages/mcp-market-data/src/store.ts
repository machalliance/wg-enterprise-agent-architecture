/**
 * In-memory market-data store.
 *
 * Holds the mutable view of the world the agent perceives: competitor prices,
 * demand signals, and inventory levels. The scenario driver mutates this store
 * over time; the MCP tools read from it. Nothing here is persisted — market
 * perception is intentionally ephemeral (the durable state that matters is the
 * agent's own context, handled in M2).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
/** seed/ lives at the repo root: packages/mcp-market-data/dist -> ../../../seed */
const SEED_DIR = process.env.SEED_DIR
  ? resolve(process.env.SEED_DIR)
  : resolve(__dirname, "..", "..", "..", "seed");

export interface CompetitorQuote {
  name: string;
  price: number;
  timestamp: string;
}

export type DemandTrend = "rising" | "falling" | "stable";

export interface DemandSignal {
  trend: DemandTrend;
  magnitude: number; // fractional change, e.g. 0.40 = +40%
  reason: string;
  updatedAt: string;
}

export interface InventoryLevel {
  onHand: number;
  reorderPoint: number;
  estimatedWeeklyUnits: number;
}

export interface CatalogEntry {
  sku: string;
  name: string;
  category: string;
  cost: number;
  currentPrice: number;
  onHand: number;
  reorderPoint: number;
  estimatedWeeklyUnits: number;
  hero?: boolean;
  flagged?: boolean;
}

interface SkuState {
  entry: CatalogEntry;
  competitors: CompetitorQuote[];
  demand: DemandSignal;
  inventory: InventoryLevel;
}

export class MarketDataStore {
  private readonly skus = new Map<string, SkuState>();
  /** Baseline competitor prices, kept so flash-crash events can be reverted. */
  private readonly competitorBaseline = new Map<string, CompetitorQuote[]>();

  constructor() {
    this.loadSeed();
  }

  private loadSeed(): void {
    const catalog = JSON.parse(
      readFileSync(resolve(SEED_DIR, "catalog.json"), "utf8"),
    ) as { skus: CatalogEntry[] };
    const competitors = JSON.parse(
      readFileSync(resolve(SEED_DIR, "competitors.json"), "utf8"),
    ) as { baselines: Record<string, { name: string; price: number }[]> };

    const now = new Date().toISOString();

    for (const entry of catalog.skus) {
      const rawQuotes = competitors.baselines[entry.sku] ?? [];
      const quotes: CompetitorQuote[] = rawQuotes.map((q) => ({
        name: q.name,
        price: q.price,
        timestamp: now,
      }));

      this.competitorBaseline.set(
        entry.sku,
        quotes.map((q) => ({ ...q })),
      );

      this.skus.set(entry.sku, {
        entry,
        competitors: quotes,
        demand: {
          trend: "stable",
          magnitude: 0,
          reason: "Baseline demand at season start.",
          updatedAt: now,
        },
        inventory: {
          onHand: entry.onHand,
          reorderPoint: entry.reorderPoint,
          estimatedWeeklyUnits: entry.estimatedWeeklyUnits,
        },
      });
    }
  }

  hasSku(sku: string): boolean {
    return this.skus.has(sku);
  }

  listSkus(): {
    sku: string;
    name: string;
    category: string;
    currentPrice: number;
    demandTrend: DemandTrend;
    demandMagnitude: number;
  }[] {
    return [...this.skus.values()].map((s) => ({
      sku: s.entry.sku,
      name: s.entry.name,
      category: s.entry.category,
      currentPrice: s.entry.currentPrice,
      // Surface the demand signal here so the agent's triage step can SEE which
      // SKUs are moving and choose to look closer — otherwise a spike on a SKU
      // it doesn't habitually check goes unnoticed within its per-cycle budget.
      demandTrend: s.demand.trend,
      demandMagnitude: s.demand.magnitude,
    }));
  }

  getCompetitorPrices(sku: string): CompetitorQuote[] | undefined {
    return this.skus.get(sku)?.competitors.map((q) => ({ ...q }));
  }

  getDemandSignal(sku: string): DemandSignal | undefined {
    const d = this.skus.get(sku)?.demand;
    return d ? { ...d } : undefined;
  }

  getInventoryLevel(sku: string): InventoryLevel | undefined {
    const inv = this.skus.get(sku)?.inventory;
    if (!inv) return undefined;
    return {
      ...inv,
      // weeksOfCover derived on read so it always reflects current on-hand.
    };
  }

  // --- mutations used by the scenario driver -------------------------------

  setCompetitorPrice(sku: string, competitor: string, newPrice: number): boolean {
    const state = this.skus.get(sku);
    if (!state) return false;
    const now = new Date().toISOString();
    const existing = state.competitors.find((c) => c.name === competitor);
    if (existing) {
      existing.price = newPrice;
      existing.timestamp = now;
    } else {
      state.competitors.push({ name: competitor, price: newPrice, timestamp: now });
    }
    return true;
  }

  setDemandSignal(
    sku: string,
    trend: DemandTrend,
    magnitude: number,
    reason: string,
  ): boolean {
    const state = this.skus.get(sku);
    if (!state) return false;
    state.demand = { trend, magnitude, reason, updatedAt: new Date().toISOString() };
    return true;
  }

  adjustInventory(sku: string, onHandDelta: number): boolean {
    const state = this.skus.get(sku);
    if (!state) return false;
    state.inventory.onHand = Math.max(0, state.inventory.onHand + onHandDelta);
    return true;
  }

  /** Set every competitor quote from `source` to `newPrice` (the M5 glitch). */
  bulkSetCompetitorPriceBySource(source: string, newPrice: number): number {
    let affected = 0;
    const now = new Date().toISOString();
    for (const state of this.skus.values()) {
      for (const quote of state.competitors) {
        if (quote.name === source) {
          quote.price = newPrice;
          quote.timestamp = now;
          affected++;
        }
      }
    }
    return affected;
  }

  /**
   * Multiply every competitor quote from `source` by `factor` (the M5 glitch, in
   * its realistic form). A "they fat-fingered a 75% discount across the whole
   * catalog" incident is each quote dropping to `factor` of its own value — not
   * every SKU snapping to one flat number, which a capable agent spots as bogus.
   * factor 0.25 = 75% off. Rounded to cents.
   */
  bulkMultiplyCompetitorPriceBySource(source: string, factor: number): number {
    let affected = 0;
    const now = new Date().toISOString();
    for (const state of this.skus.values()) {
      for (const quote of state.competitors) {
        if (quote.name === source) {
          quote.price = Math.round(quote.price * factor * 100) / 100;
          quote.timestamp = now;
          affected++;
        }
      }
    }
    return affected;
  }

  /** Restore every quote from `source` back to its seeded baseline value. */
  restoreCompetitorBaselineBySource(source: string): number {
    let restored = 0;
    const now = new Date().toISOString();
    for (const [sku, state] of this.skus.entries()) {
      const baseline = this.competitorBaseline.get(sku) ?? [];
      for (const quote of state.competitors) {
        if (quote.name !== source) continue;
        const base = baseline.find((b) => b.name === source);
        if (base) {
          quote.price = base.price;
          quote.timestamp = now;
          restored++;
        }
      }
    }
    return restored;
  }
}
