#!/usr/bin/env bash
#
# Three consecutive daily runs against fixture feeds, with no network and no
# Slack or GitHub credentials. The point of the demo is what happens BETWEEN
# the runs: the position summary is rebuilt from the whole claim history each
# time, so day 2's contradicting evidence has to be reconciled with day 1's
# support rather than replacing it.
#
# Run it with `./run.sh demo` from the project root, which loads .env and the
# virtualenv first. Needs one LLM key (ANTHROPIC_API_KEY by default) — the
# scoring and claim-extraction calls are real, only the sources are fixtures.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEMO_DIR="$PROJECT_ROOT/demo"
BUILD_DIR="$DEMO_DIR/.build"

cd "$PROJECT_ROOT"

# Fixture feeds link to articles by absolute file:// path, so they are rendered
# from templates at run time rather than committed with someone's home directory
# baked into them.
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"
for day in day1 day2 day3; do
  sed "s|{{DEMO_DIR}}|$DEMO_DIR|g" "$DEMO_DIR/feeds/$day.xml.tmpl" > "$BUILD_DIR/$day.xml"
  sed -e "s|{{DEMO_DIR}}|$DEMO_DIR|g" -e "s|{{DAY}}|$day|g" \
    "$DEMO_DIR/config.json.tmpl" > "$BUILD_DIR/$day.json"
done

print_summary() {
  python - "$BUILD_DIR/state.json" <<'PY'
import json, sys, pathlib
p = pathlib.Path(sys.argv[1])
if not p.exists():
    print("  (no state file yet)")
    raise SystemExit
s = json.loads(p.read_text())
by = {}
for c in s["claims"]:
    by[c["stance"]] = by.get(c["stance"], 0) + 1
print(f"  claims to date: {len(s['claims'])}  " + "  ".join(f"{k}={v}" for k, v in sorted(by.items())))
print()
for line in s["position_summary"].splitlines():
    print(f"  {line}")
PY
}

for day in day1 day2 day3; do
  echo
  echo "════════════════════════════════════════════════════════════════════════"
  echo "  RUN ${day#day} of 3 — feed: demo/feeds/$day.xml.tmpl"
  echo "════════════════════════════════════════════════════════════════════════"
  # The fixture pubDates are fixed, so the lookback window is opened wide
  # rather than rewritten on every run.
  CONFIG_PATH="$BUILD_DIR/$day.json" \
  LOOKBACK_HOURS=876000 \
  SLACK_WEBHOOK_URL="" \
  SAVE_AS_GITHUB_ISSUE=false \
  RESEARCH_MODE=true \
    python src/watcher.py

  echo
  echo "── position after run ${day#day} ──────────────────────────────────────────"
  print_summary
done

echo
echo "════════════════════════════════════════════════════════════════════════"
echo "  Accumulated state: $BUILD_DIR/state.json"
echo
echo "  In production this runs on a schedule — a cron job, a GitHub Actions"
echo "  workflow, any timer — against live RSS feeds, committing the state file"
echo "  so the position survives between runs. Nothing about the agent changes."
echo "════════════════════════════════════════════════════════════════════════"
