import express from "express";
import {
  AGENT_CARD_PATH,
  type AgentCard,
  type AgentExtension,
  type AgentInterface,
  type Message,
  type SendMessageResult,
} from "@a2a-js/sdk";
import { ServiceParameters, withA2AExtensions, type Client } from "@a2a-js/sdk/client";
import { isJsonRpcError, isRestError } from "@a2a-js/sdk/errors";
import type {
  AgentExecutor,
  ExecutionEventBus,
  RequestContext,
} from "@a2a-js/sdk/server";
import { AgentEvent, DefaultRequestHandler, InMemoryTaskStore } from "@a2a-js/sdk/server";
import { UserBuilder, agentCardHandler, jsonRpcHandler } from "@a2a-js/sdk/server/express";
import type { Envelope, SignedEnvelope } from "@meridian/protocol";
import { receiveInbound, signedEnvelopeToMessage } from "./message.js";
import { A2CN_PROFILE, MERIDIAN_PROFILE, wireProfileFromEnv, type WireProfile } from "./wire-profile.js";
import { type Signer } from "./identity.js";
import { isNegotiationVerb } from "./a2cn.js";
import type { HalfTrail } from "./half-trail.js";
import { sseHandler, type EventHub } from "./events.js";
import { transactionRecordFromTrail, type TransactionRecord } from "./transaction-record.js";

/**
 * A message handler receives the decoded inbound envelope and returns the reply envelope.
 * By the time it runs, the runtime has already verified the sender's signature, so the handler
 * only sees messages whose `from` DID resolved and whose signature checked out.
 */
export type OnMessage = (inbound: Envelope) => Envelope | Promise<Envelope>;

export interface AgentDefinition {
  card: AgentCard;
  port: number;
  /** This agent's own signer — every reply it publishes is signed with its DID key. */
  signer: Signer;
  onMessage: OnMessage;
  /** Verify inbound signatures before dispatching (default true). The drop-on-bad-signature gate. */
  verifyInbound?: boolean;
  /** Notified when an inbound message is dropped for a bad signature, so the org can log the drop. */
  onInboundRejected?: (inbound: SignedEnvelope, reason: string) => void;
  /** The wire profile this agent speaks, for BOTH directions. Defaults to `WIRE_PROFILE` (meridian).
   *  Inbound is verified under this profile, never the one the payload advertises — see
   *  `profileForInbound`: letting the sender pick the verification scheme is a downgrade attack. */
  wireProfile?: WireProfile;
  /** This org's signed half-trail. When set, every negotiation message this agent receives and
   *  replies with is appended as a tamper-evident record, so the supplier keeps its own provable half. */
  halfTrail?: HalfTrail;
  /** This org's event hub. When set, `GET /events` (SSE) streams this org's trail so the
   *  dashboard can watch the negotiation from the supplier's own side — one per-org stream, no god view. */
  eventHub?: EventHub;
  /** Notified with this org's OWN A2CN §9 transaction record the moment a deal settles, so the org can
   *  publish its `record_hash`. That hash is the agreement proof: the counterparty derives the same
   *  record from its own messages and compares. Neither side ever reads the other's store. */
  onTransactionRecord?: (record: TransactionRecord) => void;
}

/**
 * Build a minimal, valid A2A Agent Card. `capabilities.extensions` advertise optional protocol
 * extensions — that is exactly where a counterparty looks to decide whether to speak A2CN or fall
 * back to the default profile. The card AUTOMATICALLY advertises the active `WIRE_PROFILE`'s extension
 * (`https://a2cn.io/extensions/commercial-negotiation/v1`, the `A2CN_EXTENSION_URI` constant, under
 * `WIRE_PROFILE=a2cn`; nothing under the default `meridian`), so an agent
 * announces what it speaks without any per-agent code change. Pass `extensions` to add more.
 */
