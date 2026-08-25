import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { bannerHtml } from "./public/banner.js";

/**
 * Scenario banner (regression): the header read "negotiates with 0 suppliers" for an entire run.
 *
 * `pollState()` rendered the banner behind a `bannerSet` boolean that latched on first write. The first
 * /state poll lands BEFORE Start, when `cleared` is already `[]` — an array, so the guard passed — so
 * the banner was written once with n=0 and then never again. Three suppliers cleared, three negotiations
 * ran to settlement, and the header still said 0; only a manual reload (which re-polls into a fresh
 * `bannerSet = false`) ever showed the right number. The panels were correct throughout, which is what
 * made it easy to miss.
 *
 * Two properties, and the second is the one that actually broke:
 *   1. the number shown is the number that CLEARED the trust gate, not the number discovered
 *   2. it TRACKS — a later, larger count replaces an earlier one
 */

const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const NEED = { name: "Ridgeline 3-Season Tent", units: 100, deadlineDays: 21 };

describe("bannerHtml", () => {
  it("claims no number before anything has cleared the trust gate", () => {
    const html = bannerHtml(NEED, 0, esc);
    // The bug's signature. Saying "0 suppliers" while three panels negotiate is worse than saying nothing.
    assert.ok(!/\b0\b\s*<\/b>\s*suppliers|>0<\/b> suppliers/.test(html), "must not render a zero count");
    assert.ok(!html.includes("negotiates with <b>0</b>"), "must not render a zero count");
    assert.match(html, /negotiates with competing suppliers in parallel/);
    assert.match(html, /Ridgeline 3-Season Tent/);
  });

  it("shows the cleared count once suppliers have cleared", () => {
    assert.match(bannerHtml(NEED, 3, esc), /negotiates with <b>3<\/b> suppliers in parallel/);
  });

  it("says 'supplier' when exactly one cleared", () => {
    const html = bannerHtml(NEED, 1, esc);
    assert.match(html, /negotiates with <b>1<\/b> supplier in parallel/);
    assert.ok(!html.includes("1</b> suppliers"));
  });

  it("tracks — the pre-Start render and the post-discovery render differ", () => {
    // Exactly the sequence the latch broke: poll once at 0, poll again at 3.
    assert.notEqual(bannerHtml(NEED, 0, esc), bannerHtml(NEED, 3, esc));
  });

  it("renders the buyer's ask with the units and deadline", () => {
    assert.match(bannerHtml(NEED, 3, esc), /needs <b>100<\/b> × <b>Ridgeline 3-Season Tent<\/b> within <b>21 days<\/b>/);
  });

  it("escapes the need, which is interpolated into innerHTML", () => {
    const html = bannerHtml({ ...NEED, name: "<img src=x onerror=alert(1)>" }, 2, esc);
    assert.ok(!html.includes("<img"), "a scenario name must not reach innerHTML as live markup");
    assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  });

  it("survives a missing need without throwing", () => {
    assert.doesNotThrow(() => bannerHtml(undefined, 0, esc));
  });
});

describe("pollState wiring", () => {
  const appJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "public", "app.js"), "utf8");

  it("renders the banner through bannerHtml rather than inlining the sentence again", () => {
    assert.match(appJs, /bannerHtml\(s\.need, bannerCount, esc\)/);
  });

  it("has no render-once latch — that is the bug", () => {
    // A boolean that is set after the first write is exactly what pinned the count at 0.
    assert.ok(!/bannerSet/.test(appJs), "bannerSet latch must not come back");
    assert.match(appJs, /s\.cleared\.length !== bannerCount/, "the render must be gated on the count changing");
  });
});
