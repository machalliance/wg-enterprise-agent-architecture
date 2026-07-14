# Milestone 0 — Foundation & scenario harness

**Goal:** two independently-running agent processes exchange one A2A message over a real transport, and
the seed data for the tent reorder exists. Nothing negotiates yet — this milestone proves the *plumbing
that makes the boundary real*.

**Chapter tie-in:** the book insists there is "no shared orchestrator, no single party in control."
M0 encodes that as a physical constraint: separate processes, separate stores, one shared vocabulary.

**Time-box:** half a day (everyone pairs; this unblocks all other tracks).

---

## In scope
- Monorepo scaffold (pnpm workspaces) matching the layout in the overview.
- `packages/agent-runtime`: a thin TS harness wrapping `@a2a-js/sdk` for both server (receive) and
  client (send) roles, plus a **transport factory** that returns SLIM or gRPC/HTTP.
- `packages/protocol`: the shared message envelope + a `PING`/`PONG` message to prove the loop.
- Local infra via docker-compose: a **SLIM** node; **stub** the directory and identity services
  (real ones arrive in M1/M2).
- `seed/`: the scenario data.

## Out of scope
- Any negotiation logic, discovery, identity verification, policy, or LLM calls. Those are M1–M4.

---

## Build tasks

1. **Scaffold & pin versions.** `pnpm init` workspace. Add and **pin exact versions** of
   `@a2a-js/sdk`, `@anthropic-ai/sdk`, `@opentelemetry/sdk-node`, `zod`. Record chosen versions of the
   AGNTCY services (`dir`, `identity`, `slim`) in `infra/VERSIONS.md`. The book stresses these
   standards are moving — pinning on day one prevents a mid-hackathon break.
2. **Transport factory.** One function, transport chosen by env var:
   ```ts
   // packages/agent-runtime/src/transport.ts
   export type TransportKind = "slim" | "grpc";
   export function makeTransport(kind: TransportKind, endpoint: string) {
     // "slim"  -> slim-a2a-node binding to the local SLIM node
     // "grpc"  -> @a2a-js/sdk gRPC/HTTP transport (fallback, always works)
     // Both satisfy the same A2A transport interface, so agents never change.
   }
   ```
   > This is the chapter's "the negotiation contract and the transport are separable" claim, made
   > executable. Start on `grpc` (zero infra risk); switch the env var to `slim` once the node is up.
3. **Agent runtime skeleton.** A `defineAgent({ card, onMessage })` helper that stands up an A2A
   server, registers the agent's **Agent Card**, and connects an A2A client for outbound calls.
4. **Shared envelope.** Every message carries the fields later milestones depend on:
   ```ts
   // packages/protocol/src/envelope.ts
   export const Envelope = z.object({
     negotiationId: z.string().uuid(),   // groups one RFQ across all turns (M3)
     correlationId: z.string().uuid(),   // unique per message; ties the two half-trails (M5)
     inReplyTo: z.string().uuid().optional(),
     from: z.string(),                   // sender DID (self-asserted until M2 verifies it)
     to: z.string(),
     sentAt: z.string().datetime(),
     type: z.enum(["PING", "PONG"]),     // extended by later milestones
     body: z.unknown(),
   });
   ```
5. **Two processes, one handshake.** Buyer sends `PING`, Summit replies `PONG`. Each writes the
   message to **its own** JSONL store (`buyer.jsonl`, `summit.jsonl`). No shared store.
6. **Seed data** in `seed/` (see below).

## Seed data (`seed/scenario.json`)

```jsonc
{
  "shortfall": {
    "sku": "MER-TENT-3S",
    "name": "Ridgeline 3-Season Tent",
    "unitsNeeded": 3000,          // 5000 needed − 2000 covered by original supplier
    "deadlineDays": 21,
    "buyer": "did:web:meridian-outfitters.example"
  },
  "suppliers": [
    { "id": "summit", "did": "did:web:summit-gear.example",  "behaviour": "cooperative" },
    { "id": "alpine", "did": "did:web:alpine-supply.example", "behaviour": "firm" },
    { "id": "ridge",  "did": "did:web:ridgeline-trading.example", "behaviour": "adversarial" }
  ]
}
```

Mandate, catalogs, and credential fixtures are seeded by the milestones that consume them (M4, M1, M2)
to keep each milestone self-contained.

---

## Acceptance criteria (demo checkpoint)
- [ ] `pnpm dev` starts buyer + 3 supplier processes and the SLIM node in separate terminals.
- [ ] Buyer `PING` → Summit `PONG` completes over the transport; flipping `TRANSPORT=slim|grpc`
      works with **no code change** in the agents.
- [ ] Two separate JSONL files exist; grep confirms neither process wrote to the other's file.
- [ ] `infra/VERSIONS.md` lists pinned versions of every SDK and AGNTCY service.

## Stretch
- Structured logging with a `--org` tag so tailing all four processes is readable in one pane.
