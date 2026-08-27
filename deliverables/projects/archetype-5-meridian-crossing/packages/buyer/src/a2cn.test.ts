import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import {
  A2CN_CUSTOM_TERMS_KEYS,
  A2CN_PROFILE,
  MERIDIAN_PROFILE,
  a2cnTerminalToReason,
  cardSupportsA2cn,
  checkAddressedTo,
  createSeller,
  decodeA2cn,
  decodeA2cnUnverified,
  encodeA2cn,
  verifyDealArithmetic,
  loadCatalog,
  loadScenario,
  loadSigner,
  looksLikeA2cn,
  makeAgentCard,
  parseA2cnWire,
  profileForInbound,
  reasonToA2cnTerminal,
  resetA2cnActHashes,
  selectWireProfile,
  verifyA2cn,
  type Seller,
  type SellerParams,
  type Signer,
  type SupplierId,
  type Trail,
} from "@meridian/agent-runtime";
import {
  makeEnvelope,
  type CapabilityAd,
  type Envelope,
  type ReasonCode,
  type SignedEnvelope,
  type Terms,
  type TrustLevel,
} from "@meridian/protocol";
import { loadMandate, privateValues, PRIVATE_MANDATE_FIELDS, type Mandate } from "./mandate.js";
import { assertStructureHidesSecrets } from "./leak-lint.js";
import { Governor } from "./governor.js";
import { runNegotiation, type ChannelReply, type NegotiationChannel, type NegotiationOutcome } from "./negotiate.js";
import { ADVERSARIAL, COOPERATIVE, FIRM } from "./seller-fixtures.js";

/**
 * A2CN wire profile acceptance suite — alignment to REAL A2CN v0.2.0. Every criterion runs over the REAL
 * negotiation path (`runNegotiation`) wired to the real seller through an IN-PROCESS channel that
 * forces every message across the A2CN codec: sign → encode to an A2CN goods_procurement message
 * (real snake_case wire, protocol-act EdDSA JWS) → verify the A2CN signature → decode. If the codec
 * were lossy the negotiation would diverge; if the signature mapping were wrong verification would
 * fail. Neither the buyer's reasoning, the state machine, nor the mandate is touched.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const nullTrail: Trail = { append() {} };

// Seller behaviours: ./seller-fixtures.js (deliberately not the seed's numbers — see that file).

interface Party {
  did: string;
  ad: CapabilityAd;
  seller: Seller;
  signer: Signer;
}

function makeParty(id: SupplierId, behaviour: string, params: Partial<SellerParams>): Party {
  const ad = loadCatalog(id);
  const sellerParams: SellerParams = {
    behaviour,
    capacityUnits: ad.maxUnits,
    leadTimeDays: ad.minLeadTimeDays,
    openingPriceUsd: 0,
    floorPriceUsd: 0,
    concessionRate: 0,
    ...params,
  };
  return { did: ad.did, ad, seller: createSeller(sellerParams, { did: ad.did, trail: nullTrail }), signer: loadSigner(ad.did) };
}

const cooperativeParams = (): Partial<SellerParams> => ({ openingPriceUsd: COOPERATIVE.opening, floorPriceUsd: COOPERATIVE.floor, concessionRate: COOPERATIVE.concession });
const firmParams = (): Partial<SellerParams> => ({ openingPriceUsd: FIRM.opening, floorPriceUsd: FIRM.floor, concessionRate: FIRM.concession });
const adversarialParams = (): Partial<SellerParams> => ({ openingPriceUsd: ADVERSARIAL.opening, floorPriceUsd: ADVERSARIAL.floor, concessionRate: ADVERSARIAL.concession, jitterUsd: ADVERSARIAL.jitter });

/** The default (meridian) in-process channel — the baseline we compare A2CN against. */
function meridianChannel(party: Party): NegotiationChannel {
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      const inbound = MERIDIAN_PROFILE.decode(signed as unknown as Record<string, unknown>);
      if (!MERIDIAN_PROFILE.verify(signed as unknown as Record<string, unknown>).ok) throw new Error("buyer message rejected");
      const reply = party.signer.sign(party.seller.handle(inbound));
      return { env: reply, raw: reply as unknown, wireProfile: "meridian" };
    },
  };
}

