import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  loadScenario,
  loadSigner,
  makeEventHub,
  openHalfTrail,
  OPERATOR_DID,
  type ApprovalReceipt,
  type Trail,
} from "@meridian/agent-runtime";
import type { Terms } from "@meridian/protocol";
import { loadMandate, privateValues } from "./mandate.js";
import { assertStructureHidesSecrets } from "./leak-lint.js";
import { Governor } from "./governor.js";
import type { NegotiationOutcome } from "./negotiate.js";
import type { ClearedCandidate } from "./pipeline.js";
import { createBuyerApp, REQUEST_MARKER, type BuyerAppDeps } from "./server-app.js";
import { loadSettlementPolicy } from "./settlement.js";

/**
 * The buyer's control-plane HTTP surface — the kill switch, the approval buttons, the money-moving
 * settlement actions, and the two authorisation gates in front of them.
 *
 * NONE of this had a unit test before `createBuyerApp` existed, because importing `server.ts` bound a
 * port and started a real procurement run. Everything covering these routes went through a browser
 * against a full demo, which is slow enough to run rarely and coarse enough that it cannot say WHICH
 * gate refused a request — and "which gate" is the entire question for an endpoint that moves money.
 *
 * The suite is built around the distinction that matters most: `requireControlToken` runs OPEN when no
 * token is configured (the zero-config demo default) while `requireControlTokenStrict` FAILS CLOSED, and
 * the difference is what stands between an unauthenticated caller and an irreversible stablecoin
 * transfer. It is asserted on one app instance, so it cannot pass by testing two different setups.
 */

const scenario = loadScenario();
const mandate = loadMandate(scenario);
const operatorSigner = loadSigner(OPERATOR_DID);
const nullTrail: Trail = { append() {} };

const TERMS: Terms = { sku: mandate.sku, units: 100, unitPriceUsd: 92, leadTimeDays: 14, deliveryTerms: "DDP" };

interface Harness {
  server: Server;
  base: string;
  governor: Governor;
  outcomes: NegotiationOutcome[];
  cleared: ClearedCandidate[];
  started: () => boolean;
}

/** Boot the app on an ephemeral port with real collaborators but no directory, transport or Stripe. */
function boot(overrides: { controlToken?: string } = {}): Promise<Harness> {
  const governor = new Governor(mandate);
  const outcomes: NegotiationOutcome[] = [];
  const cleared: ClearedCandidate[] = [];
  let started = false;
  const dir = mkdtempSync(join(tmpdir(), "buyer-app-"));
  const signer = loadSigner(scenario.shortfall.buyer);

  const deps: BuyerAppDeps = {
    scenario,
    buyerDid: scenario.shortfall.buyer,
    need: { name: scenario.shortfall.name, units: scenario.shortfall.unitsNeeded, deadlineDays: scenario.shortfall.deadlineDays },
    controlToken: overrides.controlToken ?? "",
    governor,
    trail: nullTrail,
    hub: makeEventHub("buyer-test"),
    halfTrail: openHalfTrail(join(dir, "buyer.half-trail.jsonl"), signer),
    operatorSigner,
    reasoning: { mode: "deterministic" },
    // Settlement OFF — the routes still exist, and the strict gate in front of them must reject BEFORE
    // reaching the "not enabled" 404. That ordering is the assertion, not an accident of this setup.
    settlement: null,
    settlementPolicy: loadSettlementPolicy({} as NodeJS.ProcessEnv),
    settlementReceipts: new Map<string, ApprovalReceipt[]>(),
    run: {
      isStarted: () => started,
      start: () => {
        started = true;
      },
      cleared: () => cleared,
      outcomes: () => outcomes,
    },
  };

  return new Promise((resolve) => {
    const server = createBuyerApp(deps).listen(0, "127.0.0.1", () => {
      const { port } = server.address() as AddressInfo;
      resolve({ server, base: `http://127.0.0.1:${port}`, governor, outcomes, cleared, started: () => started });
    });
  });
}

const close = (h: Harness): Promise<void> => new Promise((resolve) => h.server.close(() => resolve()));

/**
 * A parsed response body. Deliberately loose — `Response.json()` is `unknown`, and typing these against
 * the route's own return interface would make the assertions agree with the route by construction
 * instead of checking it.
 */
