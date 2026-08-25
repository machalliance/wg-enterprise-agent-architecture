# Pinned versions

The book stresses that the agent-interop standards are *moving and not yet settled
infrastructure*. Everything the prototype depends on is pinned to an exact version here so a
mid-build upstream change can never silently break the demo.

## npm packages (exact, no `^`/`~`)

| Package | Version | Role |
|---|---|---|
| `@a2a-js/sdk` | `1.0.1` | A2A protocol runtime — server + client + transports. We use the CURRENT surfaces, not the deprecated wrappers: `ClientFactory`/`Client` (via `DefaultAgentCardResolver`) on the client, and the `jsonRpcHandler` + `agentCardHandler` express middlewares on the server. **Upgraded from `0.3.14`** — see "A2A v1.0 migration" below for what that changed |
| `agntcy-dir` | `1.5.0` | Official AGNTCY Agent Directory JS SDK (discovery) |
| `express` | `5.2.1` | HTTP host for the A2A JSON-RPC server (SDK peer dep) |
| `express-rate-limit` | `8.6.2` | Caps the rate of the buyer's state-changing control routes (`/kill`, the approval and settlement actions). Added because neither existing gate bounded request RATE: the control token runs OPEN in the zero-config demo, and where a token is set the routes were an unlimited guessing oracle. A hand-rolled limiter closed the same hole, but CodeQL's `js/missing-rate-limiting` recognises rate limiting by MIDDLEWARE IDENTITY, so the custom one left a permanent open alert that would mask the next real one. Chosen over `express-slow-down`/`express-brute` because it is the package that query knows and it needs no store for a single-process demo |
| `stripe` | `22.5.0` | Stripe SDK for the `--usdc` settlement layer (crypto PaymentIntent on Tempo). Optional — loaded only when `STRIPE_SECRET_KEY` is set. **Upgraded from `19.3.1`, which npm marks DEPRECATED** (Files API timeout, stripe-node#2538 — an API this repo never calls, but 19.3.1 is the last stable 19.x so the only way off the warning is a major). 22.x also bundles `2026-07-29.dahlia`, matching the date of the pinned preview snapshot below; 19.3.1 bundled `2025-10-29.clover`, nine months behind what this code requests |
| `zod` | `4.4.3` | Runtime validation of the shared message envelope |
| `@opentelemetry/sdk-node` | `0.221.0` | Telemetry bootstrap (spans for the accountability layer) |
| `@opentelemetry/api` | `1.9.1` | Tracer API used by agent code |
| `@opentelemetry/sdk-trace-base` | `2.10.0` | `SpanExporter` / `ReadableSpan` types behind the file exporter in `otel.ts` |
| `@opentelemetry/core` | `2.10.0` | `ExportResult` plumbing for that exporter |
| `@opentelemetry/exporter-trace-otlp-http` | `0.221.0` | OTLP/HTTP exporter, used when `OTEL_EXPORTER_OTLP_ENDPOINT` is set |
| `uuid` | `14.0.1` | UUID generation (envelope ids) |
| `typescript` | `7.0.2` | Compiler + typechecker (`tsc -b` — the agents run the emitted `dist/`, not a TS loader) |
| `concurrently` | `10.0.4` | Starts all six processes in one pane (`--web`) |
| `@types/node` | `26.1.2` | Node typings (root devDependency) |
| `@types/express` | `5.0.6` | Express typings for the buyer's HTTP surface (root devDependency) |
| `playwright` | `1.62.1` | Drives the dashboard in `pnpm sweep`'s `--web` runs (root devDependency). Needs its browser once per machine: `npx playwright install chromium` — CI must run this too, or the web sweeps report "playwright not installed" |

Runtime baseline: **Node >= 22**, **pnpm 11.x**.

## AGNTCY services

| Component | Version | Status |
|---|---|---|
| Agent Directory (`ghcr.io/agntcy/dir-apiserver`) | `v1.5.0` | **real service, running** (discovery) — see `infra/dir/` |
| OASF schema server | `schema.oasf.outshift.com` (public) | used by `dir` to validate records (discovery) |
| Identity service | `agntcy/identity` | **identity & trust, done** — self-contained W3C DID/VC layer over Ed25519 (`node:crypto`), seeded mock trust anchor. Credentials carry a **W3C Data Integrity proof, `cryptosuite: eddsa-jcs-2022`**, and DID documents publish a `Multikey` / `publicKeyMultibase`; proofs were previously LABELLED `Ed25519Signature2020` while being computed a different way, so no conforming verifier could read them (see `infra/identity/README.md`). Swap in the real service without touching agent code. |

## Negotiation-layer standard (A2CN wire profile)

| Standard | Version | Status |
|---|---|---|
| A2CN (Agent-to-Agent Commercial Negotiation Protocol) | `v0.2.0` — **Draft, not for production use** | **opt-in wire profile** — codec in `packages/agent-runtime/src/a2cn.ts` built against the **real** spec + JSON schemas read 2026-07 from [github.com/A2CN-protocol/A2CN](https://github.com/A2CN-protocol/A2CN) (`spec/a2cn-spec-v0.2.0.md`, `spec/schemas/`): snake_case envelope, `goods_procurement` terms in minor units, real terminal states (`COMPLETED`/`REJECTED_FINAL`/`WITHDRAWN`/`TIMED_OUT`), protocol-act EdDSA JWS signing. Python reference impl only (TS planned); A2A extension proposal **OQ-011**. Default profile stays `meridian`; enable with `WIRE_PROFILE=a2cn`. Not yet round-tripped against the Python reference impl — covered by a golden fixture instead, which proves this codec is stable against itself and proves nothing about interoperability. **A2CN v0.2.0 is a moving draft: re-read the published schemas before trusting this mapping.** See `docs/a2cn-alignment.md`. |

## Stripe settlement (`--usdc`)

| Thing | Value | Role |
|---|---|---|
| Stripe-Version (API snapshot) | `2026-07-29.preview` | Pinned in `packages/buyer/src/settlement.ts` (`STRIPE_API_VERSION`). The crypto / deposit-mode / Tempo PaymentIntent is a preview feature; bump this one string to move to a newer preview. |
| Network | `tempo` | The stablecoin chain the deposit address is issued on (`SETTLEMENT_NETWORK`). |
| Token | `USDC` | Stripe reports the actual supported token + contract on the PaymentIntent; this is the expected default. Note the API is **case-asymmetric**: the deposit-address block reports the token in display form (`USDC`), while the `simulate_crypto_deposit` test-helper accepts only the lower-case id and 400s on anything else (`Invalid token_currency: must be usdc`). `buyerSendDeposit` lower-cases at the call; what we record keeps Stripe's display form. |

The buyer opens a crypto PaymentIntent in `deposit` mode (`confirm: true`), reads the Tempo deposit
address from `next_action.crypto_display_details.deposit_addresses`, and — in a Stripe **sandbox** — drives
the buyer agent's deposit with the `simulate_crypto_deposit` test-helper (sandbox PaymentIntents do not
monitor real testnets). Everything but that one test-helper call is the production path. Requires
`STRIPE_SECRET_KEY` (a Stripe test secret key); absent it, settlement stays off.

## Registry configuration

`agntcy-dir` depends on generated protobuf types under the `@buf` scope. The repo-root `.npmrc`
maps that scope to the buf.build npm registry:

```ini
@buf:registry=https://buf.build/gen/npm/v1/
```

The `dir-apiserver` container runs standalone (sqlite + on-disk OCI layout) via three env vars — see
`infra/dir/docker-compose.yml`. It validates OASF records against the public OASF schema server.

## A2A v1.0 migration (from 0.3.14)

The SDK's v1.0 data model is **protobuf-shaped**, and moving to it was a real migration rather than a
version bump. What changed, so nobody has to rediscover it from a type error:

- `AgentCard.url` + `preferredTransport` + `additionalInterfaces` → one ordered `supportedInterfaces[]`,
  each entry naming a `protocolBinding`. Transport choice is now the counterparty's, made from the card —
  which is why the SSRF allowlist vets every entry rather than one field, and why `cardHttpUrl` matches
  on binding instead of reading `supportedInterfaces[0]`.
- `Message.role` is the `Role` enum (`ROLE_USER`/`ROLE_AGENT`), not `"user"`/`"agent"`.
- Parts are a tagged union: `{ content: { $case: "data", value } }`, not `{ kind: "data", data }`.
- `SendMessageResult` lost its `kind` discriminator — `Message | Task` is narrowed structurally now.
- Several previously-optional fields are required (`AgentCapabilities.extensions`, `AgentExtension.params`,
  `SendMessageRequest.tenant`/`configuration`/`metadata`), so "omit when empty" no longer type-checks.
- On the JSON-RPC wire: methods are PascalCase (`SendMessage`, not `message/send`), results are oneof
  wrapped (`{ result: { task } }`), task states are enum names (`TASK_STATE_FAILED`), and an **absent
  `A2A-Version` header is treated as legacy `0.3` and refused**, because our cards advertise `1.0` only.
  That refusal is deliberate: a v0.3 caller should be told so rather than silently handled.

**`TRANSPORT` is gone.** It offered a second value whose branch returned the same HTTP/JSON-RPC transport
as the default — config that read as an active control and was not one. Every agent now advertises the
one binding it actually serves. Adding another means a card entry plus a transport factory, not a
process-wide switch the counterparty cannot observe.

## Known binding gaps (fallbacks, not blockers)

- **`oasf-sdk` is not published to npm.** Discovery uses `agntcy-dir` directly against the running
  `dir-apiserver`; nothing depends on the missing SDK.
- **The OASF `skills[]` entry is a placeholder, and the record says so.** OASF requires at least one skill
  from its own taxonomy, and selling tents has no OASF skill, so each supplier record carries
  `natural_language_processing/.../text_completion` (id `10201`) purely to pass schema validation, which
  is a statement in a standards field that is **not true of the agent**. So the record also carries the
  annotation `skill_placeholder: "true"` — a consumer reading `skills` can see it is not a capability
  claim. Real capability facts live in the annotations. Replace both if OASF ever adds a negotiation or
  commerce skill.
- **The OASF record's `created_at` is a fixed literal**, `2026-07-15T00:00:00Z`, in
  `capabilityToOasfData` — so it does not say when the record was created, which makes it the second
  untrue standards field rather than the placeholder skill being the only one. It is load-bearing: the
  Directory is content-addressed, so a real timestamp would give the same advertisement a new CID on every
  boot, and `publishCapability`'s idempotent re-publish (and the "already exists" CID recovery that
  compares whole records) depends on the bytes being stable. Unlike the skill it carries no annotation
  disclosing itself, because a record that is byte-identical across runs is the property being bought and
  an annotation saying so would be one more field to keep stable. Noted here instead.
