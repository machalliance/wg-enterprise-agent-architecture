import assert from "node:assert/strict";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { makeEnvelope, type Envelope, type SignedEnvelope } from "@meridian/protocol";
import { MERIDIAN_PROFILE, loadCatalog, loadScenario, loadSigner, makeAgentCard, startAgent } from "./index.js";

/**
 * The DROP PATH, over real A2A HTTP.
 *
 * `startAgent` deliberately has no try/finally around its executor body: `bus.finished()` in a `finally`
 * closed the event bus even when the body threw, and a closed bus is the SDK's signal that the exchange
 * completed NORMALLY — so the failure the agent had just computed had nowhere to go and the caller saw a
 * silent, reason-less failure. Every assertion here is on the thing that regression would break: not that
 * the bus stays unfinished (an internal detail), but that the CALLER can still see the drop and why.
 *
 * What the caller actually receives is a FAILED TASK, not a JSON-RPC error: @a2a-js/sdk 0.3.14 answers
 * HTTP 200 with `result.kind === "task"`, `status.state === "failed"`, and the reason as text on
 * `status.message`. A success, by contrast, comes back as `result.kind === "message"`. These tests are
 * written against that observed contract; if an SDK upgrade moves rejections onto `error` instead, they
 * fail loudly, which is the point — the delivery channel for a drop reason is not an implementation
 * detail this repo can afford to discover in production.
 */

/**
 * Every regex-special character, not just the dot.
 *
 * These assertions build a RegExp out of a DID and used `.replace(/\./g, "\\.")`, which escapes the dots
 * and leaves everything else live. A DID is `did:web:host` today, so nothing else in it is special and the
 * tests passed — but the escaping was incomplete rather than correct, so the first DID carrying a `+`, `(`
 * or `?` (a did:web with a port is percent-encoded, and did methods with query parameters exist) would
 * either throw on an invalid pattern or, worse, match something it should not and assert nothing.
 */
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const ad = loadCatalog("summit");
const supplierSigner = loadSigner(ad.did);
const buyerDid = loadScenario().shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const PORT = 45021; // outside e2e.test.ts's 45001-45011 range so the suites can run concurrently

let server: Server;

before(async () => {
  server = startAgent({
    card: makeAgentCard({ name: "drop-path", description: "rejection-path agent", url: `http://localhost:${PORT}` }),
    port: PORT,
    signer: supplierSigner,
    // PINNED, not inherited from the environment. `startAgent` falls back to `wireProfileFromEnv()`, so
    // with WIRE_PROFILE=a2cn in the environment this agent would refuse the plain envelopes these tests
    // send and the control case would fail for a reason that has nothing to do with the drop path. The
    // payloads below are hand-built meridian envelopes, so the profile has to be stated to match them.
    wireProfile: MERIDIAN_PROFILE,
    onMessage: (inbound: Envelope): Envelope =>
      makeEnvelope({
        type: "PONG",
        from: ad.did,
        to: inbound.from,
        negotiationId: inbound.negotiationId,
        inReplyTo: inbound.correlationId,
        body: { ok: true },
      }),
  });
  await new Promise((r) => setTimeout(r, 600)); // let the listener bind
});

after(() => {
  server?.close();
});

/**
 * A2A v1.0's JSON is canonical protobuf JSON, and three things moved:
 *   - the RESULT is a oneof wrapper — `{ result: { task: … } }` / `{ result: { message: … } }` — where
 *     v0.3 inlined the payload and tagged it with `kind`.
 *   - a part's content is the oneof FIELD NAME (`{ "text": … }` / `{ "data": … }`), not `{ kind, … }`.
 *   - task states are the protobuf enum names: `TASK_STATE_FAILED`, not `failed`.
 * All three are asserted below rather than tolerated, because this file's whole purpose is to pin what
 * a REMOTE CALLER sees — and every one of them changes that.
 */
interface JsonRpcReply {
  error?: { message?: string };
  result?: {
    message?: { messageId?: string };
    task?: { status?: { state?: string; message?: { parts?: Array<{ text?: string; data?: unknown }> } } };
  };
}

/** POST one payload as an A2A `message/send`, exactly as a remote caller would. Raw JSON-RPC rather than
 *  the SDK client, so what is asserted is the WIRE answer and not a client's error wrapping. */
