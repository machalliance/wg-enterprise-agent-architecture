/**
 * Durable checkpoint store for the agent (M2).
 *
 * Goose already keeps session continuity via `--resume`. This module adds what
 * the archetype actually needs on top of that: an explicit, inspectable,
 * tamper-evident record of the agent's accumulated state, so the agent can
 * resume from a known-good point after a crash or kill, and an operator can
 * verify the state was not altered.
 *
 * Two memories are kept distinct (the spec's point):
 *   - working memory     short-term, overwritten each checkpoint (in-flight actions,
 *                        recent observations, current cycle)
 *   - long-term context  accumulated, grows over time (learned patterns, baselines)
 *
 * Integrity: each row stores a SHA-256 `hash` computed over its own content PLUS
 * the prior row's hash. Tampering with any historical row breaks the chain from
 * that point forward, which `verifyChain()` detects.
 */

import { DatabaseSync } from "node:sqlite";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = resolve(__dirname, "..", "checkpoint.db");
const RETENTION = Number(process.env.CHECKPOINT_RETENTION ?? "50");

export interface InFlightAction {
  sku: string;
  proposedPrice: number;
  awaitingOutcome: boolean;
}

export interface Observation {
  cycle: number;
  sku: string;
  action: string;
  outcome: string;
}

export interface WorkingMemory {
  currentCycle: number;
  inFlightActions: InFlightAction[];
  recentObservations: Observation[];
}

export interface LearnedPattern {
  pattern: string;
  confidence: number;
  since: string;
}

export interface LongTermContext {
  learnedPatterns: LearnedPattern[];
  categoryBaselines: Record<string, { avgMargin: number; avgAdjustmentsPerDay: number }>;
}

export interface ActiveSku {
  sku: string;
  lastAction: string;
  lastPrice: number;
  updatedCycle: number;
}

export interface AgentState {
  workingMemory: WorkingMemory;
  longTermContext: LongTermContext;
  activeSkus: ActiveSku[];
}

export interface CheckpointRow extends AgentState {
  id: number;
  cycleNumber: number;
  createdAt: string;
  priorHash: string;
  hash: string;
}

/** The state a fresh agent starts from when there is no prior checkpoint. */
export function initialState(): AgentState {
  return {
    workingMemory: { currentCycle: 0, inFlightActions: [], recentObservations: [] },
    longTermContext: { learnedPatterns: [], categoryBaselines: {} },
    activeSkus: [],
  };
}

/** Deterministic hash over the checkpoint payload + the prior row's hash. */
function computeHash(
  cycleNumber: number,
  createdAt: string,
  state: AgentState,
  priorHash: string,
): string {
  const canonical = JSON.stringify({
    cycleNumber,
    createdAt,
    workingMemory: state.workingMemory,
    longTermContext: state.longTermContext,
    activeSkus: state.activeSkus,
    priorHash,
  });
  return createHash("sha256").update(canonical).digest("hex");
}

export class CheckpointStore {
  private readonly db: DatabaseSync;

  constructor(dbPath: string = process.env.AGENT_CHECKPOINT_DB || DEFAULT_DB_PATH) {
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS checkpoints (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        cycle_number      INTEGER NOT NULL,
        created_at        TEXT NOT NULL,
        working_memory    TEXT NOT NULL,
        long_term_context TEXT NOT NULL,
        active_skus       TEXT NOT NULL,
        prior_hash        TEXT NOT NULL,
        hash              TEXT NOT NULL
      );
    `);
  }

  /** Hash of the most recent checkpoint, or the genesis sentinel if none. */
  private lastHash(): string {
    const row = this.db
      .prepare("SELECT hash FROM checkpoints ORDER BY id DESC LIMIT 1")
      .get() as { hash: string } | undefined;
    return row?.hash ?? "genesis";
  }

  /** Persist a checkpoint at a cycle boundary. Returns the stored row. */
  save(cycleNumber: number, state: AgentState): CheckpointRow {
    const createdAt = new Date().toISOString();
    const priorHash = this.lastHash();
    const hash = computeHash(cycleNumber, createdAt, state, priorHash);

    this.db
      .prepare(
        `INSERT INTO checkpoints
           (cycle_number, created_at, working_memory, long_term_context, active_skus, prior_hash, hash)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        cycleNumber,
        createdAt,
        JSON.stringify(state.workingMemory),
        JSON.stringify(state.longTermContext),
        JSON.stringify(state.activeSkus),
        priorHash,
        hash,
      );

