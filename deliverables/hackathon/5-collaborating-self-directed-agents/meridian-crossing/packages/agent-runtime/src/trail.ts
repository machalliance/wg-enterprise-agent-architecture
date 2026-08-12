import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { EventHub } from "./events.js";

/**
 * A per-organization append-only JSONL trail. THE key constraint of this prototype: each process
 * owns exactly one of these and NEVER writes to another org's file. Accountability comes from
 * lining up two independent trails by correlationId after the fact — not from a shared log.
 */
export interface Trail {
  append(record: Record<string, unknown>): void;
}

/** Resolve `<repo>/trails/<name>` so every process writes to the same trails dir regardless of cwd. */
export function trailPath(name: string): string {
  return fileURLToPath(new URL(`../../../trails/${name}`, import.meta.url));
}

/**
 * Open a trail. When a `hub` is passed, every appended record is ALSO published to the org's
 * in-process event hub, so `GET /events` streams exactly what the org writes to disk — the SSE feed
 * and the on-disk trail are the same records, never a second, divergent source. Omit the hub and the
 * trail behaves exactly as before (the hubless `pnpm test` path is unchanged).
 */
export function openTrail(file: string, hub?: EventHub): Trail {
  mkdirSync(dirname(file), { recursive: true });
  return {
    append(record: Record<string, unknown>): void {
      const stamped = { at: new Date().toISOString(), ...record };
      appendFileSync(file, JSON.stringify(stamped) + "\n");
      hub?.publish(stamped);
    },
  };
}
