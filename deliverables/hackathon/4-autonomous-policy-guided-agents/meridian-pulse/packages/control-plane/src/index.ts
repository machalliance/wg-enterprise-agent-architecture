#!/usr/bin/env node
/**
 * control-plane — the human oversight plane (M5 core; M6 adds the dashboard UI).
 *
 * A small standalone HTTP service that owns:
 *   - halt state + kill switch      (POST /agent/halt|resume, GET /agent/status)
 *   - circuit breakers              (POST /breaker/evaluate, GET /breaker/metrics)
 *   - heartbeat dead-man's-switch   (POST /agent/heartbeat + watchdog timer)
 *
 * The policy server calls POST /breaker/evaluate before each write and refuses
 * the write if the verdict halts. The agent loop calls GET /agent/status between
 * cycles and stops if halted, and POST /agent/heartbeat each cycle.
 *
 * Kept deliberately small and unauthenticated — it is an operator tool on
 * localhost, not a public API.
 */

import express from "express";
import { readFileSync, existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CircuitBreakers, DEFAULT_BREAKER_CONFIG, type ProposedActionImpact } from "./breakers.js";
import { OversightState } from "./state.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.CONTROL_PLANE_PORT ?? "8090");
const PUBLIC_DIR = resolve(__dirname, "..", "public");
const ESCALATION_QUEUE_PATH =
  process.env.ESCALATION_QUEUE_PATH || resolve(__dirname, "..", "..", "policy", "escalation-queue.jsonl");
const DECISION_TRAIL_PATH =
  process.env.DECISION_TRAIL_PATH || resolve(__dirname, "..", "..", "policy", "decision-trail.jsonl");
const APPROVALS_CLI = resolve(__dirname, "..", "..", "policy", "dist", "approvals-cli.js");

function log(msg: string): void {
  process.stderr.write(`[control-plane] ${msg}\n`);
}

/** Replay the shared escalation-queue JSONL to the latest state per id. */
function readEscalations(): Record<string, unknown>[] {
  if (!existsSync(ESCALATION_QUEUE_PATH)) return [];
  const byId = new Map<string, Record<string, unknown>>();
  for (const line of readFileSync(ESCALATION_QUEUE_PATH, "utf8").split("\n").filter(Boolean)) {
    try {
      const ev = JSON.parse(line) as { action: Record<string, unknown> & { id: string } };
      byId.set(ev.action.id, ev.action);
    } catch {
      /* skip malformed */
    }
  }
  return [...byId.values()];
}

/** Read anomaly records the agent flagged (kind:"anomaly") from the decision trail, newest first. */
function readAnomalies(limit = 20): Record<string, unknown>[] {
  if (!existsSync(DECISION_TRAIL_PATH)) return [];
  const anomalies: Record<string, unknown>[] = [];
  for (const line of readFileSync(DECISION_TRAIL_PATH, "utf8").split("\n").filter(Boolean)) {
    try {
      const rec = JSON.parse(line) as Record<string, unknown>;
      if (rec.kind === "anomaly") anomalies.push(rec);
    } catch {
      /* skip malformed */
    }
  }
  return anomalies.reverse().slice(0, limit);
}

/**
 * Read recent EXECUTED autonomous actions (kind:"decision", tier PERMIT/NOTIFY,
 * executed) from the trail, newest first. This is what the dashboard's live
 * activity feed + toast use to make the agent's silent-but-legitimate work
 * visible — "it IS doing things, within policy" — even when nothing is escalated.
 * Escalations/denials are shown elsewhere; this is the autonomous stream.
 */
function readRecentActivity(limit = 8): Record<string, unknown>[] {
  if (!existsSync(DECISION_TRAIL_PATH)) return [];
  const actions: Record<string, unknown>[] = [];
  for (const line of readFileSync(DECISION_TRAIL_PATH, "utf8").split("\n").filter(Boolean)) {
    try {
      const r = JSON.parse(line) as {
        kind?: string;
        id?: string;
        timestamp?: string;
        proposedAction?: { args?: { sku?: string; newPrice?: number }; changePct?: number };
        reasoning?: { summary?: string };
        policyResult?: { tier?: string; context?: { currentPrice?: number } };
        outcome?: { executed?: boolean };
      };
      if (r.kind !== "decision" || !r.outcome?.executed) continue;
      const tier = r.policyResult?.tier;
      if (tier !== "PERMIT" && tier !== "NOTIFY") continue;
      actions.push({
        id: r.id,
        timestamp: r.timestamp,
        sku: r.proposedAction?.args?.sku,
        currentPrice: r.policyResult?.context?.currentPrice,
        newPrice: r.proposedAction?.args?.newPrice,
        changePct: r.proposedAction?.changePct,
        tier,
        reason: r.reasoning?.summary,
      });
    } catch {
      /* skip malformed */
    }
  }
  return actions.reverse().slice(0, limit);
}

/** Run the policy package's approvals CLI (which handles release-to-commerce). */
function runApprovals(cmd: "approve" | "reject", id: string): Promise<{ code: number; out: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn("node", [APPROVALS_CLI, cmd, id], {
      env: { ...process.env, ESCALATION_QUEUE_PATH, NODE_NO_WARNINGS: "1" },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => resolvePromise({ code: code ?? 1, out }));
  });
}