    this.prune();
    return {
      id: 0,
      cycleNumber,
      createdAt,
      priorHash,
      hash,
      ...state,
    };
  }

  /** Load the latest checkpoint to resume from, or null for a cold start. */
  loadLatest(): CheckpointRow | null {
    const row = this.db
      .prepare(
        `SELECT id, cycle_number AS cycleNumber, created_at AS createdAt,
                working_memory AS wm, long_term_context AS ltc, active_skus AS asku,
                prior_hash AS priorHash, hash
         FROM checkpoints ORDER BY id DESC LIMIT 1`,
      )
      .get() as
      | {
          id: number;
          cycleNumber: number;
          createdAt: string;
          wm: string;
          ltc: string;
          asku: string;
          priorHash: string;
          hash: string;
        }
      | undefined;
    if (!row) return null;
    return {
      id: row.id,
      cycleNumber: row.cycleNumber,
      createdAt: row.createdAt,
      priorHash: row.priorHash,
      hash: row.hash,
      workingMemory: JSON.parse(row.wm) as WorkingMemory,
      longTermContext: JSON.parse(row.ltc) as LongTermContext,
      activeSkus: JSON.parse(row.asku) as ActiveSku[],
    };
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM checkpoints").get() as { n: number };
    return row.n;
  }

  /**
   * Verify the hash chain end to end. Returns the id of the first broken row, or
   * null if the whole chain is intact. Recomputes each row's hash from its stored
   * content + the prior row's stored hash; any mismatch means tampering.
   *
   * Two things are checked per row:
   *   1. Each row's recomputed hash matches its stored hash (content integrity).
   *   2. Each row's prior_hash matches the immediately preceding surviving row's
   *      stored hash (linkage integrity).
   * The very first surviving row's prior_hash is NOT required to be "genesis":
   * retention pruning legitimately removes early rows, so we anchor the chain at
   * whatever the oldest surviving row is and verify forward from there. This
   * still detects any tampering with a retained row or reordering of the chain.
   */
  verifyChain(): { ok: boolean; brokenAtId: number | null } {
    const rows = this.db
      .prepare(
        `SELECT id, cycle_number AS cycleNumber, created_at AS createdAt,
                working_memory AS wm, long_term_context AS ltc, active_skus AS asku,
                prior_hash AS priorHash, hash
         FROM checkpoints ORDER BY id ASC`,
      )
      .all() as {
      id: number;
      cycleNumber: number;
      createdAt: string;
      wm: string;
      ltc: string;
      asku: string;
      priorHash: string;
      hash: string;
    }[];

    let expectedPrior: string | null = null; // null = don't check linkage on first row
    for (const r of rows) {
      // Linkage: after the first surviving row, prior_hash must equal the
      // preceding surviving row's stored hash.
      if (expectedPrior !== null && r.priorHash !== expectedPrior) {
        return { ok: false, brokenAtId: r.id };
      }
      // Content: recomputed hash must match the stored hash.
      const recomputed = computeHash(
        r.cycleNumber,
        r.createdAt,
        {
          workingMemory: JSON.parse(r.wm) as WorkingMemory,
          longTermContext: JSON.parse(r.ltc) as LongTermContext,
          activeSkus: JSON.parse(r.asku) as ActiveSku[],
        },
        r.priorHash,
      );
      if (recomputed !== r.hash) return { ok: false, brokenAtId: r.id };
      expectedPrior = r.hash;
    }
    return { ok: true, brokenAtId: null };
  }

  /** Keep the most recent RETENTION rows; drop older ones. */
  private prune(): void {
    if (RETENTION <= 0) return;
    this.db
      .prepare(
        `DELETE FROM checkpoints
         WHERE id <= (
           SELECT id FROM checkpoints ORDER BY id DESC LIMIT 1 OFFSET ?
         )`,
      )
      .run(RETENTION);
  }

  close(): void {
    this.db.close();
  }
}
