import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog, loadScenario, loadSigner } from "./index.js";
import { OPERATOR_DID } from "./identity.js";
import { issueApprovalReceipt, verifyApprovalReceipt } from "./approval-receipt.js";

/**
 * A2CN §14.1 — the six conditions a receipt must satisfy to release `AWAITING_HUMAN_APPROVAL`.
 *
 * The point of the artifact is that it is the ONLY signed evidence that a human, rather than the
 * agent, authorised a commitment the agent could not authorise alone. Each test below is one way that
 * evidence could be weaker than it looks.
 */

const scenario = loadScenario();
const operator = loadSigner(OPERATOR_DID);
const SESSION = "11111111-1111-4111-8111-111111111111";
const OFFER = "offer-act-hash-aaa";
const NOW = new Date("2026-07-15T12:00:00.000Z");
const LATER = new Date("2026-07-15T12:05:00.000Z");
const AFTER_EXPIRY = new Date("2026-07-15T13:00:00.000Z");

const issue = (over: Partial<Parameters<typeof issueApprovalReceipt>[0]> = {}) =>
  issueApprovalReceipt(
    { decision: "approve", sessionId: SESSION, offerHash: OFFER, amountUsd: 9500, thresholdUsd: 9400, now: NOW, ...over },
    operator,
  );

describe("A2CN §14 ApprovalReceipt", () => {
  it("a receipt from the operator releases the paused act", () => {
    const v = verifyApprovalReceipt(issue(), { sessionId: SESSION, offerHash: OFFER, now: LATER });
    assert.equal(v.ok, true, v.reason);
    assert.match(v.reason, /meridian-operator/);
  });

  it("records what was approved, for whom, and against which mandate", () => {
    const r = issue();
    assert.equal(r.artifact_type, "ApprovalReceipt");
    assert.equal(r.scope.offer_hash, OFFER, "§14.1(3) the paused act");
    assert.equal(r.scope.amount, "9500.00 USD");
    assert.equal(r.scope.threshold_crossed, "9400.00 USD", "why a human was needed at all");
    assert.ok(r.references.some((x) => x.type === "negotiation_session" && x.id === `a2cn:session:${SESSION}`), "§14.1(2)");
    assert.ok(r.references.some((x) => x.type === "mandate"), "§14.1(4)");
  });

  it("does not authorise a DIFFERENT offer", () => {
    // The sharpest failure mode: an operator approves a $9,500 deal and the agent transmits a
    // different one. Binding to the act hash is what makes that impossible.
    const v = verifyApprovalReceipt(issue(), { sessionId: SESSION, offerHash: "some-other-act", now: LATER });
    assert.equal(v.ok, false);
    assert.match(v.reason, /different act/);
  });

  it("does not authorise a different session", () => {
    const v = verifyApprovalReceipt(issue(), { sessionId: "22222222-2222-4222-8222-222222222222", offerHash: OFFER, now: LATER });
    assert.equal(v.ok, false);
    assert.match(v.reason, /session/);
  });

  it("expires (§14.1(6))", () => {
    const v = verifyApprovalReceipt(issue(), { sessionId: SESSION, offerHash: OFFER, now: AFTER_EXPIRY });
    assert.equal(v.ok, false);
    assert.match(v.reason, /expired/);
  });

  it("a rejection is not an approval", () => {
    const v = verifyApprovalReceipt(issue({ decision: "reject" }), { sessionId: SESSION, offerHash: OFFER, now: LATER });
    assert.equal(v.ok, false);
    assert.match(v.reason, /not an approval/);
  });

  it("rejects any edit to the signed content", () => {
    const edits = [
      (r: ReturnType<typeof issue>) => ({ ...r, scope: { ...r.scope, amount: "1.00 USD" } }),
      (r: ReturnType<typeof issue>) => ({ ...r, expires_at: "2099-01-01T00:00:00.000Z" }),
      (r: ReturnType<typeof issue>) => ({ ...r, references: [] }),
    ];
    for (const edit of edits) {
      const v = verifyApprovalReceipt(edit(issue()), { sessionId: SESSION, offerHash: OFFER, now: LATER });
      assert.equal(v.ok, false, "an edited receipt must not verify");
    }
  });

  it("THE BUYER AGENT CANNOT APPROVE ITS OWN DEAL", () => {
    // The reason the operator is a separate DID. This receipt is perfectly signed and internally
    // consistent — it just is not signed by anyone the trust anchor granted ApprovalAuthority. If this
    // passed, "a human approved it" would mean nothing more than "the agent said so".
    const selfSigned = issueApprovalReceipt(
      { decision: "approve", sessionId: SESSION, offerHash: OFFER, amountUsd: 9500, thresholdUsd: 9400, now: NOW },
      loadSigner(scenario.shortfall.buyer),
    );
    const v = verifyApprovalReceipt(selfSigned, { sessionId: SESSION, offerHash: OFFER, now: LATER });
    assert.equal(v.ok, false, "the agent must not be able to self-authorise");
    assert.match(v.reason, /ApprovalAuthority/);
  });

  it("a supplier cannot approve the buyer's deals either", () => {
    const bySupplier = issueApprovalReceipt(
      { decision: "approve", sessionId: SESSION, offerHash: OFFER, amountUsd: 9500, thresholdUsd: 9400, now: NOW },
      loadSigner(loadCatalog("summit").did),
    );
    const v = verifyApprovalReceipt(bySupplier, { sessionId: SESSION, offerHash: OFFER, now: LATER });
    assert.equal(v.ok, false);
    assert.match(v.reason, /ApprovalAuthority/);
  });
});
