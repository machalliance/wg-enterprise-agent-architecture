import {
  initTelemetry,
  llmConfigFromEnv,
  loadScenario,
  loadSigner,
  type ApprovalReceipt,
  OPERATOR_DID,
  makeEventHub,
  makeTransport,
  openHalfTrail,
  openTrail,
  trailPath,
} from "@meridian/agent-runtime";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { detectDrift, loadHistory } from "./drift.js";
import { makeReasoner } from "./llm.js";
import { probeIllegalTransition, type NegotiationOutcome } from "./negotiate.js";
import { tamperDemo } from "./probes.js";
import { discoverStable, negotiateAll, screenCandidates, type ClearedCandidate } from "./pipeline.js";
import { dealValueUsd } from "./commitments.js";
import { SettlementManager, loadSettlementPolicy, stripeGatewayFromEnv } from "./settlement.js";
import { createBuyerApp } from "./server-app.js";

/**
 * The buyer — the ONLY entry point. It keeps the process alive, PACES its turns so an audience can
 * watch, and exposes an HTTP surface the dashboard drives: its own event stream (SSE), a kill switch,
 * the approval queue, and the settlement panel. It holds the live `Governor`, so the kill and approve
 * buttons act on the negotiations actually in flight — not on a snapshot.
 *
 * There used to be a second, batch entry point (`index.ts`, reached via `pnpm discover`) that ran the
 * same pipeline and exited. It was deleted because nothing in the demo path invoked it, which meant the
 * two adversarial proofs it carried — the tamper test and the illegal-transition probe — were only ever
 * seen by someone who went looking for them. Both now run here, in the flow an audience watches.
 *
 * This file is WIRING ONLY: read the environment, build the real dependencies, hand them to
 * `createBuyerApp`, listen, and drive the flow. The routes themselves live in server-app.ts as a function
 * of their dependencies, so they can be constructed with test doubles instead of a running procurement.
 *
 * It still consumes and produces ONLY this org's own trail + half-trail. `GET /events` streams the
 * buyer's trail; the dashboard opens a separate stream per supplier. There is no shared feed.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const { product, unitsNeeded, deadlineDays } = scenario.shortfall;

/** A numeric env var, rejecting anything that is not one. `Number("")` is 0 and `Number("abc")` is NaN,
 *  and both sailed through: a NaN `TURN_DELAY_MS` makes every `setTimeout` fire immediately (so the
 *  pacing that keeps the demo watchable silently vanishes), and a 0/NaN port binds somewhere arbitrary
 *  or throws deep inside `listen`. Matches `supplierPort` in agent-runtime, including empty-means-unset. */
function numberFromEnv(name: string, fallback: number, opts: { integer?: boolean; min?: number; max?: number } = {}): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  const { integer = false, min = 0, max = Number.MAX_SAFE_INTEGER } = opts;
  if (!Number.isFinite(n) || (integer && !Number.isInteger(n)) || n < min || n > max) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a number"} in ${min}-${max}, got '${raw}'`);
  }
  return n;
}

const HTTP_PORT = numberFromEnv("BUYER_HTTP_PORT", 41100, { integer: true, min: 1, max: 65535 });
// This paces the BUYER's turns, so the deterministic flow is about ten of them (measured: ~10s end to end
// at 1000ms). Under `pnpm demo` the value is almost always the launcher's per-mode default — 2000ms for
// `--web`, where a human reads the turns and needs a window to hit the kill switch in, and 0 for the
// terminal run, which nobody narrates (see infra/demo.mjs). The 1000ms here is the fallback for a server
// started DIRECTLY, e.g. `pnpm --filter @meridian/buyer serve`, where no launcher has an opinion: paced
// enough to be watchable, fast enough not to waste a verification run. Not purely cosmetic either way —
// pacing also consumes the mandate's wall-clock budget, so runs at different paces are not
// price-comparable.
const PACE_MS = numberFromEnv("TURN_DELAY_MS", 1000);
// When set, the flow does NOT run at boot — it waits for POST /start (the dashboard's Start button).
// This is what stops the demo from finishing before the operator has opened the page. Unset (the
// terminal `pnpm demo`), the flow runs immediately as before.
const AWAIT_START = process.env.AWAIT_START === "1";
const APPROVAL_TIMEOUT_MS = numberFromEnv("APPROVAL_TIMEOUT_MS", 600_000);
// Shared secret for the state-changing control endpoints (kill, approve, reject). The dashboard proxy
// injects it as `x-control-token`; a direct caller must present it too. Enforced only when set — the
// zero-config demo runs without one, but then we warn, because an unauthenticated kill switch reachable
// by anything that can hit this port is exactly the gap we are closing.
const CONTROL_TOKEN = process.env.CONTROL_TOKEN ?? "";
// The optional settlement layer, behind the `--usdc` flag (demo.mjs sets USDC_SETTLEMENT=1). Off by
// default: the negotiation demo is unchanged unless you opt in. When on, a committed deal is paid via a
// real Stripe crypto PaymentIntent — USDC on the Tempo network, captured on-chain (see settlement.ts).
const USDC_SETTLEMENT = process.env.USDC_SETTLEMENT === "1";
// Terminal-only mode has no dashboard, so the human-approval button has no actuator. This flag (set by
// the launcher ONLY for terminal `--usdc`, never for `--web`) lets the CLI demo auto-approve payment so
// the full money flow still runs. It is an EXPLICIT signal, not inferred from AWAIT_START — so a server
// that happens to run without AWAIT_START can never silently auto-approve while a dashboard is attached.
const SETTLEMENT_AUTO_APPROVE = process.env.SETTLEMENT_AUTO_APPROVE === "1";

