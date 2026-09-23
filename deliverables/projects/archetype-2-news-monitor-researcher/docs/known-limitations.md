# Known limitations — accepted prototype scope

News Watcher is a working-group prototype: it exists to show what archetype 2
looks like when a model routes items through a structure a person authored, and
to be honest about where that structure is thinner than it appears. It is **not**
production software, and this file is the list of places where that distinction
is load-bearing.

Everything below was found deliberately, in a review on 2026-09-23, and then
deliberately left in place. Two reasons to publish the list rather than quietly
carry it: a reader evaluating the prototype deserves to know which properties
are demonstrated and which are asserted, and a contributor deserves to know
which oddities are decisions rather than bugs.

## Scope note for contributors

Do not act on anything in this file unless that is the task you were given.
These are recorded so nobody re-discovers them as bugs, re-litigates them
mid-task, or "helpfully" refactors them unasked.

## Archetype

**1. Both model-routed branches are booleans, so this is the thin end of
archetype 2.** The relevance gate and the synthesis gate each send an item down
one of two paths, and the two paths differ in whether work happens rather than in
what work happens. A central archetype-2 example would have the model choose
among qualitatively different branches. The cheapest change that would move it:
have the scoring call return an action per article — `skip`, `digest_only`,
`deep_read`, `deep_read_and_revisit` — instead of only a score, and dispatch on
it. One enum field in the JSON already being parsed, one branch. Deliberately not
done, because the current shape is the honest one to argue from.

**2. The relevance threshold is instructional, not structural.** `evaluate_relevance`
puts `min_relevance_score` in the system prompt and then trusts whatever comes
back; there is no code-side filter on the returned score. A model that ignores
the threshold, or returns an 11, is believed. This is the single place where this
prototype does the opposite of what archetypes 3, 4 and 5 argue for — those
enforce in code what they state in prompts. It is documented rather than fixed
so the contrast is legible, and `test_filters_by_min_score` in
`src/test_watcher.py` says so in its own comment. Fix: clamp the score to 1–10,
drop anything below the threshold, and make that test assert a below-threshold
score is dropped rather than asserting a one-item mock returns one item.

**3. Malformed model output is only partly guarded.** A reply that is not JSON is
caught per batch and skipped. A reply that is valid JSON of the wrong *shape* is
not: an out-of-range `id` in the relevance response raises `IndexError` and kills
the run, a `relevance_score` above 10 makes `"░" * (10 - filled)` render an empty
bar rather than failing, and `_extract_claims` splats `**claim` into the stored
record so a `stance` outside the three literals is persisted unchallenged.

## Operation over time

**4. The claims list grows without bound and is resent in full on every run.**
`_update_position_summary` serialises the entire claim history into each
synthesis prompt. Cost per run therefore rises monotonically, and the run will
eventually fail when the history exceeds the model's context window. There is no
cap, no compaction, no summarise-and-drop. For a demo measured in days this never
fires; for the "runs over an extended period" claim the archetype makes, it is
the first thing that breaks. Post-prototype fix: retain full claims for a recent
window, fold older ones into a rolling digest, and keep the full list only on
disk.

**5. There is no dedupe across runs.** Nothing records which URLs have already
been read. A manual run with a wider `LOOKBACK_HOURS`, an article that lingers in
a feed, or two watchers sharing a state file all produce duplicate claims, which
then double-count in the synthesis. Fix: a seen-URL set in the state file,
checked before fetching.

**6. Nothing bounds a single run.** No ceiling on articles fetched, model calls
made, or spend incurred. A feed that returns hundreds of items in the window is
scored and read in full. Archetypes 3, 4 and 5 all treat this as first-class —
`BUDGET_EXHAUSTED`, circuit breakers, a wall-clock mandate. Here it is absent.

**7. The state file has no schema version and no migration path.** `_load_research_state`
reads whatever JSON it finds and trusts its shape. A state file written by an
older version, or hand-edited, fails at the point of use rather than at load.

## Security

**8. There is no host allow-list and no private-address block.** `_fetch_bytes`
pins the scheme to `http(s)` and caps redirects at three, which stops a crafted
`<link>` from reading local files or being chained off-protocol. It does not stop
a feed from pointing the fetcher at a host on your own network. Accepted because
the prototype is meant to be run against public feeds on a laptop. See
`SECURITY.md`.

**9. Prompt-injection mitigation is a fence and an instruction, not a boundary.**
The article body is delimited and declared untrusted, and the fence marker is
stripped from the content. That raises the cost of an attack; it does not make
the extracted claims trustworthy. The real control is that a human reads the
evidence excerpt before believing anything.

**10. `debug/` is written unconditionally and never cleaned up.** Every LLM
response and the full research state land there on every run, unredacted. It is
gitignored, which keeps it out of the repository and not off the disk.

## Testing

**11. The test suite mocks every model call, so no test exercises a real
response shape.** `./run.sh demo` is the only thing that does, and it is not
automated. A provider SDK that changed its response format passes `pytest` and
fails in production.

**12. `test_config.py` and `test_slack_payload.py` are named like tests but are
manual credential checks.** They make live API calls and are invoked through
`./run.sh test`, not through pytest. Collecting `src/` wholesale with pytest
would try to run them.

## Do not "fix" these while working on something else

Two properties are load-bearing and must survive any refactor: `_fetch_bytes`
must remain the single choke point for every outbound fetch, so the scheme
allow-list and redirect cap cannot be bypassed by a caller reaching for
`requests` directly; and the article body must stay inside the untrusted fence
in `_extract_claims`, with the fence marker stripped from the content before
interpolation.
