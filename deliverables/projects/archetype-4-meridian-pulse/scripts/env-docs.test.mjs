import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * .env.example completeness (parity with bucket 5's infra/env.test.mjs).
 *
 * Two load-bearing properties, each with a way of silently breaking:
 *
 *   1. The template documents EVERY variable the code reads. A new
 *      `process.env.SOMETHING` added and not added to .env.example is an
 *      undocumented knob — nobody running the demo can discover it. This scans
 *      the source and fails on one.
 *   2. `cp .env.example .env` is a NO-OP. Every line is blank or commented, so a
 *      fresh copy cannot change how the prototype behaves. (Our .env.example
 *      documents the fixed gateway ports as prose rather than assignments, on
 *      purpose — they live in the gateway config, not the environment.)
 *
 * This is a plain Node test (no build step) run by `node --test` alongside the
 * compiled package tests.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const envExample = readFileSync(join(root, ".env.example"), "utf8");

describe(".env.example — the committed template", () => {
  it("has no active assignments, so copying it changes nothing", () => {
    const active = envExample
      .split("\n")
      .map((line, i) => [i + 1, line])
      .filter(([, line]) => line.trim() !== "" && !line.trim().startsWith("#"));
    assert.deepEqual(
      active,
      [],
      "every line must be blank or commented — an active line would change behaviour on copy",
    );
  });

  it("documents every environment variable the code reads", () => {
    const found = readEnvVarsFromSource();
    // ASSERT THE INPUT FIRST. This test filters a list down to violations and
    // expects none — which passes just as happily on a list that was empty to
    // begin with. If the walk finds no source (a package rename, a moved dir),
    // it must fail loudly rather than certify an empty scan.
    assert.ok(found.length > 0, "scanned no env vars — the source walk is looking in the wrong place");
    const undocumented = found.filter((v) => !mentions(v));
    assert.deepEqual(
      undocumented,
      [],
      "add these to .env.example (an undocumented knob is one nobody can find): " + undocumented.join(", "),
    );
  });

  it("actually scanned the package sources (guards a broken walk)", () => {
    const files = sourceFiles();
    assert.ok(files.length >= 5, `expected to scan several source files, found ${files.length}`);
    // A spot-check on a var we know is read, so a scan that finds files but not
    // env reads (e.g. a regex change) still fails.
    assert.ok(readEnvVarsFromSource().includes("MCP_COMMERCE_DB"));
  });
});

/** Every `process.env.FOO` in non-test source under packages/, uppercased + sorted. */
function readEnvVarsFromSource() {
  const found = new Set();
  for (const file of sourceFiles()) {
    const text = readFileSync(file, "utf8");
    for (const [, name] of text.matchAll(/process\.env\.([A-Za-z_][A-Za-z0-9_]*)/g)) {
      found.add(name.toUpperCase());
    }
  }
  return [...found].sort();
}

function sourceFiles() {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!["node_modules", "dist", "public"].includes(entry.name)) walk(path);
      } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        out.push(path);
      }
    }
  };
  walk(join(root, "packages"));
  return out;
}

/** True if .env.example names the variable anywhere — as a sample line or in prose. */
function mentions(name) {
  // `name` is captured from source by /([A-Za-z_][A-Za-z0-9_]*)/, so it is word
  // characters only — no regex metacharacter can appear in it, and the pattern
  // has no quantifier to backtrack on. Not a non-literal-regexp hazard.
  return new RegExp(`\\b${name}\\b`).test(envExample);
}
