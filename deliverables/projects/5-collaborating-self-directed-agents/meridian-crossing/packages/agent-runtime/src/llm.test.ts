import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { z } from "zod";
import { askForTool, type LlmConfig, type ToolSpec } from "./llm.js";

/** LLM retry finding (#21): a non-retriable 4xx and an aborted request must fail immediately, while a
 *  transient 5xx is still retried up to the cap. `fetch` is stubbed and calls are counted. */

const config: LlmConfig = { baseUrl: "https://gateway.test/v1", apiKey: "k", model: "m" };
const tool: ToolSpec<Record<string, never>> = { name: "t", description: "", parameters: {}, schema: z.object({}) };
const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("askForTool retry policy", () => {
  it("does NOT retry a non-retriable 4xx (one request, then fail)", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("bad request", { status: 400 });
    }) as typeof fetch;
    await assert.rejects(askForTool({ config, system: "s", user: "u", tool, retries: 4 }), /400/);
    assert.equal(calls, 1, "a 400 must fail on the first attempt");
  });

  it("does retry a transient 5xx up to the cap", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      return new Response("upstream", { status: 503 });
    }) as typeof fetch;
    await assert.rejects(askForTool({ config, system: "s", user: "u", tool, retries: 2 }));
    assert.equal(calls, 3, "retries=2 → 1 initial + 2 retries");
  });

  it("aborts a hung request via the internal default timeout", async () => {
    // A gateway that never responds but honours the abort signal — the internal timeout must fire so the
    // call rejects instead of hanging the negotiation turn forever. AbortSignal.timeout's timer is
    // unref'd, so keep the loop alive for the test (a real fetch's socket does this in production).
    const keepAlive = setInterval(() => {}, 1000);
    globalThis.fetch = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject((init.signal as AbortSignal).reason ?? new Error("aborted")));
      })) as typeof fetch;
    try {
      await assert.rejects(askForTool({ config, system: "s", user: "u", tool, retries: 0, timeoutMs: 50 }));
    } finally {
      clearInterval(keepAlive);
    }
  });

  it("does NOT retry an aborted request", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }) as typeof fetch;
    await assert.rejects(askForTool({ config, system: "s", user: "u", tool, retries: 4 }), /abort/i);
    assert.equal(calls, 1, "an aborted request must not be retried");
  });
});
