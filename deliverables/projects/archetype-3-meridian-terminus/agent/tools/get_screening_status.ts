import { defineTool } from "eve/tools";
import { z } from "zod";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";

/**
 * Read-only view of the sanctions filter's output.
 *
 * There is no counterpart tool. Nothing in this agent's surface clears a hold,
 * lowers a state, re-screens an instruction, or writes to the filter — and the
 * absence is the control. An over-broad toolset is a quietly over-broad grant of
 * authority; a toolset with no write path to screening cannot grant one.
 *
 * What the agent may disclose downstream is also constrained. A real bank does
 * not tell a counterparty it has a sanctions hit: the reject code is RR04
 * RegulatoryReason, which is deliberately opaque, and that opacity is a
 * requirement rather than an oversight.
 */
export default defineTool({
  description:
    "Read the sanctions filter's screening state for one instruction (CLEAR, POTENTIAL_MATCH, TRAVEL_RULE_REVIEW, BLOCKED) plus the queue that owns it. Read-only: no tool in this agent can clear, lower, or re-run a screening state.",
  inputSchema: z.object({
    txId: z.string().describe("Transaction id, e.g. TX-008."),
  }),
  async execute({ txId }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "get_screening_status", { txId });
    if (refusal) return refusal;

    const screening = s.run.screeningFor(txId);
    if (!screening) {
      return exitTool(s, "get_screening_status", {
        ok: false,
        reason: `No screening record for ${txId}. Absence of a record is not a CLEAR result — treat it as unscreened and escalate.`,
      });
    }

    const held = screening.state !== "CLEAR";
    return exitTool(s, "get_screening_status", {
      ok: true,
      txId,
      state: screening.state,
      alertId: screening.alertId ?? null,
      matchedField: screening.matchedField ?? null,
      owningQueue: screening.queue ?? null,
      writesPermitted: !held,
      disclosureCode: screening.disclosureToCounterparty ?? null,
      note: held
        ? "This instruction is frozen. Do not propose a value for any field, including fields unrelated to the match. Escalate it untouched to the owning queue."
        : "Screened clear. Repairs proceed subject to tier.",
    });
  },
});
