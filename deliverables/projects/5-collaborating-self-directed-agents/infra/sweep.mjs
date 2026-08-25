import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Unattended sweep of every way this demo can be run: the test suite, then the four terminal modes and the
 * four `--web` modes (deterministic/LLM x settlement off/on). One command, one verdict table.
 *
 *   node infra/sweep.mjs              # all 9
 *   node infra/sweep.mjs det web-llm  # only the named sweeps
 *
 * TWO RULES THIS FILE EXISTS TO ENFORCE, because breaking either makes a green result meaningless:
 *
 *  1. A `--web` sweep is driven through a REAL BROWSER (Playwright). Pressing Start by POSTing `/start`
 *     tests the route and skips the thing that actually matters — the operator surface that holds the kill
 *     switch and the approval buttons. A curl cannot tell you the Start button was ever reachable, or that
 *     an approval button rendered enabled. So the web sweeps click.
 *  2. An LLM sweep uses whatever gateway is configured — see `LLM_ENV` below. It must not force a provider:
 *     `llm.ts` speaks the OpenAI Chat Completions API and works against any compatible gateway, so an
 *     operator's own `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` is used untouched.
 *
 * Every sweep asserts on the buyer's own `/state`, not on log scraping: the mode that actually engaged, the
 * settlement layer's actual state, and one outcome per cleared supplier.
 */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUYER = "http://127.0.0.1:41100";
const DASH_PORT = Number(process.env.DASHBOARD_PORT ?? 41200);
const OUT = join(ROOT, "trails", "sweeps");

/**
 * The gateway an LLM sweep talks to.
 *
 * `llm.ts` speaks the OpenAI Chat Completions API and works against ANY compatible gateway, so this must
 * not force one. Precedence:
 *
 *   1. If the operator has set `LLM_BASE_URL` (shell or `.env.local`), THEIR configuration is used
 *      untouched — base URL, key, and model. Someone with an Anthropic, Azure or self-hosted gateway is
 *      testing their own setup, and a harness that overrode it would be testing something else.
 *   2. Otherwise this fallback applies: OpenRouter with NO key. Expect a 401 — it authenticates only in the
 *      narrow case where something between this process and the gateway attaches the credential. Set
 *      `LLM_BASE_URL`/`LLM_API_KEY` to a gateway you hold a key for.
 *
 * `--model=<id>` overrides the model in either case.
 */
const OPERATOR_GATEWAY = Boolean(process.env.LLM_BASE_URL?.trim());
const MODEL_FLAG = process.argv.find((a) => a.startsWith("--model="))?.slice(8);

/**
 * Harness default model: `anthropic/claude-haiku-4.5` via OpenRouter, for speed — measured through that
 * gateway, ~1.2s per tool call (1057-1418ms) against ~4.2s (680-9185ms) for `deepseek/deepseek-v3.2`, over
 * roughly 20 SERIAL calls per negotiation. HOW-TO-DEMO.md independently calls haiku the safest live-demo
 * pick.
 *
 * The trade-off to state when reporting results: a default sweep does NOT exercise the product's own
 * `DEFAULT_LLM_MODEL`. Pass `--model=deepseek/deepseek-v3.2` before a release — the wire contract is
 * model-independent, prompt adherence is not.
 */
const DEFAULT_GATEWAY = {
  LLM_BASE_URL: "https://openrouter.ai/api/v1",
  LLM_MODEL: MODEL_FLAG ?? "anthropic/claude-haiku-4.5",
};

const LLM_ENV = OPERATOR_GATEWAY
  ? (MODEL_FLAG ? { LLM_MODEL: MODEL_FLAG } : {})
  : DEFAULT_GATEWAY;

