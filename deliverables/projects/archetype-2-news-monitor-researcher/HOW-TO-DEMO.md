# How to demo

A three-minute talk track. One command, no network, no Slack webhook, no GitHub
token — just the LLM key the project already needs.

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
summary comes back supportive, and that is the boring part.

Point at the two gates instead. The model scored each article against the
thesis, and that score is what decided whether the article got fetched in full
and read for claims at all. Then it decided how many claims each article yields
— zero is a legitimate answer — and *that* decided whether the position summary
got rewritten. Both are model decisions the surrounding Python routes on. That
is the archetype: the structure is authored, the path through it is not.

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

By now the claim count is in the low teens and the stance mix is visibly split.
The honest end state is "mixed, conditional on maintenance," which no single
article in the set argues. That conclusion only exists because the claims
accumulated.

## The close

```
Accumulated state: demo/.build/state.json
```

Open it. Every claim carries its date, source, stance, and an evidence excerpt,
so any sentence in the summary can be walked back to the article that produced
it. That file is the deliverable — the digest is a side effect.

Then say the line that matters: **in production this runs on a schedule.** A
cron job, a CI timer, anything — against live RSS instead of fixtures,
committing the state file so the position survives between runs. Nothing about
the agent changes. The scheduler is deployment, not architecture, which is why
it is not in this repository.

## If someone asks why it is archetype 2 and not 1

Because the model chooses the path, not just the prose. The relevance score
routes each article between "dropped" and "fetched, read, and folded into
persistent state," and the claim count routes the run between "leave the
position alone" and "resynthesize it." Fair challenge: both are booleans over a
single downstream path, which is the thin end of archetype 2. The structure is
authored by a person; what varies per run is which branch the model sends each
item down.

## Reset

`./run.sh demo` rebuilds `demo/.build/` from the templates every time, so the
state starts empty on every run. Nothing to clean up.
