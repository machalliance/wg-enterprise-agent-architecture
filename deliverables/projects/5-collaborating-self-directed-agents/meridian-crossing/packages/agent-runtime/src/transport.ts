import { AGENT_CARD_PATH, type AgentCard } from "@a2a-js/sdk";
import { ClientFactory, ClientFactoryOptions, DefaultAgentCardResolver, type Client } from "@a2a-js/sdk/client";

/**
 * The chapter's claim that "the negotiation contract and the transport are separable", made executable.
 * Agents never touch a concrete transport — they ask this factory for one, and it dials each
 * counterparty over the binding its card advertises.
 *
 * Every agent here advertises the A2A SDK's HTTP/JSON-RPC transport, the spec's blessed "always works"
 * binding. The card is still what decides (A2A v1.0 `supportedInterfaces`), so adding a second binding
 * is a card change plus a transport factory rather than a change to any negotiation code — but nothing
 * in this prototype needs one, so nothing here pretends to offer one.
 */
/** The A2A protocol binding this factory dials. `"jsonrpc"` matches the `protocolBinding` our cards
 *  advertise (`AgentInterface.protocolBinding: "JSONRPC"`), so the name an operator sees is the name the
 *  card uses. It read `"grpc"` for the whole life of the HTTP transport — a leftover from the deleted
 *  `TRANSPORT` env switch — so the buyer's startup line announced a binding no code in this repo dials. */
export type TransportKind = "jsonrpc";

/**
 * A dialled counterparty: the A2A client, AND the agent card the client was built from.
 *
 * The card is handed back rather than discarded because the WIRE PROFILE is the counterparty's to agree
 * and not this process's to declare. `selectWireProfile` reads `capabilities.extensions` to decide
 * whether A2CN is spoken at all — and it cannot run if the only thing `connect` returns is a client.
 * That is exactly what happened: the card was resolved here, checked, and dropped, so the documented
 * graceful downgrade ("a counterparty that does not advertise the A2CN extension falls back to
 * `meridian`") lived in a function nothing in the product called. The buyer read `WIRE_PROFILE`
 * instead, so `WIRE_PROFILE=a2cn` against a supplier on the default profile encoded A2CN at it anyway
 * and had every negotiation verb refused by `profileForInbound` — a failed run where the whole point
 * was a silent, working fallback.
 */
export interface AgentConnection {
  readonly client: Client;
  /** The counterparty's own card, already origin-checked. What a profile decision must be made from. */
  readonly card: AgentCard;
}

export interface Transport {
  /** The binding this factory dials with. */
  readonly kind: TransportKind;
  /** Human-readable description of what is actually carrying the bytes (for logs/dashboard). */
  readonly effective: string;
  /** Dial another agent's base URL (e.g. http://localhost:41001), returning its client + card. */
  connect(agentBaseUrl: string): Promise<AgentConnection>;
}

/**
 * The approved agent origins, from `A2A_ALLOWED_ORIGINS` (comma-separated, e.g.
 * "http://summit.internal,https://alpine.example"). Returns null when unset — the signal to fall back
 * to the loopback-only default below.
 *
 * Each entry is parsed as a URL and reduced to its `origin`, because that is what it gets compared
 * against. String-trimming a trailing slash left every other spelling difference intact: "HTTP://Host",
 * "http://host:80" and "http://host" are one origin but three strings, so an operator-configured
 * allowlist silently failed to match the endpoint it was meant to permit — an SSRF guard that fails
 * CLOSED here, but by accident rather than design. An entry carrying a path ("http://host/agents") is
 * likewise not an origin; `new URL().origin` discards the path, so it can no longer half-match.
 *
 * Unparseable entries are dropped rather than kept as raw strings: a typo must not become a value that
 * accidentally compares equal to something. Dropping every entry yields an empty list, which is NOT the
 * same as null — an allowlist that was configured but is entirely invalid permits nothing, instead of
 * falling back to the loopback default the operator did not ask for.
 */
function approvedOrigins(): string[] | null {
  const raw = process.env.A2A_ALLOWED_ORIGINS?.trim();
  if (!raw) return null;
  const origins: string[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    try {
      origins.push(new URL(trimmed).origin);
    } catch {
      console.warn(`[transport] ignoring unparseable A2A_ALLOWED_ORIGINS entry: ${trimmed}`);
    }
  }
  return origins;
}

