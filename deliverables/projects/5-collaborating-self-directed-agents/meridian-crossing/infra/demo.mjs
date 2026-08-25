import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { provisionControlToken } from "./control-token.mjs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Launcher for `pnpm demo`. Two modes, selected by a `--web` flag that pnpm forwards here verbatim:
//
//   pnpm demo         terminal-only: the suppliers + the paced buyer, no dashboard. The buyer starts
//                     negotiating at boot and you watch the story in the log prefixes.
//   pnpm demo --web   adds the dashboard AND gates the buyer behind its Start button (AWAIT_START=1),
//                     so nothing runs until you open the page and click Start — the demo can't be over
//                     before you've opened it.
//
// An optional `--usdc` flag (composes with either mode) turns on the settlement layer: a committed deal
// is paid via a REAL Stripe crypto PaymentIntent — USDC on the Tempo network, captured on-chain. Requires
// STRIPE_SECRET_KEY (a Stripe test secret key) in `.env.local` or the shell; without it the buyer logs a
// warning and leaves settlement off. With --web, over-threshold deals wait for the dashboard's
// Create-payment button.
//
// `.env.local` is already loaded into this process by the `--import ./infra/env.mjs` preload in the npm
// script, so every variable it defines is visible below AND inherited by the spawned agents through the
// `...process.env` spread — the children do not re-read the file, which is why the four overrides this
// launcher computes always win over it.
//
// Everything else (build, identity issuance, directory container) already ran in the npm script chain.

const web = process.argv.includes("--web");
const usdc = process.argv.includes("--usdc");

// The money-moving settlement routes FAIL CLOSED without a control token (see server.ts). Provision a shared
// one for the whole process group when the control surface is reachable (web or usdc), unless the
// operator already set their own. Both the buyer and the dashboard proxy inherit this SAME value, so the
// proxy can inject it on state-changing routes and a direct, un-proxied caller without it gets 401.
const controlToken = provisionControlToken({ web, usdc, existing: process.env.CONTROL_TOKEN });
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Pacing is per MODE, because the two modes are watched differently. `--web` is the presenting surface:
// turns land as chat bubbles a human reads, and the kill switch needs a window wide enough to be hit in,
// so 2000ms. Terminal `pnpm demo` is the rehearse-and-verify surface — nobody narrates a scrollback — so it
// runs unpaced, which also stops it being the dominant cost of a `pnpm sweep` leg.
//
// Unlike AWAIT_START / USDC_SETTLEMENT / SETTLEMENT_AUTO_APPROVE below, this is a DEFAULT, not a launcher
// override: an operator-set value (shell or `.env.local`, which `infra/env.mjs` has already merged into
// process.env by now) wins, because `TURN_DELAY_MS` is a documented knob and `pnpm sweep` relies on being
// able to force it to 0. Empty counts as unset here, matching `numberFromEnv` in the buyer server rather
// than env.mjs's stricter rule for the three variables a file must never be able to clobber.
const paceFromOperator = process.env.TURN_DELAY_MS;
const pace = paceFromOperator === undefined || paceFromOperator === "" ? (web ? "2000" : "0") : paceFromOperator;

// name, concurrently color, command. The dashboard is appended only in --web mode.
const procs = [
  ["summit", "green", "node packages/supplier-summit/dist/index.js"],
  ["cascade", "blue", "node packages/supplier-cascade/dist/index.js"],
  ["alpine", "yellow", "node packages/supplier-alpine/dist/index.js"],
  ["ridge", "red", "node packages/supplier-ridge/dist/index.js"],
  ["buyer", "cyan", "node packages/buyer/dist/server.js"],
];
if (web) procs.push(["dash", "magenta", "node packages/dashboard/server.mjs"]);

const names = procs.map((p) => p[0]).join(",");
const colors = procs.map((p) => p[1]).join(",");
const commands = procs.map((p) => p[2]);

const bin = join(root, "node_modules", ".bin", "concurrently");
const child = spawn(bin, ["-k", "-n", names, "-c", colors, ...commands], {
  cwd: root,
  stdio: "inherit",
  // AWAIT_START tells the buyer to hold its run() until the dashboard's Start button fires POST /start.
  // Only meaningful with the dashboard, so it is set only in --web mode. USDC_SETTLEMENT turns on the
  // Stripe settlement layer in the buyer server when `--usdc` was passed. SETTLEMENT_AUTO_APPROVE lets
  // terminal-only `--usdc` (no dashboard, no approve button) auto-approve over-threshold payments — NEVER
  // set in --web, where the human owns that step. CONTROL_TOKEN authenticates the state-changing/money
  // routes. STRIPE_SECRET_KEY (needed for the settlement layer) is inherited from process.env above.
  // TURN_DELAY_MS is the one entry here that is a per-mode DEFAULT rather than an override — see above.
  env: {
    ...process.env,
    TURN_DELAY_MS: pace,
    AWAIT_START: web ? "1" : "",
    USDC_SETTLEMENT: usdc ? "1" : "",
    SETTLEMENT_AUTO_APPROVE: usdc && !web ? "1" : "",
    CONTROL_TOKEN: controlToken,
  },
});
child.on("exit", (code) => process.exit(code ?? 0));

// In --web mode, print the dashboard URL once its port is actually listening — plain, on its own line,
// so the terminal linkifies it and a click (or cmd/ctrl-click) opens the browser, the way an OAuth CLI
// surfaces its login URL. Waiting for the port avoids printing a link that 404s if clicked too early.
if (web) {
  const port = Number(process.env.DASHBOARD_PORT ?? 41200);
  const url = `http://localhost:${port}`;
  waitForPort(port, "127.0.0.1", 60, 500).then((up) => {
    if (up) console.log(`\n[demo] dashboard ready — open it and press Start:\n\n    ${url}\n`);
    else console.log(`\n[demo] dashboard not detected on ${port}; open ${url} manually\n`);
  });
}

/** Resolve true once a TCP connection to host:port succeeds, or false after `tries` attempts. */
function waitForPort(port, host, tries, delayMs) {
  return new Promise((resolve) => {
    let n = 0;
    const attempt = () => {
      const sock = createConnection({ port, host });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => {
        sock.destroy();
        if (++n >= tries) resolve(false);
        else setTimeout(attempt, delayMs);
      });
    };
    attempt();
  });
}
