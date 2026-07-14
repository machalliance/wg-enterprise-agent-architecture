# Milestone 1 — Discovery

**Goal:** the buyer's procurement agent finds candidate supplier agents through a **directory**, from a
machine-readable **capability description** — not a hardcoded list of endpoints — and filters the
results by policy.

**Chapter tie-in:** *"Inside one organization you wire agents together by hand. Across organizations
that does not scale."* Capability descriptions "function as contracts: your agent decides whether to
engage based on a structured, verifiable description rather than a PDF integration guide." And:
*"finding a supplier's agent is not the same as being cleared to buy from it."*

**AGNTCY component:** **Agent Directory (`dir`)** — federated, content-addressed, cryptographically
signed — indexing **OASF** capability records.

**Time-box:** half a day.

---

## In scope
- Stand up the AGNTCY Agent Directory (docker-compose in `infra/dir`).
- Each supplier **publishes** an OASF record describing its capabilities (product lines, available
  quantity, lead time, region, certifications-claimed).
- Buyer **queries** the directory for records matching the shortfall, then applies a **policy filter**.

## Out of scope
- *Verifying* that a supplier's claims are true — that is M2. Here, published claims are taken as
  advertised; discovery only decides *who to consider*, not *who to trust*.

---

## Build tasks

1. **OASF capability record.** Model each supplier's advertisement on OASF. Publish via the `oasf-sdk`
   (or the directory's REST API from TS if the JS SDK lags). Minimal shape:
   ```jsonc
   // seed/catalogs/summit.oasf.json
   {
     "schemaVersion": "oasf/v0.x",
     "agent": { "did": "did:web:summit-gear.example", "name": "Summit Gear Selling Agent" },
     "skills": ["rfq.respond", "negotiate.price", "negotiate.leadtime"],
     "capabilities": {
       "product": "three-season-tent",
       "maxUnits": 4000,
       "minLeadTimeDays": 14,
       "regions": ["NA"],
       "claims": { "onTimeDeliveryRate": 0.97, "iso9001": true }   // ASSERTED — verified in M2
     },
     "endpoint": { "transport": "slim", "address": "summit.local:46357" }
   }
   ```
   Seed all three suppliers. Give RidgeLine attractive numbers (`maxUnits: 5000`) so it *looks* like
   the best match — the point of M2 is that attractive-but-unverifiable must still be rejected.
2. **Publish on startup.** Each supplier process announces its record to the directory when it boots.
3. **Buyer discovery query.** Query by capability, not by name:
   ```ts
   const candidates = await dir.search({
     product: "three-season-tent",
     minUnits: scenario.shortfall.unitsNeeded,   // 3000
     maxLeadTimeDays: scenario.shortfall.deadlineDays, // 21
   });
   ```
4. **Policy filter.** Being findable ≠ being allowed. Apply a buyer-side allowlist/denylist pass over
   the results *before* engaging:
   ```ts
   const eligible = candidates.filter(c =>
     policy.discovery.regionAllowed(c.capabilities.regions) &&
     !policy.discovery.denied(c.agent.did)
   );
   ```
   Log every candidate that was dropped and why — this becomes a row in the decision trail (M5).

## Data contract additions
- `packages/protocol` gains an `OasfRecord` zod schema mirroring the JSON above, so the buyer validates
  what the directory returns rather than trusting its shape.

---

## Acceptance criteria (demo checkpoint)
- [ ] All three suppliers self-publish to the directory on boot; `dir` list shows three records.
- [ ] Buyer's capability query returns exactly the matching candidates — with **no supplier endpoint
      hardcoded anywhere in the buyer**.
- [ ] The policy filter visibly drops or admits candidates, and the reason is recorded.
- [ ] Killing a supplier process and restarting it re-announces it — discovery is dynamic, not static.

## Stretch
- Show content-addressing: mutate a published record and demonstrate the directory's signed digest
  changes, so the buyer can detect tampering with an advertisement.
