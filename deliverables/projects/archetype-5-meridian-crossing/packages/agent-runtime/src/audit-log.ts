import type { TrailRecord } from "@meridian/protocol";
import { detectWireProfile } from "./wire-profile.js";
import { actHashOf } from "./transaction-record.js";
import { uuidV5, A2CN_RECORD_NAMESPACE } from "./transaction-record.js";
import type { A2cnTerminalState } from "./a2cn.js";
import type { ApprovalReceipt } from "./approval-receipt.js";

/**
 * A2CN §10 — Component 7: the Audit Log.
 *
 * WHAT IT IS FOR. §10.1: a structured record of the session, generated on entering ANY terminal state,
 * "for all outcomes including failures, withdrawals, and timeouts". That last clause is the whole design
 * constraint. A log that only exists for successful deals is exactly the log nobody needs: the sessions an
 * auditor asks about are the ones that went wrong. So this builds for a walk-away and a timeout as
 * readily as for a settle, and the fields that do not apply are present and null rather than missing.
 *
 * WHAT IT DELIBERATELY OMITS. §10.3: "The negotiation log records message types, hashes, and values — not
 * full terms content." Full terms live in the §9 transaction record, and only for completed sessions.
 * That is a data-retention decision, not an oversight: an audit trail that duplicated every commercial
 * term would carry the confidentiality obligations of the deal itself into every compliance export.
 *
 * WHAT IT IS NOT. §10.3 again, and worth repeating wherever this is consumed: `audit_metadata` fields are
 * SELF-DECLARED by the implementing agent unless they reference signed artifacts. A recipient MUST treat
 * `ai_system_involved`, `human_oversight_present` and `autonomous_decision` as attestations by the party
 * that wrote them, not as protocol-verified facts. The one exception is `human_approval_receipts`, whose
 * entries point at ApprovalReceipts that ARE signed (by the operator's key, not the agent's — see
 * approval-receipt.ts) and can therefore be independently checked.
 *
 * And per §10.1: producing this does not constitute legal compliance with any regulation. It is evidence
 * an oversight programme can use, not a substitute for one.
 */

export const AUDIT_LOG_TYPE = "a2cn_audit_log" as const;
export const AUDIT_LOG_VERSION = "0.1" as const;
export const COMPLIANCE_EXPORT_TYPE = "a2cn_compliance_export" as const;
export const COMPLIANCE_EXPORT_VERSION = "0.1" as const;

/**
 * A party block. Every field is nullable because the RESPONDER may be unknown: a session rejected at
 * initiation never learns who was on the other end, and §10.2 requires that be visible as "not
 * applicable" rather than absent.
 */
export interface AuditParty {
  organization_name: string | null;
  did: string | null;
  agent_id: string | null;
  mandate_type: string | null;
}

/** One line of the message history. Hashes and values only — never the terms themselves (§10.3). */
export interface AuditMessage {
  sequence_number: number;
  message_type: string;
  message_id: string;
  /** null when the payload could not be decoded — see the fallback in `auditLogFromTrail`. */
  sender_did: string | null;
  timestamp: string;
  round_number: number | null;
  /** Total value offered in MINOR UNITS (cents), matching A2CN's money convention. Null when the message
   *  carried no priced terms — an RFQ, an ACK, a walk-away. */
  total_value_offered: number | null;
  protocol_act_hash: string | null;
}

export interface AuditViolation {
  timestamp: string;
  violation_type: string;
  message_id: string | null;
  description: string;
}

export interface AuditApprovalRef {
  approval_receipt_id: string;
  offer_hash: string;
  threshold_crossed: string;
  approved_at: string;
}

export interface AuditMetadata {
  ai_system_involved: boolean;
  human_oversight_present: boolean;
  autonomous_decision: boolean;
  human_approval_receipts: AuditApprovalRef[];
}

export interface AuditLog {
  log_type: typeof AUDIT_LOG_TYPE;
  log_version: typeof AUDIT_LOG_VERSION;
  log_id: string;
  session_id: string;
  /** Null for any non-COMPLETED session (§10.2) — there is no transaction record to point at. */
  record_id: string | null;
  generated_at: string;
  session_outcome: A2cnTerminalState;
  parties: { initiator: AuditParty; responder: AuditParty };
  session_timeline: {
    session_init_at: string;
    session_ack_at: string | null;
    /** Null when the session ended before any offer was sent (§10.2). */
    first_offer_at: string | null;
    terminal_state_at: string;
    total_duration_seconds: number;
  };
  negotiation_log: AuditMessage[];
  protocol_violations: AuditViolation[];
  audit_metadata: AuditMetadata;
}