const SWEEPS = [
  { name: "det", flags: [], llm: false },
  { name: "llm", flags: [], llm: true },
  { name: "usdc", flags: ["--usdc"], llm: false },
  { name: "llm-usdc", flags: ["--usdc"], llm: true },
  { name: "web", flags: ["--web"], llm: false },
  { name: "web-llm", flags: ["--web"], llm: true },
  { name: "web-usdc", flags: ["--web", "--usdc"], llm: false },
  { name: "web-llm-usdc", flags: ["--web", "--usdc"], llm: true },
  // The AUTO-PROVISIONED token path. Every other sweep sets CONTROL_TOKEN so it can drive the control
  // routes — which is exactly the branch that skips provisioning. This one sets nothing, so the launcher
  // mints its own, and the only way in is the browser (the dashboard proxy injects it server-side).
  { name: "web-autotoken", flags: ["--web"], llm: false, autoToken: true },
];

const only = process.argv.slice(2).filter((a) => !a.startsWith("-"));
// A typo must not look like success. Filtering blindly meant `sweep.mjs web-lm` selected nothing, ran
// nothing, printed "0/0 passed" and exited 0 — the worst possible answer, because it is indistinguishable
// from a clean run in a log or a CI badge.
// Unknown OPTIONS are rejected for the same reason as unknown names: `--no-test` (singular) would have been
// silently dropped, quietly running the suite the caller meant to skip.
const KNOWN_FLAGS = ["--no-tests"];
const badFlags = process.argv
  .slice(2)
  .filter((a) => a.startsWith("-") && !KNOWN_FLAGS.includes(a) && !a.startsWith("--model="));
if (badFlags.length) {
  console.error(`unknown option(s): ${badFlags.join(", ")}`);
  console.error(`known: ${KNOWN_FLAGS.join(", ")}, --model=<id>`);
  process.exit(2);
}
const unknown = only.filter((n) => !SWEEPS.some((s) => s.name === n));
if (unknown.length) {
  console.error(`unknown sweep(s): ${unknown.join(", ")}`);
  console.error(`known: ${SWEEPS.map((s) => s.name).join(", ")}`);
  process.exit(2);
}
const selected = only.length ? SWEEPS.filter((s) => only.includes(s.name)) : SWEEPS;
const skipTests = process.argv.includes("--no-tests");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const rows = [];

  if (!skipTests && !only.length) rows.push(await runTests());
  for (const s of selected) rows.push(await runSweep(s));

  console.log("\n=== SWEEP SUMMARY ===");
  for (const r of rows) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(13)} ${r.detail}`);
  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

/** Sweep 1: the unit/integration suite, through the real `pnpm test` script. */
async function runTests() {
  const log = join(OUT, "tests.log");
  const { code, out } = await run("pnpm", ["test"], {}, 900_000);
  writeFileSync(log, out);
  // Not a ReDoS surface: `k` only ever comes from the hardcoded list on the next line, so the pattern is a
  // fixed template around one of five literal words. No untrusted input, no nested quantifier.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  const num = (k) => Number(new RegExp(`^# ${k} (\\d+)$`, "m").exec(out)?.[1] ?? -1);
  const [tests, pass, fail, skipped, todo] = ["tests", "pass", "fail", "skipped", "todo"].map(num);
  // `skipped`/`todo` are asserted, not just reported: a suite that quietly stops running cases still exits 0.
  const ok = code === 0 && fail === 0 && pass === tests && tests > 0 && skipped === 0 && todo === 0;
  return { name: "tests", ok, detail: `${pass}/${tests} pass, fail=${fail}, skipped=${skipped}, todo=${todo}` };
}

