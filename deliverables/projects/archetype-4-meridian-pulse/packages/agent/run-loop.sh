#!/usr/bin/env bash
# =============================================================================
# Meridian Pulse — continuous agent loop (M0)
#
# Runs the Goose recipe repeatedly so the agent keeps perceiving and acting
# without being prompted. Each cycle resumes the same named session, so context
# accumulates across cycles (this is what M2 later checkpoints durably).
#
# The agent reaches tools through AgentGateway (:3000/mcp) and the LLM through
# AgentGateway (:4000). Both must be running first — see the README / pnpm dev.
#
# Env:
#   AGENT_CYCLE_INTERVAL_S   seconds to wait between cycles (default 8)
#   AGENT_MAX_CYCLES         stop after N cycles (default 0 = run forever)
#   AGENT_SESSION_NAME       Goose session name to resume (default meridian-pulse)
# =============================================================================
set -uo pipefail

# node:sqlite emits an experimental-feature warning on every invocation; silence
# it so the loop output stays readable. (Functionally harmless.)
export NODE_NO_WARNINGS=1

RECIPE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RECIPE="${RECIPE_DIR}/recipe.yaml"
IDENTITY_JS="${RECIPE_DIR}/dist/identity.js"
CHECKPOINT_JS="${RECIPE_DIR}/dist/checkpoint-cli.js"

INTERVAL="${AGENT_CYCLE_INTERVAL_S:-8}"
MAX_CYCLES="${AGENT_MAX_CYCLES:-0}"
SESSION="${AGENT_SESSION_NAME:-meridian-pulse}"
CONTROL_PLANE_URL="${CONTROL_PLANE_URL:-http://localhost:8090}"

# Mint (or refresh) the agent's machine-identity token. identity.js re-mints
# automatically if the previous token has expired.
if [[ ! -f "${IDENTITY_JS}" ]]; then
  echo "[agent] ERROR: ${IDENTITY_JS} not found. Run 'pnpm --filter @meridian-pulse/agent build' first." >&2
  exit 1
fi
AGENT_TOKEN="$(node "${IDENTITY_JS}" token)"
if [[ -z "${AGENT_TOKEN}" ]]; then
  echo "[agent] ERROR: failed to mint agent token" >&2
  exit 1
fi

# Resume durable state (M2): if a checkpoint exists, report the cycle we resume
# from and continue numbering from there; otherwise cold-start at cycle 0.
RESUME_JSON="$(node "${CHECKPOINT_JS}" resume 2>/dev/null || echo '{"coldStart":true}')"
RESUME_CYCLE="$(printf '%s' "${RESUME_JSON}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(String(j.resumedFromCycle??0))}catch{process.stdout.write("0")}})')"
if [[ "${RESUME_CYCLE}" -gt 0 ]]; then
  echo "[agent] resumed durable state from checkpoint at cycle ${RESUME_CYCLE}"
else
  echo "[agent] cold start (no prior checkpoint)"
fi

echo "[agent] starting continuous loop (interval=${INTERVAL}s, maxCycles=${MAX_CYCLES}, session=${SESSION})"
echo "[agent] recipe: ${RECIPE}"
echo "[agent] presenting scoped machine identity to the gateway"

cycle="${RESUME_CYCLE}"
first=1
while :; do
  cycle=$((cycle + 1))

  # Respect the kill switch / circuit breaker (M5): if the control plane reports
  # the agent halted, stop looping and wait for a human to resume.
  STATUS_JSON="$(curl -s "${CONTROL_PLANE_URL}/agent/status" 2>/dev/null || echo '{}')"
  RUNNING="$(printf '%s' "${STATUS_JSON}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.running===false?"false":"true")}catch{process.stdout.write("true")}})')"
  if [[ "${RUNNING}" == "false" ]]; then
    REASON="$(printf '%s' "${STATUS_JSON}" | node -e 'let d="";process.stdin.on("data",c=>d+=c);process.stdin.on("end",()=>{try{const j=JSON.parse(d);process.stdout.write(j.haltReason||"halted")}catch{process.stdout.write("halted")}})')"
    echo "[agent] HALTED (${REASON}); pausing loop. Resume via the control plane, then this loop continues."
    sleep "${INTERVAL}"
    cycle=$((cycle - 1))  # don't consume a cycle number while halted
    continue
  fi

  echo "[agent] ===== cycle ${cycle} ====="

  # Heartbeat the dead-man's-switch so the watchdog knows we're alive.
  curl -s -X POST "${CONTROL_PLANE_URL}/agent/heartbeat" -H 'content-type: application/json' \
    -d "{\"cycle\": ${cycle}}" >/dev/null 2>&1 || true

  # Refresh the token each cycle so a long run survives token expiry (rotation).
  AGENT_TOKEN="$(node "${IDENTITY_JS}" token)"

  if [[ "${first}" -eq 1 ]]; then
    # First cycle: start a fresh named session from the recipe.
    goose run --recipe "${RECIPE}" --name "${SESSION}" --params agent_token="${AGENT_TOKEN}"
    first=0
  else
    # Subsequent cycles: resume the same session so context carries over.
    goose run --recipe "${RECIPE}" --name "${SESSION}" --resume --params agent_token="${AGENT_TOKEN}"
  fi

  # Checkpoint the cycle boundary (M2). The full working/long-term state is
  # assembled by the agent in later milestones; here we persist a minimal,
  # inspectable snapshot so resume + integrity verification work end to end.
  printf '{"workingMemory":{"currentCycle":%d,"inFlightActions":[],"recentObservations":[]},"longTermContext":{"learnedPatterns":[],"categoryBaselines":{}},"activeSkus":[]}' "${cycle}" \
    | node "${CHECKPOINT_JS}" save "${cycle}" 2>&1 | sed 's/^/[agent] /' || true

  if [[ "${MAX_CYCLES}" -gt 0 && "${cycle}" -ge "${MAX_CYCLES}" ]]; then
    echo "[agent] reached max cycles (${MAX_CYCLES}); stopping"
    break
  fi

  sleep "${INTERVAL}"
done
