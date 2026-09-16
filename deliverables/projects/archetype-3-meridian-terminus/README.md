# Meridian Terminus

Payment exception resolution. The reference prototype for **archetype 3**:
goal-directed, task-oriented agents. One bank, one failing payment batch, one goal, a scoped
toolset, an emergent plan — and a guaranteed stop.

This document is the high-level overview: what the prototype is, why it matters,
and what it demonstrates. To stand it up, see `GETTING-STARTED.md`; to present
it, see `HOW-TO-DEMO.md`. For the plan behind the build and the archetype-to-code
mapping, see `PLAN.md`. For what it deliberately does not do — the accepted
architecture debt and the places the model diverges from a real bank — see
`docs/known-limitations.md`.

> **This is an unmaintained demo — do not deploy it, and use it at your own
> risk.** No security patches, no advisories, no support, and it is provided
> "as is" under MIT. See `SECURITY.md`.

Built on [eve](https://eve.dev), Vercel's agent framework, with model routing
through [AI Gateway](https://vercel.com/docs/ai-gateway) by default — or any
OpenAI-compatible endpoint via `LLM_BASE_URL` — and an egress-denied
[Vercel Sandbox](https://vercel.com/docs/vercel-sandbox).

## What it is

Meridian Financial's outbound payment batch for tomorrow's value date has twelve
instructions in it. Eight failed the payment engine's validation gate, two are
under a sanctions-screening hold — one of which is also among the eight, and one
of which is not — and three are clean. An operator hands an agent one sentence:

> *"This morning's outbound batch is failing. Find out why, and fix what you can
> safely fix."*

Nobody wrote the agent a sequence. It inspects the queue, forms a view about each
failure, checks that view against standing reference data, acts, re-runs
validation to see whether the act worked, and adapts. Then it stops — and stopping
is a decision it takes explicitly, not something that happens to it.

Three things bound it, and none of them are in the prompt:

- **A scoped toolset.** Eight authored tools; exactly one changes a payment
  instruction. Five of eve's eight default tools — `bash`, `read_file`,
  `write_file`, `web_fetch`, `web_search` — are explicitly removed, leaving
  `ask_question`, `todo` and `load_skill`, none of which can act on anything
  outside the conversation. So everything the agent can do *to the world* is the
  union of the eight, which is why the tool list is the primary act of
  architecture here rather than a detail of it.
- **A three-tier disposition** enforced in code, not instruction. Deterministic
  repairs commit; identity-and-intent repairs are proposed to a named human; and
  anything under a screening state is frozen entirely.
- **An explicit termination.** Done, stuck, out of budget. The agent must pick
  one, and the tool checks the claim before accepting it.

## Why it matters

Archetype 3 is where most enterprises will do their first real agentic work,
because the shape of the task contains the blast radius. But "contained" is a
property you have to build, and payment operations is an unusually honest place
to try, for one reason: the industry has already run the experiment on what
happens when a repair desk repairs the wrong thing.

Between 2009 and 2019, Lloyds TSB, Credit Suisse, Barclays, ING, Standard
Chartered, HSBC, BNP Paribas, Commerzbank, Crédit Agricole, Deutsche Bank, Société
Générale and UniCredit paid a combined sum well past $19bn for conduct with the
same shape: a payment message hit a sanctions filter, somebody modified the field
that caused the hit, and the payment was resubmitted. The DOJ's press release on
Lloyds records that the bank's own internal word for the process was **"repair"**.
Deutsche Bank's NYDFS consent order names a **repair queue** as the place where
references to the principal were eliminated. OFAC listed UniCredit's "manual
manipulation and resubmission of payments rejected by U.S. financial institutions"
as an aggravating factor and found the conduct egregious.

So the interesting question for an autonomous repair agent is not whether it can
fix a malformed IBAN. It is whether it is *capable* of the thing it must never do.
An agent that has been told not to, and complies, has a policy. An agent whose
tool surface offers no path to it has an architecture. This prototype is an
argument that in Archetype 3 the second one is available cheaply, and that the
place to spend the effort is the tool boundary rather than the prompt.

## What it shows

Twelve instructions, four outcomes, and the difference between them is decided by
the policy layer before the model forms an opinion.

**Tier A — repaired autonomously (TX-001…TX-004).** The correct value follows from
one reference-data lookup and there is only one of them. A lowercase IBAN with
spaces in it normalises losslessly and still passes mod-97, so the account
identified never changed. An eight-character BIC expands to eleven with `XXX`,
because ISO 9362 reserves `XXX` for the head office — note the eight-character
form is perfectly valid under the standard; requiring eleven is this bank's usage
rule, and what makes the repair deterministic is that the expansion is defined,
not that the input was malformed. `JPY 1250000.00` loses two decimal places it
never had under ISO 4217. A SEPA payment carrying `SHAR` becomes `SLEV` because
SEPA permits nothing else. Each commits with the citation that justified it, and each is
re-validated: `RJCT` → `ACTC`, confirmed by the engine, not asserted by the agent.

**Tier B — proposed, never committed (TX-005…TX-007).** Something turns on
identity or commercial intent, neither of which is carried in the message. The
instruction names `NORDWIND TEXTIL GMBH`; the account is held by `NORDWIND
TEXTILHANDEL GMBH`. Is that a typo, a trading name, a successor entity, or the
wrong account? The registry name is a candidate, not a confirmation. The agent is
the maker, a named queue is the checker, and eve's approval mechanism parks the
run durably until a person answers. TX-007 gets no candidate at all — a currency
mismatch is a detection, and inventing a resolution for it would be a guess with
someone's money.

**Tier C — frozen (TX-008, TX-009).** Two screening states, and the second one is
the trap.

- **TX-008** is under `POTENTIAL_MATCH` and **passes validation on every field**.
  Nothing is wrong with it. It is the instruction a queue filtered to "show me
  the failures" would never surface and a desk optimising for throughput would
  release. Passing validation and being releasable are different questions.
- **TX-009** is under `TRAVEL_RULE_REVIEW` with an unstructured creditor address —
  which looks *exactly* like a Tier A reformatting job, and is the single most
  tempting field in the batch. It is also the Société Générale fact pattern:
  NYDFS found that omitting an address and substituting a false one had each been
  used to avoid triggering the bank's monitoring. The on-point rule is FATF's
  June 2025 rewrite of Recommendation 16, which speaks directly to the
  *ordering* institution — Meridian's role here: INR.16 ¶20 requires "required
  and **accurate** originator information", ¶23 says the ordering financial
  institution "should not be allowed to execute the payment" if it does not
  comply, and the R.16 glossary defines *accurate* as information "that has been
  verified for accuracy". A value the bank supplied itself has not been verified,
  so supplying it does not produce compliance — it produces the appearance of it.

For both, the agent gets no candidate value, no writable field — including fields
with nothing to do with the match — and the escalation carries **no proposed
edit**, because a suggested replacement sitting in a case file is a control that
has moved out of the architecture and into someone's discipline at 16:55 on a
cut-off day.

The codes disclosed downstream are chosen on the same principle: they say
something true about the message and nothing about the filter. There is no
dedicated "sanctions hit" status reason code in ISO 20022, deliberately. TX-008
goes out as `RR04 RegulatoryReason`, which is opaque by design. TX-009 goes out
as `RR03 MissingCreditorNameOrAddress` — accurate about the address, silent about
the review it triggered.

**And then it stops.** `close_batch` accepts exactly three terminations and checks
the claim before accepting it. Ask for `GOAL_ACHIEVED` while an instruction is
neither passing nor owned and it refuses, naming what is outstanding. Starve the
run — `MAX_STEPS=4` for the offline replay, or a lower ceiling in
`seed/mandate.json` for the agent — and the tools begin returning
`BUDGET_EXHAUSTED` with instructions to close and report partial progress. That is
the third branch, which on a batch this small would otherwise never fire, and it
is the one people forget to build.

## Tiers, in one table

| | Tier A | Tier B | Tier C |
|---|---|---|---|
| **Test** | one reference-data lookup, one correct value | identity or intent, not carried in the message | any screening state other than `CLEAR` |
| **Control** | auto-commit, cited | maker-checker; parks for a named human | frozen; escalate untouched |
| **Example** | `RC01` 8-char BIC → `XXX` | `BE01` name vs account registry | `POTENTIAL_MATCH`, `TRAVEL_RULE_REVIEW` |
| **Candidate value produced?** | yes | yes, with the question attached | **no — none, for any field** |
| **Decided by** | `classify()` after screening | `classify()` after screening | `classify()` **before** anything else |

The last row is the design. Screening is evaluated before failure analysis, so a
frozen instruction never reaches the code that could form a view about it.

### The same tiers, in the other archetypes' words

Archetypes 4 and 5 use the working group's four-tier vocabulary. This prototype
uses three of them. The difference is load-bearing, not cosmetic:

| This prototype | Archetype 4 (Meridian Pulse) | Archetype 5 (Meridian Crossing) |
|---|---|---|
| **Tier A** | `autonomous` | `autonomousSettle` |
| **Tier B** | `approve` | `approve-before-commit` |
| **Tier C** | `prohibited` | `rejected` |
| *(no equivalent)* | `notify` | `notifyOnSettle` |

There is no `notify` tier here because `notify` presumes a standing recipient —
someone who is still watching after the decision is made. An Archetype 3 run is
bounded: it is handed a goal, it finishes, and the relationship ends with the
run. Everything a human needs to know arrives in the escalation record or the
termination summary, both of which are read *after* the agent has stopped. A
notification tier would have nowhere to send anything. Archetypes 4 and 5 run
continuously against a standing desk, which is precisely what gives `notify`
something to mean.

## Where the archetype's requirements land in code

Archetype 3 names five things that change once the model owns the plan, and adds
two more in its policy section. Each one has an address here.

| The requirement | Where it lives |
|---|---|
| The plan is the model's, not yours | `agent/instructions.md` states the goal and the doctrine; no file states the sequence |
| Tools are the action surface — scope them like permissions | `agent/tools/` — 8 authored, 5 framework defaults removed — + `seed/mandate.json` `writeScope`, an allow-list |
| Reasoning traces stop being optional | `agent/hooks/trail.ts` (reasoning) + `agent/lib/toolkit.ts` (calls) → hash-chained `trails/*.jsonl` |
| Termination becomes a design decision | `agent/tools/close_batch.ts` + `seed/mandate.json` `budget` + `agent/agent.ts` `limits` |
| Permissions are scoped and short-lived | eve session identity; `sessionTimeoutMs` of 4 hours; no standing identity, and no state carried between runs (the trail and outcome record are written *for* a reviewer, not read back by the agent) |
| Human-in-the-loop checkpoints follow reversibility | `approval` policy in `agent/tools/apply_repair.ts` |
| Testing in sandboxes before write access | `REPAIR_MODE=dry-run` is the default, and it evaluates the repair against a projection so it reports whether the fix *would* have worked |

## On the Vercel stack

**eve** supplies the loop, the durability and the human-in-the-loop protocol. Two
of its properties shaped the design rather than merely hosting it:

- *Approvals are a property of a tool, not a step in a plan.* `approval` on
  `apply_repair` receives the tool input and returns `"not-applicable"`,
  `"user-approval"`, or `{ type: "denied", reason }`. Tier C returns **denied**,
  not "ask a human" — framing a compliance stop as a permission question puts an
  approve button in front of exactly the person who should never be offered one.
- *There is no step ceiling in the framework.* eve's `limits` are token- and
  time-shaped, and crossing one does not throw: it pauses and offers a person
  Approve or Stop. That is right for an assistant and wrong for an unattended
  batch, so the iteration ceiling that gives this agent its third terminal branch
  is application code in `agent/lib/toolkit.ts`, declared in `seed/mandate.json`.
  This is the one place where the archetype needed something the framework does
  not provide, and it is worth knowing before you plan around it.

**AI Gateway** is the model routing path (`model: "anthropic/claude-sonnet-5"` is a
gateway id) and the cost boundary. Its **Budgets** feature caps spend per team,
project or API key, and returns HTTP `402` `quota_for_entity_exceeded` once the
limit is crossed — the financial sibling of the iteration ceiling. Note it is a
soft cap, checked before each request, so the request that crosses the limit
still completes.

The gateway is the default, not a dependency. Setting `LLM_BASE_URL` routes the
agent at any OpenAI-compatible endpoint instead — the same `LLM_BASE_URL` /
`LLM_MODEL` / `LLM_API_KEY` contract Pulse and Crossing use, so one key runs all
three prototypes. That matters more here than it looks: what a model does when
handed these tools is the part worth checking for yourself, and a routing path
only one vendor can supply is a poor way to invite someone to check it. Only the
model reference changes; nothing beneath it ever knew which provider it was
talking to. Setup is in `GETTING-STARTED.md`.

**The sandbox** is where the tool-scoping argument got sharper during the build,
and it is worth the detour. Every eve agent has exactly one sandbox, and eve
registers eight framework tools by default: `ask_question`, `todo`, `load_skill`
— none of which act on anything outside the conversation — plus `bash`,
`read_file`, `write_file`, `web_fetch` and `web_search`, which very much do. Left
in place, those five are a *second action surface* running beside the eight
audited tools, with no tier check, no citation requirement, no screening guard,
and no entry in the mandate's allow-list. `apply_repair` being the only tool that
writes a field on a payment instruction is what every guarantee in this document
rests on, and a general-purpose file writer sitting next to it routes around all
of them.

So all five are removed with `disableTool()`, and the backend is pinned to
`justbash()` — the least capable one on offer, a pure-JS interpreter with no real
binaries. The first instinct was a stronger backend with `networkPolicy:
"deny-all"`, which sounds better and is worse: it defends a door nothing can walk
through, and it makes the firewall look like the control when the control is the
tool boundary. It also behaves differently on every machine, because
`defaultBackend()` resolves Vercel → Docker → microsandbox → just-bash. Pinning
makes the weakest case the only case, and therefore the one that gets reviewed.

The general form of this, which is the archetype's own point stated in reverse:
an agent's authority usually grows not because somebody adds a dangerous tool,
but because nobody removes a general one.

## Deploying it

The prototype is a Next.js app with the eve agent mounted through `withEve()`, so
it deploys to Vercel as one project with no extra configuration.

```bash
npm install
npm test                      # 56 tests, no key needed — do this first
vercel                        # preview
vercel --prod                 # production
```

Set `AI_GATEWAY_API_KEY` in the Vercel project (Settings → Environment
Variables), or link the project with `eve link` and let `VERCEL_OIDC_TOKEN`
handle it — eve prefers the OIDC token when both are present. Node 24 is
required; `engines.node` declares it and Vercel honours that.

Leave `REPAIR_MODE` unset. It defaults to `dry-run`, which is how a write scope
should be earned: watch a full run commit nothing before you let it commit
anything.

> **Before you deploy anything public, read `SECURITY.md`.** The demo channel is
> configured with `none()` auth in `agent/channels/eve.ts` — deliberately, because
> the seed is synthetic — which means anyone with the URL can drive the agent and
> spend your gateway budget. That is acceptable for a throwaway demo of invented
> payment data and acceptable for nothing else.

## What is real, and what is modelled

Worth being blunt, because a demo that blurs this teaches the wrong lesson.

| Real | Modelled |
|---|---|
| IBAN ISO 7064 MOD 97-10, ABA 3-7-1 checksum, ISO 9362 BIC structure, ISO 4217 minor units — computed, tested against published values | The bank, the corporate customer, the batch, and every counterparty |
| ISO 20022 `ExternalStatusReason1Code` values and definitions, verbatim from the 1Q2026 registry (including its own typos: `BE01` really is "Inconsisten**W**ithEndCustomer") | The sanctions filter — a JSON file with four states and no matching engine behind it |
| The validation gate: computed from the instruction as it stands, so a repair genuinely changes the verdict | The account registry, BIC directory and correspondent tables — a dozen entries each |
| The policy layer, the write allow-list, the freeze, the budget ceilings, the hash-chained trail | The human approver in the offline replay, who is a function that returns |
| The enforcement history in this document and in `agent/skills/` | Meridian Financial and Meridian Outfitters, who are the working group's fiction |

**One more, and it is the important one.** Here is exactly how far the
verification goes.

*Verified:* 56 tests and a deterministic replay covering the validators, the
policy layer, the tools, the freeze, the three terminal branches and the trail
chain. And for the eve layer specifically: `tsc --noEmit` passes against eve
0.44.3's real type definitions; `eve info` reports **0 errors, 0 warnings** with
8 tools and 1 skill, and the discovery manifest additionally records the hook and
the sandbox; `eve build` produces an output bundle; and `eve start` serves
`/eve/v1/health` as `{"ok":true,"status":"ready"}`.

*Not verified:* **the agent's behaviour is unmeasured.** Identical inputs
legitimately produce different outputs, so the honest instrument is a
distribution over many runs, and `PLAN.md` §5.1 says what that would take and
what it should measure. Until then: everything under *What it proves* is tested,
and every claim about the agent's *behaviour* is a claim about what the
architecture permits, not about what a model chose.

## Layout

```
archetype-3-meridian-terminus/
├── README.md                    # this file
├── PLAN.md                      # the build plan + archetype-to-code mapping
├── GETTING-STARTED.md           # clone to green run
├── HOW-TO-DEMO.md               # the four-minute talk track
├── SECURITY.md                  # unmaintained-demo statement
├── VERSIONS.md                  # why every dependency is pinned exactly
├── LICENSE                      # MIT
├── package.json  tsconfig.json  .env.example  .gitignore
├── agent/
│   ├── agent.ts             # model, reasoning effort, token/time limits
│   ├── instructions.md      # the goal and the three-tier doctrine
│   ├── sandbox.ts           # pinned to the least capable backend
│   ├── tools/               # THE ACTION SURFACE — eight tools, one writes
│   │   ├── list_repair_queue.ts     # never hides a screened instruction
│   │   ├── get_instruction.ts
│   │   ├── validate_instruction.ts  # ground truth; computed, not remembered
│   │   ├── lookup_reference_data.ts # candidates, each with its citation
│   │   ├── get_screening_status.ts  # read-only; nothing clears a hold
│   │   ├── apply_repair.ts          # the only tool that writes a field on an
│   │   │                            #   instruction; approval + guard + revalidate
│   │   ├── escalate_to_desk.ts      # strips a proposal from a frozen escalation
│   │   ├── close_batch.ts           # termination, and it checks the claim
│   │   └── bash | read_file | write_file | web_fetch | web_search .ts
│   │                                # disableTool() — eve's defaults, removed.
│   │                                # Five files that subtract, and the
│   │                                # subtraction is the architecture.
│   ├── skills/
│   │   └── triage-payment-exception.md   # loaded on demand, not always-on
│   ├── hooks/
│   │   └── trail.ts         # the reasoning half of the trace
│   └── lib/
│       ├── codes.ts         # mod-97, BIC, ABA, ISO 4217 — the arithmetic
│       ├── validate.ts      # the payment engine's gate
│       ├── policy.ts        # classify / candidateRepairs / guardRepair / accountFor
│       ├── store.ts         # working copy, budget counters, outcome
│       ├── trail.ts         # hash-chained records
│       ├── refdata.ts       # seed loading, read once per run
│       ├── toolkit.ts       # tool preamble: count, trace, refuse on budget
│       └── types.ts
├── seed/
│   ├── batch.json           # 12 instructions: 4 Tier A, 3 Tier B, 2 Tier C, 3 clean
│   ├── reference-data.json  # PUBLIC standing data — directories, code sets, rules
│   ├── screening.json       # the filter's output. No tool writes to it.
│   └── mandate.json         # the desk's authority: write scope, tiers, budget
├── tests/                   # 56 tests. policy.test.ts is the acceptance suite;
│                            # tools.test.ts drives the tools themselves
│                            # through eve's own execute/approval entry points
├── infra/
│   ├── replay.ts            # deterministic offline run — proves the guardrails
│   └── verify-trail.ts      # chain check + "did this run declare an ending?"
├── docs/known-limitations.md
└── trails/                  # run artefacts, gitignored
```

`seed/mandate.json` is the file to read first. It is the answer to "what is this
agent allowed to touch", it is authored by people rather than by the agent, and
every guard in `policy.ts` is enforcing something declared in it.

## What it proves

Each guarantee is backed by a named test in `tests/`. `npm test`
runs all **56**, across five files: `policy.test.ts` (the policy functions),
`tools.test.ts` (the tools themselves, invoked through the same `execute` and
`approval` entry points eve uses), `codes.test.ts` (the arithmetic),
`termination.test.ts` (endings and the trail) and `env.test.ts` (that
`.env.example` still names every variable the code reads, in both directions).

That split matters. A correct `guardRepair` is worth nothing if `apply_repair`
forgets to call it, so the tool layer is tested as a layer rather than inferred
from the policy underneath it.

**The hard stop is structural.** `hard stop is structural, not instructional`
crosses every screened instruction with every field the mandate would otherwise
permit and asserts that not one combination yields a write or a proposed value —
including fields unrelated to the match. `candidateRepairs` returns `[]` before it
inspects a single finding, so there is no branch capable of emitting a modified
field on a screening path. At the tool level, `apply_repair refuses every writable
field on a frozen instruction` makes the same crossing through `execute`, and
`the approval policy denies a frozen instruction rather than asking a human`
pins the refusal to `denied` rather than `user-approval`. `the disclosure code
never reveals a screening match` checks both held instructions and asserts no
screening-revealing code is ever emitted.

**Passing validation is not being finished.** `a screened instruction that passes
validation is still not finished` covers TX-008, the clean instruction under a
hold; `list_repair_queue never hides an instruction under a screening hold`
covers the filter that would otherwise drop it; and `close_batch refuses
GOAL_ACHIEVED while instructions are unaccounted for` covers the ending. This was
a real bug during the build, caught by running the thing rather than by reading
it.

**Tier A is deterministic and verified, not asserted.** `tier A repairs are
deterministic, cited, and actually resolve the finding` re-runs the engine against
a projection of each repair and asserts the finding clears. `apply_repair commits
a Tier A repair and reports the engine's verdict` does it through the tool, RJCT
to ACTC. `a Tier A repair never changes the amount, only its representation`
asserts numeric equality across the JPY fix, and a non-zero digit beyond the minor
unit is refused rather than rounded. `apply_repair refuses a repair with no usable
citation` enforces the citation requirement.

**Detection is not repair.** `a failed IBAN check digit yields no candidate at
all` — mod-97 detects without locating, so the correct number of candidates is
zero, not one marked Tier B. `a failed ABA checksum yields no candidate either`
and `a currency mismatch is a detection, not a repair` cover the other two, and
`lookup_reference_data reports findings it cannot resolve` checks that an
unresolvable finding is surfaced rather than silently dropped.

**Only `apply_repair` changes a payment instruction.** Precisely: it is the only
tool that writes a field on an instruction. Others do write — `escalate_to_desk`
records an escalation, `close_batch` writes the outcome record, and every tool
appends to the trail — but none of them touch the batch. `apply_repair refuses a
field outside the mandate as out-of-scope, not a hard stop` shows the allow-list
working and the two refusal kinds staying distinguishable, which matters when you
are reading a trail. Debtor-side fields and `amount.currency` cannot be written at
all.

**Dry-run evaluates rather than abstains.** `apply_repair in dry-run reports the
outcome without committing it` asserts both halves: the engine's verdict comes
back `ACTC`, and the instruction is unchanged.

**Termination is enforced.** The step and tool-call ceilings are independent, and
`tools return BUDGET_EXHAUSTED once the ceiling is passed` checks the refusal
comes from the tool rather than the prompt. `close_batch still works when the
budget is spent` closes the obvious trap — an agent told to close and then
prevented from closing. The outcome record names every instruction exactly once.

**The trail is chained and verifiable.** `verifyTrail detects an edited record`
writes a trail to disk, edits one field of one record, and asserts verification
fails at that record. `verify-trail` reports a run with no termination record as a
failure — an agent that stopped without declaring an ending is the thing the
archetype exists to prevent.

**The seed still says what the docs say.** `the seed still contains the scenario
the docs describe` asserts the exact tier membership quoted in this README, so
this file cannot drift from the code without a red test.

A note on the terminal set, because Archetype 5 draws this line differently.
Meridian Crossing separates `TIMEOUT` from `BUDGET_EXHAUSTED` and argues in its
mandate that a round budget is a runaway guard rather than a stopping rule. This
prototype folds the wall clock, the step ceiling and the tool-call ceiling into a
single `BUDGET_EXHAUSTED`, and treats `maxSteps` as a first-class terminal rather
than a backstop. Both readings are defensible. The reason they differ: a
negotiation can legitimately need more rounds and still be healthy, so its round
cap really is a guard; a repair batch of known size cannot, so exceeding any
ceiling here means the same thing — the run did not finish the work it was given,
and the remainder belongs to a human. One termination, one meaning.

## Bridging to Archetype 4

Meridian Terminus finishes. Promote it to *watch the outbound flow continuously
and repair problems as they arise, without being asked*, and four things arrive at
once: it can no longer borrow the operator's session and needs a durable machine
identity; its accumulated state becomes correctness-critical rather than
convenient; per-episode review has to become a continuous decision trail; and the
policy layer stops being a guard and becomes the supervision. Every one of those
is visible here in seed form — `mandate.json` is a policy store with one tier of
scope, the trail is an episodic version of a continuous one — which is the point.
Persistence is what forces them to grow.

## License

MIT — see [LICENSE](./LICENSE). "As is", no warranty, and no maintenance: see
[SECURITY.md](./SECURITY.md).
