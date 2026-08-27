import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EscalationQueue } from "./escalation-queue.js";

/**
 * Escalation queue lifecycle (M3). The queue is an append-only JSONL file whose
 * current state is reconstructed by replaying events — so the tests exercise the
 * replay, not just an in-memory map. Each test gets its own temp file so they are
 * independent and leave nothing behind.
 */

let dir: string;
let queuePath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "meridian-esc-"));
  queuePath = join(dir, "escalation-queue.jsonl");
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function sampleInput(sku = "MER-HYD-2L") {
  return {
    sku,
    proposedPrice: 62,
    currentPrice: 44,
    changePct: 40.9,
    reason: "heatwave demand spike",
    tierResult: "ESCALATE:EXCEEDS_NOTIFY_THRESHOLD",
    explanation: "exceeds the 15% notify threshold",
  };
}

describe("escalation queue", () => {
  it("enqueues a pending action with a generated id and timestamp", () => {
    const q = new EscalationQueue(queuePath);
    const held = q.enqueue(sampleInput());
    assert.ok(held.id, "an id was generated");
    assert.ok(held.timestamp, "a timestamp was set");
    assert.equal(held.status, "pending");
    assert.equal(held.sku, "MER-HYD-2L");
  });

  it("lists only pending actions, and reconstructs state from the file (replay)", () => {
    const q = new EscalationQueue(queuePath);
    const a = q.enqueue(sampleInput("MER-HYD-2L"));
    q.enqueue(sampleInput("MER-TENT-3S"));
    assert.equal(q.listPending().length, 2);

    // A fresh instance reading the same file must see the same state — proves the
    // JSONL replay works, not just the in-memory copy.
    const reopened = new EscalationQueue(queuePath);
    assert.equal(reopened.listPending().length, 2);
    assert.ok(reopened.get(a.id), "the reopened queue can find the first action by id");
  });

  it("approve moves an action out of pending and records the transition", () => {
    const q = new EscalationQueue(queuePath);
    const held = q.enqueue(sampleInput());
    const updated = q.approve(held.id);
    assert.ok(updated, "approve returned the updated action");
    assert.equal(updated.status, "approved");
    assert.equal(q.listPending().length, 0, "no longer pending");
    // Durable across a reopen.
    assert.equal(new EscalationQueue(queuePath).get(held.id)?.status, "approved");
  });

  it("reject moves an action out of pending as rejected", () => {
    const q = new EscalationQueue(queuePath);
    const held = q.enqueue(sampleInput());
    const updated = q.reject(held.id);
    assert.equal(updated?.status, "rejected");
    assert.equal(q.listPending().length, 0);
  });

  it("approving an unknown id returns undefined and changes nothing", () => {
    const q = new EscalationQueue(queuePath);
    q.enqueue(sampleInput());
    assert.equal(q.approve("no-such-id"), undefined);
    assert.equal(q.listPending().length, 1, "the real pending action is untouched");
  });

  it("a decided action cannot be decided again (no double-approve)", () => {
    const q = new EscalationQueue(queuePath);
    const held = q.enqueue(sampleInput());
    assert.ok(q.approve(held.id), "first approve succeeds");
    assert.equal(q.approve(held.id), undefined, "second approve is a no-op");
    assert.equal(q.reject(held.id), undefined, "cannot reject an approved action");
  });
});
