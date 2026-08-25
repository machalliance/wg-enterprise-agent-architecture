import type { AgentCard, AgentExtension } from "@a2a-js/sdk";
import { parseSignedEnvelope, type SignedEnvelope } from "@meridian/protocol";
import { verifySignedEnvelope, type Signer, type VerifyResult } from "./identity.js";
import {
  A2CN_EXTENSION_URI,
  A2CN_VERSION,
  decodeA2cnUnverified,
  encodeA2cn,
  isNegotiationVerb,
  looksLikeA2cn,
  verifyA2cn,
  type A2cnSigner,
} from "./a2cn.js";

/**
 * The WIRE PROFILE seam. The foundation separated the transport from the contract; this extends the same
 * seam to the *contract itself*. A profile is a codec at the message boundary: it `encode`s the
 * envelope this process is sending into the bytes that go on the wire, and `decode`s + `verify`s
 * inbound bytes — nothing above it (the state machine, the mandate, the reasoners) knows which
 * profile is active. Selection mirrors the `TRANSPORT` switch: a `WIRE_PROFILE` env var, defaulting
 * to `meridian` so the default negotiation demo stays byte-identical.
 *
 *   meridian  the negotiation contract, verbatim; the SignedEnvelope IS the wire payload, verified by the
 *             Ed25519 envelope signature. Default.
 *   a2cn      the negotiation envelope re-expressed as a real A2CN v0.2.0 message (see a2cn.ts), carrying
 *             A2CN's OWN protocol-act JWS signature (EdDSA over the same DID keys). Verification is
 *             the A2CN signature check, not the meridian one — so signing is A2CN-native, as the real
 *             protocol requires, while still keying off the DID identities.
 */
export type WireProfileName = "meridian" | "a2cn";

export interface WireProfile {
  readonly name: WireProfileName;
  /** The A2A card extension this profile advertises, if any (absent for `meridian`). */
  readonly extension?: AgentExtension;
  /** Envelope → the DataPart payload on the wire. `signer` is required by profiles that produce
   *  their own signature (a2cn); `meridian` ignores it (the SignedEnvelope already carries its sig). */
  encode(signed: SignedEnvelope, signer?: A2cnSigner): Record<string, unknown>;
  /** Inbound DataPart payload → signed envelope (schema + reconstruction; NO signature check). */
  decode(raw: unknown): SignedEnvelope;
  /** Verify the authenticity of an inbound wire payload (the profile's native signature check). */
  verify(raw: unknown): VerifyResult;
}

export const MERIDIAN_PROFILE: WireProfile = {
  name: "meridian",
  encode: (signed) => signed as unknown as Record<string, unknown>,
  decode: (raw) => parseSignedEnvelope(raw),
  verify: (raw) => verifySignedEnvelope(parseSignedEnvelope(raw)),
};

/**
 * The A2CN profile. Negotiation verbs are re-expressed as real A2CN messages; everything else has no A2CN
 * equivalent and passes through as a plain Meridian envelope — the foundational PING/PONG handshake and
 * the transport-level ACK a supplier returns for a settling ACCEPT — so turning the profile on never
 * breaks non-negotiation traffic.
 */
export const A2CN_PROFILE: WireProfile = {
  name: "a2cn",
  extension: {
    uri: A2CN_EXTENSION_URI,
    description: `A2CN v${A2CN_VERSION} commercial negotiation (goods_procurement); OQ-011.`,
    required: false, // never required: a counterparty without it falls back to `meridian`
    // Required by the SDK's v1.0 (protobuf-shaped) `AgentExtension`. This extension carries no
    // parameters — everything it needs is in the URI — so the proto3 default of an empty map is the
    // honest value. `cardSupportsA2cn` matches on the URI alone and never reads this.
    params: {},
  },
  encode: (signed, signer) => {
    if (!isNegotiationVerb(signed.type)) return MERIDIAN_PROFILE.encode(signed);
    if (!signer) throw new Error("a2cn profile requires a signer to produce the protocol-act signature");
    return encodeA2cn(signed, signer) as unknown as Record<string, unknown>;
  },
  decode: (raw) => (looksLikeA2cn(raw) ? decodeA2cnUnverified(raw) : parseSignedEnvelope(raw)),
  verify: (raw) => (looksLikeA2cn(raw) ? verifyA2cn(raw) : verifySignedEnvelope(parseSignedEnvelope(raw))),
};

