#!/usr/bin/env bash
# =============================================================================
# Meridian Pulse — one-command demo orchestrator (M6)
#
# Brings the whole system up in the right order and drives the ~4-minute demo:
#   1. Observability stack (OTel Collector + Tempo + Prometheus + Loki + Grafana)
#      via finch compose (or docker compose)  [optional: skip with NO_OBSERVABILITY=1]
#   2. AgentGateway            (LLM routing + MCP federation + policy gate front)
#   3. control-plane           (kill switch, breakers, heartbeat, dashboard)
#   4. agent run-loop          (continuous perceive -> reason -> act)
#
# The market scenario driver is embedded in mcp-market-data (spawned by the
# gateway), so the timeline (competitor undercut -> demand spike -> flash crash
# -> recovery) plays automatically once everything is up.
#
# Watch the dashboard at http://localhost:8090 and Grafana at http://localhost:3001.
# Follow packages/control-plane/RUNBOOK.md for the narration.
#
# Ctrl-C tears everything down.
#
# Runs on macOS, Linux, and Windows (via WSL2 or Git Bash — it is a Bash script).
# Prereqs (see README): goose, agentgateway, and a container runtime (finch or
# docker) on PATH; pnpm -r build done; agent identity minted
# (node packages/agent/dist/identity.js keygen && mint);
# .env filled (or gateway config switched to Bedrock).
# =============================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Load .env if present (LLM_*, GOOSE_*, etc.)
if [[ -f .env ]]; then set -a; . ./.env; set +a; fi

: "${GOOSE_PROVIDER:=openai}"
: "${GOOSE_MODEL:=default}"
: "${OPENAI_HOST:=http://localhost:4000}"
: "${OPENAI_BASE_PATH:=v1/chat/completions}"
: "${OPENAI_API_KEY:=gateway-holds-the-real-credential}"
: "${AGENT_MAX_CYCLES:=0}"
export GOOSE_PROVIDER GOOSE_MODEL OPENAI_HOST OPENAI_BASE_PATH OPENAI_API_KEY AGENT_MAX_CYCLES NODE_NO_WARNINGS=1

PIDS=()

# Container runtime for the observability stack: prefer finch (what this project
# was tested with); fall back to `docker compose` if finch is absent. Both are
# Docker-compose compatible. NO_OBSERVABILITY=1 skips the stack entirely.
COMPOSE=()
if command -v finch >/dev/null 2>&1; then
  COMPOSE=(finch compose)
elif command -v docker >/dev/null 2>&1; then
  COMPOSE=(docker compose)
fi

# OS-neutral temp dir for component logs (TMPDIR on macOS, /tmp on Linux, a
# real temp path under WSL2 / Git Bash on Windows).
LOGDIR="${TMPDIR:-/tmp}"

cleanup() {
  echo ""
  echo "[demo] shutting down..."
  for pid in "${PIDS[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  if [[ "${NO_OBSERVABILITY:-0}" != "1" && "${#COMPOSE[@]}" -gt 0 ]]; then
    "${COMPOSE[@]}" -f infra/observability-compose.yaml down 2>/dev/null || true
  fi
  echo "[demo] done."
}
trap cleanup INT TERM EXIT

# --- Preflight --------------------------------------------------------------
for bin in goose agentgateway node; do
  command -v "$bin" >/dev/null 2>&1 || { echo "[demo] ERROR: '$bin' not on PATH. See README prerequisites." >&2; exit 1; }
done
if [[ ! -f packages/control-plane/dist/index.js || ! -f packages/policy/dist/index.js ]]; then
  echo "[demo] ERROR: build output missing. Run 'pnpm -r build' first." >&2; exit 1
fi
if [[ ! -f seed/identity/jwks.json ]]; then
  echo "[demo] ERROR: agent identity missing. Run 'node packages/agent/dist/identity.js keygen && node packages/agent/dist/identity.js mint'." >&2; exit 1
fi

# --- 1. Observability stack (optional) --------------------------------------
if [[ "${NO_OBSERVABILITY:-0}" != "1" ]]; then
  if [[ "${#COMPOSE[@]}" -gt 0 ]]; then
    echo "[demo] starting observability stack (${COMPOSE[*]})..."
    "${COMPOSE[@]}" -f infra/observability-compose.yaml up -d 2>&1 | sed 's/^/[observability] /' || \
      echo "[demo] WARN: observability stack failed to start; continuing without it (dashboards unavailable)."
  else
    echo "[demo] WARN: no container runtime (finch or docker) found; skipping observability stack."
  fi
fi

# --- 2. AgentGateway --------------------------------------------------------
echo "[demo] starting AgentGateway..."
agentgateway -f infra/agentgateway/config.yaml >"${LOGDIR}/meridian-gateway.log" 2>&1 &
PIDS+=($!)
sleep 5

# --- 3. control-plane -------------------------------------------------------
echo "[demo] starting control-plane (dashboard: http://localhost:8090)..."
node packages/control-plane/dist/index.js >"${LOGDIR}/meridian-control-plane.log" 2>&1 &
PIDS+=($!)
sleep 2

# --- 4. agent loop ----------------------------------------------------------
echo "[demo] starting agent loop. Watch http://localhost:8090 (and Grafana :3001)."
if [[ "${SCENARIO_MODE:-timed}" == "manual" ]]; then
  echo "[demo] MANUAL scenario mode: no market events fire until you advance a beat."
  echo "[demo]   in another pane, run:  pnpm scenario:step   (press Enter to advance each beat)"
  echo "[demo]   or:  curl -X POST http://127.0.0.1:${SCENARIO_CONTROL_PORT:-8091}/scenario/next"
fi
echo "[demo] follow packages/control-plane/RUNBOOK.md for narration. Ctrl-C to stop."
bash packages/agent/run-loop.sh
