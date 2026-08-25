import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "agntcy-dir";
import { capabilityToOasfData } from "@meridian/protocol";
import { loadCatalog } from "./index.js";
import { discoverByProduct, publishCapability } from "./directory.js";

/**
 * Directory-client robustness (CodeRabbit findings): one malformed record must not sink discovery
 * (#12), and an idempotent re-publish must return the REAL content digest, never a fabricated id (#13).
 * The SDK Client is faked so the tests need no running directory.
 */

const validData = capabilityToOasfData(loadCatalog("summit"));

function fakeClient(parts: Partial<Client>): Client {
  return parts as unknown as Client;
}

describe("discoverByProduct", () => {
  it("skips a malformed record and keeps the valid candidates with the right cid", async () => {
    // Malformed record FIRST, valid record SECOND — proving cid association is by record identity, not
    // by a post-filter index that would misattribute the surviving candidate's cid.
    const client = fakeClient({
      searchCIDs: async () => [{ recordCid: "cid-bad" }, { recordCid: "cid-good" }] as never,
      pull: async () => [{ data: { name: "totally not an OASF record" } }, { data: validData }] as never,
    });
    const found = await discoverByProduct(client, "three-season-tent");
    assert.equal(found.length, 1, "the one valid record survives");
    assert.equal(found[0]!.cid, "cid-good");
  });

  it("returns [] when the search finds nothing", async () => {
    const client = fakeClient({ searchCIDs: async () => [] as never });
    assert.deepEqual(await discoverByProduct(client, "three-season-tent"), []);
  });
});

describe("publishCapability idempotency", () => {
  // The `sha256:…` in an already-exists error is the OCI LAYER DIGEST. A RecordRef.cid is a multiformats
  // CID (see the proto: "Globally-unique content identifier (CID) of the record"), a different namespace
  // that `pull`/`searchCIDs` accept and a digest is not. Returning the digest satisfied "never fabricate
  // a cid" only in spirit — it still produced an id that resolves to nothing. So the recovery asks the
  // directory what CID it actually holds, and re-throws when it cannot find out.
  it("recovers the real record CID from the directory on an already-exists error", async () => {
    const client = fakeClient({
      push: async () => {
        throw new Error("rpc error: record already exists: sha256:deadbeef01");
      },
      searchCIDs: async () => [{ recordCid: "cid-summit-real" }] as never,
      pull: async () => [{ data: validData }] as never,
    });
    const cid = await publishCapability(client, loadCatalog("summit"));
    assert.equal(cid, "cid-summit-real", "the CID the directory holds, not the OCI digest in the message");
  });

  it("re-throws when the existing record cannot be found (never fabricates a cid)", async () => {
    const client = fakeClient({
      push: async () => {
        throw new Error("rpc error: record already exists: sha256:deadbeef01");
      },
      searchCIDs: async () => [] as never,
    });
    await assert.rejects(publishCapability(client, loadCatalog("summit")), /already exists/);
  });

  it("re-throws an already-exists error when the search turns up only OTHER suppliers' records", async () => {
    const client = fakeClient({
      push: async () => {
        throw new Error("record already exists");
      },
      searchCIDs: async () => [{ recordCid: "cid-someone-else" }] as never,
      pull: async () => [{ data: capabilityToOasfData(loadCatalog("alpine")) }] as never,
    });
    await assert.rejects(publishCapability(client, loadCatalog("summit")), /already exists/);
  });

  // Matching on did + product alone was too loose. A supplier that re-publishes the SAME product after
  // any capability change leaves the OLD record in the directory, and both records carry that did and
  // that product — so the first hit won and the recovered CID could name the superseded terms. That is
  // the same poisoning the OCI-digest shortcut was rejected for, just sourced from a real record.
  it("returns the CID of the record matching the WHOLE ad, not the first same-did/product hit", async () => {
    const summit = loadCatalog("summit");
    // A stale record for the same supplier AND the same product, differing only in a capability field.
    const stale = { ...summit, maxUnits: summit.maxUnits + 250 };
    assert.equal(stale.did, summit.did, "same supplier");
    assert.equal(stale.product, summit.product, "same product — both match the annotation query");

    const client = fakeClient({
      push: async () => {
        throw new Error("record already exists");
      },
      // Stale FIRST, so a did-only match returns the wrong cid.
      searchCIDs: async () => [{ recordCid: "cid-summit-stale" }, { recordCid: "cid-summit-current" }] as never,
      pull: async () => [{ data: capabilityToOasfData(stale) }, { data: capabilityToOasfData(summit) }] as never,
    });
    assert.equal(await publishCapability(client, summit), "cid-summit-current");
  });

  it("re-throws when every same-did/product record differs from the ad being published", async () => {
    const summit = loadCatalog("summit");
    const client = fakeClient({
      push: async () => {
        throw new Error("record already exists");
      },
      searchCIDs: async () => [{ recordCid: "cid-summit-stale" }] as never,
      pull: async () => [{ data: capabilityToOasfData({ ...summit, a2aEndpoint: "https://moved.example/a2a" }) }] as never,
    });
    // No record matches, so there is no CID to honestly return — re-throw rather than name a near-miss.
    await assert.rejects(publishCapability(client, summit), /already exists/);
  });
});
