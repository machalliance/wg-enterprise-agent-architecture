#!/usr/bin/env python3
"""News watcher agent: scans RSS feeds and reports relevant articles to Slack."""

import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path

import feedparser
import requests


# ---------------------------------------------------------------------------
# Utilities
# ---------------------------------------------------------------------------

def _save_debug(name: str, data: dict) -> None:
    d = Path("debug")
    d.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    path = d / f"{ts}_{name}.json"
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  Debug saved: {path}")


def load_config(config_path: str) -> dict:
    with open(config_path) as f:
        return json.load(f)


BATCH_SIZE = 50  # max articles per LLM call to stay within context limits


# ---------------------------------------------------------------------------
# LLM abstraction (Anthropic, OpenAI, or Vercel AI Gateway)
# ---------------------------------------------------------------------------

VERCEL_AI_GATEWAY_BASE_URL = "https://ai-gateway.vercel.sh/v1"


def build_llm_client(config: dict) -> tuple:
    """Return (client, provider, model) based on config and environment.

    Provider is chosen by the AI_PROVIDER env var, then config["ai_provider"],
    defaulting to "anthropic". Model defaults to the provider's flagship model
    but can be overridden via AI_MODEL or config["ai_model"].
    """
    provider = os.environ.get("AI_PROVIDER", config.get("ai_provider", "anthropic")).lower()

    if provider == "vercel":
        try:
            import openai  # noqa: F401
        except ImportError:
            print("Error: openai package not installed. Run: pip install openai", file=sys.stderr)
            sys.exit(1)
        api_key = os.environ.get("AI_GATEWAY_API_KEY")
        if not api_key:
            print("Error: AI_GATEWAY_API_KEY is not set.", file=sys.stderr)
            sys.exit(1)
        import openai as _openai
        client = _openai.OpenAI(api_key=api_key, base_url=VERCEL_AI_GATEWAY_BASE_URL)
        default_model = "anthropic/claude-sonnet-4-6"
    elif provider == "openai":
        try:
            import openai  # noqa: F401
        except ImportError:
            print("Error: openai package not installed. Run: pip install openai", file=sys.stderr)
            sys.exit(1)
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            print("Error: OPENAI_API_KEY is not set.", file=sys.stderr)
            sys.exit(1)
        import openai as _openai
        client = _openai.OpenAI(api_key=api_key)
        default_model = "gpt-4o"
    else:
        provider = "anthropic"
        try:
            import anthropic  # noqa: F401
        except ImportError:
            print("Error: anthropic package not installed. Run: pip install anthropic", file=sys.stderr)
            sys.exit(1)
        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print("Error: ANTHROPIC_API_KEY is not set.", file=sys.stderr)
            sys.exit(1)
        import anthropic as _anthropic
        client = _anthropic.Anthropic(api_key=api_key)
        default_model = "claude-sonnet-4-6"

    model = os.environ.get("AI_MODEL", config.get("ai_model", default_model))
    return client, provider, model