const app = express();
app.use(express.json());

const breakers = new CircuitBreakers(DEFAULT_BREAKER_CONFIG);
const oversight = new OversightState();

// --- Kill switch + status ---------------------------------------------------
app.get("/agent/status", (_req, res) => {
  res.json({ ...oversight.get(), breakers: breakers.snapshot() });
});

app.post("/agent/halt", (req, res) => {
  const reason = (req.body?.reason as string) || "manual_kill_switch";
  const status = oversight.halt(reason as never);
  log(`HALT (${reason})`);
  res.json(status);
});

app.post("/agent/resume", (req, res) => {
  const dataFilter = (req.body?.dataFilter as string) || null;
  breakers.reset(); // clear the windows so the agent starts fresh post-recovery
  const status = oversight.resume(dataFilter);
  log(`RESUME${dataFilter ? ` (data filter: ${dataFilter})` : ""}`);
  res.json(status);
});

app.post("/agent/heartbeat", (req, res) => {
  const cycle = typeof req.body?.cycle === "number" ? req.body.cycle : undefined;
  oversight.heartbeat(cycle);
  res.json({ ok: true });
});

// --- Circuit breakers -------------------------------------------------------
// The policy server posts a proposed action; we return allow/halt. If a hard
// limiter or EXTREME anomaly fires, we ALSO flip the halt state so the whole
// system stops, not just this one write.
app.post("/breaker/evaluate", (req, res) => {
  const action = req.body as ProposedActionImpact;
  if (!oversight.isRunning()) {
    return res.json({
      allow: false,
      halted: true,
      haltReason: oversight.get().haltReason,
      reasons: ["already_halted"],
    });
  }
  const verdict = breakers.evaluate(action);
  if (!verdict.allow) {
    const reason = verdict.reasons[0] ?? "anomaly_extreme";
    oversight.halt(reason as never);
    log(`breaker tripped -> HALT (${verdict.reasons.join(",")}) metrics=${JSON.stringify(verdict.metrics)}`);
    return res.json({ ...verdict, halted: true, haltReason: reason });
  }
  // Allowed: record it so the windows advance.
  breakers.record(action);
  res.json({ ...verdict, halted: false });
});

app.get("/breaker/metrics", (_req, res) => {
  res.json(breakers.snapshot());
});

// --- Escalation queue (M3/M6) ----------------------------------------------
// Reads the shared queue JSONL; approve/reject delegate to the policy package's
// approvals CLI, which releases approved changes to the commerce system.
app.get("/escalations", (_req, res) => {
  const all = readEscalations();
  res.json({
    pending: all.filter((a) => a.status === "pending"),
    all,
  });
});

// Anomalies the agent flagged (report_anomaly -> decision trail). This is the
// agent's own judgment made visible: bad data it detected and declined to act on.
app.get("/anomalies", (_req, res) => {
  res.json({ anomalies: readAnomalies() });
});

// Recent executed autonomous actions — the agent visibly working within policy.
app.get("/activity", (_req, res) => {
  res.json({ recentActivity: readRecentActivity() });
});

app.post("/escalations/:id/approve", async (req, res) => {
  const result = await runApprovals("approve", req.params.id);
  log(`approve ${req.params.id} -> exit ${result.code}`);
  res.status(result.code === 0 ? 200 : 400).json({ ok: result.code === 0, output: result.out.trim() });
});

app.post("/escalations/:id/reject", async (req, res) => {
  const result = await runApprovals("reject", req.params.id);
  log(`reject ${req.params.id} -> exit ${result.code}`);
  res.status(result.code === 0 ? 200 : 400).json({ ok: result.code === 0, output: result.out.trim() });
});

// --- SSE event stream (M6) --------------------------------------------------
// The dashboard subscribes here for live updates. We push a consolidated
// snapshot (status + breakers + escalation counts) on a timer; simple and
// robust for a demo, no per-event plumbing needed.
const sseClients = new Set<express.Response>();
app.get("/events", (req, res) => {
  res.set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();
  sseClients.add(res);
  req.on("close", () => sseClients.delete(res));
});

function broadcast(): void {
  if (sseClients.size === 0) return;
  const escalations = readEscalations();
  const payload = JSON.stringify({
    at: new Date().toISOString(),
    status: oversight.get(),
    breakers: breakers.snapshot(),
    pendingEscalations: escalations.filter((a) => a.status === "pending"),
    anomalies: readAnomalies(),
    recentActivity: readRecentActivity(),
  });
  for (const res of sseClients) res.write(`data: ${payload}\n\n`);
}
const sseTimer = setInterval(broadcast, 1000);

// --- Static dashboard (M6) --------------------------------------------------
app.use(express.static(PUBLIC_DIR));

// --- Dead-man's-switch watchdog ---------------------------------------------
const watchdog = setInterval(() => {
  if (oversight.checkDeadMansSwitch()) {
    log("dead-man's-switch tripped -> HALT (no heartbeat within timeout)");
  }
}, 5000);

const server = app.listen(PORT, () => {
  log(`listening on :${PORT} (kill switch, breakers, heartbeat)`);
});

const shutdown = (signal: string) => {
  log(`received ${signal}, shutting down`);
  clearInterval(watchdog);
  clearInterval(sseTimer);
  server.close(() => process.exit(0));
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
