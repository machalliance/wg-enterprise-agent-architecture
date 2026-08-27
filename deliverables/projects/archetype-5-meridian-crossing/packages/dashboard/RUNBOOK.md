# Meridian Crossing — demo runbook

The ~4-minute stage script, annotated with what to say and which panel to
point at. The whole point of Archetype 5 is that **no one can see the whole decision trail** — so the
dashboard has no god view. It opens **one SSE stream per organization** and reconstructs the picture by
`negotiationId`/`correlationId`. It never reads an agent's store — only what each org publishes.

## 0. Prerequisites

- Docker running (the real AGNTCY Agent Directory runs in a container).
- Node ≥ 22, `pnpm install` already run once.
- Configuration lives in `.env.local` at the repo root — the directory holding `package.json`
  (`cp .env.example .env.local` from there). It is gitignored, every run command loads it
  automatically, and `.env.example` lists every variable with its default.
- To drive the agents with an LLM, set the gateway config there (any OpenAI-compatible gateway):

  ```dotenv
  LLM_BASE_URL=https://openrouter.ai/api/v1   # or https://ai-gateway.vercel.sh/v1
  LLM_API_KEY=sk-...                          # your gateway key
  LLM_MODEL=deepseek/deepseek-v3.2            # any tool-calling model the gateway routes
  ```

  Pick any model that supports tool calling. `anthropic/claude-haiku-4.5` is the safest pick.
  `deepseek/deepseek-v3.2` is the built-in default but has been observed rate-limited on OpenRouter's
  shared pool, as has `deepseek/deepseek-v4-flash` (the agent retries with backoff and then falls back to
  its deterministic reasoner for that turn, so the outcomes still hold — but confirm your model is not
  throttled before a live demo).

  Leave `LLM_BASE_URL` unset and all five agents run their **deterministic reasoners** — the demo still
  runs offline and reaches the same outcomes every time. Per-agent overrides: `BUYER_LLM_MODEL`,
  `SUMMIT_LLM_MODEL`, `CASCADE_LLM_MODEL`, `ALPINE_LLM_MODEL`, `RIDGE_LLM_MODEL`.

  Whatever the reasoner, the model's output is clamped onto the negotiation state machine and (for the
  buyer) the mandate before anything is signed, and the model's free-text is never streamed — so the
  reservation price and cap never appear on any stream regardless of what a model says.

## 1. Boot (one command)

```bash
pnpm demo --web   # builds, issues DIDs, starts the directory, all five agents, and the dashboard
pnpm demo         # same, but terminal-only (no dashboard); the flow runs immediately in the logs
```

Only `--web` starts the dashboard. In `--web` mode the flow is **armed but idle** at boot and does not
begin until you open the page and press **Start** — so the demo can't finish before you've opened it.

> **Use `--usdc` if you want to see the human-approval step.** It is the only mode that reliably has one.
>
> There are two points where this system can stop and ask a person: before *agreeing* to a price beyond
> the agent's mandate, and before *paying*. The first is possible in any mode — the mandate gate is
> always armed, and if no offer lands in the autonomous band every committable deal escalates — but in
> the default scenario it almost never fires: negotiated prices land inside the band by design, and when
> one supplier is out of policy the commit barrier stands it down as soon as a cheaper in-policy offer
> wins. The second lives entirely inside the settlement layer, which only exists with `--usdc`.
>
> So `pnpm demo --web` on its own runs correctly and end-to-end — discovery, trust gate, three parallel
> negotiations, commit, and both sides deriving matching A2CN §9 records — but on the default scenario
> the agent is never once required to ask a human anything. The kill switch is armed and a person *can*
> intervene at any time; nothing *makes* them. If the point you are demonstrating is human oversight,
> add `--usdc` — that is the only way to guarantee the run stops for a person.

Add `--usdc` (composes with either mode, e.g. `pnpm demo --web --usdc`) to turn on the **Stripe
settlement** layer: when a deal commits, the buyer opens a **Stripe crypto PaymentIntent** for the full
amount. Stripe issues a **USDC deposit address on the Tempo network**; the buyer agent sends USDC to it,
and Stripe watches the chain and **captures** the payment automatically once the funds settle. The
dashboard grows a **Stripe settlement** panel showing the deposit address, token + contract, capture
status, and an event log. This layer needs a Stripe test secret key — set `STRIPE_SECRET_KEY` in
`.env.local` before `pnpm demo --usdc`; without it the buyer logs a warning and leaves settlement off.
Get a test key from the Stripe Dashboard → Developers → API keys (test mode, `sk_test_…`).

