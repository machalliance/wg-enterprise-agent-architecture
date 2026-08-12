import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { makeEnvelope, type Envelope, type Terms, type TrailRecord } from "@meridian/protocol";
import { auditLogFromTrail, buildComplianceExport, AUDIT_LOG_TYPE, AUDIT_LOG_VERSION } from "./audit-log.js";
import { issueApprovalReceipt } from "./approval-receipt.js";
import { loadSigner } from "./identity.js";
import { OPERATOR_DID } from "./identity.js";

/**
 * A2CN §10 — the audit log, tested against the clauses that are normative rather than the shape that
 * happens to be convenient.
 *
 * The load-bearing one is §10.2: "Implementations MUST explicitly include null fields rather than
 * omitting them, to allow audit consumers to distinguish 'not applicable' from 'missing data.'" That is a
 * requirement about the SERIALISED artifact, and it is easy to pass in TypeScript while failing on the
 * wire — `undefined` type-checks against `string | null` nowhere, but an optional property assigned
 * `undefined` vanishes in JSON.stringify and the consumer cannot tell a walked session from a truncated
 * file. So the null tests below assert on parsed JSON, not on the object.
 */

const SESSION = "3f7c1d20-2a1b-4c3d-8e9f-0a1b2c3d4e5f";
const BUYER = "did:web:meridian-outfitters.example";
const SELLER = "did:web:summit-gear.example";
const TERMS: Terms = { sku: "MER-TENT-3S", units: 100, unitPriceUsd: 91.5, leadTimeDays: 14, deliveryTerms: "DDP" };

const signerFor = (did: string) => loadSigner(did);

let seq = 0;
function record(from: string, type: string, at: string, terms?: Partial<Terms>): TrailRecord {
  const env: Envelope = makeEnvelope({
    type: type as Envelope["type"],
    from,
    to: from === BUYER ? SELLER : BUYER,
    negotiationId: SESSION,
    body: terms ? { round: seq, terms } : { round: seq },
  });
  seq += 1;
  return {
    negotiationId: SESSION,
    correlationId: env.correlationId,
    round: seq,
    direction: from === BUYER ? "SENT" : "RECEIVED",
    msgType: type as TrailRecord["msgType"],
    termsHash: "",
    counterpartyDid: from === BUYER ? SELLER : BUYER,
    wireProfile: "meridian",
    // SIGNED, because that is what actually crosses the boundary and what the wire profile knows how to
    // decode. An unsigned fixture silently took the undecodable path and produced a log that looked fine
    // while misattributing every sender — the reason that path now records a violation.
    wirePayload: signerFor(from).sign(env),
    recordedAt: at,
    seq,
    prevHash: "",
    recordHash: "",
    sig: "",
    signerDid: from,
    signerKeyId: `${from}#key-1`,
  };
}

const settledTrail = (): TrailRecord[] => {
  seq = 0;
  return [
    record(BUYER, "RFQ", "2026-08-02T10:00:00.000Z"),
    record(SELLER, "QUOTE", "2026-08-02T10:00:20.000Z", TERMS),
    record(BUYER, "COUNTER", "2026-08-02T10:00:35.000Z", { ...TERMS, unitPriceUsd: 88 }),
    record(BUYER, "ACCEPT", "2026-08-02T10:01:00.000Z", TERMS),
  ];
};

// `declaringOrgDid` is required: it is part of log_id, so every caller states whose log this is.
const base = {
  aiSystemInvolved: true,
  humanOversightPresent: true,
  autonomousDecision: true,
  declaringOrgDid: BUYER,
} as const;