/**
 * Validate a DISCOVERY-provided base URL before we ever construct a card URL or fetch it. A capability
 * record is authored by the counterparty, so its `a2aEndpoint` is untrusted input: without this a
 * malicious record could point the A2A client at an internal service or a cloud metadata endpoint
 * (SSRF). Scheme must be http(s); the origin must be on the configured allowlist, or — when none is
 * configured — a loopback address (the demo runs every agent on localhost), which blocks internal and
 * external destinations by default while keeping the zero-config demo working.
 */
function assertApprovedOrigin(agentBaseUrl: string): URL {
  let u: URL;
  try {
    u = new URL(agentBaseUrl);
  } catch {
    throw new Error(`agent base URL is not a valid URL: ${agentBaseUrl}`);
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error(`agent base URL scheme not allowed: ${u.protocol} (${agentBaseUrl})`);
  }
  const allow = approvedOrigins();
  if (allow) {
    if (!allow.includes(u.origin)) {
      throw new Error(`agent origin not approved: ${u.origin} (set A2A_ALLOWED_ORIGINS to permit it)`);
    }
  } else {
    const host = u.hostname.replace(/^\[|\]$/g, "");
    const loopback = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!loopback) {
      throw new Error(
        `agent origin not approved: ${u.origin} — loopback-only by default; set A2A_ALLOWED_ORIGINS to allow non-loopback origins`,
      );
    }
  }
  return u;
}

/**
 * Vet every endpoint the RESOLVED CARD declares, before a client is built from it.
 *
 * `assertApprovedOrigin` above vets the URL we CONSTRUCT — and that is the only URL it can see. The card
 * that comes back names its own endpoints (`url`, plus one per entry in `additionalInterfaces`), and the
 * SDK's `createFromAgentCard` hands whichever it picks straight to the transport factory without
 * rechecking it. So an approved supplier could answer card discovery with `url:
 * "http://169.254.169.254/latest/meta-data/"` and every negotiation request would go there instead —
 * the allowlist satisfied by the card fetch while the actual traffic went somewhere else entirely. Same
 * bypass class as the redirect one `cardResolverFetch` closes, one layer further in.
 *
 * EVERY declared endpoint is checked, not just the one that ends up selected. Selection happens inside
 * the SDK, ordered by its own transport preferences (`createFromAgentCard`), so "the selected endpoint"
 * is not knowable out here without reimplementing that walk — and a check that has to predict the
 * library's choice is a check that breaks the next time the library changes its mind. Rejecting the
 * whole card if ANY endpoint is unapproved needs no such prediction and fails closed.
 */
function assertCardEndpointsApproved(card: AgentCard): AgentCard {
  for (const [i, iface] of card.supportedInterfaces.entries()) {
    const label = `supportedInterfaces[${i}].url (${iface.protocolBinding})`;
    const url = iface.url;
    // An endpoint the card left empty is not a destination; the SDK skips it when picking a transport
    // (`if (factory && url)`), so failing on it would refuse cards the SDK handles perfectly well.
    if (!url) continue;
    try {
      assertApprovedOrigin(url);
    } catch (err) {
      throw new Error(`agent card declares an unapproved endpoint in ${label}: ${(err as Error).message}`);
    }
  }
  return card;
}

function cardUrl(agentBaseUrl: string): string {
  const u = assertApprovedOrigin(agentBaseUrl);
  // Build from origin + pathname only. `u.href` carries any query and fragment, so a base URL like
  // `http://localhost:41001/?debug=1` produced `…/?debug=1/.well-known/agent-card.json` — a path that
  // 404s, from a base the origin check had just approved.
  const base = `${u.origin}${u.pathname}`.replace(/\/$/, "");
  return `${base}/${AGENT_CARD_PATH}`;
}

/**
 * Build the transport this process dials out with.
 *
 * THE `TRANSPORT` ENV VAR IS GONE, deliberately. It offered a second value whose branch returned the
 * same HTTP transport as the default — a knob that read as an active control and was not one, which is
 * exactly what the note in `.npmrc` calls out about inert config. A second binding, if one is ever
 * warranted, belongs on the agent card (A2A v1.0 `supportedInterfaces`) where a counterparty can see
 * it, not behind a process-wide switch the other side cannot observe.
 */
