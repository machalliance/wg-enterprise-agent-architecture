/**
 * The environment template has to describe the environment.
 *
 * `.env.example` is committed and `GETTING-STARTED.md` promises it lists every
 * variable the code reads. A promise in prose is a promise nobody keeps: a
 * variable added to a tool six months from now is documented only if someone
 * remembers, and the reviewer who copies the template gets a run configured by
 * defaults they were never shown.
 *
 * So the sync is a test. Meridian Pulse (`scripts/env-docs.test.mjs`) and
 * Meridian Crossing (`infra/env.test.mjs`) both carry one; this is the same
 * guarantee in this prototype's shape.
 *
 * One deliberate difference from those two. They also assert that every line of
 * the template is commented out, so that a freshly copied file changes nothing.
 * This template sets `REPAIR_MODE=dry-run` live and on purpose — dry-run is how
 * the desk earns its write scope, and a copied template that silently defaulted
 * to committing writes would be the wrong safe default. Only the variable names
 * are checked here.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories holding code that runs. Excludes build output and dependencies. */
const SOURCE_DIRS = ["agent", "app", "components", "infra", "lib", "tests"];
const SOURCE_FILES = ["next.config.ts"];
const SOURCE_EXTENSIONS = [".ts", ".tsx", ".mts", ".mjs"];

/**
 * This file, excluded from its own scan. It has to spell out the access forms it
 * looks for, in prose and in a regex literal, and a scanner that reads its own
 * documentation finds variables nothing sets.
 */
const SELF = "tests/env.test.ts";

/**
 * Variables the runtime supplies rather than the operator. Naming them in the
 * template would tell a reader to set something they must not.
 */
const PROVIDED_BY_PLATFORM = new Set([
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  "VERCEL_URL",
  "VERCEL_OIDC_TOKEN",
]);

/**
 * Set by the operator, read by eve rather than by anything in this repository.
 * They belong in the template — a reviewer configuring a live run needs them —
 * but they will never appear as a `process.env` read here, so the orphan check
 * has to know about them by name.
 *
 * Adding to this list is a claim that the framework reads the variable. Check
 * that it does before you add one: the cheap way to make this test green is also
 * the way to make the template lie again.
 */
const READ_BY_FRAMEWORK = new Set([
  "AI_GATEWAY_API_KEY",
  "PORT",
  "EVE_TRACES_CONTENT",
]);

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (SOURCE_EXTENSIONS.some((e) => entry.endsWith(e))) out.push(path);
    }
  };
  for (const dir of SOURCE_DIRS) {
    const path = join(root, dir);
    try {
      if (statSync(path).isDirectory()) walk(path);
    } catch {
      // A source directory that does not exist is not this test's business.
    }
  }
  for (const file of SOURCE_FILES) {
    try {
      statSync(join(root, file));
      out.push(join(root, file));
    } catch {
      // Same.
    }
  }
  return out;
}

/** Every `process.env.FOO` and `process.env["FOO"]` read anywhere in source. */
function variablesReadInSource(): Map<string, string[]> {
  // Both access forms, because a rename to the bracket form should not silently
  // drop a variable out of this test's sight.
  const pattern = /process\.env(?:\.([A-Za-z_][A-Za-z0-9_]*)|\[\s*["'`]([^"'`]+)["'`]\s*\])/g;
  const found = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    if (file.slice(root.length + 1) === SELF) continue;
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(pattern)) {
      const name = match[1] ?? match[2];
      if (name === undefined || PROVIDED_BY_PLATFORM.has(name)) continue;
      const where = file.slice(root.length + 1);
      const seen = found.get(name);
      if (seen === undefined) found.set(name, [where]);
      else if (!seen.includes(where)) seen.push(where);
    }
  }
  return found;
}

/** Every variable named in `.env.example`, whether the line is commented or not. */
function variablesInTemplate(): Set<string> {
  const text = readFileSync(join(root, ".env.example"), "utf8");
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    // A commented variable still documents it — that is the template's whole
    // idiom, so `# FOO=bar` counts exactly as much as `FOO=bar`.
    const match = /^\s*#?\s*([A-Z][A-Z0-9_]*)\s*=/.exec(line);
    if (match?.[1] !== undefined) names.add(match[1]);
  }
  return names;
}

test(".env.example documents every variable the code reads", () => {
  const template = variablesInTemplate();
  const missing = [...variablesReadInSource()]
    .filter(([name]) => !template.has(name))
    .map(([name, files]) => `${name} (read in ${files.join(", ")})`);
  assert.deepEqual(
    missing,
    [],
    `.env.example is missing ${missing.length} variable(s) the code reads. Add them, ` +
      `commented out, with the default and one line on what changes if it is set.`,
  );
});

test(".env.example names nothing the code does not read", () => {
  const read = new Set(variablesReadInSource().keys());
  const orphans = [...variablesInTemplate()].filter(
    (name) =>
      !read.has(name) && !PROVIDED_BY_PLATFORM.has(name) && !READ_BY_FRAMEWORK.has(name),
  );
  // The other direction matters as much. A variable that was renamed or removed
  // leaves a line in the template that a reader will set, and then wonder why
  // nothing happened.
  assert.deepEqual(
    orphans,
    [],
    `.env.example documents ${orphans.length} variable(s) nothing reads. Remove them, ` +
      `or add them to READ_BY_FRAMEWORK if eve reads them, or to PROVIDED_BY_PLATFORM ` +
      `if the runtime supplies them.`,
  );
});