const tracer = initTelemetry("buyer");
const hub = makeEventHub("buyer");
const trail = openTrail(trailPath("buyer.jsonl"), hub);
const transport = makeTransport();
const signer = loadSigner(buyerDid);
/** Operator receipts for PAYMENT approvals, keyed by session. The tier-escalation receipts live on the
 *  approval queue items; these have no queue of their own, so the audit log needs them kept here. */
const settlementReceipts = new Map<string, ApprovalReceipt[]>();

// The human operator's own key — a SEPARATE principal from this agent (see infra/identity). It signs
// the A2CN §14 ApprovalReceipts, so a deal beyond the agent's mandate carries proof a PERSON authorised
// it; an agent signing its own approvals would prove nothing.
const operatorSigner = loadSigner(OPERATOR_DID);
const halfTrail = openHalfTrail(trailPath("buyer.half-trail.jsonl"), signer);
const mandate = loadMandate(scenario);
const governor = new Governor(mandate);
const reasoner = makeReasoner();
// The settlement layer (only live when USDC_SETTLEMENT is set AND a Stripe key is configured). Its events
// flow onto the buyer's OWN trail, so the dashboard's settlement panel is fed by the same SSE stream as
// everything else — no side channel. Without STRIPE_SECRET_KEY the layer stays off with a startup warning.
const settlementPolicy = loadSettlementPolicy();
const stripeGateway = USDC_SETTLEMENT ? stripeGatewayFromEnv() : null;
const settlement =
  USDC_SETTLEMENT && stripeGateway
    ? new SettlementManager({ gateway: stripeGateway, policy: settlementPolicy, emit: (e) => trail.append({ ...e }) })
    : null;
// THE KILL SWITCH REACHING THE MONEY LAYER. The Governor wires the switch to the negotiation side
// (release uncommitted reservations, reject pending tier approvals); this is the third revocation, and it
// was missing. Without it the switch stopped every deal that had not yet bound while leaving a payment
// parked as PENDING_APPROVAL fully approvable — so an operator who had just hit the emergency stop could
// press "Create payment" and send real USDC. README, HOW-TO-DEMO and KillSwitch's own docstring all
// described this listener; nothing registered one.
//
// Registered HERE rather than inside the Governor because the Governor knows nothing about settlement, and
// the settlement layer is optional (it exists only under `--usdc` with a Stripe key). `onTrip` runs a
// listener registered after a trip immediately, so a late-constructed settlement layer still revokes.
if (settlement) governor.killSwitch.onTrip((reason) => settlement.revokeAuthorization(reason));

// Reasoning mode, for the startup log and the dashboard badge. `makeReasoner()` decides the same way
// (LLM when LLM_BASE_URL is set, else deterministic); this just reports it. Per-turn fallbacks on an
// LLM error still happen inside the reasoner — this reflects how the buyer is CONFIGURED to reason.
const llmConfig = llmConfigFromEnv("buyer");
const reasoning = llmConfig ? { mode: "llm" as const, model: llmConfig.model } : { mode: "deterministic" as const };

