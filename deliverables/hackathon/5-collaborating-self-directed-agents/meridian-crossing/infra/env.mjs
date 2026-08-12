// Loads `.env.local` into process.env before anything else runs.
//
// Preloaded with `node --import ./infra/env.mjs …` from the package.json scripts rather than imported
// from application code: `--import` runs before the main module AND before its import graph, so a module
// that reads an env var at top level (packages/buyer/src/server.ts, packages/dashboard/server.mjs) sees
// the file's values. An ordinary `import "./env.js"` would not guarantee that.
//
// Precedence is Node's, and it is the useful way round: a variable already present in the real
// environment WINS over the file. So `NEGOTIATION_SEED=x pnpm demo` still overrides `.env.local` for one
// run, and the child overrides `infra/demo.mjs` injects (AWAIT_START, USDC_SETTLEMENT,
// SETTLEMENT_AUTO_APPROVE, CONTROL_TOKEN) cannot be clobbered by an operator's file — including when the
// launcher sets them to the empty string, which counts as "already set".
//
// The path is resolved from this module's own location, not the cwd, so it holds wherever it is invoked
// from. Missing file is the normal case — the prototype runs fully with no `.env.local` at all — so it is
// silent rather than warning. `.env.example` is the committed template listing every variable.

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const envFile = join(dirname(fileURLToPath(import.meta.url)), "..", ".env.local");
if (existsSync(envFile)) process.loadEnvFile(envFile);
