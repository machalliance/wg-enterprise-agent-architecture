#!/usr/bin/env node
/**
 * mcp-policy — the policy service, an MCP server that sits in the request path
 * between AgentGateway and the commerce server (M3).
 *
 * The gateway federates THIS server (not mcp-commerce directly). The agent's
 * read tools proxy straight through; set_price is intercepted, classified into a
 * tier, and then:
 *   PERMIT   -> forwarded to commerce, executed silently
 *   NOTIFY   -> forwarded to commerce, executed, notification emitted
 *   ESCALATE -> HELD in the escalation queue; commerce is NOT touched until an
 *               operator approves (then the release path executes it)
 *   DENIED   -> rejected; commerce never sees it
 *
 * This is where argument-level policy lives, because — unlike the gateway CEL —
 * an MCP server can see the tool arguments (sku, newPrice). The gateway still
 * owns identity + tool-scope (M1); this owns tier routing (M3).
 *
 * Transport: stdio (gateway spawns it). Logging: stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { CommerceClient } from "./commerce-client.js";
import { EscalationQueue } from "./escalation-queue.js";
import { classify, type Mandate, type PriceContext } from "./tiers.js";
import { DecisionTrail } from "./decision-trail.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = process.env.SEED_DIR
  ? resolve(process.env.SEED_DIR)
  : resolve(__dirname, "..", "..", "..", "seed");
const NOTIFY_LOG = process.env.NOTIFY_LOG_PATH || resolve(__dirname, "..", "notifications.jsonl");

function log(msg: string): void {
  process.stderr.write(`[mcp-policy] ${msg}\n`);
}
function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}
function errorResult(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload) }], isError: true };
}

/** Static SKU -> {category, estimatedWeeklyUnits} from the seed catalog. */
function loadCatalogMeta(): Map<string, { category: string; estimatedWeeklyUnits: number }> {
  const catalog = JSON.parse(readFileSync(resolve(SEED_DIR, "catalog.json"), "utf8")) as {
    skus: { sku: string; category: string; estimatedWeeklyUnits: number }[];
  };
  return new Map(
    catalog.skus.map((s) => [s.sku, { category: s.category, estimatedWeeklyUnits: s.estimatedWeeklyUnits }]),
  );
}

/** Ask the control plane whether a proposed write is within circuit-breaker limits. */
async function checkBreaker(action: {
  sku: string;
  currentPrice: number;
  newPrice: number;
  estimatedWeeklyUnits: number;
}): Promise<{ allow: boolean; halted: boolean; haltReason?: string; reasons?: string[] }> {
  const url = (process.env.CONTROL_PLANE_URL || "http://localhost:8090") + "/breaker/evaluate";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(action),
    });
    return (await res.json()) as { allow: boolean; halted: boolean; haltReason?: string; reasons?: string[] };
  } catch {
    // Control plane not running (e.g. milestones before M5, or dev): fail OPEN
    // so the policy gate still functions standalone. In the full demo the
    // control plane is always up.
    return { allow: true, halted: false };
  }
}

function loadMandate(): Mandate {
  return JSON.parse(readFileSync(resolve(SEED_DIR, "mandate.json"), "utf8")) as Mandate;
}

