# How to demo

A three-minute talk track over a run that takes about the same. One command.
No Slack webhook, no GitHub token, and the only network call is to your model
endpoint.

```bash
./run.sh demo
```

Three consecutive daily runs against fixture feeds in `demo/feeds/`. The scoring
and claim-extraction calls are real; only the sources are fixtures, so the
evidence arrives in a known order and the arc is the same every time even though
the wording is not.

## What to say while it runs

**Run 1 — two supporting articles.** A benchmark reporting 41% fewer unsupported
assertions from schema-aware chunking, and a survey where teams with a
maintained taxonomy hit their accuracy targets at twice the rate. The position
summary comes back supportive, which is the least interesting thing on screen.

Point at the two gates instead. The model scored each article against the
thesis, and that score decided whether the article got fetched in full and read
for claims at all. It then decided how many claims each article yields, where
zero is a legitimate answer, and that decided whether the position summary got
rewritten. Both are model decisions the surrounding Python routes on.

**Run 2 — the evidence turns.** Long-context models matching a structured
pipeline on 7 of 9 categories, and controlled vocabularies actively hurting
users who do not know the organization's terms.

This is the run worth watching. The summary is rebuilt from the *entire* claim
history plus the previous summary, not from today's articles, so day 2 cannot
erase day 1. Watch it reconcile rather than flip: the supporting claims are
still there, still counted, now qualified. A system that rewrote its position
from the latest input would have swung to "contradicted" here.

**Run 3 — nuance.** Hybrid retrieval beating both pure approaches, and an
accounting of what maintaining a content model actually costs — 1.5 FTE, a 40%
metadata error rate, and mistagged documents failing at nearly the unstructured
baseline.

By now the claim count is approaching thirty and the stance mix is visibly
split — roughly half supporting, the rest contradicting or neutral. The end
state lands somewhere near "conditional support, hybrid architecture optimal,"
which no single article in the set argues. That conclusion only exists because
the claims accumulated.

Exact wording varies per run; the arc does not. Three observed headings from one
run: *Moderately Supported with Important Qualifications* → *Mixed Evidence with
Context-Dependent Support* → *Conditional Support with Hybrid Architecture
Emerging as Optimal*.

## The close

```
Accumulated state: demo/.build/state.json
```

Open it. Every claim carries its date, source, stance and an evidence excerpt,
so any sentence in the summary can be walked back to the article that produced
it. That file is the deliverable; the Slack digest is a by-product.

Then: **in production this runs on a schedule.** A cron job, a CI timer,
anything, against live RSS instead of fixtures, with the state file persisted so
the position survives between runs. Nothing about the agent changes, which is
why no scheduler ships in this repository.

## If someone asks why it is archetype 2 and not 1

Because the model chooses the path as well as the prose. The relevance score
routes each article between "dropped" and "fetched, read, and folded into
persistent state". The claim count routes the run between "leave the position
alone" and "resynthesize it". A person wrote the structure; what varies per run
is which branch the model sends each item down.

Concede the fair challenge rather than arguing it: each of those is a yes/no
over one downstream path, which puts this at the thin end of archetype 2 rather
than in the middle of it.

## If someone asks which model it ran on

Whatever you pointed it at. `LLM_BASE_URL` routes the agent at any
OpenAI-compatible endpoint with `LLM_MODEL` — the same contract archetypes 3, 4
and 5 use, so one credential runs all four prototypes. Unset it and the
`AI_PROVIDER` path takes over with Anthropic, OpenAI or the Vercel AI Gateway.

## Reset

`./run.sh demo` rebuilds `demo/.build/` from the templates every time, so the
state starts empty on every run. Nothing to clean up, though `debug/` does
accumulate one pair of files per run and is never pruned.
