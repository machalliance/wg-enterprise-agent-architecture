import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  computeRecordHash,
  parseTrailRecord,
  termsHashOf,
  type Envelope,
  type MessageType,
  type Terms,
  type TrailRecord,
  type TrailRecordBody,
  type WireProfileTag,
} from "@meridian/protocol";
import { verifyDetached, type Signer } from "./identity.js";

/**
 * The signed, hash-chained HALF-TRAIL. Each organization owns exactly one of these per run and
 * NEVER writes to another org's. It is the append-only decision store the accountability story rests
 * on: two independently-kept trails, no shared ledger, each of which is enough on its own to derive
 * the A2CN §9 transaction record (see transaction-record.ts). This is distinct from the free-form trail
 * (`trail.ts`) — that logs human-readable events; THIS logs the tamper-evident record of every
 * negotiation message that crossed the org boundary.
 *
 * Wire-profile interaction: the message-authenticity signature lives inside `wirePayload` and differs by wire
 * profile (envelope signature for `meridian`, A2CN protocol-act JWS for `a2cn`). The chain
 * signature (`sig`) is separate — THIS org signing the record hash, tamper-evidence of its own log.
 */

/** What a caller hands the half-trail for one message crossing the boundary. */
export interface HalfTrailEntry {
  direction: "SENT" | "RECEIVED";
  /** The decoded negotiation message (source of round/type/terms/correlationId). */
  envelope: Envelope;
  /** The exact signed wire payload that crossed — profile-encoded (the non-repudiation artifact). */
  wirePayload: unknown;
  wireProfile: WireProfileTag;
  counterpartyDid: string;
  disputeTermsRef?: string;
}

export interface HalfTrail {
  /** Append a signed, hash-chained record for one boundary-crossing message. Returns the written record. */
  record(entry: HalfTrailEntry): TrailRecord;
  /** Every record written by THIS instance so far, in order. */
  entries(): TrailRecord[];
}

function bodyOf(envelope: Envelope): { round: number; terms?: Partial<Terms>; disputeTermsRef?: string } {
  const body = (envelope.body ?? {}) as { round?: number; terms?: Partial<Terms>; disputeTermsRef?: string };
  return { round: body.round ?? 0, terms: body.terms, disputeTermsRef: body.disputeTermsRef };
}

/**
 * Open (or resume) a half-trail backed by a JSONL file. If the file already holds records, the chain
 * continues from the last one — so a re-run appends without breaking tamper-evidence. `signer` is this
 * org's own key; every record is signed over its `recordHash`.
 */
export function openHalfTrail(file: string, signer: Signer): HalfTrail {
  mkdirSync(dirname(file), { recursive: true });
  let existing: TrailRecord[];
  try {
    existing = existsSync(file) ? readHalfTrail(file) : [];
  } catch (err) {
    // A trail written by an OLDER protocol version does not parse — e.g. records carrying a `msgType`
    // that has since been removed from the verb set. That is a migration, not corruption, but the raw
    // schema error is unreadable and every agent dies on boot with it. Say what to do instead.
    throw new Error(
      `cannot read half-trail ${file}: ${err instanceof Error ? err.message : String(err)}\n\n` +
        `This usually means the file was written by an earlier version of the negotiation contract ` +
        `(for example before a message type was renamed or removed). Trails are disposable demo output — ` +
        `clear them and re-run:\n\n    pnpm demo:reset\n`,
    );
  }
  // Resuming onto a tampered chain would silently extend a broken log and let the corruption ride under
  // fresh, valid records — refuse to open it. An empty file verifies trivially; a valid one resumes.
  const verdict = verifyChain(existing);
  if (!verdict.ok) throw new Error(`cannot resume broken half-trail ${file}: ${verdict.reason}`);
  // verifyChain() only proves each record is self-consistent under its OWN signerDid — a chain signed
  // end-to-end by another org verifies just fine. But a half-trail is single-owner ("NEVER writes to
  // another org's"), so resuming here would mix identities under one seq. Refuse any foreign record.
  const foreign = existing.findIndex((r) => r.signerDid !== signer.did);
  if (foreign !== -1) {
    throw new Error(
      `half-trail ${file} is not owned by signer ${signer.did}: record ${foreign} signed by ${existing[foreign]!.signerDid}`,
    );
  }
  const records: TrailRecord[] = [...existing];
  let seq = records.length;
  let prevHash = records.length > 0 ? records[records.length - 1]!.recordHash : "";

  return {
    record(entry: HalfTrailEntry): TrailRecord {
      const { round, terms, disputeTermsRef } = bodyOf(entry.envelope);
      const body: TrailRecordBody = {
        negotiationId: entry.envelope.negotiationId,
        correlationId: entry.envelope.correlationId,
        round,
        direction: entry.direction,
        msgType: entry.envelope.type as MessageType,
        termsHash: termsHashOf(terms),
        counterpartyDid: entry.counterpartyDid,
        wireProfile: entry.wireProfile,
        wirePayload: entry.wirePayload,
        recordedAt: entry.envelope.sentAt,
        ...(entry.disputeTermsRef ?? disputeTermsRef
          ? { disputeTermsRef: entry.disputeTermsRef ?? disputeTermsRef }
          : {}),
      };
      const recordHash = computeRecordHash(body, seq, prevHash, signer.did, signer.keyId);
      const sig = signer.signDetached(Buffer.from(recordHash, "utf8")).toString("base64");
      const full: TrailRecord = {
        ...body,
        seq,
        prevHash,
        recordHash,
        sig,
        signerDid: signer.did,
        signerKeyId: signer.keyId,
      };
      appendFileSync(file, JSON.stringify(full) + "\n");
      records.push(full);
      seq += 1;
      prevHash = recordHash;
      return full;
    },
    entries(): TrailRecord[] {
      return [...records];
    },
  };
}

