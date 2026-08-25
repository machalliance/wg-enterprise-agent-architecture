/**
 * SQLite-backed commerce catalog.
 *
 * Uses Node's built-in `node:sqlite` (stable in Node 22.5+/24) so there is no
 * native build step or third-party driver. The catalog is seeded from
 * seed/catalog.json on first run and is idempotent: existing rows are left
 * untouched so prices the agent has changed survive a restart (M2 relies on
 * durable commerce state).
 */

import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = process.env.SEED_DIR
  ? resolve(process.env.SEED_DIR)
  : resolve(__dirname, "..", "..", "..", "seed");
/** Default DB path: alongside the package (packages/mcp-commerce/catalog.db). */
const DEFAULT_DB_PATH = resolve(__dirname, "..", "catalog.db");

export interface PriceRecord {
  sku: string;
  price: number;
  cost: number;
  category: string;
  lastChanged: string;
  channel: string;
}

export interface SetPriceResult {
  success: boolean;
  sku: string;
  previousPrice: number;
  newPrice: number;
  error?: string;
}

export interface PromoStatus {
  active: boolean;
  type: string | null;
  discount: number | null;
  endsAt: string | null;
}

interface SeedEntry {
  sku: string;
  name: string;
  category: string;
  cost: number;
  currentPrice: number;
}

export class CommerceDb {
  private readonly db: DatabaseSync;

  constructor(dbPath: string = process.env.MCP_COMMERCE_DB || DEFAULT_DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.migrate();
    this.seedIfEmpty();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS products (
        sku          TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        category     TEXT NOT NULL,
        cost         REAL NOT NULL,
        price        REAL NOT NULL,
        channel      TEXT NOT NULL DEFAULT 'web',
        last_changed TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS promotions (
        sku      TEXT PRIMARY KEY,
        type     TEXT NOT NULL,
        discount REAL NOT NULL,
        ends_at  TEXT NOT NULL,
        FOREIGN KEY (sku) REFERENCES products(sku)
      );
      CREATE TABLE IF NOT EXISTS price_history (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        sku            TEXT NOT NULL,
        previous_price REAL NOT NULL,
        new_price      REAL NOT NULL,
        reason         TEXT,
        changed_at     TEXT NOT NULL
      );
    `);
  }

  private seedIfEmpty(): void {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM products").get() as {
      n: number;
    };
    if (row.n > 0) return;

    const catalog = JSON.parse(
      readFileSync(resolve(SEED_DIR, "catalog.json"), "utf8"),
    ) as { skus: SeedEntry[] };

    const now = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO products (sku, name, category, cost, price, channel, last_changed)
       VALUES (?, ?, ?, ?, ?, 'web', ?)`,
    );
    this.db.exec("BEGIN");
    try {
      for (const s of catalog.skus) {
        insert.run(s.sku, s.name, s.category, s.cost, s.currentPrice, now);
      }
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
  }

  getCurrentPrice(sku: string): PriceRecord | undefined {
    const row = this.db
      .prepare(
        `SELECT sku, price, cost, category, channel, last_changed AS lastChanged
         FROM products WHERE sku = ?`,
      )
      .get(sku) as
      | { sku: string; price: number; cost: number; category: string; channel: string; lastChanged: string }
      | undefined;
    if (!row) return undefined;
    return {
      sku: row.sku,
      price: row.price,
      cost: row.cost,
      category: row.category,
      lastChanged: row.lastChanged,
      channel: row.channel,
    };
  }

  getMargin(sku: string): { sku: string; cost: number; price: number; marginPct: number } | undefined {
    const rec = this.getCurrentPrice(sku);
    if (!rec) return undefined;
    const marginPct = rec.price > 0 ? Number((((rec.price - rec.cost) / rec.price) * 100).toFixed(2)) : 0;
    return { sku, cost: rec.cost, price: rec.price, marginPct };
  }

  /**
   * Update a price. This is the write surface the agent reaches only through
   * AgentGateway. The MCP server itself does not enforce policy (that is the
   * gateway's job in M1/M3); it records the change and its history.
   */
  setPrice(sku: string, newPrice: number, reason: string): SetPriceResult {
    const rec = this.getCurrentPrice(sku);
    if (!rec) {
      return { success: false, sku, previousPrice: 0, newPrice, error: "unknown_sku" };
    }
    if (!Number.isFinite(newPrice) || newPrice <= 0) {
      return { success: false, sku, previousPrice: rec.price, newPrice, error: "invalid_price" };
    }
    const now = new Date().toISOString();
    this.db.exec("BEGIN");
    try {
      this.db
        .prepare("UPDATE products SET price = ?, last_changed = ? WHERE sku = ?")
        .run(newPrice, now, sku);
      this.db
        .prepare(
          `INSERT INTO price_history (sku, previous_price, new_price, reason, changed_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(sku, rec.price, newPrice, reason, now);
      this.db.exec("COMMIT");
    } catch (err) {
      this.db.exec("ROLLBACK");
      throw err;
    }
    return { success: true, sku, previousPrice: rec.price, newPrice };
  }

  getPromoStatus(sku: string): PromoStatus {
    const row = this.db
      .prepare("SELECT type, discount, ends_at AS endsAt FROM promotions WHERE sku = ?")
      .get(sku) as { type: string; discount: number; endsAt: string } | undefined;
    if (!row) return { active: false, type: null, discount: null, endsAt: null };
    const active = new Date(row.endsAt).getTime() > Date.now();
    return { active, type: row.type, discount: row.discount, endsAt: row.endsAt };
  }

  close(): void {
    this.db.close();
  }
}
