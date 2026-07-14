# Milestone 4 — Mandate & policy

**Goal:** a **private** policy engine decides what the buyer's agent may commit to. Terms inside the
envelope auto-settle; terms beyond it escalate; adversarial counterparties get walked away from — and
the reservation price never leaves the process.

**Chapter tie-in:** *"Archetype 4's tiers governed what an agent could do to your own systems. Here,
policy must govern what an agent may **commit you to** in a deal with an outside party. That is a
mandate."* Plus: *"The counterparty must never be able to infer your mandate. Leaking your reservation
price to a self-interested seller's agent is a direct financial loss."*

> Pairs naturally with M3 — M3 wires the mechanism, M4 supplies the judgment.

---

## In scope
- A **mandate** with the book's four tiers, held in a store the counterparty can never read.
- Reservation-price protection and information minimization on the wire.
- Adversarial-counterparty defenses: round & time budgets, walk-away, counterparty reputation.
- Inherited Archetype-4 safeguards extended outward: **kill switch**, **cross-deal spend cap**,
  suspend-on-disconnect, relationship drift detection.

## Out of scope
- Learning reputation over many negotiations (seeded static score + a documented hook only).
- Real arbitration — M5 produces the trails an arbitrator needs; it does not adjudicate.

---

## The mandate (`seed/mandate.json`, loaded only by the buyer)

```jsonc
{
  "sku": "MER-TENT-3S",
  "reservationUnitPriceUsd": 58.00,   // NEVER sent on the wire
  "targetUnitPriceUsd": 52.00,
  "maxLeadTimeDays": 21,
  "maxUnitsPerDeal": 3000,
  "maxTotalCommittedUsd": 165000,     // cap ACROSS all concurrent negotiations
  "approvedDeliveryTerms": ["DDP"],
  "tiers": {
    "autonomousSettle": { "priceAtOrBelow": 54.00, "leadTimeAtOrBelow": 18, "counterparty": "VERIFIED" },
    "notifyOnSettle":    { "priceAtOrBelow": 58.00, "leadTimeAtOrBelow": 21, "counterparty": "VERIFIED" },
    "approveBeforeCommit": "anything beyond notify band, novel counterparty, or non-standard clause",
    "prohibited": "counterparty REJECTED in M2, or price above reservation, or terms failing compliance"
  }
}
```

## Tier logic (the judgment M3 asked for)

```ts
function classify(terms: Terms, trust: TrustLevel): Tier {
  if (trust === "REJECTED") return "PROHIBITED";                 // Tier 4 — hard block
  if (terms.unitPriceUsd > m.reservationUnitPriceUsd) return "PROHIBITED";
  const t = m.tiers;
  if (trust === "VERIFIED"
      && terms.unitPriceUsd <= t.autonomousSettle.priceAtOrBelow
      && terms.leadTimeDays <= t.autonomousSettle.leadTimeAtOrBelow) return "AUTONOMOUS_SETTLE";
  if (trust === "VERIFIED"
      && terms.unitPriceUsd <= t.notifyOnSettle.priceAtOrBelow
      && terms.leadTimeDays <= t.notifyOnSettle.leadTimeAtOrBelow) return "NOTIFY_ON_SETTLE";
  return "APPROVE_BEFORE_COMMIT";                                 // Tier 3 — human queue
}
```

- **Tier 1 `AUTONOMOUS_SETTLE`** → buyer sends `ACCEPT`/`CONFIRM` (M3) with no human. **Summit path.**
- **Tier 2 `NOTIFY_ON_SETTLE`** → settle, then push a notification to the buying team.
- **Tier 3 `APPROVE_BEFORE_COMMIT`** → **hold**; enqueue to the approval queue; do not `ACCEPT` until a
  human approves. **Alpine path.** (`LIMITED` trust from M2 also forces this, regardless of terms.)
- **Tier 4 `PROHIBITED`** → never commit; walk away if pushed. **RidgeLine path.**

## Reservation-price protection & information minimization
- The reservation price is used only inside `classify()`. It is **never** placed in any `NegotiationMsg`.
- Counteroffers reveal only the next price the buyer is willing to name, not its bound.
- A lint test asserts no outbound message body contains `reservationUnitPriceUsd` or
  `maxTotalCommittedUsd`. Make leaking it a failing test, not a code-review hope.

## Adversarial defenses (the RidgeLine walk-away)
```ts
const budget = { maxRounds: 6, maxWallClockMs: 60_000 };
```
- **Round / time budget:** if a negotiation exceeds `maxRounds` without converging, or runs past the
  time budget, the buyer sends `WALKAWAY{reasonCode:"BUDGET_EXHAUSTED"}` and moves to the next
  counterparty rather than looping forever.
- **Probe detection:** if a counterparty's messages ask for the buyer's limits/budget, the reasoning
  loop is instructed to refuse and to down-weight the counterparty's reputation.
- **Reputation:** a seeded score per DID; repeated stalls/reneges/probes lower it and can trigger early
  walk-away. (Hook documented for where cross-session learning would attach.)

## Inherited Archetype-4 safeguards, extended outward
- **Kill switch:** a buyer endpoint that severs **all** active negotiations (`WALKAWAY` to each) and
  revokes any in-flight, not-yet-`CONFIRM`ed `ACCEPT`. Wired to a dashboard button in M6.
- **Cross-deal spend cap:** before any `ACCEPT`, check `sum(committed) + thisDeal ≤ maxTotalCommittedUsd`.
  A deal that would breach the cap escalates instead of settling — the cap is *across* concurrent deals,
  not per deal.
- **Suspend on disconnect:** if the oversight/notify channel is down, new commitments are suspended
  (negotiations may continue to non-terminal states, but no `ACCEPT` is sent).
- **Drift detection:** compare settled terms per counterparty over time; flag a counterparty whose
  terms trend against the buyer even while each deal passes per-deal policy.

---

## Acceptance criteria (demo checkpoint)
- [ ] Summit's converged terms classify `AUTONOMOUS_SETTLE` → buyer settles with no human.
- [ ] Alpine's best terms classify `APPROVE_BEFORE_COMMIT` → appears in the approval queue; nothing is
      committed until an operator approves.
- [ ] RidgeLine (admitted as verified-but-adversarial) exhausts the round budget → buyer walks away;
      no commitment made.
- [ ] The no-leak lint test passes: reservation price / spend cap never appear in any wire message.
- [ ] Kill switch severs the live Alpine negotiation and revokes any pending `ACCEPT`.
- [ ] Two concurrent near-cap settles: the second is blocked/escalated by the cross-deal spend cap.

## Stretch
- Show the drift flag by replaying three historical Summit settlements trending upward in price.
