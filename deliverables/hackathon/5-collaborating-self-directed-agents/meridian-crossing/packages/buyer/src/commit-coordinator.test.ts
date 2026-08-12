import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Terms } from "@meridian/protocol";
import { CommitCoordinator, selectBestCandidate, type CommitCandidate } from "./commit-coordinator.js";

/**
 * Unit tests for the commit barrier itself, independent of the negotiation loop: the once-per-participant
 * arithmetic, the "hold until everyone has reported" guarantee, and the selection rule.
 */

const terms = (unitPriceUsd: number, extra: Partial<Terms> = {}): Terms => ({
  sku: "MER-TENT-3S",
  units: 3000,
  unitPriceUsd,
  leadTimeDays: 21,
  deliveryTerms: "DDP",
  ...extra,
});

const cand = (agentName: string, unitPriceUsd: number, extra: Partial<Terms> = {}): CommitCandidate => ({
  negotiationId: `neg-${agentName}`,
  supplierDid: `did:web:${agentName}`,
  agentName,
  terms: terms(unitPriceUsd, extra),
  tier: "NOTIFY_ON_SETTLE",
});

describe("selectBestCandidate", () => {
  it("picks the lowest unit price", () => {
    assert.equal(selectBestCandidate([cand("a", 92), cand("b", 90), cand("c", 94)]), 1);
  });

  it("breaks a price tie toward the tighter tier, then shorter lead time, then more units", () => {
    const tier = (c: CommitCandidate, t: CommitCandidate["tier"]): CommitCandidate => ({ ...c, tier: t });
    // Same price: AUTONOMOUS_SETTLE beats NOTIFY_ON_SETTLE.
    assert.equal(
      selectBestCandidate([tier(cand("a", 90), "NOTIFY_ON_SETTLE"), tier(cand("b", 90), "AUTONOMOUS_SETTLE")]),
      1,
    );
    // Same price + tier: shorter lead time wins.
    assert.equal(selectBestCandidate([cand("a", 90, { leadTimeDays: 21 }), cand("b", 90, { leadTimeDays: 14 })]), 1);
    // Same price + tier + lead time: more units wins.
    assert.equal(selectBestCandidate([cand("a", 90, { units: 3000 }), cand("b", 90, { units: 4000 })]), 1);
  });
});

const escalateCand = (agentName: string, unitPriceUsd: number): CommitCandidate => ({
  ...cand(agentName, unitPriceUsd),
  tier: "APPROVE_BEFORE_COMMIT",
});

describe("CommitCoordinator", () => {
  it("holds every offer until all participants report, then commits only the in-policy winner", async () => {
    const coordinator = new CommitCoordinator(3);
    const cheap = coordinator.offer(cand("cheap", 90));
    const pricy = coordinator.offer(cand("pricy", 92));

    // Two of three have reported; neither promise may resolve yet — no commit before the field is known.
    let settled = false;
    void Promise.race([cheap, pricy]).then(() => (settled = true));
    await new Promise((r) => setImmediate(r));
    assert.equal(settled, false, "no verdict is issued while a participant has not yet reported");

    // The third participant walks (withdraws) — now the barrier resolves.
    coordinator.withdraw();
    assert.equal(await cheap, "commit", "the cheapest in-policy offer is selected");
    assert.equal(await pricy, "standDown", "the pricier offer stands down");
  });

  it("prefers an in-policy offer over a cheaper out-of-policy one; the out-of-policy offer stands down", async () => {
    const coordinator = new CommitCoordinator(2);
    // The escalate offer is CHEAPER, but it is out of autonomous policy, so the in-policy offer wins and
    // the out-of-policy one stands down — no human is bothered when an in-policy commit is available.
    const outOfPolicy = coordinator.offer(escalateCand("firm", 88));
    const inPolicy = coordinator.offer(cand("clean", 93));
    assert.equal(await inPolicy, "commit", "the in-policy offer commits even though it is pricier");
    assert.equal(await outOfPolicy, "standDown", "the cheaper out-of-policy offer stands down");
  });

  it("sends every out-of-policy offer to the human when NOTHING is in policy", async () => {
    const coordinator = new CommitCoordinator(2);
    const a = coordinator.offer(escalateCand("firm-a", 95));
    const b = coordinator.offer(escalateCand("firm-b", 96));
    assert.equal(await a, "escalate", "with no in-policy offer, the human decides");
    assert.equal(await b, "escalate");
  });

  it("resolves to a no-op choice when every participant withdraws (nobody offered)", async () => {
    const coordinator = new CommitCoordinator(2);
    // Both walk; there is simply no commit to make. This must not throw or hang.
    coordinator.withdraw();
    coordinator.withdraw();
    await new Promise((r) => setImmediate(r));
    assert.equal(coordinator instanceof CommitCoordinator, true);
  });

  it("fires the onSelect hook once with the mode, winner, and the full candidate field", async () => {
    const seen: string[] = [];
    const coordinator = new CommitCoordinator(2, {
      onSelect: ({ mode, winner, candidates }) => seen.push(`${mode}:${winner?.agentName ?? "-"}:${candidates.length}`),
    });
    const cheap = coordinator.offer(cand("cheap", 88));
    const pricy = coordinator.offer(cand("pricy", 91));
    await Promise.all([cheap, pricy]);
    assert.deepEqual(seen, ["autonomous:cheap:2"], "onSelect names the mode, winner, and candidate count, once");
  });

  it("a throwing onSelect cannot strand the barrier — every offer still settles", async () => {
    // The live callback calls `trail.append`, which writes to a file and can throw. Called before the
    // resolve loop, that throw rejected the last reporter and left every SIBLING promise pending
    // forever, each holding its reservation against the cross-deal cap.
    const coordinator = new CommitCoordinator(2, {
      onSelect: () => {
        throw new Error("trail append failed");
      },
    });
    const cheap = coordinator.offer(cand("cheap", 88));
    const pricy = coordinator.offer(cand("pricy", 91));
    // A hang is the failure this guards, so bound the wait: an unresolved promise must fail the test
    // rather than sit here until the runner's own timeout with no explanation.
    const settled = await Promise.race([
      Promise.all([cheap, pricy]),
      new Promise((r) => setTimeout(() => r("TIMED OUT"), 500)),
    ]);
    assert.deepEqual(settled, ["commit", "standDown"], "both offers settle despite the callback throwing");
  });

  it("a throwing onSelect on the withdraw path does not surface to the withdrawing caller", async () => {
    // `withdraw()` is called from `runNegotiationCore`'s `finally`. A throw escaping here REPLACED
    // whatever real error was already unwinding, turning a transport failure into "trail append failed".
    const coordinator = new CommitCoordinator(2, {
      onSelect: () => {
        throw new Error("trail append failed");
      },
    });
    const offered = coordinator.offer(cand("cheap", 88));
    assert.doesNotThrow(() => coordinator.withdraw());
    assert.equal(await offered, "commit");
  });
});
