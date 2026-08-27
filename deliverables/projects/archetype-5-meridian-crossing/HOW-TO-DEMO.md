# How to demo — multi-agent inventory purchasing (browser dashboard)

This is the presenter's guide: how to boot the live dashboard and talk an audience through it in about
four minutes. The dashboard watches five independent organizations negotiate a real commercial outcome
with no orchestrator between them.

Before you present, make sure the prototype is set up and the tests pass — see
[`GETTING-STARTED.md`](GETTING-STARTED.md). This doc assumes that is done.

For the fully annotated beat-by-beat narration, [`packages/dashboard/RUNBOOK.md`](packages/dashboard/RUNBOOK.md)
has the extended script; everything you need to run the demo cold is below.

## The one important fact about ports

Everything runs on **one host**. The dashboard server (port **41200**) **reverse-proxies** every
per-org event stream and every buyer control call, so the browser only ever talks to `41200`. That
means:

> **Only one port matters: `41200`.**
> Everything else — the directory's gRPC (`8888`), agent-to-agent A2A + per-agent HTTP
> (`41001`/`41002`/`41003`/`41004`/`41100`) — is **internal** and never needs to be reached from outside.
> The dashboard reaches them over loopback on the same host.

If you are presenting from your **own machine**, that is all you need — skip to step 3 and open
`http://localhost:41200`. If the demo runs on a **remote host** (a VM, a container, a dev sandbox), you
additionally have to expose port `41200` to your browser — see step 2.

## 1. Boot everything

```bash
pnpm demo --web   # builds, mints DIDs, starts the directory + all five agents + the dashboard
```

Once the dashboard is up, the launcher prints its URL on its own line — click it (or cmd/ctrl-click) to
open `http://localhost:41200`, then press **Start**. The flow is armed but idle until you press it, so
**the demo can't be over before you've opened the page** — this is the key affordance for presenting
live. (Plain `pnpm demo` — no `--web` — skips the dashboard and runs the flow straight through in the
terminal; use that only to rehearse the outcomes, not to present.)

Leave it running. To reset and re-run cleanly between takes, **in this order**:

```bash
# 1. Ctrl-C the running demo FIRST
pnpm demo:reset   # 2. clear the trails
pnpm demo --web   # 3. start the next take
```

Resetting while the agents are still up deletes files five processes hold open: they go on appending to
the unlinked inodes, so the next take starts from trails missing whatever was written between the reset
and the Ctrl-C.

Optional — drive the agents with an LLM (any OpenAI-compatible gateway; otherwise deterministic). Put the
keys in `.env.local`, which every run command loads automatically:

```bash
cp .env.example .env.local   # once, at the repo root
```

```dotenv
LLM_BASE_URL=https://openrouter.ai/api/v1
LLM_API_KEY=sk-...
LLM_MODEL=deepseek/deepseek-v3.2
```

`anthropic/claude-haiku-4.5` is the safest pick for a live demo. `deepseek/deepseek-v3.2` is the built-in
default but has been observed rate-limited on OpenRouter's shared pool, as has `deepseek/deepseek-v4-flash`.
A throttled turn falls back to the deterministic reasoner so the outcomes still hold — but set
`LLM_MODEL` to a model you have confirmed is not throttled before presenting.

**Which mode am I in?** Two signals, so you never have to guess: the buyer logs one line at startup —
`[buyer] reasoning: LLM via <url> (<model>)` or `[buyer] reasoning: deterministic (LLM_BASE_URL unset …)`
— and the dashboard header shows a badge: a green **`LLM · <model>`** or grey **`Deterministic`**. The
badge means *configured*: if the key is wrong or rate-limited you'll see `LLM` but also `[buyer] LLM
reasoning fell back to deterministic: …` per turn — that's the tell the key isn't working. `LLM_API_KEY`
must be a key the gateway in `LLM_BASE_URL` will actually accept: a placeholder value, or a key issued by
a different provider, gets a 401 per turn and a demo that silently runs deterministic.

Optional — settle the committed deal with **real money movement** (`--usdc`, composes with `--web`). Add
the Stripe **test** key to the same `.env.local`:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
```

```bash
pnpm demo --web --usdc
```