In `--web`, a deal whose total is **over `$9,100` USDC** (`SETTLEMENT_APPROVAL_ABOVE_USD`) does not pay
itself: it is parked as **PENDING_APPROVAL** and a human must press **Create payment** first (or
**Reject**) — no PaymentIntent is opened until they do. At or below the threshold the agent pays
autonomously, and the approval is recorded either way: pressing **Create payment** mints an A2CN §14
ApprovalReceipt signed by the *operator's* key (not the agent's), which then appears in that session's
audit log.

**Terminal `--usdc` is the exception.** With no dashboard there is no button to press, so the launcher sets
`SETTLEMENT_AUTO_APPROVE=1` and an over-threshold payment is auto-approved (logged loudly, naming `--web`
as the mode that requires a human). So the human-owns-the-payment story only holds with `--web` — do not
demo oversight from the terminal.

The threshold is chosen so both reasoning modes are honest, and the exact value matters more than it
looks — see the long comment on `SettlementPolicy` in `packages/buyer/src/settlement.ts`. Two of the
obvious alternatives are simply wrong for THIS demo: `$1,000` sits ~9x below the cheapest possible deal
so every payment stops for a person, and `$9,200` lands just above the deterministic $9,168 settle, so
it silently removes the human step from the reproducible run. `$9,300` is different — it is not a
mistake, it is a DIFFERENT demo: it sits at the top of the LLM deal range ($8,900–$9,300), so the
**payment**-approval gate never fires and you get the fully-autonomous end-to-end path (which is what
`HOW-TO-DEMO.md` suggests raising it for). Use it deliberately, just never while the point you are
making is human oversight.

Note this variable governs the **payment** gate only — whether a committed deal stops for a person
before money moves. It is not the mandate's negotiation-escalation band, which is separate, lower, and
decides whether the agent may agree to a price at all. Both are human gates; they fire at different
moments, and conflating them is why `$9,300` reads as if it disabled oversight everywhere:

| run (`--web --usdc`) | deal | human approval? |
| --- | --- | --- |
| deterministic | 100u @ $91.68/u = **$9,168**, every time | **always** — the reproducible oversight story |
| LLM | 100u @ $89–$93/u | **roughly half to two-thirds of runs** (measured 53%, n=19; 64%, n=14); the rest pay themselves |

There are no tranches, arbiter, or dispute anymore: a crypto PaymentIntent captures once, so a settle is a
single Stripe-monitored payment. In a Stripe **sandbox**, PaymentIntents do not monitor real testnets, so
the buyer agent's on-chain deposit is driven by Stripe's `simulate_crypto_deposit` test-helper — the only
substitution; everything else is the production path. The pinned preview API version is
`2026-07-29.preview` (see `infra/VERSIONS.md`).

Open **http://localhost:41200** and click **Start**. To re-run cleanly, **stop the demo first**:

```bash
# 1. Ctrl-C the running demo FIRST
pnpm demo:reset   # 2. clears the trails so the next run starts fresh
pnpm demo --web --usdc   # 3. start the next take
```

The order matters. Resetting while the agents are still up deletes files five processes hold open: they
go on appending to the unlinked inodes, so the next take starts from trails missing whatever was written
between the reset and the Ctrl-C.

Ports: the dashboard (`41200`) reverse-proxies every stream and control call, so the browser only
talks to `41200`. If the demo runs on a remote host, **expose only `41200`** — the agents (`41100`,
`41001/41002/41003/41004`) and the directory (`8888`) stay internal. The dashboard holds the kill switch, so
on any shared host reach it via an SSH tunnel, or set `DASHBOARD_USER`/`DASHBOARD_PASS` (HTTP Basic
Auth) before publishing the port. See [`../../HOW-TO-DEMO.md`](../../HOW-TO-DEMO.md) for both.

Note what happens with `DASHBOARD_PASS` **unset**: `server.mjs` binds `DASH_BIND` to `127.0.0.1`, so the
dashboard is reachable only from the host itself and refuses connections from anywhere else — publishing
the port changes nothing and looks like "connection refused", not a crash. There is deliberately no way to
have it listening externally *and* unauthenticated.

