# Known limitations — accepted prototype scope

Meridian Crossing is a working-group prototype: it exists to show that four supplier agents and a buyer
agent can negotiate a real procurement across organizational boundaries, with real identity, real signed
evidence and real money movement, and to find out where that breaks. It is **not** production software,
and this file is the honest list of the places where that distinction is load-bearing.

Everything below was found deliberately — an architecture review and a standards-conformance audit, both
2026-08-12 — and then deliberately left in place. Two reasons to publish the list rather than quietly
carry it: a reader evaluating the prototype deserves to know which properties are demonstrated and which
are asserted, and a contributor deserves to know which oddities are decisions rather than bugs.

Nothing here breaks the demo. Each item is real and would matter beyond one.

## Scope note for contributors

Do not act on anything in this file unless that is the task you were given. These are recorded so nobody
re-discovers them as bugs, re-litigates them mid-task, or "helpfully" refactors them unasked. The
invariants that must survive any such work are listed at the end.

## Architecture

**1. All governance state is in-process memory; only the evidence is durable.** `SettlementManager.#records`
(`packages/buyer/src/settlement.ts`), `CommitmentLedger.reservations`, `ApprovalQueue`, and
`settlementReceipts` (`packages/buyer/src/server.ts`) live in RAM. The half-trails are append-only files,
so the *evidence* survives a restart; the state deciding whether money may move does not. A restart during
a `DEPOSIT_SENT` payment loses the record, so `sweep()` can never resume it — the idempotency-key comment
in `settlement.ts` closes only the duplicate-create half of this. The §14 payment receipts vanish too, so
`/audit?export=1` would report a captured transfer with no signed human authorisation behind it.
Post-prototype fix: an append-only journal for governance state, rehydrated on boot, plus a startup
reconcile against Stripe by `metadata.negotiationId`. Related and equally accepted: the kill switch, the
approval queue and the negotiating agent share one process, so the controls die with the thing they
control.

**2. Sessions have no lifecycle.** `NegotiationTracker.records`, the seller's `perNeg`,
`actHashByMessageId`, and A2A's `InMemoryTaskStore` all grow for the life of the process, and the commit
barrier deliberately *depends* on suppliers holding state with no expiry. With Meridian never emitting
`expires_at` (see the expiry entry under DOCUMENTED SIMPLIFICATIONS in `a2cn.ts`), an ACCEPT arriving long
after the quote still settles: offer lifetime does not exist as a concept here. Post-prototype fix:
per-session records evicted on terminal state, and outbound `expires_at` honoured — which means
regenerating the byte-stable `seed/a2cn/` fixture rather than freezing it.

**3. `agent-runtime` is three packages under one name.** It holds wire plumbing, ONE counterparty's
business strategy (`seller.ts`, `seller-llm.ts`, `disposition.ts`), org storage (trail, half-trail,
audit-log, transaction-record, approval-receipt), telemetry, and seed loading. The barrel exports ~90
symbols and every package depends on all of it, so suppliers pull in the compliance-export machinery they
never call. Eventual split: wire / identity / ledger / seller. The property worth preserving through any
such split is that buyer and seller share ONE state machine and ONE crypto path.

**4. The four supplier packages are one package copied four times.** Ignoring comments, summit and alpine
differ by an ID string and a display name; ridge differs only by dropping the LLM reasoner and using the
sync `handle`. Four `package.json`s, four tsconfigs, and every entrypoint fix has to land four times — the
bind-failure handling (commit 8465e3b) is the recent example. Eventual shape: one `@meridian/supplier`
taking the id from argv, with `concurrently` passing it. **Until then, a change to one supplier entrypoint
must be applied to all four.**

**5. Identity resolution has no seam and no cache.** `resolveDid` does `existsSync` + `readFileSync` + zod
parse on every call, on the hot path of every inbound signature check and every credential check (and
`revokedIds()` is re-read per credential per candidate). The claim that swapping in the real AGNTCY
Identity service changes nothing above `identity.ts` is not yet backed by an injection point — every
consumer calls the free function. Post-prototype fix: `DidResolver` / `CredentialStore` interfaces with the
filesystem implementation as one adapter behind a memoising cache; the `did:web` path sanitisation then
becomes an adapter detail instead of something every caller inherits.

**6. Module-global mutable state in the codec.** `actHashByMessageId` in `a2cn.ts` is a process singleton
with a test-only reset (`resetA2cnActHashes`), keyed by an unsigned `message_id` and shared across all
concurrent sessions; `wireProfileFromEnv()` is a default argument at five call sites. `negotiate.ts`
already records being bitten by the multi-read version of exactly this. Both belong on a session or
connection instance eventually.

**7. `driveNegotiation` is a ~500-line closure** (`packages/buyer/src/negotiate.ts`) holding mutable loop
state plus six inner closures that all capture `reply`, which is reassigned every iteration — so
`settle()` and `standDown()` derive their outcome round from wherever in the loop they were called.
`NegotiationSession` showed the extraction shape; the rest would be a drive object whose fields are the
loop state, with the terminal branches as methods taking the round explicitly. **Treat this file as the
highest-risk place in the repo to add a line: any new `await` between `authorizeSettle` and `bindSettle`
reopens a documented ledger bug (see `Governor.bindSettle`).**