export function makeAgentCard(input: {
  name: string;
  description: string;
  url: string;
  extensions?: AgentExtension[];
  /** Extra protocol bindings this agent also serves, appended AFTER the JSON-RPC interface built from
   *  `url`. Order is preference order in A2A v1.0, and JSON-RPC deliberately stays first: it is the
   *  binding every counterparty can speak. No agent here passes this — it exists because the CARD is
   *  what declares transports in v1.0, so the SSRF guard has to vet a list rather than one endpoint
   *  (see `assertCardEndpointsApproved`, and the multi-interface case in transport.test.ts). */
  supportedInterfaces?: AgentInterface[];
  /** The profile this agent actually speaks. Defaults to `WIRE_PROFILE`; pass `def.wireProfile` so the
   *  card matches the agent. Reading the env independently made the card LIE for any agent constructed
   *  with an explicit `wireProfile`: an a2cn agent with WIRE_PROFILE unset advertised no extension, so a
   *  counterparty ran `selectWireProfile` against a card claiming meridian, chose meridian, and had
   *  every negotiation message refused by the very agent whose card it had just read. */
  wireProfile?: WireProfile;
}): AgentCard {
  const profileExt = (input.wireProfile ?? wireProfileFromEnv()).extension;
  const extensions = [...(profileExt ? [profileExt] : []), ...(input.extensions ?? [])];
  return {
    name: input.name,
    description: input.description,
    // A2A v1.0 replaced the card's single `url` + `preferredTransport` + `additionalInterfaces` with
    // ONE ordered list, first entry preferred. Not just a rename: transport choice is now the
    // COUNTERPARTY'S to make from what the card declares, which is why the endpoint allowlist checks
    // every entry rather than one field (see `assertCardEndpointsApproved`).
    supportedInterfaces: [
      { url: input.url, protocolBinding: "JSONRPC", protocolVersion: "1.0", tenant: "" },
      ...(input.supportedInterfaces ?? []),
    ],
    provider: undefined,
    version: "0.0.0",
    capabilities: {
      streaming: false,
      // Always present now: `AgentCapabilities.extensions` is required in v1.0, so the old
      // "omit the key when empty" trick no longer type-checks. An empty array carries the same
      // meaning to `cardSupportsA2cn`, which matches on URI membership.
      extensions,
    },
    securitySchemes: {},
    securityRequirements: [],
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: [],
    signatures: [],
  };
}

/** The JSON-RPC URL a card is served at — the v1.0 replacement for the old flat `card.url`.
 *
 *  Matched on `protocolBinding` rather than taken as `supportedInterfaces[0]`. Every in-repo caller
 *  wants the HTTP endpoint specifically (logging, the dashboard proxy, the directory record), and a
 *  positional read silently returns whatever binding happens to be listed first — so a card that ever
 *  declares a non-HTTP binding ahead of it would hand them an address they cannot fetch, failing far
 *  from here. */
export function cardHttpUrl(card: Pick<AgentCard, "supportedInterfaces">): string {
  const iface = card.supportedInterfaces.find((i) => i.protocolBinding === "JSONRPC");
  if (!iface) throw new Error("agent card advertises no JSONRPC interface");
  return iface.url;
}

/**
 * Is this message actually addressed to us?
 *
 * A signature proves WHO WROTE a message; it never proves WHO IT WAS FOR. Without this check, a
 * message legitimately signed for one supplier can be replayed verbatim to another and will verify
 * perfectly — the recipient just processes someone else's RFQ or ACCEPT.
 *
 * It lives here, at the transport boundary, rather than in either wire profile, because that is where
 * A2CN puts addressing: A2CN messages carry no recipient field at all (§16, the A2A composition
 * binding advertised as `https://a2cn.io/extensions/commercial-negotiation/v1`),
 * so the recipient can never be inside the protocol-act signature. The `meridian` profile does sign
 * `to`, which stops it being ALTERED — but signing it still cannot stop the whole message being
 * REDIRECTED, so both profiles need this.
 */
