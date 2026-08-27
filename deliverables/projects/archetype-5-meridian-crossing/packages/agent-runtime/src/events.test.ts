import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import express from "express";
import type { Server } from "node:http";
import { makeEventHub, sseHandler } from "./events.js";

/**
 * The per-org SSE stream is a READ surface onto that org's whole trail — for the buyer that includes
 * `commit-selection`, which names every competing supplier's best-and-final terms. It is reached only
 * through the dashboard's same-origin reverse proxy, so it must not advertise itself as readable by
 * arbitrary origins: a wildcard here let any page the operator happened to visit pull the buyer's
 * negotiation position cross-origin. (The buyer's control server made the same call explicitly; this
 * handler is mounted on that same app and had silently opted back in.)
 *
 * Test mechanics: an SSE response never ends, so every request here is made through an AbortController
 * and torn down explicitly. `closeAllConnections()` is what actually lets the runner exit — `close()`
 * alone waits on the live stream, and the handler's own 15s keep-alive timer holds the loop open until
 * its `req.on("close")` fires.
 */
describe("sseHandler", () => {
  const servers: Server[] = [];
  const aborts: AbortController[] = [];

  after(() => {
    for (const a of aborts) a.abort();
    for (const s of servers) {
      s.closeAllConnections();
      s.close();
    }
  });

  const listen = (): Promise<{ url: string; hub: ReturnType<typeof makeEventHub> }> => {
    const hub = makeEventHub("buyer");
    const app = express();
    app.get("/events", sseHandler(hub));
    return new Promise((resolve) => {
      const s = app.listen(0, "127.0.0.1", () => {
        servers.push(s);
        resolve({ url: `http://127.0.0.1:${(s.address() as { port: number }).port}/events`, hub });
      });
    });
  };

  /**
   * Open the stream and, when `until` is given, read chunks until the body matches it — then abort. An
   * SSE body never completes on its own, so something has to decide when to stop.
   *
   * Reading is opt-in because `reader.read()` BLOCKS until the server sends something: a header-only
   * assertion on a hub with no history would hang until the test runner's timeout and report as a
   * timeout rather than as the thing it was checking.
   *
   * ACCUMULATING rather than taking the first chunk: SSE framing is not one-event-per-chunk. The
   * handler may emit its `retry:` preamble in its own write, so the first read can legitimately contain
   * no event at all — a flake that depends on write coalescing and would fail on a slower machine, or
   * under a Node release that flushes differently, having passed a hundred times locally.
   */
  const openStream = async (url: string, headers: Record<string, string> = {}, until?: RegExp) => {
    const ac = new AbortController();
    aborts.push(ac);
    const res = await fetch(url, { headers, signal: ac.signal });
    if (!until) {
      ac.abort();
      return { res, text: "" };
    }
    const reader = res.body!.getReader();
    let text = "";
    // The read-count bound alone does not bound TIME: a server that sends nothing leaves the very first
    // `reader.read()` pending forever, and the suite dies on the runner's global timeout with no clue
    // which test hung. Aborting the controller makes the pending read REJECT, so a stall fails here,
    // named, in seconds.
    const stall = setTimeout(() => ac.abort(), 5000);
    try {
      for (let reads = 0; reads < 20 && !until.test(text); reads++) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) text += Buffer.from(value).toString();
      }
    } finally {
      clearTimeout(stall);
      reader.releaseLock();
      ac.abort();
    }
    return { res, text };
  };

  it("does not send a wildcard access-control-allow-origin", async () => {
    const { url } = await listen();
    const { res } = await openStream(url, { origin: "https://unrelated.example" });
    assert.equal(
      res.headers.get("access-control-allow-origin"),
      null,
      "the stream must not opt into cross-origin reads — the dashboard proxies it same-origin",
    );
  });

  it("still streams this org's own history to a same-origin reader", async () => {
    const { url, hub } = await listen();
    hub.publish({ event: "negotiation-end", result: "SETTLED" });
    const historyEvent = /"event":"negotiation-end"/;
    const { res, text } = await openStream(url, {}, historyEvent);
    assert.equal(res.headers.get("content-type"), "text/event-stream");
    assert.match(text, historyEvent, "history replays on connect");
  });
});
