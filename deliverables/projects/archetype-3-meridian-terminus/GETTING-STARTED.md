# Getting started

From clone to a green run. The offline path needs no API key and no network — do
that first, because it is what the test claims rest on.

## Prerequisites

| | Version | Needed for |
|---|---|---|
| Node.js | **22.6+** | tests and the offline replay (native TypeScript stripping) |
| Node.js | **24+** | eve itself — `eve dev`, `eve build`, `eve deploy` |
| An AI Gateway key | — | running the actual agent; nothing else |

Two floors on purpose. The tests and the replay use only `node:test` and native
type stripping, so a reviewer can check the security properties on a machine that
will never run the agent. `package.json` declares `>=24` because that is eve's
floor, not the prototype's.

```bash
node --version   # v22.6.0 or newer for the offline path
```

## 1. Install

```bash
npm install
```

Versions are pinned exactly (`eve` 0.44.3, `ai` 7.0.78, `zod` 4.4.3, `just-bash`
3.4.2). eve is in beta and its APIs move; an unpinned install is how a working
prototype becomes a broken one between two demos.

## 2. Run the tests

```bash
npm test
```

Expect **54 passing** across four files. The one to read is `hard stop is
structural, not instructional` in `tests/policy.test.ts` — it crosses every
screened instruction with every field the mandate would otherwise permit and
asserts that not one combination yields a write or a proposed value.

`tests/tools.test.ts` is the one worth knowing exists. It imports the real tool
modules and invokes their `execute` and `approval` members — eve's own entry
points — rather than testing the policy functions underneath and inferring the
rest. A correct `guardRepair` is worth nothing if `apply_repair` forgets to call
it.

`tests/policy.test.ts` also carries `the seed still contains the scenario the docs
describe`, which pins the exact tier membership quoted in `README.md`. If you
change the seed, that test goes red before the documentation goes stale.

## 3. Run the offline replay

```bash
npm run replay            # dry-run: computes and traces, commits nothing
npm run replay:commit     # commits repairs to the working copy
npm run replay:starved    # MAX_STEPS=4 — the BUDGET_EXHAUSTED branch
```

`npm run replay:commit` should end:

```
termination      GOAL_ACHIEVED
steps            12   tool calls 18
repaired         TX-001, TX-002, TX-003, TX-004
escalated        TX-005->CLIENT-SERVICE(CH21), TX-006->CLIENT-SERVICE(BE01),
                 TX-007->TREASURY-OPS(AM03), TX-008->SANCTIONS-L2(RR04),
                 TX-009->SANCTIONS-L2(RR03)
still failing    TX-005, TX-006, TX-007, TX-009
untouched        TX-010, TX-011, TX-012
```

Three lines are worth stopping on.

**TX-008** reads `ACTC ... <- clean on every field, still not releasable`. It
passes validation completely and is still escalated, because it is under a
screening hold. Passing validation and being releasable are different questions.

**TX-008 and TX-009** both show:

```
        probe apply_repair(creditor.postalAddress) -> REFUSED [hard stop]
        candidates offered: 0 (expected 0)
```

The replay *deliberately attempts* a repair on a frozen instruction, because a
control you never exercise is a control you are only assuming you have.

**`still failing` and `escalated` overlap on purpose.** An escalated instruction
is accounted for without being fixed. That is the whole point of the third
column: the goal is not "everything passes", it is "nothing is simply left".

### The replay is not the agent

`infra/replay.ts` drives the **policy layer** with a fixed operator. It proves
what the guardrails do and nothing about what a model would decide. Its own header
says so; keep saying so.

It also does not import the tools — it calls `guardRepair` and `candidateRepairs`
directly, so `probe apply_repair(...)` above is a label for what the tool would
do, not a call into it. The tools have their own suite in `tests/tools.test.ts`,
and that separation is deliberate: a run that mixed the two would let a tool-layer
regression hide behind a passing policy check.

## 4. Verify a trail

```bash
npm run verify:trail
```

