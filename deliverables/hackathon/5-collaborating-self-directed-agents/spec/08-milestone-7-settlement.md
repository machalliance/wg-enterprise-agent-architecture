# Milestone 7 — Settlement (Stripe MPP + stablecoin) — *optional extension*

**Goal:** turn the `CONFIRM` state from a terminal no-op into **real money moving across the
organizational boundary**. When the buyer and a verified supplier settle within mandate, execute a
payment — by card/ACH or, more interestingly, by **stablecoin** — and record a settlement receipt in
both half-trails. Always in Stripe **test mode** / testnet; never live funds.

**Chapter tie-in:** the book stops at *commitment*: an agent "may commit you to a deal with an outside
party," and the composition example warns the sourcing path "can commit you to an external deal that
your internal policy tiers were never written to bound." Settlement is the layer immediately below
that commitment — the money the commitment obligates. The chapter also leaves **dispute/arbitration**
explicitly unsolved; programmable-money escrow (stretch, below) is a concrete answer to "the disputed
tent order, with money attached." Sinan Aral's "marketplace of agents representing both sides of every
transaction" is a marketplace *because* value settles, not just terms.

**Component:**
- **Stripe Machine Payments Protocol (MPP)** — the open protocol for agents to autonomously execute
  payments; it is to *payment* what A2A is to *negotiation*. Complementary layers, not competitors —
  the same relationship the spec draws between A2A and MCP.
- **Stripe Shared Payment Token (SPT)** — a scoped, revocable payment credential the agent uses without
  handling raw card/account details. This is the money-layer twin of the M4 mandate.
- **Stripe stablecoin financial account** (USDC / Bridge USDB) — hold/send/receive; supplier payouts
  settle in minutes, cross-border, 24/7. The stablecoin rail is the architecturally interesting one
  (see the insight at the end).

> **Only build this once M0–M5 work.** It is additive: the base prototype is complete and demoable
> without it. Its value is showing the *whole* loop — discover, verify, negotiate, commit, **pay** —
> end to end across the boundary.

---

## In scope
- A `packages/settlement` adapter wrapping the Stripe SDK (**test mode keys only**), with two rails
  behind one interface: `card` (SPT) and `stablecoin` (financial account payout, testnet).
- A settlement trigger fired by the buyer on `CONFIRM`, bounded by the M4 mandate.
- Mandate-scoped payment authorization (SPT) whose cap is the M4 `maxTotalCommittedUsd`.
- A `SETTLEMENT` half-trail record (M5) on both sides, carrying the payment-intent ID and, for
  stablecoin, the on-chain tx hash.
- Kill switch (M4) extended to revoke the authorization and halt pending transfers.

## Out of scope
- Live funds, mainnet stablecoins, real KYC. Test mode and testnet throughout.
- Multi-currency FX beyond what the stablecoin rail gives for free.
- Full escrow/dispute resolution (documented as the stretch, with the state machine sketched).

---

## Build tasks

1. **Rail-agnostic settlement interface** (mirrors the M0 transport factory — one interface, swappable
   backend, so negotiation/settlement code never hard-codes a rail):
   ```ts
   // packages/settlement/src/rail.ts
   export type RailKind = "card" | "stablecoin";
   export interface SettlementRail {
     authorize(mandateCapUsd: number): Promise<AuthorizationRef>;   // scoped, revocable
     pay(deal: SettledDeal, auth: AuthorizationRef): Promise<SettlementReceipt>;
     revoke(auth: AuthorizationRef): Promise<void>;                 // kill-switch path
   }
   export function makeRail(kind: RailKind): SettlementRail {
     // "card"       -> Stripe Shared Payment Token + PaymentIntent (test mode)
     // "stablecoin" -> Stripe stablecoin financial account payout to supplier (testnet)
   }
   ```
2. **Authorization bound to the mandate.** On the buyer opening negotiations, mint an SPT scoped to
   `mandate.maxTotalCommittedUsd`. The policy number and the spendable number are now the same value,
   enforced twice (M4 checks it before `ACCEPT`; Stripe enforces it at capture). A deal that would
   breach it cannot be paid even if a policy bug let it settle.
3. **Trigger on `CONFIRM`.** When M3 reaches the `ACCEPT`+`CONFIRM` terminal settle *and* M4 classified
   it `AUTONOMOUS_SETTLE` or `NOTIFY_ON_SETTLE`, call `rail.pay(...)`. Tier 3 (`APPROVE_BEFORE_COMMIT`)
   pays only after the human approves in the M6 queue. Tier 4 never pays.