**An SSH tunnel is the only remote-access route that is safe on its own.** Setting
`DASHBOARD_USER`/`DASHBOARD_PASS` makes the dashboard bind externally, but HTTP Basic Auth transmits the
credential base64-encoded — not encrypted — on *every* request, so over plain `http://` it is readable by
anything on the path, and that credential fronts the kill switch and the approval buttons. Only publish
`41200` with Basic Auth if the port sits behind TLS termination (a reverse proxy or load balancer serving
`https://`). Otherwise leave `DASHBOARD_PASS` unset and tunnel: `ssh -L 41200:localhost:41200 <you>@<host>`.

## 2. The script

1. **Setup (10s).** "Five independent processes — a buyer and four suppliers from different
   organizations — plus a directory and an identity service. Nobody is wired to anybody by hand."
   Point at the five connection dots under **Live negotiations**: five separate streams, no shared bus.

2. **Discovery.** Point at **Discovery & Verification**. "The buyer queried the directory by
   *capability* — three-season tents, ≥ 100 units, ≤ 21 days — and four candidates came back. Being
   *findable* is not being *cleared to buy*."

3. **Verification.** Same panel, read the badges. "The buyer cryptographically verifies each
   candidate's DID and credentials. **Summit, Cascade and Alpine verify. RidgeLine is REJECTED** —
   attractive numbers, but its identity doesn't check out — so the buyer exchanges *no message* with
   it." That is why RidgeLine never gets a negotiation column.

4. **Negotiation.** Point at **Live negotiations**. Three columns stream turns as chat bubbles:
   RFQ → QUOTE → COUNTER… "Each incoming quote is classified into a mandate tier — you see the badge —
   but **the reservation price is never on screen, because it never leaves the buyer's process.**"
   - **Cascade** opens lowest and concedes fastest → reaches the tightest band first.
   - **Summit** is slower but can go deeper: its floor is the lowest in the scenario.
   - **Alpine** holds a floor beyond the notify band, so its best price can never fit → `APPROVE_BEFORE_COMMIT`.
   Crucially, **no deal commits yet.** The buyer holds *every* commit behind a barrier until *all*
   negotiations have shown their best-and-final — so it can never bind to one supplier before it knows
   what the others would offer. The columns reach a **ready-to-commit** state and go quiet: the choice point.

   The buyer also shares the quotes it receives *between its own negotiations*, so each thread can press
   against a live competing price. That is its own information, not a peek at anyone's book — see
   `packages/buyer/src/quote-board.ts`.

5. **The choice.** With every offer on the table, the buyer chooses. Its rule: **if any offer is within
   autonomous policy, commit the best of those and stand the rest down — no human needed.** In the
   deterministic run **Cascade wins at $91.68/u**, beating Summit's $92.24 best-and-final; Summit and
   Alpine both **stand down**. "The agent committed to the best offer it was actually allowed to take —
   and *only after* it had seen every alternative."

   Under an LLM the winner varies: the buyer uses Cascade's price as leverage against Summit, and Summit
   — which can go lower — often takes the deal instead, in the high $80s. Same rules, different outcome,
   which is the point of running it both ways.

   *Human-in-the-loop path.* The operator is pulled in only when **nothing** is in policy — every
   committable supplier lands `APPROVE_BEFORE_COMMIT`. Then the buyer can't auto-commit: an **approval
   dialog pops up** and a person decides which held deal to commit; approving drives a genuine signed
   **ACCEPT** (not a rubber stamp) and mints an operator-signed A2CN §14 ApprovalReceipt, rejecting
   leaves it held. To rehearse this branch, run with every supplier's floor above the notify band so no
   offer is in policy.

6. **Accountability.** Point at the **"Proof each deal really happened"** panel. "Two organizations, no shared ledger. Each kept its
   own transaction record." Buyer ⇄ the winning supplier shows the two independently derived
   **record hashes side by side**, with a **✓ MATCH** or **✕ MISMATCH** verdict and, on a match, the
   settled terms. "Neither side wrote the other's log — each derives the same A2CN §9 record from its
   own messages, and the proof is that the two hashes are identical." **Show record** additionally
   displays the **buyer's** half-trail; the supplier's half is not shown and cannot be, because each org
   serves only its own stream. `GET /audit?supplier=<id>` returns that session's A2CN §10 audit log, and
   `&export=1` the full compliance package — for walk-aways as well as settles. It and `/record` are
   control-token gated (the proxy injects the token, so the panel works; a direct call to the buyer needs
   `x-control-token`) because the export carries the counterparty's agreed terms.

