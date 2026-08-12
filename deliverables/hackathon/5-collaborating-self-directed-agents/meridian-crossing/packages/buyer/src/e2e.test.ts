import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import type { Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import {
  A2CN_PROFILE,
  createSeller,
  initTelemetry,
  loadCatalog,
  loadScenario,
  loadSigner,
  loadSupplierPolicy,
  makeAgentCard,
  makeTransport,
  openHalfTrail,
  readHalfTrail,
  transactionRecordFromTrail,
  verifyTransactionRecord,
  shutdownTelemetry,
  startAgent,
  verifyChain,
  type HalfTrail,
  type SellerParams,
  type SupplierId,
  type Tracer,
  type Transport,
} from "@meridian/agent-runtime";
import { makeEnvelope, type Envelope, type TrailRecord } from "@meridian/protocol";
import { loadMandate } from "./mandate.js";
import { Governor } from "./governor.js";
import { runNegotiation, type NegotiationOutcome } from "./negotiate.js";
import { ADVERSARIAL, COOPERATIVE, FIRM, sellerParams } from "./seller-fixtures.js";

/**
 * END-TO-END over REAL A2A HTTP. Where accountability.test.ts runs the negotiation through an in-process
 * channel, THIS boots every supplier as a real A2A server on localhost and drives real
 * negotiations over the wire — exercising the surfaces the in-process test cannot:
 *   - `startAgent`'s supplier-side half-trail recording (verify → onMessage → RECEIVED + SENT);
 *   - the verbose sender capturing the counterparty's raw signed payload off a real HTTP reply;
 *   - each org deriving its own A2CN §9 transaction record from its durable half-trail on disk;
 *   - the walk-away (Ridge) and escalate (Alpine) half-trail paths, not just the settle;
 *   - the real OTel exporter writing one span per negotiation, asserted from the spans file;
 *   - one negotiation carried end-to-end over the A2CN wire profile (money in minor units, JWS).
 * No Docker and no directory: discovery is a separate concern, so we connect suppliers by URL directly.
 */

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);

const PORTS: Record<string, number> = {
  summit: 45001,
  alpine: 45002,
  ridge: 45003,
  cascade: 45004,
  "summit-a2cn": 45011,
  // A supplier serving a PLAIN card (no A2CN extension), dialled by a buyer that prefers A2CN — the
  // graceful-downgrade path. Its own port and half-trail so the profile on its records is unambiguous.
  "summit-downgrade": 45012,
};
const PARAMS: Record<SupplierId, Partial<SellerParams>> = {
  summit: sellerParams(COOPERATIVE),
  // Cascade runs its REAL seed policy here: unlike the others it is not exaggerated to force an outcome
  // quickly, because the behaviour under test is precisely that its floor settles inside the mandate's
  // autonomous band. See supplier-cascade/src/index.ts for why each number is what it is.
  //
  // LOADED, not restated. The transcribed copy said the same thing as the seed right up until it did
  // not: this is the one supplier here whose test only means anything if the numbers are the shipped
  // ones, so reading them is the difference between testing the product and testing a snapshot of it.
  cascade: loadSupplierPolicy("cascade"),
  alpine: sellerParams(FIRM),
  ridge: sellerParams(ADVERSARIAL),
};

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Boot one supplier as a real A2A server, recording its own signed half-trail. */
function bootSupplier(id: SupplierId, port: number, halfTrail: HalfTrail, a2cn = false): Server {
  const ad = loadCatalog(id);
  const did = ad.did;
  const signer = loadSigner(did);
  const params: SellerParams = {
    behaviour: id,
    capacityUnits: ad.maxUnits,
    leadTimeDays: ad.minLeadTimeDays,
    openingPriceUsd: 0,
    floorPriceUsd: 0,
    concessionRate: 0,
    ...PARAMS[id],
  };
  const seller = createSeller(params, { did, trail: { append() {} } });
  return startAgent({
    card: makeAgentCard({ name: id, description: `${id} e2e agent`, url: `http://localhost:${port}` }),
    port,
    signer,
    halfTrail,
    // Force the profile for the a2cn server; the meridian servers use the default.
    wireProfile: a2cn ? A2CN_PROFILE : undefined,
    onMessage: (inbound: Envelope): Envelope => {
      if (inbound.type === "PING") {
        return makeEnvelope({ type: "PONG", from: did, to: inbound.from, negotiationId: inbound.negotiationId, inReplyTo: inbound.correlationId, body: { ok: true } });
      }
      return seller.handle(inbound);
    },
  });
}