/** The facts the message history cannot supply — the agent's own attestations and its outcome. */
export interface AuditLogInput {
  sessionOutcome: A2cnTerminalState;
  /** The §9 record id, when the session COMPLETED. Anything else must pass null. */
  recordId?: string | null;
  aiSystemInvolved: boolean;
  humanOversightPresent: boolean;
  autonomousDecision: boolean;
  approvalReceipts?: readonly ApprovalReceipt[];
  violations?: readonly AuditViolation[];
  /** Pinned by callers that need a reproducible log (tests, golden files). */
  generatedAt?: string;
  /** The DID of the organisation DECLARING this log — the owner of the half-trail it is built from.
   *
   *  REQUIRED, not defaulted. It is part of `log_id`, so a fallback value would put every forgetful
   *  caller's logs back into the single colliding namespace this field exists to split — and silently,
   *  which is the failure mode a compliance artifact can least afford. Making it required moves that
   *  from a runtime surprise to a compile error. */
  declaringOrgDid: string;
}

const priceOf = (env: { body?: unknown }): number | null => {
  const terms = (env.body as { terms?: { unitPriceUsd?: number; units?: number } } | undefined)?.terms;
  if (!terms || typeof terms.unitPriceUsd !== "number" || typeof terms.units !== "number") return null;
  // Minor units, and an integer by construction — a float here would be a wire-format bug downstream.
  return Math.round(terms.unitPriceUsd * terms.units * 100);
};

const NO_PARTY: AuditParty = { organization_name: null, did: null, agent_id: null, mandate_type: null };

function partyOf(record: { envelope: { from: string | null; body?: unknown } } | undefined): AuditParty {
  // An absent record and an undecodable one are the same claim here: no identity established. Deriving a
  // name from a sender we could not read would put a confident-looking org in a compliance artifact.
  if (!record || record.envelope.from === null) return { ...NO_PARTY };
  const declared = (record.envelope.body as { party?: { organization_name?: string; agent_id?: string } } | undefined)
    ?.party;
  return {
    organization_name: declared?.organization_name ?? record.envelope.from.replace(/^did:web:/, ""),
    did: record.envelope.from,
    agent_id: declared?.agent_id ?? record.envelope.from,
    // Constant for the same reason as the §9 record: every party here proves commit authority with a VC.
    mandate_type: "VerifiableCredential",
  };
}

/**
 * Build the audit log for one session from THIS organisation's own half-trail.
 *
 * Same sourcing rule as the §9 record: an org reads only its own log. Two parties therefore produce two
 * audit logs of the same session, and they will not be byte-identical — each sees its own send/receive
 * timestamps, and `audit_metadata` describes the declaring party's own oversight arrangements, not its
 * counterparty's. That is correct. The artifact that is meant to match across parties is the transaction
 * record, and it is referenced here by id.
 */
