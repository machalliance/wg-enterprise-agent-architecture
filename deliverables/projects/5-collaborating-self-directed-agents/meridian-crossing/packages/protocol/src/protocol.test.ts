import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalize } from "./canonical.js";
import { CapabilityAd, capabilityToOasfData, oasfRecordToCapability, OasfRecord } from "./capability.js";

/** Serialization findings: capability regions must round-trip even with commas (#19), and canonical
 *  JSON must not drop arbitrary keys like `__proto__` from the signed form (#20). */

describe("capability regions round-trip", () => {
  it("preserves a region string that contains a comma", () => {
    const ad: CapabilityAd = {
      did: "did:web:summit-gear.example",
      agentName: "Summit",
      product: "three-season-tent",
      maxUnits: 5000,
      minLeadTimeDays: 10,
      regions: ["EU, Central", "NA"],
      claims: { onTimeDeliveryRate: 0.95, iso9001: true },
      a2aEndpoint: "http://localhost:41001",
    };
    const back = oasfRecordToCapability(OasfRecord.parse(capabilityToOasfData(ad)));
    assert.deepEqual(back.regions, ["EU, Central", "NA"], "a comma inside a region must not split it");
  });
});

describe("canonicalize", () => {
  it("sorts keys deterministically", () => {
    assert.equal(canonicalize({ b: 1, a: 2 }), '{"a":2,"b":1}');
  });
  it("retains an own __proto__ key in the signed output instead of dropping it", () => {
    // JSON.parse makes __proto__ an ordinary own key — the canonical form must carry it through, in
    // sorted order, with its nested value intact.
    const value = JSON.parse('{"__proto__":{"x":1},"a":2}');
    assert.equal(canonicalize(value), '{"__proto__":{"x":1},"a":2}');
  });
});
