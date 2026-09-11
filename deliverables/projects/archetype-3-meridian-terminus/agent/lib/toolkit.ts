/**
 * Shared preamble for every tool: resolve the run, count the call, write the
 * trail record, and refuse once the budget is spent.
 *
 * Putting the budget check in the tool layer rather than the prompt is the point.
 * An agent that is *asked* to stop after forty steps stops when it feels like it.
 * An agent whose tools start returning BUDGET_EXHAUSTED stops.
 */

import { runFor, type RunStore } from "./store.ts";
import { trailFor, type Trail } from "./trail.ts";

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
    };
  }
  s.trail.append("tool-call", s.run.steps, `${toolName}`, input);
  return null;
}

export function exitTool<T>(s: ToolSession, toolName: string, output: T): T {
  s.trail.append("tool-result", s.run.steps, `${toolName} returned`, output);
  return output;
}
