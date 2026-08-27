import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog, loadScenario, loadSigner, type Signer } from "@meridian/agent-runtime";
import { makeEnvelope, type SignedEnvelope, type Terms } from "@meridian/protocol";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";

/**
 * Settlement-correctness unit tests (CodeRabbit findings on negotiate.ts). Each drives the REAL
 * `runNegotiation` through a SCRIPTED in-process channel — one that answers the buyer's RFQ with a
 * QUOTE and its ACCEPT with an ACK we control — so we can inject exactly the adversarial reply
 * (mutated terms, a mid-flight kill, a transport failure) each finding is about.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const supplierAd = loadCatalog("summit");
const supplierSigner: Signer = loadSigner(supplierAd.did);

const mandate = loadMandate(scenario);
const dealTerms: Terms = {
  sku: mandate.sku,
  units: mandate.unitsNeeded,
  unitPriceUsd: 90,
  leadTimeDays: mandate.deadlineDays,
  deliveryTerms: "DDP",
};

interface ScriptOptions {
  /** Reply with this verb instead of the expected ACK, to exercise the buyer's rejection path. */
  badAckType?: "QUOTE" | "COUNTER" | "WALKAWAY";
  /** Throw instead of answering the ACCEPT — simulates a transport/verify failure after the reservation. */
  throwOnAccept?: boolean;
  /** Side effect run the moment the buyer's ACCEPT arrives (e.g. trip the kill switch). */
  onAccept?: () => void;
}

/** A minimal supplier: QUOTE in reply to RFQ, ACK in reply to ACCEPT, mirror on WALKAWAY. */
function scriptChannel(opts: ScriptOptions = {}): NegotiationChannel {
  const sign = (env: Parameters<Signer["sign"]>[0]): ChannelReply => {
    const s = supplierSigner.sign(env);
    return { env: s, raw: s, wireProfile: "meridian" };
  };
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      const neg = signed.negotiationId;
      const round = (signed.body as { round: number }).round;
      if (signed.type === "RFQ") {
        return sign(makeEnvelope({ type: "QUOTE", from: supplierAd.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round: round + 1, terms: dealTerms } }));
      }
      if (signed.type === "ACCEPT") {
        opts.onAccept?.();
        if (opts.throwOnAccept) throw new Error("transport failure delivering ACCEPT");
        // The ACCEPT settles on its own; all that comes back is a transport ACK. `badAckType` lets a
        // test send something else instead, to prove the buyer refuses to report a settle it cannot
        // prove the supplier acknowledged.
        const type = opts.badAckType ?? "ACK";
        return sign(makeEnvelope({ type, from: supplierAd.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round: round + 1 } }));
      }
      if (signed.type === "WALKAWAY") {
        return sign(makeEnvelope({ type: "WALKAWAY", from: supplierAd.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round, reasonCode: "DONE" } }));
      }
      throw new Error(`scriptChannel: unexpected ${signed.type}`);
    },
  };
}

const acceptReasoner = () => ({ action: "ACCEPT" as const, terms: dealTerms, tier: "AUTONOMOUS_SETTLE" as const, rationale: "test-accept" });

function runWith(channel: NegotiationChannel, governor: Governor, extra: Record<string, unknown> = {}) {
  return runNegotiation({
    buyerDid,
    signer: buyerSigner,
    mandate,
    governor,
    trust: "VERIFIED",
    ad: supplierAd,
    trail: { append() {} },
    channel,
    reasoner: acceptReasoner,
    ...extra,
  });
}