/**
 * The A2CN in-process channel. Both legs are pushed through the A2CN codec with real signing: the
 * sender's signer produces the protocol-act JWS on encode, and the receiver verifies it on decode.
 * `capture` sees every A2CN wire message.
 */
function a2cnChannel(party: Party, capture?: (wire: Record<string, unknown>) => void): NegotiationChannel {
  // Route through A2CN_PROFILE rather than encodeA2cn directly, exactly as a live agent does. The
  // profile re-expresses negotiation verbs as A2CN messages and passes anything else (the ACK that
  // answers a settling ACCEPT, PING/PONG) through as a plain envelope — A2CN has no message for those.
  // `capture` therefore only sees genuine A2CN traffic, which is what the assertions below inspect.
  const through = (signed: SignedEnvelope, signer: Signer): SignedEnvelope => {
    const wire = A2CN_PROFILE.encode(signed, signer);
    if (looksLikeA2cn(wire)) capture?.(wire);
    const verdict = A2CN_PROFILE.verify(wire);
    if (!verdict.ok) throw new Error(`A2CN signature failed: ${verdict.reason}`);
    return A2CN_PROFILE.decode(wire);
  };
  return {
    async send(signed: SignedEnvelope): Promise<ChannelReply> {
      const inbound = through(signed, buyerSigner); // buyer → supplier
      const reply = party.seller.handle(inbound);
      // supplier → buyer: keep the real wire bytes so the half-trail records what actually crossed.
      const wire = A2CN_PROFILE.encode(party.signer.sign(reply), party.signer);
      if (looksLikeA2cn(wire)) capture?.(wire);
      const verdict = A2CN_PROFILE.verify(wire);
      if (!verdict.ok) throw new Error(`A2CN signature failed: ${verdict.reason}`);
      return { env: A2CN_PROFILE.decode(wire), raw: wire, wireProfile: looksLikeA2cn(wire) ? "a2cn" : "meridian" };
    },
  };
}

interface RunOpts {
  party: Party;
  trust: TrustLevel;
  channel: NegotiationChannel;
  mandate: Mandate;
  governor: Governor;
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
    channel: opts.channel,
  });
}