describe("A2CN §10 audit log", () => {
  it("is produced for a COMPLETED session and points at the transaction record", () => {
    const log = auditLogFromTrail(settledTrail(), SESSION, {
      ...base,
      sessionOutcome: "COMPLETED",
      recordId: "urn:uuid:1234",
      generatedAt: "2026-08-02T10:02:00.000Z",
    });
    assert.equal(log.log_type, AUDIT_LOG_TYPE);
    assert.equal(log.log_version, AUDIT_LOG_VERSION);
    assert.equal(log.session_id, SESSION);
    assert.equal(log.record_id, "urn:uuid:1234");
    assert.equal(log.session_outcome, "COMPLETED");
    assert.equal(log.negotiation_log.length, 4);
    assert.equal(log.session_timeline.total_duration_seconds, 60);
  });

  // §10.1: "generated upon entering any terminal state, for all outcomes including failures,
  // withdrawals, and timeouts." A log that only forms for successful deals is the one nobody needs.
  for (const outcome of ["REJECTED_FINAL", "WITHDRAWN", "TIMED_OUT"] as const) {
    it(`is produced for a ${outcome} session, with a null record_id`, () => {
      const log = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: outcome });
      assert.equal(log.session_outcome, outcome);
      assert.equal(log.record_id, null);
    });
  }

  // §10.2 says record_id is null for non-COMPLETED sessions. Guarded in the builder rather than trusted
  // from the caller: a record id on a walked session asserts a deal exists that does not.
  it("refuses a record_id supplied for a non-COMPLETED session", () => {
    const log = auditLogFromTrail(settledTrail(), SESSION, {
      ...base,
      sessionOutcome: "WITHDRAWN",
      recordId: "urn:uuid:should-not-appear",
    });
    assert.equal(log.record_id, null);
  });

  // §10.2, asserted on the SERIALISED form — see the file docstring for why the object is not enough.
  it("serialises null fields explicitly instead of omitting them", () => {
    seq = 0;
    const rfqOnly = [record(BUYER, "RFQ", "2026-08-02T10:00:00.000Z")];
    const log = auditLogFromTrail(rfqOnly, SESSION, { ...base, sessionOutcome: "TIMED_OUT" });
    const wire = JSON.parse(JSON.stringify(log)) as Record<string, unknown>;

    assert.ok("record_id" in wire, "record_id must be present-and-null, not absent");
    assert.equal(wire["record_id"], null);
    const timeline = wire["session_timeline"] as Record<string, unknown>;
    assert.ok("first_offer_at" in timeline, "first_offer_at must be present-and-null");
    assert.equal(timeline["first_offer_at"], null, "an RFQ is not an offer");
    assert.ok("session_ack_at" in timeline);
    assert.equal(timeline["session_ack_at"], null, "the counterparty never answered");
    const responder = (wire["parties"] as Record<string, unknown>)["responder"] as Record<string, unknown>;
    for (const k of ["organization_name", "did", "agent_id", "mandate_type"]) {
      assert.ok(k in responder, `responder.${k} must be present-and-null`);
      assert.equal(responder[k], null);
    }
  });

  it("reports an empty negotiation_log for a session rejected at initiation", () => {
    const log = auditLogFromTrail([], SESSION, { ...base, sessionOutcome: "REJECTED_FINAL" });
    assert.deepEqual(log.negotiation_log, []);
    assert.equal(log.session_timeline.first_offer_at, null);
  });

  // §10.3: "records message types, hashes, and values — not full terms content." The audit log must not
  // become a second copy of the commercial terms, or every export inherits the deal's confidentiality.
  it("records values and hashes but never the terms themselves", () => {
    const log = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "COMPLETED" });
    const serialised = JSON.stringify(log);
    assert.ok(!serialised.includes("MER-TENT-3S"), "sku leaked into the audit log");
    assert.ok(!serialised.includes("DDP"), "delivery terms leaked into the audit log");
    assert.ok(!serialised.includes("leadTimeDays"), "lead time leaked into the audit log");

    const quote = log.negotiation_log[1]!;
    // Minor units, integer: 91.50 x 100 units = $9,150.00 = 915000 cents.
    assert.equal(quote.total_value_offered, 915_000);
    assert.ok(Number.isInteger(quote.total_value_offered));
    assert.equal(log.negotiation_log[0]!.total_value_offered, null, "an RFQ carries no value");
  });

  it("gives the same log_id for the same session and outcome, and a different one otherwise", () => {
    const a = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "COMPLETED" });
    const b = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "COMPLETED" });
    const c = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "WITHDRAWN" });
    assert.equal(a.log_id, b.log_id);
    assert.notEqual(a.log_id, c.log_id);
  });

  // The fixture bug that motivated the violation: a payload the wire profile cannot read must not yield a
  // clean-looking log. The sender for such an entry is genuinely unknown, and the log has to admit it.
  it("records an undecodable payload as a protocol violation rather than degrading silently", () => {
    seq = 0;
    const broken = record(BUYER, "QUOTE", "2026-08-02T10:00:00.000Z", TERMS);
    const log = auditLogFromTrail([{ ...broken, wirePayload: { not: "a wire payload" } }], SESSION, {
      ...base,
      sessionOutcome: "REJECTED_FINAL",
    });
    assert.equal(log.protocol_violations.length, 1);
    assert.equal(log.protocol_violations[0]!.violation_type, "undecodable_wire_payload");
    assert.equal(log.negotiation_log.length, 1, "the message is still listed");
  });

  it("carries protocol violations through", () => {
    const log = auditLogFromTrail(settledTrail(), SESSION, {
      ...base,
      sessionOutcome: "REJECTED_FINAL",
      violations: [
        { timestamp: "2026-08-02T10:00:30.000Z", violation_type: "signature_invalid", message_id: "m-2", description: "dropped" },
      ],
    });
    assert.equal(log.protocol_violations.length, 1);
    assert.equal(log.protocol_violations[0]!.violation_type, "signature_invalid");
  });

  it("references an approval receipt by its signed fields", () => {
    const operator = loadSigner(OPERATOR_DID);
    const receipt = issueApprovalReceipt(
      { decision: "approve", sessionId: SESSION, offerHash: "sha256:abc", amountUsd: 9300, thresholdUsd: 9100, now: new Date("2026-08-02T10:00:50.000Z") },
      operator,
    );
    const log = auditLogFromTrail(settledTrail(), SESSION, {
      ...base,
      autonomousDecision: false,
      sessionOutcome: "COMPLETED",
      approvalReceipts: [receipt],
    });
    const ref = log.audit_metadata.human_approval_receipts[0]!;
    assert.equal(ref.approval_receipt_id, receipt.id);
    assert.equal(ref.offer_hash, "sha256:abc");
    assert.equal(ref.threshold_crossed, "9100.00 USD");
    assert.equal(ref.approved_at, "2026-08-02T10:00:50.000Z");
    assert.equal(log.audit_metadata.autonomous_decision, false);
  });
});

