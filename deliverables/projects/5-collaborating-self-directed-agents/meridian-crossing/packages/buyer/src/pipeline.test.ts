import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSeller,
  loadCatalog,
  loadScenario,
  loadSigner,
  verifySignedEnvelope,
  type DiscoveredCandidate,
  type Seller,
  type SellerParams,
  type Signer,
  type SupplierId,
  type Trail,
} from "@meridian/agent-runtime";
import type { CapabilityAd, SignedEnvelope } from "@meridian/protocol";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import type { ChannelReply, NegotiationChannel } from "./negotiate.js";
import { negotiateAll, screenCandidates, type ScreenEvent } from "./pipeline.js";
import { COOPERATIVE, FIRM, sellerParams } from "./seller-fixtures.js";

/**
 * The shared procurement pipeline both entrypoints run.
 *
 * This code existed in two hand-maintained copies before pipeline.ts, and the copies had drifted twice —
 * once in the directory-stability check (count vs identity, a recorded bug) and once in the
 * `negotiation-end` trail record, where one entrypoint wrote `settleGate` and `reputation` and the other
 * did not. Neither copy had a test. The screening stages are pure and the record-writing is now
 * single-sourced, so both are checkable here without a directory, a port or an HTTP round trip.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const nullTrail: Trail = { append() {} };
const need = { unitsNeeded: scenario.shortfall.unitsNeeded, deadlineDays: scenario.shortfall.deadlineDays };

/** A recording trail, so a test can assert what the pipeline actually wrote. */
function recordingTrail(): { trail: Trail; records: Array<Record<string, unknown>> } {
  const records: Array<Record<string, unknown>> = [];
  return { trail: { append: (r) => void records.push(r) }, records };
}

const candidate = (ad: CapabilityAd): DiscoveredCandidate => ({ ad, cid: `cid-${ad.did}` });

describe("screenCandidates", () => {
  it("clears the honest suppliers and HARD-BLOCKS the one that fails identity", () => {
    const { trail, records } = recordingTrail();
    const ids: SupplierId[] = ["summit", "cascade", "alpine", "ridge"];
    const cleared = screenCandidates(ids.map((id) => candidate(loadCatalog(id))), need, trail);

    // RidgeLine advertises the BEST numbers in the directory and still must not be negotiated with — the
    // whole point of checking identity before value is exchanged, not after.
    assert.deepEqual(
      cleared.map((c) => c.ad.did).sort(),
      ids.filter((id) => id !== "ridge").map((id) => loadCatalog(id).did).sort(),
    );
    const ridge = records.find((r) => r.stage === "trust" && r.did === loadCatalog("ridge").did);
    assert.equal(ridge?.event, "dropped");
    assert.equal(ridge?.level, "REJECTED");
  });

  it("drops a candidate that cannot cover the shortfall, before policy or identity is consulted", () => {
    const { trail, records } = recordingTrail();
    const tooSmall: CapabilityAd = { ...loadCatalog("summit"), maxUnits: need.unitsNeeded - 1 };
    const cleared = screenCandidates([candidate(tooSmall)], need, trail);

    assert.equal(cleared.length, 0);
    // ONE record, at the shortfall stage. Reaching policy or trust would mean the buyer spent a
    // verification on a supplier that cannot fill the order.
    assert.deepEqual(records.map((r) => r.stage), ["shortfall"]);
  });

  it("drops a candidate whose lead time misses the deadline", () => {
    const { trail, records } = recordingTrail();
    const tooSlow: CapabilityAd = { ...loadCatalog("summit"), minLeadTimeDays: need.deadlineDays + 1 };
    assert.equal(screenCandidates([candidate(tooSlow)], need, trail).length, 0);
    // The STAGE, as in the sibling test above. An empty result alone also passes when the candidate is
    // dropped at `policy` or `trust` instead — a different bug wearing the same outcome, and one that
    // means the buyer paid for a verification on a supplier that cannot deliver in time.
    assert.deepEqual(records.map((r) => r.stage), ["shortfall"]);
  });

  it("writes a trail record for EVERY decision, and reports each one to the caller", () => {
    // The trail write lives inside the pipeline precisely so both entrypoints cannot disagree about it;
    // `onScreen` is presentation only. Asserting both here is what keeps that split honest.
    const { trail, records } = recordingTrail();
    const seen: ScreenEvent[] = [];
    screenCandidates([candidate(loadCatalog("summit")), candidate(loadCatalog("ridge"))], need, trail, (ev) =>
      seen.push(ev),
    );

    assert.ok(records.length >= 4, `expected a record per stage per candidate, got ${records.length}`);
    assert.equal(seen.length, records.length, "a decision was trailed but not reported (or the reverse)");
    for (const r of records) assert.ok(r.did && r.reason, "a screening record is missing its subject or its reason");
  });
});

// ---------------------------------------------------------------------------------------------------

interface Party {
  ad: CapabilityAd;
  seller: Seller;
  signer: Signer;
}