// State the control endpoints report on. Populated as the flow runs; never contains the reservation.
const cleared: ClearedCandidate[] = [];
const outcomes: NegotiationOutcome[] = [];
// Whether the flow has been kicked off. In AWAIT_START mode it flips only when POST /start arrives; the
// dashboard reads it (via /state) to show its Start button and swap it out once running.
let started = false;

/** Start the flow exactly once. Idempotent: a second call while running is a no-op. */
function startRun(): void {
  if (started) return;
  started = true;
  run().catch((err) => {
    console.error("[buyer] flow FAILED:", err);
    trail.append({ event: "flow-error", reason: String(err) });
  });
}

const app = createBuyerApp({
  scenario,
  buyerDid,
  need: { name: scenario.shortfall.name, units: unitsNeeded, deadlineDays },
  controlToken: CONTROL_TOKEN,
  governor,
  trail,
  hub,
  halfTrail,
  operatorSigner,
  reasoning,
  settlement,
  settlementPolicy,
  settlementReceipts,
  run: {
    isStarted: () => started,
    start: startRun,
    cleared: () => cleared,
    outcomes: () => outcomes,
  },
});

// Bind to loopback only: the agents are internal to the VM and reached solely via the dashboard proxy
// (see dashboard/server.mjs), so this control port must not be exposed on all host interfaces.
app.listen(HTTP_PORT, "127.0.0.1", () => {
  console.log(`[buyer] control + event server on http://localhost:${HTTP_PORT} (SSE at /events)`);
  console.log(
    llmConfig
      ? `[buyer] reasoning: LLM via ${llmConfig.baseUrl} (${llmConfig.model}) — falls back to deterministic per turn on error`
      : `[buyer] reasoning: deterministic (LLM_BASE_URL unset — set it to drive the agents with a model)`,
  );
  if (!CONTROL_TOKEN) {
    // Name every route this actually leaves open. The old text listed two of them, which understated
    // the exposure — and did so in the one message an operator reads before deciding whether the
    // default is safe enough for where they are running it. `requireControlToken` runs OPEN with no
    // token configured; only the settlement actions fail closed, so they are called out as the
    // exception rather than left to be inferred.
    console.warn(
      "[buyer] CONTROL_TOKEN is unset — these routes are UNAUTHENTICATED: " +
        "POST /start, POST /kill, POST /approvals/:id/approve|reject (state-changing), and " +
        "GET /state, /approvals, /audit, /record, /settlement (reads that expose counterparty terms). " +
        "The state-changing ones still require the x-requested-by marker, so a cross-origin page cannot " +
        "reach them — but anything that can set a header on this port can. " +
        "The money-moving /settlement/:id/* actions fail closed and return 401 regardless. " +
        "Set CONTROL_TOKEN (same value on the dashboard) to require a token.",
    );
  }
  if (settlement) {
    console.log(
      `[buyer] USDC settlement ON — committed deals are paid via a Stripe crypto PaymentIntent ` +
        `(USDC on Tempo, captured on-chain; deals over $${settlementPolicy.humanApprovalAboveUsd.toLocaleString()} ` +
        `need human approval to open the payment).`,
    );
  } else if (USDC_SETTLEMENT) {
    console.warn(
      "[buyer] --usdc requested but STRIPE_SECRET_KEY is unset — settlement is OFF. " +
        "Set STRIPE_SECRET_KEY (a Stripe test secret key) to enable Stripe crypto payments.",
    );
  }
});

// Capture sweep: re-poll Stripe for any payment still awaiting its on-chain deposit/capture, so a settle
// that outran its inline poll budget still resolves. Runs only when settlement is on; `unref` so it never
// keeps the process alive on its own.
if (settlement) {
  setInterval(() => {
    settlement
      .sweep()
      .then((captured) => {
        for (const id of captured) console.log(`[buyer] settlement ${id} captured on-chain (Stripe balance funded)`);
      })
      .catch((err) => console.error("[buyer] settlement capture sweep failed:", err));
  }, 2000).unref();
}

// ----------------------------------------------------------------------------------------------------
// The demo flow — the shared pipeline, with pacing, live human-in-the-loop approval, and settlement.
// ----------------------------------------------------------------------------------------------------