4. **Payee = verified counterparty.** The payout destination is the supplier's Stripe test account,
   admissible only if its M2 identity verified. `VERIFIED` → eligible payee; `REJECTED` → no
   destination exists. Identity gate and money gate agree by construction.
5. **Settlement receipt into both half-trails** (M5). Append a `SETTLEMENT` record:
   ```ts
   export const SettlementReceipt = z.object({
     negotiationId: z.string().uuid(),
     correlationId: z.string().uuid(),
     rail: z.enum(["card", "stablecoin"]),
     amountUsd: z.number().positive(),
     stripePaymentIntentId: z.string(),
     chainTxHash: z.string().optional(),   // present for the stablecoin rail
     settledTermsHash: z.string(),          // must equal the CONFIRMED termsHash from M3/M5
     paidAt: z.string().datetime(),
   });
   ```
   Reconcile (M5) gains one assertion: `settledTermsHash === confirmed termsHash` on both sides, and
   for stablecoin, `chainTxHash` resolves on the testnet explorer — a third proof neither org owns.
6. **Kill switch reaches the money.** Extend the M4 kill endpoint: on halt, `rail.revoke(auth)` for
   every active authorization and cancel any uncaptured PaymentIntent.
7. **Rail toggle in the demo.** `SETTLEMENT_RAIL=card|stablecoin` env, flipped live like the M0
   transport toggle, to show negotiation and settlement are separable protocols.

## Dashboard addition (extends M6)
Add a **Settlement** strip to the Reconcile panel: for the Summit deal, show the rail, the amount, the
PaymentIntent ID, and (stablecoin) a link to the testnet tx. The demo's closing beat becomes: signed
terms match on both half-trails **and** the money is on-chain, provable by either party.

---

## Acceptance criteria (demo checkpoint)
- [ ] Summit's `AUTONOMOUS_SETTLE` deal triggers a test-mode payment; the receipt lands in both
      half-trails with matching `settledTermsHash`.
- [ ] Stablecoin rail: a testnet payout completes and its tx hash resolves on a block explorer.
- [ ] The SPT authorization is capped at `maxTotalCommittedUsd`; a payment above the cap is refused by
      Stripe, not just by buyer policy.
- [ ] Alpine's escalated deal pays **only after** human approval; RidgeLine never obtains a payout
      destination.
- [ ] Kill switch mid-flight revokes the authorization and cancels the uncaptured PaymentIntent.
- [ ] Flipping `SETTLEMENT_RAIL` changes the rail with no change to negotiation code.

## Stretch
- **Escrow / conditional release** (the arbitration answer). On `CONFIRM`, lock funds; release on a
  signed delivery-confirmation message; refund on a signed dispute within a window. Sketch:
  ```
  CONFIRM ──► [LOCKED] ──delivery-confirmed──► [RELEASED]
                  │
                  └──dispute-within-window──► [REFUNDED / ARBITRATION]
  ```
  This turns M5's dispute-terms *reference* into an enforced state machine with money behind it.
- **MPP end to end:** have the buyer agent execute the payment autonomously over MPP against the
  supplier agent's payment endpoint, rather than a direct SDK call — closing the agent-to-agent loop
  for the money exactly as A2A closed it for the terms.

---

## A note on framing (say it at the demo)
Two things stay deliberately near-future and should be named, not hidden. **Test mode / testnet
only** — no live value moves. And **autonomous agent payment authorization** is early: Stripe shipped
the primitives (SPT, MPP, stablecoin accounts) in 2025–2026, but an enterprise letting an agent settle
unattended is ahead of current practice — the same honest framing the spec gives the autonomous
*commitment*. The point of M7 is that the settlement plumbing is buildable on real, open primitives
today, not that the industry runs it unattended yet.

`★ Insight ─────────────────────────────────────`
- The stablecoin rail is the one part of the money flow that fits Archetype 5's "no single party owns
  the substrate" thesis. Card/ACH reintroduces each org's bank as an owned intermediary; an on-chain
  settlement record is neutral by construction, so it becomes the shared, correlatable, non-repudiable
  proof M5 otherwise has to synthesize from two half-trails.
- SPT makes the mandate and the wallet the *same* bound. Before M7 the cap was a policy check the code
  had to remember to run; with a scoped token, the cap is enforced by the payment network even if a
  policy bug slips a deal through — defense in depth across the org boundary.
- Keeping MPP (money) and A2A (terms) as separate protocols is the same lesson as A2A-vs-MCP and the
  SLIM-vs-gRPC transport swap: separable layers let you demo settle-over-card or settle-over-stablecoin
  without touching a line of negotiation logic.
`─────────────────────────────────────────────────`
