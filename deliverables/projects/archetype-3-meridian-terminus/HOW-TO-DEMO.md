# How to demo

Four minutes, five beats. Written to be delivered from a terminal with the
offline replay, because that path needs no key, no network and no luck.

## The one important fact before you start

**Demo the replay, not the live agent.** `infra/replay.ts` is deterministic: same
output, every time, no model, no API key, no rate limit. The live agent is the
more impressive thing and the wrong thing to stake a room on — the agent code has
not been run against a live model in the course of building this, and a first
`eve dev` in front of an audience is a coin flip.

If you do run the live agent, run it *after* the replay, framed as "and here is
what it looks like when a model drives the same tools", and say plainly that
you are showing one run rather than a distribution.

## Setup

```bash
npm install
npm test                  # 54 passing — leave this on screen while you talk
```

Have three terminals ready, or one and a clear screen:

```bash
npm run replay:commit     # beat 2-4
npm run replay:starved    # beat 5
npm run verify:trail      # beat 5
```

---

## Beat 1 — the goal, and what is missing (40s)

Open `agent/instructions.md` (all paths in this file are relative to
``, where you already are).

> **Say:** "This is everything the agent is told. It is a goal, a doctrine, and a
> definition of finished. What it is *not* is a sequence. Nobody wrote down 'first
> list the queue, then check screening, then look up the BIC'. In archetype two we
> would be reviewing a flowchart right now. There isn't one. The order of
> operations is invented at runtime and will differ between two runs against two
> different batches — and that variability is the feature, because the whole
> reason to reach for this archetype is problems you could not enumerate."

Then open `agent/tools/`. Thirteen files: eight tools, and five that are one line
of `disableTool()`.

> **Say:** "So if I am not reviewing a flowchart, what am I reviewing? This.
> Everything the agent can do to the world is the union of these eight tools, and
> exactly one of them changes a payment instruction. Scoping the toolset *is*
> scoping the authority."

Point at the five one-line files.

> **Say:** "And these five subtract. eve gives every agent a shell, a file reader,
> a file writer, web fetch and web search by default. All five are removed —
> because an agent's authority usually grows not because somebody added a
> dangerous tool, but because nobody removed a general one."

## Beat 2 — the loop, and ground truth (50s)

```bash
npm run replay:commit
```

Point at TX-001 through TX-004.

> **Say:** "Four repairs, and look at the right-hand column: `revalidates ACTC`.
> The agent didn't decide the repair worked. It re-ran the payment engine and the
> engine agreed. That is the difference between an agent and a workflow — the
> next step depends on what the last step actually produced, not on what the plan
> said it would produce."

Point at a citation line.

> **Say:** "And every one carries the rule that made it correct. `JPY` carries
> zero minor units under ISO 4217, so `1250000.00` was never a valid amount and
> dropping the decimals doesn't change the number. That is a lookup, not a
> judgement. Which is exactly the test for whether the agent gets to do it alone."

## Beat 3 — where it stops itself (45s)

Point at TX-005 through TX-007.

> **Say:** "Three failures where the agent can work out a plausible value and is
> still not allowed to commit it. The instruction says NORDWIND TEXTIL; the
> account is held by NORDWIND TEXTILHANDEL. Typo? Trading name? Successor entity?
> Wrong account entirely? The registry name is a *candidate*, not a confirmation —
> so it proposes, states what the human is being asked to confirm, and a person
> decides."

Then TX-007.

> **Say:** "And this one gets no proposal at all. A currency the account isn't
> registered for is either a data error or a genuine multi-currency arrangement,
> and the message cannot tell you which. Detection is a first-class outcome. The
> failure mode you're avoiding is an agent that produces a confident answer
> because it was asked a question."

## Beat 4 — the beat that matters (60s)

Point at TX-008.

> **Say:** "This one passes validation. Every field is clean. And it is still not
> releasable, because it is under a sanctions hold — so it is the instruction that
> a queue filtered to 'show me the failures' never surfaces and a desk optimising
> for throughput releases. Passing validation and being releasable are different
> questions. That was a real bug in this codebase for about twenty minutes,
> incidentally, and running the thing is what caught it."

Then TX-009, and the probe lines under both.

> **Say:** "TX-009 is under a travel-rule review and its creditor address is
> unstructured. Restructuring an address is *textbook* Tier A work — reformatting,
> not inventing, exactly the kind of thing we auto-fixed four times at the top of
> this run. It is the most tempting field in the batch. Now watch: the replay
> deliberately *tries* to repair it. `REFUSED, hard stop`. `Candidates offered:
> 0`."