def _call_llm(
    prompt: str,
    system: str,
    client,
    provider: str,
    model: str,
    max_tokens: int = 2048,
) -> str:
    """Send a prompt to the configured LLM and return the text response."""
    if provider in ("openai", "vercel"):
        import openai
        key_name = "AI_GATEWAY_API_KEY" if provider == "vercel" else "OPENAI_API_KEY"
        service_name = "Vercel AI Gateway" if provider == "vercel" else "OpenAI"
        try:
            response = client.chat.completions.create(
                model=model,
                max_tokens=max_tokens,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": prompt},
                ],
            )
            return response.choices[0].message.content.strip()
        except openai.AuthenticationError:
            print(f"Error: {service_name} API key is invalid or missing. Check your {key_name}.", file=sys.stderr)
            sys.exit(1)
        except openai.RateLimitError:
            print(f"Error: {service_name} rate limit reached. Wait a few minutes and try again.", file=sys.stderr)
            sys.exit(1)
        except openai.APIConnectionError:
            print(f"Error: Could not reach the {service_name} API. Check your internet connection.", file=sys.stderr)
            sys.exit(1)
    else:
        import anthropic
        try:
            response = client.messages.create(
                model=model,
                max_tokens=max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text.strip()
        except anthropic.AuthenticationError:
            print("Error: Anthropic API key is invalid or missing. Check your ANTHROPIC_API_KEY.", file=sys.stderr)
            sys.exit(1)
        except anthropic.BadRequestError as e:
            if "credit balance is too low" in str(e):
                print("Error: Anthropic account has insufficient credits. Add credits at console.anthropic.com → Plans & Billing.", file=sys.stderr)
            else:
                print(f"Error: Anthropic rejected the request: {e}", file=sys.stderr)
            sys.exit(1)
        except anthropic.RateLimitError:
            print("Error: Anthropic rate limit reached. Wait a few minutes and try again.", file=sys.stderr)
            sys.exit(1)
        except anthropic.APIConnectionError:
            print("Error: Could not reach the Anthropic API. Check your internet connection.", file=sys.stderr)
            sys.exit(1)


def _parse_json_response(raw: str) -> dict | list:
    """Strip markdown fences and parse JSON from an LLM response."""
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw)


# ---------------------------------------------------------------------------
# Article fetching
# ---------------------------------------------------------------------------

def fetch_articles(publication: dict, since: datetime) -> list[dict]:
    """Fetch recent articles from an RSS feed, filtering by publish date."""
    try:
        response = requests.get(publication["rss_url"], timeout=15)
        response.raise_for_status()
        feed = feedparser.parse(response.content)
        articles = []
        for entry in feed.entries:
            pub_date = None
            if hasattr(entry, "published_parsed") and entry.published_parsed:
                pub_date = datetime(*entry.published_parsed[:6], tzinfo=timezone.utc)
            elif hasattr(entry, "updated_parsed") and entry.updated_parsed:
                pub_date = datetime(*entry.updated_parsed[:6], tzinfo=timezone.utc)

            if pub_date and pub_date < since:
                continue

            summary = entry.get("summary", entry.get("description", ""))
            summary = summary.replace("<p>", " ").replace("</p>", " ")
            summary = " ".join(summary.split())[:600]

            articles.append({
                "source": publication["name"],
                "title": entry.get("title", "").strip(),
                "url": entry.get("link", ""),
                "summary": summary,
                "published": pub_date.strftime("%Y-%m-%d") if pub_date else "unknown",
            })
        return articles
    except Exception as e:
        print(f"  Warning: failed to fetch {publication['name']}: {e}", file=sys.stderr)
        return []


def fetch_article_content(url: str) -> str:
    """Fetch a URL and return its main text content (for Research Mode)."""
    from bs4 import BeautifulSoup
    resp = requests.get(
        url,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0 (compatible; news-watcher/1.0)"},
    )
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")

    for tag in soup(["script", "style", "nav", "footer", "header", "aside", "iframe"]):
        tag.decompose()

    content = ""
    for selector in ["article", "main", "[role='main']", ".post-content", ".article-content", ".entry-content", ".content"]:
        el = soup.select_one(selector)
        if el:
            content = el.get_text(separator=" ", strip=True)
            break

    if not content and soup.body:
        content = soup.body.get_text(separator=" ", strip=True)

    words = content.split()
    if len(words) > 6000:
        content = " ".join(words[:6000]) + " [truncated]"

    return content


# ---------------------------------------------------------------------------
# Relevance evaluation
# ---------------------------------------------------------------------------