/** A half-trail record projected to the SAFE, display-only fields the dashboard renders side by
 *  side. Deliberately excludes `wirePayload`, `termsHash`, and signatures — only the turn shape and
 *  the correlationId (the thing that lines the two independent halves up) reach the browser. */
export interface HalfTrailView {
  seq: number;
  direction: "SENT" | "RECEIVED";
  msgType: string;
  round: number;
  correlationId: string;
  wireProfile: string;
}

/**
 * Project a half-trail to the display view, optionally scoped to one negotiation. This is what the
 * Reconcile panel shows as "buyer half-trail | supplier half-trail" — the two independently-kept logs
 * whose shared correlationIds prove the deal. It carries no private mandate number and no raw payload.
 */
export function projectHalfTrail(records: TrailRecord[], negotiationId?: string): HalfTrailView[] {
  return records
    .filter((r) => !negotiationId || r.negotiationId === negotiationId)
    .map((r) => ({ seq: r.seq, direction: r.direction, msgType: r.msgType, round: r.round, correlationId: r.correlationId, wireProfile: r.wireProfile }));
}

/** Read + validate every record from a half-trail JSONL file (no chain/signature verification). */
export function readHalfTrail(file: string): TrailRecord[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => parseTrailRecord(JSON.parse(line)));
}

export interface ChainVerdict {
  ok: boolean;
  reason: string;
  /** Index of the first broken record, if any. */
  brokenAt?: number;
}

/**
 * Verify a half-trail's tamper-evidence: for every record the stored `recordHash` must equal the
 * recomputed hash, the `prevHash` must link to the previous record, and the org's own `sig` must
 * verify against `signerDid`/`signerKeyId`. Any mutation of a recorded field trips exactly one of
 * these — which is what makes a single altered record detectable.
 */
export function verifyChain(records: TrailRecord[]): ChainVerdict {
  let prevHash = "";
  for (let i = 0; i < records.length; i++) {
    const r = records[i]!;
    if (r.seq !== i) return { ok: false, reason: `record ${i} has seq ${r.seq}`, brokenAt: i };
    if (r.prevHash !== prevHash) {
      return { ok: false, reason: `record ${i} prevHash does not link to record ${i - 1}`, brokenAt: i };
    }
    const { seq, prevHash: _p, recordHash, sig, signerDid, signerKeyId, ...body } = r;
    const expected = computeRecordHash(body as TrailRecordBody, seq, r.prevHash, signerDid, signerKeyId);
    if (recordHash !== expected) {
      return { ok: false, reason: `record ${i} recordHash does not match its contents (tampered)`, brokenAt: i };
    }
    const sigOk = verifyDetached(signerDid, signerKeyId, Buffer.from(recordHash, "utf8"), Buffer.from(sig, "base64"));
    if (!sigOk) {
      return { ok: false, reason: `record ${i} chain signature does not verify`, brokenAt: i };
    }
    prevHash = recordHash;
  }
  return { ok: true, reason: `chain intact over ${records.length} record(s)` };
}
