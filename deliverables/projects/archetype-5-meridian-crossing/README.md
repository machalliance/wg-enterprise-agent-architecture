# Multi-Agent Inventory Purchasing: Cross-Organization Agent Negotiation

Reference prototype ("Meridian Crossing") for **Archetype 5: collaborating, self-directed agents**. Agents from different
organizations, with opposed interests, negotiate a real commercial outcome across a trust substrate
no single party controls.

This document is the high-level overview — what the prototype is, why it matters, and what it
demonstrates — with a quick start below. For the full setup path see
**[`GETTING-STARTED.md`](GETTING-STARTED.md)**; to present it, see
**[`HOW-TO-DEMO.md`](HOW-TO-DEMO.md)**. For what it deliberately does *not* do — the accepted
architecture debt and the three places the wire or the artifact diverges from the standard it claims —
see **[`docs/known-limitations.md`](docs/known-limitations.md)**.
The narrative write-up is
**[`docs/when-your-agent-negotiates-against-someone-elses.md`](docs/when-your-agent-negotiates-against-someone-elses.md)**.

> **This is an unmaintained demo — do not deploy it, and use it at your own risk.** No security patches, no
> advisories, no support, and it is provided "as is" under MIT. See **[`SECURITY.md`](SECURITY.md)**.

## Quick start

Requires **Node ≥ 22**, **pnpm**, and **Docker** (for the agent directory).

```bash
pnpm install
cp .env.example .env.local             # then set STRIPE_SECRET_KEY=sk_test_... — required by --usdc
pnpm demo --web --usdc                 # then open http://localhost:41200 and press Start
```

Configuration lives in **`.env.local`** (gitignored — it holds your real keys). `.env.example` is the
committed template listing every variable the code reads, with its default; every line is commented out,
so a fresh copy changes nothing. The run commands load it automatically. A shell variable still wins over
the file, so `NEGOTIATION_SEED=rehearsal pnpm demo --web` remains a valid one-off.

| command | what it does |
| --- | --- |
| `pnpm demo --web --usdc` | the full demo: dashboard + Stripe USDC settlement. **Start here.** |
| `pnpm demo --web` | dashboard, no money layer (see the caveat below) |
| `pnpm demo` | terminal only; runs immediately, no dashboard |
| `pnpm test` | the full suite — unit, in-process integration, and one end-to-end run over real HTTP |
| `pnpm sample` | sample the outcome *distribution* in-process — the tool for measuring LLM behaviour |
| `pnpm demo:reset` | clear the trails so the next run starts clean |

**`--usdc` is what exercises the human-approval step.** Without it the run is correct and complete but
the agent is never *required* to ask anyone anything, because the approval gate lives in the settlement
layer. See the note in [`packages/dashboard/RUNBOOK.md`](packages/dashboard/RUNBOOK.md).

**`--usdc` needs a Stripe test-mode `STRIPE_SECRET_KEY`.** The settlement layer only mounts when both
the flag and the key are present, so with the flag alone the demo still runs — it just silently drops
back to the `--web` behaviour, with no USDC settlement and no human-approval step. That is the one
combination that looks like it worked and did not.

Optional: set `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` in `.env.local` to have both sides reason with
a model instead of the deterministic reasoners. With no LLM configured the demo runs entirely offline and
reaches the same outcome every time. Full setup detail is in
**[`GETTING-STARTED.md`](GETTING-STARTED.md)**.

## What it is

A buyer agent (Meridian) has an inventory shortfall it must cover. Four supplier agents — from four
separate organizations — can each fill it. The buyer **discovers** the suppliers through a real agent
directory, **cryptographically verifies** who they are, **negotiates** price/quantity/lead-time with
each one over a turn-taking protocol, and **governs** what it may commit to against a private mandate.
No orchestrator sits between the parties: each organization runs its own process, keeps its own
records, and speaks only through signed messages.

The counterparties have genuinely opposed interests — the buyer wants the lowest defensible price, the
suppliers want the highest — and none of them trusts the others by default. That adversarial framing is
the point: it is what forces real identity verification, a real negotiation contract, and a private
policy layer, rather than the cooperative hand-waving that a single-owner multi-agent system can get
away with.

## Why it matters