describe("negotiate.ts settlement correctness", () => {
  it("an ACCEPT that has gone out is SETTLED even if the kill switch trips in the same tick", async () => {
    const governor = new Governor(mandate);
    // Trip the kill switch the instant the ACCEPT arrives at the supplier. The ACCEPT IS the settle, so
    // there is nothing left to revoke — the deal stands. This is the deliberate consequence of
    // collapsing the old two-message commit: the buyer is bound the moment the ACCEPT is emitted, and
    // every safeguard that could stop it runs BEFORE that point (see `settle` in negotiate.ts).
    // `trip` is async and its listeners can reject (it aggregates their failures). The callback is
    // synchronous, so the promise escaped unobserved: a listener failure surfaced as an unhandled
    // rejection warning — or a hard exit under --unhandled-rejections=strict — instead of failing here.
    const trips: Array<Promise<void>> = [];
    const outcome = await runWith(
      scriptChannel({ onAccept: () => void trips.push(governor.killSwitch.trip("operator")) }),
      governor,
    );
    await Promise.all(trips);
    assert.equal(outcome.result, "SETTLED", "a sent ACCEPT binds; a later kill must not un-settle it");
    assert.ok(outcome.terms, "settled terms present");
  });

  it("a supplier that answers the ACCEPT with anything but an ACK cannot un-settle the deal", async () => {
    // A reply of any kind proves the supplier RECEIVED the binding ACCEPT, and the ACCEPT is the settle.
    // Treating a non-ACK as a failed settle released the reservation and reported no deal — leaving the
    // buyer's books denying a settlement the supplier can prove with the buyer's own signature, and the
    // spend free to be committed a second time. The violation is recorded, not obeyed.
    for (const badAckType of ["QUOTE", "COUNTER", "WALKAWAY"] as const) {
      const governor = new Governor(mandate);
      const events: Array<Record<string, unknown>> = [];
      const outcome = await runWith(scriptChannel({ badAckType }), governor, {
        trail: { append: (e: Record<string, unknown>) => events.push(e) },
      });
      assert.equal(outcome.result, "SETTLED", `a ${badAckType} reply does not un-settle a sent ACCEPT`);
      assert.match(outcome.settleAnomaly ?? "", /rather than an ACK/, "the protocol violation is carried on the outcome");
      assert.ok(events.some((e) => e.event === "settle-anomaly" && e.got === badAckType), "and recorded on the trail");
      assert.equal(governor.ledger.committedUsd(), dealTerms.unitPriceUsd * dealTerms.units, "the spend is committed, not released");
    }
  });

  it("keeps the reservation when the ACCEPT exchange throws — the send may still have landed", async () => {
    // The failure is on the way BACK. Releasing here assumes the supplier never got the ACCEPT, which
    // frees the money for another deal while the supplier may hold a binding one.
    const governor = new Governor(mandate);
    const events: Array<Record<string, unknown>> = [];
    await assert.rejects(
      runWith(scriptChannel({ throwOnAccept: true }), governor, { trail: { append: (e: Record<string, unknown>) => events.push(e) } }),
      /transport failure/,
    );
    assert.ok(events.some((e) => e.event === "settle-unknown"), "the unknown outcome is recorded");
    // committedUsd() is total exposure: pending reservations count against the cap exactly as committed
    // ones do, which is what makes holding rather than releasing the conservative choice.
    assert.equal(governor.ledger.committedUsd(), dealTerms.unitPriceUsd * dealTerms.units, "the reservation is still held against the cap");
  });

  it("sends a terminal WALKAWAY when the kill switch severs a deal held for approval", async () => {
    const governor = new Governor(mandate);
    const outbound: string[] = [];
    const escalateReasoner = () => ({ action: "ESCALATE" as const, terms: dealTerms, tier: "APPROVE_BEFORE_COMMIT" as const, rationale: "hold" });
    const outcome = await runWith(scriptChannel(), governor, {
      reasoner: escalateReasoner,
      onOutbound: (s: SignedEnvelope) => outbound.push(s.type),
      onEscalation: async () => {
        // Awaited: this callback is async, so a listener failure belongs to this test rather than
        // becoming an unhandled rejection detached from it.
        await governor.killSwitch.trip("operator killed during approval");
        return "rejected" as const;
      },
    });
    assert.equal(outcome.result, "WALKED");
    assert.ok(outbound.includes("WALKAWAY"), "a WALKAWAY was sent to close the supplier's side");
  });
});
