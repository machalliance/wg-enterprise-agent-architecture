import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createSeller,
  loadCatalog,
  loadScenario,
  loadSigner,
  issueApprovalReceipt,
  OPERATOR_DID,
  verifySignedEnvelope,
  type Seller,
  type SellerParams,
  type Signer,
  type SupplierId,
  type Trail,
} from "@meridian/agent-runtime";
import type {
  CapabilityAd,
  Envelope,
  SignedEnvelope,
  Terms,
  TrustLevel,
} from "@meridian/protocol";
import { loadMandate, privateValues, withheldFromPrompt, PRIVATE_MANDATE_FIELDS, type Mandate } from "./mandate.js";
import { assertSpeaksNoSecret, assertStructureHidesSecrets } from "./leak-lint.js";
import { userPrompt } from "./llm.js";
import { Governor } from "./governor.js";
import { CommitmentLedger, dealValueUsd } from "./commitments.js";
import { ReputationBook } from "./reputation.js";
import { OversightChannel } from "./oversight.js";
import { detectDrift, loadHistory } from "./drift.js";
import { ADVERSARIAL, COOPERATIVE, FIRM } from "./seller-fixtures.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel, type NegotiationOutcome } from "./negotiate.js";

/**
 * Mandate & policy acceptance suite. Every criterion is exercised over the REAL negotiation code path — the same
 * runNegotiation the live buyer uses — wired to the real seller engine through an in-process channel.
 * The channel keeps the crypto honest (each side signs; each side verifies) and the state machine
 * honest (an illegal move still throws), it just skips the HTTP hop so the whole mandate story runs
 * deterministically in-memory. No Docker, no directory, no ports.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const nullTrail: Trail = { append() {} };

// Seller behaviours come from ./seller-fixtures.js. They are deliberately NOT the seed's numbers — see
// that file for why, and scenario-premises.test.ts for the assertions that keep both sets honest.

interface Party {
  did: string;
  ad: CapabilityAd;
  seller: Seller;
  signer: Signer;
}

/** Build a seller party from a supplier's real DID/catalog and a behaviour, optionally forcing lead time. */
function makeParty(id: SupplierId, behaviour: string, params: Partial<SellerParams>, leadTimeDays?: number): Party {
  const ad = loadCatalog(id);
  const did = ad.did;
  const sellerParams: SellerParams = {
    behaviour,
    capacityUnits: ad.maxUnits,
    leadTimeDays: leadTimeDays ?? ad.minLeadTimeDays,
    openingPriceUsd: 0,
    floorPriceUsd: 0,
    concessionRate: 0,
    ...params,
  };
  return { did, ad, seller: createSeller(sellerParams, { did, trail: nullTrail }), signer: loadSigner(did) };
}

/**
 * An in-process channel: verify the buyer's signed envelope, run the seller, sign + verify the reply.
 * `onSend` can observe/intercept each outbound envelope (used by the kill-switch tests). Returns the
 * verified reply exactly as the wire path would.
 */
function channelFor(party: Party, onSend?: (signed: SignedEnvelope) => void): NegotiationChannel {
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      onSend?.(signed);
      const inbound = verifySignedEnvelope(signed);
      if (!inbound.ok) throw new Error(`buyer message rejected: ${inbound.reason}`);
      const reply = party.seller.handle(signed);
      const signedReply = party.signer.sign(reply);
      const verdict = verifySignedEnvelope(signedReply);
      if (!verdict.ok) throw new Error(`seller reply rejected: ${verdict.reason}`);
      // meridian in-process: the SignedEnvelope IS the wire payload (half-trail records it as-is).
      return { env: signedReply, raw: signedReply as unknown, wireProfile: "meridian" };
    },
  };
}

function cooperativeParams(): Partial<SellerParams> {
  return { openingPriceUsd: COOPERATIVE.opening, floorPriceUsd: COOPERATIVE.floor, concessionRate: COOPERATIVE.concession };
}
function firmParams(): Partial<SellerParams> {
  return { openingPriceUsd: FIRM.opening, floorPriceUsd: FIRM.floor, concessionRate: FIRM.concession };
}
function adversarialParams(): Partial<SellerParams> {
  return {
    openingPriceUsd: ADVERSARIAL.opening,
    floorPriceUsd: ADVERSARIAL.floor,
    concessionRate: ADVERSARIAL.concession,
    jitterUsd: ADVERSARIAL.jitter,
  };
}

