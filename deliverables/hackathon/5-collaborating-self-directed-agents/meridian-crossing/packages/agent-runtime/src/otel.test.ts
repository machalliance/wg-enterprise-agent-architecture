import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { initTelemetry, shutdownTelemetry, withNegotiationSpan, WIRE_PROFILE_ATTR } from "./otel.js";

/**
 * withNegotiationSpan must open a NEW ROOT trace per negotiation (#otel finding). If it inherited the
 * active context, a negotiation started inside any ambient span would nest under it and break the
 * "one trace per negotiationId" guarantee. We assert the negotiation span's traceId differs from an
 * enclosing active span's — which only holds when it roots from ROOT_CONTEXT.
 */

describe("withNegotiationSpan roots a new trace", () => {
  before(() => {
    process.env.OTEL_ENABLED = "1";
    process.env.OTEL_TRACES_FILE = join(mkdtempSync(join(tmpdir(), "meridian-otel-")), "spans.jsonl");
  });
  after(async () => {
    await shutdownTelemetry();
    delete process.env.OTEL_ENABLED;
    delete process.env.OTEL_TRACES_FILE;
  });

  it("does not inherit an active parent span's trace", async () => {
    const tracer = initTelemetry("otel-test");
    let outerTraceId = "";
    let negTraceId = "";
    await tracer.startActiveSpan("outer", async (outer) => {
      outerTraceId = outer.spanContext().traceId;
      await withNegotiationSpan(
        tracer,
        { negotiationId: "n-1", counterpartyDid: "did:web:x" },
        async (span) => {
          negTraceId = span.spanContext().traceId;
          // The wire profile is stamped by the caller from in here, because it is only known once the
          // counterparty's card has been read — see WIRE_PROFILE_ATTR.
          span.setAttribute(WIRE_PROFILE_ATTR, "meridian");
        },
      );
      outer.end();
    });

    assert.ok(outerTraceId && negTraceId, "both spans recorded a trace id");
    assert.notEqual(negTraceId, outerTraceId, "the negotiation span must start its own root trace, not nest under the active span");
  });
});
