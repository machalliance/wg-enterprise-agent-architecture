# Milestone 5 — Accountability when no one sees the whole picture

**Goal:** each organization keeps its **own signed half-trail**; the settled order is provable by either
party independently; and the two half-trails can be **lined up by correlation ID** to reconstruct the
exchange after the fact — even though neither side ever saw the other's internal reasoning.

**Chapter tie-in:** *"Across organizations, Meridian sees only its own half of the reorder... never the
supplier's internal reasoning."* This forces **non-repudiable exchange** (signed offers/acceptances
tied to verified identities), **correlatable trails** (shared correlation identifiers so two half-trails
line up), and **cross-organization observability** (instrument your side fully; rely on protocol-level
evidence for the counterparty). *"Telemetry here is conventional observability applied to agents."*

**AGNTCY component:** **Observe** / **OpenTelemetry** (the AGNTCY observability schema extends the OTel
GenAI semantic conventions). Signing rides on the M2 DID keys.

**Time-box:** half a day to a day.

---

## In scope
- A per-organization, append-only, signed decision store (buyer + each supplier keep their own).
- Non-repudiation: the `ACCEPT`+`CONFIRM` pair is signed by both DIDs; either side can produce a proof.
- Correlation: `negotiationId` + per-message `correlationId` (from M0) on every record, so half-trails
  reconcile.
- OTel spans on the AGNTCY schema, exported to a local collector, one trace per negotiation.
- A **reconcile** tool that takes two half-trails and proves (or disproves) they agree on the terms.

## Out of scope
- A shared/global ledger. There is deliberately **no** shared store — that would reintroduce the
  orchestrator the archetype removes. Reconciliation happens by comparing two independent trails.

---

## Build tasks

1. **Signed half-trail.** Each org appends every sent/received message to its own store as a record:
   ```ts
   export const TrailRecord = z.object({
     negotiationId: z.string().uuid(),
     correlationId: z.string().uuid(),
     round: z.number().int(),
     direction: z.enum(["SENT", "RECEIVED"]),
     msgType: NegotiationMsg.shape.type,
     termsHash: z.string(),          // hash of Terms at this step (not the raw terms in the counterparty's copy)
     counterpartyDid: z.string(),
     sig: z.string(),                // signature by THIS org over the record
     recordedAt: z.string().datetime(),
   });
   ```
   The store is append-only and hash-chained (each record includes the prior record's hash) so it is
   tamper-evident within one organization.
2. **Non-repudiable settlement.** At settle, the buyer holds Summit's signed `ACCEPT`/`CONFIRM` and
   Summit holds the buyer's — each a standalone proof of the agreed `Terms`, verifiable against the
   other party's DID from M2. Neither can later deny the terms.
3. **Dispute-terms reference.** Per the protocol (M3), the pre-agreed `disputeTermsRef` is present in
   the exchange **before** either `CONFIRM`. Record it in both trails so an arbitration path has a
   starting point. *(An out-of-mandate or unverified commitment is void by protocol — M4 Tier 4 — so it
   should never reach a dispute.)*
4. **OTel instrumentation.** Wrap the reasoning loop and each message send/receive in spans following
   the AGNTCY observability schema; one trace per `negotiationId`. Export to a local collector. The
   buyer instruments itself fully and records only **protocol-level evidence** (the signed messages) for
   the counterparty — the chapter's exact prescription.
5. **Reconcile tool** (`packages/agent-runtime/src/reconcile.ts`):
   ```ts
   // Takes the buyer half-trail and a supplier half-trail; matches on (negotiationId, correlationId);
   // verifies each side's signatures; asserts the SETTLED termsHash matches on both sides.
   // Returns { matched, mismatches, settledTerms, provenBy: ["did:web:...", "did:web:..."] }.
   ```
   This is the demo's punchline: two independently-kept trails, no shared store, provably in agreement.

---

## Acceptance criteria (demo checkpoint)
- [ ] Buyer and Summit each hold their own signed, hash-chained half-trail; neither wrote to the other's.
- [ ] `reconcile()` matches the two half-trails on correlation IDs and confirms identical settled terms,
      each verified against the counterparty's DID.
- [ ] Tampering with one record breaks that org's hash chain **and** the reconcile match — detectable.
- [ ] One OTel trace per negotiation is visible in the collector, spanning discovery → verify →
      negotiate → terminal state.
- [ ] The buyer trail contains protocol-level evidence for Summit but **no** Summit-internal reasoning —
      demonstrating "you only ever see your own half."

## Stretch
- Simulate a delivery dispute: mutate one side's claimed terms and show reconcile flags the mismatch,
  with both signed originals available to an arbitrator.
