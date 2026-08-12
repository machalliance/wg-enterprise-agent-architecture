# A2CN alignment

The negotiation layer made the chapter's core claim executable — *"two agents built on different stacks
cannot negotiate unless they share a message contract"* — with a contract of Meridian's own. The
enterprise lesson is that the contract should be an **open standard** where one exists. For this
layer that standard is **A2CN** — the Agent-to-Agent Commercial Negotiation Protocol
([github.com/A2CN-protocol/A2CN](https://github.com/A2CN-protocol/A2CN), Apache-2.0), which occupies
exactly the negotiation slot in the stack.

This adds A2CN as a **second wire profile** — a codec at the message boundary — selectable with
`WIRE_PROFILE=a2cn`. The default stays `meridian` so the default negotiation demo is byte-for-byte
reproducible.

> **Provenance / accuracy note.** This codec is built against the **real** A2CN v0.2.0 spec and JSON
> schemas, read from the A2CN repo on 2026-07 (`spec/a2cn-spec-v0.2.0.md`, `spec/schemas/`). An earlier
> draft of this codec modelled A2CN from its prose/marketing description and got several things
> wrong (camelCase fields, a flat single-item deal, an `IMPASSE` terminal state, reusing the
> identity-layer envelope signature on the wire). Those are corrected here. A2CN v0.2.0 is a **Draft —
> not for production use**, with a Python reference implementation and the A2A extension still in
> proposal (OQ-011) — **re-check the schemas before shipping.** The one thing this codec cannot claim is a live round-trip against the
> Python reference implementation; that is covered instead by a golden fixture (see below).

## What standard covers which layer

| Layer | Concern | Standard this prototype speaks |
|---|---|---|
| Transport | Move bytes between agents | **A2A** over HTTP/JSON-RPC |
| Discovery | Find a counterparty by capability | **AGNTCY Agent Directory** + **OASF** |
| Identity | Prove who may commit | **W3C DID + Verifiable Credentials** — A2CN calls this *commit-authority* |
| **Negotiation** | **Offer / counter / accept / walk** | **A2CN v0.2.0** `goods_procurement` — *this document* |
| Payment | Settle the money | **AP2 / ACP** is the standards answer and is not implemented here; the optional `--usdc` layer closes the seam concretely instead, with a Stripe crypto PaymentIntent (USDC on Tempo) |

## The mapping (to the real A2CN v0.2.0)

### Verbs → `message_type`

| Meridian | A2CN `message_type` | Note |
|---|---|---|
| `RFQ` | `offer` (round 1, unpriced) | buyer's opening; see the RFQ simplification below |
| `QUOTE` | `offer` **when priced** | a counterparty's priced opening — see "a priced `offer`" below |
| `QUOTE` | `counteroffer` (A2CN round 2) | supplier's first priced response |
| `COUNTER` | `counteroffer` (round ≥ 3) | 1:1 |
| `ACCEPT` | `acceptance` (carries `accepted_offer_id`) | buyer accepts the terms on the table |
| `WALKAWAY` | `rejection` / `withdrawal` (+ terminal state) | reason code selects the terminal state |

The Meridian verb is reconstructed on decode purely from A2CN semantics — an unpriced `offer`→RFQ, a
`counteroffer` at round 2 is the first `QUOTE` and later ones are `COUNTER`s, an `acceptance` is the
settling `ACCEPT`. Every one of those keys off `message_type`, which is INSIDE the signed protocol
act, so the verb a receiver derives is covered by the sender's signature.

**A priced `offer`.** Meridian only ever *emits* the unpriced kind (the `total_value: 0` stand-in for
`session_invitation`), and the decoder used to return `RFQ` for every `offer` — which read our own bytes
back correctly and misread everyone else's. A conforming counterparty opening with a priced offer, the
ordinary A2CN case, decoded as a *request for a quote that carries a price*: schema-valid, because `RFQ`
is not a price verb and its terms may be partial, after which the receiving agent quotes against a number
the sender meant as its offer. The decoder now maps a priced `offer` to `QUOTE`, which is Meridian's word
for a priced opening position.

That does not make an *unsolicited* opening work: `admitInbound` still refuses a `QUOTE` with no `RFQ`
before it, because Meridian's negotiation model opens at the RFQ and has no verb for a counterparty
initiating with a price. The change turns a silent misread into the state machine's own explicit refusal,
and decodes a mid-session priced re-offer correctly. Accepting an unsolicited opening properly means
implementing A2CN's `session_invitation` (Component 8) — the same gap the opening-RFQ simplification names.

There is no `CONFIRM`: Meridian settles on a single `ACCEPT`, exactly as A2CN settles on a single
`acceptance`. No Meridian-specific hint is smuggled into the verb mapping — the only riders on the wire
are the three informational `meridian_*` keys catalogued below, and no verb, state or trust decision
reads them. (A2CN rounds are 1-based, Meridian's are 0-based, so A2CN `round_number = meridian round + 1`.)

### Terminal states (real §8.2)

| Meridian `reasonCode` | A2CN `terminal_state` |
|---|---|
| (settle) | `COMPLETED` |
| `POLICY`, `OUT_OF_TERMS`, `BUDGET_EXHAUSTED` | `REJECTED_FINAL` |
| `TIMEOUT` | `TIMED_OUT` |
| `DONE` (clean mutual disengage) | `WITHDRAWN` |

A2CN's terminal vocabulary is **coarser** than Meridian's reason codes: `POLICY`, `OUT_OF_TERMS`, and
`BUDGET_EXHAUSTED` all collapse to `REJECTED_FINAL` ("max rounds reached without agreement"). The
normative spec has **no `IMPASSE` state** — that string only appears on A2CN's marketing page. `ERROR`
(unrecoverable protocol error) is a fifth terminal state we do not emit.

### Terms → A2CN `goods_procurement` (§7.1 + schema)

| Meridian `Terms` | A2CN | Note |
|---|---|---|
| `unitPriceUsd` × `units` | `terms.total_value` | **minor units (cents)**, integer, required |
| — | `terms.currency` | `"USD"` |
| `sku` | `line_items[].description` + `internal_part_number` | |
| `units` | `line_items[].quantity` | |
| `unitPriceUsd` | `line_items[].unit_price` + `.total` | **cents**, integer |
| `leadTimeDays` | `terms.delivery_days` | required by the `goods_procurement` extension |
| `deliveryTerms` (`FOB`/`DDP`) | `terms.delivery_terms.incoterms` | |

Money is carried in **minor units (cents)** because A2CN's `total_value`/`unit_price` are integers —
$98.00 → `9800`. The demo's settled deal, `$91.68/u × 100u`, → `total_value: 916_800`. (The golden fixture
in `seed/a2cn/` is a frozen 3,000-unit message kept byte-stable on purpose, so its figures differ.)

### Message envelope & signing (real §7.1 / §7.3)

Each A2CN message carries `message_id`, `session_id` (← Meridian `negotiationId`), `in_reply_to`,
`round_number`, `sequence_number`, `sender_did`, `sender_verification_method`, `timestamp`, `terms`,
`protocol_act_hash`, and `protocol_act_signature`.

**This is where the biggest change from the earlier draft lives.** A2CN does **not** reuse an outer
envelope signature — it signs its own *protocol act*:

1. Build the §7.3.1 object `{protocol_version, session_id, round_number, sequence_number,
   message_type, sender_did, timestamp, expires_at, terms}` — the full act, not just the terms, so a
   valid offer signature cannot be replayed cross-session, cross-round, or past its expiry.
2. `protocol_act_hash = base64url(SHA-256(JCS(act)))` (RFC 8785 canonicalization).
3. `protocol_act_signature` = a compact JWS whose payload segment is
   `base64url(ASCII(protocol_act_hash))`. A2CN allows **ES256 or EdDSA**; we use **EdDSA over the
   agents' existing Ed25519 DID keys**, so no new key material and the DID identities are reused,
   not replaced. Verification resolves the `sender_did` and checks the JWS — this is A2CN's own
   commit-authority check, mapped onto the identity substrate.

Consequently the identity-layer Ed25519 *envelope* signature is **not** on the A2CN wire (A2CN has
no field for it). The `meridian` profile is unchanged and still uses it; the `a2cn` profile verifies the A2CN
protocol-act JWS instead. The wire-profile seam therefore owns both encoding **and** the signature
check (`WireProfile.verify`), which is why the runtime routes inbound verification through the profile.

### What the protocol-act signature does and does not cover

The §7.3.1 act signs `{protocol_version, session_id, round_number, sequence_number, message_type,
sender_did, timestamp, expires_at, terms}`. Several message fields sit outside it — `terminal_state`,
`message_id`, `in_reply_to`, `accepted_offer_id` — as does `recipient_did`, which is not in the message at
all but one level up, in the binding wrapper.

**That omission is intentional in A2CN, and safe there**, because A2CN never lets those fields carry
weight. It proves a completed deal three other ways, all cryptographic:

1. `message_type: "acceptance"` — signed, inside the act.
2. **§7.4 `acceptance_signature`** — a *second* signature over `{session_id, round_number,
   sequence_number, accepted_offer_id, accepted_protocol_act_hash}`, where
   `accepted_protocol_act_hash` MUST equal the accepted offer's `protocol_act_hash`. This welds an
   acceptance to one specific protocol act.
3. **§9 transaction record** — deterministic, content-addressed, derived independently by both
   parties, and the authoritative settlement artifact.

An earlier build of this codec implemented none of 2 or 3, and then used the unsigned
`terminal_state` as the sole `ACCEPT`-vs-`CONFIRM` discriminator. Flipping one unsigned string
promoted a lone `ACCEPT` into a settled order with the act JWS still verifying. **The gap was ours,
not A2CN's** — it came from adopting the field names without the mechanisms that make them safe.

We now implement §7.4 in full — an acceptance must cite both `accepted_offer_id` and
`accepted_protocol_act_hash`, and the receiver resolves the cited offer and refuses the acceptance
unless the recorded act hash matches. `expires_at` is signed *and* enforced at verification, so offers
stop being usable once they lapse. §9 is implemented too — see
[§9 transaction record](#9-transaction-record--and-why-reconcile-is-gone) and `transaction-record.ts`.

#### No Meridian-only extension is load-bearing, and what remains is namespaced

An interim build carried a load-bearing one: a digest of `terminal_state` inside `terms.custom_terms`,
because Meridian's two-message `ACCEPT`+`CONFIRM` commit needed to tell two `acceptance` messages apart
and §7.4's signed object does not include that field.

**The commit model was collapsed instead.** Meridian now settles on a single `ACCEPT`, matching A2CN,
so there are no longer two acceptances to distinguish and `terminal_state` is decorative — no verb,
state, or trust decision reads it. The extension was deleted, and inbound is no longer stricter than the
spec.

Three informational riders still travel in `custom_terms`, and all three are prefixed **`meridian_`**:

| Key | Why it exists |
|---|---|
| `meridian_party` | the §9 party declaration standing in for SessionInit/SessionAck |
| `meridian_rationale` | §13.9.2 asks for a rationale that §7.1 defines no field for |
| `meridian_opening_rfq` | marks the unpriced opening `offer` standing in for `session_invitation` |

The prefix is the whole point. `custom_terms` is A2CN's own extension point, which means a later spec
version may define keys there — and two of these were originally unprefixed (`a2cn_party`,
`opening_rfq`), names we do not own. A v0.3 defining either would not have broken anything loudly; our
value would simply also have been read as the spec's. Nothing in the codec depends on the spelling, so
owning the namespace was cheap. `A2CN_CUSTOM_TERMS_KEYS` is the exported list, and the acceptance suite
asserts every key on the wire is in it **and** carries the prefix.

What that traded away is stated plainly, because it is a real loss: the old two-message commit left a
window between `ACCEPT` and `CONFIRM` in which the kill switch could un-commit a deal. An `ACCEPT`
now binds when it is sent. The safeguard moved earlier rather than disappearing — every gate (kill
switch, oversight-down, cross-deal cap, commit barrier, human approval) runs *before* the `ACCEPT` is
emitted — but a deal cannot be recalled once it is away.

Both halves of the agreement remain provable from either trail alone: the seller's signed offer and
the buyer's signed `ACCEPT` naming it, welded by `accepted_protocol_act_hash` on the wire and by the
§9 transaction record both sides derive independently.

### Addressing and message ids are deliberately not signature concerns

`recipient_did` is **our** field, and it lives in the binding wrapper rather than in the A2CN message —
A2CN messages carry no recipient, because the spec puts addressing at the transport (§16 / OQ-011). No
protocol-act signature can ever bind it. A signature proves who
*wrote* a message, never who it was *for*, so a message signed for one supplier can be replayed
verbatim to another and verify perfectly. `checkAddressedTo` enforces this at the A2A boundary
instead, for **both** profiles — `meridian` signs `to`, which stops it being altered but not the
message being redirected.

`message_id` / `in_reply_to` are correlation metadata in A2CN, which orders messages by the signed
`round_number` / `sequence_number` and links acceptances by content hash, not by id. Meridian's
`NegotiationTracker` additionally chains on `inReplyTo`; treat that as a local sanity check, not a
trust boundary — the cryptographic ordering guarantees come from the signed fields.

### Profile selection is the receiver's, not the sender's

Inbound payloads were originally routed by shape (`detectWireProfile`), which handed the *sender* the
choice of which signature scheme it would be checked against — and the two schemes do not protect the
same fields. An A2CN-shaped payload therefore downgraded a `meridian` agent onto the narrower check
with no configuration on the receiving side at all.

`profileForInbound` now resolves that against what the receiving agent actually speaks, and it does so
symmetrically for **negotiation payloads**: a `meridian` agent refuses A2CN bytes outright, and an
`a2cn` agent refuses a negotiation verb (`RFQ` / `QUOTE` / `COUNTER` / `ACCEPT` / `WALKAWAY`) that
arrives as a plain Meridian envelope. Accepting the latter would be the same downgrade in reverse — a
bare-envelope `ACCEPT` never reaches the §7.4 acceptance-binding check.

The **only** plain envelopes an `a2cn` agent accepts are the verbs with no A2CN representation at all:
the PING/PONG handshake, and the transport `ACK` that answers a settling `ACCEPT`. Refusing those would
break traffic A2CN cannot express.

Mixed-profile **auto-detection** is therefore confined to `detectWireProfile`, which reads bytes already
committed to a half-trail — where a session may legitimately be mixed-profile and nothing is being
trusted, only replayed.

### Documented simplifications

- **A2A binding (§16).** The normative A2A composition binding is not in the published spec text — it
  rides in the OQ-011 proposal. We define a minimal binding: the A2A `DataPart` payload is a **wrapper**,
  `{ a2cn, recipient_did }`, whose `a2cn` member is the A2CN message and nothing else. A2CN messages carry
  no recipient; A2A addresses it.

  `recipient_did` used to sit **inside** the message. It verified fine — nothing signs it — but it meant
  the object this codec called an A2CN message was not one: validated against `spec/schemas/` it carried an
  unexpected member, so the property the codec exists to preserve (our bytes are A2CN's bytes) was not
  actually true. The wrapper costs a nesting level and buys back exact conformance.
- **Opening RFQ.** The buyer's RFQ has no price, but A2CN offers require `total_value`. We encode it
  as an `offer` with an unpriced line item, `total_value: 0`, and `custom_terms.meridian_opening_rfq:
  true`. A production deployment would use A2CN's `session_invitation` (Component 8), which requires
  discovery endpoints out of scope here.
- **Not modelled:** Level-3 delivery/dispute messages. The §9 transaction record IS implemented — see
  below.

## Extension negotiation & fallback

The `a2cn` profile advertises the OQ-011 A2A extension on the agent card
(`capabilities.extensions[].uri`). `makeAgentCard` advertises the active `WIRE_PROFILE`'s extension
automatically. `selectWireProfile(pref, card)` picks A2CN only when both sides want it; otherwise it
falls back to `meridian`.

**And the buyer actually runs that.** `WIRE_PROFILE` is a PREFERENCE; the effective profile is chosen in
`connectChannel` (`packages/buyer/src/negotiate.ts`) from the card `Transport.connect` now hands back
alongside the client, then threaded down as the one value the encoder, the half-trail tag and the OTel
`agntcy.wire.profile` attribute all read. This is worth spelling out because it was not true for a while:
`connect` resolved the card, origin-checked it and discarded it, so `selectWireProfile` was called only by
tests and the buyer read the env var directly. `WIRE_PROFILE=a2cn` against a supplier on the default
profile therefore encoded A2CN at it anyway and had every negotiation verb refused by `profileForInbound` —
the opposite of the graceful downgrade documented here. The `summit-downgrade` case in
`packages/buyer/src/e2e.test.ts` now settles a real deal over HTTP in exactly that configuration, and
asserts both halves recorded `meridian`.

The error text `profileForInbound` raises ("set `WIRE_PROFILE=a2cn` on both sides") still stands, and is
not in tension with the fallback: it fires when a payload has ALREADY arrived in a form the receiver does
not speak, which after card-based selection means the two sides were configured inconsistently by hand —
an in-process channel with no card, or an agent whose card was built without its profile.

**Activation, not just advertisement.** A2A §3.2.6 makes extension use a per-request negotiation, not a
property of the card: the caller names the extension in the `A2A-Extensions` service parameter and the
server echoes back what it activated. An earlier build advertised A2CN on the card and sent A2CN bytes
while taking no part in that handshake — true of the payload, not of the protocol, and invisible between
two Meridian agents because both decide the profile by reading each other's cards. Outbound requests now
carry the parameter (`extensionServiceParameters`), `startAgent` activates it when asked, and every
message declares it in `Message.extensions[]`.

The header is **advisory**. Not activating is not a refusal, and requesting is not an entitlement: what
decides whether this agent will process a payload is `profileForInbound`, which reads the bytes under the
RECEIVER's profile whatever the header says. Making activation load-bearing would hand the sender a second
lever over its own verification — the exact downgrade `profileForInbound` exists to close.

Inbound bytes are **not** auto-detected on the trust path, and a mismatch does not degrade gracefully —
it is refused. `profileForInbound` reads a live payload only under the profile the RECEIVER speaks,
because detecting by shape would let the sender choose the scheme it is checked against: the two
profiles do not protect the same fields (A2CN's §7.3.1 act omits the recipient and the chaining ids),
so a peer could downgrade a `meridian` receiver onto the narrower check simply by sending A2CN-shaped
bytes. A `meridian` receiver therefore rejects A2CN payloads outright, and an `a2cn` receiver accepts
plain Meridian envelopes only for the verbs with no A2CN form — the PING/PONG handshake and the
transport-level `ACK` a supplier returns for a settling ACCEPT — while a negotiation verb arriving as a
bare envelope is refused, since it would skip the §7.4 acceptance binding. `ACK` is safe to leave in that
set precisely because it is transport bookkeeping: it carries no terms, so there is no commercial claim in
it for the narrower check to miss.

Shape auto-detection (`looksLikeA2cn`, via `detectWireProfile`) is confined to payloads already committed
to a half-trail, which may legitimately be mixed-profile: there the bytes are being replayed, not trusted.

## Running it

```bash
pnpm demo                      # default `meridian` profile — the reproducible negotiation demo
WIRE_PROFILE=a2cn pnpm demo    # same buyer/supplier logic, real A2CN messages on the wire
pnpm test                      # mints identities, builds, then runs EVERY suite — all packages plus
                               # the dashboard and infra tests. The A2CN acceptance suite is one of
                               # them: packages/buyer/dist/a2cn.test.js
```

`seed/a2cn/summit-quote.a2cn.json` is a golden A2CN message produced by this codec; the test suite
verifies its protocol-act JWS, decodes it to the settled envelope, and re-encodes it to the same
bytes — guarding the wire format against silent drift. It is a stand-in, not an equivalent: the fixture
proves this codec is stable against itself, and a live round-trip against A2CN's Python reference
implementation — which would prove interoperability — has not been run. Anyone able to stand that
implementation up should run it and treat a disagreement as authoritative over this fixture.

## Sources

- A2CN spec + schemas: <https://github.com/A2CN-protocol/A2CN> (`spec/a2cn-spec-v0.2.0.md`,
  `spec/schemas/terms/goods_procurement.schema.json`)
- A2CN overview: <https://a2cn.io/>
- A2A commit-authority discussion: <https://github.com/a2aproject/A2A/discussions/1737>


## §9 transaction record — and why `reconcile()` is gone

A2CN §9 has both parties independently generate a deterministic, content-addressed record the moment a
valid acceptance is seen, and the spec is explicit about the requirement that makes it work:

> "Both parties generate the transaction record independently upon seeing a valid Acceptance. For both
> records to be identical, all fields MUST be deterministically derivable from the protocol messages
> alone."

Meridian previously proved agreement with `reconcile()`, which lined up two half-trails. That was
sound arithmetic resting on an unsound premise: the buyer had to READ THE SUPPLIER'S LOG, which it did
by opening `trails/<supplier>.half-trail.jsonl` off the local disk. It only worked because the demo
runs every agent on one machine, and it contradicted the property the whole system exists to
demonstrate — that each organization keeps records no one else can see.

`reconcile()` has been **deleted**. Each org now derives the §9 record from its own messages and
publishes only `record_hash`. Agreement is one string comparison:

- the **supplier** derives its record on seeing the ACCEPT and returns the hash on its `ACK`;
- the **buyer** derives its own and compares — this sets `recordsAgree`, which is what gates payment;
- each org also publishes its hash on its OWN event stream, so the dashboard can display both. The
  browser is the only place the two values meet, and only because the operator subscribed to both.

### Conformance detail

Verified against the spec text itself (`spec/a2cn-spec-v0.2.0.md`, read verbatim — an earlier pass
worked from a summary and got three of these wrong):

- **`record_id`** — UUID v5 over `session_id` under A2CN's namespace
  `f4a2c1e0-8b3d-4f7a-9c2e-1d5b6a8f3e7c` (§9.4 / Appendix A). Our UUID v5 is checked against RFC
  4122's published DNS-namespace vector so a bit-stamping bug cannot hide.
- **`record_hash`** — SHA-256 of the JCS record with `record_hash` set to `""` and **nothing else
  blanked**, so the preserved signatures are inside the hash and §9.5 step 1 works for a third party.
- **`offer_chain_hash`** — built from each message's real `protocol_act_hash` (§9.4). Under the
  `meridian` profile there is no such field, so it falls back to the canonical envelope hash.
- **`generated_at`** — the Acceptance's `timestamp`, satisfying §9.2's "No field MAY depend on local
  clock reads."
- **`parties.*.organization_name` / `agent_id`** — §9 requires these to come from SessionInit /
  SessionAck. Meridian has no session handshake, so each side declares itself on the FIRST message it
  sends (`body.party`; on the A2CN wire, `terms.custom_terms.meridian_party`). Both parties hold both
  messages, so both derive identical values — which is the property §9 actually depends on. The spec
  marks these fields "informational only … not cryptographically bound"; `did` and
  `verification_method` remain the authoritative identity.

### Known limits

**The record's `agreed_terms` is Meridian-shaped, so the §9 record interoperates between Meridian
agents only.** Everything else in this codec exists to make our bytes A2CN's bytes — minor units, JCS,
the §16 wrapper, the namespaced `custom_terms` keys. The §9 record deliberately does not follow that
rule: `agreed_terms` carries Meridian's own `Terms` object (`unitPriceUsd`, `leadTimeDays`,
`deliveryTerms`, in **dollars**, camelCase), and `record_type` / `record_version` are constants of ours
rather than the spec's. The reason is the one stated in `transaction-record.ts`: the record is hashed
from the DECODED terms so a `meridian` half and an `a2cn` half of the same deal (dollars vs cents) still
agree. That is the right trade for two Meridian agents and it is the wrong shape for anybody else — a
conforming A2CN implementation would hash a different object and get a different `record_hash`.

So `record_hash` equality proves agreement between two implementations of THIS codec. It is not a
cross-vendor settlement artifact, and no amount of round-tripping against the reference implementation
would make it one; that would take widening `Terms` and hashing the A2CN terms object instead. Stated
here rather than left as an exercise because the rest of this document is about exact conformance, and a
reader would reasonably assume this section is too.

**Identifiers in the `a2cn:` namespace are ours, not the spec's.** `MERIDIAN_MANDATE_ID` is
`a2cn:mandate:meridian-procurement` and a receipt's session reference is `a2cn:session:<negotiationId>`
(`approval-receipt.ts`). Those strings are invented, in a namespace this repo does not own — the same
mistake the `meridian_` prefix on `custom_terms` exists to prevent, in the one place it was not applied.
Nothing reads them but us (`verifyApprovalReceipt` compares them to its own expected values), so the
risk is collision of meaning rather than of behaviour: if A2CN later defines a `a2cn:mandate:` form, ours
would also be read as the spec's. Left as-is deliberately — renaming them changes the bytes inside a
signed receipt for no functional gain — but they are Meridian identifiers wearing an A2CN prefix, and a
second implementation must not expect to parse them.

**Mixed profiles no longer share a record.** Because the offer chain uses the real
`protocol_act_hash`, a deal recorded as `meridian` on one side and `a2cn` on the other derives two
different records. That is deliberate: A2CN assumes both parties speak A2CN, `selectWireProfile`
agrees the profile up front, and an earlier version that papered over this produced records no
conforming implementation would have agreed with.

**Not verified against the reference implementation.** Every check here is against the spec text and our
own two agents. We have not round-tripped a record through A2CN's Python reference implementation — and
per the `agreed_terms` limit above, byte-level agreement with a third party is not merely undemonstrated,
it is not currently possible. The per-field conformance points listed above are what hold.

**No forensic detail.** `record_hash` answers "do we agree?" with yes or no. The deleted `reconcile()`
could additionally say WHICH message diverged. If dispute triage needs that, it is a deliberate
follow-on, not an oversight.

---

## §10 audit log — Component 7

Implemented in `packages/agent-runtime/src/audit-log.ts`; served by the buyer at
`GET /audit?supplier=<id>`, and `GET /audit?supplier=<id>&export=1` for the §10.5 compliance package.
Both are proxied through the dashboard.

**Generated for every terminal state, not just settles.** §10.1 requires a log "for all outcomes
including failures, withdrawals, and timeouts". That is the whole design constraint: the sessions an
auditor asks about are the ones that went wrong, so a walk-away produces a log exactly as a settle does.
Verified live in both shapes — a settled session reports `COMPLETED` with a `record_id`, a walked one
reports `REJECTED_FINAL` with `record_id: null` and its full message history intact.

**Null fields are present, not omitted.** §10.2 is explicit: implementations MUST include inapplicable
fields as `null` so consumers can tell "not applicable" from "missing data". This is a requirement about
the *serialised* artifact and it is easy to satisfy in TypeScript while breaking on the wire — an
optional property assigned `undefined` simply disappears through `JSON.stringify`. The tests therefore
assert on parsed JSON rather than on the object.

**No commercial terms in the log.** §10.3 keeps the negotiation log to message types, hashes and values.
Full terms live only in the §9 record, and only for completed sessions. A test asserts the SKU, delivery
terms and lead time never appear in the serialised log — otherwise every compliance export would inherit
the confidentiality obligations of the deal itself.

**`AWAITING_HUMAN_APPROVAL` produces no log.** §14.2 makes it a non-terminal pause state, so `/audit`
returns `{ terminal: false, state: "AWAITING_HUMAN_APPROVAL" }` rather than a log. Emitting one would
assert the session had ended while it is still waiting on a person.

### Two things this exposed

**The payment gate had no receipt.** The human step this demo exercises most often is authorising the
irreversible USDC transfer, and it was producing no signed artifact at all — so the audit log had nothing
to point at for the most consequential human decision in a run. Pressing **Create payment** now mints an
operator-signed ApprovalReceipt bound to the §9 `record_hash` (the identifier both parties derived for
exactly that deal), and it appears in `audit_metadata.human_approval_receipts`.

Note what this does *not* change: `autonomous_decision` stays `true` on such a run. §10.3 defines that
flag narrowly — "the agent made offers or accepted terms without per-round human approval" — and it is
about the negotiation acts, which genuinely were autonomous. A run that reports `autonomous_decision:
true` *and* carries an approval receipt is describing what actually happened, and is more informative
than collapsing two different human gates into one boolean.

**An undecodable payload used to degrade silently.** A half-trail record whose wire payload will not
decode cannot yield a sender or a value; the only DID available from the record body is the
counterparty's, which is wrong for anything this org sent. The §9 record refuses to form in that case,
because a partial history would hash to a false agreement. An audit log has the opposite duty — it must
still describe a session that went wrong — so it now emits the entry *and* records an
`undecodable_wire_payload` protocol violation. A degraded audit log that cannot be told apart from a
clean one defeats the purpose of the artifact.

### Deliberate deviation

Our `ApprovalReceipt` carries an `approved_at` field, which the §14.1 example artifact does not define.
§10.3 requires `approved_at` for every receipt the audit log references, and the same section says
receipt-backed fields are the *only* audit metadata a recipient can verify rather than take on trust. An
approval timestamp sourced from an unsigned side channel would forfeit exactly that property, so it goes
inside the signed payload. §14.1 permits receipts carrying equivalent-or-additional fields.

### Not implemented

**§10.6 post-commitment lifecycle** (`delivery_notice`, `delivery_acknowledged`, `dispute_notice`,
`dispute_resolved`) — Level 3 conformance, and outside this prototype's scope: it models what happens
after goods ship, and nothing here ships goods.
