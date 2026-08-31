import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommerceDb } from "./db.js";

/**
 * Commerce catalog (M0). The system of record. It deliberately enforces NO
 * policy — below-cost writes succeed here, because the policy gate lives one
 * layer up (the policy MCP server, M3). These tests pin that boundary: the DB is
 * a faithful store, not a second place where policy silently lives.
 *
 * Each test gets a fresh temp DB seeded from the real seed/catalog.json.
 */

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meridian-commerce-"));
  dbPath = join(dir, "catalog.db");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("commerce db", () => {
  it("seeds the catalog from the shipped seed data", () => {
    const db = new CommerceDb(dbPath);
    const rec = db.getCurrentPrice("MER-TENT-3S");
    assert.ok(rec, "the hero SKU is seeded");
    assert.ok(rec.price > 0, "with a positive price");
    assert.equal(rec.channel, "web");
    db.close();
  });

  it("computes margin from cost and price", () => {
    const db = new CommerceDb(dbPath);
    const m = db.getMargin("MER-TENT-3S");
    assert.ok(m, "margin is available");
    assert.ok(m.cost > 0 && m.price > m.cost, "cost below price");
    // marginPct is (price - cost) / price * 100, to 2dp.
    const expected = Number((((m.price - m.cost) / m.price) * 100).toFixed(2));
    assert.equal(m.marginPct, expected);
    db.close();
  });

  it("sets a price and records the change in history", () => {
    const db = new CommerceDb(dbPath);
    const before = db.getCurrentPrice("MER-TENT-3S")!.price;
    const result = db.setPrice("MER-TENT-3S", before + 6, "match competitor");
    assert.equal(result.success, true);
    assert.equal(result.previousPrice, before);
    assert.equal(result.newPrice, before + 6);
    assert.equal(db.getCurrentPrice("MER-TENT-3S")!.price, before + 6, "the new price is live");
    db.close();
  });

  it("allows a below-cost price — policy is enforced upstream, not here", () => {
    const db = new CommerceDb(dbPath);
    const cost = db.getMargin("MER-TENT-3S")!.cost;
    // This MUST succeed at the DB layer. If it ever starts failing, policy has
    // leaked down into the system of record — the exact coupling M3 avoids.
    const result = db.setPrice("MER-TENT-3S", cost - 10, "below cost on purpose");
    assert.equal(result.success, true, "the DB is not a policy layer");
    db.close();
  });

  it("rejects an invalid (non-positive) price", () => {
    const db = new CommerceDb(dbPath);
    const result = db.setPrice("MER-TENT-3S", 0, "bad");
    assert.equal(result.success, false);
    assert.equal(result.error, "invalid_price");
    db.close();
  });

  it("returns an error result for an unknown SKU", () => {
    const db = new CommerceDb(dbPath);
    assert.equal(db.getCurrentPrice("NOPE-123"), undefined);
    const result = db.setPrice("NOPE-123", 10, "x");
    assert.equal(result.success, false);
    assert.equal(result.error, "unknown_sku");
    db.close();
  });

  it("persists a price change across a 'restart' (reopen the same file)", () => {
    const db = new CommerceDb(dbPath);
    db.setPrice("MER-TENT-3S", 12345, "durability check");
    db.close();

    // Reopen: seedIfEmpty must NOT overwrite the changed price (idempotent seed).
    const reopened = new CommerceDb(dbPath);
    assert.equal(reopened.getCurrentPrice("MER-TENT-3S")!.price, 12345, "the change survived the restart");
    reopened.close();
  });

  it("reports no promo by default", () => {
    const db = new CommerceDb(dbPath);
    const promo = db.getPromoStatus("MER-TENT-3S");
    assert.equal(promo.active, false);
    db.close();
  });
});
