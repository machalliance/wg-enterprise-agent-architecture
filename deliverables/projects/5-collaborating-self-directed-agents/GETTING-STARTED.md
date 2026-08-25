# Getting started — multi-agent inventory purchasing

This gets you from a fresh clone to a green build, passing tests, and a working headless run. For what
the prototype is and why, see [`README.md`](README.md); for presenting it, see
[`HOW-TO-DEMO.md`](HOW-TO-DEMO.md).

## Where to run it

Everything — Docker, Node, the agents, the directory — runs on a **single host**: your own machine, or
a remote dev environment / VM / sandbox. Internal services (the directory's gRPC, agent-to-agent A2A,
the per-agent HTTP) never leave that host; they talk to each other over loopback.

That is enforced, not just conventional. Agents bind `127.0.0.1` rather than all interfaces, and any
agent endpoint the buyer learns **from a discovery record** is validated against a loopback-only policy
first — a capability record is authored by the counterparty, so its `a2aEndpoint` is untrusted input that
could otherwise point the buyer at an internal service. To run agents across separate hosts, opt in
explicitly in `.env.local` (see [step 2](#2-configure-envlocal)):

```dotenv
A2A_BIND_HOST=0.0.0.0                                        # listen beyond loopback
A2A_ALLOWED_ORIGINS=http://summit.internal,https://alpine.example   # allowlist their origins
```

A non-loopback origin with no allowlist fails loudly and names the variable; it never silently fetches.

**Recommended: run it in a container or sandbox.** The prototype starts a handful of long-lived
processes and a Docker container, mints key material, and writes trail files — all of which are easier
to keep isolated and to tear down cleanly inside a disposable environment than directly on a workstation.
Any container or VM that can run Docker and Node works; use whatever provisioning command your chosen
environment provides — nothing here depends on a particular one.

## Prerequisites

Usually already present in a prepared environment; listed so you can sanity-check:

- **Node ≥ 22** (`node -v` → tested on v22.x)
- **pnpm** (`pnpm -v` → tested on 11.x)
- **Docker** running on the host — the **AGNTCY Agent Directory** (discovery) runs as one container.
  Check with `docker ps`.

No cloud keys are required: with no LLM gateway configured the agents fall back to deterministic
reasoners and the whole system still runs.

## 1. Install & build

```bash
pnpm install
pnpm build          # tsc -b across all packages → compiled JS in each package's dist/
```

The agents run as **compiled JS on plain Node** (not a TS runner) — the `agntcy-dir` SDK pulls a
transitive dep whose dual-package build trips on-the-fly TS loaders, so we compile with `tsc -b` and
run the emitted `dist/`. This also matches how it would ship.

## 2. Configure `.env.local`

Everything configurable is read from environment variables, and the place to put them is **`.env.local`**
at the repo root. It is gitignored — it is where your real keys live.

```bash
cp .env.example .env.local     # then uncomment only the lines you need
```

[`.env.example`](.env.example) is the committed template. It lists **every** variable
the code reads, grouped and annotated with its default, and every line is commented out — so a freshly
copied `.env.local` changes nothing, and the prototype still runs deterministically, offline, with no
keys at all. The full reference is also reproduced [below](#environment-variables--full-reference).

Three things worth knowing about how it is loaded:

- **It is loaded automatically** by `pnpm demo`, `pnpm suppliers`, `pnpm sample` and `pnpm sweep`. Node
  reads it before any application code runs (`--import ./infra/env.mjs`, see
  [`infra/env.mjs`](infra/env.mjs)), so no `export` and no `source` is needed.
- **The shell still wins.** A variable already set in the real environment takes precedence over the
  file, so a one-off override works unchanged: `NEGOTIATION_SEED=rehearsal pnpm demo --web`.
- **`pnpm test` does not read it**, on purpose. The suite is offline and hermetic; a gateway key sitting
  in `.env.local` should not quietly turn the tests into networked ones. (It does *test* the file:
  `infra/env.test.mjs` covers the precedence rules, the wiring, and — the reason it earns its place —
  that `.env.example` still names every variable the code reads.)

Three variables are not yours to set **under `pnpm demo`**: `AWAIT_START`, `USDC_SETTLEMENT` and
`SETTLEMENT_AUTO_APPROVE` are derived from the flags you pass and injected into the agents by
`infra/demo.mjs`, which overrides anything the file says — deliberately, so that no file can hand
`SETTLEMENT_AUTO_APPROVE` to a `--web` run and remove the human from the payment step. Putting them in
`.env.local` therefore has no effect there. Starting an agent DIRECTLY is the exception: no launcher is
in the way, so those three are yours to set and keeping the human in the payment step becomes yours to
enforce (`HOW-TO-DEMO.md` spells that out). See
[the launcher-owned section](#launcher-owned) below.

## 3. Run the tests

```bash
pnpm test           # in-process: real Ed25519 + real state machine, no Docker needed
```

This exercises the full negotiation path, the mandate/tier policy, the A2CN §9 transaction record, the §10
audit log, the operator-signed §14 approval receipt, prompt-injection sanitising, and the no-leak
guarantee. It needs **no** directory or network — it wires the buyer straight to the seller engine
in-process.

Note that `pnpm test` starts by running `pnpm clean`, so it always pays a full rebuild. That is deliberate:
the suite runs COMPILED tests (`node --test` over `dist/`), and `tsc -b --clean` does not remove the output
of a test whose source was deleted or renamed — one such leftover kept passing for weeks, inflating every
count. Clearing `dist` (and the `.tsbuildinfo` files) is the only thing that makes a green suite provably
match the sources.

### The behavioural sweep

`pnpm test` covers the contracts in-process. `pnpm sweep` covers the ways the demo can actually be RUN —
the suite, the four terminal modes, the four `--web` modes, and the auto-provisioned-token path — asserting
against the buyer's own `/state` rather than scraping logs:

```bash
pnpm sweep                                     # all ten, unattended
pnpm sweep web-llm --no-tests                  # one sweep by name
pnpm sweep llm --model=deepseek/deepseek-v3.2  # exercise the shipped default model
```

Three things it enforces, because breaking any of them makes a green result meaningless:

- **`--web` is driven through a real browser** (Playwright), clicking Start and the settlement buttons. A
  POST to `/start` would prove the route works while saying nothing about whether the operator surface that
  holds the kill switch ever rendered, or rendered enabled. Run `npx playwright install chromium` once per
  machine (CI included) or the web sweeps will report Playwright as missing.
- **LLM sweeps use whatever gateway you configure.** Set `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` in
  `.env.local` and the sweep uses them untouched — any OpenAI-compatible gateway works, as everywhere else
  in this prototype. With nothing configured it falls back to OpenRouter and sends **no key**, so assume it
  401s and configure your own gateway — that keyless default only works in the narrow case where something
  between the agent and the gateway attaches the credential for you. When the sweep substitutes that
  fallback it drops any inherited `LLM_API_KEY`, so a key issued for one provider is never sent to another.
- **`TURN_DELAY_MS=0`.** The pacing exists for a human audience, so `pnpm demo` applies it only where there
  is one: `2000` with `--web`, `0` in the terminal. The sweep forces `0` even for its `--web` legs, because
  Playwright is the only thing watching and pacing was the dominant cost of a sweep. It is not purely
  cosmetic either way: pacing also consumes the mandate's wall-clock budget, so runs at different paces are
  not directly comparable.

Playwright's browser download (~110MB from its CDN) needs outbound network; in a restricted environment
allow that host or point `PLAYWRIGHT_BROWSERS_PATH` at a pre-seeded cache.

The harness defaults to `anthropic/claude-haiku-4.5` for speed (≈1.2s per tool call against ≈4.2s, with a
far tighter spread, over ~20 serial calls per negotiation). The trade-off is that a sweep does **not**
exercise the product's own `DEFAULT_LLM_MODEL` — use the `--model=` form above before a release, since the
wire contract is model-independent but prompt adherence is not.

## 4. Mint identities & start the directory

```bash
pnpm identity:issue # mint DIDs + Verifiable Credentials (idempotent; REQUIRED on a fresh clone)
pnpm dir:up         # start the real AGNTCY Agent Directory (Docker; gRPC on :8888)
# ...
pnpm dir:down       # stop it when you are done
```

Nothing under `infra/identity/generated/` is committed — it is gitignored, because it holds real private
signing keys including the trust anchor's issuing key. So a fresh clone has **no** key material until you
run the command above. `pnpm demo`, `pnpm test`, `pnpm sample` and `pnpm suppliers` all run it for you, so
the explicit command is only needed when you start an agent process directly.

## 5. Run it headless

The full flow — discover → verify → negotiate → prove — printed to the terminal. This is the quickest
confirmation that the full stack works end to end.

```bash
pnpm demo           # the four suppliers, the buyer, and the directory, in one pane
```

The buyer stays up after the negotiations resolve (the dashboard attaches to the same process under
`--web`), so end it with Ctrl-C when the summary line prints.

To drive the suppliers yourself in a separate pane — for example to restart the buyer repeatedly against
a stable supplier fleet — start them alone and run the buyer's server directly:

```bash
pnpm suppliers                          # pane 1: the four supplier agents publish + serve A2A
pnpm --filter @meridian/buyer serve     # pane 2: the buyer (runs dist/ directly — build first)
```

After a run, the independent half-trails under `trails/` show the discovery decisions, the handshakes,
and the full negotiation turn sequence — reconstructable from either side alone:

```bash
cat trails/buyer.jsonl    # discover/verify; the tamper and illegal-transition probes with their outcomes;
                          #   per-negotiation RFQ→…→decisions; then ready-to-commit per deal, the one
                          #   commit-selection event recording which offer won and why, and the drift flag
cat trails/summit.jsonl   # the long grind — $98 → $96.04 → $94.12 → $92.24 — and no settle: it is stood
                          #   down at the barrier by a cheaper in-policy offer
cat trails/cascade.jsonl  # the rival, in two moves: QUOTE $95, COUNTER $91.68, and the buyer's ACCEPT.
                          #   It wins the deterministic run on being cheapest at the barrier, NOT on
                          #   reaching its floor — $89 is never approached
cat trails/alpine.jsonl   # its concession path down to the floor (the buyer never settles it on its own)
cat trails/ridge.jsonl    # published cid=… ONLY — REJECTED at the trust gate, so never negotiated with
```

Alongside each org that actually negotiated sits a `*.half-trail.jsonl` — that org's **signed,
hash-chained** half of the exchange, which is what the A2CN §9 transaction record is derived from. The
`.jsonl` file is the readable event log; the half-trail is the evidence. RidgeLine has no half-trail at
all, which is itself the proof that the trust gate held: it never exchanged a message to record.

The transport is a property of the **counterparty's agent card**, not of a process-wide setting: the
buyer reads each supplier's card and dials the binding that card declares. Every agent here declares the
A2A SDK's HTTP/JSON-RPC transport, the spec's "always works" binding, so a run needs no transport
configuration at all:

```bash
pnpm demo   # every supplier over A2A HTTP/JSON-RPC
```

Adding a second binding is a card entry plus a client transport factory — no change to any negotiation
code, which is what "the contract and the transport are separable" means here.

## Optional: drive the agents with an LLM

All five agents (buyer + four suppliers) can reason through any **OpenAI-compatible** gateway. Uncomment
three lines in `.env.local`; leave them commented for the deterministic path.

```dotenv
LLM_BASE_URL=https://openrouter.ai/api/v1   # or https://ai-gateway.vercel.sh/v1
LLM_API_KEY=sk-...                          # your gateway key
LLM_MODEL=deepseek/deepseek-v3.2            # any tool-calling model (this one is the default)
```

The model only ever proposes a *move*; the runtime clamps it onto the negotiation state machine and the
buyer's mandate before anything is signed, and the model's free text is never streamed — so the private
reservation price and spend cap never leak, whatever a model says. Per-agent overrides:
`BUYER_LLM_MODEL`, `SUMMIT_LLM_MODEL`, `CASCADE_LLM_MODEL`, `ALPINE_LLM_MODEL`, `RIDGE_LLM_MODEL`.

To confirm which mode is live: the buyer logs `[buyer] reasoning: LLM via … / deterministic …` at
startup. The `LLM_API_KEY` must be a real, backed key; if you also see `[buyer] LLM reasoning fell back
to deterministic: …` each turn, the key isn't authenticating.

## Optional: sample the outcome distribution

With an LLM in the loop a single run proves very little — the same inputs legitimately produce different
prices. To see the *distribution* instead:

```bash
pnpm sample         # in-process: real negotiation + seller engine + signing, no Docker, no browser
```

It runs the real code over an in-process channel (~20 samples in a few minutes, versus ~20 minutes for
five data points through the browser) and shares one `Governor`, `QuoteBoard` and `CommitCoordinator`, so
the spend cap, the rival-quote leverage and the commit barrier all bind exactly as they do live.

```bash
N=20 pnpm sample                              # sample count (default 12)
SUPS=summit,cascade,alpine pnpm sample        # which suppliers (default summit,cascade)
ENDGAME=1 pnpm sample                         # also print the last exchanges of the first runs
```

(Inline like this for one run, or in `.env.local` to make it your standing default — the inline form
wins.)

RidgeLine is absent from the default set deliberately: it is rejected at the trust gate in the live run
and never negotiates, so including it would measure a negotiation that cannot happen.

## Optional: pin a run so it reproduces

Each seller draws a private **disposition** per negotiation — deal hunger, whether it has another buyer,
time pressure — and the draw is a hash of the `negotiationId`, not `Math.random()`. That means a fresh
session differs every time. To pin it (a rehearsed demo, or a CI run that must stay byte-identical):

```bash
NEGOTIATION_SEED=my-fixed-seed pnpm demo --web
```

Same seed → same dispositions, always. Note this pins the *sellers' circumstances*, not an LLM's sampling:
with a gateway configured the model still varies. For a fully reproducible run, leave the LLM env unset.

## Optional: OpenTelemetry traces

```bash
OTEL_ENABLED=1 pnpm demo                      # spans → trails/otel-spans.jsonl (one JSON span per line)
OTEL_ENABLED=1 OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318 pnpm demo   # → a real collector
```

Spans are real OTel spans carrying AGNTCY-style `agntcy.*` attributes (`agntcy.negotiation.id`,
`agntcy.counterparty.did`, `agntcy.wire.profile`). That is a naming convention, not conformance to the
published AGNTCY observability schema — nothing here emits a GenAI semantic-convention attribute. The
default file exporter needs no collector and no network, which is what lets a test assert "one trace per
negotiation" directly against the file. Override the path with `OTEL_TRACES_FILE`.

## Environment variables — full reference

Every knob the code reads, with its default. Nothing here is required: with all of it unset the prototype
runs deterministically, offline, on one host. Set them in **`.env.local`** (see
[step 2](#2-configure-envlocal)) — [`.env.example`](.env.example) is the same list in
copy-and-uncomment form. A shell variable overrides the file for a single run.

**Reasoning**

| Variable | Default | Effect |
|---|---|---|
| `LLM_BASE_URL` | unset | Any OpenAI-compatible gateway. Unset ⇒ all five agents use deterministic reasoners. |
| `LLM_API_KEY` | `PLACEHOLDER` | Gateway key. Must be real and backed, or every turn falls back to deterministic. |
| `LLM_MODEL` | `deepseek/deepseek-v3.2` | Any tool-calling model. `anthropic/claude-haiku-4.5` is the safest live pick. |
| `BUYER_LLM_MODEL`, `SUMMIT_LLM_MODEL`, `CASCADE_LLM_MODEL`, `ALPINE_LLM_MODEL`, `RIDGE_LLM_MODEL` | unset | Per-agent override; wins over `LLM_MODEL`. |
| `NEGOTIATION_SEED` | the `negotiationId` (varies per run) | Pins each seller's private disposition so a run reproduces. |

**Pacing & oversight**

| Variable | Default | Effect |
|---|---|---|
| `TURN_DELAY_MS` | `2000` with `--web`, `0` in the terminal (`1000` for a directly-started buyer) | Pace of the buyer's turns — the audience's read speed, and the kill switch's live window. `pnpm demo` picks the per-mode default; setting it here or inline overrides that for every mode, and `pnpm sweep` forces `0`. Note it also consumes the mandate's wall-clock budget, so it is not purely cosmetic. |
| `APPROVAL_TIMEOUT_MS` | `600000` | How long a held deal waits for a human before parking. |

**Dashboard & control surface**

| Variable | Default | Effect |
|---|---|---|
| `DASHBOARD_PORT` | `41200` | The only port that ever needs exposing. |
| `DASHBOARD_USER` | `operator` | HTTP Basic Auth user. |
| `DASHBOARD_PASS` | unset ⇒ loopback only | Gates the dashboard **and** decides the bind address. Unset: no auth, so it binds `127.0.0.1` only and is unreachable from other hosts (with a startup warning). Set it to bind all interfaces and publish the port. |
| `CONTROL_TOKEN` | auto-provisioned by `pnpm demo` for `--web`/`--usdc` | Shared secret for **every** buyer route. State-changing (also need the `x-requested-by` marker): `POST /start`, `POST /kill`, `POST /approvals/:id/approve`, `POST /approvals/:id/reject`, and — failing closed with no token set — `POST /settlement/:id/approve-funding`, `reject-funding`, `refresh`. Reads: `GET /audit`, `/record`, `/settlement`, `/state`, `/approvals`, and the buyer's own `GET /events`. Must match between buyer and dashboard. |

**Settlement (`--usdc`)**

| Variable | Default | Effect |
|---|---|---|
| `STRIPE_SECRET_KEY` | unset | Stripe **test** secret key (`sk_test_…`). Required by `--usdc`; without it settlement stays off. |
| `SETTLEMENT_APPROVAL_ABOVE_USD` | `9100` | Deal total above which payment waits for a human (in `--web`). |
| `SETTLEMENT_CAPTURE_TIMEOUT_MS` | `30000` | How long to poll Stripe for on-chain capture before leaving the settle in `DEPOSIT_SENT`. |
| `SETTLEMENT_POLL_INTERVAL_MS` | `1500` | How often to poll within that budget. |
| `HTTPS_PROXY` | unset | Standard proxy var. When set, the Stripe SDK is built on the fetch HTTP client so it routes through the proxy. Usually inherited from the shell rather than set here. |

**Discovery, transport & wire format**

| Variable | Default | Effect |
|---|---|---|
| `WIRE_PROFILE` | `meridian` | `a2cn` swaps in the open-standard codec at the message boundary. |
| `DIR_ADDRESS` | `localhost:8888` | The AGNTCY Agent Directory's gRPC address. |
| `DIRECTORY_CLIENT_SERVER_ADDRESS` | mirrors `DIR_ADDRESS` | What the `agntcy-dir` SDK itself reads; set only if you need to diverge from `DIR_ADDRESS`. |

**Ports & hosts**

| Variable | Default | Effect |
|---|---|---|
| `SUMMIT_PORT` / `ALPINE_PORT` / `RIDGE_PORT` / `CASCADE_PORT` | `41001` / `41002` / `41003` / `41004` | Per-supplier A2A port. Validated — a non-integer is a hard error, not a silent `NaN`. |
| `SUMMIT_URL` / `ALPINE_URL` / `RIDGE_URL` / `CASCADE_URL` | `http://localhost:<port>` | Point an agent somewhere else entirely. |
| `BUYER_HTTP_PORT` | `41100` | The buyer's control + SSE server. |
| `AGENT_HOST` | `127.0.0.1` | Where the dashboard's reverse proxy looks for the agents. |
| `A2A_BIND_HOST` | `127.0.0.1` | Interface the agents listen on. Set `0.0.0.0` for a multi-host deployment. |
| `A2A_ALLOWED_ORIGINS` | unset ⇒ loopback-only | Comma-separated allowlist of permitted agent origins. Required for any non-loopback endpoint learned from discovery. |

**Observability**

| Variable | Default | Effect |
|---|---|---|
| `OTEL_ENABLED` | unset | `1` turns on tracing — real OTel spans with AGNTCY-**style** `agntcy.*` attributes, which is a naming convention and not the published AGNTCY observability schema (see above). |
| `OTEL_TRACES_FILE` | `trails/otel-spans.jsonl` | File exporter target — one JSON span per line, no collector needed. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | unset | When set, spans stream to a real collector instead of the file. |
| `OTEL_SERVICE_NAME` | per-agent (e.g. `supplier-cascade`) | Overrides the service name on emitted spans. |

**Sampling harness (`pnpm sample`)**

| Variable | Default | Effect |
|---|---|---|
| `N` | `12` | Number of samples. |
| `SUPS` | `summit,cascade` | Which suppliers to negotiate. RidgeLine is excluded by default — it never negotiates in the live run. |
| `ENDGAME` | unset | `1` also prints the last exchanges of the first runs. |

<a id="launcher-owned"></a>

**Set by the launcher — don't set these by hand**

`AWAIT_START` (arms the flow behind the dashboard's Start button in `--web`), `USDC_SETTLEMENT` (turns on
the settlement layer for `--usdc`), and `SETTLEMENT_AUTO_APPROVE` (lets terminal `--usdc`, which has no
operator UI, approve its own over-threshold payment). `infra/demo.mjs` sets each from the flags you pass;
`SETTLEMENT_AUTO_APPROVE` is deliberately **never** set in `--web`, where a human owns that step.

These three are injected into the agent processes by the launcher and override `.env.local`, so putting
them in the file has no effect under `pnpm demo` — including `SETTLEMENT_AUTO_APPROVE=1`, which cannot be
used to talk a `--web` run out of asking a person before it pays.

## Layout & deeper docs

- `.env.example` — the committed configuration template; copy to `.env.local`.
- `README.md` — what the prototype is and how its capabilities fit together.
- `HOW-TO-DEMO.md` — how to present it live from the browser dashboard.
- `packages/dashboard/RUNBOOK.md` — the annotated stage script, plus the optional
  `--usdc` Stripe/USDC settlement layer (needs a Stripe test key; off by default).
- `docs/a2cn-alignment.md` — the open-standard (A2CN) wire-profile mapping.
- `infra/VERSIONS.md` — every pinned dependency version and the known binding gaps.

## Troubleshooting

- **A setting in `.env.local` seems ignored** — three things to check, in order. It must be at the repo
  root, next to `package.json`. The line must not still be commented out — `.env.example` ships
  everything commented. And the same variable must not already be set in your shell, because the real
  environment wins: `env | grep LLM_` will show a stale `export` from an earlier session. Note also that
  `pnpm test` does not read the file at all, by design.
- **`pnpm suppliers` / agents crash on boot** — the directory container must be up (`pnpm dir:up`) and
  reachable on `:8888`. Re-publishing an identical record is a no-op, so re-running is safe.
- **A negotiation fails with `ECONNREFUSED`** — a supplier isn't up yet; the buyer retries discovery,
  but if you started the buyer first, give the suppliers a moment (`pnpm demo` sequences them for you).
- **Ports already in use (`EADDRINUSE`)** — a previous run's agents are still alive. Stop them:
  `pkill -f 'dist/index.js'; pkill -f 'dist/server.js'`. After a `pnpm demo` run also clear the launcher
  and dashboard, which hold `41200`: `pkill -f 'infra/demo.mjs'; pkill -f 'dashboard/server.mjs'`.
