# Known limitations — accepted prototype scope

News Watcher is a working-group prototype: it exists to show what archetype 2
looks like when a model routes items through a structure a person authored, and
to be honest about where that structure is thinner than it appears. It is **not**
production software, and this file is the list of places where that distinction
is load-bearing.

Everything below was found deliberately, in a review on 2026-09-23, and then
deliberately left in place. Do not act on any of it unless that is the task you
were given — the list exists so nobody re-discovers these as bugs, re-litigates
them mid-task, or "helpfully" refactors them unasked.

## Model routing

**1. The relevance threshold is instructional, not structural.** `evaluate_relevance`
puts `min_relevance_score` in the system prompt and then trusts whatever comes
back; there is no code-side filter on the returned score. A model that ignores
the threshold, or returns an 11, is believed. This is the single place where this
prototype does the opposite of what archetypes 3, 4 and 5 argue for — those
enforce in code what they state in prompts. It is documented rather than fixed
so the contrast is legible, and `test_filters_by_min_score` in
`src/test_watcher.py` says so in its own comment. Fix: clamp the score to 1–10,
drop anything below the threshold, and make that test assert a below-threshold
score is dropped rather than asserting a one-item mock returns one item.

**2. Malformed model output is only partly guarded.** A reply that is not JSON is
caught per batch and skipped. A reply that is valid JSON of the wrong *shape* is
not: an out-of-range `id` in the relevance response raises `IndexError` and kills
the run, a `relevance_score` above 10 makes `"░" * (10 - filled)` render an empty
bar rather than failing, and `_extract_claims` splats `**claim` into the stored
record so a `stance` outside the three literals is persisted unchallenged.

## Operation over time

**3. The claims list grows without bound and is resent in full on every run.**
`_update_position_summary` serialises the entire claim history into each
synthesis prompt. Cost per run therefore rises monotonically, and the run will
eventually fail when the history exceeds the model's context window. There is no
cap, no compaction, no summarise-and-drop. For a demo measured in days this never
fires; for the "runs over an extended period" claim the archetype makes, it is
the first thing that breaks. Post-prototype fix: retain full claims for a recent
window, fold older ones into a rolling digest, and keep the full list only on
disk.

**4. There is no dedupe across runs.** Nothing records which URLs have already
been read. A manual run with a wider `LOOKBACK_HOURS`, an article that lingers in
a feed, or two watchers sharing a state file all produce duplicate claims, which
then double-count in the synthesis. Fix: a seen-URL set in the state file,
checked before fetching.

**5. Nothing bounds a single run.** No ceiling on articles fetched, model calls
made, or spend incurred. A feed that returns hundreds of items in the window is
scored and read in full. Archetypes 3, 4 and 5 all treat this as first-class —
`BUDGET_EXHAUSTED`, circuit breakers, a wall-clock mandate. Here it is absent.

**6. The state file has no schema version and no migration path.** `_load_research_state`
reads whatever JSON it finds and trusts its shape. A state file written by an
older version, or hand-edited, fails at the point of use rather than at load.

## Security

**7. There is no host allow-list and no private-address block, so a feed can
reach your network and read the answer back out.** `_fetch_bytes` pins the
scheme to `http(s)` and caps redirects at three, which stops a crafted `<link>`
from reading local files or being chained off-protocol. Two things it does not
do. It does not restrict the host, so a publication's `<link>` of
`http://169.254.169.254/latest/meta-data/` or `http://10.0.0.5:8080/` is fetched
from wherever this process runs. And the check after the redirect chain resolves
re-validates the **scheme only, not the host** — a public URL that redirects to
an internal one passes it.

That makes this an exfiltration path rather than only a reachability one: what
comes back is scraped, summarised by the model, and written into
`research/state.json`, a Slack message and a GitHub Issue. Whoever controls the
feed reads the response in the digest.

Accepted because the prototype is meant to be run against public feeds on a
laptop, and because a correct fix is a real piece of work — resolving the host
and rejecting RFC1918, loopback, link-local and their IPv6 equivalents, at every
hop, without a TOCTOU gap between the check and the connection. Run it where an
outbound request to your own network does not matter. See `SECURITY.md`.

**8. Under `DEMO_FIXTURES=1`, a feed can read any file the process can read.**
The gate exists so `demo/run-demo.sh` can serve the fixture articles from disk
without a web server. When it is on, `_fetch_bytes` reconstructs the path
entirely from the feed-supplied URL, with no confinement to `demo/`, so a
`<link>` of `file:///etc/passwd` or `file:///home/you/.ssh/id_rsa` is read and
sent through the same summarise-and-publish path as §7. Contained only by the
fact that the one script setting the variable also pins `CONFIG_PATH` to local
fixture feeds. Do not export `DEMO_FIXTURES=1` in a shell you then run a real
scan from. Fix: resolve the path and require it to sit under `demo/`.

**9. Prompt-injection mitigation is a fence and an instruction, not a boundary.**
In `_extract_claims` the article title, URL and body are all delimited and
declared untrusted, and the fence marker is stripped from each before
interpolation. That raises the cost of an attack; it does not make the extracted
claims trustworthy. The real control is that a human reads the evidence excerpt
before believing anything.

The scoring call in `evaluate_relevance` is weaker and deliberately so: titles
and summaries go in as `json.dumps` output, so a title cannot break out of its
string, but there is no fence and the system prompt does not name the content as
quoted. A title addressing the model directly is read in a context that is
listening. What it can win is one article's score — the gate it would pass is
the one a human then reads the digest of.

**10. `debug/` is never cleaned up.** Under `DEBUG_DUMP=1`, every LLM response
and the full research state land there, unredacted, one pair of files per run,
with no pruning and no retention limit. It is gitignored, which keeps it out of
the repository and not off the disk. It is off by default, so the failure mode
is a long-running deployment that turned it on and forgot.

## Testing

**11. The test suite mocks every model call, so no test exercises a real
response shape.** `./run.sh demo` is the only thing that does, and it is not
automated. A provider SDK that changed its response format passes `pytest` and
fails in production.

**12. Two scripts under `src/` make live API calls.** `check_credentials.py`
and `check_slack_payload.py` hit a provider and post to a Slack channel, and are
invoked through `./run.sh test`. They were once named `test_*`, so `pytest src/`
collected and ran them; the `check_` prefix fixes that, but they are still live
calls sitting beside the unit tests rather than in their own directory.

## Do not "fix" these while working on something else

Three properties are load-bearing and must survive any refactor. `_fetch_bytes`
must remain the single choke point for every outbound fetch, so the scheme
allow-list and redirect cap cannot be bypassed by a caller reaching for
`requests` directly. The article's title, URL and body must stay inside the
untrusted fence in `_extract_claims`, with the fence marker stripped from each
before interpolation. And feed- or model-derived text must go through `_md` /
`_md_inline` / `_slack` / `_slack_inline`, and a URL through `_safe_link`,
before being rendered
into a GitHub Issue or a Slack message — interpolating a title straight into
either lets a publication write markup into a message the reader has no reason
to distrust.
