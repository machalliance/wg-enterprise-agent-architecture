# Pinned tool & SDK versions

These are the versions Meridian Pulse is built and tested against. The AAIF stack
and the MCP SDKs move quickly; pin up front so a mid-build change never breaks the demo.

## Runtimes & binaries (install as prerequisites — see README)

| Tool | Version | Install | Role |
|---|---|---|---|
| Node.js | 20+ (tested on 24.11.1) | nvm / nodejs.org | Runs the TypeScript MCP servers, scenario driver, control plane |
| pnpm | 9.15.0 | `corepack use pnpm@9.15.0` | Workspace package manager |
| Goose CLI | 1.46.0 | `brew install block-goose-cli` | Agent runtime (perceive → reason → act loop) |
| AgentGateway | 1.4.1 | GitHub release binary (see README) | Policy, LLM routing, MCP federation, telemetry |
| Finch | 1.14.1 | `brew install --cask finch` | Container runtime for the Grafana/OTel stack (M6). Docker-compatible; use `finch` / `finch compose` |

## Node package SDKs (pinned in each package.json)

| Package | Version | Used by |
|---|---|---|
| `@modelcontextprotocol/sdk` | 1.13.1 | mcp-commerce, mcp-market-data |
| `zod` | 3.25.76 | MCP tool input schemas (peer of the MCP SDK: requires `^3.25.28 \|\| ^4`) |
| `typescript` | ^5.7.2 | all packages |
| `@types/node` | ^22.10.2 | all packages |

## LLM provider

The provider is **not pinned** — it is intentionally swappable. AgentGateway exposes an
OpenAI-compatible endpoint and routes to whatever provider `infra/agentgateway/config.yaml`
names. The committed default is a **generic OpenAI-compatible endpoint** (set via env), so
participants can point it at OpenAI, a local model, or Amazon Bedrock. See the README for
how to select Bedrock specifically.