export function checkAddressedTo(inbound: Envelope, ownDid: string): { ok: boolean; reason: string } {
  return inbound.to === ownDid
    ? { ok: true, reason: "addressed to this agent" }
    : { ok: false, reason: `message addressed to ${inbound.to}, not this agent (${ownDid})` };
}

/**
 * Stand up an A2A server for one agent: register its Agent Card and route inbound messages through
 * `onMessage`. On receive, the runtime verifies the sender's DID signature and DROPS anything that
 * fails — a tampered body or wrong-key signature never reaches `onMessage`. The reply envelope
 * is signed with this agent's own key and published back on the same context/task.
 */
export function startAgent(def: AgentDefinition) {
  const profile = def.wireProfile ?? wireProfileFromEnv();
  const executor: AgentExecutor = {
    execute: async (ctx: RequestContext, bus: ExecutionEventBus): Promise<void> => {
      // NO try/finally around this body. `bus.finished()` used to run in a `finally`, which closed the
      // event bus even when the body threw — and a closed bus is the SDK's signal that the exchange
      // completed normally, so the failure events it publishes from the rejection had nowhere to go.
      // Every drop this agent computes (bad signature, wrong recipient, an `onMessage` that refused the
      // move) reached the caller as a silent, reason-less failure. Letting the throw propagate with the
      // bus still open is precisely what lets @a2a-js/sdk report the reason.
      {
        // ACTIVATE the profile's A2A extension when the caller asked for it (§3.2.6). The transport reads
        // `activatedExtensions` off this context after dispatch and puts it in the response
        // `A2A-Extensions` header, which is how the caller learns its request was honoured — the other
        // half of `extensionServiceParameters` below.
        //
        // ADVISORY, deliberately: not activating is not a refusal, and requesting is not an entitlement.
        // The gate that actually decides what this agent will process is `profileForInbound`, which reads
        // the payload under THIS agent's profile regardless of any header. Making the header load-bearing
        // would hand the sender a second lever over how it gets verified, which is the exact downgrade
        // that gate exists to close — so the header is a declaration and the bytes are the boundary.
        const extensionUri = profile.extension?.uri;
        if (extensionUri && ctx.context.requestedExtensions?.includes(extensionUri)) {
          ctx.context.addActivatedExtension(extensionUri);
        }
        // Inbound is read under THIS agent's own profile, never the one the payload advertises — a
        // sender must not be able to pick the verification scheme it is checked against. `verify()`
        // then runs that profile's native check (Ed25519 envelope for meridian, A2CN protocol-act
        // JWS + act binding for a2cn).
        const received = receiveInbound(ctx.userMessage, profile);
        const inbound = received.env;
        if (def.verifyInbound !== false) {
          const verdict = received.verify();
          if (!verdict.ok) {
            def.onInboundRejected?.(inbound, verdict.reason);
            // Drop it: surface an error to the caller and publish no reply.
            throw new Error(`inbound signature rejected from ${inbound.from}: ${verdict.reason}`);
          }
        }
        // Addressing is checked UNCONDITIONALLY, outside the signature gate. `verifyInbound` turns off
        // one question ("did the named sender write this?"); it must not also turn off the independent
        // one ("was this written for us?"). Nesting them made the redirection attack in the doc above
        // land on exactly the agents least able to notice it.
        const addressing = checkAddressedTo(inbound, def.signer.did);
        if (!addressing.ok) {
          def.onInboundRejected?.(inbound, addressing.reason);
          throw new Error(`inbound rejected from ${inbound.from}: ${addressing.reason}`);
        }
        const reply = await def.onMessage(inbound);
        // Record this exchange on the org's own signed half-trail, but ONLY once onMessage has
        // accepted the inbound and produced a reply (a rejected/illegal move is never half-recorded).
        // The RECEIVED record stores the counterparty's raw signed payload as its non-repudiation
        // artifact; the SENT record re-encodes our reply so `wirePayload` is the exact bytes we emit.
        // This happens BEFORE the reply is signed, because a settling ACCEPT must already be on our
        // trail for the §9 record below to cover it.
        if (def.halfTrail && isNegotiationVerb(inbound.type)) {
          def.halfTrail.record({
            direction: "RECEIVED",
            envelope: inbound,
            wirePayload: received.raw,
            wireProfile: received.profile.name,
            counterpartyDid: inbound.from,
          });
        }
        // A2CN §9: on a valid ACCEPT the deal is settled, and BOTH parties independently derive the
        // same transaction record. We attach ours to the ACK so the counterparty can compare one hash
        // instead of reading our log. This is the whole point of §9 — agreement is proven by two
        // parties publishing the same 43 characters, never by one org opening the other's store.
        if (def.halfTrail && inbound.type === "ACCEPT" && reply.type === "ACK") {
          const record = transactionRecordFromTrail(def.halfTrail.entries(), inbound.negotiationId);
          if (record) {
            // `body` is optional on an Envelope, and an ACK is exactly the message an `onMessage` is
            // most likely to build without one — the cast hid that, so assigning through it threw
            // "cannot set property of undefined" and turned a settled deal into a failed reply, AFTER
            // the buyer was already bound by its ACCEPT. Normalise instead of assuming.
            reply.body = { ...((reply.body as Record<string, unknown> | undefined) ?? {}), recordHash: record.record_hash };
            def.onTransactionRecord?.(record);
          }
        }
        const signedReply = def.signer.sign(reply);
        if (def.halfTrail && isNegotiationVerb(reply.type)) {
          def.halfTrail.record({
            direction: "SENT",
            envelope: signedReply,
            wirePayload: profile.encode(signedReply, def.signer),
            wireProfile: profile.name,
            counterpartyDid: reply.to,
          });
        }
        // Wrapped in `AgentEvent.message` — v1.0's bus takes a DISCRIMINATED event, not a bare
        // Message. The wrapper is what carries `kind`, now that the payload types no longer do.
        bus.publish(
          AgentEvent.message(
            signedEnvelopeToMessage(
              signedReply,
              "agent",
              { contextId: ctx.contextId, taskId: ctx.taskId },
              profile,
              def.signer,
            ),
          ),
        );
        // Only on SUCCESS. `finally` ran this even when the body threw — a rejected signature, an
        // unaddressed message, an `onMessage` that refused the move — and closing the bus first told the
        // SDK the exchange completed normally, so the failure events it publishes from the rejection had
        // nowhere to go. The caller saw a silent, reason-less failure instead of the drop reason this
        // agent had just computed. Letting the throw escape with the bus still open is what allows
        // @a2a-js/sdk to report it.
        bus.finished();
      }
    },
    // No cancellable work here. The kill switch that severs live negotiations arrives with accountability.
    cancelTask: async (): Promise<void> => {},
  };

  // Serve a card that advertises the profile this agent is ACTUALLY running, not whatever the
  // environment said when the card literal was built. `makeAgentCard` now takes the profile, but the
  // card and the runtime profile arrive here as two independent inputs, so reconciling them at the one
  // point that knows both is what makes the guarantee hold for every caller — including one that builds
  // a card by hand. A card that misdescribes its own wire profile is not cosmetic: `selectWireProfile`
  // is what a counterparty reads to choose an encoding, and choosing the wrong one gets every
  // negotiation message refused by `profileForInbound`.
  const handler = new DefaultRequestHandler(cardForProfile(def.card, profile), new InMemoryTaskStore(), executor);
  const app = express();
  // Expose this org's own event stream (SSE) alongside its A2A routes, so the dashboard can
  // subscribe to the supplier's own half of the story. Mounted before A2A so it is never shadowed.
  if (def.eventHub) app.get("/events", sseHandler(def.eventHub));
  // The two middlewares the deprecated `A2AExpressApp` wrapped, mounted directly — which is what its own
  // deprecation notice asks for. Same routes and same order it produced: JSON-RPC at the root, then the
  // agent card at its well-known path. `jsonRpcHandler` brings its own `express.json()` and JSON
  // syntax-error handling, so no body parser is added here (adding one would double-parse).
  //
  // `noAuthentication` is the honest declaration for this deployment: agents authenticate MESSAGES by DID
  // signature, not callers by transport credential, and `startAgent` binds loopback-only by default. The
  // signature gate is what `execute` runs before anything reaches `onMessage`.
  app.use(jsonRpcHandler({ requestHandler: handler, userBuilder: UserBuilder.noAuthentication }));
  app.use(`/${AGENT_CARD_PATH}`, agentCardHandler({ agentCardProvider: handler }));
  // Bind loopback-only by default: agents are internal to the VM and reached solely over loopback
  // (the buyer's transport and the dashboard's reverse proxy). Exposing them on all interfaces bought
  // nothing but a wider attack surface behind the signature gate. A distributed deployment that runs
  // agents on separate hosts can set A2A_BIND_HOST (e.g. 0.0.0.0) to opt back in.
  const bindHost = process.env.A2A_BIND_HOST ?? "127.0.0.1";
  const server = app.listen(def.port, bindHost, () => {
    // `server.listening` is the guard, not decoration. Express invokes this callback even when the bind
    // FAILED — unlike a bare `net.Server`, which only calls it on the `listening` event — so announcing
    // unconditionally made a supplier whose port was taken print "A2A server listening on …" about a
    // port it does not hold. Every reader of that line, human or log scraper, was told the opposite of
    // the truth.
    if (server.listening) console.log(`[${def.card.name}] A2A server listening on ${cardHttpUrl(def.card)}`);
  });
  // A failed bind must be loud and fatal. With no `error` listener the EADDRINUSE was swallowed whole and
  // the process exited 0 the moment nothing else kept the loop alive. Under `pnpm demo` that reads as
  // `node packages/supplier-summit/dist/index.js exited with code 0`, `concurrently -k` tears the whole
  // run down, and the word EADDRINUSE appears nowhere — a leftover agent from a previous run silently
  // costs you the next one. Exiting non-zero with the port named is the difference between a ten-second
  // fix and a bisect.
  server.on("error", (err: NodeJS.ErrnoException) => {
    const detail = err.code === "EADDRINUSE" ? " — is a previous run still alive?" : "";
    console.error(
      `[${def.card.name}] FAILED to bind ${bindHost}:${def.port}: ${err.message}${detail}`,
    );
    process.exit(1);
  });
  return server;
}

