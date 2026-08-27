import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { shouldInjectControlToken, requiresRequestMarker, checkBasicAuth } from "./server.mjs";

/**
 * Dashboard proxy + auth (CodeRabbit findings): the buyer control token must never reach a supplier
 * stream (#14), and the published port is gated by HTTP Basic Auth (#15).
 *
 * Two predicates, deliberately NOT the same set:
 *   - `requiresRequestMarker` — CSRF defense, and therefore STATE-CHANGING routes only. A GET cannot
 *     change state, so demanding a same-origin header on one buys nothing and breaks `curl`.
 *   - `shouldInjectControlToken` — AUTHENTICATION, so it also covers the two control-plane reads
 *     (`/audit`, `/record`) that return the counterparty's agreed terms and message history.
 */

describe("requiresRequestMarker", () => {
  it("covers exactly the state-changing routes", () => {
    for (const p of ["/start", "/kill", "/approvals/abc-123/approve", "/approvals/abc-123/reject",
      "/settlement/neg-1/approve-funding", "/settlement/neg-1/reject-funding", "/settlement/neg-1/refresh"]) {
      assert.equal(requiresRequestMarker(p), true, `${p} must require the same-origin marker`);
    }
    // The retired escrow release/dispute routes no longer exist.
    assert.equal(requiresRequestMarker("/settlement/neg-1/release"), false);
    assert.equal(requiresRequestMarker("/settlement/neg-1/dispute"), false);
  });
  it("does NOT apply to idempotent reads — CSRF is not the threat on a GET", () => {
    for (const p of ["/audit", "/record", "/state", "/approvals", "/settlement", "/events/summit"]) {
      assert.equal(requiresRequestMarker(p), false, `${p} is a GET and must not demand the marker`);
    }
  });
});

describe("shouldInjectControlToken", () => {
  it("injects on every state-changing control route", () => {
    for (const p of ["/start", "/kill", "/approvals/abc-123/approve", "/approvals/abc-123/reject",
      "/settlement/neg-1/approve-funding", "/settlement/neg-1/reject-funding", "/settlement/neg-1/refresh"]) {
      assert.equal(shouldInjectControlToken(p), true, `${p} must carry the control token`);
    }
    assert.equal(shouldInjectControlToken("/settlement/neg-1/release"), false);
    assert.equal(shouldInjectControlToken("/settlement/neg-1/dispute"), false);
  });
  it("injects on EVERY gated read — the buyer's whole control-plane read surface", () => {
    // The buyer gates these, so the proxy must authenticate to them or the dashboard's own panels break.
    // Reads, but not harmless ones: settlement snapshots carry per-supplier totals and deposit
    // addresses, /state.outcomes carries every rival's agreed terms and tier, and /approvals carries the
    // full terms of deals not yet committed. Listed exhaustively so a NEW buyer read has to be
    // classified here deliberately rather than defaulting to open and being caught a round later.
    for (const p of ["/audit", "/record", "/settlement", "/state", "/approvals"]) {
      assert.equal(shouldInjectControlToken(p), true, `${p} is a gated read and must carry the token`);
    }
  });
  it("NEVER injects on a SUPPLIER event stream — the token must not leak to a counterparty process", () => {
    // The buyer's control token would give a supplier authority over the kill switch and the approval
    // queue. Whatever else changes about the route table, these four must stay false.
    for (const p of ["/events/summit", "/events/cascade", "/events/alpine", "/events/ridge", "/index.html"]) {
      assert.equal(shouldInjectControlToken(p), false, `${p} must not receive the control token`);
    }
  });

  it("DOES inject on the buyer's own stream — it is gated, and the token is the buyer's own secret", () => {
    // /events/buyer replays the buyer's trail, including `commit-selection`, which names every rival
    // supplier's best-and-final terms. The buyer gates it; the proxy must authenticate or the dashboard
    // loses its own event feed.
    assert.equal(shouldInjectControlToken("/events/buyer"), true);
  });
});

describe("checkBasicAuth", () => {
  it("is open when no password is configured (demo default)", () => {
    assert.equal(checkBasicAuth(undefined, "operator", ""), true);
  });
  it("accepts the correct credentials and rejects everything else", () => {
    const good = "Basic " + Buffer.from("operator:s3cret").toString("base64");
    assert.equal(checkBasicAuth(good, "operator", "s3cret"), true);
    assert.equal(checkBasicAuth("Basic " + Buffer.from("operator:wrong").toString("base64"), "operator", "s3cret"), false);
    assert.equal(checkBasicAuth("Basic " + Buffer.from("intruder:s3cret").toString("base64"), "operator", "s3cret"), false);
    assert.equal(checkBasicAuth(undefined, "operator", "s3cret"), false, "missing header rejected when a password is set");
    assert.equal(checkBasicAuth("Bearer xyz", "operator", "s3cret"), false, "non-Basic scheme rejected");
    assert.equal(checkBasicAuth("Basic !!!notbase64:::", "operator", "s3cret"), false);
  });
});