def evaluate_relevance(
    articles: list[dict],
    config: dict,
    client,
    provider: str,
    model: str,
) -> list[dict]:
    """Use the LLM to score article relevance against the configured thesis."""
    system_prompt = f"""You are a research assistant evaluating news articles for relevance to a thesis.

Thesis: {config["thesis"]}

Supporting keywords: {", ".join(config["keywords"])}

Relevant themes:
{chr(10).join(f"- {t}" for t in config["themes"])}

For each article, decide if it supports, challenges, or is relevant to the thesis. Score relevance 1–10, where:
- 8–10: Directly addresses the thesis with evidence or substantial discussion
- 6–7: Tangentially relevant; touches on related themes
- 1–5: Not relevant enough to surface

Return a JSON object with this exact structure and nothing else:
{{
  "relevant": [
    {{
      "id": <integer>,
      "relevance_score": <integer 1-10>,
      "explanation": "<1–2 sentences explaining why this article relates to the thesis>"
    }}
  ]
}}

Only include articles scoring {config.get("min_relevance_score", 6)} or higher."""

    scored = []
    for batch_start in range(0, len(articles), BATCH_SIZE):
        batch = articles[batch_start : batch_start + BATCH_SIZE]
        batch_num = batch_start // BATCH_SIZE + 1
        total_batches = (len(articles) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"  LLM batch {batch_num}/{total_batches} ({len(batch)} articles)...")

        payload = json.dumps(
            [{"id": i, "source": a["source"], "title": a["title"], "summary": a["summary"]}
             for i, a in enumerate(batch)],
            indent=2,
        )
        raw = _call_llm(f"Evaluate these articles:\n\n{payload}", system_prompt, client, provider, model)
        for result in _parse_json_response(raw).get("relevant", []):
            article = batch[result["id"]].copy()
            article["relevance_score"] = result["relevance_score"]
            article["explanation"] = result["explanation"]
            scored.append(article)

    results = sorted(scored, key=lambda x: x["relevance_score"], reverse=True)
    _save_debug("llm_analysis", {
        "provider": provider,
        "model": model,
        "thesis": config["thesis"],
        "articles_evaluated": len(articles),
        "articles_scored": len(results),
        "results": results,
    })
    return results


# ---------------------------------------------------------------------------
# GitHub Issues
# ---------------------------------------------------------------------------

def create_github_issue(
    relevant: list[dict],
    config: dict,
    github_token: str,
    github_repo: str,
    scan_date_iso: str,
) -> str | None:
    """Create a GitHub Issue with the daily digest and return the issue URL."""
    owner, repo = github_repo.split("/", 1)

    body_lines = [
        f"**Thesis:** _{config['thesis']}_",
        f"**Articles found:** {len(relevant)}",
        "",
        "---",
        "",
    ]
    for article in relevant:
        filled = article["relevance_score"]
        score_bar = "█" * filled + "░" * (10 - filled)
        body_lines.extend([
            f"### [{article['title']}]({article['url']})",
            f"**Source:** {article['source']} · **Published:** {article['published']}  ",
            f"**Relevance:** `{score_bar} {filled}/10`",
            "",
            article["explanation"],
            "",
            "---",
            "",
        ])

    issue_config = config.get("github_issues", {})
    assignee = issue_config.get("assignee", owner)
    labels = issue_config.get("labels", ["daily-digest"])

    issue_title = f"Daily digest — {scan_date_iso}"
    url = f"https://api.github.com/repos/{owner}/{repo}/issues"
    headers = {
        "Authorization": f"Bearer {github_token}",
        "Accept": "application/vnd.github.v3+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    payload: dict = {
        "title": issue_title,
        "body": "\n".join(body_lines),
        "assignees": [assignee],
    }
    if labels:
        payload["labels"] = labels

    try:
        resp = requests.post(url, json=payload, headers=headers, timeout=15)
        resp.raise_for_status()
        return resp.json()["html_url"]
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        body = e.response.text if e.response is not None else ""
        print(f"  Warning: failed to create GitHub issue (HTTP {status}): {body}", file=sys.stderr)
        return None


# ---------------------------------------------------------------------------
# Research Mode
# ---------------------------------------------------------------------------