/**
 * The card as served: every known wire-profile extension dropped, then the active profile's re-added.
 * Extensions the caller declared for other purposes are preserved — only profile advertising is
 * rewritten, because only that has to agree with how this process actually decodes messages.
 */
function cardForProfile(card: AgentCard, profile: WireProfile): AgentCard {
  const profileUris = new Set(
    [MERIDIAN_PROFILE.extension?.uri, A2CN_PROFILE.extension?.uri].filter((u): u is string => u !== undefined),
  );
  // Drop the ORIGINAL extensions from the spread base rather than trying to overwrite them. Spreading
  // `...card.capabilities` and then conditionally re-adding `extensions` did nothing when the computed
  // list came out EMPTY — which is precisely the case this function exists for: a card built while
  // WIRE_PROFILE=a2cn, served by an agent running `meridian`, computes no extension (meridian
  // advertises none) and so kept advertising A2CN. The stale value survived the very rewrite meant to
  // remove it, and the failure is invisible from here — it surfaces as a counterparty picking A2CN off
  // the card and having every message refused by `profileForInbound`.
  const { extensions: _stale, ...capabilities } = card.capabilities ?? {};
  const others = (card.capabilities?.extensions ?? []).filter((e) => !profileUris.has(e.uri));
  const extensions = [...(profile.extension ? [profile.extension] : []), ...others];
  // Always set the key now. In v0.3 it was omitted when empty, because the card schema read absent as
  // "no extensions" and an empty array was a gratuitous wire difference. v1.0 makes `extensions`
  // REQUIRED on `AgentCapabilities`, so absent is no longer expressible and `[]` is the encoding of
  // the same fact.
  return { ...card, capabilities: { ...capabilities, extensions } };
}