The buyer opens a **Stripe crypto PaymentIntent**, Stripe issues a **USDC deposit address on the Tempo
network**, the buyer agent sends to it, and Stripe captures once the funds settle. The dashboard grows a
**Stripe settlement** panel with the address, token, capture status, and event log. Without
`STRIPE_SECRET_KEY` the buyer logs a warning and leaves settlement off — the rest of the demo is
unaffected. A deal over **$9,100** (`SETTLEMENT_APPROVAL_ABOVE_USD`) parks as `PENDING_APPROVAL` until a
human presses **Create payment**; the deterministic deal is **$9,168**, so the approval button is the
default path, and pressing it mints an A2CN §14 approval receipt signed by the *operator's* key. Full
detail — including the one sandbox substitution — is in
[`packages/dashboard/RUNBOOK.md`](packages/dashboard/RUNBOOK.md).

> **If you are demoing human oversight, use `--web --usdc`.** It is the only mode with a human-approval
> step in the default run — terminal `--usdc` has no button to press, so the launcher lets it approve its
> own payment (see the launcher-owned knobs below). The *mandate*-side approval almost never fires:
> negotiated prices land inside the
> autonomous band by design, and when one supplier is out of policy the commit barrier stands it down as
> soon as a cheaper in-policy offer wins. Plain `pnpm demo --web` runs correctly end to end — discovery,
> trust gate, three parallel negotiations, commit, matching §9 records — but never *requires* a person.

## 2. Expose the dashboard port (only if the host is remote)

**Skip this step entirely if you booted the demo on your own machine.**

**`DASHBOARD_PASS` decides both the login and the bind address.** Unset, there is no authentication, so
the dashboard binds `127.0.0.1:41200` only and nothing off the host can reach it — it prints a startup
warning saying so. Set it, and the dashboard requires Basic Auth and binds `0.0.0.0:41200`. Since it
holds the kill switch and the approval buttons, there is deliberately no way to have it listening
externally *and* unauthenticated. Two safe routes:

- **Preferred — SSH tunnel (no public exposure):** leave `DASHBOARD_PASS` unset and forward it from your
  laptop — `ssh -L 41200:localhost:41200 <you>@<host>`. The loopback bind is exactly what you want here:
  the tunnel reaches it, the network cannot.
- **Publish the port + require Basic Auth:** to publish `41200` (e.g. a managed sandbox's
  port-publishing command) you must set credentials — that is also what makes it bind externally at all:

  Put the credentials in `.env.local`, which is gitignored and is where every other secret in this repo
  already lives:

  ```bash
  # .env.local
  DASHBOARD_USER=operator
  DASHBOARD_PASS=pick-a-strong-secret
  ```

  ```bash
  pnpm demo --web
  ```

  Do **not** pass `DASHBOARD_PASS` inline on the command (`DASHBOARD_PASS=… pnpm demo --web`): it lands in
  your shell history and is visible in `ps` to every other user on the host, which is a poor trade for the
  one credential gating the kill switch. If you must set it per-invocation, read it without echoing first:

  ```bash
  read -rs -p 'DASHBOARD_PASS: ' DASHBOARD_PASS && export DASHBOARD_PASS && pnpm demo --web
  ```

  The dashboard then returns `401` until the browser supplies that login. If you publish the port and
  see connection refused, `DASHBOARD_PASS` is unset — that is the loopback bind, not a crash.

Whichever route you use, map host `41200` → local `41200` and leave every other port unexposed. The
agents' own ports (`41100`, `41001`-`41004`) never need to be reachable from your browser.

## 3. Open it

In your browser:

```text
http://localhost:41200
```

You should see three panels — Discovery & Verification, Live negotiations, and "Proof each deal really
happened" — plus a fourth **Stripe settlement** panel when you booted with `--usdc`. In the "Live
negotiations" header there are five connection dots (buyer + four suppliers): five independent streams, no
shared feed. When a deal needs sign-off, an approval dialog pops up over them.

## 4. The talk-track — five beats

Press **Start**, then narrate as each beat lands. What to point at and what to say:

1. **Discovery & Verification.** Four candidates appear. Summit, Cascade and Alpine flip to
   **VERIFIED**; RidgeLine goes **REJECTED** and never gets a negotiation column.
   *Say:* "The buyer found these four through a real agent directory — no hardcoded endpoints — then
   ran a cryptographic identity check on each. RidgeLine has the best numbers on paper, but its
   credentials don't verify, so the buyer won't exchange a single message with it."

2. **Live negotiations.** Three columns stream turns as chat bubbles carrying mandate-tier badges.
   Cascade opens lowest and concedes fastest, reaching the tightest band first; Summit is slower but can
   go deeper (its floor is the lowest in the scenario); Alpine bargains down to its floor and stops there,
   beyond the notify band. Then **all three columns go quiet at a ready-to-commit state** — none has
   committed.
   *Say:* "These are three independent organizations counter-offering on price, quantity, and lead time.
   Note what you *don't* see: the buyer's reservation price is never on screen — it never leaves the
   buyer's process. And notice no deal has closed. The buyer holds every commit behind a barrier
   until *every* supplier has shown its best-and-final, so it can never bind to one supplier before
   it knows what the others would have offered."

   If you have a moment, add the leverage point: the buyer also shares the quotes it receives *between
   its own negotiations*, so each thread can press against a live competing price. That is its own
   information, not a peek at anyone's book — and neither seller ever learns what its rival quoted.

   *Alpine behaves differently in the two modes* — don't promise its badge. Deterministic: it concedes to
   its $95 floor and lands `APPROVE_BEFORE_COMMIT`. Under an LLM it typically holds around $100 instead,
   so the buyer's round budget runs out with the best offer still above its reservation and it simply
   **walks away**. Either way Alpine never settles, which is the point; only the mechanism differs.

