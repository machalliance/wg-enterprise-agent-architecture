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

// RidgeLine Trading — the adversarial supplier that fails identity verification and probes for
// the reservation price, forcing a clean walk-away. It advertises the BEST numbers on the
// directory (attractive but unverifiable) — the point is that this must still be rejected.
const ID = "ridge" as const;
const scenario = loadScenario();
const did = supplierDid(scenario, ID);
const catalog = loadCatalog(ID);
const policy = loadSupplierPolicy(ID);
// RidgeLine still holds a real signing key and signs its replies — the point is that a signed
// message is worthless when the identity behind the key does not verify. The buyer rejects it before
// any negotiation message is exchanged, so these replies are never actually solicited.
const signer = loadSigner(did);

initTelemetry(`supplier-${ID}`);
// This org's event hub — serves GET /events so the dashboard shows RidgeLine's directory publish
// (it is REJECTED at the buyer's trust gate, so no negotiation record ever appears on this stream).
const hub = makeEventHub(ID);
const trail = openTrail(trailPath(`${ID}.jsonl`), hub);
// This supplier's own signed, hash-chained half-trail — its provable half of the exchange. It
// never sees the buyer's internal reasoning; the buyer never sees its floor. Neither side reads the
// other's log: each derives the A2CN §9 transaction record from its OWN half and compares hashes.
const halfTrail = openHalfTrail(trailPath(`${ID}.half-trail.jsonl`), signer);

// Adversarial objective — a jitter that oscillates around the opening and never trends toward a
// floor, so the price never converges. IF this supplier were ever admitted (flip its identity fixture to
// valid), the buyer would exhaust its round budget and WALK AWAY. By default it is REJECTED at the
// trust gate, so this engine is never actually driven.
const seller = createSeller(
  {
    // From seed/supplier-policy.json, including the jitter that makes this counterparty oscillate
    // rather than converge — the behaviour the reputation gate's good-faith test is written against.
    ...policy,
    capacityUnits: catalog.maxUnits,
    leadTimeDays: catalog.minLeadTimeDays,
    // Declared on this supplier's QUOTE and carried into the §9 record's responder party block.
    orgName: catalog.agentName,
  },
  { did, trail },
);

// Announce this agent's capability to the Agent Directory on boot (re-announces on restart).
async function announce(): Promise<void> {
  // Advertise the endpoint this process is ACTUALLY listening on. The catalog's a2aEndpoint is the
  // static default; `supplierUrl` applies the same RIDGE_URL / RIDGE_PORT overrides `startAgent` uses,
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
    name: "RidgeLine Trading",
    description: "Selling agent for three-season tents (unverified).",
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
    trail.append({ event: "rejected", from: inbound.from, correlationId: inbound.correlationId, reason });
    console.log(`[RidgeLine Trading] DROPPED message from ${inbound.from}: ${reason}`);
  },
  onMessage: (inbound: Envelope): Envelope => {
    // The handshake stays; negotiation verbs route to the private selling engine (never reached
    // by the buyer unless RidgeLine's identity fixture is flipped to valid).
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
    return seller.handle(inbound);
  },
});
