# Meridian Crossing

A working prototype of **autonomous business-to-business negotiation**. A buyer's procurement agent
discovers suppliers it has never met, cryptographically verifies who they are, negotiates price with
several of them in parallel, commits to the best offer it is actually allowed to take, and pays in
stablecoin — stopping for a human at the points where a human should be asked.

Five independent processes, one per organisation. No shared database, no message bus, and no path by
which one organisation can read another's records.

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
reaches the same outcome every time.

## The four suppliers

Each exists to exercise a different path. None of them is decoration.

| supplier | floor | what it demonstrates |
| --- | --- | --- |
| **Summit Gear** | $86 | the deal that settles — lowest floor, so it wins any price war pushed to the end |
| **Cascade Gear** | $89 | a credible **rival**: opens below Summit so the buyer has real leverage, but floors above it |
| **Alpine Supply** | $95 | the **escalation** path — its floor sits above the buyer's ceiling on purpose, so its best price can never fit |
| **RidgeLine Trading** | — | the **trust gate**: its credentials come from an untrusted issuer, so the buyer exchanges no message with it at all |

The buyer's private mandate (reservation price, spend cap, tier bands) lives in
[`seed/mandate.json`](seed/mandate.json) and never leaves the buyer's process — not onto the wire, and
not into an LLM prompt. Each supplier's floor is equally private, in
[`seed/supplier-policy.json`](seed/supplier-policy.json).

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

## Where to read more

- **[`packages/dashboard/RUNBOOK.md`](packages/dashboard/RUNBOOK.md)** — how to run it and a
  step-by-step script for demoing it live. Read this second.
- **[`docs/a2cn-alignment.md`](docs/a2cn-alignment.md)** — exactly where this conforms to A2CN, where it
  deviates, and why. Includes the §9 record, the §10 audit log, and what is deliberately not implemented.
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