3. **The choice.** With every offer on the table, the buyer picks. In the deterministic run **Cascade
   wins at $91.68/u**, beating Summit's $92.24 best-and-final: Cascade's column drives a real signed
   `ACCEPT` and flips to **SETTLED**, while **Summit and Alpine are both stood down**.

   *What that looks like on screen, so you don't narrate past it:* a stood-down column ends `Sent:
   WALKAWAY` with a `✕ walk-away` line and a **WALKED** badge — the same badge the kill switch produces.
   The buyer is not rejecting Summit's perfectly good $92.24; it took a better one and released this one.
   Say "released" or "walked away from", not "stood down", if you are pointing at the column.
   *Say:* "Its rule is: if any offer is within autonomous policy, commit the best of those and stand the
   rest down — no human needed. It committed to the best offer it was actually allowed to take, and only
   after it had seen every alternative. Alpine held a floor the agent isn't authorized to accept on its
   own, and better in-policy deals were on the table, so Alpine gets walked away from rather than
   escalated."

   **Under an LLM the winner varies** — the buyer uses Cascade's price as leverage against Summit, and
   Summit, which can go lower, often takes the deal instead in the high $80s. Same rules, different
   outcome; don't promise a specific winner if you're running with a gateway configured.

   *The human-in-the-loop branch.* A person is pulled in only when **nothing** is in policy — every
   committable offer lands `APPROVE_BEFORE_COMMIT`. Then an **approval dialog** opens and the operator
   picks which held deal to commit; approving drives the same genuine signed `ACCEPT` (not a rubber stamp)
   and mints an operator-signed A2CN §14 approval receipt, rejecting leaves it held. To rehearse that
   branch, raise every supplier's floor in `seed/supplier-policy.json` above the notify band so no offer
   is in policy.

4. **Proof.** Buyer ⇄ the winning supplier shows **✓ MATCH** — two fingerprints, worked out separately by
   the two organizations, that turn out to be identical. Click **Show record** for the buyer's own copy.
   *Say:* "There's no shared database here. This match is reconstructed from two independently-kept,
   signed and hash-chained half-trails — the supplier's offer and the buyer's `ACCEPT` carry identical
   terms and are signed by *both* DIDs. Either side can prove what was agreed on its own."

   If asked about compliance: `GET /audit?supplier=<id>` returns that session's A2CN §10 audit log and
   `&export=1` the full package — produced for **walk-aways and timeouts too**, not just settles, which is
   the point (the sessions an auditor asks about are the ones that went wrong). Through the dashboard it
   just works; hitting the buyer directly needs `x-control-token`, because the export carries the
   counterparty's agreed terms.

5. **Kill switch** — the memorable three seconds. Best hit **mid-negotiation**, before the commit in
   beat 3.
   *Say:* "One control reaches across every open deal and stops everything that hasn't yet bound." Hit it:
   every live deal goes dark at once — every column lands on **WALKED** — and a deal already held at the
   commit barrier is severed rather than committed. The button itself flips to **SEVERED**.

   Be precise about what it does **not** do: there is **no post-`ACCEPT` revocation window**. Once the
   signed `ACCEPT` is out the deal is struck and the kill switch cannot unmake it. The safeguard didn't
   vanish, it moved *earlier* — which is exactly why the commit barrier holds everything to the last
   moment.

## Knobs

Set these in `.env.local` (copied from `.env.example`, which lists every variable with
its default). Prefixing one inline on the command line still overrides the file for that run.

- `TURN_DELAY_MS` (**2000 in `--web`**, 0 in the terminal — `pnpm demo` picks it from the mode) — pace of
  the buyer's turns, so the audience can watch and the kill switch has a live window. Lower = snappier,
  higher = slower read; setting it yourself overrides the per-mode default: `TURN_DELAY_MS=3000 pnpm demo
  --web`. It paces the BUYER's turns, so the negotiation phase is roughly ten of them — about **20s end to
  end** at 2000, against ~10s at 1000. Alpine's twenty-round grind is most of that, and the other two
  columns wait on it at the commit barrier, so this knob is really "how long does beat 2 last".
  Use **`0` for any unattended run** (`pnpm sweep` forces it) — but note pacing also consumes the mandate's
  wall-clock budget, so runs at different paces are not directly comparable.
- `APPROVAL_TIMEOUT_MS` (default 600000) — how long a held deal waits for a human before parking.
- `DASHBOARD_PORT` (default 41200) — change it if 41200 is taken (expose the same number).
- `DASHBOARD_USER` / `DASHBOARD_PASS` (default user `operator`, no password) — HTTP Basic Auth for the
  dashboard. `DASHBOARD_PASS` also decides the bind address: unset means no auth, so the dashboard binds
  `127.0.0.1` only and cannot be reached from another host. Set it to bind all interfaces and publish.
- `CONTROL_TOKEN` — shared secret for every buyer route, its own event stream included (the four SUPPLIER
  event streams are the ones left open — see below). Three groups:
  - state-changing, enforced by `requireControlToken`: `POST /start`, `POST /kill`,
    `POST /approvals/:id/approve|reject`;
  - **reads** that return counterparty commercial terms, same enforcement: `GET /audit`, `GET /record`,
    `GET /settlement`, `GET /state`, `GET /approvals`, and the buyer's own `GET /events` stream (its
    trail carries `commit-selection`, which names every rival's best-and-final). A direct caller
    (`curl`) needs the token for these too — they are gated because each one discloses another org's
    deal, not because they change anything. Note the four SUPPLIER `/events` streams are **not** gated:
    the token is the buyer's secret and handing it to a counterparty process would give it the kill
    switch, so closing those needs a per-agent credential that does not exist yet;
  - money-moving settlement actions (`POST /settlement/:id/approve-funding|reject-funding|refresh`),
    enforced by `requireControlTokenStrict`, which **fails closed**: with no token configured they
    return 401 rather than running open.

  Set the SAME value for the buyer and the dashboard; the dashboard injects it only on those routes,
  never on a supplier stream. Unset = the buyer accepts the first two groups unauthenticated (warns at
  startup). `pnpm demo` provisions one automatically for `--web`/`--usdc`, so the money-moving
  settlement routes are never reachable unauthenticated.

  **A token alone is not enough on the state-changing routes.** Every `POST` above also requires the
  header `x-requested-by: meridian-dashboard`, or the buyer answers `403` even with a valid token. That
  is the CSRF control: the token is injected server-side by the proxy, so it says nothing about where a
  request came from, whereas a non-safelisted header cannot be attached cross-origin without a
  preflight this server never answers. The GET reads do **not** require it — they are idempotent, and
  demanding it would break `curl`-ing the audit export. So a direct caller looks like:

  ```bash
  # a state-changing route: BOTH the marker and the token
  curl -X POST localhost:41100/kill \
    -H 'x-requested-by: meridian-dashboard' \
    -H "x-control-token: $CONTROL_TOKEN" \
    -H 'content-type: application/json' -d '{"reason":"manual test"}'

  # a gated read: token only. `supplier` is REQUIRED — an audit log is per-session, so without it
  # the buyer answers 400 rather than exporting every deal it has.
  curl "localhost:41100/audit?supplier=summit&export=1" -H "x-control-token: $CONTROL_TOKEN"
  ```
- `STRIPE_SECRET_KEY` — Stripe **test** secret key (`sk_test_…`); required by `--usdc`, ignored without it.
- `SETTLEMENT_APPROVAL_ABOVE_USD` (default 9100) — deal total above which the payment waits for a human.
  The default sits just under the deterministic deal ($9,168) so the reproducible run **always** reaches
  the human step: the agent negotiates and commits alone, then stops for a person before money moves. On
  LLM runs ($89–$93/u, so $8,900–$9,300 total) roughly half to two-thirds land above it. Lowering it
  catches MORE runs, not fewer — every deal above the gate stops for a person — so drop it toward `9000`
  only if you want the human step to fire nearly always on LLM runs too. Raise it above `9300`, the top
  of the LLM range, to show the fully-autonomous end-to-end path instead. Avoid `9200` — it is *strictly*
  above, so it silently removes the human step from the deterministic run while catching only the top of
  the LLM range.
- `OTEL_ENABLED=1` — emit OpenTelemetry spans (AGNTCY-style `agntcy.*` attributes) to
  `trails/otel-spans.jsonl`, or to a collector when `OTEL_EXPORTER_OTLP_ENDPOINT` is set.
- `NEGOTIATION_SEED` — pin the sellers' private dispositions (deal hunger, outside options, time pressure)
  so a run reproduces. Useful for rehearsing: find a run you like, then fix its seed. It does **not** pin an
  LLM's sampling — for a byte-identical run, leave the LLM env unset as well.

**Launcher-owned — set these yourself only when running an agent directly, never for `pnpm demo`.**
`infra/demo.mjs` passes them explicitly to the child process, so a value in `.env.local` is overridden
and will not take effect:

- `AWAIT_START` — arms the flow behind the dashboard's Start button (`--web`).
- `USDC_SETTLEMENT` — turns the settlement layer on (`--usdc`).
- `SETTLEMENT_AUTO_APPROVE` — lets **terminal** `--usdc`, which has no operator UI to press, approve its
  own over-threshold payment; the approval is logged loudly. Deliberately **never** set for `--web`,
  because that is the mode where a human owns the payment step — which is the whole point of running it.
  It is a separate explicit flag rather than something inferred from `AWAIT_START`, so the launcher decides
  it from the flags you passed and nothing else can infer it from the server's own mode.

  **This is a launcher guarantee, not a server invariant.** `infra/demo.mjs` sets the flag only for
  `--usdc` without `--web`, and `infra/env.mjs` stops `.env.local` from clobbering that decision (covered
  by `infra/env.test.mjs`) — so under `pnpm demo` a `--web` run cannot auto-approve. The buyer server
  itself reads `SETTLEMENT_AUTO_APPROVE` on its own and does **not** cross-check `AWAIT_START`: start the
  server directly with both set and it will auto-approve with a dashboard attached. If you run an agent
  outside `pnpm demo`, keeping the human in the payment step is yours to enforce.

## Teardown

```bash
# Ctrl-C the pnpm demo process, then, on the host running the demo:
pnpm dir:down
```

If you exposed port `41200` from a remote host in step 2, tear that forwarding down with the same tool
you used to set it up.

## If the browser shows an empty dashboard

- **Panels never populate / dots stay grey** — the agents aren't up yet or `pnpm demo` errored. Check
  the `pnpm demo` output; the buyer should log `control + event server on http://localhost:41100`.
- **Page won't load at all** — if the host is remote, the port isn't reaching your browser: confirm your
  port-forward / publish maps host `41200` → local `41200` and is still active.
- **Approve / Show-record buttons do nothing** — those call the buyer through the dashboard proxy; if the
  buyer isn't up they no-op. Confirm the buyer is running in the `pnpm demo` output.
