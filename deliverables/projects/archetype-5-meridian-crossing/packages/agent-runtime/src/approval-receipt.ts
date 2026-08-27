import { canonicalize } from "@meridian/protocol";
import { verifyCredentials, verifyDetached, type Signer } from "./identity.js";

/**
 * A2CN §14 — the ApprovalReceipt.
 *
 * `AWAITING_HUMAN_APPROVAL` is the pause a party enters when an act would exceed its own mandate for
 * autonomous commitment. Meridian already had the behaviour: an APPROVE_BEFORE_COMMIT deal holds, and
 * nothing is transmitted until an operator acts. What it did not have was EVIDENCE. The approval was a
 * boolean in memory and a line in a log.
 *
 * That was the one weak link in an otherwise fully-signed system: every move an agent made was signed
 * and non-repudiable, and the single moment a HUMAN took responsibility for a purchase was the one
 * moment with no signature on it. Asked later "who authorised this?", the honest answer was "a log
 * says someone clicked."
 *
 * §14.1 fixes that with a signed artifact. To leave the pause, a receipt MUST:
 *   1. state an approval decision for the paused act
 *   2. reference the A2CN session id
 *   3. reference the paused offer's `protocol_act_hash`
 *   4. reference the mandate that required approval
 *   5. be signed by an operator-side key trusted by the mandate issuer
 *   6. be unexpired at the time the paused act is transmitted
 *
 * Point 5 is why the operator is a SEPARATE DID (`did:web:meridian-operator.example`, minted by
 * infra/identity) holding an `ApprovalAuthority` credential from the trust anchor. If the buyer agent
 * signed its own approvals the receipt would prove nothing — it would be the agent asserting it was
 * allowed to do the thing it was not allowed to do.
 */

/** The mandate an approval is granted against. Meridian has one per buyer run. */
export const MERIDIAN_MANDATE_ID = "a2cn:mandate:meridian-procurement" as const;

/** The credential type the trust anchor issues to a key permitted to approve over-mandate deals. */
export const APPROVAL_AUTHORITY_CREDENTIAL = "ApprovalAuthority" as const;

export interface ApprovalReceipt {
  artifact_type: "ApprovalReceipt";
  id: string;
  scope: {
    decision: "approve" | "reject";
    /** §14.1(3): the paused act's hash — what exactly was approved. */
    offer_hash: string;
    amount: string;
    threshold_crossed: string;
  };
  references: Array<{ type: string; id: string; relationship: string }>;
  /** When the operator actually decided. NOT in the §14.1 example artifact, and added deliberately: the
   *  §10.3 audit log requires `approved_at` for every receipt it references, and §10.3 also says receipt-
   *  backed fields are the ONLY audit metadata a recipient can verify rather than take on trust. An
   *  approval time sourced from an unsigned side channel would forfeit exactly that property, so it goes
   *  inside the signed payload. §14.1 permits receipts carrying equivalent-or-additional fields. */
  approved_at: string;
  /** ISO instant after which this receipt no longer authorises transmission (§14.1(6)). */
  expires_at: string;
  /** The operator DID that signed, and the verification method inside its DID document. */
  signer_did: string;
  signer_verification_method: string;
  /** Ed25519 over the canonical receipt-without-signature. */
  signature: string;
}

/** The exact bytes signed: the receipt with its signature field removed, canonicalized. */
function receiptPayload(receipt: ApprovalReceipt): string {
  const { signature: _sig, ...rest } = receipt;
  return canonicalize(rest);
}

export interface IssueReceiptInput {
  decision: "approve" | "reject";
  /** The A2CN session (Meridian negotiationId) this approval is scoped to. */
  sessionId: string;
  /** The paused act's hash — the offer the operator is approving, and nothing else. */
  offerHash: string;
  amountUsd: number;
  /** The autonomous-commitment ceiling that was crossed, which is WHY a human was needed. */
  thresholdUsd: number;
  /** How long the receipt authorises transmission. §14.2: expiry does not end the session. */
  ttlMs?: number;
  /** The instant the decision was made. Passed in so callers control the clock. */
  now: Date;
  mandateId?: string;
}

