# Getting started — autonomous, policy-guided pricing agent

This gets you from a fresh clone to a green build, passing tests, and a running system driving the demo
scenario. For what the prototype is and why, see [`meridian-pulse/README.md`](meridian-pulse/README.md);
for presenting it, see [`HOW-TO-DEMO.md`](HOW-TO-DEMO.md).

## Where to run it

Everything runs on a **single host**: your own machine, or a remote dev environment / VM / sandbox. The
agent, AgentGateway, the MCP servers, and the control plane talk to each other over loopback; the
observability stack runs as containers on the same host. Nothing needs to leave the machine.

The gateway binds its admin endpoint to `127.0.0.1`; its metrics endpoint binds `0.0.0.0:15020` so the
Prometheus container can scrape it across the container boundary (see the note in
[`meridian-pulse/docs/known-limitations.md`](meridian-pulse/docs/known-limitations.md), item 9). On a
shared machine, firewall `:15020` or revert it to loopback.

## Prerequisites

Pinned versions live in [`meridian-pulse/infra/VERSIONS.md`](meridian-pulse/infra/VERSIONS.md). Listed so
you can sanity-check:

- **Node ≥ 20** (`node -v` → tested on 24.11.1)
- **pnpm 9.15.0** (`corepack use pnpm@9.15.0`)
- **Goose CLI 1.46.0** (`brew install block-goose-cli`) — the agent runtime
- **AgentGateway 1.4.1** — a downloaded binary, not a package (see below)
- **Finch 1.14.1** (`brew install --cask finch`) — the container runtime for the observability stack.
  Start its VM once with `finch vm start`. Docker Desktop also works; the compose file maps both
  `host.lima.internal` (Finch/Lima) and `host.docker.internal` (Docker) so either resolves the host.

