import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT_CONTEXT, SpanStatusCode, trace, type HrTime, type Span, type Tracer } from "@opentelemetry/api";
import { ExportResultCode, type ExportResult } from "@opentelemetry/core";
import { NodeSDK } from "@opentelemetry/sdk-node";
import {
  SimpleSpanProcessor,
  type ReadableSpan,
  type SpanExporter,
} from "@opentelemetry/sdk-trace-base";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";

/**
 * OpenTelemetry wiring. Enabled by `OTEL_ENABLED=1`. Two exporters, both real OTel `SpanExporter`s.
 *
 * ON THE ATTRIBUTE NAMES: these are AGNTCY-STYLE (`agntcy.*`), which is a naming convention and not
 * conformance to the published AGNTCY observability schema. Three documents used to claim the latter while
 * this file emitted three attributes of its own invention and not one GenAI semantic-convention attribute
 * — the kind of overclaim that costs more than the feature is worth in a repo whose whole value is that
 * its standards claims survive being checked. Adopting the real schema means mapping `gen_ai.*` and the
 * AGNTCY span names; until then the honest description is the one above.
 *
 *   - Default (offline, reproducible): a FILE exporter writing one JSON span per line to
 *     `OTEL_TRACES_FILE` (default `trails/otel-spans.jsonl`). No network, no collector, so the e2e
 *     test can assert "one trace per negotiation" directly against the file.
 *   - When `OTEL_EXPORTER_OTLP_ENDPOINT` is set: the OTLP/HTTP exporter, so the same spans stream to
 *     a real collector (Jaeger / the OpenTelemetry Collector / Grafana Tempo) for the live demo.
 *
 * A `SimpleSpanProcessor` exports on span-end so the file is complete without waiting for a batch
 * flush — the property the deterministic test relies on.
 */
let sdk: NodeSDK | undefined;

function defaultTracesFile(): string {
  return fileURLToPath(new URL("../../../trails/otel-spans.jsonl", import.meta.url));
}

/** An OTel HrTime `[seconds, nanoseconds]` as an exact decimal nanosecond string, per the OTLP schema. */
function hrTimeToNanoString(hr: HrTime): string {
  return (BigInt(hr[0]) * 1_000_000_000n + BigInt(hr[1])).toString();
}

/** A dependency-free OTel SpanExporter that appends each finished span as one JSON line. */
class FileSpanExporter implements SpanExporter {
  constructor(private readonly file: string) {
    mkdirSync(dirname(file), { recursive: true });
  }
  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    try {
      for (const s of spans) {
        const line = JSON.stringify({
          name: s.name,
          traceId: s.spanContext().traceId,
          spanId: s.spanContext().spanId,
          attributes: s.attributes,
          status: s.status,
          // `startTime`/`endTime` are OTel HrTime tuples — `[seconds, nanos]` — so writing them raw
          // emitted `"startTimeUnixNano": [1754…, …]`, an array under a field whose name and the OTLP
          // schema both promise a nanosecond scalar.
          //
          // Converted via BigInt rather than the `hrTimeToNanoseconds` helper: that returns a `number`,
          // and a nanosecond epoch is ~1.75e18, well past 2^53, so it silently rounds (…456789 came back
          // as …456800). OTLP specifies these fields as decimal STRINGS precisely because they do not
          // fit a float — so build the integer exactly, then render it.
          startTimeUnixNano: hrTimeToNanoString(s.startTime),
          endTimeUnixNano: hrTimeToNanoString(s.endTime),
        });
        appendFileSync(this.file, line + "\n");
      }
      resultCallback({ code: ExportResultCode.SUCCESS });
    } catch (error) {
      resultCallback({ code: ExportResultCode.FAILED, error: error as Error });
    }
  }
  async shutdown(): Promise<void> {}
  async forceFlush(): Promise<void> {}
}

function traceExporter(): SpanExporter {
  return process.env.OTEL_EXPORTER_OTLP_ENDPOINT
    ? new OTLPTraceExporter()
    : new FileSpanExporter(process.env.OTEL_TRACES_FILE ?? defaultTracesFile());
}

export function initTelemetry(serviceName: string): Tracer {
  if (process.env.OTEL_ENABLED === "1" && !sdk) {
    // Service name is conveyed via OTEL_SERVICE_NAME to stay compatible across sdk-node versions.
    //
    // An EMPTY value counts as unset. `??=` only fills in null/undefined, so `OTEL_SERVICE_NAME=` in a
    // .env file (or an export with no value) survived as "" and every span from every agent was emitted
    // with a blank service name — which is worse than the default, because the per-agent fallback is the
    // only thing distinguishing five agents' traces from each other.
    if (!process.env.OTEL_SERVICE_NAME) process.env.OTEL_SERVICE_NAME = serviceName;
    sdk = new NodeSDK({ spanProcessors: [new SimpleSpanProcessor(traceExporter())] });
    sdk.start();
  }
  return trace.getTracer(serviceName);
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
  sdk = undefined;
}

/**
 * The wire profile a negotiation actually spoke.
 *
 * Stamped by the CALLER from inside the span rather than passed in with the other attributes, because it
 * is not knowable when the span opens: the profile is agreed with the counterparty from its agent card
 * (`selectWireProfile`), and the card does not exist until the connect inside the negotiation. Taking it
 * up front meant taking this process's PREFERENCE and labelling the trace with it — which is the same
 * thing only for as long as nobody negotiates the profile.
 */
export const WIRE_PROFILE_ATTR = "agntcy.wire.profile" as const;

/**
 * Run one negotiation inside a single span, so the collector shows ONE trace per negotiationId
 * spanning discovery → verify → negotiate → terminal state. Attributes are `agntcy.*`-prefixed (see the
 * module docstring on what that does and does not claim); the caller adds `WIRE_PROFILE_ATTR` once the
 * counterparty's card has settled it. When OTEL is disabled the tracer is a no-op, so this is free in
 * the default reproducible run.
 */
export async function withNegotiationSpan<T>(
  tracer: Tracer,
  attrs: { negotiationId: string; counterpartyDid: string },
  fn: (span: Span) => Promise<T>,
): Promise<T> {
  // Start from ROOT_CONTEXT so this span is always a NEW root trace (one trace per negotiationId),
  // never a child of whatever context happens to be active when runNegotiation is called.
  return tracer.startActiveSpan("negotiation", {}, ROOT_CONTEXT, async (span: Span) => {
    span.setAttribute("agntcy.negotiation.id", attrs.negotiationId);
    span.setAttribute("agntcy.counterparty.did", attrs.counterpartyDid);
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (err) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: err instanceof Error ? err.message : String(err) });
      throw err;
    } finally {
      span.end();
    }
  });
}