/**
 * How long an outbound A2A request may go unanswered before the caller gives up.
 *
 * There was no bound at all. A supplier that accepts the connection and then never replies — a crashed
 * process mid-request does it, no malice required — held the promise open forever: the negotiation's
 * `await` never returned, its reservation sat on the ledger against the cross-deal spend cap, and the
 * run neither settled nor walked. Generous enough that a slow LLM turn on the far side is not cut off.
 */
const A2A_REQUEST_TIMEOUT_MS = 120_000;

/**
 * Run `start` under the request deadline, rejecting AND CANCELLING it if it has not settled in time.
 *
 * The cancellation is the point. Under the deprecated `A2AClient` this could only unblock the caller —
 * `sendMessage(params)` took no `RequestOptions`, so there was no `AbortSignal` to pass and a timed-out
 * request stayed in flight until the peer answered or the socket dropped. The workaround stamped every
 * request with its own timeout inside the transport's `fetchImpl`, which could not tell one caller's
 * deadline from another's. `Client.sendMessage(params, { signal })` accepts the caller's signal, so the
 * abort now belongs to exactly the request this deadline governs.
 *
 * `start` receives the signal and must pass it to the transport; the deadline aborts before rejecting, so
 * the timeout error and the cancellation are one event.
 */
async function withDeadline<T>(start: (signal: AbortSignal) => Promise<T>, message: string): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      start(controller.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          // Abort BEFORE rejecting, so the request is already cancelled by the time the caller sees the
          // timeout — otherwise a retry could race the abandoned send.
          controller.abort();
          reject(new Error(message));
        }, A2A_REQUEST_TIMEOUT_MS);
        // Never hold the process open just to enforce a deadline.
        timer.unref?.();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Sign `env` with `signer`, send it, verify the reply's signature, and return the reply envelope. */
