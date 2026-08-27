#!/usr/bin/env node
/**
 * Approvals CLI (M3) — the operator interface to the escalation queue. The M6
 * control plane calls the same EscalationQueue + release path over HTTP; this
 * CLI is the headless equivalent for development and the runbook.
 *
 * Commands:
 *   list                 Print pending escalations as JSON.
 *   approve <id>         Approve and RELEASE the held change to the commerce
 *                        system (spawns commerce, executes set_price).
 *   reject <id>          Reject and discard the held change.
 */

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { EscalationQueue } from "./escalation-queue.js";
import { CommerceClient } from "./commerce-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "list";
  const id = process.argv[3];
  const queue = new EscalationQueue();

  switch (cmd) {
    case "list": {
      process.stdout.write(JSON.stringify(queue.listPending(), null, 2) + "\n");
      break;
    }

    case "approve": {
      if (!id) {
        process.stderr.write("[approvals] usage: approve <id>\n");
        process.exit(1);
      }
      const held = queue.get(id);
      if (!held || held.status !== "pending") {
        process.stderr.write(`[approvals] no pending escalation with id ${id}\n`);
        process.exit(1);
      }
      // Release the held change: execute it on the commerce system now.
      const commerce = new CommerceClient("node", [
        resolve(__dirname, "..", "..", "mcp-commerce", "dist", "index.js"),
      ]);
      await commerce.connect();
      const result = await commerce.setPrice(
        held.sku,
        held.proposedPrice,
        `[approved escalation ${id}] ${held.reason}`,
      );
      await commerce.close();
      queue.approve(id);
      process.stdout.write(
        JSON.stringify({ approved: id, executed: result }, null, 2) + "\n",
      );
      break;
    }

    case "reject": {
      if (!id) {
        process.stderr.write("[approvals] usage: reject <id>\n");
        process.exit(1);
      }
      const updated = queue.reject(id);
      if (!updated) {
        process.stderr.write(`[approvals] no pending escalation with id ${id}\n`);
        process.exit(1);
      }
      process.stdout.write(JSON.stringify({ rejected: id }, null, 2) + "\n");
      break;
    }

    default:
      process.stderr.write(`[approvals] unknown command '${cmd}'. Use list|approve|reject.\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`[approvals] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
