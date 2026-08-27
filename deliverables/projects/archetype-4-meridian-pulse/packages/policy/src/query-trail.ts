#!/usr/bin/env node
/**
 * query-trail (M4) — the operator's window into the decision trail.
 *
 * Commands:
 *   list [--category C] [--tier T] [--last N]
 *       Print decisions, newest first, optionally filtered by category, tier,
 *       or limited to the last N decisions.
 *   why <decisionId>
 *       Print the causal chain for a decision, back to its roots.
 *   verify
 *       Verify the hash chain; exit 0 if intact, 1 if broken.
 *   stats
 *       Summary counts by tier.
 */

import { DecisionTrail, type DecisionRecord } from "./decision-trail.js";

function argVal(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fmt(d: DecisionRecord): string {
  const ctx = d.policyResult.context as { category?: string; currentPrice?: number };
  const price = (d.proposedAction.args as { newPrice?: number }).newPrice;
  const exec = d.outcome.executed ? "executed" : d.outcome.escalationId ? "escalated" : "blocked";
  return (
    `${d.timestamp}  ${(d.proposedAction.args as { sku?: string }).sku}  ` +
    `${ctx.currentPrice} -> ${price} (${d.proposedAction.changePct}%)  ` +
    `[${d.policyResult.tier}] ${d.policyResult.rule}  ${exec}`
  );
}

function main(): void {
  const trail = new DecisionTrail();
  const cmd = process.argv[2] ?? "list";

  switch (cmd) {
    case "list": {
      const category = argVal("--category");
      const tier = argVal("--tier");
      const last = argVal("--last") ? Number(argVal("--last")) : undefined;

      let decisions = trail
        .readAll()
        .filter((r): r is DecisionRecord => r.kind === "decision");
      if (category) {
        decisions = decisions.filter(
          (d) => (d.policyResult.context as { category?: string }).category === category,
        );
      }
      if (tier) decisions = decisions.filter((d) => d.policyResult.tier === tier);
      decisions = decisions.reverse(); // newest first
      if (last) decisions = decisions.slice(0, last);

      if (decisions.length === 0) {
        process.stdout.write("(no matching decisions)\n");
      } else {
        for (const d of decisions) process.stdout.write(fmt(d) + `   id=${d.id}\n`);
      }
      break;
    }

    case "why": {
      const id = process.argv[3];
      if (!id) {
        process.stderr.write("usage: why <decisionId>\n");
        process.exit(1);
      }
      const chain = trail.causalChain(id);
      if (chain.length === 0) {
        process.stdout.write(`(no decision found with id ${id})\n`);
        break;
      }
      process.stdout.write(`Causal chain for ${id} (${chain.length} decision(s)):\n`);
      for (const d of chain) {
        process.stdout.write(`  - ${fmt(d)}\n    reasoning: ${d.reasoning.summary}\n`);
      }
      break;
    }

    case "verify": {
      const result = trail.verifyChain();
      if (result.ok) {
        process.stderr.write(`[trail] hash chain intact (${trail.readAll().length} records)\n`);
        process.exit(0);
      } else {
        process.stderr.write(`[trail] hash chain BROKEN at id ${result.brokenAtId}\n`);
        process.exit(1);
      }
      break;
    }

    case "stats": {
      const decisions = trail
        .readAll()
        .filter((r): r is DecisionRecord => r.kind === "decision");
      const byTier: Record<string, number> = {};
      for (const d of decisions) byTier[d.policyResult.tier] = (byTier[d.policyResult.tier] ?? 0) + 1;
      process.stdout.write(
        JSON.stringify({ total: decisions.length, byTier }, null, 2) + "\n",
      );
      break;
    }

    default:
      process.stderr.write(`unknown command '${cmd}'. Use list|why|verify|stats.\n`);
      process.exit(1);
  }
}

main();
