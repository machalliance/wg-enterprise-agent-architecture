import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadReferenceData } from "../lib/refdata.ts";
import { classify } from "../lib/policy.ts";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";
import { validateInstruction } from "../lib/validate.ts";

/**
 * Ground truth. Runs the payment engine's validation gate against the
 * instruction as it currently stands and returns a pacs.002-shaped verdict.
 *
 * This is the tool that makes the loop a loop. The result is computed, not
 * remembered, so an agent that applied a repair and re-validates learns whether
 * the repair actually worked rather than whether it believes it worked.
 *
 * The response carries the disposition tier as well, because knowing that an
 * instruction is frozen is not something the agent should have to infer.
 */
export default defineTool({
  description:
    "Run the payment engine's validation gate on one instruction and return the ISO 20022 status (ACTC or RJCT), every finding with its ExternalStatusReason1Code, and the disposition tier that governs what may be done about it. Re-run this after any repair to confirm the outcome.",
  inputSchema: z.object({
    txId: z.string().describe("Transaction id, e.g. TX-002."),
  }),
  async execute({ txId }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "validate_instruction", { txId });
    if (refusal) return refusal;

    const instruction = s.run.instruction(txId);
    if (!instruction) {
      return exitTool(s, "validate_instruction", {
        ok: false,
        reason: `No instruction ${txId}.`,
      });
    }

    const ref = loadReferenceData();
    const result = validateInstruction(instruction, ref);
    const disposition = classify(
      instruction,
      result,
      s.run.screeningFor(txId),
      s.run.mandate,
    );

    return exitTool(s, "validate_instruction", {
      ok: true,
      txId,
      txSts: result.txSts,
      findings: result.findings,
      disposition: {
        tier: disposition.tier,
        rationale: disposition.rationale,
        owner: disposition.owner,
        frozen: disposition.frozen,
        control: s.run.mandate.tiers[disposition.tier]?.control ?? "unknown",
      },
    });
  },
});