async function waitReady(transport: Transport, port: number, tries = 50): Promise<void> {
  for (let i = 0; i < tries; i++) {
    try {
      await transport.connect(`http://localhost:${port}`);
      return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`supplier on :${port} never became ready`);
}

function adFor(id: SupplierId, port: number): ReturnType<typeof loadCatalog> {
  return { ...loadCatalog(id), a2aEndpoint: `http://localhost:${port}` };
}

describe("end-to-end over real A2A HTTP", () => {
  const servers: Server[] = [];
  const dir = mkdtempSync(join(tmpdir(), "meridian-e2e-"));
  const spansFile = join(dir, "otel-spans.jsonl");
  const buyerFile = join(dir, "buyer.half-trail.jsonl");
  const files: Record<string, string> = {};
  const outcomes: Record<string, NegotiationOutcome> = {};
  let tracer: Tracer;

  before(async () => {
    process.env.OTEL_ENABLED = "1";
    process.env.OTEL_TRACES_FILE = spansFile;
    delete process.env.WIRE_PROFILE;
    tracer = initTelemetry("buyer-e2e");

    const transport = makeTransport();
    const buyerHalf = openHalfTrail(buyerFile, buyerSigner);
    const mandate = loadMandate(scenario);
    const governor = new Governor(mandate);

    // Boot the four meridian suppliers + one A2CN-profile supplier (Summit's DID, distinct port).
    const boot: Array<[SupplierId, string, boolean]> = [
      ["summit", "summit", false],
      ["cascade", "cascade", false],
      ["alpine", "alpine", false],
      ["ridge", "ridge", false],
      ["summit", "summit-a2cn", true],
      ["summit", "summit-downgrade", false],
    ];
    for (const [id, key, a2cn] of boot) {
      files[key] = join(dir, `${key}.half-trail.jsonl`);
      servers.push(bootSupplier(id, PORTS[key]!, openHalfTrail(files[key]!, loadSigner(loadCatalog(id).did)), a2cn));
    }
    for (const key of Object.keys(PORTS)) await waitReady(transport, PORTS[key]!);

    // Meridian negotiations (default profile), sharing one governor like the live buyer.
    for (const id of ["summit", "alpine", "ridge"] as SupplierId[]) {
      outcomes[id] = await runNegotiation({
        transport, signer: buyerSigner, buyerDid, mandate, governor, trust: "VERIFIED",
        ad: adFor(id, PORTS[id]!), trail: { append() {} }, halfTrail: buyerHalf, tracer,
      });
    }

    // Cascade gets its OWN governor, and the reason is the cross-deal spend cap rather than convenience.
    // These runs are sequential against one shared ledger, so Summit's settle has already consumed most
    // of the $10,000 cap by the time Cascade is reached, and Cascade's ~$8,900 deal cannot fit — it
    // escalates on BUDGET, never reaching the tier decision this test is about. That blocking behaviour is
    // deliberate and already covered ("cross-deal spend cap: two concurrent near-cap settles"); reusing
    // the exhausted governor here would only hide whether Cascade's own policy can win a deal.
    outcomes["cascade"] = await runNegotiation({
      transport, signer: buyerSigner, buyerDid, mandate, governor: new Governor(mandate), trust: "VERIFIED",
      ad: adFor("cascade", PORTS["cascade"]!), trail: { append() {} }, halfTrail: buyerHalf, tracer,
    });

    // One negotiation over the A2CN wire profile, end-to-end over HTTP — and one against a supplier
    // whose card does NOT advertise it, which must downgrade rather than fail. Same buyer preference
    // (`WIRE_PROFILE=a2cn`) for both, so the only thing deciding the encoding is the counterparty's card.
    process.env.WIRE_PROFILE = "a2cn";
    try {
      outcomes["summit-a2cn"] = await runNegotiation({
        transport, signer: buyerSigner, buyerDid, mandate, governor: new Governor(mandate), trust: "VERIFIED",
        ad: adFor("summit", PORTS["summit-a2cn"]!), trail: { append() {} }, halfTrail: buyerHalf, tracer,
      });
      outcomes["summit-downgrade"] = await runNegotiation({
        transport, signer: buyerSigner, buyerDid, mandate, governor: new Governor(mandate), trust: "VERIFIED",
        ad: adFor("summit", PORTS["summit-downgrade"]!), trail: { append() {} }, halfTrail: buyerHalf, tracer,
      });
    } finally {
      delete process.env.WIRE_PROFILE;
    }

    await shutdownTelemetry();
  });

  after(() => {
    for (const s of servers) s.close();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_TRACES_FILE;
    delete process.env.WIRE_PROFILE;
  });

  // Each org's own durable half-trail, read from disk. Scoped per negotiation when deriving records.
  const buyerHalf = (): TrailRecord[] => readHalfTrail(buyerFile);
  const supplierHalf = (key: string): TrailRecord[] => readHalfTrail(files[key]!);

  it("reaches the expected outcomes over real HTTP (Summit and Cascade settle, Alpine escalates, Ridge walks)", () => {
    assert.equal(outcomes["summit"]!.result, "SETTLED");
    assert.equal(outcomes["alpine"]!.result, "ESCALATE");
    assert.equal(outcomes["ridge"]!.result, "WALKED");
    assert.equal(outcomes["summit-a2cn"]!.result, "SETTLED");

    // Cascade's whole reason for existing is that it is a CREDIBLE rival — a supplier the buyer could
    // actually take. Alpine cannot be that (its $95 floor is above the buyer's $94 ceiling by design), so
    // before Cascade the buyer's alternatives were all unusable and it had no leverage to negotiate with.
    // Assert the property that makes the threat real, not just that it happened to settle.
    const cascade = outcomes["cascade"]!;
    assert.equal(cascade.result, "SETTLED", "Cascade must be able to win a deal or it is not a threat");
    assert.ok(
      cascade.terms!.unitPriceUsd <= 93,
      `Cascade settled at $${cascade.terms!.unitPriceUsd}/u, outside the mandate's autonomous band`,
    );
    // NOT asserted here: that Summit beats Cascade on price. Cascade's floor ($89) does sit above
    // Summit's, so Summit wins any negotiation pushed to the floors — but this test's buyer is the
    // deterministic reasoner, which accepts the FIRST committable offer and therefore never pushes to a
    // floor at all. Cascade opens lower ($95 vs $98) so it crosses the $93 band first and settles
    // cheaper. Asserting the floor relationship through an outcome that cannot express it would be a
    // test that passes for the wrong reason; the relationship is a config invariant, checked below.
    assert.ok(
      PARAMS["cascade"]!.floorPriceUsd! > PARAMS["summit"]!.floorPriceUsd!,
      "Cascade's floor must stay above Summit's, or Summit becomes the decoration instead",
    );
  });

  it("every half-trail written by startAgent is internally tamper-evident", () => {
    for (const key of Object.keys(PORTS)) {
      assert.ok(verifyChain(readHalfTrail(files[key]!)).ok, `${key} chain intact`);
    }
    assert.ok(verifyChain(readHalfTrail(buyerFile)).ok, "buyer chain intact");
  });

  it("both parties independently derive the same record for the settled Summit deal (meridian)", () => {
    const o = outcomes["summit"]!;
    // Each side builds from its OWN file-backed half-trail, written by two separate processes over
    // real HTTP. The test reads both only to compare; the agents never did.
    const ours = transactionRecordFromTrail(buyerHalf(), o.negotiationId);
    const theirs = transactionRecordFromTrail(supplierHalf("summit"), o.negotiationId);
    assert.ok(ours && theirs, "both sides derived a record");
    assert.equal(ours!.record_hash, theirs!.record_hash, "records must be identical");
    assert.ok(verifyTransactionRecord(ours!), "record self-verifies");
    // And the buyer reached that conclusion live, from the hash the supplier put on its ACK.
    assert.equal(o.recordsAgree, true, "the buyer confirmed agreement at settle time");
    assert.equal(o.recordHash, ours!.record_hash);
  });

  it("derives the same record end-to-end over A2CN (money in minor units, protocol-act JWS)", () => {
    const o = outcomes["summit-a2cn"]!;
    const supplier = supplierHalf("summit-a2cn");
    assert.ok(supplier.some((r) => r.wireProfile === "a2cn"), "supplier half is a2cn");
    const ours = transactionRecordFromTrail(buyerHalf(), o.negotiationId);
    const theirs = transactionRecordFromTrail(supplier, o.negotiationId);
    assert.ok(ours && theirs, "both sides derived a record over a2cn");
    assert.equal(ours!.record_hash, theirs!.record_hash, "records must be identical over a2cn");
    assert.equal(o.recordsAgree, true, "the buyer confirmed agreement at settle time");
  });

  /**
   * The GRACEFUL DOWNGRADE, over real HTTP. The buyer preferred A2CN (`WIRE_PROFILE=a2cn`) and the
   * supplier's card advertises no A2CN extension, so the pair must agree `meridian` and settle normally.
   *
   * This is the claim the README makes ("a counterparty that does not advertise the A2CN extension falls
   * back to meridian with no code change") and it was previously true of `selectWireProfile` alone —
   * nothing in the product called it, so the buyer encoded A2CN regardless of the card and the supplier
   * refused every negotiation verb. Asserting the SETTLE is what makes this non-vacuous: a test that only
   * checked the recorded profile would also pass on a run that never got a message through.
   */
  it("downgrades to meridian against a supplier whose card does not advertise A2CN", () => {
    const o = outcomes["summit-downgrade"]!;
    assert.equal(o.result, "SETTLED", "the downgraded negotiation must actually complete, not merely fail quietly");
    const supplier = supplierHalf("summit-downgrade");
    assert.ok(supplier.length > 0, "the supplier recorded messages (so something did cross the wire)");
    assert.ok(
      supplier.every((r) => r.wireProfile === "meridian"),
      `every record must be meridian, got ${[...new Set(supplier.map((r) => r.wireProfile))].join(", ")}`,
    );
    // And the buyer's own half of THIS negotiation, which is what its encoder chose.
    const ourSide = buyerHalf().filter((r) => r.negotiationId === o.negotiationId);
    assert.ok(ourSide.length > 0, "the buyer recorded its own half");
    assert.ok(ourSide.every((r) => r.wireProfile === "meridian"), "the buyer encoded meridian too");
  });

  it("produces NO transaction record for the walked (Ridge) and escalated (Alpine) deals", () => {
    // A record exists only for a settled deal — there is nothing to record when no ACCEPT was sent.
    // Both halves must agree on that too, and they do by deriving nothing.
    for (const [id, key] of [["ridge", "ridge"], ["alpine", "alpine"]] as const) {
      const o = outcomes[id]!;
      assert.notEqual(o.result, "SETTLED", `${id} did not settle`);
      assert.equal(transactionRecordFromTrail(buyerHalf(), o.negotiationId), null, `${id}: no buyer record`);
      assert.equal(transactionRecordFromTrail(supplierHalf(key), o.negotiationId), null, `${id}: no supplier record`);
    }
  });

  it("emits one OTel trace per negotiation, tagged with the active wire profile", () => {
    const spans = readFileSync(spansFile, "utf8")
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { name: string; attributes: Record<string, unknown> })
      .filter((s) => s.name === "negotiation");
    // Derived from `outcomes`, not hardcoded: the count is "one span per negotiation this test actually
    // ran", so adding a supplier changes the expectation automatically instead of failing on a magic
    // number that says nothing about what broke.
    const meridianRuns = Object.keys(outcomes).filter((k) => k !== "summit-a2cn").length;
    const expected = meridianRuns + 1; // + the single A2CN-profile negotiation
    assert.equal(spans.length, expected, "one span per negotiation");
    const ids = new Set(spans.map((s) => s.attributes["agntcy.negotiation.id"]));
    assert.equal(ids.size, expected, `${expected} distinct negotiation ids`);
    assert.equal(spans.filter((s) => s.attributes["agntcy.wire.profile"] === "meridian").length, meridianRuns);
    assert.equal(spans.filter((s) => s.attributes["agntcy.wire.profile"] === "a2cn").length, 1);
  });
});
