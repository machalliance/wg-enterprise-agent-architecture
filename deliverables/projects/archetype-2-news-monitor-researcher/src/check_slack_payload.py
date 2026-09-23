#!/usr/bin/env python3
"""Post a saved debug payload to Slack and report the result.

Usage:
    ./run.sh test-payload debug/20260521_013425_slack_payload.json
"""

import json
import os
import sys
from pathlib import Path

env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

import requests


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: test-payload <path-to-slack-payload.json>")
        sys.exit(1)

    payload_path = Path(sys.argv[1])
    if not payload_path.exists():
        print(f"File not found: {payload_path}")
        sys.exit(1)

    webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        print("Error: SLACK_WEBHOOK_URL is not set.")
        sys.exit(1)

    with open(payload_path) as f:
        payload = json.load(f)

    block_count = len(payload.get("blocks", []))
    print(f"Payload: {payload_path.name}")
    print(f"Blocks:  {block_count} (Slack limit: 50)")
    if block_count > 50:
        print(f"WARNING: Payload exceeds Slack's 50-block limit by {block_count - 50} blocks — this will 400.")

    print("\nPosting to Slack...")
    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
        print("Success — message delivered.")
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        body = e.response.text if e.response is not None else ""
        print(f"Failed — HTTP {status}: {body}")
        sys.exit(1)


if __name__ == "__main__":
    main()