def _load_research_state(state_file: str, hypothesis: str) -> dict:
    path = Path(state_file)
    if path.exists():
        with open(path) as f:
            return json.load(f)
    return {
        "hypothesis": hypothesis,
        "position_summary": "No analysis yet — this is the initial state.",
        "claims": [],
        "last_updated": None,
    }


def _save_research_state(state: dict, state_file: str) -> None:
    path = Path(state_file)
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w") as f:
        json.dump(state, f, indent=2)


def _extract_claims(
    article: dict,
    hypothesis: str,
    content: str,
    client,
    provider: str,
    model: str,
) -> list[dict]:
    """Extract claims from a full article that relate to the hypothesis."""
    system = (
        "You are a research analyst. Your job is to read an article and identify specific, "
        "verifiable claims that are relevant to a given hypothesis. Be precise and factual."
    )
    prompt = f"""Hypothesis: {hypothesis}

Article title: {article['title']}
Article URL: {article['url']}
Article content:
{content}

Extract up to 5 specific claims from this article that relate to the hypothesis. For each claim:
- State the claim precisely and concisely (what is actually asserted)
- Assess its stance toward the hypothesis: "supports", "contradicts", or "neutral"
- Provide brief evidence or context from the article

Return a JSON object with this exact structure and nothing else:
{{
  "claims": [
    {{
      "claim": "<precise statement of the claim>",
      "stance": "<supports|contradicts|neutral>",
      "evidence": "<brief excerpt or context from the article>"
    }}
  ]
}}

If no claims are relevant to the hypothesis, return an empty claims list."""

    raw = _call_llm(prompt, system, client, provider, model, max_tokens=1024)
    parsed = _parse_json_response(raw)
    date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return [
        {
            "date": date_str,
            "article_title": article["title"],
            "article_url": article["url"],
            "article_source": article["source"],
            **claim,
        }
        for claim in parsed.get("claims", [])
    ]


def _update_position_summary(state: dict, client, provider: str, model: str) -> str:
    """Synthesize all cataloged claims into an updated position summary."""
    if not state["claims"]:
        return "No claims have been cataloged yet."

    claims_text = json.dumps(state["claims"], indent=2)
    system = (
        "You are a research analyst synthesizing evidence for or against a hypothesis. "
        "Be rigorous, balanced, and evidence-based."
    )
    prompt = f"""Hypothesis: {state['hypothesis']}

Previous position summary:
{state['position_summary']}

All cataloged claims (chronological):
{claims_text}

Write an updated position summary that:
1. States the current overall assessment of the hypothesis (supported, contradicted, mixed, or inconclusive)
2. Summarizes the strongest supporting evidence
3. Summarizes the strongest contradicting evidence
4. Notes any important nuances or gaps in the evidence

Keep the summary to 3–5 paragraphs. Return only the summary text, no JSON."""

    return _call_llm(prompt, system, client, provider, model, max_tokens=1000)


def run_research_mode(
    relevant: list[dict],
    config: dict,
    client,
    provider: str,
    model: str,
) -> None:
    """Extract claims from relevant articles and update the position summary."""
    research_config = config.get("research_mode", {})
    hypothesis = research_config.get("hypothesis", "").strip()
    state_file = research_config.get("state_file", "research/state.json")

    if not hypothesis:
        print("  Warning: research_mode.hypothesis is not configured. Skipping Research Mode.", file=sys.stderr)
        return

    is_new_file = not Path(state_file).exists()
    print(f"Research Mode: {'initializing' if is_new_file else 'loading'} state from {state_file}...")
    state = _load_research_state(state_file, hypothesis)

    if is_new_file:
        _save_research_state(state, state_file)
        print(f"  Research state initialized → {state_file}")

    new_claims: list[dict] = []
    for article in relevant:
        print(f"  Fetching: {article['title'][:70]}...")
        try:
            content = fetch_article_content(article["url"])
            claims = _extract_claims(article, hypothesis, content, client, provider, model)
            if claims:
                print(f"    → {len(claims)} claim(s) extracted")
                new_claims.extend(claims)
                state["claims"].extend(claims)
            else:
                print("    → no relevant claims found")
        except Exception as e:
            print(f"  Warning: could not process article '{article['title'][:50]}': {e}", file=sys.stderr)

    if new_claims:
        print(f"  Updating position summary from {len(state['claims'])} total claim(s)...")
        state["position_summary"] = _update_position_summary(state, client, provider, model)
        state["last_updated"] = datetime.now(timezone.utc).isoformat()
        _save_research_state(state, state_file)
        print(f"  Research state saved → {state_file}")
        print(f"\n--- Position Summary ---\n{state['position_summary']}\n---")
    else:
        print("  No new claims extracted from today's articles.")

    _save_debug("research_state", state)