export function auditLogFromTrail(
  records: readonly TrailRecord[],
  negotiationId: string,
  input: AuditLogInput,
): AuditLog {
  // §10 is a TIMELINE, and everything below reads position as meaning: `first` is the session opener,
  // `last` the terminal message, and the gap between them the duration. A half-trail arriving in any
  // other order (a merged export, a store that does not preserve insertion) would otherwise name the
  // wrong opener and could report a negative duration. `seq` is the trail's own monotonic counter.
  const mine = records
    .filter((r) => r.negotiationId === negotiationId)
    .slice()
    .sort((a, b) => a.seq - b.seq || Date.parse(a.recordedAt) - Date.parse(b.recordedAt));
  const decoded: Array<{ record: TrailRecord; envelope: { from: string | null; type: string; correlationId: string; body?: unknown } }> = [];
  const decodeFailures: AuditViolation[] = [];
  for (const r of mine) {
    try {
      decoded.push({ record: r, envelope: detectWireProfile(r.wirePayload).decode(r.wirePayload) as never });
    } catch (err) {
      // A payload that will not decode is itself an auditable fact, not a reason to abandon the log. The
      // §9 record refuses to form here because a partial history would hash to a false agreement; an audit
      // log has the opposite duty — it must still describe a session that went wrong.
      //
      // But it must SAY SO. Falling back silently produces a log that looks complete and quietly
      // misattributes the message: the only sender available from the record body is the counterparty
      // DID, which is wrong for anything this org sent. Recording the failure is what stops a degraded
      // log from being mistaken for a clean one — which is the entire job of an audit artifact.
      decodeFailures.push({
        timestamp: r.recordedAt,
        violation_type: "undecodable_wire_payload",
        message_id: r.correlationId,
        description:
          `half-trail record ${r.seq} (${r.msgType}, profile ${r.wireProfile}) could not be decoded: ` +
          `${String(err).slice(0, 120)}. Sender and value for this entry are unavailable.`,
      });
      // `from: null` — NOT `r.counterpartyDid`. The record names the other side of the exchange, which is
      // simply the wrong answer for anything THIS org sent, and an audit log that misattributes a message
      // is worse than one that admits it does not know: the violation above says the sender is
      // unavailable, so the field has to agree with it. `partyOf` and `theirFirst` both treat null as
      // "no identity" rather than as a party.
      decoded.push({ record: r, envelope: { from: null, type: r.msgType, correlationId: r.correlationId } });
    }
  }

  const negotiation_log: AuditMessage[] = decoded.map(({ record, envelope }, i) => ({
    sequence_number: i + 1,
    message_type: envelope.type ?? record.msgType,
    message_id: envelope.correlationId ?? record.correlationId,
    sender_did: envelope.from,
    timestamp: record.recordedAt,
    round_number: typeof record.round === "number" ? record.round : null,
    total_value_offered: priceOf(envelope),
    protocol_act_hash: safeActHash(record, envelope),
  }));

  const first = decoded[0];
  const last = decoded[decoded.length - 1];
  // The first message that actually carried a price. An RFQ does not count as an offer, so a session that
  // died at the RFQ correctly reports null here rather than pretending negotiation began.
  const firstOffer = negotiation_log.find((m) => m.total_value_offered !== null) ?? null;
  const initAt = first?.record.recordedAt ?? input.generatedAt ?? new Date().toISOString();
  const terminalAt = last?.record.recordedAt ?? initAt;
  // The counterparty's first message — an ACK/QUOTE from the other side is what proves the session opened.
  //
  // "The other side" is only meaningful once we know who THIS side is, so an unreadable FIRST record makes
  // the question unanswerable rather than open: with `first.envelope.from` null, every decodable record
  // trivially differs from it, and the next one found — quite possibly another of our own messages — would
  // have been filed as the responder and stamped `session_ack_at`. Undefined is the honest answer; the
  // decode violation already records why. The per-entry null check then excludes undecodable LATER records
  // for the same reason: an unknown sender is not evidence that the counterparty replied.
  const theirFirst =
    first && first.envelope.from !== null
      ? decoded.find((d) => d.envelope.from !== null && d.envelope.from !== first.envelope.from)
      : undefined;

  return {
    log_type: AUDIT_LOG_TYPE,
    log_version: AUDIT_LOG_VERSION,
    // Deterministic rather than random: the same session and outcome always name the same log, so a log
    // can be de-duplicated and cross-referenced without a registry.
    // Seeded with the DECLARING ORG as well as the session and outcome. Both sides of a negotiation build
    // their own §10 log from their own half-trail, and with the org left out those two distinct artifacts
    // computed the SAME id — so de-duplicating or cross-referencing by log_id silently treated the
    // buyer's log and the supplier's as one document, which is the opposite of what a per-party audit
    // artifact is for. Still deterministic: the same org re-declaring the same session gets the same id.
    log_id: uuidV5(
      `audit:${input.declaringOrgDid}:${negotiationId}:${input.sessionOutcome}`,
      A2CN_RECORD_NAMESPACE,
    ),
    session_id: negotiationId,
    // §10.2: null unless the session COMPLETED. Guarded here rather than trusted from the caller, because
    // a record id on a walked session is a claim that a deal exists.
    record_id: input.sessionOutcome === "COMPLETED" ? (input.recordId ?? null) : null,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    session_outcome: input.sessionOutcome,
    parties: { initiator: partyOf(first), responder: partyOf(theirFirst) },
    session_timeline: {
      session_init_at: initAt,
      session_ack_at: theirFirst?.record.recordedAt ?? null,
      first_offer_at: firstOffer?.timestamp ?? null,
      terminal_state_at: terminalAt,
      total_duration_seconds: durationSeconds(initAt, terminalAt),
    },
    negotiation_log,
    protocol_violations: [...decodeFailures, ...(input.violations ?? [])],
    audit_metadata: {
      ai_system_involved: input.aiSystemInvolved,
      human_oversight_present: input.humanOversightPresent,
      autonomous_decision: input.autonomousDecision,
      human_approval_receipts: (input.approvalReceipts ?? []).map((r) => ({
        approval_receipt_id: r.id,
        offer_hash: r.scope.offer_hash,
        threshold_crossed: r.scope.threshold_crossed,
        approved_at: r.approved_at,
      })),
    },
  };
}