You also need an **LLM** the gateway can reach — see [step 2](#2-configure-the-llm-provider).

### Installing AgentGateway

From the [agentgateway releases](https://github.com/agentgateway/agentgateway/releases), download the
`darwin` / `linux` / `windows` binary for **1.4.1**, then:

```bash
shasum -a 256 agentgateway-<platform>          # compare to the release's published sha256
chmod +x agentgateway-<platform>
xattr -d com.apple.quarantine agentgateway-<platform>   # macOS only: clear Gatekeeper quarantine
sudo mv agentgateway-<platform> /usr/local/bin/agentgateway
```

## 1. Install & build

```bash
cd meridian-pulse
pnpm install
pnpm -r build      # tsc across all five packages → compiled JS in each package's dist/
```

The agent and MCP servers run as **compiled JS on plain Node**, and the test suite runs the compiled
`dist/` too — so a build is a prerequisite for everything below, and `pnpm test` runs it for you.

## 2. Configure the LLM provider

The provider lives entirely in **AgentGateway** — the agent and MCP servers never see provider
credentials. It is selected in
[`meridian-pulse/infra/agentgateway/config.yaml`](meridian-pulse/infra/agentgateway/config.yaml), and
there are two paths.

**Default — a generic OpenAI-compatible endpoint.** Copy the env template and fill in three values:

```bash
cp .env.example .env      # then uncomment the LLM_* lines and set them
```

```dotenv
LLM_BASE_URL=http://localhost:11434/v1   # OpenAI, a local Ollama/LM Studio, or any compatible URL
LLM_MODEL=gpt-4o-mini
LLM_API_KEY=changeme
```

[`.env.example`](meridian-pulse/.env.example) is the committed template. It lists **every** variable the
code reads, annotated with its default, and every line is commented out — so a freshly copied `.env`
changes nothing and the system runs on its built-in defaults. (`scripts/env-docs.test.mjs` enforces both
properties: the template stays copy-safe, and it names every `process.env` the code reads.)

**Alternative — Amazon Bedrock (Claude).** In the gateway config, comment out the default `llm:` block
and uncomment the Bedrock one, setting the model (e.g. `us.anthropic.claude-sonnet-5`) and `awsRegion`.
Credentials come from the standard AWS chain (`AWS_PROFILE`, environment keys, or SSO) — no keys in the
config, and no `LLM_*` needed in `.env`.

> One Bedrock gotcha the gateway config comment also spells out: the gateway interpolates `$VARS` across
> the whole file *before* stripping comments, so even the commented-out OpenAI block's `$LLM_MODEL` /
> `$LLM_API_KEY` / `$LLM_BASE_URL` must still resolve. Either give them dummy values in `.env`, or remove
> the env-var syntax from the commented block.

Either way Goose always points at the gateway on `:4000`; which provider actually serves the request is
decided in the gateway config, so the agent stays provider-agnostic.

## 3. Run the tests

```bash
pnpm test      # builds, then runs node --test over compiled dist/ + scripts/
```

56 tests over the pure-logic modules: tier classification against the shipped mandate, the escalation
queue lifecycle, the decision-trail hash chain + tamper detection + causal chain, the circuit breakers
(rate / magnitude / anomaly), the oversight state machine + dead-man's-switch, the checkpoint store
(save / resume / hash-chain / retention), the commerce DB, and the `.env.example` completeness check. It
needs no gateway, no LLM, and no containers — the modules are pure and load with no server side effects.

`pnpm test` runs `pnpm -r build` first, on purpose: the suite runs COMPILED tests, and a stale compiled
test whose source was deleted could otherwise keep passing. Building first makes a green suite match the
sources. (See item 12 in [`known-limitations.md`](meridian-pulse/docs/known-limitations.md).)

## 4. Generate the agent's machine identity

```bash
pnpm identity:setup      # = identity.js keygen (once) && identity.js mint (refresh the token)
```

This writes an RSA keypair and a scoped, short-TTL JWT under `seed/identity/`. `jwks.json` is **public
and committed**; `priv.pem` and `agent-credential.json` hold private key material and are **gitignored**,
so a fresh clone has none until you run this. The agent presents the JWT to the gateway on every MCP
call, and the gateway verifies it strictly — an unauthenticated tool call is rejected. `pnpm demo` runs
this for you if the identity is missing; the explicit command is only needed when starting pieces by
hand. Re-run `node packages/agent/dist/identity.js mint` any time to refresh the token.

## 5. Run it

One command brings up the whole system — observability stack, gateway, control plane, and the agent loop
— and starts driving the scenario:

```bash
pnpm demo
```

Then open the **operator dashboard at http://localhost:8090** and **Grafana at http://localhost:3001**
(which lands directly on the Meridian Pulse dashboard). `Ctrl-C` tears everything down, including the
container stack. The presenter's walkthrough is in [`HOW-TO-DEMO.md`](HOW-TO-DEMO.md).

To run without the container stack (gateway + control plane + agent only — the core policy/escalation/
breaker/kill-switch behaviour is unaffected, you just get no Grafana):

```bash
NO_OBSERVABILITY=1 pnpm demo
```

For a live audience, run the scenario in **manual mode** so you advance each demo beat by hand instead of
on a timer — set `SCENARIO_MODE=manual pnpm demo` and drive it with `pnpm scenario:step` in a second pane.
[`HOW-TO-DEMO.md`](HOW-TO-DEMO.md) covers this in full.

Under the hood `pnpm demo` runs these in order — you can also run them by hand for debugging, each in its
own pane:

```bash
finch compose -f infra/observability-compose.yaml up -d   # 1. observability (or: pnpm observability:up)
agentgateway -f infra/agentgateway/config.yaml            # 2. gateway (LLM :4000, MCP :3000)
node packages/control-plane/dist/index.js                 # 3. control plane (dashboard :8090)
packages/agent/run-loop.sh                                # 4. the agent's continuous loop
```

The scenario timeline in
[`meridian-pulse/seed/scenario-timeline.json`](meridian-pulse/seed/scenario-timeline.json) (240s) is
replayed by the scenario driver embedded in `mcp-market-data`, so the demo narrative unfolds on its own.

### Ports

| Port | Service |
|---|---|
| 3000 | AgentGateway — federated MCP endpoint (`/mcp`) |
| 4000 | AgentGateway — OpenAI-compatible LLM endpoint |
| 8090 | Control plane — operator dashboard + API |
| 15000 | AgentGateway — admin (loopback only) |
| 15020 | AgentGateway — Prometheus metrics |
| 4317 | OTel Collector — OTLP gRPC (gateway traces) |
| 3001 | Grafana |

## Useful CLIs

Run from `meridian-pulse/` after `pnpm -r build`:

- **Decision trail:** `node packages/policy/dist/query-trail.js <list|why|verify|stats>` — inspect the
  append-only trail, explain why a decision reached its tier, verify chain integrity, or print stats.
- **Approvals:** `node packages/policy/dist/approvals-cli.js <list|approve|reject> [id]` — manage the
  escalation queue from the CLI (the dashboard's Approve/Reject buttons call the same path).
- **Checkpoints:** `node packages/agent/dist/checkpoint-cli.js <status|verify>` — report / verify the
  latest checkpoint.
- **Identity:** `node packages/agent/dist/identity.js <keygen|mint|token>` — create keys, mint a fresh
  token, or print just the token.

## Layout & deeper docs

- `meridian-pulse/README.md` — what the prototype is and how the pieces fit together.
- `HOW-TO-DEMO.md` — how to present it live from the operator dashboard.
- `meridian-pulse/packages/control-plane/RUNBOOK.md` — the annotated, beat-by-beat stage script.
- `meridian-pulse/docs/known-limitations.md` — the honest catalogue of accepted prototype scope.
- `meridian-pulse/.env.example` — the committed configuration template; copy to `.env`.
- `meridian-pulse/infra/VERSIONS.md` — every pinned dependency version.
- `spec/` — the milestone specs (M0–M6); read [`spec/00-overview.md`](spec/00-overview.md) first.

## Troubleshooting

- **A setting in `.env` seems ignored** — it must be at the root of `meridian-pulse/` (next to
  `package.json`), the line must not still be commented out (`.env.example` ships everything commented),
  and the same variable must not already be set in your shell, because the real environment wins.
- **Gateway exits with `environment variable ... not found`** — the Bedrock gotcha in
  [step 2](#2-configure-the-llm-provider): the commented OpenAI block's `$LLM_*` still must resolve. Give
  them dummy values in `.env`.
- **`temperature is deprecated for this model` (HTTP 400)** — Claude Sonnet 5 and some newer models reject
  the OpenAI `temperature` param. The Goose recipe therefore sets none; if another model rejects a
  different param, omit that param from `packages/agent/recipe.yaml` too.
- **Grafana panels are empty** — the gateway runs fine without the OTel collector, so traces/metrics only
  appear once the `finch compose` stack is up. The demo's core behaviour does not depend on it.
- **Ports already in use (`EADDRINUSE`)** — a previous run's processes are still alive. Stop them:
  `pkill -f 'agentgateway -f infra'; pkill -f 'control-plane/dist/index.js'; pkill -f run-loop.sh`, and
  `pkill -f 'meridian-pulse/packages/mcp-'` for any orphaned MCP servers the gateway spawned.