# ---------------------------------------------------------------------------
# Slack output
# ---------------------------------------------------------------------------

SLACK_MAX_BLOCKS = 50
_HEADER_BLOCKS = 3
_BLOCKS_PER_ARTICLE = 2
_MAX_ARTICLES_PER_MESSAGE = (SLACK_MAX_BLOCKS - _HEADER_BLOCKS) // _BLOCKS_PER_ARTICLE


def post_to_slack(
    relevant: list[dict],
    config: dict,
    webhook_url: str,
    scan_date: str,
    deep_dive_url: str | None = None,
) -> None:
    chunks = [
        relevant[i : i + _MAX_ARTICLES_PER_MESSAGE]
        for i in range(0, len(relevant), _MAX_ARTICLES_PER_MESSAGE)
    ]
    total_messages = len(chunks)

    for idx, chunk in enumerate(chunks):
        part_label = f" ({idx + 1}/{total_messages})" if total_messages > 1 else ""
        blocks = [
            {
                "type": "header",
                "text": {"type": "plain_text", "text": f"{config['name']} — {scan_date}{part_label}"},
            },
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*Thesis:* _{config['thesis']}_\n"
                        f"Found *{len(relevant)} relevant article(s)* in today's scan."
                    ),
                },
            },
            {"type": "divider"},
        ]

        for article in chunk:
            filled = article["relevance_score"]
            score_bar = "█" * filled + "░" * (10 - filled)
            section: dict = {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        f"*<{article['url']}|{article['title']}>*\n"
                        f"_{article['source']}_ · {article['published']}\n"
                        f"{article['explanation']}\n"
                        f"`{score_bar} {filled}/10`"
                    ),
                },
            }
            if deep_dive_url:
                section["accessory"] = {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Deep Dive"},
                    "url": deep_dive_url,
                }
            blocks.append(section)
            blocks.append({"type": "divider"})

        payload = {"blocks": blocks}
        suffix = f"_part{idx + 1}" if total_messages > 1 else ""
        _save_debug(f"slack_payload{suffix}", payload)
        _slack_post(webhook_url, payload)


def post_empty_to_slack(config: dict, webhook_url: str, scan_date: str) -> None:
    _slack_post(webhook_url, {
        "text": (
            f"*{config['name']}* — {scan_date}\n"
            f"No relevant articles found today for: _{config['thesis']}_"
        )
    })