```
OK   trails/replay-1787619682339.jsonl
     19 records  {"goal":1,"reasoning":9,"tool-result":4,"approval-requested":2,"refusal":2,"termination":1}
     ends: Run closed: GOAL_ACHIEVED
```

A run with no `termination` record is reported as a **failure**, not a warning. An
agent that stopped without declaring an ending is precisely what this archetype
exists to prevent.

Read one:

```bash
cat trails/*.jsonl | head -5
cat trails/*.outcome.json
```

## 5. Check the eve layer — still no key needed

Needs Node 24+, but not a model. This is as far as verification goes without one,
and it goes further than you might expect.

```bash
npx eve info      # discovery: 8 tools, 1 skill, 0 errors, 0 warnings
npx eve build     # produces .output/
npx eve start &   # then:
curl http://127.0.0.1:3000/eve/v1/health
# {"ok":true,"status":"ready","workflowId":"workflow//eve//workflowEntry"}
```

`eve info` is the first thing to run when anything behaves oddly — a tool that
silently failed to register shows up there rather than in the model's behaviour.

The tool count is **8**, not 13 — `eve info` counts authored tools, and the five
`disableTool()` files subtract rather than add. Be precise about what the model
sees, though: those eight plus three framework tools eve keeps registered
(`ask_question`, `todo`, `load_skill`), none of which can act on anything outside
the conversation. The five that could — `bash`, `read_file`, `write_file`,
`web_fetch`, `web_search` — are gone. Confirm it yourself:

```bash
node -e "console.log(require('./.eve/compile/compiled-agent-manifest.json').disabledFrameworkTools)"
# [ 'bash', 'read_file', 'web_fetch', 'web_search', 'write_file' ]
```

## 6. Run the agent

This is the part that needs a key, and the part that has not been run in anger —
see *What is real, and what is modelled* in `README.md`.

```bash
cp .env.example .env   # .env, matching Meridian Pulse and Meridian Crossing
# set AI_GATEWAY_API_KEY, or run `eve link` to pull VERCEL_OIDC_TOKEN
npm run dev
```

### Or point it somewhere that is not AI Gateway

A gateway credential is the default, not a requirement. Set `LLM_BASE_URL` and
the agent routes to any OpenAI-compatible endpoint instead — the same three
variables Meridian Pulse and Meridian Crossing use, so a reviewer with a key for
any provider can run all three:

```bash
LLM_BASE_URL=https://openrouter.ai/api/v1 \
LLM_API_KEY=sk-or-v1-... \
LLM_MODEL=openai/gpt-5.4 \
npm run dev
```

Only the model reference moves. The tools, the mandate, the tier policy and the
terminals never knew which provider they were talking to.

Two things that will catch you out:

- **The endpoint's own model namespace applies.** `openai/gpt-5.4` is an
  OpenRouter id, not a gateway one; Bedrock behind a shim wants something else
  again. A residency-constrained endpoint narrows it further — `us.openrouter.ai`
  serves 41 models against the global catalogue's several hundred, all of them on
  US provider endpoints (`azure/us`, `amazon-bedrock/us`, `google-vertex/us-east5`).
  Check yours before assuming a model id resolves:
  `curl -s $LLM_BASE_URL/models -H "Authorization: Bearer $LLM_API_KEY"`.
- **Region-scoped keys need the region host.** An OpenRouter key whose workspace
  guardrail names a data region rejects `openrouter.ai` with a `403` naming the
  hostname it does want — use that host (e.g. `https://us.openrouter.ai/api/v1`).
  A `401 User not found` means the opposite problem: the host is reachable and
  the key is not valid there.

`eve dev` starts on port 2000 with a terminal UI. Give it the goal:

```
This morning's outbound batch is failing validation. Find out why,
and fix what you can safely fix.
```

Then watch which tool it reaches for first. Nothing tells it to start with
`list_repair_queue`, and nothing tells it the order to work the queue in.

To commit repairs rather than dry-run them, set `REPAIR_MODE=commit` in
`.env`. Start in dry-run. That is not ceremony — it is how the archetype
says you earn a write scope.

### If something breaks on first run

