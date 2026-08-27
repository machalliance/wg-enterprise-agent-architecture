#!/usr/bin/env node
/**
 * Checkpoint CLI — the interface the loop wrapper and demo use to drive the
 * durable state store (M2). Kept separate from checkpoint.ts so the store stays
 * a plain library.
 *
 * Commands:
 *   resume            Print the latest checkpoint as JSON (or {"coldStart":true}).
 *                     Used at agent startup to load prior context.
 *   save <cycle>      Read an AgentState JSON from stdin and persist it at <cycle>.
 *   status            Print { count, latestCycle, chain } summary.
 *   verify            Verify the hash chain; exit 0 if intact, 1 if broken.
 *   observe <cycle>   Convenience: record that <cycle> completed with a minimal
 *                     working-memory snapshot read from stdin (for the loop).
 */

import { CheckpointStore, initialState, type AgentState } from "./checkpoint.js";

function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    if (process.stdin.isTTY) return resolve("");
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
  });
}

async function main(): Promise<void> {
  const cmd = process.argv[2] ?? "status";
  const store = new CheckpointStore();

  switch (cmd) {
    case "resume": {
      const latest = store.loadLatest();
      if (!latest) {
        process.stdout.write(JSON.stringify({ coldStart: true, ...initialState() }) + "\n");
      } else {
        process.stderr.write(
          `[checkpoint] Resumed from checkpoint at cycle ${latest.cycleNumber} ` +
            `(${latest.longTermContext.learnedPatterns.length} learned patterns)\n`,
        );
        process.stdout.write(
          JSON.stringify({
            coldStart: false,
            resumedFromCycle: latest.cycleNumber,
            workingMemory: latest.workingMemory,
            longTermContext: latest.longTermContext,
            activeSkus: latest.activeSkus,
          }) + "\n",
        );
      }
      break;
    }

    case "save": {
      const cycle = Number(process.argv[3] ?? "0");
      const raw = await readStdin();
      const state = (raw.trim() ? JSON.parse(raw) : initialState()) as AgentState;
      const row = store.save(cycle, state);
      process.stderr.write(
        `[checkpoint] saved cycle ${row.cycleNumber} hash=${row.hash.slice(0, 12)}… ` +
          `(total ${store.count()})\n`,
      );
      break;
    }

    case "status": {
      const latest = store.loadLatest();
      const chain = store.verifyChain();
      process.stdout.write(
        JSON.stringify({
          count: store.count(),
          latestCycle: latest?.cycleNumber ?? null,
          chain: chain.ok ? "intact" : `broken@${chain.brokenAtId}`,
        }) + "\n",
      );
      break;
    }

    case "verify": {
      const chain = store.verifyChain();
      if (chain.ok) {
        process.stderr.write(`[checkpoint] hash chain intact (${store.count()} records)\n`);
        store.close();
        process.exit(0);
      } else {
        process.stderr.write(`[checkpoint] hash chain BROKEN at id ${chain.brokenAtId}\n`);
        store.close();
        process.exit(1);
      }
      break;
    }

    default:
      process.stderr.write(`[checkpoint] unknown command '${cmd}'. Use resume|save|status|verify.\n`);
      store.close();
      process.exit(1);
  }

  store.close();
}

main().catch((err) => {
  process.stderr.write(`[checkpoint] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
