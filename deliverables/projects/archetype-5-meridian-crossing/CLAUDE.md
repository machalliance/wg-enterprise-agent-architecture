# Working in this repo

Meridian Crossing: four supplier agents and a buyer agent negotiating a real procurement across
organizational boundaries, over A2A, with DID/VC identity, per-org signed half-trails, and an optional
A2CN wire profile and Stripe USDC settlement.

**The repo root is also the pnpm workspace root — run everything from here.** The code is in
`packages/`, the tooling in `infra/`, the fixtures in `seed/`. This used to be split, with the workspace
one level down in `meridian-crossing/`; it was flattened, so a `cd meridian-crossing` in an older doc,
script or scanner path is stale rather than something to restore.

## Commands

```bash
pnpm install            # pnpm, NOT npm/yarn — this is a workspace with linked packages
pnpm build              # tsc -b (project references). Agents run the emitted dist/, not a TS loader
pnpm test               # identity:issue + clean + build + node --test over dist/
pnpm sweep              # the 10-way behavioural sweep (see below)
pnpm demo               # terminal demo; add --web for the dashboard, --usdc for settlement
pnpm clean              # tsc -b --clean AND rm -rf dist + tsconfig.tsbuildinfo
```

## Two things that will mislead you if you don't know them

**Tests run COMPILED output.** `node --test` globs `packages/*/dist/*.test.js`, so a test only runs if it
compiled. Worse, `tsc -b --clean` deletes only outputs it still has inputs for: a test whose source was
deleted or renamed leaves its compiled `.js` behind and keeps passing forever. One did — a stale
`reconcile.test.js` contributed 11 phantom tests to every count until it was found. `pnpm test` therefore
runs `pnpm clean` first, which is why a test run always pays a full rebuild. Do not "optimise" that away.

**Private mandate numbers must never reach the wire or a prompt.** The buyer knows a reservation price and
a spend cap that the counterparty must not learn. Two lints enforce this (`mandate.test.ts`) — one over
outbound wire messages, one over the LLM prompt — and `rationale.ts` compares numeric VALUES rather than
characters, because a model writing prose formats money (`9_168`, `9.168k`, `9,168.00`, `９１６８`, `9.2e3`
have all been caught leaking). If you add a field to a prompt or an envelope, assume those lints are the
only thing standing between you and a disclosure, and read them before arguing with them.

## Testing rules — these are not optional

1. **Web/dashboard runs are driven with Playwright, never by curling the buyer's control routes.** A POST
   to `/start` proves the route works; it says nothing about whether the operator surface that holds the
   kill switch and the approval buttons ever rendered, or rendered enabled.
2. **Configure your own LLM gateway.** `llm.ts` speaks the OpenAI Chat Completions API, so any compatible
   gateway works: set `LLM_BASE_URL`, `LLM_API_KEY` and `LLM_MODEL` in `.env.local` and `infra/sweep.mjs`
   uses them untouched. With none set it falls back to OpenRouter and sends no key, so assume a 401 and set
   your own gateway — that keyless default only works where something between the agent and the gateway
   attaches the credential for you. When the harness substitutes that fallback it drops any inherited
   `LLM_API_KEY`, because a key issued for one provider must never be sent to another.
3. **`TURN_DELAY_MS` is per MODE, chosen by the launcher** — `2000` for `--web` (a human reads the turns and
   the kill switch needs a window), `0` for the terminal run, `1000` only as the buyer server's own fallback
   when started directly. It is a DEFAULT, not one of the launcher's hard overrides: a shell or `.env.local`
   value wins, which is what lets `pnpm sweep` force `0` on its `--web` legs too. **Set `0` yourself for any
   other UNATTENDED run** — CI, anything nobody is watching — where pacing was the dominant cost. It is not
   purely cosmetic either way: pacing also consumes the mandate's 180s wall-clock budget, so never compare
   prices across runs with different pacing and call it a single-variable comparison.

`pnpm sweep` already obeys all three. Prefer it over hand-rolling a run:

```bash
pnpm sweep                                    # all 10
pnpm sweep web-llm --no-tests                 # one sweep
pnpm sweep llm --model=deepseek/deepseek-v3.2 # exercise the SHIPPED default model
```

The harness defaults to `anthropic/claude-haiku-4.5` for speed (≈1.2s per tool call versus ≈4.2s, and a
far tighter spread). That means a sweep does **not** exercise the product's `DEFAULT_LLM_MODEL` — run the
`--model=` form before a release, since the wire contract is model-independent but prompt adherence is not.

