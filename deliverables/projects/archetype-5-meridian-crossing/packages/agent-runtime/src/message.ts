import { Role, type Message, type Part } from "@a2a-js/sdk";
import type { SignedEnvelope } from "@meridian/protocol";
import type { VerifyResult } from "./identity.js";
import {
  profileForInbound,
  wireProfileFromEnv,
  type A2cnSigner,
  type WireProfile,
} from "./wire-profile.js";

/**
 * Carry the protocol envelope inside an A2A `DataPart`. We transport structured JSON (not free text)
 * so both halves validate it with the same schema AND recompute the exact same canonical signature
 * input — nothing is lost or reordered in string parsing, which would break cross-org verification.
 *
 * The DataPart bytes are produced by the active WIRE PROFILE (`a2cn` re-expresses negotiation traffic
 * as a real A2CN message with its own protocol-act signature; `meridian` sends the envelope verbatim).
 * The a2cn profile needs the sender's `signer` to produce that signature.
 *
 * `profile` defaults to `WIRE_PROFILE`, the same default `receiveInbound` uses for the other direction.
 * It was pinned to MERIDIAN_PROFILE, which made a caller that omitted it SEND meridian while RECEIVING
 * under the configured profile — an agent set to `a2cn` would emit bytes its own peer refuses (that
 * refusal is deliberate; see `profileForInbound`). Both in-repo callers pass it explicitly, so this
 * only ever bit a caller that trusted the default.
 */
export function signedEnvelopeToMessage(
  env: SignedEnvelope,
  role: "user" | "agent",
  ids?: { contextId?: string; taskId?: string },
  profile: WireProfile = wireProfileFromEnv(),
  signer?: A2cnSigner,
): Message {
  return {
    // messageId is the A2A-layer id; we reuse our correlationId so the two layers line up in logs.
    messageId: env.correlationId,
    // The SDK's v1.0 data model is protobuf-shaped: `role` is a numeric enum rather than the v0.3
    // string, and a `data` part is a tagged `content` union rather than `{ kind: "data", data }`.
    // The STRING role stays in this function's signature on purpose — it is the domain vocabulary
    // every call site reads in, and mapping it here confines the protobuf shape to this one file.
    role: role === "agent" ? Role.ROLE_AGENT : Role.ROLE_USER,
    parts: [dataPart(profile.encode(env, signer))],
    // Required (not optional) in v1.0, and the empty string is the proto3 default for an unset
    // string field — NOT a meaningful context/task id. Sending `undefined` here type-errors; sending
    // a random value would associate every negotiation message with a task nobody created.
    contextId: ids?.contextId ?? "",
    taskId: ids?.taskId ?? "",
    metadata: undefined,
    // The A2A extensions THIS message relies on. Hardcoded `[]` before, which meant an A2CN-encoded
    // negotiation message carried no in-band declaration of the extension that produced it: the card
    // advertised A2CN, the bytes were A2CN, and the A2A layer said nothing. A receiver that inspects
    // messages rather than cards — a gateway, a logger, an SDK middleware — had no way to know.
    //
    // Declared, not enforced. `profileForInbound` is what actually refuses a payload in a form this agent
    // does not speak; this field is the protocol's way of SAYING so, and a sender that lies about it still
    // gets its bytes checked against the receiver's own profile. See `startAgent` for the header half.
    extensions: profile.extension ? [profile.extension.uri] : [],
    referenceTaskIds: [],
  };
}

/** A v1.0 `data` part carrying the wire payload. The non-content fields are required by the protobuf
 *  shape and have no meaning for a structured negotiation payload, so they carry proto3 defaults. */
function dataPart(value: unknown): Part {
  return {
    content: { $case: "data", value },
    metadata: undefined,
    filename: "",
    // Declared so a receiver reading media types (rather than the `$case` tag) still sees what this
    // is. The envelope is structured JSON by construction — see the module docstring.
    mediaType: "application/json",
  };
}

function dataPartOf(msg: Message): unknown {
  // Discriminated on the v1.0 `content.$case` tag. The v0.3 shape tested `p.kind === "data"`, which
  // on a v1.0 part is `undefined === "data"` — silently false for EVERY part, so every inbound
  // message would have thrown "carried no data part" rather than failing to compile.
  const dataPart = msg.parts.find((p) => p.content?.$case === "data");
  if (!dataPart) throw new Error("A2A message carried no data part; cannot read protocol envelope");
  return (dataPart.content as { $case: "data"; value: unknown }).value;
}

/**
 * Extract, decode, and expose verification for an inbound A2A message. The wire form is resolved
 * against what THIS agent speaks (`expected`, default `WIRE_PROFILE`) rather than taken from the
 * payload's own shape — otherwise the sender picks its own verification scheme and can downgrade the
 * receiver onto the weaker check (see `profileForInbound`). A payload in a form this agent does not
 * speak throws here, before it is decoded or dispatched.
 *
 * Decoding (schema + reconstruction) stays separate from `verify()` (the profile's native signature
 * check — the Ed25519 envelope check for `meridian`, the A2CN protocol-act JWS + act binding for
 * `a2cn`) so the caller controls when/whether to verify, exactly as the trust gate did.
 */
export function receiveInbound(
  msg: Message,
  expected: WireProfile = wireProfileFromEnv(),
): {
  env: SignedEnvelope;
  profile: WireProfile;
  /** The raw wire payload as it arrived — the exact signed bytes the half-trail records. */
  raw: unknown;
  verify: () => VerifyResult;
} {
  const data = dataPartOf(msg);
  const profile = profileForInbound(data, expected);
  return { env: profile.decode(data), profile, raw: data, verify: () => profile.verify(data) };
}

/** Back-compat shim: decode an inbound message to a SignedEnvelope (no verification). */
export function signedEnvelopeFromMessage(msg: Message): SignedEnvelope {
  return receiveInbound(msg).env;
}