/**
 * Everything this entrypoint adds once a negotiation resolves: the console line, and the money.
 *
 * The `negotiation-end` trail record is deliberately NOT written here — `negotiateAll` writes it for both
 * entrypoints, because two hand-maintained copies of it had already drifted apart (see pipeline.ts).
 */
async function onResolved(o: NegotiationOutcome): Promise<void> {
  outcomes.push(o);
  console.log(`[buyer] ${o.agentName}: ${o.result}${o.tier ? ` [${o.tier}]` : ""} — ${o.detail}`);
  if (o.result !== "SETTLED") return;

  // A2CN §9: money moves only when BOTH parties independently derived the same transaction record.
  // `recordsAgree` was decided at settle time by comparing our own derived hash against the one the
  // supplier volunteered on its ACK — no supplier log is read here or anywhere else.
  const reconciled = o.recordsAgree === true;
  trail.append({
    event: "transaction-record",
    did: o.supplierDid,
    negotiationId: o.negotiationId,
    recordHash: o.recordHash,
    counterpartyRecordHash: o.counterpartyRecordHash,
    agree: o.recordsAgree,
  });
  // The money layer: a committed deal is PAID via a Stripe crypto PaymentIntent. Total comes from the
  // SETTLED terms; the draw is bounded by the buyer's remaining spend mandate (the same cap the ledger
  // already enforced on the reservation). Skipped when settlement is off, or if terms are somehow absent.
  if (!settlement || !o.terms) return;
  const totalUsd = dealValueUsd(o.terms);
  // Do NOT pay on a deal the two sides cannot prove they agree on. A failed (or absent) reconcile
  // blocks payment and is recorded — the operator can re-run reconcile from the dashboard.
  if (!reconciled) {
    console.error(`[buyer] payment NOT opened for ${o.agentName}: transaction records do not agree`);
    trail.append({
      event: "settlement-error",
      negotiationId: o.negotiationId,
      reason: "payment not opened: the two independently-derived transaction records do not agree",
    });
    return;
  }
  try {
    // Policy gate: under the threshold the agent pays itself; over it, this parks the deal as
    // PENDING_APPROVAL and waits for the operator's "Create payment" button (/settlement/:id/approve-funding).
    const { status } = await settlement.submit({
      negotiationId: o.negotiationId,
      agentName: o.agentName,
      sellerId: o.supplierDid,
      totalUsd,
      // Headroom that existed for THIS deal = current remaining + this deal's own reservation.
      mandateRemainingUsd: governor.ledger.remainingUsd() + totalUsd,
    });
    if (status === "funded") {
      console.log(`[buyer] payment settled autonomously for ${o.agentName} ($${totalUsd.toLocaleString()})`);
    } else if (SETTLEMENT_AUTO_APPROVE) {
      // Terminal `--usdc`: no operator UI exists to press the button, so the launcher set the
      // explicit auto-approve flag. Pay now so the CLI demo shows the full money flow — loudly,
      // because in --web mode this is exactly the step a human owns.
      await settlement.approveFunding(o.negotiationId);
      console.log(
        `[buyer] payment for ${o.agentName} ($${totalUsd.toLocaleString()}) is over the approval limit; ` +
          `terminal --usdc has no operator UI, so it was auto-approved (use --web to require a human button)`,
      );
    } else {
      // A human is at the dashboard — leave it PENDING_APPROVAL until the Create-payment button.
      console.log(`[buyer] payment for ${o.agentName} ($${totalUsd.toLocaleString()}) awaiting human approval to open`);
    }
  } catch (err) {
    // A throw is NOT proof the payment failed. `submit` sets DEPOSIT_SENT before it hands the transfer
    // over, and a failure from there on re-emits as CAPTURE_UNCONFIRMED and rethrows deliberately, leaving
    // the record non-terminal so `sweep()` keeps polling for the capture (settlement.ts). Filing that as
    // `settlement-error` wrote "settlement failed" into the audit trail for USDC that is on the chain and
    // very likely to capture — the one payment status this trail must not get wrong, and the record an
    // auditor would read as "no money moved".
    const inFlight = settlement?.get(o.negotiationId)?.state === "DEPOSIT_SENT";
    if (inFlight) {
      console.error(`[buyer] payment for ${o.agentName} is IN FLIGHT with capture unconfirmed:`, err);
      trail.append({
        event: "settlement-unconfirmed",
        negotiationId: o.negotiationId,
        state: "DEPOSIT_SENT",
        reason: String(err),
      });
    } else {
      console.error("[buyer] settlement failed:", err);
      trail.append({ event: "settlement-error", negotiationId: o.negotiationId, reason: String(err) });
    }
  }
}

