/**
 * The reasoning trail.
 *
 * Archetype 2 needed a decision record for one routing choice. Archetype 3 needs the
 * whole sequence: each step, the rationale behind it, the tool call it produced,
 * the result that came back, and the reason the run stopped. Without that, an
 * autonomous run is unreviewable — you can see that the agent changed a
 * creditor's BIC, but not that it changed it because the supplied value was
 * eight characters and ISO 9362 expands a head-office BIC with XXX.
 *
 * Records are hash-chained so a reviewer can tell whether they are reading the
 * whole run. The chain is per-run and self-contained; it proves the file has not
 * been edited after the fact, not that the file is the only file.
 */

import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { trailsDir } from "./refdata.ts";

export interface TrailRecord {
  seq: number;
  at: string;
  /** Which step of the agent loop this belongs to. */
  step: number;
  kind:
    | "goal"
    | "reasoning"
    | "tool-call"
    | "tool-result"
    | "approval-requested"
    | "approval-resolved"
    | "refusal"
    | "termination";
  summary: string;
  detail?: unknown;
  prevHash: string;
  hash: string;
}

const GENESIS = "0".repeat(64);

function hashOf(record: Omit<TrailRecord, "hash">): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        seq: record.seq,
        at: record.at,
        step: record.step,
        kind: record.kind,
        summary: record.summary,
        detail: record.detail ?? null,
        prevHash: record.prevHash,
      }),
    )
    .digest("hex");
}

export class Trail {
  private seq = 0;
  private prevHash = GENESIS;
  readonly path: string;
  readonly records: TrailRecord[] = [];

  constructor(runId: string, persist = process.env.TERMINUS_TRAIL !== "off") {
    this.path = join(trailsDir, `${runId}.jsonl`);
    this.persist = persist;
    if (this.persist) mkdirSync(trailsDir, { recursive: true });
  }

  private persist: boolean;

  append(
    kind: TrailRecord["kind"],
    step: number,
    summary: string,
    detail?: unknown,
  ): TrailRecord {
    this.seq += 1;
    const base = {
      seq: this.seq,
      at: new Date().toISOString(),
      step,
      kind,
      summary,
      detail,
      prevHash: this.prevHash,
    };
    const record: TrailRecord = { ...base, hash: hashOf(base) };
    this.prevHash = record.hash;
    this.records.push(record);
    if (this.persist) {
      appendFileSync(this.path, `${JSON.stringify(record)}\n`, "utf8");
    }
    return record;
  }
}

/** Verify a trail file end to end. Returns the first break, or null. */
export function verifyTrail(path: string): { ok: boolean; brokenAt: number | null } {
  if (!existsSync(path)) return { ok: false, brokenAt: 0 };
  const lines = readFileSync(path, "utf8").trim().split("\n").filter(Boolean);
  let prev = GENESIS;
  for (const line of lines) {
    const record = JSON.parse(line) as TrailRecord;
    if (record.prevHash !== prev) return { ok: false, brokenAt: record.seq };
    const { hash, ...rest } = record;
    if (hashOf(rest) !== hash) return { ok: false, brokenAt: record.seq };
    prev = hash;
  }
  return { ok: true, brokenAt: null };
}

const trails = new Map<string, Trail>();

export function trailFor(
  runId: string,
  // Defaults to the constructor's rule rather than a literal `true`, so that
  // TERMINUS_TRAIL=off reaches trails created through the tool preamble too.
  // A test suite that quietly writes nineteen fixture trails into trails/ is a
  // suite whose artefacts a reviewer cannot tell from real runs.
  persist = process.env.TERMINUS_TRAIL !== "off",
): Trail {
  let trail = trails.get(runId);
  if (!trail) {
    trail = new Trail(runId, persist);
    trails.set(runId, trail);
  }
  return trail;
}

export function resetTrails(): void {
  trails.clear();
}