Most "multi-agent" systems are one owner's agents cooperating inside one trust boundary. The hard,
unsolved version — and the one enterprises actually face — is agents from **different** organizations
transacting across boundaries none of them controls. That raises problems a single-owner system never
has to answer:

- **Who is this counterparty, really?** Identity has to be cryptographic and portable, not a name in a
  config file.
- **What is my agent allowed to commit me to?** Authority has to live in a private policy the other
  side can neither see nor influence.
- **What happens when interests conflict?** The interaction needs a real contract — a state machine
  both sides enforce — so a bad move is *rejected*, not just discouraged.
- **Can either side prove what was agreed?** Accountability has to be reconstructable from each party's
  own records alone, with no shared database to trust.

Meridian Crossing is a working answer to each of those, built on open standards (W3C DID/VC, an AGNTCY
agent directory, A2A messaging, and an alignment path to the A2CN negotiation standard) rather than a
bespoke stack.

## What it shows

Four suppliers, four deliberately different outcomes — the same buyer logic reaching a different
ending for each, depending only on the counterparty:

- **Summit (cooperative)** concedes into the buyer's mandate envelope and holds the **lowest floor in
  the scenario** ($86), so it would take any price war pushed all the way down → terms the buyer can
  **settle autonomously**, with a single signed `ACCEPT` and no human involved. Whether it is the supplier
  actually committed to is settled against Cascade at the commit barrier, below.
- **Cascade (competitive)** is the **rival**, and the only agent whose job is to squeeze another
  supplier rather than the buyer. It opens *below* Summit and concedes faster, so the buyer has a live
  cheaper quote to push back with — but floors *above* Summit ($89), so Summit still wins a war the buyer
  is willing to finish. In the **deterministic run Cascade wins at $91.68/u**, beating Summit's $92.24
  best-and-final; under an LLM the buyer uses Cascade's price as leverage and Summit, which can go
  deeper, often takes the deal instead in the high $80s.
- **Alpine (firm)** holds a floor ($95) *above* the buyer's bid ceiling but still inside its reservation
  price → the buyer **cannot settle it on its own authority**. What happens next depends on the field: when
  a better in-policy offer exists it **stands down** (what the default run shows, once Cascade wins the
  commit barrier); when *nothing* is in policy it **escalates** to a human and nothing is committed until an
  operator approves. Under an LLM it often never even reaches its floor — holding near $100, it exhausts
  the buyer's round budget while still above the reservation, and the buyer **walks away** instead. Alpine
  never settles either way.
- **RidgeLine (adversarial)** looks best on paper but its identity does not check out → the buyer
  **rejects it at the trust gate** and never negotiates with it at all. (Admitted deliberately in the
  test suite, it oscillates around its opening rather than conceding, and the buyer **walks away early** —
  well inside its round budget — because the counterparty stopped moving.)

Cascade is there because its absence was **measurable**. With only a cooperative, a firm and a rejected
counterparty, none of the buyer's alternatives was ever cheaper than the offer in front of it — so the
buyer correctly concluded it had no leverage and settled at a mean of $91.88 against a $94 ceiling, 3 of
20 runs at the ceiling exactly. It was not negotiating badly; it had nothing to push with.

## Mandate & policy

A **private** policy engine decides what the buyer's agent may commit it to. The mandate holds the
book's **four tiers**, a **reservation price**, and a **cross-deal spend cap** — and it lives only in
the buyer process, never on the wire. Terms inside the envelope auto-settle; terms beyond it escalate
to a human; adversarial counterparties get walked away from; and the reservation price never leaves the
process (a lint test makes leaking it a *failing test*, not a code-review hope).

The judgment is one function, `classify(mandate, terms, trust)` (`packages/buyer/src/classify.ts`),
applied on every supplier turn:

- **Summit** and **Cascade** both converge into the tightest band → `AUTONOMOUS_SETTLE` → the buyer
  settles with a single signed `ACCEPT`, **no human**. Which of the two wins is decided at the commit
  barrier on public terms alone (Cascade at $91.68 in the deterministic run; often Summit, deeper, under
  an LLM).
