import { createHash } from "node:crypto";
import { z } from "zod";
import { canonicalize } from "./canonical.js";
import { MessageType } from "./envelope.js";
import { Terms } from "./negotiation.js";

/**
 * The shape of one record in a signed, hash-chained HALF-TRAIL. Each organization keeps its own
 * append-only trail and NEVER writes to another org's; accountability comes from lining up two
 * independent trails by correlationId after the fact, not from a shared ledger. Each org does that from
 * its own half alone — see agent-runtime/transaction-record.ts for the A2CN §9 record that replaced the
 * old cross-org read. Like the rest of `@meridian/protocol`, this file is pure data + canonicalization:
 * the crypto (chaining, signing, verifying) lives in agent-runtime.
 *
 * Wire-profile interaction: A2CN signs its own protocol act, so the message-authenticity signature differs by
 * wire profile. A record therefore carries BOTH the profile that produced the payload (`wireProfile`)
 * and the exact signed `wirePayload` that crossed the boundary, so a verifier can route the signature
 * check through the right profile. Crucially, `termsHash` is computed over the DECODED internal
 * `Terms` (via `termsHashOf`), never the wire bytes — so a `meridian` half-trail and an `a2cn`
 * half-trail of the same deal hash identically even though A2CN carries money in minor units.
 */

export const TrailDirection = z.enum(["SENT", "RECEIVED"]);
export type TrailDirection = z.infer<typeof TrailDirection>;

export const WireProfileTag = z.enum(["meridian", "a2cn"]);
export type WireProfileTag = z.infer<typeof WireProfileTag>;

/**
 * The substantive content of a record — everything that is hashed into the chain. Kept separate from
 * the chain/signature envelope so the exact bytes that get hashed are unambiguous and stable.
 */
export const TrailRecordBody = z.object({
  negotiationId: z.uuid(),
  correlationId: z.uuid(),
  round: z.number().int().nonnegative(),
  direction: TrailDirection,
  /** The negotiation verb (RFQ/QUOTE/COUNTER/ACCEPT/CONFIRM/WALKAWAY). */
  msgType: MessageType,
  /** Canonical hash of the DECODED Terms at this step ("" when the message carried none). */
  termsHash: z.string(),
  counterpartyDid: z.string(),
  /** Which wire profile produced `wirePayload`. */
  wireProfile: WireProfileTag,
  /** The exact signed wire payload that crossed the boundary — the non-repudiation artifact. Verified
   *  via the wire profile's own `verify()`, not conflated with the record `sig` below. */
  wirePayload: z.unknown(),
  /** Pre-agreed dispute-terms reference present before commit; recorded so arbitration has a start. */
  disputeTermsRef: z.string().optional(),
  recordedAt: z.iso.datetime(),
});
export type TrailRecordBody = z.infer<typeof TrailRecordBody>;

/**
 * A full half-trail record: the body plus the hash-chain and this org's own signature over the chain.
 * `sig` is THIS org signing `recordHash` (tamper-evidence of the LOG); message authenticity — who
 * authored the offer/acceptance — lives inside `wirePayload` and is a separate signature.
 */
export const TrailRecord = TrailRecordBody.extend({
  seq: z.number().int().nonnegative(),
  prevHash: z.string(),
  recordHash: z.string(),
  sig: z.string(),
  signerDid: z.string(),
  signerKeyId: z.string(),
});
export type TrailRecord = z.infer<typeof TrailRecord>;

export function parseTrailRecord(value: unknown): TrailRecord {
  return TrailRecord.parse(value);
}

/**
 * The profile-independent term identity. Hashing the DECODED `Terms` — not the wire bytes — is what
 * lets a `meridian` half-trail and an `a2cn` half-trail of the same deal reconcile: A2CN carries money
 * in minor units and a different envelope shape, but the decoded Terms are identical, so this hash is
 * too. Partial terms (an RFQ omits price) hash over just the present fields; absent terms hash to "".
 */
export function termsHashOf(terms: Partial<Terms> | undefined): string {
  if (!terms || Object.keys(terms).length === 0) return "";
  return sha256Hex(canonicalize(terms));
}

/**
 * The exact bytes hashed into the chain for a record: its body, its chain position, AND the
 * log-custody identity (`signerDid`/`signerKeyId`). Those two live on the record envelope rather than
 * the body, but the chain must still cover them — otherwise the trail owner could swap them for
 * another identity it holds a key for and re-sign `recordHash` undetected.
 */
export function recordHashInput(
  body: TrailRecordBody,
  seq: number,
  prevHash: string,
  signerDid: string,
  signerKeyId: string,
): string {
  return canonicalize({ body, seq, prevHash, signerDid, signerKeyId });
}

/**
 * The record's chain hash. The writer stores it; the verifier recomputes it and compares — any
 * mutation of the body, seq, prevHash, or the signer identity changes it, breaking the chain. Shared
 * by both sides so the hash can never drift between who wrote the trail and who audits it.
 */
export function computeRecordHash(
  body: TrailRecordBody,
  seq: number,
  prevHash: string,
  signerDid: string,
  signerKeyId: string,
): string {
  return sha256Hex(recordHashInput(body, seq, prevHash, signerDid, signerKeyId));
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}