describe("A2CN §10.5 compliance export", () => {
  it("bundles the four artifacts an Article 14 review asks for, receipts verbatim", () => {
    const operator = loadSigner(OPERATOR_DID);
    const receipt = issueApprovalReceipt(
      { decision: "approve", sessionId: SESSION, offerHash: "sha256:abc", amountUsd: 9300, thresholdUsd: 9100, now: new Date("2026-08-02T10:00:50.000Z") },
      operator,
    );
    const auditLog = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "COMPLETED", recordId: "urn:uuid:1234" });
    const pkg = buildComplianceExport({
      auditLog,
      transactionRecord: { record_id: "urn:uuid:1234" },
      messageHistory: [{ type: "QUOTE" }],
      mandateReferences: [
        { party: "initiator", mandate_id: "a2cn:mandate:meridian-procurement", mandate_hash: null, requires_human_approval_above: 9100, currency: "USD" },
      ],
      approvalReceipts: [receipt],
    });

    assert.equal(pkg.export_type, "a2cn_compliance_export");
    assert.equal(pkg.session_id, SESSION);
    assert.equal(pkg.regulatory_context.mapping, "Article 14 human oversight");
    // A2CN explicitly does not decide whether a deployment is high-risk, and neither can this code.
    assert.equal(pkg.regulatory_context.high_risk_classification, "deployers-assessment-required");
    assert.equal(pkg.regulatory_context.legal_assessment_reference, null);
    // §10.5: "preserve signed artifacts verbatim" — a summarised receipt cannot be re-verified.
    assert.deepEqual(pkg.approval_receipts[0]!.artifact, receipt);
    assert.ok(pkg.approval_receipts[0]!.artifact.signature.length > 0);
  });

  it("exports a null transaction_record for a session that never completed", () => {
    const auditLog = auditLogFromTrail(settledTrail(), SESSION, { ...base, sessionOutcome: "WITHDRAWN" });
    const pkg = buildComplianceExport({ auditLog });
    const wire = JSON.parse(JSON.stringify(pkg)) as Record<string, unknown>;
    assert.ok("transaction_record" in wire);
    assert.equal(wire["transaction_record"], null);
  });
});
