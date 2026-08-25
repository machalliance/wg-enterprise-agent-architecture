import { randomUUID } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "./canonical.js";

/**
 * The shared message envelope — the ONLY vocabulary the buyer and suppliers agree on.
 *
 * Every field here is load-bearing for later work, even though only PING/PONG are used today:
 *   - negotiationId groups every turn of one RFQ into a single negotiation.
 *   - correlationId is unique per message and is what lines up the two independent half-trails
 *     after the fact — neither side shares state, so this id is the only join key.
 *   - from/to are DIDs. They are SELF-ASSERTED until the identity layer stands up verification.
 *   - type is a closed enum. PING/PONG are the handshake; the negotiation contract adds the
 *     negotiation verbs. Keeping a single closed set here means `makeEnvelope` and the wire schema
 *     accept every legal move, while
 *     the stricter per-message body validation lives in negotiation.ts (NegotiationMsg).
 */
export const MessageType = z.enum([
  "PING",
  "PONG",
  // A transport-level acknowledgement, NOT a negotiation turn. A2A `sendMessage` is request/reply, so
  // a receiver must publish something even when the inbound message was the last word — an ACCEPT now
  // settles on its own (see negotiation.ts). ACK is deliberately absent from NEGOTIATION_TYPES: it
  // never enters the state machine, is never recorded on a half-trail, and proves nothing. The settled
  // deal is proven by the signed ACCEPT and the signed offer it accepts.
  "ACK",
  // Negotiation verbs. See negotiation.ts for the body contract + shared state machine.
  "RFQ",
  "QUOTE",
  "COUNTER",
  "ACCEPT",
  "WALKAWAY",
]);
export type MessageType = z.infer<typeof MessageType>;

export const Envelope = z.object({
  negotiationId: z.uuid(),
  correlationId: z.uuid(),
  inReplyTo: z.uuid().optional(),
  from: z.string(),
  to: z.string(),
  sentAt: z.iso.datetime(),
  type: MessageType,
  body: z.unknown(),
});
export type Envelope = z.infer<typeof Envelope>;

/** Parse + validate an unknown value as an Envelope, throwing on malformed input. */
export function parseEnvelope(value: unknown): Envelope {
  return Envelope.parse(value);
}

/**
 * A wire envelope carrying the sender's signature. The sender signs a canonical hash of the
 * envelope-without-signature with its DID key; `agent-runtime` verifies both the signature and the
 * `from` DID on receive, dropping anything that fails. This is the substrate for non-repudiation.
 */
export const SignedEnvelope = Envelope.extend({
  sig: z.string(), // base64 signature over signaturePayload(envelope)
  didKeyId: z.string(), // which verificationMethod in the sender's DID document produced `sig`
});
export type SignedEnvelope = z.infer<typeof SignedEnvelope>;

/** Parse + validate an unknown value as a SignedEnvelope, throwing on malformed input. */
export function parseSignedEnvelope(value: unknown): SignedEnvelope {
  return SignedEnvelope.parse(value);
}

/**
 * The exact bytes that get signed and verified: the envelope with its signature fields removed,
 * canonicalized. Sender and receiver both run this, so the hash is independent of key ordering or
 * whether `sig`/`didKeyId` are present yet.
 */
export function signaturePayload(env: Envelope | SignedEnvelope): string {
  const { sig: _sig, didKeyId: _didKeyId, ...rest } = env as SignedEnvelope;
  return canonicalize(rest);
}

/**
 * Build a well-formed envelope, filling in the machine-generated ids and timestamp.
 * `negotiationId` and `inReplyTo` are optional: omit `negotiationId` to start a fresh negotiation,
 * pass `inReplyTo` when this message answers an earlier one.
 */
export function makeEnvelope(input: {
  type: MessageType;
  from: string;
  to: string;
  body?: unknown;
  negotiationId?: string;
  inReplyTo?: string;
}): Envelope {
  return {
    negotiationId: input.negotiationId ?? randomUUID(),
    correlationId: randomUUID(),
    inReplyTo: input.inReplyTo,
    from: input.from,
    to: input.to,
    sentAt: new Date().toISOString(),
    type: input.type,
    body: input.body ?? {},
  };
}
