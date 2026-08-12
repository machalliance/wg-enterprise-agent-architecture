import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { makeEnvelope, type Envelope, type Terms } from "@meridian/protocol";
import { loadCatalog, loadScenario, loadSigner } from "./index.js";
import { openHalfTrail, readHalfTrail } from "./half-trail.js";

/** half-trail verify-on-open (#20): resuming onto a tampered chain must be refused, not silently
 *  extended with fresh valid records that hide the corruption. */

const scenario = loadScenario();
const supplierDid = loadCatalog("summit").did;
const supplierSigner = loadSigner(supplierDid);
const foreignSigner = loadSigner(loadCatalog("ridge").did);
const buyerDid = scenario.shortfall.buyer;
const TERMS: Terms = { sku: "MER-TENT-3S", units: 3000, unitPriceUsd: 90, leadTimeDays: 14, deliveryTerms: "DDP" };

function confirmEnv(): Envelope {
  return makeEnvelope({ type: "ACCEPT", from: buyerDid, to: supplierDid, negotiationId: "00000000-0000-4000-8000-000000000001", inReplyTo: "00000000-0000-4000-8000-0000000000ac", body: { round: 3, terms: TERMS } });
}

describe("openHalfTrail resume safety", () => {
  it("resumes cleanly from a valid existing trail", () => {
    const file = join(mkdtempSync(join(tmpdir(), "meridian-ht-")), "t.half-trail.jsonl");
    const env = confirmEnv();
    openHalfTrail(file, supplierSigner).record({ direction: "SENT", envelope: env, wirePayload: supplierSigner.sign(env), wireProfile: "meridian", counterpartyDid: buyerDid });
    // Re-open must not throw and must continue the chain.
    const resumed = openHalfTrail(file, supplierSigner);
    assert.equal(resumed.entries().length, 1);
  });

  it("refuses to resume a trail whose chain has been tampered with", () => {
    const file = join(mkdtempSync(join(tmpdir(), "meridian-ht-")), "t.half-trail.jsonl");
    const env = confirmEnv();
    openHalfTrail(file, supplierSigner).record({ direction: "SENT", envelope: env, wirePayload: supplierSigner.sign(env), wireProfile: "meridian", counterpartyDid: buyerDid });
    // Corrupt the persisted record's termsHash — the chain no longer verifies.
    const rec = readHalfTrail(file)[0]!;
    writeFileSync(file, JSON.stringify({ ...rec, termsHash: "deadbeef" }) + "\n");
    assert.throws(() => openHalfTrail(file, supplierSigner), /cannot resume broken half-trail/);
  });

  it("refuses to resume a trail owned by a different signer", () => {
    const file = join(mkdtempSync(join(tmpdir(), "meridian-ht-")), "t.half-trail.jsonl");
    const env = confirmEnv();
    // A foreign org writes a fully valid, self-consistent record — verifyChain() passes on it.
    openHalfTrail(file, foreignSigner).record({ direction: "SENT", envelope: env, wirePayload: foreignSigner.sign(env), wireProfile: "meridian", counterpartyDid: buyerDid });
    // This org must refuse to append onto another org's chain rather than mix identities.
    assert.throws(() => openHalfTrail(file, supplierSigner), /not owned by signer/);
  });
});
