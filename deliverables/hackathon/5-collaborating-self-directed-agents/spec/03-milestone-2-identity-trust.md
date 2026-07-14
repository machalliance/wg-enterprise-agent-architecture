# Milestone 2 — Identity & trust across boundaries

**Goal:** before committing anything of value, the buyer **cryptographically verifies** each
counterparty's identity and checks its claims — rejecting an agent that is attractive on paper but
whose identity or credentials do not check out.

**Chapter tie-in:** *"Archetype 4 gave your agent a durable, scoped, revocable credential. This
archetype adds the harder half: verifying the identity of an agent someone else issued."* The three
questions the buyer must answer: is the counterparty who it says it is; are its claims verifiable or
merely self-asserted; and is the selling agent actually authorized to commit its supplier to a deal.
*"Trust is graduated."*

**AGNTCY component:** **AGNTCY Identity** — W3C **Decentralized Identifiers (DIDs)** and **Verifiable
Credentials (VCs)**.

> Note: cryptographic verification is the fiddliest part of the whole prototype — budget accordingly.

---

## In scope
- Stand up the AGNTCY Identity service (`infra/identity`); issue **DIDs** and **VCs** to Summit and
  Alpine. Issue RidgeLine either **no verifiable DID** or a VC that fails signature/issuer checks.
- Buyer performs a three-part check on every discovered candidate before engaging.
- Every subsequent A2A message is **signed** with the sender's DID key; the receiver verifies.
- **Graduated trust:** map verification strength to how far negotiation may proceed.

## Out of scope
- Full revocation infrastructure and credential-status lists. Model revocation as a static "revoked"
  flag on one fixture to show the code path, but do not build a live status service.

---

## Build tasks

1. **Issue identities.** Using AGNTCY Identity, create:
   - `did:web:summit-gear.example` + VC: *business identity* (issuer = a seeded mock trust anchor) and
     *on-time-delivery attestation* (the claim the OASF record only *asserted* in M1).
   - `did:web:alpine-supply.example` + the same, all valid.
   - `did:web:ridgeline-trading.example`: **choose one failure mode** — unresolvable DID document, VC
     signed by an untrusted issuer, or a revoked VC. This is what forces the walk-before-you-buy drop.
2. **Three-part verification** in the buyer, run per candidate from M1:
   ```ts
   async function verifyCounterparty(c: OasfRecord): Promise<TrustLevel> {
     const idOk    = await identity.resolveAndVerifyDid(c.agent.did);          // "who it says it is"
     const claimsOk= await identity.verifyCredentials(c.agent.did, [          // "verifiable, not asserted"
       "BusinessIdentity", "OnTimeDelivery"]);
     const authOk  = await identity.verifyCommitAuthority(c.agent.did);        // "authorized to commit the supplier"
     if (!idOk) return "REJECTED";
     if (idOk && claimsOk && authOk) return "VERIFIED";     // full negotiation allowed
     return "LIMITED";                                       // e.g. identity ok, authority unproven
   }
   ```
3. **Signed messages.** Extend the M0 envelope: the sender signs a canonical hash of the envelope with
   its DID key; `agent-runtime` verifies the signature and the `from` DID on receive, dropping anything
   that fails. This is the substrate for M5's non-repudiation.
   ```ts
   export const SignedEnvelope = Envelope.extend({
     sig: z.string(),        // signature over canonicalize(envelope-without-sig)
     didKeyId: z.string(),   // which verification method in the DID doc signed it
   });
   ```
4. **Graduated-trust gate.** `VERIFIED` → may proceed to auto-settle tiers (M4). `LIMITED` → may
   negotiate but every settle is forced to escalate. `REJECTED` → **hard block, no messages exchanged**.

## Trust levels → downstream effect

| Result | Meaning | Effect on negotiation (M3/M4) |
|---|---|---|
| `VERIFIED` | DID resolves, VCs valid, commit-authority proven | Eligible for autonomous settle within mandate |
| `LIMITED` | Identity ok but a claim/authority unproven | May negotiate; any settle **forced to escalate** |
| `REJECTED` | DID unresolvable or VC invalid/revoked | **Hard block** — Tier 4 in the mandate (M4) |

---

## Acceptance criteria (demo checkpoint)
- [ ] Summit and Alpine verify to `VERIFIED`; **RidgeLine is `REJECTED`** and the buyer exchanges no
      negotiation message with it.
- [ ] A message with a tampered body or a wrong-key signature is **rejected by the receiver**, visibly.
- [ ] The dashboard/log shows *why* RidgeLine failed (unresolvable DID / bad issuer / revoked), not
      just that it failed.
- [ ] Flipping RidgeLine's fixture to a valid identity re-admits it — proving the gate is real, not a
      hardcoded name check. (Useful to stage the M4 walk-away demo with a *verified-but-adversarial*
      RidgeLine.)

## Stretch
- Show the incentive asymmetry the book names: log that the buyer requires *verified* identity + signed
  messages precisely because "the incentive to misrepresent is real" for a self-interested seller.