async function send(payload: unknown): Promise<JsonRpcReply> {
  const res = await fetch(`http://localhost:${PORT}/`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      // DECLARE THE PROTOCOL VERSION, exactly as the SDK's own client does. A2A v1.0 treats an ABSENT
      // `A2A-Version` header as legacy 0.3 and answers 500 VERSION_NOT_SUPPORTED, because our card
      // advertises 1.0 only. That refusal is correct behaviour and is deliberately left in place — a
      // genuine v0.3 caller should be told so rather than silently handled — so the emulated peer here
      // has to speak the version it actually speaks.
      "A2A-Version": "1.0",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      // v1.0 renamed the JSON-RPC methods to the PascalCase RPC names (`SendMessage`), from v0.3's
      // slash-separated ones (`message/send`). The old name now returns -32601 "Invalid method."
      method: "SendMessage",
      params: {
        // The v1.0 wire shape — see JsonRpcReply above. `role` is the protobuf enum NAME, and the data
        // part is `{ data: … }`. Sent as raw JSON on purpose: this test exists to assert what a remote
        // caller actually receives, so building the request through the SDK's own encoder would test
        // the encoder against itself.
        message: { messageId: randomUUID(), role: "ROLE_USER", parts: [{ data: payload }] },
      },
    }),
  });
  assert.equal(res.status, 200, "the SDK answers 200 and puts the outcome in the body");
  return (await res.json()) as JsonRpcReply;
}

function ping(to: string): SignedEnvelope {
  return buyerSigner.sign(
    makeEnvelope({ type: "PING", from: buyerDid, to, negotiationId: randomUUID(), body: {} }),
  );
}

/** The reason text off a failed task, asserting the failed shape on the way. */
function failureReason(reply: JsonRpcReply): string {
  assert.ok(reply.result?.task, "a drop comes back as a task, not a message");
  assert.equal(reply.result.task.status?.state, "TASK_STATE_FAILED", "and that task is in the failed state");
  const text = (reply.result.task.status?.message?.parts ?? [])
    .filter((p) => p.text !== undefined)
    .map((p) => p.text ?? "")
    .join(" ");
  assert.ok(text.length > 0, "the failed task carries a text reason");
  return text;
}

describe("startAgent drop path reaches the caller with a reason", () => {
  // The CONTROL. Without it every assertion below would pass just as happily against an agent that
  // rejected everything, which is the failure mode that makes rejection tests lie.
  it("a valid message still succeeds and answers with a signed reply", async () => {
    const reply = await send(ping(ad.did));
    assert.equal(reply.error, undefined);
    assert.ok(reply.result?.message, "a success is a message, never a task");
    assert.equal(reply.result.task, undefined, "and carries no task payload at all");
  });

  it("a tampered body is rejected, and the signature reason reaches the caller", async () => {
    // Sign a real envelope, then mutate the body — the signature no longer covers these bytes.
    const tampered = ping(ad.did) as SignedEnvelope & { body: unknown };
    tampered.body = { ok: "TAMPERED" };
    const reason = failureReason(await send(tampered));
    assert.match(reason, /signature rejected/, "names the signature as the cause");
    assert.match(reason, /tampered body or wrong key/, "and carries the verifier's own reason");
    assert.match(reason, new RegExp(escapeRegExp(buyerDid)), "and names the sender it dropped");
  });

  it("a message addressed to another agent is rejected, and the addressing reason reaches the caller", async () => {
    // Correctly signed, genuinely from the buyer — and addressed to somebody else. The redirection case:
    // signing `to` stops it being ALTERED but cannot stop the whole message being replayed at us.
    const elsewhere = "did:web:somebody-else.example";
    const reason = failureReason(await send(ping(elsewhere)));
    assert.match(reason, /not this agent/, "names addressing as the cause");
    assert.match(reason, new RegExp(escapeRegExp(elsewhere)), "names who it was addressed to");
    assert.match(reason, new RegExp(escapeRegExp(ad.did)), "and who this agent actually is");
  });

  it("an unparseable payload is rejected rather than reaching onMessage", async () => {
    const reason = failureReason(await send({ not: "an envelope" }));
    assert.ok(reason.length > 0, "the schema rejection is reported too, not swallowed");
  });
});