const PROFILES: Record<WireProfileName, WireProfile> = { meridian: MERIDIAN_PROFILE, a2cn: A2CN_PROFILE };

export function makeWireProfile(name: WireProfileName): WireProfile {
  return PROFILES[name];
}

/** Resolve the wire profile from the environment, defaulting to the reproducible `meridian` profile. */
export function wireProfileFromEnv(): WireProfile {
  return process.env.WIRE_PROFILE === "a2cn" ? A2CN_PROFILE : MERIDIAN_PROFILE;
}

/**
 * Detect the profile a wire payload is EXPRESSED IN, by shape. Safe for payloads already committed to a
 * half-trail, which may legitimately be mixed-profile. NOT safe
 * as the sole input to a live trust decision — see `profileForInbound`.
 */
export function detectWireProfile(raw: unknown): WireProfile {
  return looksLikeA2cn(raw) ? A2CN_PROFILE : MERIDIAN_PROFILE;
}

/**
 * Pick the profile to VERIFY a live inbound payload under — the trust-path counterpart of
 * `detectWireProfile`.
 *
 * Detecting purely by shape let the SENDER choose its own verification scheme. The two profiles do not
 * protect the same fields (a2cn's §7.3.1 act omits the recipient and the chaining ids; see a2cn.ts), so
 * a peer could unilaterally downgrade a `meridian` receiver onto the narrower check just by sending an
 * A2CN-shaped payload — with no configuration on the receiving side. This process therefore only ever
 * accepts a payload in a form it actually speaks.
 *
 * A `meridian` receiver refuses A2CN payloads outright. An `a2cn` receiver accepts plain Meridian
 * envelopes ONLY for the verbs that have no A2CN form — the PING/PONG handshake and the transport-level
 * ACK for a settling ACCEPT, none of which carry terms. A plain envelope
 * carrying a negotiation verb is refused, because accepting it is the same downgrade in the other
 * direction: an ACCEPT that arrives as a bare envelope skips the §7.4 acceptance-binding check
 * entirely, and the sender chose that by picking an encoding.
 */
export function profileForInbound(raw: unknown, expected: WireProfile): WireProfile {
  if (looksLikeA2cn(raw)) {
    if (expected.name !== "a2cn") {
      throw new Error(
        "refusing an A2CN-encoded payload: this agent speaks the 'meridian' wire profile " +
          "(set WIRE_PROFILE=a2cn on both sides to negotiate over A2CN)",
      );
    }
    return A2CN_PROFILE;
  }
  if (expected.name === "a2cn" && isNegotiationVerb(verbOf(raw) ?? "")) {
    throw new Error(
      `refusing a plain Meridian '${verbOf(raw)}': this agent speaks the 'a2cn' wire profile and every ` +
        "negotiation verb has an A2CN form (only the PING/PONG handshake and the transport-level ACK " +
        "may arrive as a plain envelope)",
    );
  }
  return MERIDIAN_PROFILE;
}

/** The verb a plain wire payload claims, for the negotiation-verb gate above. Shape only — the value is
 *  never trusted beyond deciding which verification scheme the payload must be held to. */
function verbOf(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const type = (raw as Record<string, unknown>).type;
  return typeof type === "string" ? type : undefined;
}

/** True when a card advertises the A2CN A2A extension (OQ-011). */
export function cardSupportsA2cn(card: Pick<AgentCard, "capabilities">): boolean {
  // `capabilities` is optional in the v1.0 card, so a counterparty may legitimately publish none.
  // That is a card advertising NO extensions, which must read as "does not speak A2CN" and downgrade
  // to `meridian` — not throw while reading an otherwise valid card.
  return (card.capabilities?.extensions ?? []).some((e) => e.uri === A2CN_EXTENSION_URI);
}

/**
 * Negotiate the profile against a counterparty's card. Use A2CN only when THIS process wants it AND
 * the counterparty advertises it; otherwise fall back to `meridian` with no code change on either
 * side — the graceful downgrade the acceptance criteria require.
 */
export function selectWireProfile(
  ownPreference: WireProfile,
  counterpartyCard: Pick<AgentCard, "capabilities">,
): WireProfile {
  if (ownPreference.name === "a2cn" && cardSupportsA2cn(counterpartyCard)) return A2CN_PROFILE;
  return MERIDIAN_PROFILE;
}

/** The Signer subset a profile's encode needs. Re-exported for callers threading it through. */
export type { A2cnSigner, Signer };
