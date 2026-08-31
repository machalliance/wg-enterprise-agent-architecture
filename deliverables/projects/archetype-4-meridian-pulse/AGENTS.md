# Meridian Pulse — Agent Guidance (AAIF standard)

This file is the project-level guidance for any agent (human or machine) working in this
repository. It follows the AGENTS.md convention from the Agentic AI Foundation stack.

## What this project is

Meridian Pulse is a hackathon reference prototype for **Archetype 4: Autonomous, policy-guided
agents**. A single revenue-optimization agent monitors ~50 SKUs and reprices them continuously,
within policy. The step-by-step build guide lives in the Hackathon in a Box at
`../agent-build-lab/archetype-4-meridian-pulse/`.

## The hard rule

**The agent never calls a commerce system directly.** Every tool invocation routes through
AgentGateway, which evaluates it against the policy engine before forwarding. There is no path
from reasoning to action that skips the policy gate. Do not add one.

## Stack

| Layer | Choice |
|---|---|
| Agent runtime | Goose (binary, configured via `packages/agent/recipe.yaml`) |
| Policy & governance | AgentGateway (real binary, config in `infra/agentgateway/`) |
| Tool connectivity | MCP, TypeScript servers using `@modelcontextprotocol/sdk` |
| LLM | Claude on Bedrock by default; any OpenAI-compatible endpoint via env |
| State | SQLite (checkpoints, commerce catalog) + JSONL (decision trail) |
| Observability | OpenTelemetry -> Grafana stack (Tempo/Loki/Prometheus) |
| Control plane | Small Express API + static HTML (kill switch, resume, approvals) |

## Repository layout

```
meridian-pulse/
├── packages/
│   ├── agent/            # Goose recipe, system prompt, cycle wrapper, checkpoint + trail (M2/M4)
│   ├── mcp-commerce/     # MCP server: pricing/margin/promo, SQLite-backed
│   ├── mcp-market-data/  # MCP server: competitor/demand/inventory + embedded scenario driver
│   ├── control-plane/    # Express API + static HTML: kill switch, resume, approval queue (M3/M5/M6)
│   └── policy/           # Tier classification + escalation queue + magnitude/anomaly logic (M3/M5)
├── infra/
│   ├── agentgateway/     # AgentGateway config (evolves each milestone)
│   ├── otel/             # OpenTelemetry collector config
│   └── grafana/          # Provisioned dashboards + datasources
├── seed/                 # catalog.json, competitors.json, scenario-timeline.json, mandate.json, identity/
└── docs/                 # known-limitations.md and other prototype notes
```

The step-by-step build guide (milestones, read in order) lives in the Hackathon in a Box at
`../agent-build-lab/archetype-4-meridian-pulse/`.

## Build order

M0 (foundation) → M1 (identity) → M2 (state) → M3 (policy) → M4 (accountability) →
M5 (circuit breakers) → M6 (demo). Each milestone adds exactly one thing and ends at a demoable
checkpoint. See `../agent-build-lab/archetype-4-meridian-pulse/00-overview.md` §9.

## Conventions

- TypeScript everywhere except the Goose recipe (YAML) and infra configs (YAML).
- ES modules, Node 20+. Pin exact dependency versions.
- Each package is independently runnable and builds to `dist/`.
- Secrets come from `.env` (never commit it); `.env.example` documents every variable.
- SKUs use the `MER-<CATEGORY>-<ID>` convention (e.g. `MER-TENT-3S`).
