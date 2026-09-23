# Getting started

Clone to a green run. Two paths: the demo needs one model credential and
nothing else, a live watcher needs a config and at least one output.

## Prerequisites

- **Python 3.12**. 3.10 is the floor; see [`VERSIONS.md`](./VERSIONS.md)
- **One model credential**: any OpenAI-compatible endpoint via `LLM_BASE_URL`, or an
  Anthropic (default), OpenAI, or Vercel AI Gateway key

Check your Python:

```bash
python3 --version        # 3.10 or newer
```

## 1. Credentials

```bash
cp .env.example .env
```

Open `.env` and set one model credential. Either point it at any
OpenAI-compatible endpoint:

```bash
LLM_BASE_URL=https://us.openrouter.ai/api/v1
LLM_MODEL=anthropic/claude-sonnet-4.5
LLM_API_KEY=...            # optional where a proxy attaches the credential
```

This is the same contract archetypes 3, 4 and 5 use, so one credential runs all
four. Or use a named provider instead, leaving `LLM_BASE_URL` unset:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

For OpenAI or the Vercel AI Gateway, set `AI_PROVIDER=openai` or
`AI_PROVIDER=vercel` and the matching key. `.env` is gitignored and every
variable the code reads is documented in `.env.example`, which
`src/test_env_docs.py` fails the build over if the two drift apart.

## 2. Run the demo

```bash
./run.sh demo
```

First run creates `.venv` and installs `requirements.txt`, which takes a minute.
Then three consecutive daily runs execute against fixture feeds in
`demo/feeds/`. No Slack webhook, no GitHub token, and the only network call is
to your model endpoint. Twelve model calls, about three minutes on Sonnet-class
models.

You should see each run report articles scored, claims extracted, and the
position summary printed between runs, ending at:

```
Accumulated state: demo/.build/state.json
```

Open that file. If it has a multi-paragraph `position_summary` and a `claims`
array of roughly 25-30 entries, each carrying `stance` and `evidence`, the
install is good. The talk track for showing this to someone else is in
[`HOW-TO-DEMO.md`](./HOW-TO-DEMO.md).

## 3. Run the tests

```bash
.venv/bin/pip install pytest
.venv/bin/python -m pytest src/test_watcher.py src/test_env_docs.py -v
```

No API key needed: every model call is mocked. That is also the limit of what
they prove. No test exercises a real provider response, so the demo above is
what catches an SDK change. See `docs/known-limitations.md` §11.

## 4. Point it at real feeds

Copy the example config and edit it:

```bash
cp config/example.json config/my-watcher.json
```

The three fields that matter most:

- **`thesis`** — the argument articles are scored against. Specific beats broad:
  "AI functions better when pulling from structured content" gives the model
  something to judge, where "AI news" does not.
- **`publications`** — name and `rss_url` per feed. Check each URL returns XML
  in a browser first. A dead feed only produces a warning, so it is easy to miss.
- **`min_relevance_score`** — 6 surfaces a handful a day, 9 surfaces almost
  nothing. Start at 6 and raise it once you see what clears.

Then configure at least one output. The watcher warns and does nothing useful if
you configure none:

| Output | What to set |
|---|---|
| Slack | `SLACK_WEBHOOK_URL` in `.env` |
| GitHub Issues | `SAVE_AS_GITHUB_ISSUE=true`, plus `GITHUB_TOKEN` and `GITHUB_REPOSITORY` |
| Research Mode | `research_mode.enabled: true` and a `hypothesis` in the config |

Verify credentials before the first real run. This posts a test message to
Slack and makes one minimal model call:

```bash
./run.sh test
```

Then:

```bash
CONFIG_PATH=config/my-watcher.json ./run.sh
```

## 5. Schedule it

No scheduler ships in this repository; see the README's
[Schedule](./README.md#3-schedule) section. A cron line is the whole of it:

```cron
0 9 * * *  cd /path/to/news-watcher && CONFIG_PATH=config/my-watcher.json ./run.sh
```

If Research Mode is on, whatever runs that line must persist
`research_mode.state_file` between runs, by committing it or mounting it. That
file is the agent's only memory.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `Error: no config file specified` | `CONFIG_PATH` is unset. Set it in `.env` or inline. |
| `Error: ANTHROPIC_API_KEY is not set` | No key for the selected provider, and `LLM_BASE_URL` is unset. |
| `Error: LLM_BASE_URL is set but LLM_MODEL is not` | Model ids are endpoint-specific and have no default. Set one. |
| `Error: ... does not have a model called '...'` | The endpoint returned 404 for that model id. Check its model list. |
| `Warning: failed to fetch <publication>` | Dead or moved RSS URL. The run continues without it; check the URL in a browser. |
| `Total articles to evaluate: 0` | Nothing published in the lookback window. Raise `LOOKBACK_HOURS` to confirm the feeds work. |
| `Relevant articles: 0` every run | `min_relevance_score` too high for the thesis, or the thesis is too narrow for the feeds. |
| `Warning: batch N skipped — model did not return valid JSON` | The model replied with prose. One batch is lost; the rest of the run continues. |
| `file:// is only fetched under DEMO_FIXTURES=1` | A real config pointed at a `file://` URL. Only the demo may do that. |
| `refusing to fetch non-http(s) URL` | A feed entry linked to something other than http/https. The article is skipped. |
