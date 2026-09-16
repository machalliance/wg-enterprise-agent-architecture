import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadReferenceData } from "../lib/refdata.ts";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";
import { validateInstruction } from "../lib/validate.ts";

/**
 * The queue, as the repair desk sees it on opening.
 *
 * Returns the failure codes but deliberately NOT the screening state, the tier,
 * or any suggested value. The agent has to go and look — which is what produces
 * a trace that shows it looked.
 */
export default defineTool({
  description:
    "List every instruction in the outbound batch with its current validation status and ISO 20022 reject codes. Start here. Returns codes only — it does not tell you what to do about them.",
  inputSchema: z.object({
    onlyFailing: z
      .boolean()
      .default(true)
      .describe("When true, omit instructions that already pass validation."),
  }),
  async execute({ onlyFailing }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "list_repair_queue", { onlyFailing });
    if (refusal) return refusal;

    const ref = loadReferenceData();
    const rows = s.run.batch.instructions
      .map((instruction) => {
        const result = validateInstruction(instruction, ref);
        const held = (s.run.screeningFor(instruction.txId)?.state ?? "CLEAR") !== "CLEAR";
        return {
          txId: instruction.txId,
          endToEndId: instruction.endToEndId,
          scheme: instruction.scheme,
          amount: `${instruction.amount.value} ${instruction.amount.currency}`,
          creditor: instruction.creditor.name,
          txSts: result.txSts,
          codes: result.findings.map((f) => f.code),
          underScreeningHold: held,
          alreadyHandled: s.run.handled(instruction.txId),
        };
      })
      // `onlyFailing` never hides an instruction under a screening hold. One
      // that is clean on every field and still not releasable is exactly the
      // instruction a filtered queue would drop, and exactly the one that must
      // not be dropped.
      .filter((row) => (onlyFailing ? row.txSts === "RJCT" || row.underScreeningHold : true));

    return exitTool(s, "list_repair_queue", {
      ok: true,
      batchId: s.run.batch.batchId,
      valueDate: s.run.batch.valueDate,
      mode: s.run.mode,
      totalInstructions: s.run.batch.instructions.length,
      returned: rows.length,
      queue: rows,
    });
  },
});