- **Alpine** holds a floor inside the reservation but beyond the notify band → it concedes steadily enough
  to keep bargaining alive right up to the round budget, so *that* is what ends the thread →
  `APPROVE_BEFORE_COMMIT` → never committed on the agent's own authority. It is **held in the approval
  queue until an operator approves** when no in-policy offer exists, and **stood down** when one does (the
  default run, where the winning in-policy offer takes the commit barrier).
- **RidgeLine**, *if admitted as verified-but-adversarial*, never converges → the buyer sends
  `WALKAWAY{OUT_OF_TERMS}` as soon as the concessions stop, well inside its round budget. (By default it is
  still `REJECTED` at the trust gate, so it is never negotiated with — the walk-away is proven in the test
  suite, which admits it deliberately.)

Two different things can end a thread, and they are not interchangeable. The substantive one is that the
**counterparty stopped moving** — `budget.maxRounds` is a runaway guard behind it, and spending all 20
rounds on a counterparty that is visibly stonewalling would be the bug. That is why RidgeLine is dropped
almost immediately while Alpine, which keeps conceding until it reaches its floor, runs to the guard. The
causes are reported as distinct reason codes — `OUT_OF_TERMS` for a stall, `BUDGET_EXHAUSTED` for round
exhaustion, `TIMEOUT` for the wall clock — because §10 maps them to different A2CN terminal states, and an
operator auditing why Meridian walked reads the code rather than the prose.

Around that core sit the safeguards: a **kill switch** that walks every live negotiation and severs a deal
being held at the commit barrier, and reaches the money layer too — revoking the scoped payment
authorization and any reservation behind it — for every deal that has **not yet sent its `ACCEPT`**. That
bound is the whole contract: once the signed `ACCEPT` is out the buyer is bound and there is no post-`ACCEPT`
revocation window, which is why the barrier holds a deal to the last moment instead;
a **cross-deal spend cap** enforced *across* concurrent deals by a
shared commitment ledger; **suspend-on-disconnect** (a downed oversight channel blocks new
commitments); **counterparty reputation** (seeded, down-weighted on stalls/probes, can trigger early
walk-away); and a **relationship-drift** flag for a supplier whose settlements trend up over time even
while each single deal passes policy.

## Negotiation protocol

The buyer and each verified supplier run a real, turn-taking negotiation over **A2A** — RFQ, quote,
counteroffers on price/quantity/lead-time, and a terminal branch — with each side's reasoning bounded
by the message contract. This negotiation contract is the core of the prototype: it is what the whole
system is built to show.

Both sides run their **own copy of a shared turn-taking state machine** keyed by `negotiationId`: an
illegal move (a `COUNTER` after settle, a second `ACCEPT`) is rejected locally *and* by the receiver.
Negotiations with different suppliers run **in parallel** over independent state, with no cross-talk
between `negotiationId`s.

Those parallel deals meet at a **commit barrier** (`packages/buyer/src/commit-coordinator.ts`): no
supplier is committed to until *every* other negotiation has revealed its best-and-final, so the buyer
can never bind to one counterparty before it knows what another would have offered. Once every offer is
in, the rule is: **if any offer is within autonomous policy, commit the best of those and stand the rest
down — no human needed**; a person is pulled in only when *nothing* is in policy. The selection uses
public terms only (price, then tier, then lead time, then units), so the choice never depends on a
private mandate number.

### Leverage: the quote board

A barrier alone cannot *negotiate*. It learns each thread's position once, at the end, when that thread
has already stopped moving — too late to press with. So the buyer also keeps a **quote board**
(`packages/buyer/src/quote-board.ts`): the live set of offers suppliers have addressed to *it*, shared
between its own concurrent negotiation threads, so a thread can push against a rival's standing price
while there are still rounds left to change anything.