export async function sendEnvelope(
  client: Client,
  env: Envelope,
  signer: Signer,
  profile: WireProfile = wireProfileFromEnv(),
): Promise<Envelope> {
  return sendSignedEnvelope(client, signer.sign(env), profile, signer);
}

/** A verified reply plus the raw wire payload it arrived as — what the half-trail records. */
export interface VerboseReply {
  env: Envelope;
  /** The exact signed bytes the counterparty sent (its non-repudiation artifact). */
  raw: unknown;
  /** The wire profile the reply was READ under — this process's own, not one the reply advertised. */
  profile: WireProfile;
}

/**
 * The peer ANSWERED, and its answer was a refusal it computed itself — a bad signature, a message
 * addressed elsewhere, an illegal move. Distinct from every other throw on the send path (connection
 * refused, DNS, the request deadline) where nothing was ever delivered and the peer never had an opinion.
 *
 * That distinction exists for the adversarial self-probes (`buyer/src/probes.ts`), which put deliberately
 * invalid traffic on the wire and record "rejected as expected" as PROOF the receiver's gate holds. Every
 * failure used to reach them as a bare `Error`, so a supplier that was simply down — refused connection,
 * timeout, wrong port — produced that same proof, and the trail then claimed a gate had been exercised
 * against a process that never received a byte. See `isPeerRefusal`.
 */
export class PeerRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PeerRefused";
  }
}

/**
 * Did this error come from the PEER refusing, rather than from the message never arriving?
 *
 * Two shapes count, and they are the two ways a refusal is delivered: a failed Task carrying the peer's
 * own drop reason (`PeerRefused`, see `agent-rejection.test.ts` for that observed wire contract), and an
 * A2A protocol error the peer returned on either transport. Everything else — including a reply this side
 * refused — answers false, because the only safe default for a probe is "no proof obtained".
 */