Pause here. This is the point of the whole prototype.

> **Say:** "Here is why that's architecture and not policy. Between 2009 and 2019,
> a dozen banks paid north of nineteen billion dollars for the same conduct: a
> payment hits a sanctions filter, somebody modifies the field that caused the
> hit, the payment goes again. The DOJ's Lloyds release records that the bank's
> own word for the process was *repair*. Deutsche Bank's consent order names a
> *repair queue*. So the question for an autonomous repair agent isn't whether it
> can fix an IBAN — it's whether it is *capable* of the thing it must never do.
> An agent told not to, that complies, has a policy. An agent whose tool surface
> offers no path has an architecture. In the code, `candidateRepairs` returns an
> empty array before it inspects a single finding. There is no branch that can
> emit a modified field on a screening path — and there's a test that crosses
> every screened instruction with every writable field to prove it."

One more, if you have the room's attention:

> **Say:** "And the escalation carries no proposed edit either. Not because the
> agent is being coy — because a suggested replacement sitting in a case file is a
> control that has moved out of the architecture and into someone's discipline at
> 16:55 on a cut-off day."

## Beat 5 — it stops (45s)

Point at the last block of the replay output.

> **Say:** "Termination is a decision the agent takes, not something that happens
> to it. Three endings, and the tool checks the claim: ask for GOAL_ACHIEVED while
> an instruction is neither passing nor owned and it refuses, and tells you which
> ones."

```bash
npm run replay:starved
```

> **Say:** "Same batch, step ceiling of four. The tools start returning
> BUDGET_EXHAUSTED and it closes with partial progress and a list of what's left.
> That third branch is the one people forget to build — and an agent with no path
> to 'out of budget' is an archetype-four agent you didn't mean to take on."

```bash
npm run verify:trail
```

> **Say:** "And this is what makes an autonomous run reviewable. Hash-chained,
> per run, and it reports a run with no termination record as a *failure*.
> Not 'the agent changed this BIC' — the diff says that. 'The agent changed this
> BIC because the supplied value was eight characters and ISO 9362 expands a
> head-office BIC with XXX.'"

Close on the bridge:

> **Say:** "Then the session ends and nothing survives it. No standing identity to
> govern, no state to protect, no continuous decision trail to maintain. Ask this
> same agent to watch the flow all day instead, and all four of those arrive at
> once — that's archetype four, and it's a difference in kind, not degree."

---

## Things not to promise

- **Don't call the replay "the agent."** It is the policy layer driven by a fixed
  operator. It proves what the guardrails do; it proves nothing about what a model
  decides. (It does not import the tools either — those are covered by
  `tests/tools.test.ts`. If someone asks, say so; the separation is deliberate.)
- **Don't claim the live agent is verified.** It is written against eve's
  documented API and has not been run against a live model here.
- **Don't say the sanctions filter is real.** It is a JSON file with four states.
  The *response* to a hold is what is being demonstrated, not the detection.
- **Don't offer compliance advice.** The enforcement history is cited as evidence
  for a design constraint. This prototype is not a control and does not make
  anyone compliant.
- **Don't quote a false-positive rate for sanctions screening.** The widely
  repeated figures have no transparent public methodology behind them.

## If someone asks the sharp questions

**"Couldn't a cleverer model talk its way past the freeze?"** It could talk its
way past the *instruction*. It cannot talk its way past a function that returns
an empty array. That asymmetry is the entire argument for putting the control in
the tool layer, and it is why the test crosses every field rather than spot-checking.

**"What if screening is wrong — a false positive on a legitimate payment?"** Then
a human clears it, which is exactly the design. The agent's job is to be
incapable of clearing it, not to be right about it.

**"Why not just let it propose the sanctions fix and have a human approve?"**
Because that puts an approve button in front of the one person who should never
be offered one. The eve approval policy returns *denied*, not *ask*.

**"How do you know it works?"** `npm test` — 54 tests across four files, and one
of them pins the seed's exact tier membership, so the README cannot drift from the
code without going red. `tools.test.ts` drives the tools themselves through the
same `execute` and `approval` entry points eve uses, so the guarantees are checked
where they are enforced rather than one layer below. And for the model's
behaviour: we don't know yet. That needs a distribution over many runs, and
`PLAN.md` §5 says so before anything else on the list.

**"Don't the tests just test the policy functions?"** They did, in the first
draft — and an audit caught it. A correct `guardRepair` is worth nothing if
`apply_repair` forgets to call it, which is why the tool layer now has its own
suite.
