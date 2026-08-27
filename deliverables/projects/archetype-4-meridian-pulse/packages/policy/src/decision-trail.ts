/**
 * Decision trail (M4) — continuous accountability.
 *
 * Every set_price the policy server evaluates produces a structured, append-only
 * DecisionRecord capturing the full causal chain: what triggered it, the proposed
 * action, what policy decided, and what happened. Records are hash-chained
 * (each carries the prior record's hash) so tampering is detectable, and each can
 * reference prior decisions it builds on (causalPriorDecisions), enabling a
 * "why did this happen?" traversal.
 *
 * Post-action observations (how the change played out) are appended as SEPARATE
 * observation records referencing the original decision id — the trail is
 * append-only, never mutated in place.
 *
 * This lives in the policy server because that is the one place that sees the
 * proposal, the current-state context, the policy decision, and the execution
 * outcome together.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { Tier } from "./tiers.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_TRAIL_PATH = resolve(__dirname, "..", "decision-trail.jsonl");

export interface DecisionRecord {
  kind: "decision";
  id: string;
  cycleNumber: number | null;
  timestamp: string;
  priorRecordHash: string;

  trigger: {
    type: "market_signal" | "scheduled_review" | "self_correction";
    signal: Record<string, unknown>;
  };

  reasoning: {
    summary: string;
    causalPriorDecisions: string[]; // ids of prior decisions this builds on
  };

  proposedAction: {
    tool: string;
    args: Record<string, unknown>;
    changePct: number;
  };

  policyResult: {
    tier: Tier;
    rule: string;
    explanation: string;
    context: Record<string, unknown>;
  };

  outcome: {
    executed: boolean;
    resultPrice?: number;
    escalationId?: string;
    denialReason?: string;
  };

  hash: string;
}

export interface ObservationRecord {
  kind: "observation";
  id: string;
  timestamp: string;
  priorRecordHash: string;
  decisionId: string; // the decision this observes
  postObservation: {
    conversionChange?: number;
    revenueImpact?: number;
    competitorResponse?: string;
    note?: string;
  };
  hash: string;
}

/**
 * An anomaly the agent detected and chose NOT to act on — e.g. a competitor
 * price so implausible it is almost certainly bad data. This is the agent's own
 * judgment made durable and visible: unlike a declined action that vanishes into
 * the reasoning log, an anomaly record lands in the append-only trail (and, via
 * the control plane, on the operator dashboard). It is not tied to a prior
 * decision — the point is that NO price change happened.
 */
export interface AnomalyRecord {
  kind: "anomaly";
  id: string;
  cycleNumber: number | null;
  timestamp: string;
  priorRecordHash: string;
  sku: string;
  observation: string; // what the agent saw, e.g. "FeedX quotes 75% below normal across the catalog"
  suspectedCause: string; // why the agent thinks it is bad data, e.g. "feed error, not a real price move"
  actionTaken: string; // what the agent did instead, e.g. "ignored; did not reprice"
  hash: string;
}

type TrailRecord = DecisionRecord | ObservationRecord | AnomalyRecord;

/** Hash over the record's content minus its own hash field, plus the prior hash. */
function hashRecord(record: Omit<TrailRecord, "hash">): string {
  return createHash("sha256").update(JSON.stringify(record)).digest("hex");
}

export class DecisionTrail {
  private readonly path: string;

  constructor(path: string = process.env.DECISION_TRAIL_PATH || DEFAULT_TRAIL_PATH) {
    this.path = path;
  }

  private lastHash(): string {
    if (!existsSync(this.path)) return "genesis";
    const lines = readFileSync(this.path, "utf8").split("\n").filter(Boolean);
    if (lines.length === 0) return "genesis";
    try {
      const last = JSON.parse(lines[lines.length - 1]!) as TrailRecord;
      return last.hash;
    } catch {
      return "genesis";
    }
  }

  /** Append a decision record. Returns the stored record (with id + hash). */
  appendDecision(
    input: Omit<DecisionRecord, "kind" | "id" | "timestamp" | "priorRecordHash" | "hash">,
  ): DecisionRecord {
    const base = {
      kind: "decision" as const,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      priorRecordHash: this.lastHash(),
      ...input,
    };
    const hash = hashRecord(base);
    const record: DecisionRecord = { ...base, hash };
    appendFileSync(this.path, JSON.stringify(record) + "\n");
    return record;
  }

  /** Append an observation referencing a prior decision. */
  appendObservation(
    decisionId: string,
    postObservation: ObservationRecord["postObservation"],
  ): ObservationRecord {
    const base = {
      kind: "observation" as const,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      priorRecordHash: this.lastHash(),
      decisionId,
      postObservation,
    };
    const hash = hashRecord(base);
    const record: ObservationRecord = { ...base, hash };
    appendFileSync(this.path, JSON.stringify(record) + "\n");
    return record;
  }

  /**
   * Append an anomaly the agent flagged instead of acting on. Hash-chained like
   * every other record, so a "the agent caught bad data and stood down" event is
   * as tamper-evident and auditable as a price change.
   */
  appendAnomaly(
    input: Omit<AnomalyRecord, "kind" | "id" | "timestamp" | "priorRecordHash" | "hash">,
  ): AnomalyRecord {
    const base = {
      kind: "anomaly" as const,
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      priorRecordHash: this.lastHash(),
      ...input,
    };
    const hash = hashRecord(base);
    const record: AnomalyRecord = { ...base, hash };
    appendFileSync(this.path, JSON.stringify(record) + "\n");
    return record;
  }

  /** Read all records in order. */
  readAll(): TrailRecord[] {
    if (!existsSync(this.path)) return [];
    return readFileSync(this.path, "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l) as TrailRecord);
  }

  /**
   * Verify the hash chain. Recompute each record's hash from its content + the
   * prior record's stored hash; detect any tampering or reordering. Anchors at
   * "genesis" for the first record (the trail is not pruned, unlike checkpoints).
   */
  verifyChain(): { ok: boolean; brokenAtId: string | null } {
    const records = this.readAll();
    let expectedPrior = "genesis";
    for (const r of records) {
      if (r.priorRecordHash !== expectedPrior) return { ok: false, brokenAtId: r.id };
      const { hash, ...rest } = r;
      if (hashRecord(rest) !== hash) return { ok: false, brokenAtId: r.id };
      expectedPrior = hash;
    }
    return { ok: true, brokenAtId: null };
  }

  /** Trace a decision's causal ancestry back to its roots. */
  causalChain(decisionId: string): DecisionRecord[] {
    const byId = new Map<string, DecisionRecord>();
    for (const r of this.readAll()) {
      if (r.kind === "decision") byId.set(r.id, r);
    }
    const chain: DecisionRecord[] = [];
    const visit = (id: string): void => {
      const rec = byId.get(id);
      if (!rec || chain.some((c) => c.id === id)) return;
      chain.push(rec);
      for (const priorId of rec.reasoning.causalPriorDecisions) visit(priorId);
    };
    visit(decisionId);
    return chain;
  }
}
