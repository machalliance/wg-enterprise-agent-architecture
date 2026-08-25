import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadCatalog, loadScenario, loadSigner, type Signer } from "@meridian/agent-runtime";
import { makeEnvelope, type SignedEnvelope, type Terms } from "@meridian/protocol";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { CommitCoordinator } from "./commit-coordinator.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel } from "./negotiate.js";

/**
 * The commit barrier, driven through the REAL `runNegotiation` over scripted in-process channels. The
 * one guarantee under test: with two parallel negotiations sharing a coordinator, NO supplier is
 * committed to until BOTH have revealed a committable offer — and then only the better offer settles,
 * the other stands down. This is the "never bind to one before you know the other's best" invariant.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const mandate = loadMandate(scenario);

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** A minimal committable supplier: QUOTE at `priceUsd` in reply to RFQ, ACK to ACCEPT, mirror on
 *  WALKAWAY. `gate`, when set, holds the opening QUOTE until it resolves — a "slow" supplier. */
function committableChannel(
  id: "summit" | "alpine",
  priceUsd: number,
  gate?: Promise<void>,
): { channel: NegotiationChannel; did: string } {
  const ad = loadCatalog(id);
  const signer: Signer = loadSigner(ad.did);
  const dealTerms: Terms = {
    sku: mandate.sku,
    units: mandate.unitsNeeded,
    unitPriceUsd: priceUsd,
    leadTimeDays: mandate.deadlineDays,
    deliveryTerms: "DDP",
  };
  const sign = (env: Parameters<Signer["sign"]>[0]): ChannelReply => {
    const s = signer.sign(env);
    return { env: s, raw: s, wireProfile: "meridian" };
  };
  const channel: NegotiationChannel = {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      const neg = signed.negotiationId;
      const round = (signed.body as { round: number }).round;
      if (signed.type === "RFQ") {
        if (gate) await gate;
        return sign(makeEnvelope({ type: "QUOTE", from: ad.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round: round + 1, terms: dealTerms } }));
      }
      if (signed.type === "ACCEPT") {
        // The ACCEPT settles; the supplier only acknowledges receipt.
        return sign(makeEnvelope({ type: "ACK", from: ad.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round: round + 1 } }));
      }
      if (signed.type === "WALKAWAY") {
        return sign(makeEnvelope({ type: "WALKAWAY", from: ad.did, to: signed.from, negotiationId: neg, inReplyTo: signed.correlationId, body: { round, reasonCode: "DONE" } }));
      }
      throw new Error(`committableChannel: unexpected ${signed.type}`);
    },
  };
  return { channel, did: ad.did };
}

function runOne(id: "summit" | "alpine", channelInfo: { channel: NegotiationChannel; did: string }, governor: Governor, coordinator: CommitCoordinator, onOutbound?: (s: SignedEnvelope) => void) {
  const ad = { ...loadCatalog(id), did: channelInfo.did };
  return runNegotiation({
    buyerDid,
    signer: buyerSigner,
    mandate,
    governor,
    trust: "VERIFIED",
    ad,
    trail: { append() {} },
    channel: channelInfo.channel,
    commitCoordinator: coordinator,
    onOutbound,
  });
}

describe("commit barrier through runNegotiation", () => {
  it("commits to the cheaper of two committable suppliers; the other stands down; only one deal is banked", async () => {
    const governor = new Governor(mandate);
    let selectedWinner = "";
    const coordinator = new CommitCoordinator(2, { onSelect: ({ winner }) => (selectedWinner = winner?.agentName ?? "") });

    const cheap = committableChannel("summit", 90);
    const pricy = committableChannel("alpine", 92);
    const [cheapOut, pricyOut] = await Promise.all([
      runOne("summit", cheap, governor, coordinator),
      runOne("alpine", pricy, governor, coordinator),
    ]);

    assert.equal(cheapOut.result, "SETTLED", "the cheaper supplier settles");
    assert.equal(cheapOut.terms?.unitPriceUsd, 90);
    assert.equal(pricyOut.result, "WALKED", "the pricier supplier stands down rather than committing");
    assert.equal(pricyOut.terms?.unitPriceUsd, 92, "the stood-down offer is still recorded for the audit trail");
    assert.match(pricyOut.detail, /stood down/i);
    assert.equal(selectedWinner, cheapOut.agentName, "the barrier selected the settled supplier");
    // Exactly ONE deal is banked — the loser never reserved against the cap.
    assert.equal(governor.ledger.committedUsd(), 90 * mandate.unitsNeeded, "only the winner's spend is committed");
  });

  it("does NOT commit to a ready supplier while another is still negotiating", async () => {
    const governor = new Governor(mandate);
    const coordinator = new CommitCoordinator(2);

    // Fast supplier is ready immediately; slow supplier's opening QUOTE is gated (still 'negotiating').
    let releaseSlow!: () => void;
    const slowGate = new Promise<void>((r) => (releaseSlow = r));
    const fast = committableChannel("summit", 90);
    const slow = committableChannel("alpine", 92, slowGate);

    const fastOutbound: string[] = [];
    const fastRun = runOne("summit", fast, governor, coordinator, (s) => fastOutbound.push(s.type));
    const slowRun = runOne("alpine", slow, governor, coordinator);

    // Give the fast negotiation time to reach its ready-to-commit point and park on the barrier.
    await delay(30);
    assert.ok(fastOutbound.includes("RFQ"), "the fast supplier opened (RFQ sent)");
    assert.ok(!fastOutbound.includes("ACCEPT"), "no ACCEPT is sent while the other supplier is still negotiating");
    assert.equal(governor.ledger.committedUsd(), 0, "nothing is reserved or committed before the field is known");

    // Reveal the slow supplier's offer — now the barrier resolves and the winner commits.
    releaseSlow();
    const [fastOut, slowOut] = await Promise.all([fastRun, slowRun]);
    assert.ok(fastOutbound.includes("ACCEPT"), "the winner's ACCEPT goes out only after every offer is known");
    assert.equal(fastOut.result, "SETTLED");
    assert.equal(slowOut.result, "WALKED");
  });
});
