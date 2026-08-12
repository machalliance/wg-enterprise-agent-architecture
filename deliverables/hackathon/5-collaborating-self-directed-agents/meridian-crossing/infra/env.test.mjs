import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

/**
 * `.env.local` configuration surface — the loader (infra/env.mjs), the committed template
 * (.env.example), and the wiring in package.json that connects them.
 *
 * Three properties are load-bearing and each has a way of silently breaking:
 *
 *   1. The real environment WINS over the file. This is not a stylistic preference — `infra/demo.mjs`
 *      injects AWAIT_START / USDC_SETTLEMENT / SETTLEMENT_AUTO_APPROVE into the agent processes based on
 *      the flags it was given, and it injects them as the EMPTY STRING when the flag is absent. If the
 *      file could overwrite an already-set-but-empty variable, an operator's `.env.local` could put
 *      SETTLEMENT_AUTO_APPROVE=1 into a `--web` run and remove the human from the payment step. So the
 *      empty-string case is tested explicitly, not just the "shell override" ergonomics case.
 *   2. `cp .env.example .env.local` must be a NO-OP. The template documents every variable, and every
 *      line is commented out so that copying it cannot change how the prototype behaves.
 *   3. The template must stay complete. A new `process.env.SOMETHING` added to the code and not added to
 *      `.env.example` is an undocumented knob — the reference below scans the source and fails on one.
 *
 * The loader tests run against a byte-identical COPY of infra/env.mjs in a temp tree, because env.mjs
 * resolves `.env.local` relative to its own location: testing the real one in place would read (or worse,
 * require the absence of) whatever `.env.local` the developer running the suite actually has.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

/** A temp tree of the shape env.mjs expects — <tmp>/infra/env.mjs alongside <tmp>/.env.local. */
function sandbox(envLocalContents) {
  const dir = mkdtempSync(join(tmpdir(), "meridian-env-"));
  mkdirSync(join(dir, "infra"));
  cpSync(join(here, "env.mjs"), join(dir, "infra", "env.mjs"));
  if (envLocalContents !== undefined) writeFileSync(join(dir, ".env.local"), envLocalContents);
  return dir;
}