function party(id: SupplierId, behaviour: string, params: Partial<SellerParams>): Party {
  const ad = loadCatalog(id);
  const full: SellerParams = {
    behaviour,
    capacityUnits: ad.maxUnits,
    leadTimeDays: ad.minLeadTimeDays,
    openingPriceUsd: 0,
    floorPriceUsd: 0,
    concessionRate: 0,
    ...params,
  };
  return { ad, seller: createSeller(full, { did: ad.did, trail: nullTrail }), signer: loadSigner(ad.did) };
}

/** An in-process meridian channel — verify the buyer's envelope, run the seller, sign + verify reply. */
function channel(p: Party): NegotiationChannel {
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      if (!verifySignedEnvelope(signed).ok) throw new Error("buyer message rejected");
      const reply = p.signer.sign(await p.seller.handleAsync(signed));
      if (!verifySignedEnvelope(reply).ok) throw new Error("seller reply rejected");
      return { env: reply, raw: reply as unknown, wireProfile: "meridian" };
    },
  };
}

describe("negotiateAll", () => {
  it("runs the barrier: with two committable suppliers, exactly ONE settles and the other stands down", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const { trail, records } = recordingTrail();
    const parties = [
      party("summit", "cooperative", sellerParams(COOPERATIVE)),
      party("cascade", "competitive", sellerParams({ ...COOPERATIVE, floor: COOPERATIVE.floor + 3 })),
    ];
    const byDid = new Map(parties.map((p) => [p.ad.did, p]));

    const outcomes = await negotiateAll(
      parties.map((p) => ({ ad: p.ad, level: "VERIFIED" as const })),
      {
        buyerDid,
        mandate,
        governor,
        signer: buyerSigner,
        trail,
        channelFor: (ad) => channel(byDid.get(ad.did)!),
      },
    );

    assert.equal(outcomes.length, 2);
    // This is what the commit barrier is FOR: the buyer does not bind to one supplier before it knows
    // what the other would offer, so only the selected best-and-final commits.
    assert.equal(outcomes.filter((o) => o.result === "SETTLED").length, 1);
    const stoodDown = outcomes.find((o) => o.result === "WALKED");
    assert.equal(stoodDown?.reasonCode, "DONE", "a stand-down must go out as DONE, not as a rejection");
    // The selection itself is on the trail, naming the whole field — the record an operator reads to see
    // that the choice was made against real alternatives.
    const selection = records.find((r) => r.event === "commit-selection");
    assert.equal(selection?.mode, "autonomous");
    assert.equal((selection?.candidates as unknown[]).length, 2);
  });

  it("writes ONE negotiation-end record per deal, carrying the fields the two entrypoints disagreed about", async () => {
    // The regression this module exists to prevent. `settleGate` and `reputation` were written by the
    // batch entrypoint's copy and omitted by the served one, so the same durable artifact meant different
    // things depending on which binary produced it. `reasonCode` is the typed terminal code that `detail`
    // prose must never be parsed to recover.
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const { trail, records } = recordingTrail();
    const p = party("alpine", "firm", sellerParams(FIRM));

    const outcomes = await negotiateAll([{ ad: p.ad, level: "VERIFIED" }], {
      buyerDid,
      mandate,
      governor,
      signer: buyerSigner,
      trail,
      channelFor: () => channel(p),
    });

    const ends = records.filter((r) => r.event === "negotiation-end");
    assert.equal(ends.length, 1, "expected exactly one negotiation-end record");
    const end = ends[0]!;
    assert.equal(end.negotiationId, outcomes[0]!.negotiationId);
    assert.equal(end.result, outcomes[0]!.result);
    // Present as KEYS even when the value is undefined for this outcome — the divergence was a missing
    // field, and a reader cannot tell "not applicable" from "this entrypoint never wrote it".
    for (const key of ["reasonCode", "settleGate", "reputation", "tier", "terms", "rounds", "detail"]) {
      assert.ok(key in end, `negotiation-end is missing '${key}'`);
    }
    // Non-vacuous: reputation is a real score, not an absent field that happens to satisfy `in`.
    assert.equal(typeof end.reputation, "number");
  });

  it("a negotiation that throws is recorded and does not take down its siblings", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const { trail, records } = recordingTrail();
    const good = party("summit", "cooperative", sellerParams(COOPERATIVE));
    const bad = loadCatalog("alpine");
    const errors: unknown[] = [];

    const outcomes = await negotiateAll(
      [
        { ad: good.ad, level: "VERIFIED" },
        { ad: bad, level: "VERIFIED" },
      ],
      {
        buyerDid,
        mandate,
        governor,
        signer: buyerSigner,
        trail,
        channelFor: (ad) =>
          ad.did === bad.did
            ? { send: () => Promise.reject(new Error("transport exploded")) }
            : channel(good),
      },
      { onError: (err) => errors.push(err) },
    );

    // The surviving deal still reaches a terminal state. Without the barrier's idempotent withdraw
    // backstop this hangs forever instead: the thrown negotiation never reports, so the sibling waits on
    // a barrier that can no longer resolve.
    assert.equal(outcomes.length, 1);
    assert.equal(outcomes[0]!.supplierDid, good.ad.did);
    assert.equal(errors.length, 1);
    assert.ok(records.some((r) => r.event === "negotiation-error"));
  });
});