async function run(): Promise<void> {
  // 1. Discover by capability — no supplier endpoint hardcoded.
  const candidates = await discoverStable(product);
  trail.append({ event: "discovered", product, count: candidates.length, candidates: candidates.map((c) => ({ did: c.ad.did, cid: c.cid })) });

  // 2-4. Shortfall, buyer-private policy, and the three-part identity check — every decision trailed
  //      inside `screenCandidates`. REJECTED is a hard block; VERIFIED/LIMITED may proceed.
  cleared.push(...screenCandidates(candidates, { unitsNeeded, deadlineDays }, trail));

  if (cleared.length === 0) {
    trail.append({ event: "no-suppliers-cleared" });
    console.error("[buyer] no suppliers cleared identity verification");
    return;
  }

  // 4b. Signature-integrity proof, BEFORE any negotiation opens. Deliberately-invalid traffic, so it runs
  //     against a VERIFIED counterparty only and never through a NegotiationSession — see probes.ts for
  //     why that placement is what keeps it out of the §9 record and §10 audit log.
  const verified = cleared.find((c) => c.level === "VERIFIED");
  if (verified) await tamperDemo({ transport, signer, buyerDid, ad: verified.ad, trail });

  trail.append({ event: "negotiation-start", suppliers: cleared.map((c) => c.ad.did), unitsNeeded });
  console.log(`[buyer] opening ${cleared.length} paced negotiation(s); pace=${PACE_MS}ms; kill switch armed`);

  // 5. Paced, parallel negotiations behind the shared commit barrier. Each outcome is recorded THE MOMENT
  //    its negotiation resolves — not after all of them — so one supplier's settle (and its payment) shows
  //    up while another is still blocking on the dashboard's approve/reject. An APPROVE_BEFORE_COMMIT
  //    escalation blocks on the operator's decision (or a timeout); approval drives the held deal to a
  //    real signed ACCEPT.
  await negotiateAll(
    cleared,
    { buyerDid, mandate, governor, transport, signer, trail, halfTrail, tracer, reasoner },
    {
      paceMs: PACE_MS,
      onEscalation: (item) => governor.approvals.awaitDecision(item.id, APPROVAL_TIMEOUT_MS),
      onResolved,
      onError: (err) => console.error("[buyer] a negotiation failed:", err),
    },
  );

  // 6. State-machine proof: pick a settled negotiation and attempt a COUNTER after it committed —
  //    refused locally by the buyer's own tracker AND on the wire by the supplier's. Runs after
  //    `negotiateAll` because it needs a deal that actually reached SETTLED.
  const settledOutcome = outcomes.find((o) => o.result === "SETTLED");
  if (settledOutcome) {
    const ad = cleared.find((c) => c.ad.did === settledOutcome.supplierDid)?.ad;
    if (ad) {
      await probeIllegalTransition(
        { transport, signer, buyerDid, ad, trail },
        settledOutcome.negotiationId,
        settledOutcome.lastCorrelationId ?? settledOutcome.negotiationId,
        settledOutcome.rounds,
      );
    }
  }

  // 7. Relationship drift — a counterparty whose settlements trend up over time, even while each single
  //    deal passes policy. Advisory, derived from the buyer's OWN settlement history across past runs.
  const history = loadHistory();
  for (const [did, settlements] of Object.entries(history)) {
    const flag = detectDrift(did, settlements);
    if (flag.flagged) {
      console.log(`[buyer] DRIFT FLAG ${did}: ${flag.detail}`);
      trail.append({ event: "drift-flag", did, ...flag });
    }
  }

  const summary = outcomes.map((o) => `${o.agentName}=${o.result}${o.tier ? `/${o.tier}` : ""}`).join(", ");
  trail.append({ event: "complete", discovered: candidates.length, cleared: cleared.length, summary });
  console.log(`[buyer] flow complete: ${summary}. Server stays up for the dashboard.`);
}

// Terminal mode runs at boot; --web mode (AWAIT_START=1) holds until the Start button fires POST /start.
if (AWAIT_START) {
  console.log("[buyer] awaiting Start from the dashboard (AWAIT_START=1) — flow is armed but idle");
} else {
  startRun();
}