export function isPeerRefusal(err: unknown): boolean {
  return err instanceof PeerRefused || isJsonRpcError(err) || isRestError(err);
}

/**
 * Send an already-signed envelope as-is and return the (signature-verified) reply. Kept separate so
 * a caller can deliberately send a TAMPERED envelope — mutated after signing — to prove the receiver
 * rejects it. On a valid exchange the reply's own signature is verified before it is returned.
 */
export async function sendSignedEnvelope(
  client: Client,
  signed: SignedEnvelope,
  profile: WireProfile = wireProfileFromEnv(),
  signer?: Signer,
): Promise<Envelope> {
  return (await sendSignedEnvelopeVerbose(client, signed, profile, signer)).env;
}

/**
 * Like `sendSignedEnvelope`, but also returns the raw inbound wire payload and its profile so the
 * caller can record the counterparty's signed message on its own half-trail. The reply's
 * signature is verified through its own profile before it is returned.
 */
/** Narrow `SendMessageResult` (`Message | Task`) without a discriminator field — see the call site. */
function isMessage(result: SendMessageResult): result is Message {
  return "messageId" in result;
}

/**
 * REQUEST activation of this profile's A2A extension, via the `A2A-Extensions` service parameter.
 *
 * A2A does not treat a card advertisement as "the extension is in use" — §3.2.6 makes activation a
 * per-request negotiation: the caller names the extension in the request, and the server echoes back what
 * it actually activated. This repo advertised A2CN on the card, sent A2CN bytes, and never took part in
 * that handshake, so "we speak A2CN over A2A" was true of the payload and not of the protocol. Between two
 * Meridian agents nothing looked wrong, because both sides decide the profile by reading each other's
 * cards (`selectWireProfile`) — the gap only shows against an implementation that follows the spec.
 *
 * Returns undefined for `meridian`, which advertises no extension and must therefore send no header.
 */
function extensionServiceParameters(profile: WireProfile): Record<string, string> | undefined {
  const uri = profile.extension?.uri;
  return uri ? ServiceParameters.create(withA2AExtensions(uri)) : undefined;
}

