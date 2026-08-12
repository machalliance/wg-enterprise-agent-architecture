import {
  createSeller,
  initTelemetry,
  loadCatalog,
  loadScenario,
  loadSigner,
  loadSupplierPolicy,
  makeAgentCard,
  makeDirectoryClient,
  makeEventHub,
  makeSellerReasoner,
  openHalfTrail,
  openTrail,
  publishCapabilityWithRetry,
  startAgent,
  supplierDid,
  supplierPort,
  supplierUrl,
  trailPath,
} from "@meridian/agent-runtime";
import { makeEnvelope, type Envelope } from "@meridian/protocol";

// Summit Gear Co. — the COOPERATIVE supplier. Private objective: open ~15% above the buyer's
// likely target and concede ~6%/round, so its price lands inside the buyer's envelope by round 2–3.
// This is the negotiation that produces the SETTLE.
const ID = "summit" as const;
const scenario = loadScenario();
const did = supplierDid(scenario, ID);
const catalog = loadCatalog(ID);
const policy = loadSupplierPolicy(ID);
// This agent's own DID signing key — every reply it publishes is signed with it.
const signer = loadSigner(did);

initTelemetry(`supplier-${ID}`);
// This org's event hub. `openTrail` publishes every record to it, and `startAgent` serves it at
// GET /events (SSE) so the dashboard can watch Summit's OWN half of the negotiation — no god view.
const hub = makeEventHub(ID);
const trail = openTrail(trailPath(`${ID}.jsonl`), hub);
// This supplier's own signed, hash-chained half-trail — its provable half of the exchange. It
// never sees the buyer's internal reasoning; the buyer never sees its floor. Neither side reads the
// other's log: each derives the A2CN §9 transaction record from its OWN half and compares hashes.
const halfTrail = openHalfTrail(trailPath(`${ID}.half-trail.jsonl`), signer);

// This supplier's PRIVATE selling objective, seeded by its cooperative behaviour.
// An optional LLM reasoner reasons for Summit's own interest; the seller clamps its price into
// [floor, deterministic base] so the SETTLE outcome reproduces whether or not the gateway is set.
const seller = createSeller(
  {
    // Opening price, floor and concession rate come from seed/supplier-policy.json — one source, shared
    // with the sampling harness, so a policy change cannot leave the two measuring different systems.
    ...policy,
    capacityUnits: catalog.maxUnits,
    leadTimeDays: catalog.minLeadTimeDays,
    // Declared on this supplier's QUOTE and carried into the §9 record's responder party block.
    orgName: catalog.agentName,
  },
  { did, trail, reasoner: makeSellerReasoner(ID, catalog.agentName) ?? undefined },
);

// Announce this agent's capability to the Agent Directory on boot. Restarting the process
// re-announces (discovery is dynamic, not a static config).
async function announce(): Promise<void> {
  // Advertise the endpoint this process is ACTUALLY listening on. The catalog's a2aEndpoint is the
  // static default; `supplierUrl` applies the same SUMMIT_URL / SUMMIT_PORT overrides `startAgent` uses,
  // so a relocated agent publishes where it can be reached instead of where the seed file guessed.
  const ad = { ...catalog, a2aEndpoint: supplierUrl(ID) };
  const dir = await makeDirectoryClient();
  const cid = await publishCapabilityWithRetry(dir, ad);
  trail.append({ event: "published", cid, did: ad.did, product: ad.product });
  console.log(`[${ad.agentName}] published capability to directory: cid=${cid}`);
}
// A publication failure must not take the process down, and must not vanish either: `void` discarded
// the rejection, so a supplier that never reached the directory looked identical to one that did —
// silently undiscoverable, while its A2A server sat there answering nobody. `publishCapabilityWithRetry`
// has already exhausted its retries by this point, so this is a real, final failure worth reporting.
// The agent keeps serving: it is still reachable by anyone holding its endpoint.
announce().catch((err) => {
  console.error(
    `[${catalog.agentName}] FAILED to publish capability to the directory — this agent will not be ` +
      `discoverable: ${err instanceof Error ? err.message : String(err)}`,
  );
});

startAgent({
  card: makeAgentCard({
    name: "Summit Gear Co.",
    description: "Cooperative selling agent for three-season tents.",
    url: supplierUrl(ID),
  }),
  port: supplierPort(ID),
  signer,
  halfTrail,
  eventHub: hub,
  // A2CN §9: on settle this org derives its OWN transaction record and publishes the hash on its OWN
  // stream. The buyer derives the same record from its own messages and compares. Neither side ever
  // reads the other's store — that is the whole point of the record replacing reconcile().
  onTransactionRecord: (record) =>
    trail.append({
      event: "transaction-record",
      negotiationId: record.session_id,
      recordHash: record.record_hash,
      settledTerms: record.agreed_terms,
    }),
  onInboundRejected: (inbound, reason): void => {
    // The drop-on-bad-signature gate, made visible in this org's own trail.
    trail.append({ event: "rejected", from: inbound.from, correlationId: inbound.correlationId, reason });
    console.log(`[Summit Gear Co.] DROPPED message from ${inbound.from}: ${reason}`);
  },
  onMessage: async (inbound: Envelope): Promise<Envelope> => {
    // The handshake stays; negotiation verbs route to the private selling engine.
    if (inbound.type === "PING") {
      trail.append({
        direction: "received",
        correlationId: inbound.correlationId,
        negotiationId: inbound.negotiationId,
        from: inbound.from,
        type: inbound.type,
      });
      const reply = makeEnvelope({
        type: "PONG",
        from: did,
        to: inbound.from,
        negotiationId: inbound.negotiationId,
        inReplyTo: inbound.correlationId,
        body: { ok: true },
      });
      trail.append({
        direction: "sent",
        correlationId: reply.correlationId,
        negotiationId: reply.negotiationId,
        inReplyTo: reply.inReplyTo,
        to: reply.to,
        type: reply.type,
      });
      return reply;
    }
    // handleAsync consults the LLM reasoner when configured, else it is the deterministic reply.
    return seller.handleAsync(inbound);
  },
});