/** Mint and sign a receipt. `operator` MUST be the human operator's signer, not an agent's. */
export function issueApprovalReceipt(input: IssueReceiptInput, operator: Signer): ApprovalReceipt {
  const mandateId = input.mandateId ?? MERIDIAN_MANDATE_ID;
  const unsigned: Omit<ApprovalReceipt, "signature"> = {
    artifact_type: "ApprovalReceipt",
    // Derived from the session + the exact act, so a receipt for a different offer is a different id.
    id: `urn:meridian:receipt:${input.sessionId}:${input.offerHash.slice(0, 16)}`,
    scope: {
      decision: input.decision,
      offer_hash: input.offerHash,
      amount: `${input.amountUsd.toFixed(2)} USD`,
      threshold_crossed: `${input.thresholdUsd.toFixed(2)} USD`,
    },
    references: [
      { type: "negotiation_session", id: `a2cn:session:${input.sessionId}`, relationship: "approves" },
      { type: "mandate", id: mandateId, relationship: "fulfills" },
    ],
    approved_at: input.now.toISOString(),
    expires_at: new Date(input.now.getTime() + (input.ttlMs ?? 15 * 60_000)).toISOString(),
    signer_did: operator.did,
    signer_verification_method: operator.keyId,
  };
  const signature = operator
    .signDetached(Buffer.from(receiptPayload({ ...unsigned, signature: "" })))
    .toString("base64");
  return { ...unsigned, signature };
}

export interface ReceiptVerdict {
  ok: boolean;
  reason: string;
}

/**
 * Check a receipt against the paused act, per §14.1's six conditions. Every one is enforced: a receipt
 * for a DIFFERENT offer, a different session, an unauthorised signer, or one that has expired does not
 * release the pause. That strictness is the point — a receipt that authorised "some deal, roughly" is
 * exactly the evidence that fails under dispute.
 */
export function verifyApprovalReceipt(
  receipt: ApprovalReceipt,
  /** `mandateId` defaults to this repo's own mandate; pass it explicitly for any other issuer. */
  expected: { sessionId: string; offerHash: string; now: Date; mandateId?: string },
): ReceiptVerdict {
  if (receipt.artifact_type !== "ApprovalReceipt") return { ok: false, reason: "not an ApprovalReceipt" };
  if (receipt.scope.decision !== "approve") return { ok: false, reason: `receipt records '${receipt.scope.decision}', not an approval` };
  if (receipt.scope.offer_hash !== expected.offerHash) {
    return { ok: false, reason: "receipt approves a different act than the one being transmitted" };
  }
  const session = receipt.references.find((r) => r.type === "negotiation_session");
  if (session?.id !== `a2cn:session:${expected.sessionId}`) {
    return { ok: false, reason: "receipt does not reference this negotiation session" };
  }
  // The mandate must be THE expected one, by id. Accepting any reference merely typed "mandate" checked
  // that the field was populated, not that it named the authority which actually required this approval —
  // so a receipt fulfilling some OTHER mandate (a different tenant's, an older policy's, or one an
  // attacker names freely) satisfied it. Every sibling check here pins its subject to an expected value;
  // this one is the reason the surrounding doc-comment's "a receipt that authorised 'some deal, roughly'"
  // warning applied to the mandate too.
  const expectedMandateId = expected.mandateId ?? MERIDIAN_MANDATE_ID;
  if (!receipt.references.some((r) => r.type === "mandate" && r.id === expectedMandateId)) {
    return { ok: false, reason: `receipt does not reference the expected mandate ${expectedMandateId}` };
  }
  // An unparseable expiry is NaN, and every comparison against NaN is false — so `garbage <= now` reads
  // as "not expired" and the receipt sails through with no expiry at all. Reject it explicitly.
  const expiresAt = Date.parse(receipt.expires_at);
  if (!Number.isFinite(expiresAt)) {
    return { ok: false, reason: "receipt has no parseable expiry" };
  }
  if (expiresAt <= expected.now.getTime()) {
    return { ok: false, reason: "receipt has expired" };
  }
  // §14.1(5): signed by an operator-side key TRUSTED BY THE MANDATE ISSUER. A valid signature from a
  // key with no ApprovalAuthority credential is a stranger's signature, not an approval.
  const authority = verifyCredentials(receipt.signer_did, [APPROVAL_AUTHORITY_CREDENTIAL]);
  if (authority.status !== "valid") {
    return { ok: false, reason: `signer ${receipt.signer_did} holds no valid ApprovalAuthority: ${authority.detail}` };
  }
  const sigOk = verifyDetached(
    receipt.signer_did,
    receipt.signer_verification_method,
    Buffer.from(receiptPayload({ ...receipt, signature: "" })),
    Buffer.from(receipt.signature, "base64"),
  );
  return sigOk
    ? { ok: true, reason: `approved by ${receipt.signer_did}` }
    : { ok: false, reason: "receipt signature does not verify" };
}