export async function sendSignedEnvelopeVerbose(
  client: Client,
  signed: SignedEnvelope,
  profile: WireProfile = wireProfileFromEnv(),
  signer?: Signer,
): Promise<VerboseReply> {
  // `Client.sendMessage` returns the RESULT (Message | Task) and throws on a protocol error, where
  // `A2AClient` returned the raw JSON-RPC envelope and left the caller to unwrap `{ result }` / `{ error }`
  // by hand. One less shape to get wrong, and a transport failure can no longer be mistaken for a reply.
  const result = await withDeadline(
    (signal) =>
      client.sendMessage(
        {
          message: signedEnvelopeToMessage(signed, "user", undefined, profile, signer),
          // Required in v1.0's `SendMessageRequest`. Meridian is single-tenant and asks for no
          // non-default send configuration, so all three carry their proto3 defaults.
          tenant: "",
          configuration: undefined,
          metadata: undefined,
        },
        { signal, serviceParameters: extensionServiceParameters(profile) },
      ),
    `A2A send to ${signed.to} timed out after ${A2A_REQUEST_TIMEOUT_MS}ms (no reply to ${signed.type})`,
  );
  // `SendMessageResult` is `Message | Task` and v1.0 dropped the `kind` discriminator from both — the
  // protobuf data model has no such field. Narrow STRUCTURALLY on `messageId`, which only `Message`
  // has. Testing the old `result.kind !== "message"` against v1.0 compares `undefined` to a string:
  // true for every reply, so a perfectly good negotiation answer would be thrown away as "not a
  // message" — which is why this is narrowed on a field that must exist rather than one that must not.
  if (!isMessage(result)) {
    // A failed drop comes back as a Task in the `failed` state carrying the reason as text; surface that
    // rather than a bare "expected a message", which told an operator nothing about WHY the peer refused.
    const detail = (result.status?.message?.parts ?? [])
      .flatMap((part) => (part.content?.$case === "text" ? [part.content.value] : []))
      .join(" ");
    throw new PeerRefused(`Expected a message reply, got a task${detail ? `: ${detail}` : ""}`);
  }
  // Same rule on the reply path: verify under the profile WE speak, not the one the reply arrived as.
  const received = receiveInbound(result, profile);
  const verdict = received.verify();
  if (!verdict.ok) {
    throw new Error(`reply signature from ${received.env.from} rejected: ${verdict.reason}`);
  }
  // ADDRESSING, on the reply path — the mirror of `checkAddressedTo` on the serving side. A signature
  // proves who wrote a reply, never that it answers OUR request: a correctly-signed message from a
  // different supplier, or one addressed to somebody else, verifies perfectly and was accepted here as
  // this negotiation's answer. Both directions need the check, and only the inbound one had it.
  //
  // `signed.to` is the peer we dialled and `signed.from` is us.
  if (received.env.from !== signed.to) {
    throw new Error(
      `reply identity mismatch: asked ${signed.to} but the reply is from ${received.env.from}`,
    );
  }
  // Compared against `signed.from` — the address WE put on the request — not `signer.did`. The signer is
  // optional here (the a2cn profile needs one to encode; meridian does not), so keying the check on it
  // meant that on the meridian path, where callers pass no signer, this check silently did not run at
  // all. `signed.from` is always present and is the same identity, so the check is now unconditional.
  //
  // The recipient itself is still guarded for presence rather than assumed: A2CN's §7.3.1 act does not
  // cover `recipient_did`, so a profile may hand back an envelope with no usable address. A missing
  // address is not a mismatch to report — it is simply nothing to check, and the `from` and
  // negotiationId checks either side of this are what pin the reply in that case.
  if (received.env.to && received.env.to !== signed.from) {
    throw new Error(
      `reply misaddressed: addressed to ${received.env.to}, not this agent (${signed.from})`,
    );
  }
  // ...and the reply must answer THIS negotiation. Identity alone does not pin it: the right supplier,
  // correctly addressed to us, can still hand back a correctly-signed message from a DIFFERENT
  // negotiation — its own earlier QUOTE, or the ACK for a deal we already settled — and every check
  // above passes. The buyer runs several negotiations against the same supplier concurrently, so these
  // are live messages sitting in the same process, not hypotheticals; admitting one crosses a reply
  // into the wrong deal's state machine, half-trail and §9 record.
  if (received.env.negotiationId !== signed.negotiationId) {
    throw new Error(
      `reply belongs to another negotiation: sent ${signed.negotiationId}, got ${received.env.negotiationId}`,
    );
  }
  // ...and it must answer THIS REQUEST, not merely this negotiation. The check above stops a reply
  // crossing between deals; on its own it still admits one crossing between TURNS of the same deal, which
  // is the same class of error one level finer. A supplier can hand back a correctly-signed message of its
  // own from earlier in this very negotiation — its previous COUNTER, or the ACK for a settle already
  // recorded — and everything above passes, because all of it is genuinely about this negotiation. The
  // correlation chain is the only thing that says "this is the answer to what I just asked".
  //
  // `inReplyTo` is schema-optional, but every reply on this path sets it (the seller's `reply()` copies
  // the inbound correlationId, and it survives the A2CN round trip via `in_reply_to`), so a missing one is
  // a reply that cannot be pinned rather than a legitimate shape to wave through.
  if (received.env.inReplyTo !== signed.correlationId) {
    throw new Error(
      `reply does not answer this request: sent correlationId ${signed.correlationId}, ` +
        `got inReplyTo ${received.env.inReplyTo ?? "(absent)"}`,
    );
  }
  return { env: received.env, raw: received.raw, profile: received.profile };
}