type JsonBody = Record<string, any>;
const json = async (res: Response): Promise<JsonBody> => (await res.json()) as JsonBody;

/** A request with whichever of the two headers the case under test means to supply. */
function call(
  h: Harness,
  method: "GET" | "POST",
  path: string,
  opts: { marker?: boolean; token?: string; body?: unknown } = {},
): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.marker) headers["x-requested-by"] = REQUEST_MARKER;
  if (opts.token !== undefined) headers["x-control-token"] = opts.token;
  return fetch(`${h.base}${path}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
}

describe("buyer control plane — the same-origin marker on state-changing routes", () => {
  let h: Harness;
  before(async () => {
    h = await boot();
  });
  after(() => close(h));

  it("rejects a state-changing request with no marker, even with no token configured", async () => {
    const res = await call(h, "POST", "/kill", { body: { reason: "test" } });
    assert.equal(res.status, 403);
    // The point of the gate: a cross-origin form POST cannot set this header, and with no token
    // configured nothing else was standing in front of the kill switch.
    assert.equal(h.governor.killSwitch.active, false, "the kill switch tripped despite the 403");
  });

  it("accepts it with the marker, and the switch actually trips", async () => {
    const res = await call(h, "POST", "/kill", { marker: true, body: { reason: "operator test" } });
    assert.equal(res.status, 200);
    assert.equal(h.governor.killSwitch.active, true);
    assert.match(h.governor.killSwitch.reason ?? "", /operator test/);
  });

  it("does not gate idempotent reads on the marker", async () => {
    // Reads are token-gated, not marker-gated: the dashboard polls them from page load, and a marker
    // requirement there would buy nothing (a cross-origin GET cannot read the response anyway).
    assert.equal((await call(h, "GET", "/state")).status, 200);
  });
});

describe("buyer control plane — the control token", () => {
  let h: Harness;
  before(async () => {
    h = await boot({ controlToken: "s3cret-token" });
  });
  after(() => close(h));

  it("rejects a read with no token when one is configured", async () => {
    assert.equal((await call(h, "GET", "/state")).status, 401);
  });

  it("rejects a wrong token of the SAME LENGTH", async () => {
    // Same length on purpose: `tokenMatches` short-circuits on unequal lengths before the constant-time
    // compare, so a different-length token would pass this test without the compare ever running.
    assert.equal((await call(h, "GET", "/state", { token: "s3cret-tokeX" })).status, 401);
  });

  it("accepts the right token", async () => {
    assert.equal((await call(h, "GET", "/state", { token: "s3cret-token" })).status, 200);
  });

  it("requires BOTH gates on a state-changing route", async () => {
    assert.equal((await call(h, "POST", "/kill", { token: "s3cret-token" })).status, 403, "marker missing");
    assert.equal((await call(h, "POST", "/kill", { marker: true })).status, 401, "token missing");
    assert.equal((await call(h, "POST", "/kill", { marker: true, token: "s3cret-token" })).status, 200);
  });
});

describe("buyer control plane — settlement routes fail closed where the others run open", () => {
  let h: Harness;
  before(async () => {
    // NO control token: the zero-config demo default, and the configuration in which the two gates
    // deliberately disagree.
    h = await boot();
  });
  after(() => close(h));

  it("the money-moving actions 401 with no token configured", async () => {
    for (const path of ["/settlement/x/approve-funding", "/settlement/x/reject-funding", "/settlement/x/refresh"]) {
      const res = await call(h, "POST", path, { marker: true });
      assert.equal(res.status, 401, `${path} did not fail closed`);
      // 401 from the GATE, not 404 from "settlement not enabled" — the rejection must happen before the
      // route body runs, or the gate's behaviour would depend on whether Stripe happened to be configured.
      assert.match((await json(res)).error, /CONTROL_TOKEN/);
    }
  });

  it("...while the ordinary control routes run open in the same app", async () => {
    // Same instance, same missing token. If this ever 401s the two gates have been collapsed into one and
    // the zero-config demo is broken; if the block above ever 200s, settlement has been left open.
    assert.equal((await call(h, "POST", "/start", { marker: true })).status, 200);
    assert.equal((await call(h, "GET", "/settlement")).status, 200, "the settlement READ is not strict-gated");
  });
});

describe("buyer control plane — route contracts", () => {
  let h: Harness;
  before(async () => {
    h = await boot();
  });
  after(() => close(h));

  it("/start is idempotent and reports which call did the starting", async () => {
    const first = await json(await call(h, "POST", "/start", { marker: true }));
    assert.deepEqual({ started: first.started, alreadyRunning: first.alreadyRunning }, { started: true, alreadyRunning: false });
    const second = await json(await call(h, "POST", "/start", { marker: true }));
    assert.equal(second.alreadyRunning, true);
    assert.equal(h.started(), true);
  });

  it("/state never carries a private mandate number", async () => {
    // The same structural lint the wire and prompt use — values, not characters, so `96.0` and `9.6e1`
    // are caught too. `/state` is the one route the dashboard polls continuously, so a leak here is
    // continuous.
    h.cleared.push({ ad: { did: "did:web:x", agentName: "X" } as ClearedCandidate["ad"], level: "VERIFIED" });
    h.outcomes.push({
      supplierDid: "did:web:x",
      agentName: "X",
      negotiationId: "n1",
      result: "SETTLED",
      tier: "AUTONOMOUS_SETTLE",
      terms: TERMS,
      rounds: 3,
      detail: "settled",
    });
    const body = await json(await call(h, "GET", "/state"));
    assert.equal(body.outcomes.length, 1, "the fixture outcome did not reach /state — the lint would be vacuous");
    assertStructureHidesSecrets(body, privateValues(mandate), "GET /state");
  });

  it("/audit refuses an unknown supplier and reports a session that has not run", async () => {
    assert.equal((await call(h, "GET", "/audit?supplier=nope")).status, 400);
    const known = scenario.suppliers[0]!.id;
    const body = await json(await call(h, "GET", `/audit?supplier=${known}`));
    assert.equal(body.terminal, false);
  });

  it("/audit reports an escalated session as a NON-terminal pause, not an outcome", async () => {
    // §14.2: AWAITING_HUMAN_APPROVAL is explicitly non-terminal. Emitting an audit log here would assert
    // the session ended while it is still waiting on a person.
    const supplier = scenario.suppliers[1]!;
    h.outcomes.push({
      supplierDid: supplier.did,
      agentName: supplier.id,
      negotiationId: "n2",
      result: "ESCALATE",
      tier: "APPROVE_BEFORE_COMMIT",
      terms: TERMS,
      rounds: 4,
      detail: "held for a human",
    });
    const body = await json(await call(h, "GET", `/audit?supplier=${supplier.id}`));
    assert.equal(body.terminal, false);
    assert.equal(body.state, "AWAITING_HUMAN_APPROVAL");
  });

  it("/record reports no settle rather than inventing one", async () => {
    const supplier = scenario.suppliers[2]!;
    const body = await json(await call(h, "GET", `/record?supplier=${supplier.id}`));
    assert.equal(body.settled, false);
  });

  it("/approvals/:id/approve 404s an id that is not pending", async () => {
    assert.equal((await call(h, "POST", "/approvals/does-not-exist/approve", { marker: true })).status, 404);
    assert.equal((await call(h, "POST", "/approvals/does-not-exist/reject", { marker: true })).status, 404);
  });

  it("/approvals/:id/approve mints an operator-signed receipt for a real pending item", async () => {
    const item = h.governor.approvals.enqueue({
      supplierDid: "did:web:x",
      agentName: "X",
      negotiationId: "n3",
      terms: TERMS,
      tier: "APPROVE_BEFORE_COMMIT",
      reason: "over the autonomous band",
      offerHash: "offer-hash-1",
      amountUsd: TERMS.unitPriceUsd * TERMS.units,
      thresholdUsd: mandate.tiers.notifyOnSettle.priceAtOrBelow * TERMS.units,
    });
    const res = await call(h, "POST", `/approvals/${item.id}/approve`, { marker: true });
    assert.equal(res.status, 200);
    const body = await json(res);
    // The receipt is signed by the OPERATOR, a different principal from the agent — an agent signing its
    // own over-mandate approval would prove nothing, which is the entire reason the receipt exists.
    assert.equal(body.receipt.signer_did, OPERATOR_DID);
    assert.equal(body.item.status, "approved");
  });
});
