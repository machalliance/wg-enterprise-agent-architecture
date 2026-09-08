import { defineTool } from "eve/tools";
import { z } from "zod";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";

/**
 * The full instruction as it currently stands in the working copy.
 *
 * "As it currently stands" matters: after a repair is applied this returns the
 * repaired value, so the agent's next read reflects its own last write.
 */
export default defineTool({
  description:
    "Read one payment instruction in full — creditor, account, agent, amount, charge bearer, purpose, remittance. Reflects any repair already applied in this run.",
  inputSchema: z.object({
    txId: z.string().describe("Transaction id, e.g. TX-004."),
  }),
  async execute({ txId }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "get_instruction", { txId });
    if (refusal) return refusal;

    const instruction = s.run.instruction(txId);
    if (!instruction) {
      return exitTool(s, "get_instruction", {
        ok: false,
        reason: `No instruction ${txId} in batch ${s.run.batch.batchId}.`,
      });
    }

    return exitTool(s, "get_instruction", {
      ok: true,
      instruction,
      batchContext: {
        batchId: s.run.batch.batchId,
        valueDate: s.run.batch.valueDate,
        debtor: s.run.batch.debtor.name,
        debtorAgent: s.run.batch.debtorAgent.bicfi,
      },
      repairsAppliedThisRun: s.run.repairs.filter((r) => r.txId === txId),
    });
  },
});
