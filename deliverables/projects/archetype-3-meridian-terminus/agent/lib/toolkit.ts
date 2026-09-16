/**
 * Shared preamble for every tool: resolve the run, count the call, write the
 * trail record, and refuse once the budget is spent.
 *
 * Putting the budget check in the tool layer rather than the prompt is the point.
 * An agent that is *asked* to stop after forty steps stops when it feels like it.
 * An agent whose tools start returning BUDGET_EXHAUSTED stops.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { accountFor, classify, type Accounting } from "./policy.ts";
import { loadReferenceData, trailsDir } from "./refdata.ts";
import { runFor, type RunStore } from "./store.ts";
import { trailFor, type Trail } from "./trail.ts";
import type { Outcome, Termination } from "./types.ts";
import { validateInstruction } from "./validate.ts";

export interface ToolSession {
  run: RunStore;
  trail: Trail;
  runId: string;
}

export function session(sessionId: string | undefined): ToolSession {
  const runId = sessionId ?? "local";
  return { run: runFor(runId), trail: trailFor(runId), runId };
}

export interface BudgetRefusal {
  ok: false;
  terminal: "BUDGET_EXHAUSTED";
  reason: string;
  guidance: string;
  outstanding: string[];
}

/**
 * The completeness question, asked in one place.
 *
 * `close_batch` needs it to verify a GOAL_ACHIEVED claim, the budget refusal
 * needs it to name what is left, and the runtime close needs it to pick a
 * terminal. Three callers, one answer.
 */
export function accountRun(run: RunStore): Accounting {
  const ref = loadReferenceData();
  return accountFor(
    run.batch.instructions.map((instruction) => {
      const result = validateInstruction(instruction, ref);
      const disposition = classify(
        instruction,
        result,
        run.screeningFor(instruction.txId),
        run.mandate,
      );
      return {
        txId: instruction.txId,
        passes: result.txSts === "ACTC",
        frozen: disposition.frozen,
        handled: run.handled(instruction.txId),
      };
    }),
  );
}

export interface FinishedRun {
  outcome: Outcome;
  outcomePath: string | null;
}

/**
 * Writes the ending: outcome record, trail entry, run closed.
 *
 * Shared by `close_batch` and by the runtime fallback in `agent/hooks/trail.ts`,
 * so a run the agent ended and a run the runtime ended produce the same artefact
 * and differ only in `declaredBy`.
 */
export function finishRun(
  s: ToolSession,
  termination: Termination,
  narrative: string,
  stillFailing: string[],
  declaredBy: Outcome["declaredBy"],
): FinishedRun {
  const outcome = s.run.close(termination, narrative, stillFailing, declaredBy);
  const persist = process.env.TERMINUS_TRAIL !== "off";
  const outcomePath = join(trailsDir, `${s.runId}.outcome.json`);
  if (persist) {
    mkdirSync(trailsDir, { recursive: true });
    writeFileSync(outcomePath, `${JSON.stringify(outcome, null, 2)}\n`, "utf8");
  }
  s.trail.append("termination", s.run.steps, `Run closed: ${termination}`, outcome);
  return { outcome, outcomePath: persist ? outcomePath : null };
}

/**
 * Called at the top of every tool that does work. Returns a refusal object the
 * tool should return verbatim to the model, or null to proceed.
 */
export function enterTool(
  s: ToolSession,
  toolName: string,
  input: unknown,
): BudgetRefusal | null {
  s.run.countToolCall();
  const budget = s.run.budgetState();
  if (budget.exhausted) {
    s.trail.append("refusal", s.run.steps, `${toolName} refused: ${budget.reason}`, {
      toolName,
      input,
    });
    return {
      ok: false,
      terminal: "BUDGET_EXHAUSTED",
      reason: `Run budget exhausted — ${budget.reason}.`,
      guidance:
        "Stop calling tools. Call close_batch with termination BUDGET_EXHAUSTED, report what was completed, and name the instructions that remain.",
      outstanding: accountRun(s.run).unaccounted,
    };
  }
  s.trail.append("tool-call", s.run.steps, `${toolName}`, input);
  return null;
}

export function exitTool<T>(s: ToolSession, toolName: string, output: T): T {
  s.trail.append("tool-result", s.run.steps, `${toolName} returned`, output);
  return output;
}
