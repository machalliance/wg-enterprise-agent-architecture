import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { supplierPort } from "./scenario.js";

/** supplierPort validation (#14): an env override must be a valid TCP port, not a silently-NaN Number(). */

describe("supplierPort", () => {
  const saved = process.env.SUMMIT_PORT;
  afterEach(() => {
    if (saved === undefined) delete process.env.SUMMIT_PORT;
    else process.env.SUMMIT_PORT = saved;
  });

  it("returns the default when no override is set", () => {
    delete process.env.SUMMIT_PORT;
    const port = supplierPort("summit");
    assert.ok(Number.isInteger(port) && port >= 1 && port <= 65535, `default port ${port} must be a valid TCP port`);
  });

  it("accepts a valid override", () => {
    process.env.SUMMIT_PORT = "45001";
    assert.equal(supplierPort("summit"), 45001);
  });

  it("throws on a non-numeric or out-of-range override", () => {
    process.env.SUMMIT_PORT = "abc";
    assert.throws(() => supplierPort("summit"), /must be an integer in 1-65535/);
    process.env.SUMMIT_PORT = "70000";
    assert.throws(() => supplierPort("summit"), /must be an integer in 1-65535/);
    process.env.SUMMIT_PORT = "0";
    assert.throws(() => supplierPort("summit"), /must be an integer in 1-65535/);
  });
});