/** Whole seconds between two ISO timestamps, or 0 if either is unparseable.
 *  `Date.parse` yields NaN on a malformed timestamp, and `Math.max(0, Math.round(NaN))` is NaN — which
 *  `JSON.stringify` then writes as `null` into a numeric field of the §10 compliance export, producing a
 *  schema-invalid audit log from a single bad `recordedAt`. A 0 is honest about "not measurable". */
function durationSeconds(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / 1000));
}

function safeActHash(record: TrailRecord, envelope: unknown): string | null {
  try {
    return actHashOf(record.wirePayload, envelope as never);
  } catch {
    return null;
  }
}

/**
 * A2CN §10.5 — the compliance export package.
 *
 * SHOULD-level in the spec, and the reason to implement it anyway is that the audit log alone does not
 * answer an auditor's actual question. §10.4 maps Article 14 oversight concerns onto protocol artifacts
 * that live in four different places: the log, the transaction record, the message history, and the
 * signed approval receipts. Handing over one of the four and leaving the rest to be assembled by hand is
 * how evidence goes missing.
 *
 * `regulatory_context.high_risk_classification` stays "deployers-assessment-required" because that is the
 * honest answer: A2CN explicitly does not determine whether a given agent is a high-risk AI system, and
 * this code is in no position to decide it either. `legal_assessment_reference` is where a deployment
 * points at its own answer.
 */
export interface ComplianceExport {
  export_type: typeof COMPLIANCE_EXPORT_TYPE;
  export_version: typeof COMPLIANCE_EXPORT_VERSION;
  generated_at: string;
  regulatory_context: {
    framework: string;
    mapping: string;
    high_risk_classification: string;
    legal_assessment_reference: string | null;
  };
  session_id: string;
  audit_log: AuditLog;
  transaction_record: unknown | null;
  message_history: unknown[];
  mandate_references: Array<{
    party: "initiator" | "responder";
    mandate_id: string | null;
    mandate_hash: string | null;
    requires_human_approval_above: number | null;
    currency: string | null;
  }>;
  approval_receipts: Array<{ approval_receipt_id: string; artifact: ApprovalReceipt }>;
}

export function buildComplianceExport(input: {
  auditLog: AuditLog;
  transactionRecord?: unknown | null;
  messageHistory?: readonly unknown[];
  mandateReferences?: ComplianceExport["mandate_references"];
  approvalReceipts?: readonly ApprovalReceipt[];
  legalAssessmentReference?: string | null;
  generatedAt?: string;
}): ComplianceExport {
  return {
    export_type: COMPLIANCE_EXPORT_TYPE,
    export_version: COMPLIANCE_EXPORT_VERSION,
    generated_at: input.generatedAt ?? input.auditLog.generated_at,
    regulatory_context: {
      framework: "EU AI Act",
      mapping: "Article 14 human oversight",
      high_risk_classification: "deployers-assessment-required",
      legal_assessment_reference: input.legalAssessmentReference ?? null,
    },
    session_id: input.auditLog.session_id,
    audit_log: input.auditLog,
    transaction_record: input.transactionRecord ?? null,
    message_history: [...(input.messageHistory ?? [])],
    mandate_references: [...(input.mandateReferences ?? [])],
    // §10.5: preserve signed artifacts VERBATIM. Summarising a receipt would destroy the one part of the
    // audit metadata a recipient can independently verify.
    approval_receipts: (input.approvalReceipts ?? []).map((r) => ({ approval_receipt_id: r.id, artifact: r })),
  };
}
