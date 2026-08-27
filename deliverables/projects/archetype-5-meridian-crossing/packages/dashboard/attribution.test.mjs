import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveSupplierOrg } from "./public/attribution.js";

/**
 * Reconcile attribution (CodeRabbit "major"): a streamed reconcile record carries a counterparty-
 * controlled DID, and supplierOrgFromDid() matches that DID by substring — so a supplier can craft a
 * DID that resolves to ANOTHER supplier's id. The negotiation mapping the dashboard recorded itself is
 * authoritative and must be preferred; the DID is only a fallback when no negotiation is known.
 */
describe("resolveSupplierOrg", () => {
  const negs = new Map([["neg-1", { supplierOrg: "ridge" }]]);

  it("prefers the authoritative negotiation supplierOrg over a spoofable DID", () => {
    // The negotiation is with ridge, but the reconcile record's DID resolves to summit (spoof).
    const rec = { negotiationId: "neg-1", did: "did:web:summit.example" };
    const spoofResolver = (did) => (String(did).includes("summit") ? "summit" : null);
    assert.equal(resolveSupplierOrg(rec, negs, spoofResolver), "ridge");
  });

  it("falls back to the DID-derived org when no negotiation is known", () => {
    const rec = { negotiationId: "neg-unknown", did: "did:web:summit.example" };
    const resolver = (did) => (String(did).includes("summit") ? "summit" : null);
    assert.equal(resolveSupplierOrg(rec, negs, resolver), "summit");
  });

  it("returns null when neither source resolves", () => {
    const rec = { negotiationId: "neg-unknown", did: "did:web:mystery.example" };
    assert.equal(resolveSupplierOrg(rec, negs, () => null), null);
  });
});