**8. `OversightChannel` is a stub, and one safeguard is unreachable.** Delivered notifications land in a
private array that no route, trail write or dashboard panel reads — so NOTIFY_ON_SETTLE settles and tells
nobody, and only the UNDELIVERED path logs (`governor.ts`). Nothing in the product ever calls
`setConnected(false)`, so `authorizeSettle`'s suspend-on-disconnect branch is exercised only by tests. A
single `trail.append` inside `notify` would make the tier real; not doing it yet is the accepted state.

**9. The adversarial probes live inside the product flow.** `run()` in `server.ts` interleaves `tamperDemo`
and `probeIllegalTransition` with real pipeline stages, and `probes.ts` / `seller-fixtures.ts` compile into
the shipped buyer package. Moving them there (commit a382d80) achieved its goal — the proofs are seen by an
audience — at the cost of the seam: there is now no way to run the procurement without also sending
deliberately-invalid traffic at a counterparty. Eventual fix: a `probes` flag on the `negotiateAll` hooks,
defaulted on for the demo entrypoint.

**10. Test and dashboard topology.** Tests run compiled `dist`, which is why every run pays a full
clean+rebuild and why a stale compiled test could contribute phantom passes. Node 22+ type-stripping would
remove both the cost and the failure mode. Separately, the dashboard sits outside the TS project entirely —
an 825-line untyped `app.js` plus `.mjs` server and tests — so the surface holding the kill switch and the
approval buttons is the only one with no type checking. Both accepted for now.

## Standards conformance

These came from a conformance audit of the four standards this repo claims to speak.

**A2A and Stripe came back clean.** A2A uses only spec surfaces (`supportedInterfaces[]`,
`capabilities.extensions`, §3.2.6 per-request activation), and the two local choices there — refusing an
absent `A2A-Version` header as legacy 0.3, putting `recipient_did` in the DataPart wrapper — are stricter
than the spec rather than divergent. Stripe is an ordinary PaymentIntent in minor units with an idempotency
key, a pinned preview snapshot, and `rawRequest` only for the Stripe-sandbox `simulate_crypto_deposit`
test-helper.

The three below are the places where the wire or the artifact is **not** what the standard says.

**11. The A2CN §9 transaction record is Meridian-shaped, and some A2CN identifiers are ours.**
`agreed_terms` carries Meridian's own `Terms` object (`unitPriceUsd`, `leadTimeDays`, in **dollars**,
camelCase) and `record_type` / `record_version` are constants of ours, so `record_hash` equality proves
agreement between two implementations of THIS codec and is not a cross-vendor settlement artifact. That is
load-bearing: the record is hashed from the DECODED terms so a `meridian` half and an `a2cn` half of the
same deal still agree. Separately, `MERIDIAN_MANDATE_ID` (`a2cn:mandate:meridian-procurement`) and a
receipt's `a2cn:session:<negotiationId>` mint identifiers in a namespace this repo does not own — the same
mistake the `meridian_` prefix on `custom_terms` exists to prevent, in the one place it was not applied.
Renaming them changes the bytes inside a signed receipt for no functional gain. Both are written up in
[`a2cn-alignment.md`](a2cn-alignment.md) ("Known limits"); **a second implementation must not expect to
parse either.** Post-prototype fix: widen `Terms` and hash the A2CN terms object instead, and move our
identifiers into a `meridian:` namespace.

**12. Two OASF record fields are untrue of the agent.** `skills[]` carries the placeholder
`natural_language_processing/.../text_completion` (id `10201`) because OASF requires a taxonomy skill and
selling tents has none — disclosed ON the record via the `skill_placeholder: "true"` annotation, because a
code comment is invisible to anyone reading the directory. `created_at` is the frozen literal
`2026-07-15T00:00:00Z`, which is load-bearing (the Directory is content-addressed, so a real timestamp
gives the same advertisement a new CID on every boot and breaks `publishCapability`'s idempotent
re-publish) and is the one that carries NO disclosing annotation — it is noted in `infra/VERSIONS.md`
instead. Replace the skill if OASF ever adds a negotiation or commerce entry.

**13. `did:web` is not resolved, and revocation is off-standard.** The DID documents and credentials
themselves are conformant — `DataIntegrityProof` / `eddsa-jcs-2022`, signature over
SHA-256(JCS proof config) ‖ SHA-256(JCS credential), `Multikey` + `publicKeyMultibase`, key checked against
the issuer's `assertionMethod`. But `resolveDid` reads `generated/did-docs/<host>.json` off local disk and
never fetches `https://<domain>/.well-known/did.json`, so the did:web *method* is not implemented, only its
document format. Worse, **credential revocation has no standard surface at all**: `revokedIds()` consults a
flat local `revocations.json` array of VC ids, and the issued VCs carry no `credentialStatus` property, so
nothing points a conforming verifier at that list. This is the same class of defect
`infra/identity/README.md` says it corrected in the proofs — self-consistent between our issuer and our
verifier, uncheckable by anyone else. Post-prototype fix: a `BitstringStatusList` credential referenced
from each VC's `credentialStatus`, resolved through the same adapter seam item 5 describes.

## Invariants — do not "fix" these while working on something else

The following are load-bearing and must survive any future refactor of the above verbatim: the two private-
mandate leak lints and `rationale.ts`'s value-based comparison; the half-trail / §9 two-hash agreement
design (no org ever reads another's store); the ACCEPT-is-the-settle asymmetry and every
`settle-unknown` / `CAPTURE_UNCONFIRMED` branch that follows from it; and the comment style itself —
comments here explain WHY and name the failure the code prevents.
