/**
 * Run state: the working copy of the batch, the budget counters, and the record
 * of what was repaired, proposed and escalated.
 *
 * The budget counters are here rather than in the prompt because a ceiling the
 * model is asked to respect is not a ceiling. eve's own `limits` are
 * token-and-time shaped (`maxInputTokensPerSession`, `maxOutputTokensPerSession`,
 * `sessionTimeoutMs`) — there is no step cap in the framework — so the
 * iteration ceiling that gives this agent its third terminal branch is
 * application code. See docs/known-limitations.md.
 */

import { loadBatch, loadMandate, loadScreening, type Mandate } from "./refdata.ts";
import type {
  Batch,
  EscalationRecord,
  Instruction,
  Outcome,
  RepairRecord,
  Screening,
  Termination,
} from "./types.ts";

export type RunMode = "commit" | "dry-run";

/**
 * A copy of the instruction with one field set. Used to answer "would this
 * repair work?" without committing it — which is what makes dry-run mode worth
 * running. A dry run that could not tell you the outcome would only prove the
 * agent was willing to try.
 */
export function projectField(
  instruction: Instruction,
  field: string,
  value: string,
): Instruction {
  const copy = structuredClone(instruction);
  const path = field.split(".");
  let target: Record<string, unknown> = copy as unknown as Record<string, unknown>;
  for (const segment of path.slice(0, -1)) {
    const next = target[segment];
    if (typeof next !== "object" || next === null) {
      throw new Error(`Cannot project ${field}: ${segment} is not an object`);
    }
    target = next as Record<string, unknown>;
  }
  target[path[path.length - 1]] = value;
  return copy;
}

/** Read a dotted path off an instruction, as a string. */
export function readField(instruction: Instruction, field: string): string {
  const value = field
    .split(".")
    .reduce<unknown>((acc, key) => (acc as Record<string, unknown>)?.[key], instruction as unknown);
  return value === undefined || value === null ? "" : String(value);
}

export class RunStore {
  readonly startedAt = new Date().toISOString();
  readonly batch: Batch;
  readonly screening: Record<string, Screening>;
  readonly mandate: Mandate;
  readonly mode: RunMode;

  steps = 0;
  toolCalls = 0;
  readonly repairs: RepairRecord[] = [];
  readonly escalations: EscalationRecord[] = [];
  closed: Outcome | null = null;

  constructor(mode: RunMode, overrides?: { maxSteps?: number }) {
    this.batch = loadBatch();
    this.screening = loadScreening();
    const mandate = loadMandate();
    this.mandate = overrides?.maxSteps
      ? { ...mandate, budget: { ...mandate.budget, maxSteps: overrides.maxSteps } }
      : mandate;
    this.mode = mode;
  }

  instruction(txId: string): Instruction | undefined {
    return this.batch.instructions.find((i) => i.txId === txId);
  }

  screeningFor(txId: string): Screening | undefined {
    return this.screening[txId];
  }

  /** Called by the hook on every model step; the ceiling is checked by tools. */
  countStep(): void {
    this.steps += 1;
  }

  countToolCall(): void {
    this.toolCalls += 1;
  }

  budgetState(): { exhausted: boolean; reason: string | null } {
    const b = this.mandate.budget;
    if (this.steps > b.maxSteps) {
      return { exhausted: true, reason: `step ceiling of ${b.maxSteps} reached` };
    }
    if (this.toolCalls > b.maxToolCalls) {
      return { exhausted: true, reason: `tool-call ceiling of ${b.maxToolCalls} reached` };
    }
    if (this.repairs.length >= b.maxRepairsPerRun) {
      return { exhausted: true, reason: `repair ceiling of ${b.maxRepairsPerRun} reached` };
    }
    if (Date.now() - Date.parse(this.startedAt) > b.wallClockMs) {
      return { exhausted: true, reason: `wall-clock ceiling of ${b.wallClockMs}ms reached` };
    }
    return { exhausted: false, reason: null };
  }

  /**
   * Writes a field on the working copy. Callers are responsible for having
   * passed `guardRepair` first — this method is deliberately dumb, so that the
   * policy lives in exactly one place instead of two that can drift.
   */
  writeField(txId: string, field: string, value: string): void {
    if (this.mode === "dry-run") return;
    const instruction = this.instruction(txId);
    if (!instruction) throw new Error(`Unknown instruction ${txId}`);
    const path = field.split(".");
    let target: Record<string, unknown> = instruction as unknown as Record<string, unknown>;
    for (const segment of path.slice(0, -1)) {
      const next = target[segment];
      if (typeof next !== "object" || next === null) {
        throw new Error(`Cannot write ${field}: ${segment} is not an object`);
      }
      target = next as Record<string, unknown>;
    }
    target[path[path.length - 1]] = value;
  }

  recordRepair(record: RepairRecord): void {
    this.repairs.push(record);
  }

  recordEscalation(record: EscalationRecord): void {
    this.escalations.push(record);
  }

  handled(txId: string): boolean {
    return (
      this.repairs.some((r) => r.txId === txId) ||
      this.escalations.some((e) => e.txId === txId)
    );
  }

  close(termination: Termination, narrative: string, stillFailing: string[]): Outcome {
    const repaired = [...new Set(this.repairs.map((r) => r.txId))];
    const escalated = this.escalations.map((e) => ({
      txId: e.txId,
      queue: e.queue,
      reasonCode: e.reasonCode,
    }));
    const touched = new Set([...repaired, ...escalated.map((e) => e.txId)]);
    const outcome: Outcome = {
      batchId: this.batch.batchId,
      termination,
      startedAt: this.startedAt,
      endedAt: new Date().toISOString(),
      steps: this.steps,
      toolCalls: this.toolCalls,
      repaired,
      escalated,
      untouched: this.batch.instructions
        .map((i) => i.txId)
        .filter((id) => !touched.has(id)),
      stillFailing,
      narrative,
    };
    this.closed = outcome;
    return outcome;
  }
}

const runs = new Map<string, RunStore>();

export function runFor(sessionId: string, overrides?: { maxSteps?: number }): RunStore {
  let run = runs.get(sessionId);
  if (!run) {
    const mode: RunMode = process.env.REPAIR_MODE === "commit" ? "commit" : "dry-run";
    run = new RunStore(mode, overrides);
    runs.set(sessionId, run);
  }
  return run;
}

export function resetRuns(): void {
  runs.clear();
}
