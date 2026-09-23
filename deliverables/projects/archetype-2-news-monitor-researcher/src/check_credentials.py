#!/usr/bin/env python3
"""Verify that API keys and webhooks are correctly configured."""

import os
import sys
from pathlib import Path

# Load .env if present
env_path = Path(__file__).parent.parent / ".env"
if env_path.exists():
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, _, value = line.partition("=")
                os.environ.setdefault(key.strip(), value.strip())

import requests

PASS = "\033[32m PASS\033[0m"
FAIL = "\033[31m FAIL\033[0m"
SKIP = "\033[33mSKIP\033[0m"


def test_anthropic() -> bool:
    import anthropic
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print(f"[{FAIL}] Anthropic: ANTHROPIC_API_KEY is not set")
        return False

    try:
        client = anthropic.Anthropic(api_key=api_key)
        client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=16,
            messages=[{"role": "user", "content": "Reply with the word OK."}],
        )
        print(f"[{PASS}] Anthropic: API key is valid and working")
        return True
    except anthropic.AuthenticationError:
        print(f"[{FAIL}] Anthropic: API key is invalid or expired")
    except anthropic.BadRequestError as e:
        if "credit balance is too low" in str(e):
            print(f"[{FAIL}] Anthropic: API key is valid but account has insufficient credits")
        else:
            print(f"[{FAIL}] Anthropic: Bad request — {e}")
    except anthropic.APIConnectionError:
        print(f"[{FAIL}] Anthropic: Could not connect to the API — check your internet connection")
    return False


def test_openai() -> bool | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print(f"[{SKIP}] OpenAI: OPENAI_API_KEY is not set (skipped)")
        return None

    try:
        import openai
    except ImportError:
        print(f"[{FAIL}] OpenAI: openai package not installed — run: pip install openai")
        return False

    try:
        client = openai.OpenAI(api_key=api_key)
        client.chat.completions.create(
            model="gpt-4o-mini",
            max_tokens=16,
            messages=[{"role": "user", "content": "Reply with the word OK."}],
        )
        print(f"[{PASS}] OpenAI: API key is valid and working")
        return True
    except openai.AuthenticationError:
        print(f"[{FAIL}] OpenAI: API key is invalid or expired")
    except openai.RateLimitError:
        print(f"[{FAIL}] OpenAI: Rate limit or quota exceeded")
    except openai.APIConnectionError:
        print(f"[{FAIL}] OpenAI: Could not connect to the API — check your internet connection")
    return False


def test_vercel() -> bool | None:
    api_key = os.environ.get("AI_GATEWAY_API_KEY")
    if not api_key:
        print(f"[{SKIP}] Vercel AI Gateway: AI_GATEWAY_API_KEY is not set (skipped)")
        return None

    try:
        import openai
    except ImportError:
        print(f"[{FAIL}] Vercel AI Gateway: openai package not installed — run: pip install openai")
        return False

    try:
        client = openai.OpenAI(api_key=api_key, base_url="https://ai-gateway.vercel.sh/v1")
        client.chat.completions.create(
            model="anthropic/claude-haiku-4-5",
            max_tokens=16,
            messages=[{"role": "user", "content": "Reply with the word OK."}],
        )
        print(f"[{PASS}] Vercel AI Gateway: API key is valid and working")
        return True
    except openai.AuthenticationError:
        print(f"[{FAIL}] Vercel AI Gateway: API key is invalid or expired")
    except openai.RateLimitError:
        print(f"[{FAIL}] Vercel AI Gateway: Rate limit or quota exceeded")
    except openai.APIConnectionError:
        print(f"[{FAIL}] Vercel AI Gateway: Could not connect to the API — check your internet connection")
    return False


def test_slack() -> bool:
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL")
    if not webhook_url:
        print(f"[{FAIL}] Slack: SLACK_WEBHOOK_URL is not set")
        return False

    try:
        resp = requests.post(
            webhook_url,
            json={"text": ":white_check_mark: News Watcher config test — Slack webhook is working."},
            timeout=10,
        )
        resp.raise_for_status()
        print(f"[{PASS}] Slack: Webhook is valid (test message sent to channel)")
        return True
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        if status == 400:
            print(
                f"[{FAIL}] Slack: Webhook returned 400 Bad Request — "
                "the URL may be invalid or revoked. Re-create it at api.slack.com/apps."
            )
        elif status == 403:
            print(f"[{FAIL}] Slack: Webhook forbidden (403) — it may have been revoked")
        elif status == 404:
            print(f"[{FAIL}] Slack: Webhook not found (404) — check the URL in SLACK_WEBHOOK_URL")
        else:
            print(f"[{FAIL}] Slack: HTTP {status} — {e.response.text if e.response is not None else ''}")
    except requests.exceptions.ConnectionError:
        print(f"[{FAIL}] Slack: Could not connect — check your internet connection")
    return False


def test_github() -> bool | None:
    token = os.environ.get("GITHUB_TOKEN")
    if not token:
        print(f"[{SKIP}] GitHub: GITHUB_TOKEN is not set (skipped)")
        return None

    try:
        resp = requests.get(
            "https://api.github.com/user",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github.v3+json"},
            timeout=10,
        )
        resp.raise_for_status()
        login = resp.json().get("login", "unknown")
        print(f"[{PASS}] GitHub: Token is valid (authenticated as {login})")
        return True
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        if status == 401:
            print(f"[{FAIL}] GitHub: Token is invalid or expired")
        else:
            print(f"[{FAIL}] GitHub: HTTP {status}")
    except requests.exceptions.ConnectionError:
        print(f"[{FAIL}] GitHub: Could not connect to the API")
    return False


def main() -> None:
    print("Testing configuration...\n")
    anthropic_ok = test_anthropic()
    openai_result = test_openai()
    vercel_result = test_vercel()
    slack_ok = test_slack()
    github_result = test_github()

    print()
    required_ok = anthropic_ok and slack_ok
    optional_failed = (openai_result is False) or (vercel_result is False) or (github_result is False)

    if required_ok and not optional_failed:
        print("All checks passed. Run ./run.sh to start a scan.")
    elif required_ok:
        print("Required checks passed (some optional checks skipped). Run ./run.sh to start a scan.")
    else:
        print("One or more required checks failed. Fix the issues above before running ./run.sh.")
        sys.exit(1)


if __name__ == "__main__":
    main()
