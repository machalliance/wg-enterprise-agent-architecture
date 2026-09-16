import { defineTool } from "eve/tools";
import { z } from "zod";
import { accountRun, enterTool, exitTool, finishRun, session } from "../lib/toolkit.ts";

/**
 * Termination, as an action the agent takes rather than something that happens
 * to it.
 *
 * An agent with no way to declare itself finished is an archetype 4 agent you did
 * not mean to build. The three arguments this tool accepts are the entire
 * terminal decision space — goal achieved, blocked, out of budget — and the tool
 * checks the claim rather than accepting it: calling GOAL_ACHIEVED while
 * instructions are still unaccounted for is refused, with the list of what is
 * outstanding.
 */
export default defineTool({
  description:
    "Close the run and write the outcome record. Termination must be one of GOAL_ACHIEVED (every instruction passes validation or has a reason code and a named owner), BLOCKED (work remains that needs a decision you cannot make), or BUDGET_EXHAUSTED (a ceiling was reached). The claim is verified before it is accepted.",
  inputSchema: z.object({
    termination: z.enum(["GOAL_ACHIEVED", "BLOCKED", "BUDGET_EXHAUSTED"]),
    narrative: z
      .string()
      .describe(
        "What you did, what you could not do, and why — written for the operator who picks this batch up next.",
      ),
  }),
  async execute({ termination, narrative }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "close_batch", { termination });
    if (refusal && termination !== "BUDGET_EXHAUSTED") return refusal;

    const { stillFailing, unaccounted } = accountRun(s.run);

    if (termination === "GOAL_ACHIEVED" && unaccounted.length > 0) {
      s.trail.append("refusal", s.run.steps, "close_batch refused: goal not achieved", {
        unaccounted,
      });
      return exitTool(s, "close_batch", {
        ok: false,
        refused: true,
        reason:
          "The success criterion is that every instruction either passes validation AND is screened clear, or carries a reason code and a named owner. These do neither. Note that an instruction which passes validation but sits under a screening state is not finished — passing validation and being releasable are different questions.",
        unaccounted,
        guidance:
          "Resolve or escalate each of these, or close with BLOCKED and say what is outstanding.",
      });
    }

    const { outcome, outcomePath } = finishRun(
      s,
      termination,
      narrative,
      stillFailing,
      "agent",
    );

    return exitTool(s, "close_batch", {
      ok: true,
      outcome,
      trail: s.trail.path,
      outcomeRecord: outcomePath,
      note: "Session may be released. Nothing in this agent persists past it.",
    });
  },
});
