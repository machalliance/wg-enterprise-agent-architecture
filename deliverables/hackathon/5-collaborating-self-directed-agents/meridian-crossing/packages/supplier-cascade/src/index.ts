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

// Cascade Gear Works — the COMPETITIVE supplier, and the only one whose job is to squeeze another
// supplier rather than the buyer.
//
// WHY THIS AGENT EXISTS. Summit is the deal that settles; Alpine is the deal that must escalate to a
// human (its floor sits deliberately above the buyer's ceiling, so its best price can never fit); Ridge
// is the counterparty that fails the trust gate and never negotiates at all. None of them is a viable
// RIVAL, and that turned out to be measurable: once the buyer could see its alternatives (see
// buyer/src/quote-board.ts) it correctly observed that every alternative cost more than the offer in
// front of it, concluded it had no leverage, and settled at a mean of $91.88 against a $94 ceiling —
// 3 of 20 runs at the ceiling exactly. The buyer was not negotiating badly. It had nothing to push with.
//
// THE POLICY, AND WHY EACH NUMBER IS WHAT IT IS.
//   floor $89   — comfortably under the buyer's $94 ceiling and its $93 autonomous-settle band, so this
//                 agent can actually win a deal; that is what makes it a credible threat rather than
//                 set dressing. But it is ABOVE Summit's $86 floor, so Summit still wins any price war
//                 the buyer is willing to push to the end. The settle narrative is preserved; the buyer
//                 now has to earn it instead of being handed it.
//   opening $95 — under Summit's $98, so this agent is the cheaper quote from round one and the buyer
//                 has something real to say to Summit while there are still rounds left to say it in.
//   concede 3.5%— faster than Summit's 2%, so it reaches its floor early and holds there, keeping the
//                 pressure on rather than letting it decay as the rounds run out.
//   lead 17d    — inside the mandate's 18-day autonomous band, so a win here is a clean autonomous
//                 settle. Still worse than Summit's 14 days, so on a price tie the coordinator's lead-time
//                 tiebreak favours Summit: this is a genuine trade-off, not a strictly dominant option.
//
// The intended dynamic: Cascade drives to ~$89 quickly and sits there, the buyer uses that against
// Summit, and Summit has to go below $89 to win — opening up the $86–$89 band that no run has reached.
const ID = "cascade" as const;
const scenario = loadScenario();
const did = supplierDid(scenario, ID);
const catalog = loadCatalog(ID);
const policy = loadSupplierPolicy(ID);
// This agent's own DID signing key — every reply it publishes is signed with it.
const signer = loadSigner(did);

initTelemetry(`supplier-${ID}`);
// This org's event hub. `openTrail` publishes every record to it, and `startAgent` serves it at
// GET /events (SSE) so the dashboard can watch Cascade's OWN half of the negotiation — no god view.
const hub = makeEventHub(ID);
const trail = openTrail(trailPath(`${ID}.jsonl`), hub);
// This supplier's own signed, hash-chained half-trail — its provable half of the exchange. It
// never sees the buyer's internal reasoning; the buyer never sees its floor. Neither side reads the
// other's log: each derives the A2CN §9 transaction record from its OWN half and compares hashes.
const halfTrail = openHalfTrail(trailPath(`${ID}.half-trail.jsonl`), signer);

// This supplier's PRIVATE selling objective. Note that it knows nothing about Summit: the competition
// is entirely one-sided, felt by the buyer and invisible to both sellers. Telling this agent what its
// rival was quoting would be exactly the cross-org read this codebase deleted.
const seller = createSeller(
  {
    // See seed/supplier-policy.json for these numbers and the reasoning behind each one.
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
  // static default; `supplierUrl` applies the same CASCADE_URL / CASCADE_PORT overrides `startAgent` uses,
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
    name: "Cascade Gear Works",
    description: "Competitive selling agent for three-season tents.",
    url: supplierUrl(ID),
  }),
  port: supplierPort(ID),
  signer,
  halfTrail,
  eventHub: hub,
  // A2CN §9: on settle this org derives its OWN transaction record and publishes the hash on its OWN
  // stream. The buyer derives the same record from its own messages and compares. Neither side ever
  // reads the other's store.
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
    console.log(`[Cascade Gear Works] DROPPED message from ${inbound.from}: ${reason}`);
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