const SUMMIT_DID = "did:web:summit-gear.example";
const DEAL: Terms = { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" };

/**
 * A settling ACCEPT of an offer this process has actually SEEN. §7.4 welds an acceptance to the exact
 * protocol act it closes, so neither encoding nor verifying one is possible without the offer it cites:
 * the encoder has no hash to quote and the verifier has nothing to resolve. Minting the offer first is
 * not test scaffolding — it is the protocol's own precondition ("you can only accept what you received").
 */
function acceptanceOfSeenOffer(): Record<string, any> {
  const supplierSigner = loadSigner(SUMMIT_DID);
  // ONE negotiationId across both messages — it becomes the A2CN `session_id`, and §7.4's weld is to an
  // offer in THIS session. Letting `makeEnvelope` mint a fresh id per call made the fixture a
  // cross-session citation: a real acceptance always shares the session of the offer it closes.
  const negotiationId = randomUUID();
  const offer = encodeA2cn(
    supplierSigner.sign(
      makeEnvelope({ type: "QUOTE", from: SUMMIT_DID, to: buyerDid, negotiationId, body: { round: 1, terms: DEAL } }),
    ),
    supplierSigner,
  );
  return encodeA2cn(
    buyerSigner.sign(
      makeEnvelope({
        type: "ACCEPT",
        from: buyerDid,
        to: SUMMIT_DID,
        negotiationId,
        inReplyTo: offer.a2cn.message_id,
        body: { round: 2, terms: DEAL },
      }),
    ),
    buyerSigner,
  ) as unknown as Record<string, any>;
}

/** Build a signed WALKAWAY carrying `reason`, the way the buyer emits one. */
function signedWalkaway(reason: ReasonCode): SignedEnvelope {
  return buyerSigner.sign(
    makeEnvelope({ type: "WALKAWAY", from: buyerDid, to: "did:web:summit-gear.example", body: { round: 4, reasonCode: reason } }),
  );
}

describe("real A2CN v0.2.0 alignment", () => {
  it("a2cn profile reaches the SAME outcome + terms as meridian (only the wire bytes differ)", async () => {
    const mandate = loadMandate(scenario);
    const meridian = await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", channel: meridianChannel(makeParty("summit", "cooperative", cooperativeParams())), mandate, governor: new Governor(mandate) });
    const a2cn = await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("summit", "cooperative", cooperativeParams())), mandate, governor: new Governor(mandate) });

    assert.equal(meridian.result, "SETTLED");
    assert.equal(a2cn.result, meridian.result, "same result over A2CN");
    assert.equal(a2cn.tier, meridian.tier, "same tier over A2CN");
    assert.equal(a2cn.rounds, meridian.rounds, "same round count over A2CN");
    assert.deepEqual(a2cn.terms, meridian.terms, "identical settled terms over A2CN");
  });

  it("every a2cn-encoded message validates against the A2CN schema and its protocol-act JWS verifies", async () => {
    const mandate = loadMandate(scenario);
    const wire: Record<string, unknown>[] = [];
    await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("summit", "cooperative", cooperativeParams()), (m) => wire.push(m)), mandate, governor: new Governor(mandate) });

    assert.ok(wire.length > 0, "captured A2CN traffic");
    const seen = new Set<string>();
    for (const m of wire) {
      const parsed = parseA2cnWire(m).a2cn; // throws if it does not conform
      assert.equal(parsed.a2cn_version, "0.2");
      assert.equal(parsed.deal_type, "goods_procurement");
      assert.ok(verifyA2cn(m).ok, `protocol-act JWS verifies for ${parsed.message_type}`);
      seen.add(parsed.message_type);
    }
    assert.ok(seen.has("offer"), "the opening RFQ surfaced as an A2CN offer");
    assert.ok(seen.has("counteroffer"), "priced offers surfaced as A2CN counteroffers");
    assert.ok(seen.has("acceptance"), "the commit surfaced as an A2CN acceptance");
  });

  it("a tampered A2CN message is rejected (protocol_act_hash / JWS no longer match)", () => {
    const wire = encodeA2cn(buyerSigner.sign(makeEnvelope({ type: "COUNTER", from: buyerDid, to: "did:web:summit-gear.example", inReplyTo: "33333333-3333-4333-8333-333333333333", body: { round: 2, terms: { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" } } })), buyerSigner) as unknown as Record<string, unknown>;
    assert.ok(verifyA2cn(wire).ok, "valid before tampering");
    // Mutate the price after signing — the recomputed protocol_act_hash no longer matches.
    const tampered = JSON.parse(JSON.stringify(wire));
    tampered.a2cn.terms.line_items[0].unit_price = 1;
    assert.ok(!verifyA2cn(tampered).ok, "tampered message rejected");
  });

  it("terminal_state is inert — no verb, state, or trust decision reads it", () => {
    // A2CN deliberately leaves `terminal_state` outside the §7.3.1 signed act. That was safe in A2CN and
    // unsafe here only while Meridian used it to tell a non-binding ACCEPT from a settling CONFIRM: one
    // edited string promoted a lone acceptance into a settled order. With the commit collapsed to a
    // single ACCEPT there is nothing to disambiguate, so the field is decorative and editing it changes
    // nothing that matters. This test exists to keep it that way.
    const accept = acceptanceOfSeenOffer();
    assert.equal(decodeA2cn(accept).type, "ACCEPT");

    for (const state of ["REJECTED_FINAL", "WITHDRAWN", "TIMED_OUT"] as const) {
      const edited = JSON.parse(JSON.stringify(accept));
      edited.a2cn.terminal_state = state;
      assert.equal(decodeA2cn(edited).type, "ACCEPT", `terminal_state=${state} must not change the verb`);
    }
    // And the verb DOES come from a signed field: message_type is inside the act, so changing it breaks
    // the signature rather than silently re-interpreting the message.
    const reverbed = JSON.parse(JSON.stringify(accept));
    reverbed.a2cn.message_type = "counteroffer";
    assert.ok(!verifyA2cn(reverbed).ok, "message_type is signed — it cannot be swapped");
  });

  it("the A2CN message is conforming; our own fields are namespaced or outside it", () => {
    // Two separate guarantees, both about not squatting on the standard's namespace.
    const wire = acceptanceOfSeenOffer();

    // 1. ADDRESSING is outside the message. A2CN defines no recipient, so `recipient_did` lives in the
    //    §16 binding wrapper. It used to sit among the spec's own fields, which made the object we
    //    called an A2CN message fail A2CN's schema.
    assert.equal(typeof wire.recipient_did, "string", "the binding carries the recipient");
    assert.ok(!("recipient_did" in wire.a2cn), "…and the A2CN message itself does not");

    // 2. Everything we put in `custom_terms` — A2CN's own extension point, where a later spec version
    //    may define keys of its own — is prefixed `meridian_`. An unprefixed key is the regression:
    //    it would be a name we do not own, silently acquiring a second meaning on a version bump.
    //
    //    Exercised over messages that actually CARRY all three riders. The settling ACCEPT above carries
    //    none of them (a party is declared only on a side's first message), so asserting on it would
    //    have passed over an empty object — vacuously, and for every future key too.
    const rfq = encodeA2cn(
      buyerSigner.sign(makeEnvelope({ type: "RFQ", from: buyerDid, to: SUMMIT_DID, body: { round: 0, terms: { sku: DEAL.sku, units: DEAL.units } } })),
      buyerSigner,
    );
    const quote = encodeA2cn(
      loadSigner(SUMMIT_DID).sign(
        makeEnvelope({
          type: "QUOTE",
          from: SUMMIT_DID,
          to: buyerDid,
          body: { round: 1, terms: DEAL, party: { organization_name: "Summit Gear Co.", agent_id: "summit" }, rationale: "capacity is tight this quarter" },
        }),
      ),
      loadSigner(SUMMIT_DID),
    );
    const seen = new Set<string>();
    for (const payload of [rfq, quote]) {
      for (const k of Object.keys(payload.a2cn.terms?.custom_terms ?? {})) {
        assert.ok(k.startsWith("meridian_"), `custom_terms key '${k}' is not namespaced`);
        assert.ok(A2CN_CUSTOM_TERMS_KEYS.includes(k as (typeof A2CN_CUSTOM_TERMS_KEYS)[number]), `unexpected custom_terms key '${k}'`);
        seen.add(k);
      }
    }
    // All three riders reached the wire, so the loop above was not passing on absence.
    assert.deepEqual([...seen].sort(), [...A2CN_CUSTOM_TERMS_KEYS].sort());
  });

  it("§7.4: an acceptance is welded to the exact offer it accepts", () => {
    const accept = acceptanceOfSeenOffer();

    assert.ok(accept.a2cn.acceptance_signature, "an acceptance carries the §7.4 second signature");
    assert.ok(accept.a2cn.accepted_offer_id, "…and names the offer it closes");
    assert.ok(accept.a2cn.accepted_protocol_act_hash, "…and that offer's protocol act hash");
    assert.ok(verifyA2cn(accept).ok, "valid as issued");

    // The acceptance signature covers accepted_offer_id + accepted_protocol_act_hash, so an acceptance
    // cannot be lifted onto a different offer — the spec's own anti-replay for acceptances.
    const relinked = JSON.parse(JSON.stringify(accept));
    relinked.a2cn.accepted_offer_id = "66666666-6666-4666-8666-666666666666";
    assert.ok(!verifyA2cn(relinked).ok, "acceptance cannot be re-pointed at another offer");

    const rehashed = JSON.parse(JSON.stringify(accept));
    rehashed.a2cn.accepted_protocol_act_hash = "not-the-offer-we-accepted";
    assert.ok(!verifyA2cn(rehashed).ok, "the accepted act hash cannot be swapped");

    const unsigned = JSON.parse(JSON.stringify(accept));
    delete unsigned.a2cn.acceptance_signature;
    assert.ok(!verifyA2cn(unsigned).ok, "an acceptance with no §7.4 signature is refused");

    // The §7.4 binding is only worth anything if the RECEIVER resolves the cited offer. A signature over
    // {accepted_offer_id, accepted_protocol_act_hash} proves the sender chose those two values, nothing
    // more — the sender picked them, so on its own it welds an acceptance to whatever it likes. Checking
    // them against the offer this agent actually recorded is what turns the claim into evidence.
    resetA2cnActHashes(); // an agent that never saw the offer — a replay at a third party
    const orphaned = verifyA2cn(accept);
    assert.ok(!orphaned.ok, "a flawlessly-signed acceptance whose offer cannot be resolved is refused");
    assert.match(orphaned.reason, /never saw/);
  });

  it("a message signed for one supplier cannot be redirected to another", () => {
    // Addressing is NOT a signature question. A2CN messages carry no recipient at all — the spec puts
    // addressing at the transport — so no protocol-act signature can ever bind it. The `meridian`
    // profile does sign `to`, which stops it being ALTERED, but signing cannot stop the whole message
    // being REDIRECTED. Both profiles therefore rely on the receiving agent checking it is the
    // intended recipient, which is what `checkAddressedTo` does at the A2A boundary.
    const forSummit = makeEnvelope({
      type: "RFQ",
      from: buyerDid,
      to: "did:web:summit-gear.example",
      body: { round: 0, terms: { sku: "MER-TENT-3S", units: 100 } },
    });
    assert.ok(checkAddressedTo(forSummit, "did:web:summit-gear.example").ok, "the intended recipient accepts it");
    const wrong = checkAddressedTo(forSummit, "did:web:alpine-supply.example");
    assert.ok(!wrong.ok, "replaying it to another supplier is refused");
    assert.match(wrong.reason, /addressed to did:web:summit-gear\.example/);
  });

  it("a sender cannot pick the receiver's verification scheme (no profile downgrade)", () => {
    // The two profiles do not protect the same fields, so choosing between them is a security decision
    // and must belong to the RECEIVER. Detecting purely by payload shape handed that choice to the
    // sender: an A2CN-shaped payload silently moved a meridian agent onto the narrower check, with no
    // configuration on the receiving side at all.
    const env = buyerSigner.sign(
      makeEnvelope({ type: "QUOTE", from: buyerDid, to: "did:web:summit-gear.example", body: { round: 1, terms: { sku: "MER-TENT-3S", units: 10, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" } } }),
    );
    const a2cnPayload = encodeA2cn(env, buyerSigner) as unknown as Record<string, unknown>;

    assert.throws(
      () => profileForInbound(a2cnPayload, MERIDIAN_PROFILE),
      /refusing an A2CN-encoded payload/,
      "a meridian agent refuses A2CN bytes instead of verifying them under A2CN rules",
    );
    // The same rule in the other direction: an a2cn agent refuses a plain Meridian NEGOTIATION payload.
    // Accepting it is the identical downgrade — an ACCEPT that arrives as a bare envelope never reaches
    // the §7.4 acceptance-binding check, and the sender chose that simply by picking an encoding.
    assert.equal(profileForInbound(a2cnPayload, A2CN_PROFILE).name, "a2cn");
    assert.throws(
      () => profileForInbound(env, A2CN_PROFILE),
      /refusing a plain Meridian 'QUOTE'/,
      "an a2cn agent refuses a negotiation verb sent as a plain envelope",
    );
    // Plain envelopes still pass for the verbs with no A2CN form — the PING/PONG handshake and the ACK
    // that answers a settling ACCEPT. Refusing those would break traffic A2CN cannot express at all.
    const ping = buyerSigner.sign(makeEnvelope({ type: "PING", from: buyerDid, to: "did:web:summit-gear.example", body: {} }));
    assert.equal(profileForInbound(ping, A2CN_PROFILE).name, "meridian");
    assert.equal(profileForInbound(env, MERIDIAN_PROFILE).name, "meridian");
  });

  it("the settling ACCEPT round-trips to an A2CN COMPLETED acceptance and back with identical terms", async () => {
    const mandate = loadMandate(scenario);
    const wire: Record<string, unknown>[] = [];
    const outcome = await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("summit", "cooperative", cooperativeParams()), (m) => wire.push(m)), mandate, governor: new Governor(mandate) });
    assert.equal(outcome.result, "SETTLED");

    const payloads = wire.map((m) => parseA2cnWire(m));
    const acceptances = payloads.filter((p) => p.a2cn.message_type === "acceptance");
    const completion = acceptances.find((p) => p.a2cn.terminal_state === "COMPLETED");
    assert.equal(acceptances.length, 1, "exactly ONE acceptance settles the deal — there is no CONFIRM");
    assert.ok(completion, "the acceptance records terminal_state COMPLETED (decorative, but true)");

    const back = decodeA2cn(completion!);
    assert.deepEqual((back.body as { terms: Terms }).terms, outcome.terms);
  });

  it("terminal-state mapping follows the real §8.2 vocabulary", () => {
    assert.equal(reasonToA2cnTerminal("BUDGET_EXHAUSTED"), "REJECTED_FINAL");
    assert.equal(reasonToA2cnTerminal("POLICY"), "REJECTED_FINAL");
    assert.equal(reasonToA2cnTerminal("OUT_OF_TERMS"), "REJECTED_FINAL");
    assert.equal(reasonToA2cnTerminal("TIMEOUT"), "TIMED_OUT");
    assert.equal(reasonToA2cnTerminal("DONE"), "WITHDRAWN");

    const rejected = encodeA2cn(signedWalkaway("POLICY"), buyerSigner);
    assert.equal(rejected.a2cn.message_type, "rejection");
    assert.equal(rejected.a2cn.terminal_state, "REJECTED_FINAL");
    assert.equal((decodeA2cn(rejected).body as { reasonCode: ReasonCode }).reasonCode, "POLICY");

    const budget = encodeA2cn(signedWalkaway("BUDGET_EXHAUSTED"), buyerSigner);
    assert.equal(budget.a2cn.terminal_state, "REJECTED_FINAL", "A2CN is coarser: budget exhaustion is REJECTED_FINAL, not a separate IMPASSE");

    const timeout = encodeA2cn(signedWalkaway("TIMEOUT"), buyerSigner);
    assert.equal(timeout.a2cn.message_type, "withdrawal");
    assert.equal(timeout.a2cn.terminal_state, "TIMED_OUT");

    assert.equal(a2cnTerminalToReason("TIMED_OUT"), "TIMEOUT");
    assert.equal(a2cnTerminalToReason("WITHDRAWN"), "DONE");
  });

  it("rejects a signed deal whose arithmetic does not add up", () => {
    // A signature proves a counterparty AUTHORED these numbers, not that they are consistent. Our own
    // encoder derives both totals from the rounded unit price so ours always agree — but that is our
    // discipline, not a property of anything we receive. Checked in minor units, so the comparison is
    // exact. Tested through the helper rather than a crafted message because mutating a signed payload
    // trips the act-hash check first, which would leave this check itself unexercised.
    const line = { id: "1", description: "X", quantity: 100, unit: "EA", unit_price: 8659, total: 865900 };
    assert.ok(verifyDealArithmetic({ total_value: 865900, currency: "USD", line_items: [line] }).ok);

    const badLine = verifyDealArithmetic({
      total_value: 800000,
      currency: "USD",
      line_items: [{ ...line, total: 800000 }],
    });
    assert.equal(badLine.ok, false);
    assert.match(badLine.reason, /does not add up/);

    const badTotal = verifyDealArithmetic({ total_value: 999999, currency: "USD", line_items: [line] });
    assert.equal(badTotal.ok, false);
    assert.match(badTotal.reason, /total_value/);

    // The opening RFQ is unpriced by design: total_value 0 with no unit_price is a request, not a lie.
    const rfq = verifyDealArithmetic({
      total_value: 0,
      currency: "USD",
      line_items: [{ id: "1", description: "X", quantity: 100, unit: "EA" }],
    });
    assert.ok(rfq.ok, "an unpriced opening RFQ is not an arithmetic failure");
  });

  it("refuses a multi-line deal rather than silently keeping only the first item", () => {
    // Meridian's `Terms` models ONE line. Taking [0] handed the negotiation a smaller, cheaper deal
    // than the one that was signed — and nothing anywhere reported the discrepancy.
    const supplierSigner = loadSigner(SUMMIT_DID);
    const msg = encodeA2cn(
      supplierSigner.sign(makeEnvelope({ type: "QUOTE", from: SUMMIT_DID, to: buyerDid, body: { round: 1, terms: DEAL } })),
      supplierSigner,
    ) as unknown as { a2cn: { terms: { line_items: unknown[] } } };
    msg.a2cn.terms.line_items.push({ id: "2", description: "extra", quantity: 5, unit: "EA" });
    const body = decodeA2cnUnverified(msg).body as { terms?: unknown } | undefined;
    assert.equal(body?.terms, undefined, "multi-line terms must not decode to a single line");
  });

  it("rejects terminal states outside A2CN v0.2.0's four — including the ones an earlier draft invented", () => {
    // The four in the real spec are COMPLETED / REJECTED_FINAL / WITHDRAWN / TIMED_OUT. An earlier
    // version of this codec modelled A2CN from prose and invented `IMPASSE`; `ERROR` is the other
    // plausible-looking value a hand-written or differently-versioned peer might send. Neither is in
    // the enum, so both must fail schema validation rather than be quietly carried as an unknown
    // string — this is the check that would catch a spec drift on the next A2CN version bump.
    const valid = encodeA2cn(signedWalkaway("POLICY"), buyerSigner);
    assert.ok(parseA2cnWire(valid), "the REJECTED_FINAL baseline parses");

    for (const bogus of ["IMPASSE", "ERROR", "completed", "SETTLED"]) {
      assert.throws(
        () => parseA2cnWire({ ...valid, a2cn: { ...valid.a2cn, terminal_state: bogus } }),
        `terminal_state='${bogus}' must be rejected by the enum, not carried through`,
      );
    }
  });

  it("no-leak lint: reservation price / spend cap never appear in a2cn-profile wire traffic", async () => {
    const mandate = loadMandate(scenario);
    const wire: Record<string, unknown>[] = [];
    const cap = (m: Record<string, unknown>) => wire.push(m);
    await run({ party: makeParty("summit", "cooperative", cooperativeParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("summit", "cooperative", cooperativeParams()), cap), mandate, governor: new Governor(mandate) });
    await run({ party: makeParty("alpine", "firm", firmParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("alpine", "firm", firmParams()), cap), mandate, governor: new Governor(mandate) });
    await run({ party: makeParty("ridge", "adversarial", adversarialParams()), trust: "VERIFIED", channel: a2cnChannel(makeParty("ridge", "adversarial", adversarialParams()), cap), mandate, governor: new Governor(mandate) });

    const buyerOutbound = wire.map((m) => parseA2cnWire(m).a2cn).filter((m) => m.sender_did === buyerDid);
    assert.ok(buyerOutbound.length > 0, "captured buyer A2CN traffic");
    // Scan the message's SEMANTIC content (terms/session/terminal), the A2CN analog of the meridian
    // body the mandate lint scans — not the opaque JWS/hash/id plumbing. Prices are minor units (cents),
    // so the reservation would leak as its cents value.
    // Cents via the SAME rounding the codec uses, not raw `* 100`. Float multiplication produces values
    // like 9168.000000000001 for prices that are exact in cents, and `String()` of that is not the digit
    // string the wire actually carries — so the leak check would have been scanning for a number that can
    // never appear, silently passing while the real cents value went out unnoticed.
    const cents = (usd: number): string => String(Math.round(usd * 100));
    // Both denominations of all three private figures. The dollar and cents forms are genuinely
    // different secrets on this wire — A2CN carries minor units, so the cents value is the one that can
    // actually appear — and `maxBidUsd` was missing from the list entirely even though the assertion
    // twenty lines down is specifically about the bid ceiling.
    const secrets = privateValues(mandate).flatMap((v) => [v, cents(Number(v))]);
    const maxBidCents = Math.round(mandate.maxBidUsd * 100);
    for (const m of buyerOutbound) {
      const terms = m.terms;
      const semantic = { message_type: m.message_type, round_number: m.round_number, terms, terminal_state: m.terminal_state };
      for (const field of PRIVATE_MANDATE_FIELDS) {
        assert.ok(!JSON.stringify(semantic).includes(field), `private key '${field}' leaked in ${String(m.message_type)}`);
      }
      // Walk the PARSED structure and compare numbers numerically. `JSON.stringify(...).includes(s)`
      // was wrong in both directions: it missed `93.0` and `9.3e1` (same value, different characters),
      // and `String(90)` is a substring of `"9000"`, `"1900"` and of any id carrying those digits — a
      // false positive whose only cure is loosening the check, which is how a real one gets lost.
      assertStructureHidesSecrets(semantic, secrets, String(m.message_type));
      if (m.message_type === "counteroffer") {
        const li = (m.terms as { line_items?: Array<{ unit_price?: number }> }).line_items?.[0];
        assert.ok(li?.unit_price !== undefined && li.unit_price <= maxBidCents, `buyer counteroffer ${li?.unit_price}c > maxBid ${maxBidCents}c`);
      }
    }
  });

  it("the agent card advertises the A2CN extension; a peer without it falls back to meridian", () => {
    assert.ok(A2CN_PROFILE.extension, "the a2cn profile carries an extension descriptor");
    const a2cnCard = makeAgentCard({ name: "Summit Gear Co.", description: "Cooperative selling agent.", url: "http://localhost:41001", extensions: [A2CN_PROFILE.extension!] });
    const plainCard = makeAgentCard({ name: "Legacy Co.", description: "meridian-only.", url: "http://localhost:41009" });

    assert.ok(cardSupportsA2cn(a2cnCard), "card advertises A2CN");
    assert.ok(!cardSupportsA2cn(plainCard), "plain card does not");
    assert.equal(selectWireProfile(A2CN_PROFILE, a2cnCard).name, "a2cn");
    assert.equal(selectWireProfile(A2CN_PROFILE, plainCard).name, "meridian", "graceful fallback");
    assert.equal(selectWireProfile(MERIDIAN_PROFILE, a2cnCard).name, "meridian");
  });

  it("a captured A2CN fixture verifies, decodes to the settled envelope, and re-encodes to the golden bytes", () => {
    const path = fileURLToPath(new URL("../../../seed/a2cn/summit-quote.a2cn.json", import.meta.url));
    const fixture = JSON.parse(readFileSync(path, "utf8"));

    const parsed = parseA2cnWire(fixture).a2cn;
    assert.equal(parsed.message_type, "counteroffer");
    assert.equal(parsed.terms?.total_value, 29_400_000); // $294,000 in cents
    assert.equal(parsed.terms?.line_items?.[0]?.unit_price, 9_800); // $98.00 in cents

    assert.ok(verifyA2cn(fixture).ok, "the fixture's protocol-act JWS verifies against the sender DID");
    const envelope = decodeA2cn(fixture);
    assert.equal(envelope.type, "QUOTE");
    assert.equal((envelope.body as { terms: Terms }).terms.unitPriceUsd, 98); // cents → dollars

    // Re-encoding the decoded envelope reproduces the golden bytes — wire-format stability. We sign
    // with the same supplier key the fixture was minted with (EdDSA is deterministic).
    const reencoded = encodeA2cn(loadSigner(envelope.from).sign(envelope), loadSigner(envelope.from));
    assert.deepEqual(reencoded, fixture);
  });
});
