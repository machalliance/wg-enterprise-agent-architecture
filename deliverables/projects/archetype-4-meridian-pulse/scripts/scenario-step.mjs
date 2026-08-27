#!/usr/bin/env node
/**
 * Presenter helper for MANUAL demo mode.
 *
 * mcp-market-data owns its own stdio (the MCP transport), and the gateway can
 * spawn it more than once — so the beat trigger is a FILE, not a socket. This
 * script is the terminal-Enter surface: each Enter increments an integer in the
 * trigger file; the live market-data instance polls that file and applies beats
 * until it has caught up. A file trigger has no port to race for and no ambiguity
 * about which instance "owns" it — every instance reads the same number.
 *
 * The default trigger path matches the market-data default
 * (packages/mcp-market-data/scenario-step.trigger). Override with
 * SCENARIO_TRIGGER_FILE (set the SAME value for `pnpm demo` and this script).
 *
 * Usage (with `pnpm demo` running in MANUAL mode in another pane):
 *   node scripts/scenario-step.mjs            # or: pnpm scenario:step
 *
 * Press Enter to advance one beat; Ctrl-C to exit. There are 5 beats.
 */

import { createInterface } from "node:readline";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRIGGER =
  process.env.SCENARIO_TRIGGER_FILE ||
  resolve(__dirname, "..", "packages", "mcp-market-data", "scenario-step.trigger");

const BEATS = [
  "0 · steady-state (ambient noise → PERMIT cards)",
  "2 · competitor-undercut (hero tent → autonomous PERMIT)",
  "3 · demand-spike (hydration packs → ESCALATE, then Approve on the dashboard)",
  "4 · flash-crash (FeedX → $0 → circuit breaker HALTS the agent)",
  "5 · recovery (FeedX restored → Resume with a data filter on the dashboard)",
];
const TOTAL = BEATS.length;

function readCount() {
  try {
    const n = Number.parseInt(readFileSync(TRIGGER, "utf8").trim(), 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch {
    return 0;
  }
}

function bump() {
  const next = readCount() + 1;
  writeFileSync(TRIGGER, String(next), "utf8");
  return next;
}

// Start from a clean trigger so a stale count from a previous take doesn't
// fast-forward the driver. (The driver only moves forward, so resetting the file
// to 0 is safe: it has already applied whatever it applied this run.)
writeFileSync(TRIGGER, "0", "utf8");

console.log(
  `Manual scenario stepper — ${TOTAL} beats (trigger: ${TRIGGER}):\n` +
    BEATS.map((b, i) => `  ${i + 1}. beat ${b}`).join("\n") +
    `\n\nPress Enter to advance one beat. Ctrl-C to quit.\n`,
);

let pressed = 0;
const rl = createInterface({ input: process.stdin, output: process.stdout, prompt: "» press Enter to advance ▸ " });
rl.prompt();
rl.on("line", () => {
  if (pressed >= TOTAL) {
    console.log("All beats fired — the timeline is complete. Ctrl-C to quit.");
    rl.prompt();
    return;
  }
  const count = bump();
  pressed = count;
  const label = BEATS[count - 1] ?? `${count}`;
  const remaining = TOTAL - count;
  console.log(
    `→ requested beat ${label}  (trigger=${count})` +
      (remaining > 0 ? `\n  ${remaining} beat(s) left. Watch the dashboard, then press Enter.` : `\n  That was the last beat.`),
  );
  rl.prompt();
});
rl.on("close", () => {
  console.log("\nStepper closed.");
  process.exit(0);
});
