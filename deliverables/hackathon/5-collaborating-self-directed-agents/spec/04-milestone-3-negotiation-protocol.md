# Milestone 3 — Negotiation protocol

**Goal:** the buyer and a verified supplier run a real, turn-taking negotiation over **A2A** — RFQ,
quote, counteroffers on price/quantity/lead-time, and a terminal state (settle, or walk-away) — with
each side's reasoning driven by an LLM but bounded by the message contract.

**Chapter tie-in:** *"Two agents built on different stacks cannot negotiate unless they share a message
contract."* The protocol must encode "the structure of an offer... how counteroffers... reference prior
turns, how a deal is committed and confirmed, and how either party signals walk-away. Ambiguity here
produces a disputed tent order, with money attached." The decision space is three terminal branches:
**settle, escalate, walk away.**

**AGNTCY component:** **A2A** (`@a2a-js/sdk`) as the contract, over the M0 transport (SLIM/gRPC). MCP is
*not* used here — it exposes tools to one agent, a different layer.

> This is the core milestone — the negotiation contract is what the whole prototype is built to show.

---

## In scope
- The negotiation message contract as A2A messages, validated by zod on both send and receive.
- A turn-taking state machine that both roles share (illegal transitions are rejected).
- LLM-driven offer/counteroffer generation on each side, constrained to the contract.
- Terminal states: `SETTLE` and `WALKAWAY`. (`ESCALATE` is a *buyer-internal* transition to M4's
  approval queue — it is not a wire message; the supplier just sees the buyer go quiet or counter.)

## Out of scope
- The *policy* that decides whether a given settle is allowed, and the reservation-price protection —
  all of that is M4. M3 wires the *mechanism*; M4 supplies the *judgment*.

---

## Message contract (`packages/protocol/src/negotiation.ts`)

```ts
export const Terms = z.object({
  sku: z.string(),
  units: z.number().int().positive(),
  unitPriceUsd: z.number().positive(),
  leadTimeDays: z.number().int().positive(),
  deliveryTerms: z.enum(["FOB", "DDP"]).default("DDP"),
});

export const NegotiationMsg = SignedEnvelope.extend({
  type: z.enum([
    "RFQ",        // buyer → supplier: I need these terms, quote me
    "QUOTE",      // supplier → buyer: here are my terms
    "COUNTER",    // either → either: revised terms, referencing inReplyTo
    "ACCEPT",     // either → either: I accept the terms in inReplyTo
    "CONFIRM",    // counterpart → confirms ACCEPT; pair of ACCEPT+CONFIRM = SETTLE
    "WALKAWAY",   // either → either: clean disengagement, with a reason code
  ]),
  body: z.object({
    terms: Terms.partial().optional(),       // RFQ may omit price; QUOTE/COUNTER fill it
    round: z.number().int(),                 // monotonic per negotiationId
    reasonCode: z.enum(["OUT_OF_TERMS","BUDGET_EXHAUSTED","TIMEOUT","POLICY","DONE"]).optional(),
    disputeTermsRef: z.string().optional(),  // pre-agreed dispute terms referenced BEFORE commit (M5)
  }),
});
```

> **Design note.** A deal is committed only by an **`ACCEPT` followed by a `CONFIRM`** — a two-message
> commit so both half-trails contain a signed record of the *same* agreed terms. A lone `ACCEPT` is not
> a settle. This is what makes the settled order "provable by either party independently" in M5.

## Turn-taking state machine (shared)

```
        RFQ
         │
         ▼
    ┌─ QUOTE ◄────────┐
    │    │            │ COUNTER (either side, references prior round)
    │    ▼            │
    │  COUNTER ───────┘
    │    │
    │    ├── ACCEPT ──► CONFIRM ──► [SETTLED]   (terminal)
    │    │
    └────┴── WALKAWAY ───────────► [WALKED]     (terminal, either side, any time)
```

`agent-runtime` enforces this: a message that is not a legal successor for its `negotiationId`/`round`
is rejected and logged. Ambiguity is the enemy the chapter names — the state machine removes it.

## Build tasks

1. **Implement the state machine** in `agent-runtime`, keyed by `negotiationId`, tracking whose turn it
   is and the current round.
2. **Buyer reasoning loop.** On each supplier turn, the buyer LLM proposes the next action given: the
   shortfall, the conversation so far, and (from M4) the private mandate. Output is constrained to a
   valid `NegotiationMsg` (use structured output / a zod-validated tool call so the model cannot emit
   an illegal move).
3. **Supplier reasoning loops.** Each supplier has a private objective seeded by its behaviour:
   - **Summit:** opening price ~15% above buyer's likely target, concedes ~5%/round → lands inside
     the envelope by round 2–3. Produces the **settle**.
   - **Alpine:** best capacity, but a floor price/lead-time deliberately set just *outside* the buyer's
     envelope → buyer cannot auto-settle → **escalate** (M4).
   - **RidgeLine (if admitted):** never converges — repeats near-identical counters and asks probing
     questions → triggers the round budget → **walk-away** (M4).
4. **Parallel negotiations.** Buyer opens Summit and Alpine concurrently (`Promise.allSettled` over
   independent negotiation state), because the shortfall may need more than one supplier and the book
   caps *total* committed spend across concurrent deals (M4).
5. **Walk-away path.** Either side can send `WALKAWAY` with a `reasonCode` at any point; both sides
   move to terminal `WALKED` and stop.

---

## Acceptance criteria (demo checkpoint)
- [ ] Buyer↔Summit reaches `ACCEPT`+`CONFIRM` on terms within the shortfall; both stores hold the
      matching signed pair.
- [ ] An illegal transition (e.g. a second `CONFIRM`, or a `COUNTER` after `WALKAWAY`) is rejected.
- [ ] Buyer↔Alpine negotiates but does **not** auto-settle (sets up M4 escalate).
- [ ] Every message references its predecessor via `inReplyTo` and carries a monotonic `round`, so the
      full turn sequence is reconstructable from either half-trail alone.
- [ ] Negotiations run **in parallel** without cross-talk between `negotiationId`s.

## Stretch
- Stream turns to the dashboard (M6) live via SSE so the audience watches counteroffers arrive.