def _slack_post(webhook_url: str, payload: dict) -> None:
    try:
        resp = requests.post(webhook_url, json=payload, timeout=10)
        resp.raise_for_status()
    except requests.exceptions.HTTPError as e:
        status = e.response.status_code if e.response is not None else "unknown"
        body = e.response.text if e.response is not None else ""
        if status == 400:
            print(
                "Error: Slack rejected the message (400 Bad Request). "
                "The webhook URL may be invalid, revoked, or the payload is malformed. "
                "Verify your SLACK_WEBHOOK_URL in .env or re-create the webhook at api.slack.com/apps.",
                file=sys.stderr,
            )
        elif status == 403:
            print("Error: Slack webhook forbidden (403). The webhook may have been revoked.", file=sys.stderr)
        elif status == 404:
            print("Error: Slack webhook not found (404). Check that the URL in SLACK_WEBHOOK_URL is correct.", file=sys.stderr)
        else:
            print(f"Error: Slack returned HTTP {status}: {body}", file=sys.stderr)
        sys.exit(1)
    except requests.exceptions.ConnectionError:
        print("Error: Could not reach Slack. Check your internet connection.", file=sys.stderr)
        sys.exit(1)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    config_path = os.environ.get("CONFIG_PATH", "")
    webhook_url = os.environ.get("SLACK_WEBHOOK_URL", "")
    lookback_hours = int(os.environ.get("LOOKBACK_HOURS", "24"))
    github_repo = os.environ.get("GITHUB_REPOSITORY", "")
    github_token = os.environ.get("GITHUB_TOKEN", "")

    deep_dive_url = (
        f"https://github.com/{github_repo}/actions/workflows/deep-summary.yml"
        if github_repo else None
    )

    config = load_config(config_path)
    client, provider, model = build_llm_client(config)

    issue_enabled = (
        os.environ.get("SAVE_AS_GITHUB_ISSUE", "").lower() == "true"
        or config.get("github_issues", {}).get("enabled", False)
    )
    research_enabled = (
        os.environ.get("RESEARCH_MODE", "").lower() == "true"
        or config.get("research_mode", {}).get("enabled", False)
    )

    active_outputs = (
        (["Slack"] if webhook_url else [])
        + (["GitHub Issues"] if issue_enabled else [])
        + (["Research Mode"] if research_enabled else [])
    )
    if not active_outputs:
        print(
            "Warning: no outputs configured. Set SLACK_WEBHOOK_URL, enable github_issues, "
            "or enable research_mode.",
            file=sys.stderr,
        )
    print(f"AI provider: {provider} / model: {model}")
    print(f"Outputs: {', '.join(active_outputs) if active_outputs else 'none'}")

    since = datetime.now(timezone.utc) - timedelta(hours=lookback_hours)
    scan_date = datetime.now(timezone.utc).strftime("%B %d, %Y")
    scan_date_iso = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    print(f"Scanning {len(config['publications'])} publications (lookback: {lookback_hours}h)...")

    all_articles: list[dict] = []
    for pub in config["publications"]:
        articles = fetch_articles(pub, since)
        print(f"  {pub['name']}: {len(articles)} article(s)")
        all_articles.extend(articles)

    print(f"Total articles to evaluate: {len(all_articles)}")

    if not all_articles:
        print("Nothing in the lookback window.")
        if webhook_url and config.get("notify_on_empty"):
            post_empty_to_slack(config, webhook_url, scan_date)
        return

    print(f"Evaluating relevance with {provider}...")
    relevant = evaluate_relevance(all_articles, config, client, provider, model)
    print(f"Relevant articles: {len(relevant)}")

    if relevant:
        if webhook_url:
            post_to_slack(relevant, config, webhook_url, scan_date, deep_dive_url)
            print(f"Posted {len(relevant)} article(s) to Slack.")

        if issue_enabled:
            if github_token and github_repo:
                print("Creating GitHub issue...")
                issue_url = create_github_issue(relevant, config, github_token, github_repo, scan_date_iso)
                if issue_url:
                    print(f"GitHub issue created: {issue_url}")
            else:
                print("Warning: GitHub Issues enabled but GITHUB_TOKEN or GITHUB_REPOSITORY is not set.", file=sys.stderr)

    else:
        if webhook_url and config.get("notify_on_empty"):
            post_empty_to_slack(config, webhook_url, scan_date)
            print("Posted empty-result notice to Slack.")
        else:
            print("No relevant articles today.")

    # Runs even with no relevant articles so the state file is initialized on
    # the first run and the position summary persists across quiet days.
    if research_enabled:
        run_research_mode(relevant, config, client, provider, model)


if __name__ == "__main__":
    main()
