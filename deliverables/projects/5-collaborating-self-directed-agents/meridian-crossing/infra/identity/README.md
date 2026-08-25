# Identity service — AGNTCY Identity

W3C **DIDs** + **Verifiable Credentials**, over real Ed25519. This is the "harder half" of the
identity story: verifying an identity that *someone else* issued, before committing anything of value.

## The proof suite: `eddsa-jcs-2022`

Credentials carry a W3C Data Integrity proof — `type: "DataIntegrityProof"`, `cryptosuite:
"eddsa-jcs-2022"` — and DID documents publish a `Multikey` with `publicKeyMultibase`. The suite signs
`SHA-256(JCS(proof config)) ‖ SHA-256(JCS(credential))`, so the proof's own `created`, `proofPurpose`
and `verificationMethod` are covered by the signature rather than sitting beside it. `proofValue` is
multibase base58btc, as Data Integrity requires.

`eddsa-jcs-2022` is the suite whose canonicalization step is RFC 8785 JCS — the transform
`packages/protocol/src/canonical.ts` already performs for envelopes and record hashes. So this is the
conformant name for what the repo actually computes; nothing here reimplements JSON-LD.

**This corrects a real defect.** Proofs used to be labelled `Ed25519Signature2020` while being produced
as base64 over JCS with the credential alone signed, and DID documents carried a `publicKeyBase64`
property that no W3C key type defines. Every credential verified — against our own verifier, which made
the same two mistakes — and **none of them could have been checked by a conforming implementation**,
which is the one property a verifiable credential exists to have. `verifyCredentialProof` now refuses
a proof whose suite it does not implement, and requires the signing key to appear in the issuer's
`assertionMethod`, so a proof purpose can no longer be self-declared.

It runs as a **self-contained issuance authority** — a seeded mock trust anchor — rather than a
remote container. That mirrors how discovery runs the real Directory but standalone-minimal: the crypto is
genuine (real keys, real signatures, real issuer/subject binding), so the trust gate is
cryptographic, not a name check. The production swap-in is the real AGNTCY Identity service; nothing
above `packages/agent-runtime/src/identity.ts` would change.

## Mint the identities

```bash
pnpm identity:issue        # node infra/identity/issue.mjs
```

This writes everything under `generated/`. The whole tree is **gitignored**, private keys included — it
is machine-generated from `seed/` plus `config.json`, and `pnpm demo`/`dev`/`test` all run this script
first, so a fresh clone needs no extra steps:

```text
generated/
  keys/<domain>.json         # each org's private signing key (PKCS8 DER, base64) — KEPT across runs
                             #   gitignored; DERIVED from the committed seed, so a clone reproduces it
  did-docs/<domain>.json     # each org's resolvable did:web document (public key) — regenerated
  credentials/<domain>.json  # the VCs issued to each org                          — regenerated
  revocations.json           # the seeded credential-status list                   — regenerated
  manifest.json              # what was issued, and RidgeLine's active failure mode
```

Private keys are **reused** across runs so flipping a fixture never churns keys other processes
already trust. Only the derived trust artifacts (DID docs, VCs, revocations) are regenerated. Reuse
does not depend on the files being committed: each key is derived deterministically from the committed
`KEY_DERIVATION_SEED` and the org's DID (see `ensureKey`), so a fresh clone regenerates byte-identical
keys. These are demo fixtures, not secrets — which is why deriving them from a public seed is safe, and
why the generated tree can be gitignored without the demo losing reproducibility.

## What each org gets

| Org | DID | Credentials (issuer) | Verifies to |
|---|---|---|---|
| Summit Gear | `did:web:summit-gear.example` | BusinessIdentity, OnTimeDelivery, CommitAuthority (trust anchor) | `VERIFIED` |
| Cascade Gear | `did:web:cascade-gear.example` | same, all valid (trust anchor) | `VERIFIED` |
| Alpine Supply | `did:web:alpine-supply.example` | same, all valid (trust anchor) | `VERIFIED` |
| RidgeLine | `did:web:ridgeline-trading.example` | **see failure mode below** | `REJECTED` |
| Meridian (buyer) | `did:web:meridian-outfitters.example` | none needed — it verifies others | signs its own messages |
| Meridian operator | `did:web:meridian-operator.example` | ApprovalAuthority (trust anchor) | signs A2CN §14 ApprovalReceipts |
| Trust anchor | `did:web:meridian-trust-anchor.example` | — | the only trusted issuer |
| Rogue issuer | `did:web:rogue-issuer.example` | — | used only by the `untrusted-issuer` fixture |

The `OnTimeDelivery` VC attests the on-time rate that the OASF record only **asserted** at discovery
— the point of this layer: verifiable, not merely self-asserted.

The **operator** is a separate principal from the buyer agent on purpose. A2CN §14.1 requires an
ApprovalReceipt to be signed by an operator-side key the mandate issuer trusts, so its
`ApprovalAuthority` VC (`authorizedTo: approve-over-mandate-commitments`) is what makes a receipt
evidence that a *human* cleared a deal the agent could not clear alone. If the agent signed its own
approvals the receipt would prove nothing.

## Keys are derived, not random

Every private key here is derived from a committed public seed (`ensureKey` in `issue.mjs`), so a fresh
clone reproduces the same DIDs, signatures and trails as any other machine. That is deliberate: the key
store is gitignored, and when keys were randomly generated the byte-stable A2CN fixture in `seed/a2cn/`
could only ever verify on the machine that minted it — `pnpm test` failed on every fresh clone.

**These identities are fixtures and must never be used for anything real.** The seed is public, so the
private keys are public too. A production issuer generates randomly and protects the result.

## RidgeLine's failure fixture (the flip)

`config.json` selects how RidgeLine's identity is broken. This is what forces the walk-before-you-buy
drop, and flipping it proves the gate is real:

| `ridgeFailureMode` | What breaks | Buyer result |
|---|---|---|
| `untrusted-issuer` (default) | VCs signed by the rogue issuer, not the trust anchor | `REJECTED` |
| `unresolvable-did` | no DID document is published | `REJECTED` |
| `revoked` | valid VCs, but on the revocation list | `REJECTED` |
| `none` | fully valid credentials from the trust anchor | **`VERIFIED`** — re-admitted |

```bash
# Re-admit RidgeLine to prove the gate is cryptographic, not a hardcoded name check:
#   edit config.json -> "ridgeFailureMode": "none"
pnpm identity:issue
```

## How it maps to the three-part check

The buyer runs `verifyCounterparty` (in `@meridian/agent-runtime`) per candidate:

1. **`resolveAndVerifyDid`** — "is it who it says it is": the `did:web` resolves to a well-formed
   document claiming that same id. Unresolvable → `REJECTED`.
2. **`verifyCredentials`** — "verifiable, not asserted": every required VC is present, issued by the
   trust anchor, signature-valid, and unrevoked. An *invalid* VC → `REJECTED`.
3. **`verifyCommitAuthority`** — "authorized to commit its supplier": a valid CommitAuthority VC.

`VERIFIED` (all three) → eligible for autonomous settle in the mandate. `LIMITED` (identity ok, a
claim/authority merely *unproven*) → may negotiate, settle escalates. `REJECTED` (unresolvable DID or
an invalid/revoked VC) → hard block, no messages exchanged.

Every A2A message is also **signed** with the sender's DID key and verified on receive; a tampered
body or wrong-key signature is dropped by the receiver (see the tamper test the buyer runs against a
verified supplier). This is the substrate for non-repudiation.