Playwright needs its browser once per machine: `npx playwright install chromium` (~110MB, so it needs
outbound network to Playwright's CDN; where that is blocked, point `PLAYWRIGHT_BROWSERS_PATH` at a
pre-seeded cache instead). Without it the web sweeps report Playwright as missing rather than failing
obscurely.

## CI

- **CodeQL** (`.github/workflows/codeql.yml`) on **all pull requests** (any base branch), pushes to `main`,
  and weekly. `push:` is scoped to `main` deliberately — on a feature branch it fired alongside
  `pull_request` and doubled every check, while `pull_request` already covers each push to a PR via
  `synchronize`. Same triggers in `.github/workflows/dependency-review.yml`. The job also sets
  `CODEQL_ACTION_DIFF_INFORMED_QUERIES: false`: the action defaults to analysing only lines the PR touched,
  which reported zero results on a tree carrying ten open alerts. Two
  languages: `javascript-typescript` for the product code and `actions` for the workflow files themselves.
  It is the interprocedural dataflow check — the one that can follow untrusted counterparty input to a sink
  across functions, which the pattern scanners cannot. Note it does NOT do secret scanning; that is a
  repository setting (Settings → Code security), not something a workflow provides.
- **CodeRabbit** is enabled on the repo and reviews pull requests through its GitHub App, configured by
  `.coderabbit.yaml` at the root: `auto_review.enabled: true` plus `auto_incremental_review: true`, so every
  push to a PR gets a fresh review. There is deliberately **no workflow** for it — a CLI job would double
  every review and double the quota, and the review rate limit is real (it is easy to exhaust in a busy
  session). Widen coverage by editing `.coderabbit.yaml` (`base_branches`, `drafts`), not by adding CI.
- Locally, `coderabbit review --uncommitted` reviews staged work before it ever becomes a PR.
- **Semgrep and Trivy are configured but not yet wired into CI** (`.semgrepignore`, `trivy.yaml`). Run them
  locally: `semgrep scan --config=auto .` and `trivy fs --config trivy.yaml .` from the repo root. Note
  semgrep only honours `.semgrepignore` when it walks a directory — passing explicit file paths bypasses it.

## Conventions worth matching

- **Comments explain WHY, and name the failure the code prevents.** The existing code does this heavily and
  it is the house style — a comment that restates the code is noise, one that records the bug is the point.
- **Dependencies are pinned exactly** (no `^`/`~`) and listed in `infra/VERSIONS.md` with a reason.
  `pnpm-workspace.yaml` enforces a 7-day publish quarantine (`minimumReleaseAge`), so a brand-new release
  will be refused; that is deliberate.
- **`.env.example` documents every variable the code reads**, and `infra/env.test.mjs` fails the build if it
  does not. Adding `process.env.X` means documenting `X`.
- Assertions should be **non-vacuous**: prove a test fails when the thing it checks is broken. Several
  guarantees here were silently passing on empty arrays or absent values before that was checked.

## Known architectural debt and standards gaps — ACCEPTED for the prototype stage

The full list lives in **[`docs/known-limitations.md`](docs/known-limitations.md)**:
ten architecture items and three standards-conformance gaps, found in a review and an audit (both
2026-08-12) and then deliberately left in place. Read it before touching governance state, the A2CN codec,
identity resolution, `negotiate.ts`, or a supplier entrypoint.

**Do not act on anything in that file unless that is the task you were given.** It exists so nobody
re-discovers those items as bugs, re-litigates them mid-task, or "helpfully" refactors them unasked. The
two entries most likely to bite you mid-edit, repeated here because they are hazards rather than debt:

- **`packages/buyer/src/negotiate.ts` is the highest-risk place in the repo to add a line.** Any new `await`
  between `authorizeSettle` and `bindSettle` reopens a documented ledger bug (see `Governor.bindSettle`).
- **A change to one supplier entrypoint must be applied to all four.** The four supplier packages are one
  package copied four times; every entrypoint fix has to land four times until that is split.

### Do not "fix" these while working on something else

The following are load-bearing and must survive any future refactor verbatim: the two private-mandate leak
lints and `rationale.ts`'s value-based comparison; the half-trail / §9 two-hash agreement design (no org
ever reads another's store); the ACCEPT-is-the-settle asymmetry and every `settle-unknown` /
`CAPTURE_UNCONFIRMED` branch that follows from it; and the comment style itself.