async function main(): Promise<void> {
  const mandate = loadMandate();
  const catalogMeta = loadCatalogMeta();
  const queue = new EscalationQueue();
  const trail = new DecisionTrail();

  // Spawn the real commerce server as our downstream.
  const commerce = new CommerceClient("node", [
    resolve(__dirname, "..", "..", "mcp-commerce", "dist", "index.js"),
  ]);
  await commerce.connect();
  log("connected to downstream commerce server");

  const server = new McpServer({ name: "meridian-policy", version: "0.1.0" });

  // --- Proxy the read tools 1:1 (no policy on reads) -----------------------
  for (const toolName of ["get_current_price", "get_margin", "get_promo_status"] as const) {
    server.registerTool(
      toolName,
      {
        description: `Proxied read: ${toolName} (forwarded to the commerce system unchanged).`,
        inputSchema: { sku: z.string().describe("The SKU, e.g. MER-TENT-3S") },
      },
      async ({ sku }) => (await commerce.callRaw(toolName, { sku })) as never,
    );
  }

  // --- set_price: the policy gate ------------------------------------------
  server.registerTool(
    "set_price",
    {
      description:
        "Set a new price for a SKU. Every call is classified against the mandate: small in-scope changes execute autonomously; larger ones notify; out-of-scope, flagged, premium, or >15% changes are held for human approval; below-cost changes are denied.",
      inputSchema: {
        sku: z.string().describe("The SKU to reprice, e.g. MER-TENT-3S"),
        newPrice: z.number().positive().describe("The new price in USD"),
        reason: z.string().describe("Why this change is being made"),
      },
    },
    async ({ sku, newPrice, reason }) => {
      // Gather the context the tier decision needs: current price + cost (from
      // commerce) and category (from seed catalog).
      const margin = await commerce.getMargin(sku);
      if (!margin) return errorResult({ error: "unknown_sku", sku });
      const meta = catalogMeta.get(sku);
      const category = meta?.category ?? "unknown";
      const estimatedWeeklyUnits = meta?.estimatedWeeklyUnits ?? 0;
      const ctx: PriceContext = {
        sku,
        category,
        currentPrice: margin.price,
        cost: margin.cost,
      };

      const decision = classify({ sku, newPrice, reason }, ctx, mandate);
      log(`set_price ${sku} -> ${newPrice}: ${decision.rule} (${decision.changePct}%)`);

      // Circuit-breaker check (M5). Cumulative guards that fire regardless of
      // individual-action validity. Only actions that WOULD execute (PERMIT /
      // NOTIFY) count against rate/magnitude/anomaly — escalations are held and
      // denials never execute, so they don't consume budget. If the breaker
      // trips, the whole system halts and this write is refused.
      let breakerReasons: string[] = [];
      if (decision.tier === "PERMIT" || decision.tier === "NOTIFY") {
        const verdict = await checkBreaker({
          sku,
          currentPrice: ctx.currentPrice,
          newPrice,
          estimatedWeeklyUnits,
        });
        if (!verdict.allow) {
          breakerReasons = verdict.reasons ?? [verdict.haltReason ?? "circuit_breaker"];
          log(`set_price ${sku} HALTED by circuit breaker: ${breakerReasons.join(",")}`);
          trail.appendDecision({
            cycleNumber: null,
            trigger: { type: "market_signal", signal: { sku, proposedPrice: newPrice, reason } },
            reasoning: { summary: reason, causalPriorDecisions: [] },
            proposedAction: { tool: "set_price", args: { sku, newPrice, reason }, changePct: decision.changePct },
            policyResult: {
              tier: decision.tier,
              rule: `HALTED:${breakerReasons.join(",")}`,
              explanation: `Circuit breaker halted execution: ${breakerReasons.join(", ")}.`,
              context: { ...ctx },
            },
            outcome: { executed: false, denialReason: `circuit_breaker:${breakerReasons.join(",")}` },
          });
          return errorResult({
            halted: true,
            reasons: breakerReasons,
            haltReason: verdict.haltReason,
            message: `Circuit breaker halted the agent (${breakerReasons.join(", ")}). Price change for ${sku} not executed.`,
          });
        }
      }

      // Assemble the parts of the decision record common to every outcome. The
      // outcome block is filled in per-branch below, then the record is written.
      const recordBase = {
        cycleNumber: null as number | null,
        trigger: {
          type: "market_signal" as const,
          signal: { sku, proposedPrice: newPrice, reason },
        },
        reasoning: {
          summary: reason,
          causalPriorDecisions: [] as string[],
        },
        proposedAction: {
          tool: "set_price",
          args: { sku, newPrice, reason },
          changePct: decision.changePct,
        },
        policyResult: {
          tier: decision.tier,
          rule: decision.rule,
          explanation: decision.explanation,
          context: { ...ctx },
        },
      };

      switch (decision.tier) {
        case "DENIED": {
          trail.appendDecision({
            ...recordBase,
            outcome: { executed: false, denialReason: decision.rule },
          });
          return errorResult({
            denied: true,
            tier: decision.tier,
            rule: decision.rule,
            explanation: decision.explanation,
            sku,
          });
        }

        case "ESCALATE": {
          const held = queue.enqueue({
            sku,
            proposedPrice: newPrice,
            currentPrice: ctx.currentPrice,
            changePct: decision.changePct,
            reason,
            tierResult: decision.rule,
            explanation: decision.explanation,
          });
          trail.appendDecision({
            ...recordBase,
            outcome: { executed: false, escalationId: held.id },
          });
          return json({
            escalated: true,
            tier: decision.tier,
            rule: decision.rule,
            explanation: decision.explanation,
            escalationId: held.id,
            message: `Price change for ${sku} is pending approval (id ${held.id}). It will not execute until approved.`,
          });
        }

        case "NOTIFY": {
          const result = await commerce.setPrice(sku, newPrice, reason);
          appendFileSync(
            NOTIFY_LOG,
            JSON.stringify({
              at: new Date().toISOString(),
              channel: mandate.tiers.notify.notifyChannel,
              sku,
              previousPrice: ctx.currentPrice,
              newPrice,
              changePct: decision.changePct,
              reason,
            }) + "\n",
          );
          trail.appendDecision({
            ...recordBase,
            outcome: { executed: result.success, resultPrice: result.success ? newPrice : undefined },
          });
          return json({ ...result, tier: decision.tier, rule: decision.rule, notified: true });
        }

        case "PERMIT":
        default: {
          const result = await commerce.setPrice(sku, newPrice, reason);
          trail.appendDecision({
            ...recordBase,
            outcome: { executed: result.success, resultPrice: result.success ? newPrice : undefined },
          });
          return json({ ...result, tier: decision.tier, rule: decision.rule });
        }
      }
    },
  );

  // --- report_anomaly: the agent's own safety judgment, made visible ----------
  // A capable model often recognises bad market data (e.g. a competitor feed
  // reporting implausible prices) and correctly declines to act on it. Without a
  // way to record that, the judgment vanishes into the reasoning log. This tool
  // lets the agent log the anomaly to the append-only decision trail, from where
  // the control plane surfaces it on the operator dashboard — so "the agent
  // caught the bad data and stood down" is a visible, auditable event, not an
  // invisible non-action. (The circuit breaker remains the mechanical backstop
  // for the case where a weaker model fails to catch it.)
  server.registerTool(
    "report_anomaly",
    {
      description:
        "Report a market-data anomaly you have detected and are choosing NOT to act on — for example a competitor price so implausible it is almost certainly a data/feed error rather than a real move. Use this instead of silently ignoring bad data: it records your judgment to the decision trail and flags it for the human operator. Does NOT change any price.",
      inputSchema: {
        sku: z.string().describe("The SKU the anomaly concerns, e.g. MER-TENT-3S"),
        observation: z
          .string()
          .describe("What you observed, e.g. 'FeedX quotes ~75% below normal across the catalog'"),
        suspectedCause: z
          .string()
          .describe("Why you believe it is not a real signal, e.g. 'feed pricing error, not a genuine price move'"),
      },
    },
    async ({ sku, observation, suspectedCause }) => {
      const record = trail.appendAnomaly({
        cycleNumber: null,
        sku,
        observation,
        suspectedCause,
        actionTaken: "flagged for operator; no price change made",
      });
      log(`report_anomaly ${sku}: ${observation} (${suspectedCause})`);
      return json({
        recorded: true,
        anomalyId: record.id,
        sku,
        message: `Anomaly on ${sku} recorded and flagged for the operator. No price change made.`,
      });
    },
  );

  const shutdown = async (signal: string) => {
    log(`received ${signal}, shutting down`);
    await commerce.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("connected over stdio; policy gate active");
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
