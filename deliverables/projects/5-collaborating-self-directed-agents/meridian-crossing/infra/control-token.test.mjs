import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { provisionControlToken } from "./control-token.mjs";

/**
 * The launcher's CONTROL_TOKEN rule.
 *
 * This existed with no coverage, and the gap was self-concealing: every test and every sweep sets a token so
 * it can drive the control routes, which is exactly the branch that does NOT auto-provision. So the path a
 * real `pnpm demo --web` takes — mint a random one — was the only untested one.
 */
describe("launcher control-token provisioning", () => {
  it("mints a token for --web, where the dashboard exposes the control surface", () => {
    const t = provisionControlToken({ web: true, usdc: false, existing: undefined });
    assert.match(t, /^[0-9a-f]{48}$/, "48 hex chars = 24 random bytes");
  });

  it("mints a token for --usdc, whose money routes fail closed without one", () => {
    assert.match(provisionControlToken({ web: false, usdc: true, existing: undefined }), /^[0-9a-f]{48}$/);
  });

  it("mints one for --web --usdc", () => {
    assert.match(provisionControlToken({ web: true, usdc: true, existing: undefined }), /^[0-9a-f]{48}$/);
  });

  it("mints NOTHING for a plain terminal run — there is no control surface to protect", () => {
    // Not a token: implying an authentication boundary with nothing behind it is worse than none, because
    // `requireControlToken` runs open when the value is empty and the logs say so at startup.
    assert.equal(provisionControlToken({ web: false, usdc: false, existing: undefined }), "");
  });

  it("honours an operator-set token, so a pinned value is never overwritten", () => {
    for (const flags of [
      { web: true, usdc: false },
      { web: false, usdc: true },
      { web: false, usdc: false },
      { web: true, usdc: true },
    ]) {
      assert.equal(provisionControlToken({ ...flags, existing: "operator-pinned" }), "operator-pinned");
    }
  });

  it("is FRESH per run — two launches never share a token", () => {
    // A constant would pass every other test here while making one run's token valid against the next.
    const a = provisionControlToken({ web: true, usdc: false, existing: undefined });
    const b = provisionControlToken({ web: true, usdc: false, existing: undefined });
    assert.notEqual(a, b);
  });

  it("treats an empty CONTROL_TOKEN as unset, so `CONTROL_TOKEN= pnpm demo --web` still gets one", () => {
    // `process.env.CONTROL_TOKEN` is "" for an exported-but-empty variable. Reading that as "operator chose
    // no token" would leave the dashboard's own kill switch and approval routes unauthenticated.
    assert.match(provisionControlToken({ web: true, usdc: false, existing: "" }), /^[0-9a-f]{48}$/);
  });
});
