#!/usr/bin/env node
/**
 * mcp-commerce — the mock commerce platform MCP server.
 *
 * Exposes the agent's action surface: read the current price/margin/promo and
 * write a new price. The agent reaches these tools ONLY through AgentGateway,
 * which applies identity scoping (M1) and policy (M3) before the call arrives
 * here. This server enforces no policy of its own; it is the system of record.
 *
 * Transport is stdio. Diagnostic logging goes to stderr.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CommerceDb } from "./db.js";

function log(msg: string): void {
  process.stderr.write(`[mcp-commerce] ${msg}\n`);
}

function json(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result) }] };
}

function errorResult(payload: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError: true,
  };
}

async function main(): Promise<void> {
  const db = new CommerceDb();

  const server = new McpServer({
    name: "meridian-commerce",
    version: "0.1.0",
  });

  server.registerTool(
    "get_current_price",
    {
      description:
        "Get the current price for a SKU, including the channel and when it last changed.",
      inputSchema: { sku: z.string().describe("The SKU, e.g. MER-TENT-3S") },
    },
    async ({ sku }) => {
      const rec = db.getCurrentPrice(sku);
      if (!rec) return errorResult({ error: "unknown_sku", sku });
      return json({
        sku: rec.sku,
        price: rec.price,
        lastChanged: rec.lastChanged,
        channel: rec.channel,
      });
    },
  );

  server.registerTool(
    "get_margin",
    {
      description:
        "Get the margin for a SKU: cost, current price, and margin percentage. Use before proposing a price change to avoid selling below cost.",
      inputSchema: { sku: z.string().describe("The SKU, e.g. MER-TENT-3S") },
    },
    async ({ sku }) => {
      const margin = db.getMargin(sku);
      if (!margin) return errorResult({ error: "unknown_sku", sku });
      return json(margin);
    },
  );

  server.registerTool(
    "get_promo_status",
    {
      description:
        "Get promotion status for a SKU: whether a promo is active, its type, discount, and end date.",
      inputSchema: { sku: z.string().describe("The SKU, e.g. MER-TENT-3S") },
    },
    async ({ sku }) => {
      const rec = db.getCurrentPrice(sku);
      if (!rec) return errorResult({ error: "unknown_sku", sku });
      return json({ sku, ...db.getPromoStatus(sku) });
    },
  );

  server.registerTool(
    "set_price",
    {
      description:
        "Set a new price for a SKU. Provide a clear reason. In later milestones this call is gated by identity scope and policy at AgentGateway before it reaches here.",
      inputSchema: {
        sku: z.string().describe("The SKU to reprice, e.g. MER-TENT-3S"),
        newPrice: z.number().positive().describe("The new price in USD"),
        reason: z.string().describe("Why this change is being made (recorded in price history)"),
      },
    },
    async ({ sku, newPrice, reason }) => {
      const result = db.setPrice(sku, newPrice, reason);
      if (!result.success) {
        log(`set_price REJECTED ${sku} -> ${newPrice}: ${result.error}`);
        return errorResult(result);
      }
      log(
        `set_price ${sku} ${result.previousPrice} -> ${result.newPrice} (${reason})`,
      );
      return json(result);
    },
  );

  const shutdown = (signal: string) => {
    log(`received ${signal}, closing db`);
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log("connected over stdio; catalog ready");
}

main().catch((err) => {
  log(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}`);
  process.exit(1);
});