interface RunOpts {
  party: Party;
  trust: TrustLevel;
  governor: Governor;
  mandate: Mandate;
  channel?: NegotiationChannel;
  onOutbound?: (signed: SignedEnvelope) => void;
}

function run(opts: RunOpts): Promise<NegotiationOutcome> {
  return runNegotiation({
    buyerDid,
    signer: buyerSigner,
    mandate: opts.mandate,
    governor: opts.governor,
    trust: opts.trust,
    ad: opts.party.ad,
    trail: nullTrail,
    channel: opts.channel ?? channelFor(opts.party),
    onOutbound: opts.onOutbound,
  });
}

describe("mandate & policy", () => {
  it("Summit's converged terms classify AUTONOMOUS_SETTLE → the buyer settles with no human", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const summit = makeParty("summit", "cooperative", cooperativeParams());

    const outcome = await run({ party: summit, trust: "VERIFIED", governor, mandate });

    assert.equal(outcome.result, "SETTLED");
    assert.equal(outcome.tier, "AUTONOMOUS_SETTLE");
    assert.ok(outcome.terms && outcome.terms.unitPriceUsd <= mandate.tiers.autonomousSettle.priceAtOrBelow);
    assert.equal(governor.approvals.pending().length, 0, "nothing queued for a human");
    assert.equal(governor.ledger.committedUsd(), dealValueUsd(outcome.terms!), "the settle is banked against the cap");
  });

  it("Alpine's best terms classify APPROVE_BEFORE_COMMIT → queued; nothing committed until approval", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const alpine = makeParty("alpine", "firm", firmParams());

    const outcome = await run({ party: alpine, trust: "VERIFIED", governor, mandate });

    assert.equal(outcome.result, "ESCALATE");
    assert.equal(outcome.tier, "APPROVE_BEFORE_COMMIT");
    assert.equal(governor.ledger.committedUsd(), 0, "an escalated deal commits nothing");

    const pending = governor.approvals.pending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.supplierDid, alpine.did);

    // Nothing settles on approval by itself (that is a follow-on action); the gate is that a human
    // must act, and until they do the deal is uncommitted.
    // The signed operator receipt is now REQUIRED to approve — an unsigned click no longer counts.
    governor.approvals.approve(
      pending[0]!.id,
      issueApprovalReceipt(
        { decision: "approve", sessionId: pending[0]!.negotiationId, offerHash: pending[0]!.offerHash, amountUsd: pending[0]!.amountUsd, thresholdUsd: pending[0]!.thresholdUsd, now: new Date() },
        loadSigner(OPERATOR_DID),
      ),
    );
    assert.equal(governor.approvals.pending().length, 0);
    assert.equal(governor.ledger.committedUsd(), 0);
  });

  it("RidgeLine (admitted as verified-but-adversarial) is walked away from EARLY — it never moves", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const ridge = makeParty("ridge", "adversarial", adversarialParams());

    // Admit it as VERIFIED — the identity gate would reject it, but this is the mandate's "what if it got in" case.
    const outcome = await run({ party: ridge, trust: "VERIFIED", governor, mandate });

    assert.equal(outcome.result, "WALKED");
    assert.equal(governor.ledger.committedUsd(), 0);
    assert.equal(governor.approvals.pending().length, 0);
    // The buyer stops because RidgeLine STOPPED MOVING, not because a counter went past a round limit.
    // Its jitter oscillates around its opening, so concessions are ~zero and `bargainingHasStalled`
    // fires almost immediately. That is the point of the momentum rule: `budget.maxRounds` is a runaway
    // guard, and burning all 20 rounds on a counterparty that is visibly stonewalling would be the bug.
    assert.ok(
      outcome.rounds < mandate.budget.maxRounds,
      `should quit well inside the runaway guard, used ${outcome.rounds} of ${mandate.budget.maxRounds}`,
    );
    // Its reputation was down-weighted by the repeated stalls.
    assert.ok(governor.reputation.score(ridge.did) < 0.5, "reputation dropped on stalls");
  });

  it("no-leak lint: reservation price / spend cap never appear in any outbound wire message", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const outbound: SignedEnvelope[] = [];
    const capture = (s: SignedEnvelope) => outbound.push(s);

    // Run all three behaviours so every outbound verb is exercised.
    await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", governor, mandate, onOutbound: capture });
    await run({ party: makeParty("alpine", "firm", firmParams()), trust: "VERIFIED", governor: new Governor(mandate), mandate, onOutbound: capture });
    await run({ party: makeParty("ridge", "adversarial", adversarialParams()), trust: "VERIFIED", governor: new Governor(mandate), mandate, onOutbound: capture });

    assert.ok(outbound.length > 0, "we actually captured traffic");
    // By VALUE, not by characters. `String(...)` + `includes` only ever caught the one spelling
    // `String()` happens to produce: a reservation of 96 written as "96.00", "96.0" or "9.6e1", or a cap
    // of 150000 written "150,000", walked straight past a test whose own title promised it could not.
    // `spokenNumericValues` is the same tokeniser `safeOutboundRationale` runs on the way out, which is
    // the point — this lint should fail exactly when that guard would have let something through.
    const secrets = privateValues(mandate);

    for (const env of outbound) {
      // Private KEY names must not appear ANYWHERE in the envelope — top-level or body.
      const wireFull = JSON.stringify(env);
      for (const field of PRIVATE_MANDATE_FIELDS) {
        assert.ok(!wireFull.includes(field), `private key '${field}' leaked in ${env.type}`);
      }
      // Private VALUES are only meaningful against BODY content: the envelope's UUIDs and timestamps
      // legitimately contain arbitrary digit runs (e.g. "96"), so scanning the whole envelope for a bare
      // number gives false positives. The private numbers can only leak via body terms/reasons.
      assertStructureHidesSecrets(env.body, secrets, `${env.type} body`);
      // The buyer's own COUNTER bids never climb to or above the bid ceiling, so the sequence a
      // counterparty observes cannot be used to triangulate the reservation. (An ACCEPT legitimately
      // carries the seller's own agreed price — a number the seller already named.)
      if (env.type === "COUNTER") {
        const terms = (env.body as { terms?: Partial<Terms> }).terms;
        assert.ok(
          terms?.unitPriceUsd !== undefined && terms.unitPriceUsd <= mandate.maxBidUsd,
          `buyer COUNTER bid $${terms?.unitPriceUsd} > maxBid $${mandate.maxBidUsd}`,
        );
      }
    }
  });

  it("no-leak lint: reservation price / spend cap never reach the LLM prompt either", () => {
    // The wire is not the only channel out of this process. With the default single LLM_BASE_URL the
    // buyer and all three suppliers share one gateway, so the prompt is somewhere both sides of the
    // negotiation touch — a private number in it is disclosed just as surely as one on the wire.
    const mandate = loadMandate(scenario);
    // `withheldFromPrompt`, not `privateValues`: the prompt has one MORE secret than the wire does. The
    // bid ceiling goes out on the wire legitimately (it is the buyer's own capped COUNTER price), but
    // naming it to the model anchors every bid onto it.
    const secrets = withheldFromPrompt(mandate);

    // Cover both sides of the one branch in the prompt (offer within limits vs outside them), so the
    // check cannot pass just because the sampled offer happened to take the safe path.
    const offers: Terms[] = [
      { sku: mandate.sku, units: mandate.unitsNeeded, unitPriceUsd: 88, leadTimeDays: 14, deliveryTerms: "DDP" },
      { sku: mandate.sku, units: mandate.unitsNeeded, unitPriceUsd: 151, leadTimeDays: 30, deliveryTerms: "DDP" },
    ];

    for (const offer of offers) {
      for (const budgetExhausted of [false, true]) {
        const prompt = userPrompt(mandate, {
          offer,
          countersSent: 2,
          firstOfferPriceUsd: 160,
          trust: "VERIFIED",
          budgetExhausted,
        });
        for (const field of PRIVATE_MANDATE_FIELDS) {
          assert.ok(!prompt.includes(field), `private key '${field}' leaked into the LLM prompt`);
        }
        // All THREE private figures, compared as values. The reservation and the cap were checked with
        // `prompt.includes(String(...))`, which sees one spelling; the ceiling had a correct but
        // hand-rolled by-value check of its own, whose tokeniser was a third re-derivation of
        // rationale.ts's and drifted from it (no `.` separator, no exponent, no magnitude suffix). One
        // helper, one tokeniser, and the ceiling stops being the only figure checked properly.
        //
        // The ceiling is WITHHELD, not merely framed. Showing it and asking the model not to aim there
        // was the earlier mitigation, adopted after 4/4 runs settled at exactly the ceiling; framing
        // helped but left the anchor in place, and every dollar between a justified bid and that number
        // is margin given away. It is enforced in code instead — `boundedBid`, plus `clamp`'s fallback
        // to the deterministic reciprocal bid when a proposal exceeds it, which is what stops "withheld"
        // from turning into "always pinned at the bound".
        assertSpeaksNoSecret(prompt, secrets, "the LLM prompt");
        // The model must still be told what it needs to choose ACCEPT vs COUNTER/ESCALATE — the
        // derived verdict, never the threshold that produced it.
        assert.match(prompt, /POLICY VERDICT[\s\S]*(WITHIN|OUTSIDE) your confidential limits/,
          "the prompt still carries the derived limit verdict — the model needs it to choose ACCEPT vs COUNTER");
        // ...but the model must still know a bound EXISTS, or it reads an unbounded mandate and a refused
        // over-ceiling bid becomes an unexplained silence rather than a rule it was told about.
        assert.match(prompt, /A ceiling exists and is enforced outside your control/,
          "the prompt must say a bound exists without naming it");
      }
    }
  });

  it("kill switch severs a live negotiation mid-flight (no commitment made)", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const alpine = makeParty("alpine", "firm", firmParams());

    // Trip the switch on the buyer's 2nd COUNTER — a genuinely live, mid-negotiation halt.
    let counters = 0;
    const channel = channelFor(alpine, (signed) => {
      if (signed.type === "COUNTER" && ++counters === 2) governor.killSwitch.trip("operator pressed kill (dashboard)");
    });

    const outcome = await run({ party: alpine, trust: "VERIFIED", governor, mandate, channel });

    assert.equal(outcome.result, "WALKED");
    assert.match(outcome.detail, /kill switch/i);
    assert.equal(governor.ledger.committedUsd(), 0);
    assert.equal(governor.approvals.pending().length, 0, "a killed negotiation is not queued for approval");
  });

  it("kill switch stops a deal BEFORE the ACCEPT — there is no post-ACCEPT revocation window", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);
    const summit = makeParty("summit", "cooperative", cooperativeParams());

    // The old two-message commit left a gap: an ACCEPT was sent, and until the supplier's CONFIRM landed
    // the buyer could still un-commit. Collapsing to a single ACCEPT (A2CN's model) closes that gap —
    // an ACCEPT binds the moment it is emitted. The safeguard did not disappear, it MOVED EARLIER: every
    // gate now runs before the ACCEPT goes out. Trip the switch on the supplier's QUOTE — i.e. while the
    // negotiation is still live — and nothing is ever committed.
    let accepted = false;
    const channel: NegotiationChannel = {
      async send(signed: SignedEnvelope): Promise<ChannelReply> {
        if (signed.type === "ACCEPT") accepted = true;
        const out = await channelFor(summit).send(signed);
        if (out.env.type === "QUOTE") governor.killSwitch.trip("operator pressed kill mid-negotiation");
        return out;
      },
    };

    const outcome = await run({ party: summit, trust: "VERIFIED", governor, mandate, channel });

    assert.equal(outcome.result, "WALKED");
    assert.equal(accepted, false, "no ACCEPT was ever emitted, so nothing needed revoking");
    assert.equal(governor.ledger.committedUsd(), 0, "nothing committed");
    assert.equal(governor.ledger.snapshot().length, 0, "no reservation left behind");
  });

  it("cross-deal spend cap: two concurrent near-cap settles → the second is blocked/escalated", async () => {
    // Both suppliers would auto-settle at ~$92.12/u × the shortfall. One fits under the cap, two do not.
    // Sized off the scenario, not a literal, so re-scoping the shortfall cannot silently retarget this test.
    const dealEstimate = 92.12 * scenario.shortfall.unitsNeeded;
    const cap = Math.floor(dealEstimate * 1.5); // room for one deal, not two
    const mandate = loadMandate(scenario, { maxTotalCommittedUsd: cap });
    // The ledger enforces a UNIT cap as well, defaulted to the shortfall — which two full-shortfall deals
    // would breach on their own. Give units room for both so the SPEND cap is unambiguously what blocks
    // the second; otherwise the unit cap trips first and this test passes for the wrong reason.
    const ledger = new CommitmentLedger(cap, mandate.unitsNeeded * 2);
    const governor = new Governor(mandate, { ledger });

    // Two cooperative sellers on distinct real DIDs, both forced to Summit's 14-day lead so both hit
    // the autonomous band.
    const a = makeParty("summit", "cooperative", cooperativeParams(), 14);
    const b = makeParty("alpine", "cooperative", cooperativeParams(), 14);

    const [ra, rb] = await Promise.all([
      run({ party: a, trust: "VERIFIED", governor, mandate }),
      run({ party: b, trust: "VERIFIED", governor, mandate }),
    ]);

    const results = [ra, rb];
    const settled = results.filter((r) => r.result === "SETTLED");
    const escalated = results.filter((r) => r.result === "ESCALATE");
    assert.equal(settled.length, 1, "exactly one settled");
    assert.equal(escalated.length, 1, "the other was blocked by the cap");
    assert.match(escalated[0]!.settleGate ?? "", /spend cap/i);
    assert.ok(governor.ledger.committedUsd() <= cap, "the cap held");
    assert.equal(governor.approvals.pending().length, 1, "the blocked deal is queued for a human");
  });

  it("suspend-on-disconnect: a downed oversight channel blocks new commitments (settle → hold)", async () => {
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate, { oversight: new OversightChannel(false) }); // channel starts DOWN
    const summit = makeParty("summit", "cooperative", cooperativeParams());

    const outcome = await run({ party: summit, trust: "VERIFIED", governor, mandate });

    assert.equal(outcome.result, "ESCALATE", "cannot commit a deal it cannot report");
    assert.match(outcome.settleGate ?? "", /oversight/i);
    assert.equal(governor.ledger.committedUsd(), 0);
  });

  it("reputation floor triggers an early walk-away before the round budget is spent", async () => {
    const ridge = makeParty("ridge", "adversarial", adversarialParams());
    const mandate = loadMandate(scenario);
    // Seed this counterparty BELOW the mandate floor — the buyer should disengage immediately.
    const reputation = new ReputationBook({ [ridge.did]: 0.15 });
    const governor = new Governor(mandate, { reputation });

    const outcome = await run({ party: ridge, trust: "VERIFIED", governor, mandate });

    assert.equal(outcome.result, "WALKED");
    assert.match(outcome.detail, /reputation/i);
    assert.ok(outcome.rounds < mandate.budget.maxRounds, "it did not spend the whole budget");
  });

  it("drift detection flags a counterparty whose settlements trend up over time (stretch)", () => {
    const history = loadHistory();
    const summitDid = "did:web:summit-gear.example";
    const flag = detectDrift(summitDid, history[summitDid] ?? []);
    assert.equal(flag.flagged, true);
    assert.ok(flag.totalRiseUsd > 0);
  });

  it("the cap check is atomic — a concurrent reserve cannot double-spend", () => {
    const ledger = new CommitmentLedger(100_000);
    const first = ledger.tryReserve("n1", "did:a", 70_000);
    const second = ledger.tryReserve("n2", "did:b", 70_000);
    assert.equal(first.ok, true);
    assert.equal(second.ok, false);
    assert.equal(ledger.committedUsd(), 70_000);
    ledger.releaseAllPending();
    assert.equal(ledger.committedUsd(), 0);
  });
});