/** Run `node --import <sandbox>/infra/env.mjs -e …` and report the child's view of `names`. */
function childEnv(dir, names, { extraEnv = {}, cwd = dir } = {}) {
  const script = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(names)}.map((k) => [k, process.env[k] ?? null]))))`;
  const out = execFileSync(process.execPath, ["--import", join(dir, "infra", "env.mjs"), "-e", script], {
    cwd,
    // A clean base env, so the developer's own shell cannot make a case pass or fail by accident.
    env: { PATH: process.env.PATH ?? "", ...extraEnv },
    encoding: "utf8",
  });
  return JSON.parse(out);
}

describe("infra/env.mjs — loading .env.local", () => {
  it("loads the file's variables into the process it preloads", () => {
    const dir = sandbox("LLM_MODEL=anthropic/claude-haiku-4.5\nDASHBOARD_PORT=41999\n");
    try {
      assert.deepEqual(childEnv(dir, ["LLM_MODEL", "DASHBOARD_PORT"]), {
        LLM_MODEL: "anthropic/claude-haiku-4.5",
        DASHBOARD_PORT: "41999",
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("lets the real environment win, so a one-off `VAR=x pnpm demo` still overrides the file", () => {
    const dir = sandbox("NEGOTIATION_SEED=from-file\n");
    try {
      const seen = childEnv(dir, ["NEGOTIATION_SEED"], { extraEnv: { NEGOTIATION_SEED: "from-shell" } });
      assert.equal(seen.NEGOTIATION_SEED, "from-shell");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("treats an already-set EMPTY variable as set — the launcher's overrides cannot be clobbered", () => {
    // Exactly what `pnpm demo --web` hands its children: the settlement auto-approve escape hatch OFF,
    // expressed as the empty string. A `.env.local` saying otherwise must not be able to turn it on.
    const dir = sandbox("SETTLEMENT_AUTO_APPROVE=1\nAWAIT_START=\n");
    try {
      const seen = childEnv(dir, ["SETTLEMENT_AUTO_APPROVE", "AWAIT_START"], {
        extraEnv: { SETTLEMENT_AUTO_APPROVE: "", AWAIT_START: "1" },
      });
      assert.equal(seen.SETTLEMENT_AUTO_APPROVE, "", "the file must not be able to arm auto-approval");
      assert.equal(seen.AWAIT_START, "1", "the file must not be able to disarm the Start gate");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("is silent and harmless when there is no .env.local — the offline default path", () => {
    const dir = sandbox(undefined);
    try {
      assert.deepEqual(childEnv(dir, ["LLM_BASE_URL"]), { LLM_BASE_URL: null });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("resolves the file from its own location, not the cwd", () => {
    // `pnpm sample` and the concurrently-spawned agents all run from the repo root today, but nothing in
    // the loader should depend on that.
    const dir = sandbox("DIR_ADDRESS=directory.internal:8888\n");
    try {
      const seen = childEnv(dir, ["DIR_ADDRESS"], { cwd: tmpdir() });
      assert.equal(seen.DIR_ADDRESS, "directory.internal:8888");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe(".env.example — the committed template", () => {
  it("has no active assignments, so `cp .env.example .env.local` changes nothing", () => {
    const active = envExample
      .split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => line.trim() !== "" && !line.trim().startsWith("#"));
    assert.deepEqual(active, [], "every line must be blank or commented — an active line would change behaviour on copy");
  });

  it("documents every variable the code reads", () => {
    const found = readEnvVarsFromSource();
    // ASSERT THE INPUT FIRST. This test's whole shape is "filter a list down to the violations and
    // expect none", which passes just as happily on a list that was empty to begin with. `sourceFiles()`
    // walks the tree by path, so a package move or a directory rename makes it find nothing, and the
    // test then reports that every variable is documented having scanned no source at all.
    assert.ok(found.length > 0, "scanned no source files — the env-var scan is looking in the wrong place");
    const undocumented = found.filter((v) => !mentions(v));
    assert.deepEqual(
      undocumented,
      [],
      "add these to .env.example (an undocumented knob is one nobody can find): " + undocumented.join(", "),
    );
  });

  it("documents the per-agent variable families the code builds dynamically", () => {
    // Built by string interpolation (`${agent.toUpperCase()}_LLM_MODEL`, `${id.toUpperCase()}_PORT`,
    // `${id.toUpperCase()}_URL`), so the source scan above cannot see them.
    const dynamic = [
      ...["BUYER", "SUMMIT", "CASCADE", "ALPINE", "RIDGE"].map((a) => `${a}_LLM_MODEL`),
      ...["SUMMIT", "CASCADE", "ALPINE", "RIDGE"].flatMap((s) => [`${s}_PORT`, `${s}_URL`]),
    ];
    assert.deepEqual(dynamic.filter((v) => !mentions(v)), []);
  });

  it("names the launcher-owned variables so an operator knows not to set them", () => {
    for (const v of ["AWAIT_START", "USDC_SETTLEMENT", "SETTLEMENT_AUTO_APPROVE"]) {
      assert.ok(mentions(v), `${v} must be documented as launcher-owned`);
    }
  });
});

describe("package.json — the loader is wired into the run commands", () => {
  const scripts = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).scripts;
  const preload = "--import ./infra/env.mjs";

  it("preloads env.mjs on every node process the run commands start", () => {
    for (const name of ["suppliers", "demo", "sample", "sweep"]) {
      const nodeInvocations = (scripts[name].match(/\bnode\s/g) ?? []).length;
      const preloads = scripts[name].split(preload).length - 1;
      // Same vacuity as the scan above, one comparison over: `preloads === nodeInvocations` is trivially
      // true at 0 === 0. A script rewritten to launch through a wrapper instead of `node` would stop
      // proving anything about the preload while still reporting green.
      assert.ok(nodeInvocations > 0, `the '${name}' script invokes no \`node\` — nothing to check the preload against`);
      assert.equal(preloads, nodeInvocations, `every \`node\` in the '${name}' script must carry ${preload}`);
    }
  });

  it("does NOT preload it for `pnpm test`, which stays hermetic and offline", () => {
    // A gateway key in .env.local must not quietly turn the suite into a networked one.
    assert.ok(!scripts.test.includes(preload));
  });
});

/** Every `process.env.FOO` / `env.FOO` (a NodeJS.ProcessEnv parameter) in non-test source, uppercased. */
function readEnvVarsFromSource() {
  const found = new Set();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const [, name] of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) found.add(name.toUpperCase());
    // settlement.ts reads its config off a `NodeJS.ProcessEnv` parameter rather than the global.
    for (const [, name] of text.matchAll(/\benv\.([A-Z][A-Z0-9_]{2,})\b/g)) found.add(name);
  }
  return [...found].sort();
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "generated", "public"].includes(entry.name)) walk(path);
      } else if (/\.(ts|mjs)$/.test(entry.name) && !/\.test\.(ts|mjs)$/.test(entry.name)) {
        out.push(path);
      }
    }
  };
  walk(join(root, "packages"));
  walk(here);
  return out;
}

/** True if `.env.example` names the variable anywhere — as a sample line or in the prose around it. */
function mentions(name) {
  // Not a ReDoS surface, and not an escaping bug either: every `name` reaching here was captured by
  // `/\benv\.([A-Z][A-Z0-9_]{2,})\b/` from this repo's OWN source files, so it is upper-case letters,
  // digits and underscores by construction — no regex metacharacter can appear in it, and the pattern
  // built around it has no quantifier to backtrack on. Suppressed inline rather than by path so the
  // reason lives next to the code it excuses; the rule stays active for the rest of the file.
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-regexp.detect-non-literal-regexp
  return new RegExp(`\\b${name}\\b`).test(envExample);
}
