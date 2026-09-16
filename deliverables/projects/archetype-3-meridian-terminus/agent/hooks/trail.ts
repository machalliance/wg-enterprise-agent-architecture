import { defineHook } from "eve/hooks";
import { accountRun, finishRun, session } from "../lib/toolkit.ts";

/**
 * The reasoning half of the trail.
 *
 * The tools already record what was called and what came back. This hook records
 * the part that makes those calls reviewable: the goal as it arrived, the model's
 * stated reasoning at each step, the moments a human was asked for something, and
 * how the run ended.
 *
 * Together they answer the question a reviewer actually has, which is never "did
 * the agent change this BIC" — the diff already says that — but "on what basis".
 *
 * Hooks are at-least-once and observe-only. A retried step re-emits its events
 * with fresh ids, so a trail can legitimately contain two attempts at the same
 * step. That is a property of the durable runtime, not a bug in the trail, and
 * pretending otherwise would make the record less true rather than tidier.
 */
export default defineHook({
  events: {
    async "session.started"(_event, ctx) {
      const s = session(ctx.session.id);
      s.trail.append("goal", 0, "Session opened for batch " + s.run.batch.batchId, {
        batchId: s.run.batch.batchId,
        valueDate: s.run.batch.valueDate,
        instructions: s.run.batch.instructions.length,
        mode: s.run.mode,
        mandate: s.run.mandate.mandateId,
        budget: s.run.mandate.budget,
      });
    },

    async "message.received"(event, ctx) {
      const s = session(ctx.session.id);
      const data = event.data as { text?: string } | undefined;
      s.trail.append("goal", s.run.steps, "Goal received", { text: data?.text ?? null });
    },

    async "step.started"(_event, ctx) {
      const s = session(ctx.session.id);
      s.run.countStep();
      const budget = s.run.budgetState();
      s.trail.append("reasoning", s.run.steps, `Step ${s.run.steps} began`, {
        toolCallsSoFar: s.run.toolCalls,
        repairsSoFar: s.run.repairs.length,
        escalationsSoFar: s.run.escalations.length,
        budgetExhausted: budget.exhausted,
      });
    },

    async "reasoning.completed"(event, ctx) {
      const s = session(ctx.session.id);
      const data = event.data as { text?: string } | undefined;
      if (!data?.text) return;
      s.trail.append("reasoning", s.run.steps, "Model reasoning", { text: data.text });
    },

    async "input.requested"(event, ctx) {
      const s = session(ctx.session.id);
      // Each request carries a `kind` — tool-approval, question, or
      // session-limit. Recording it distinguishes "a person was asked to approve
      // a repair" from "eve asked a person for more token budget", which read
      // identically in a trail that only stores the pause.
      s.trail.append("approval-requested", s.run.steps, "Run parked for a human", {
        requests: event.data.requests.map((r) => ({
          kind: r.kind,
          requestId: r.requestId,
          prompt: r.prompt,
          toolName: r.action?.toolName,
          toolInput: r.action?.input,
        })),
      });
    },

    async "input.resolved"(event, ctx) {
      const s = session(ctx.session.id);
      s.trail.append("approval-resolved", s.run.steps, "Human answered", {
        resolutions: [...event.data.resolutions],
      });
    },

    /**
     * The ending of last resort.
     *
     * Measured over 30 live runs, half of them ended here: the agent simply
     * stopped, leaving a batch with no outcome record and no declared terminal.
     * Recording that and moving on was the honest thing to do and the wrong
     * thing to ship — an operator inherits a batch either way, and one with no
     * outcome record is strictly worse than one closed from observed state.
     *
     * So the runtime closes it. The terminal is derived, never assumed:
     * BUDGET_EXHAUSTED if a ceiling was crossed, GOAL_ACHIEVED only when the
     * same completeness check `close_batch` applies finds nothing outstanding,
     * BLOCKED otherwise. `declaredBy: "runtime"` keeps this distinguishable
     * from a run the agent ended itself, which is a different event.
     */
    async "turn.completed"(_event, ctx) {
      const s = session(ctx.session.id);
      if (s.run.closed) return;

      const { stillFailing, unaccounted } = accountRun(s.run);
      const budget = s.run.budgetState();
      const termination = budget.exhausted
        ? "BUDGET_EXHAUSTED"
        : unaccounted.length === 0
          ? "GOAL_ACHIEVED"
          : "BLOCKED";

      s.trail.append(
        "refusal",
        s.run.steps,
        "Turn completed without close_batch — the run has not declared an ending.",
        { steps: s.run.steps, toolCalls: s.run.toolCalls, unaccounted },
      );

      finishRun(
        s,
        termination,
        budget.exhausted
          ? `Closed by the runtime: the turn ended without close_batch and the budget was spent (${budget.reason}). ${unaccounted.length} instruction(s) left unaccounted for.`
          : unaccounted.length === 0
            ? "Closed by the runtime: the turn ended without close_batch, but every instruction is accounted for."
            : `Closed by the runtime: the turn ended without close_batch with ${unaccounted.length} instruction(s) unaccounted for.`,
        stillFailing,
        "runtime",
      );
    },
  },
});