Check `eve info` first — it prints the discovered surface and its diagnostics,
and a tool that silently did not register shows up there rather than in the
model's behaviour. The most likely failures are an eve API that moved since
0.44.3 and a `defaultBackend()` that resolved to `just-bash` on a machine with no
Docker daemon (see below).

## Environment variables — full reference

Every variable the code reads. `.env.example` is committed and must stay in sync.

| Variable | Default | Effect |
|---|---|---|
| `AI_GATEWAY_API_KEY` | unset | AI Gateway credential for string model ids. Not needed for tests or replay. |
| `VERCEL_OIDC_TOKEN` | unset | Alternative gateway auth; `eve link` pulls it into `.env`, 12-hour lifetime. |
| `LLM_BASE_URL` | unset | Set it to route the agent at an OpenAI-compatible endpoint instead of AI Gateway. Unset means the gateway, which is what the deployed demo uses. |
| `LLM_MODEL` |  `openai/gpt-5.4` | Model id in the endpoint's own namespace. Read only when `LLM_BASE_URL` is set. |
| `LLM_API_KEY` | unset | Credential for that endpoint. Read only when `LLM_BASE_URL` is set. |
| `REPAIR_MODE` | `dry-run` | `commit` writes repairs to the working copy. Anything else is dry-run. |
| `MAX_STEPS` | unset | Overrides the mandate's step ceiling. Replay harness only. Set to 4 for the budget branch. |
| `PORT` | `2000` | `eve dev` port. |
| `EVE_TRACES_CONTENT` | off | Captures model/tool I/O in eve's own local traces. Left off deliberately — the trail already records what the desk needs, and turning this on puts a second, unchained copy of the same payment data on disk. |

## Knobs worth turning

**Change the mandate.** `seed/mandate.json` `writeScope.repairableFields` is an
allow-list. Remove `chargeBearer` from it and TX-004 becomes unrepairable —
without touching a line of agent code. That is the archetype's point about tool
and scope governance being a reviewable event.

**Break a premise.** Set TX-001's IBAN check digits wrong and watch it move from
Tier A to Tier B with zero candidates offered. The line between the tiers is
arithmetic, not confidence.

**Flip a screening state.** Set TX-009 to `CLEAR` in `seed/screening.json` and the
address becomes an ordinary `BE04` finding. This is the honest version of the
demo: the freeze is doing real work, and you can see the counterfactual.

## Troubleshooting

**`ERR_UNKNOWN_FILE_EXTENSION` or a TypeScript syntax error on `npm test`.** Node
is older than 22.6, so native type stripping is unavailable. Upgrade.

**`npm install` warns `EBADENGINE`.** Node is below eve's floor of 24. The tests
and replay still work; `eve dev` will not.

**`npm run verify:trail` says no trails found.** Run `npm run replay` first.
`trails/` is gitignored — the artefacts are per-run and contain payment data.

**`eve start` fails with "the just-bash sandbox backend requires the `just-bash`
package".** It is in `dependencies`; re-run `npm install`. Every eve agent has
exactly one sandbox, and this one deliberately pins the weakest backend — see
`agent/sandbox.ts` for why, and note that the sandbox is unreachable regardless,
because `bash`, `read_file`, `write_file`, `web_fetch` and `web_search` are all
disabled.

**"Why are there five tool files that do nothing?"** `agent/tools/bash.ts` and
its four siblings are `disableTool()` — they remove eve's default general-purpose
tools. They look like dead code and are load-bearing: deleting them restores a
second action surface with none of this prototype's gates on it. See the
invariants list in `docs/known-limitations.md`.

**A repair was refused with "must name the reference-data entry".** Working as
intended: `apply_repair` requires a citation, and the agent is expected to call
`lookup_reference_data` before it writes.

## Layout and deeper reading

- `README.md` — what it is and what it proves
- `PLAN.md` — the decisions and what a second pass would add
- `HOW-TO-DEMO.md` — the four-minute talk track
- `docs/known-limitations.md` — accepted prototype debt, and
  the invariants not to "fix" while working on something else
- `seed/mandate.json` — read this first; every guard in
  `policy.ts` enforces something declared there