export function makeTransport(): Transport {
  return httpTransport("jsonrpc", "http/json-rpc");
}

/**
 * One factory for every connection. `ClientFactory` resolves the peer's agent card, picks a transport the
 * card actually advertises, and hands back a `Client`.
 *
 * This replaced `A2AClient`, which the SDK deprecates. The migration was not cosmetic: `A2AClient`'s
 * `sendMessage(params)` accepted no `RequestOptions`, so there was no per-call `AbortSignal` and a
 * timed-out negotiation left its request in flight until the far side answered or the connection dropped.
 * The abort had to be smuggled in through a `fetchImpl` that stamped every request with its own
 * `AbortSignal.timeout` — a blunt instrument that could not distinguish one caller's deadline from
 * another's. `Client.sendMessage(params, { signal })` takes the caller's own signal, so the deadline in
 * `agent.ts` now cancels exactly the request it applies to.
 *
 * CARD RESOLUTION still needs its own deadline, and it is the one request that cannot borrow the caller's
 * signal: it happens inside `createFromUrl`, before any `Client` exists to pass `RequestOptions` to. A peer
 * that completes the TCP handshake and then never answers the card request would leave `connect()` pending
 * for the process lifetime — the buyer awaits it before a negotiation can even start, so a single wedged
 * supplier would stall that shortfall indefinitely. Bounding it via the resolver's own `fetchImpl` is the
 * narrow version of the blanket timeout this migration removed: it applies to card discovery only, where
 * no per-request signal is reachable, instead of overriding every request's own deadline.
 */
const CARD_FETCH_TIMEOUT_MS = 15_000;

const cardResolverFetch: typeof fetch = (input, init) =>
  fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(CARD_FETCH_TIMEOUT_MS),
    // A REDIRECT IS AN SSRF BYPASS HERE, so refuse to follow one. `assertApprovedOrigin` vets the URL we
    // construct — and only that URL. `fetch` follows up to twenty redirects by default, and the hops are
    // never re-checked, so a counterparty at a perfectly approved origin could answer card discovery with
    // `302 -> http://169.254.169.254/latest/meta-data/` (or any internal service) and the allowlist that
    // exists to prevent exactly this would have been satisfied by the first request while the last one
    // fetched something else entirely. `redirect: "error"` collapses that: the only response accepted is
    // one served by the origin we approved. Our agents serve the card directly at its well-known path, so
    // nothing legitimate relies on a hop.
    redirect: "error",
  });

const cardResolver = new DefaultAgentCardResolver({ fetchImpl: cardResolverFetch });

const clientFactory = new ClientFactory(
  // The resolver is still registered on the factory even though `connect` below resolves the card
  // itself: it is what `createFromUrl` would use, and leaving the default in place there would give
  // any future caller of that method an unbounded, redirect-following card fetch.
  ClientFactoryOptions.createFrom(ClientFactoryOptions.default, { cardResolver }),
);

function httpTransport(kind: TransportKind, effective: string): Transport {
  return {
    kind,
    effective,
    // Resolve the card OURSELVES rather than via `createFromUrl`, so the card's own declared endpoints
    // can be vetted between the fetch and the client construction. `createFromUrl` does both in one
    // step with no seam to check at, which is what let a counterparty redirect negotiation traffic.
    // `cardUrl` still builds (and origin-checks) the full card URL, so the path argument is empty — the
    // SSRF guard has to run on OUR side of the resolution, not be delegated to the SDK's URL joining.
    connect: async (agentBaseUrl: string): Promise<AgentConnection> => {
      const card = assertCardEndpointsApproved(await cardResolver.resolve(cardUrl(agentBaseUrl), ""));
      // AWAITED, not returned inside the object. `createFromAgentCard` is async, and the old code
      // returned its promise straight out of an async function, which awaited it for free. Wrapping it
      // in `{ client, card }` removes that, and a `Promise<Client>` in the `client` slot would only be
      // caught wherever it was first used as a client.
      return { client: await clientFactory.createFromAgentCard(card), card };
    },
  };
}