async function runSweep({ name, flags, llm, autoToken = false }) {
  const log = join(OUT, `${name}.log`);
  // `null` means: do not set CONTROL_TOKEN at all, and let demo.mjs mint one.
  const token = autoToken ? null : `sweep-${name}-${process.pid}`;
  const web = flags.includes("--web");
  const wantUsdc = flags.includes("--usdc");
  let out = "";
  let child;

  try {
    await killStragglers();
    child = spawn("pnpm", ["demo", ...flags], {
      cwd: ROOT,
      env: childEnvFor(token, llm),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    // A demo that cannot start, or dies early, must fail FAST. Without these the sweep sat out its whole
    // budget — up to 15 minutes for an LLM run — waiting for a `/state` that was never going to answer. An
    // unhandled 'error' on a ChildProcess also throws, which would take the harness down mid-matrix.
    let died = null;
    child.on("error", (err) => { died = `demo failed to start: ${err.message}`; });
    child.on("close", (code) => { if (died === null && code !== 0) died = `demo exited early (code ${code})`; });
    const aliveOr = async (fn, budgetMs) => waitFor(async () => (died ? "dead" : await fn()), budgetMs);

    if (autoToken) {
      // The buyer is up when its port answers; we deliberately cannot read /state without the token.
      if (!(await waitForPort(41100, "127.0.0.1", 120, 1_000))) return fin(false, "buyer port never opened");
      // THE POINT OF THIS SWEEP: with a minted token, an un-tokened direct caller must be refused. If this
      // returns 200 the launcher failed to provision, and every control route is open on the buyer's port.
      // Plain HTTP is correct here and cannot be otherwise: the buyer binds 127.0.0.1 and serves HTTP, and
      // this assertion is specifically about the LOOPBACK port a direct caller would use. TLS would be
      // testing a different deployment than the one that exists.
      // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request
      const direct = await fetch(`${BUYER}/state`, { signal: AbortSignal.timeout(5_000) })
        .then((r) => r.status)
        .catch(() => 0);
      if (direct !== 401) return fin(false, `un-tokened /state returned ${direct}, expected 401`);
    } else if (!(await aliveOr(() => state(token), 120_000))) {
      return fin(false, died ?? "buyer /state never answered");
    }
    if (died) return fin(false, died);
    if (web) {
      const clicked = await pressStartInBrowser(token);
      if (!clicked.ok) return fin(false, `browser: ${clicked.reason}`);
    }

    // Done when every cleared supplier has an outcome. Deliberately not a "count stopped changing" window:
    // one LLM turn can take tens of seconds, and a short window reports a mid-negotiation run as finished.
    const s = await aliveOr(async () => {
      const st = await state(token);
      const outs = st?.outcomes?.length ?? 0;
      const cleared = st?.cleared?.length ?? 0;
      return outs > 0 && outs === cleared ? st : null;
    }, llm ? 900_000 : 300_000);

    if (died) return fin(false, died);
    if (!s || s === "dead") return fin(false, "outcomes never reached one-per-cleared-supplier");
    writeFileSync(join(OUT, `${name}.state.json`), JSON.stringify(s, null, 2));

    const mode = s.reasoning?.mode;
    const settled = s.outcomes.filter((o) => o.result === "SETTLED");
    const problems = [];
    if (mode !== (llm ? "llm" : "deterministic")) problems.push(`mode=${mode}`);
    if (Boolean(s.usdcEnabled) !== wantUsdc) problems.push(`usdc=${s.usdcEnabled}`);
    if (!s.started) problems.push("not started");
    if (settled.length !== 1) problems.push(`${settled.length} settled`);
    // The invariant worth a sweep of its own: a `--web` run must NEVER auto-approve a payment, because that
    // is the one step a human owns. Terminal `--usdc` must, since it has no button to press — but only for a
    // deal that needs approval at all; below the gate neither mode involves a human.
    if (wantUsdc) {
      // WHICH branch the buyer should take is a property of the deal, not of the sweep. The gate fires on
      // `totalUsd > humanApprovalAboveUsd` (settlement.ts), and this block used to assume the over-gate
      // branch unconditionally — safe only because the deterministic runs always settle at $9,168 and clear
      // the $9,100 default. Then an LLM run negotiated Cascade down to exactly $9,100, landing UNDER the
      // gate, so the buyer settled autonomously and correctly, and both `llm-usdc` sweeps reported failure.
      // That is the worst kind of red: it fires on the price the agent achieved, and it cannot distinguish
      // a broken approval gate from a better deal. So derive the expectation from the settled total.
      const gateUsd = await approvalThreshold(token);
      // Type-check BEFORE coercing: `Number(null)` is 0, so a `/state` that lost `committedUsd` altogether
      // would pass the finiteness guard below as a $0 deal, land under the gate, and let the sweep bless an
      // autonomous settlement while the committed-total contract was broken. Anything not already a number
      // becomes NaN and fails loudly instead.
      const totalUsd = typeof s.committedUsd === "number" ? s.committedUsd : Number.NaN;
      if (gateUsd === null) problems.push("settlement policy never reported an approval threshold");
      if (!Number.isFinite(totalUsd)) problems.push(`committedUsd=${s.committedUsd}`);
      const needsHuman = gateUsd !== null && Number.isFinite(totalUsd) && totalUsd > gateUsd;
      // `out` fills asynchronously and the settlement line lands AFTER the outcome that triggered it, so a
      // single sample right after /state settles is a race: the assertion would fail on timing, not on
      // behaviour. Wait for the marker this mode must produce; only its ABSENCE is a finding.
      const expected = needsHuman ? (web ? /awaiting human/ : /auto-approved/) : /settled autonomously/;
      const seen = await waitFor(() => (expected.test(out) ? true : null), 60_000, 1_000);
      if (!seen) {
        problems.push(needsHuman
          ? (web ? "web did not hold the payment" : "terminal did not auto-approve")
          : `$${totalUsd} is within the $${gateUsd} gate but the payment did not settle autonomously`);
      }
      // The mirror of the forbidden check below, and just as load-bearing: a gate that holds deals it should
      // have paid is as wrong as one that pays deals it should have held, and it fails CLOSED — so nothing
      // downstream breaks and only an assertion can catch it.
      if (!needsHuman && /awaiting human/.test(out)) problems.push("held a payment that was within the gate");
      // THE MONEY ACTUALLY MOVED. Everything above this line is about the approval DECISION — which
      // marker was logged, whether a button rendered — and none of it looks at whether Stripe captured.
      // That gap was not theoretical: a `token_currency` casing bug made `simulate_crypto_deposit` 400 on
      // every terminal `--usdc` run, and this sweep passed anyway, because the auto-approval line it
      // asserts on is printed either way. Checked whenever the buyer released the money WITHOUT a human —
      // terminal auto-approve, and either mode under the gate. Only `--web` over the gate is exempt, because
      // that run deliberately stops at the operator and no capture should occur without one.
      if (!(web && needsHuman)) {
        const captured = await waitFor(() => (/captured on-chain/.test(out) ? true : null), 60_000, 1_000);
        if (!captured) problems.push("payment was approved but never captured on-chain");
      }
      // The forbidden one needs no wait: if it has appeared by now the invariant is already broken.
      if (web && /auto-approved/.test(out)) problems.push("web auto-approved a payment");
      // "Held for a human" is only true if a human can actually act. The log line says the buyer withheld
      // the payment; it says nothing about whether the operator was given a working button. A dashboard that
      // renders no control, or a disabled one, is indistinguishable from an auto-approval as far as the deal
      // is concerned — the money never moves and nobody can move it. So look at the real button.
      if (web && needsHuman && seen) {
        const btn = await checkApprovalButton();
        if (!btn.ok) problems.push(btn.reason);
      }
    }
    const res = s.outcomes.map((o) => `${o.agentName.split(" ")[0]}=${o.result}`).join(",");
    return fin(problems.length === 0, `mode=${mode} usdc=${s.usdcEnabled} [${res}] $${s.committedUsd}` +
      (problems.length ? ` :: ${problems.join("; ")}` : ""));
  } finally {
    writeFileSync(log, out);
    if (child?.pid) { try { process.kill(-child.pid, "SIGKILL"); } catch { /* already gone */ } }
    await killStragglers();
  }

  function fin(ok, detail) { return { name, ok, detail }; }
}

/**
 * Rule 1: press Start in a real browser.
 *
 * Also asserts the button was actually REACHABLE and enabled — the failure this replaces is a dashboard that
 * renders but whose control never appears, which a POST to `/start` would happily report as success.
 */
async function pressStartInBrowser(token) {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { return { ok: false, reason: "playwright not installed — run `pnpm add -D -w playwright && npx playwright install chromium`" }; }

  if (!(await waitForPort(DASH_PORT, "127.0.0.1", 60, 500))) return { ok: false, reason: "dashboard port never opened" };

  // `launch()` is INSIDE the try: a missing or broken browser binary threw straight out of this function,
  // past runSweep's own error handling, and killed the whole run before it could print a summary — so one
  // unusable chromium hid the results of every sweep that had already passed.
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    // The dashboard proxies the buyer and injects the control token itself; a browser needs no header.
    await page.goto(`http://127.0.0.1:${DASH_PORT}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const start = page.locator("#start");
    await start.waitFor({ state: "visible", timeout: 60_000 });
    if (await start.isDisabled()) return { ok: false, reason: "Start button rendered disabled" };
    await start.click();
    // Confirm through the buyer's own state, not the button's appearance.
    const started = await waitFor(async () => ((await state(token))?.started ? true : null), 60_000);
    return started ? { ok: true } : { ok: false, reason: "clicked Start but the buyer never started" };
  } catch (err) {
    return { ok: false, reason: `browser drive failed: ${String(err.message).slice(0, 120)}` };
  } finally {
    await browser?.close();
  }
}

/**
 * The child's environment.
 *
 * For the auto-token sweep, CONTROL_TOKEN is DELETED rather than merely left unset. Spreading `process.env`
 * and omitting the key is not the same thing: this harness is launched through `--import ./infra/env.mjs`,
 * which loads `.env.local` into its own environment, and an operator may simply have the variable exported.
 * Either way the child would inherit it, demo.mjs would honour it, and the sweep whose entire purpose is to
 * exercise PROVISIONING would quietly test the operator-set path instead — passing, while proving nothing.
 */
function childEnvFor(token, llm) {
  const env = { ...process.env, ...(llm ? LLM_ENV : {}) };

  // EMPTY STRING, never `delete`. The child runs under `--import ./infra/env.mjs`, which calls
  // `process.loadEnvFile` — and that does not overwrite a variable already present in the environment,
  // treating an empty one as present (pinned by infra/env.test.mjs). So deleting a key here does not clear
  // it: it hands `.env.local` the chance to set it in the child, which is the opposite of the intent. An
  // empty value is what actually says "off, and the file may not override this" — the same trick demo.mjs
  // uses for AWAIT_START / SETTLEMENT_AUTO_APPROVE.

  // Whose control token: the operator's, or none so the launcher mints its own.
  env.CONTROL_TOKEN = token === null ? "" : token;

  // NO PACING. The launcher paces `--web` runs at 2000ms so a human audience can follow them; nobody is
  // watching a sweep, and it was the dominant cost — 3s on every turn of every parallel negotiation, against
  // a tool call that takes a second or two. Set for ALL sweeps, not just the LLM ones.
  //
  // Not purely cosmetic, and worth knowing when reading a sweep's numbers: pacing also consumes the
  // mandate's 180s wall-clock budget, so at 0 a negotiation reaches its natural end rather than being cut
  // off by the clock. That is the behaviour worth testing, but it is a different timing regime from a live
  // demo — never compare prices across runs with different pacing and call it one variable.
  env.TURN_DELAY_MS = "0";

  if (llm) {
    // Never forward a key to a gateway it was not issued for. With the operator's own `LLM_BASE_URL` their
    // key belongs with it and is left alone. When we substitute OUR fallback gateway, any inherited
    // `LLM_API_KEY` was issued for something else — sending it there would both fail and disclose a
    // credential to a third party. Pinned to the literal `llm.ts` default rather than emptied, because
    // `apiKey` is resolved with `??`: an empty string is not nullish, so `""` would send a BLANK bearer
    // token instead of the placeholder.
    if (!OPERATOR_GATEWAY) env.LLM_API_KEY = "PLACEHOLDER";
  } else {
    // A DETERMINISTIC sweep must be deterministic. `llmConfigFromEnv` returns null only when
    // `LLM_BASE_URL` is falsy, so an inherited gateway would silently put the buyer in LLM mode — and the
    // deterministic sweeps assert `mode === "deterministic"`, so anyone who has a gateway configured (which
    // is everyone who uses the LLM path) could not run them at all.
    env.LLM_BASE_URL = "";
  }
  return env;
}

/**
 * Is the operator's Create-payment button present and usable?
 *
 * Deliberately a BROWSER check rather than a route check: the point of `--web` withholding a payment is that a
 * person decides, and that only holds if the control reached them enabled.
 */
async function checkApprovalButton() {
  let chromium;
  try { ({ chromium } = await import("playwright")); }
  catch { return { ok: false, reason: "playwright missing, cannot verify the approval button" }; }
  let browser;
  try {
    browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${DASH_PORT}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const btn = page.locator('button[data-settlement-action="approve-funding"]').first();
    await btn.waitFor({ state: "visible", timeout: 60_000 });
    if (await btn.isDisabled()) return { ok: false, reason: "Create-payment button rendered disabled" };
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: `no usable Create-payment button: ${String(err.message).slice(0, 90)}` };
  } finally {
    await browser?.close();
  }
}

async function controlGet(path, token) {
  try {
    // token === null: go through the dashboard proxy, which injects the launcher's minted token server-side.
    // That is also the only route a browser has, so it is the honest way to observe an auto-token run.
    const url = token === null ? `http://127.0.0.1:${DASH_PORT}${path}` : `${BUYER}${path}`;
    const res = await fetch(url, {
      headers: token === null ? {} : { "x-control-token": token },
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
}

const state = (token) => controlGet("/state", token);

/**
 * The buyer's human-approval threshold, read from the buyer rather than duplicated here.
 *
 * Hard-coding it would reintroduce the bug this exists to fix in a new place: `SETTLEMENT_APPROVAL_ABOVE_USD`
 * is configurable, so a sweep carrying its own copy of the number asserts the wrong branch the moment an
 * operator changes it. Returns null when the policy cannot be read, which is itself a finding — never a
 * silent 0, which would make every deal look over the gate.
 */
async function approvalThreshold(token) {
  const s = await controlGet("/settlement", token);
  const usd = s?.policy?.humanApprovalAboveUsd;
  return typeof usd === "number" && Number.isFinite(usd) ? usd : null;
}

/** Poll `fn` until it returns something truthy, or the budget runs out. */
async function waitFor(fn, budgetMs, everyMs = 3_000) {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    const v = await fn();
    if (v) return v;
    await sleep(everyMs);
  }
  return null;
}

function waitForPort(port, host, tries, delayMs) {
  return new Promise((resolve) => {
    let n = 0;
    const attempt = () => {
      const sock = createConnection({ port, host });
      sock.once("connect", () => { sock.destroy(); resolve(true); });
      sock.once("error", () => { sock.destroy(); ++n >= tries ? resolve(false) : setTimeout(attempt, delayMs); });
    };
    attempt();
  });
}

function run(cmd, args, env, timeoutMs) {
  return new Promise((resolve) => {
    let out = "";
    const c = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    const t = setTimeout(() => c.kill("SIGKILL"), timeoutMs);
    let settled = false;
    const done = (code) => { if (settled) return; settled = true; clearTimeout(t); resolve({ code, out }); };
    c.stdout.on("data", (d) => (out += d));
    c.stderr.on("data", (d) => (out += d));
    // An unhandled 'error' on a ChildProcess THROWS. Without this, a missing binary — `pkill` is not on
    // every system — took the harness down with an uncaught exception instead of being reported. Resolving
    // non-zero lets `killStragglers` treat "no pkill here" as nothing to kill and carry on.
    c.on("error", (err) => { out += `\n[spawn error] ${cmd}: ${err.message}\n`; done(-1); });
    c.on("close", (code) => done(code));
  });
}

/** Ports are fixed, so one sweep's leftovers would poison the next. */
async function killStragglers() {
  const pats = ["packages/supplier-", "packages/buyer/dist", "packages/dashboard/server.mjs", "node_modules/.bin/concurrently"];
  for (const p of pats) await run("pkill", ["-f", p], {}, 10_000);
  await sleep(2_000);
}

await main();
