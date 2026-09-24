#!/usr/bin/env bash
set -euo pipefail

VENV_DIR=".venv"

if [ -f ".env" ]; then
  set -a
  source ".env"
  set +a
fi

if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment..."
  python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

echo "Installing dependencies..."
pip install -q -r requirements.txt

if [ "${1:-}" = "test" ]; then
  echo "Running config test..."
  python src/check_credentials.py
elif [ "${1:-}" = "test-payload" ]; then
  echo "Testing Slack payload..."
  python src/check_slack_payload.py "${2:-}"
elif [ "${1:-}" = "demo" ]; then
  exec ./demo/run-demo.sh
else
  echo "Starting news watcher..."
  python src/watcher.py
fi