7. **The kill switch.** The memorable 3 seconds — best rehearsed **mid-negotiation** (before the commit
   in step 5). Hit the red **KILL SWITCH**. Every live negotiation goes dark, a deal held at the commit
   barrier is severed, and any deal held for approval is released.

   Be precise about what it does **not** do: there is **no post-ACCEPT revocation window**. Once the
   signed ACCEPT is out, the deal is struck and the kill switch cannot unmake it — it stops deals
   *before* they bind, which is why the commit barrier holds everything until the last moment. (Pinned
   by the test "kill switch stops a deal BEFORE the ACCEPT" in `packages/buyer/src/mandate.test.ts`.)
   "One button reaches across every open deal and stops everything that hasn't yet bound."

## 3. What to say about the frontier (honesty close)

This is not "we built a marketplace of agents." It is: the **four unavoidable questions of Archetype 5
— discovery, cross-org identity, protocol, accountability — can each be answered today with real, open
standards (A2A + AGNTCY)**, and the answers compose into a system where two organizations' agents reach
a defensible commercial outcome with no orchestrator between them. Name what is still unsettled:
settlement infrastructure, arbitration when two faithful agents reach a regretted outcome, and trust
between parties with opposed interests.

## 4. Teardown

```bash
# Ctrl-C the `pnpm demo` process, then:
pnpm dir:down
```

## Notes / knobs

- `TURN_DELAY_MS` (2000 in `--web`, 0 in the terminal — the launcher picks it from the mode) paces the
  buyer's turns so the audience can watch and the kill switch has a live window. Lower it for a snappier
  run, raise it for a slower read; setting it yourself overrides the per-mode default.
- `APPROVAL_TIMEOUT_MS` (default 600000) is how long a held deal waits for a human before it stays
  parked. Plenty for a live demo.
- The dashboard reads only per-org streams plus the buyer's own control endpoints. In full, what
  `packages/dashboard/public/app.js` actually calls:
  - streams: `GET /events/<org>` for all five orgs. The buyer's is control-token gated (its trail names
    every rival's best-and-final); the four supplier streams are each that org's OWN trail and are not.
  - polled reads, all control-token gated: `GET /state`, `GET /approvals`, `GET /settlement`.
  - on-demand reads, gated: `GET /record`, `GET /audit` — derived from the buyer's OWN half-trail, never
    from a supplier's log. Note what that does *not* mean: the buyer's trail is where the counterparty's
    quotes, concessions and settled terms are recorded, so these payloads carry another org's commercial
    terms, the message history of the negotiation, and the §10 compliance view built from them. Buyer-owned
    is a statement about custody, not about whose deal the bytes describe — which is exactly why both
    routes are token-gated.
  - state-changing POSTs, gated AND requiring the `x-requested-by` same-origin marker: `/start`,
    `/kill`, `/approvals/:id/approve|reject`, and `/settlement/:id/approve-funding|reject-funding|refresh`
    (the settlement three fail closed with no token configured).

  **"Gated" above means "gated when configured", and there are two independent doors.** They protect
  different paths and neither substitutes for the other:

  - **`DASHBOARD_PASS` — the dashboard door.** Basic Auth on the dashboard's own port, covering every GET
    and POST the browser makes through the proxy. Unset means no auth, which is precisely why the dashboard
    then binds `127.0.0.1` only: the sole reachable callers are processes on the host and anyone who has
    SSH-tunnelled in. So "unauthenticated" and "externally reachable" never hold at once here.
  - **`CONTROL_TOKEN` — the buyer's door.** `requireControlToken` runs OPEN when it is unset (it warns at
    startup, then serves). This matters because the buyer listens on its own port: a direct caller — `curl`
    on the host, anything that can route to `41100` — never passes through the dashboard and so is not
    subject to Basic Auth at all. With no token configured, that caller can read `/audit` and `/record`,
    counterparty terms included, and drive the state-changing POSTs. The `x-requested-by` marker still
    applies to those POSTs, but it is a CSRF control, not authentication: it stops a random web page
    driving the buyer, not a deliberate request that sets the header. The three settlement routes are the
    only ones that fail closed.

  `pnpm demo` provisions a `CONTROL_TOKEN` automatically for `--web`/`--usdc`; a hand-rolled run gets
  whatever you configure, so on any shared host set both, or keep the agent ports unpublished.

  There is no shared/god-view data source anywhere: every one of these is served from the buyer's own
  state, and the supplier streams are each org publishing its own half. No endpoint reads another org's
  log — the counterparty facts in a buyer response are the ones the counterparty sent to the buyer.
