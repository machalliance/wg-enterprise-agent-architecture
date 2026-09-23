# Working in this repo

News Watcher: an archetype 2 reference prototype. RSS feeds in, an LLM scores
each article against a thesis, matches go to Slack or a GitHub Issue, and
Research Mode reads what cleared the bar and accumulates a position on a
hypothesis across runs.

**Run everything from this directory.** It lives inside the working group
monorepo, but it is a standalone Python project — `run.sh`, `requirements.txt`
and every path in the code are relative to here. `git rev-parse --show-toplevel`
resolves to the monorepo root, which is why the git hooks this project used to
ship never worked and were removed.

## Commands

```bash
./run.sh                 # one scan, using CONFIG_PATH
./run.sh demo            # three runs against fixtures; only the model is live
./run.sh test            # live credential check — makes real API calls
.venv/bin/python -m pytest src/test_watcher.py src/test_env_docs.py -v
```

## Two things that will mislead you if you don't know them

**`LLM_BASE_URL` wins over `AI_PROVIDER`.** Set, it routes everything at an
OpenAI-compatible endpoint with `LLM_MODEL` and `LLM_API_KEY` — the contract
archetypes 3, 4 and 5 share, so one credential runs all four. `_call_llm`
branches on `OPENAI_COMPATIBLE`, which holds every provider on the Chat
Completions wire format; Anthropic is the one that is not.

**Every model call in the test suite is mocked**, so `pytest` passing says
nothing about whether a provider SDK still returns what the code expects. The
only thing that exercises a real response shape is `./run.sh demo`. Run it after
touching `_call_llm`, `build_llm_client`, `_parse_json_response`, or any pin in
`requirements.txt`.

**`src/test_config.py` and `src/test_slack_payload.py` are not pytest tests.**
They are manual credential checks that make live API calls and post to Slack;
`./run.sh test` invokes them. Do not point pytest at `src/` wholesale — name the
test files explicitly, as the commands above do.

## Conventions worth matching

- **Comments explain WHY, and name the failure the code prevents.** A comment
  restating the code is noise; one recording the bug is the point.
- **Dependencies are pinned exactly** (no `>=`) and justified in
  [`VERSIONS.md`](./VERSIONS.md), on a 7-day publish quarantine.
- **`.env.example` documents every variable the code reads**, and
  `src/test_env_docs.py` fails the build if it does not. Adding an
  `os.environ.get("X")` means documenting `X`.
- **Assertions should be non-vacuous** — prove a test fails when the thing it
  checks breaks. `test_filters_by_min_score` is the counter-example, and it is
  documented as such rather than quietly left.
- **No CI, no git hooks, no scheduler.** None of archetypes 3, 4 or 5 run tests
  through CI either. Scheduling is deployment; a cron line in the README is the
  whole story.

## Load-bearing invariants

Two properties must survive any refactor, both recorded in
[`docs/known-limitations.md`](./docs/known-limitations.md):

- **`_fetch_bytes` is the single choke point for every outbound fetch.** The
  scheme allow-list, the redirect cap and the `DEMO_FIXTURES` gate live there. A
  caller reaching for `requests` directly bypasses all three.
- **The article body stays inside the untrusted fence in `_extract_claims`,**
  with the fence marker stripped from the content before interpolation. Scraped
  third-party text is data about what someone published, never instruction.

## Known limitations — ACCEPTED for the prototype stage

The full list is in [`docs/known-limitations.md`](./docs/known-limitations.md):
twelve items across archetype framing, long-run operation, security and testing,
found in a review on 2026-09-23 and deliberately left in place.

**Do not act on anything in that file unless that is the task you were given.**
It exists so nobody re-discovers those items as bugs or re-litigates them
mid-task. The two most likely to tempt you: the relevance threshold is enforced
in the prompt rather than in code (§2), and the claims list grows without bound
and is resent in full every run (§4). Both are documented deliberately.