This is deliberately **not** the cross-org read this codebase deleted (an earlier `reconcile()` had the
buyer read a supplier's log off disk). Every entry is a quote a supplier sent to Meridian, held in
Meridian's own memory — so there is no signing, no trust gate and no envelope here, because nothing
crosses a boundary. A buyer comparing the offers it received is the entire reason anyone requests more
than one quote. The board is **racy by design**: what a thread sees depends on how far its rivals have
got, which is exactly the position a human buyer is in. Neither *seller* ever learns what its rival
quoted — the competition is felt only by the buyer.

Sellers also carry a private **disposition** drawn once per negotiation (`packages/agent-runtime/src/disposition.ts`)
— how badly this supplier needs the deal, whether it has another buyer, how close its quarter-end is.
Without it, five identical LLM runs settled at exactly the seller's floor every time: with no credible
walk-away, pressing cost the buyer nothing, so press-to-the-floor was simply correct. The fix is
explicitly *not* `if (random() < 0.3) walk` — a dice roll produces variation with no reason behind it, so
neither the trail nor a presenter can explain what happened. Situations differ; the agent then decides
sensibly given its situation.

### Measuring outcomes, not runs

Once either side reasons with an LLM, "did it work?" stops being a meaningful question: identical inputs
legitimately produce different outputs, so a single run tells you almost nothing. A sampling harness
(`infra/sample.mjs`) therefore runs the **real** negotiation code, seller engine, signing and verification
over an in-process channel and reports the outcome *distribution*. The findings quoted in this README came
from it — that the settle price was pinned to exactly one value; that adding a `hold` move took it to
three; that a supplier merely holding its price was being mis-scored as bad faith and walked away from.
None of those is visible in a single run, and collecting five data points by hand took ~20 minutes.
A second harness (`infra/sweep.mjs`) covers the ways the system can actually be *run* rather than the
prices it reaches. Both are documented in **[`GETTING-STARTED.md`](GETTING-STARTED.md)**.

It shares the parts of the orchestration that change the answer — one `Governor`, one `QuoteBoard`, one
`CommitCoordinator` — because without the barrier the negotiations simply *race*, and the recorded price
becomes "whoever got there first" rather than the best offer.

All five agents (buyer + four suppliers) can reason through **one shared OpenAI-compatible client** in
`agent-runtime` (Chat Completions + tool calling), pointed at any gateway. Each model move is clamped
onto the negotiation state machine and the mandate before anything is signed, and the model's free text
is never streamed — so the reservation price and cap never appear on any stream. With no gateway
configured, the agents fall back to deterministic reasoners and reproduce the same three endings offline
— an autonomous settle, a supplier held back from the agent's own authority, and a walk-away.

That clamp has **two** ceilings, and the second one is easy to miss. A buyer's counter may never exceed
its private `maxBidUsd` — *and* may never exceed the price the seller has already put on the table. Only
the first is a mandate bound; without the second, a reasoner that proposes a number worse than the
standing offer bids against itself and hands the counterparty margin it never asked for. Both are
enforced in one place, `boundedBid()` (`packages/buyer/src/strategy.ts`), for the deterministic and LLM
reasoners alike.

**The bound is symmetric.** A supplier likewise never counters *below* the buyer's standing bid — it
closes at that bid rather than conceding money the buyer had already offered — and never below its own
floor, on both its deterministic and LLM paths (`packages/agent-runtime/src/seller.ts`). Each side is
protected from bargaining against itself, which is what keeps the settled price a genuine function of the
two positions rather than an artifact of whichever reasoner blinked.

### A2CN alignment (open-standard wire profile)

Meridian first wired the negotiation with a contract of our own; the enterprise lesson is that the
contract should be an **open standard** where one exists. **A2CN** (Agent-to-Agent Commercial
Negotiation Protocol) is that standard for this layer. The Meridian contract is therefore a
**swappable wire profile**, with A2CN as a second one — a codec at the message boundary, selected by
`WIRE_PROFILE`, with the state machine, the identity gate, and the mandate all untouched.

The codec is built against the **real** A2CN v0.2.0 spec + JSON schemas
([github.com/A2CN-protocol/A2CN](https://github.com/A2CN-protocol/A2CN)): snake_case
`goods_procurement` messages with terms in minor units, the real terminal states, and A2CN's own
protocol-act EdDSA JWS signing over the same Ed25519 DID keys.

The profile is **agreed per counterparty, from its agent card**: `WIRE_PROFILE` states what this process
would prefer, and `selectWireProfile` uses A2CN only when the counterparty's own card advertises the
extension — so a supplier that does not falls back to `meridian` and the negotiation completes anyway, with
no code change on either side. That fallback is asserted end-to-end over real HTTP (the
`summit-downgrade` case in `packages/buyer/src/e2e.test.ts`), because it was previously implemented in a
function nothing in the product called: the buyer read the env var, encoded A2CN at every supplier
regardless of its card, and a supplier on the default profile refused every negotiation verb. Full mapping
table and the honest list of simplifications:
**[`docs/a2cn-alignment.md`](docs/a2cn-alignment.md)**.

## Identity & trust across boundaries

Before committing anything of value, the buyer **cryptographically verifies** each counterparty: a
three-part check (DID resolves → credentials are verifiable, not merely asserted → the agent is
authorized to commit its supplier) mapped to a **graduated trust level**. Summit, Cascade and Alpine
verify to `VERIFIED`; **RidgeLine is `REJECTED`** — attractive on paper (best numbers in the directory)
but its identity does not check out — so the buyer exchanges no message with it. Every A2A message is
**signed** with the sender's DID key and verified on receive; a tampered message is dropped.

Identity is a self-contained W3C **DID/VC** layer over real Ed25519 (a seeded mock trust anchor is the
only trusted issuer) — genuine crypto, so the gate is cryptographic, not a name check. One boundary worth
stating plainly: **DID resolution is local.** `did:web` means "fetch
`https://<host>/.well-known/did.json`", and this layer instead reads
`infra/identity/generated/did-docs/<host>.json` off disk (`packages/agent-runtime/src/identity.ts`). The
signatures, the Data Integrity proofs and the trust-anchor bindings are all real and all verified; the
*identifiers* only resolve inside this deployment, so no outside resolver could check one. Swapping in the
real AGNTCY Identity service is what makes them portable, and nothing above the identity module changes. The same layer
mints two identities that are not agents: a **`rogue-issuer`** whose credentials must *fail* the gate,
and a separate **`meridian-operator`** DID holding an `ApprovalAuthority` credential — the human's key,
which is what makes an approval receipt prove anything (see Accountability). See `infra/identity/`.

## Discovery

The buyer finds candidate suppliers through a **real AGNTCY Agent Directory** from machine-readable
**OASF capability records** — no hardcoded endpoints — then filters by shortfall + private policy. The
foundation underneath that: separate processes, separate stores, one shared vocabulary, A2A over a
transport.

### How capabilities map to OASF

Domain facts (product, units, lead time, region, claimed certs) ride as OASF **annotations**
(`key:value`) — the schema-valid, directory-indexed place for free-form data — not a bespoke field the
strict OASF schema would reject. The buyer searches by `annotation=product:three-season-tent`, pulls
the full records, validates them against the `OasfRecord` zod schema, then applies its filters. Claimed
certs are **asserted, not verified** here — verification happens later, at the trust gate.

### The record's endpoint is untrusted input

A capability record is **authored by the counterparty**, so its `a2aEndpoint` is attacker-controlled — and
the buyer is about to make an outbound HTTP request to it. Without a check, a malicious record could point
the buyer's A2A client at an internal service or a cloud metadata endpoint: a server-side request forgery
delivered through discovery, and one the signature gate does *not* catch (signatures prove who wrote a
message, not where a URL leads).

So every discovered base URL is validated before a card URL is built or fetched
(`assertApprovedOrigin`, `packages/agent-runtime/src/transport.ts`). The default policy is **loopback-only**, and
agents themselves bind `127.0.0.1` rather than all interfaces — nothing in the demo needs a wider surface.
Two env vars open it deliberately for a distributed deployment: `A2A_ALLOWED_ORIGINS` (a comma-separated
allowlist of permitted agent origins) and `A2A_BIND_HOST` (e.g. `0.0.0.0`), both set in
`.env.local`. Both are opt-in; a non-loopback origin with no allowlist is a hard error
naming the var, not a silent fetch.

## Accountability

The buyer and suppliers share **no memory, database, or logger** — only A2A messages and what the
directory returns. Each org keeps its own **signed, hash-chained half-trail** — one per run, never
written to by anyone else — joined after the fact by `correlationId`. A settle is provable from the two
independent stores: the winning supplier's signed offer and the buyer's `ACCEPT` naming it carry identical
terms and share `correlationId`s across the two files — the non-repudiation hook, and exactly what the
A2CN §9 transaction record each side derives on its own.

Two further artifacts close the gaps that leaves:

- **A2CN §10 audit log** (Component 7) — generated on entering *any* terminal state, "for all outcomes
  including failures, withdrawals, and timeouts". That clause is the design constraint: a log that only
  exists for successful deals is the log nobody needs, since the sessions an auditor asks about are the
  ones that went wrong. `GET /audit?supplier=<id>` returns it; `&export=1` returns the §10.5 compliance
  package. Both it and `/record` are control-token gated **when `CONTROL_TOKEN` is set** (with none set the
  buyer runs them open and warns loudly at startup): the buyer's own half-trail legitimately contains
  the counterparty's agreed terms, so serving them open would let any process that can reach the buyer over
  loopback — a rival supplier agent included — read the buyer's record of someone else's deal. It deliberately records message types, hashes and values — **not** full terms content, which
  stays in the §9 record, so a compliance export does not carry the deal's confidentiality obligations.
  Per §10.3 its `audit_metadata` fields are **self-declared attestations**, not protocol-verified facts.
- **A2CN §14 ApprovalReceipt** — the one exception to that caveat, and the fix for the system's last
  unsigned moment. Every move an agent made was already signed and non-repudiable, while the single point
  where a *human* took responsibility for a purchase had no signature on it at all: asked "who authorised
  this?", the honest answer was "a log says someone clicked." A receipt is signed by the **operator's**
  separate key, not the agent's — if the buyer signed its own approvals it would merely be the agent
  asserting it was allowed to do the thing it was not allowed to do.

Optional **OpenTelemetry** tracing (`OTEL_ENABLED=1`) emits real OTel spans carrying AGNTCY-style
(`agntcy.*`) attributes — a naming convention, not conformance to the published AGNTCY observability
schema, and no GenAI semantic-convention attribute is emitted. By default it writes one JSON span per line to
`trails/otel-spans.jsonl` — no collector, no network, so a test can assert "one trace per negotiation"
straight against the file — and streams to a real collector (Jaeger, Grafana Tempo, the OTel Collector)
when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.

## Settlement (optional)

Reaching agreement is not the same as paying, and an optional settlement layer closes that seam for real:
a committed deal opens a **Stripe crypto PaymentIntent**, Stripe issues a **USDC deposit address on the
Tempo network**, the buyer agent sends to it, and Stripe watches the chain and captures once the funds
land. The same cross-deal cap that governs what the agent may *commit to* bounds what it may *spend*, and
a deal over the settlement approval threshold opens no PaymentIntent at all until a human approves it —
pressing that button is what mints the operator-signed §14 receipt above.

That threshold's default (`$9,100`) is measured, not round: the deterministic run settles at exactly
`$9,168`, so it **always** stops for a person, while on LLM runs ($89–$93/u) roughly half to two-thirds
stop for a person (measured 53% and 64% across two samples) and the rest pay themselves. The layer needs a
Stripe test key; without one it stays off and nothing else changes.

Turning it on, the threshold's failure modes, and the single sandbox substitution:
**[`GETTING-STARTED.md`](GETTING-STARTED.md)**, **[`HOW-TO-DEMO.md`](HOW-TO-DEMO.md)** and
`packages/dashboard/RUNBOOK.md`.

## What is real, and what is modelled

Real: the DIDs and verifiable credentials, the signatures on every message, the per-organisation
hash-chained logs, the A2CN transaction records both sides derive independently, the AGNTCY directory,
and the Stripe crypto PaymentIntent including the on-chain capture.

Modelled: the buyer agent's own USDC transfer. Stripe sandbox PaymentIntents do not watch real testnets,
so the deposit is driven by Stripe's `simulate_crypto_deposit` test helper. That is the only substitution
— see [`packages/buyer/src/settlement.ts`](packages/buyer/src/settlement.ts).

## Standards

| layer | standard |
| --- | --- |
| negotiation | [A2CN v0.2](https://github.com/A2CN-protocol/A2CN) — offer/counter/accept acts, signed transaction records, human-approval receipts, audit logs |
| transport | [A2A](https://github.com/a2aproject/A2A) (`@a2a-js/sdk`), with A2CN carried as a declared extension |
| discovery | [AGNTCY Directory](https://github.com/agntcy/dir) + OASF capability records |
| identity | [W3C DIDs + Verifiable Credentials](https://www.w3.org/2018/credentials/v1), `did:web`, Ed25519 |
| settlement | [Stripe crypto PaymentIntent](https://docs.stripe.com/crypto) — USDC on the Tempo network |
| telemetry | OpenTelemetry — one span per negotiation |

## Layout

```
packages/
  protocol/        # shared envelope + SignedEnvelope + OASF/capability + DID/VC + NEGOTIATION zod schemas
  agent-runtime/   # harness: transport, agent, directory, identity, negotiation state machine + seller
                   #   engine; half-trail.ts (signed, hash-chained per-org store),
                   #   transaction-record.ts (A2CN §9), audit-log.ts (A2CN §10 Component 7),
                   #   approval-receipt.ts (A2CN §14, operator-signed), a2cn.ts + wire-profile.ts
                   #   (swappable wire codec), disposition.ts (seller's private circumstances),
                   #   rationale.ts (sanitised counterparty free text), otel.ts (OpenTelemetry), llm.ts
  buyer/           # Meridian procurement agent (discovers, filters, VERIFIES, NEGOTIATES, and now
                   #   GOVERNS: mandate.ts + classify.ts (tiers), governor.ts (shared policy state),
                   #   commitments.ts (cross-deal cap), reputation.ts, approval-queue.ts, kill-switch.ts,
                   #   oversight.ts (suspend-on-disconnect), drift.ts; strategy.ts (what to bid next),
                   #   quote-board.ts (live rival quotes → mid-flight leverage),
                   #   commit-coordinator.ts (the cross-deal commit barrier + choice rule),
                   #   settlement.ts (optional Stripe USDC payment), probes.ts (the adversarial
                   #   tamper/illegal-move probes), server.ts (control + SSE for the dashboard);
                   #   mandate.test.ts is the acceptance suite
  supplier-summit/ # cooperative selling agent   (lowest floor $86 → wins a war pushed to the end)
  supplier-cascade/# competitive selling agent   (opens below Summit, floors above it → the RIVAL)
  supplier-alpine/ # firm selling agent          (floor above the bid ceiling → ESCALATE / stand down)
  supplier-ridge/  # adversarial selling agent   (never converges → WALK-AWAY; REJECTED at trust by default)
  dashboard/       # presenter UI: one SSE stream per org, no god view (RUNBOOK.md is the stage script)
infra/
  dir/             # real AGNTCY Agent Directory (docker-compose, single container)
  identity/        # AGNTCY Identity: issuance authority (issue.mjs) + generated DIDs/VCs/keys
  demo.mjs         # the demo launcher (terminal, dashboard and settlement modes)
  sample.mjs       # in-process outcome-DISTRIBUTION harness (see above)
  sweep.mjs        # the behavioural sweep over the ways the system can be run
  control-token.mjs# decides the CONTROL_TOKEN the launcher hands its child processes
  env.mjs          # loads .env.local into every run command, before any application code
.env.example       # committed template: every variable the code reads, with its default
                   #   (.env.local is the gitignored copy that holds real keys — see GETTING-STARTED.md)
docs/
  a2cn-alignment.md# the open-standard wire-profile mapping + honest simplifications
  known-limitations.md # accepted prototype debt + the standards-conformance gaps
seed/
  scenario.json    # shortfall (SKU, units, deadline, buyer DID) + supplier DIDs
  catalogs/        # each supplier's capability advertisement (PUBLIC — published to the directory)
  mandate.json     # the buyer's PRIVATE mandate — tiers, reservation, cross-deal cap (buyer-only)
  supplier-policy.json # each supplier's PRIVATE selling policy — opening, floor, concession rate
  a2cn/            # golden A2CN wire fixture
  reputation.json  # seeded counterparty reputation per DID
  history.json     # prior settlements per counterparty (drift-detection stretch)
```

`seed/supplier-policy.json` is the seller-side mirror of `mandate.json`, and it is one file for a reason:
those numbers used to be literals inside each `supplier-*/src/index.ts` **and** copied again into the
sampling harness. Two copies of a number that decides every price is a measurement bug waiting to happen
— change a floor in one place and the harness keeps confidently reporting the old distribution.

## Where to read more

- **[`GETTING-STARTED.md`](GETTING-STARTED.md)** — the full setup path, every environment variable, and
  troubleshooting.
- **[`HOW-TO-DEMO.md`](HOW-TO-DEMO.md)** and
  **[`packages/dashboard/RUNBOOK.md`](packages/dashboard/RUNBOOK.md)** — how to present it live; the
  RUNBOOK is the annotated stage script.
- **[`docs/a2cn-alignment.md`](docs/a2cn-alignment.md)** — exactly where this conforms to A2CN, where it
  deviates, and why. Includes the §9 record, the §10 audit log, and what is deliberately not implemented.
- **[`docs/known-limitations.md`](docs/known-limitations.md)** — the accepted prototype debt and the
  standards-conformance gaps.
- **[`infra/VERSIONS.md`](infra/VERSIONS.md)** — every pinned dependency version and why it is pinned.
- **[`infra/identity/README.md`](infra/identity/README.md)** — the DIDs, credentials, and how
  RidgeLine's identity is broken on purpose.

Design decisions are argued in comments at the code that implements them rather than collected in a
document, because that is where they stay true. The denser ones are in
`packages/buyer/src/llm.ts` (what an agent may and may not be told),
`packages/buyer/src/quote-board.ts` (why sharing quotes between your own negotiations is not the
cross-organisation read this codebase deleted), and
`packages/agent-runtime/src/disposition.ts` (why variation comes from circumstances rather than a dice
roll).

## What it proves

Each capability is backed by an in-process acceptance suite (real Ed25519 + real state machine, no
Docker). The headline guarantees:

- **Mandate & policy** — Summit's and Cascade's terms classify `AUTONOMOUS_SETTLE` (no human); Alpine's
  classify `APPROVE_BEFORE_COMMIT` (nothing committed until an operator approves); an admitted RidgeLine
  is walked away from *early* — well inside the round budget, because it stopped conceding, with its
  reputation down-weighted by the stalls. The reservation price and spend cap — key *and*
  value — never appear in any outbound message. The kill switch stops a deal **before** the `ACCEPT`
  (there is no post-`ACCEPT` revocation window — once the signed `ACCEPT` is out the deal is struck,
  which is *why* the barrier holds everything to the last moment); the cross-deal cap blocks a second
  near-cap settle; a downed oversight channel turns a would-be settle into a hold; the reputation floor
  and drift flag both fire.
- **Negotiation** — Buyer↔Summit reaches a settling `ACCEPT` with both stores holding the matching
  signed pair; an illegal transition is rejected by both trackers; Buyer↔Alpine negotiates but never
  settles on the agent's own authority; every message references its predecessor and carries a monotonic
  round; negotiations run in parallel without cross-talk. Neither side can bargain against itself: a
  buyer counter never exceeds its private bid ceiling **or** the seller's standing offer, and a supplier
  counter never falls below its floor **or** the buyer's standing bid — on deterministic and LLM paths alike.
- **Commit barrier** — a ready supplier is *not* committed to while another is still negotiating; once
  all have reported, the cheaper committable offer wins and the others stand down, with exactly one deal
  banked; an in-policy offer beats a cheaper out-of-policy one; and only when *nothing* is in policy does
  every offer go to a human. The quote board shares rival prices *between the buyer's own threads* without
  either seller learning what the other quoted.
- **Identity & trust** — Summit, Cascade and Alpine verify to `VERIFIED`, RidgeLine is `REJECTED`; a
  tampered message is rejected by the receiver, visibly; the trail records *why* RidgeLine failed; flipping
  RidgeLine's identity fixture re-admits it, proving the gate is cryptographic, not a name check.
- **Accountability artifacts** — each side derives a matching A2CN §9 record from its own half-trail
  alone; a §10 audit log is produced for **walk-aways and timeouts, not just settles**; a §14 approval
  receipt verifies against the *operator's* key and fails against the agent's; an injected `SYSTEM:`
  instruction in a counterparty rationale is sanitised before it ever reaches a model.
- **Discovery** — all four suppliers self-publish to the directory on boot; the buyer discovers by
  capability with no endpoint hardcoded; the policy filter records its admit/drop reasons; discovery is
  dynamic across a freshly started directory.

## License

MIT — see [LICENSE](LICENSE). "As is", no warranty, and no maintenance: see
[SECURITY.md](SECURITY.md).

