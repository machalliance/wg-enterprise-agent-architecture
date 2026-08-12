import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueApprovalReceipt, loadSigner, OPERATOR_DID } from "@meridian/agent-runtime";
import type { Terms } from "@meridian/protocol";
import { ApprovalQueue } from "./approval-queue.js";

/** Approval timeout (#21): a timed-out item must reach a TERMINAL state — gone from pending() and no
 *  longer approvable — so a stale approval cannot resurrect a deal the negotiation already abandoned. */

const TERMS: Terms = { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" };

const OFFER_HASH = "offer-hash-under-test";
const NEG = "n";
const operator = loadSigner(OPERATOR_DID);
/** A valid operator receipt for the item under test — approve() now requires one. */
const receiptFor = (negotiationId: string) =>
  issueApprovalReceipt(
    { decision: "approve", sessionId: negotiationId, offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900, now: new Date() },
    operator,
  );

describe("ApprovalQueue timeout", () => {
  it("moves a timed-out item to a terminal state that cannot later be approved", async () => {
    const q = new ApprovalQueue();
    const item = q.enqueue({ supplierDid: "did:a", agentName: "A", negotiationId: "n", terms: TERMS, tier: "APPROVE_BEFORE_COMMIT", reason: "hold", offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900 });

    const decision = await q.awaitDecision(item.id, 5);
    assert.equal(decision.decision, "timeout");
    assert.equal(q.pending().length, 0, "a timed-out item leaves the pending queue");

    const approved = q.approve(item.id, receiptFor(NEG));
    assert.equal(approved?.status, "timed_out", "approve() must not resurrect a timed-out item");

    const again = await q.awaitDecision(item.id, 5);
    assert.equal(again.decision, "timeout", "re-awaiting a timed-out item still resolves to timeout, not approved");
  });

  it("settles every concurrent waiter for the same item — no waiter is dropped", async () => {
    const q = new ApprovalQueue();
    const item = q.enqueue({ supplierDid: "did:a", agentName: "A", negotiationId: "n", terms: TERMS, tier: "APPROVE_BEFORE_COMMIT", reason: "hold", offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900 });
    const a = q.awaitDecision(item.id, 10_000);
    const b = q.awaitDecision(item.id, 10_000); // a SECOND waiter must not orphan the first
    q.approve(item.id, receiptFor(NEG));
    const [ra, rb] = await Promise.all([a, b]);
    assert.deepEqual([ra.decision, rb.decision], ["approved", "approved"], "both waiters settle on the one decision");
    assert.ok(ra.receipt && rb.receipt, "both waiters receive the signed operator receipt");
  });

  it("does not hand out mutable references to its internal items", () => {
    const q = new ApprovalQueue();
    const src: Terms = { ...TERMS };
    const returned = q.enqueue({ supplierDid: "did:a", agentName: "A", negotiationId: "n", terms: src, tier: "APPROVE_BEFORE_COMMIT", reason: "hold", offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900 });
    // Mutating the caller's source object AND the returned snapshot must not touch the queue's state.
    src.unitPriceUsd = 1;
    returned.status = "approved";
    returned.terms.unitPriceUsd = 2;

    const pend = q.pending();
    assert.equal(pend.length, 1, "the item is still pending despite external mutation");
    assert.equal(pend[0]!.terms.unitPriceUsd, TERMS.unitPriceUsd, "stored terms were cloned, not shared");
  });

  it("clones the receipt on approve, so a later caller mutation cannot rewrite the signed record", () => {
    // `approve` stored the caller's object by reference while every other path through this class
    // cloned. The receipt is the one field with meaningful nesting of its own, and it is the artifact
    // whose entire purpose is to be the unaltered record of what a human approved — so whoever still
    // held the object could change the queue's copy after the fact.
    const q = new ApprovalQueue();
    const item = q.enqueue({ supplierDid: "did:a", agentName: "A", negotiationId: NEG, terms: TERMS, tier: "APPROVE_BEFORE_COMMIT", reason: "hold", offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900 });
    const receipt = receiptFor(NEG);
    q.approve(item.id, receipt);

    const originalScope = JSON.stringify(receipt.scope);
    (receipt.scope as Record<string, unknown>).session_id = "some-other-session";
    (receipt as { id: string }).id = "tampered";

    const stored = q.find(item.id)!.receipt!;
    assert.equal(JSON.stringify(stored.scope), originalScope, "the queue's receipt scope is its own copy");
    assert.notEqual(stored.id, "tampered", "the queue's receipt id is its own copy");
  });

  it("clones a receipt supplied at enqueue time too", () => {
    // The same reference leak, one method over: `enqueue` spreads the caller's item, which copies
    // `receipt` by reference. Rare (items are normally enqueued unapproved) but it is the same object
    // and the same guarantee, and a clone that holds on only some paths holds on none.
    const q = new ApprovalQueue();
    const receipt = receiptFor(NEG);
    const item = q.enqueue({ supplierDid: "did:a", agentName: "A", negotiationId: NEG, terms: TERMS, tier: "APPROVE_BEFORE_COMMIT", reason: "hold", offerHash: OFFER_HASH, amountUsd: 1000, thresholdUsd: 900, receipt });
    (receipt as { id: string }).id = "tampered";
    assert.notEqual(q.find(item.id)!.receipt!.id, "tampered", "the enqueued receipt was cloned");
  });
});
