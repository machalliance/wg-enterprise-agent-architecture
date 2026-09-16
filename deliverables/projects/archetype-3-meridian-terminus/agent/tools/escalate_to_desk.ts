import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadReferenceData } from "../lib/refdata.ts";
import { classify } from "../lib/policy.ts";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";
import { validateInstruction } from "../lib/validate.ts";

/**
 * The "stuck" path — one of the three ways this agent is allowed to finish with
 * an instruction.
 *
 * Note what happens to `proposal` when the instruction is frozen: it is dropped,
 * with the drop recorded. An escalation that carried a suggested replacement for
 * a screened field would put the proposed edit in the case file, where a human
 * under time pressure could apply it — the control would have moved from the
 * architecture into someone's discipline. So the tool strips it rather than
 * trusting the caller not to have sent one.
 */
export default defineTool({
  description:
    "Hand one instruction to a named human queue with an ISO 20022 reason code and the reasoning behind it. Use this whenever the instruction needs judgement the desk does not have, or is under any screening state. For a screened instruction, send no proposal.",
  inputSchema: z.object({
    txId: z.string(),
    queue: z
      .enum(["PAYMENT-REPAIR-L1", "SANCTIONS-L2", "CLIENT-SERVICE", "TREASURY-OPS"])
      .describe("The queue that owns the decision."),
    reasonCode: z
      .string()
      .describe(
        "ExternalStatusReason1Code, 4 characters. For a screening state use the disclosure code the filter returned (RR04 or RR03) — never a code that reveals a sanctions match.",
      ),
    rationale: z
      .string()
      .describe("What you saw, what you concluded, and what the human is being asked to decide."),
    proposal: z
      .object({ field: z.string(), value: z.string(), citation: z.string() })
      .nullable()
      .default(null)
      .describe("An optional candidate value for a human to approve. Must be null for a screened instruction."),
  }),
  async execute({ txId, queue, reasonCode, rationale, proposal }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "escalate_to_desk", { txId, queue, reasonCode });
    if (refusal) return refusal;

    const instruction = s.run.instruction(txId);
    if (!instruction) {
      return exitTool(s, "escalate_to_desk", { ok: false, reason: `No instruction ${txId}.` });
    }

    const ref = loadReferenceData();
    const validation = validateInstruction(instruction, ref);
    const screening = s.run.screeningFor(txId);
    const disposition = classify(instruction, validation, screening, s.run.mandate);

    let carried = proposal;
    let stripped = false;
    if (disposition.frozen && proposal !== null) {
      carried = null;
      stripped = true;
      s.trail.append(
        "refusal",
        s.run.steps,
        `Proposal stripped from escalation of ${txId}`,
        {
          reason:
            "Instruction is under a screening state. A proposed edit may not travel with it, even to a human.",
          droppedField: proposal.field,
        },
      );
    }

    const routedQueue = disposition.frozen ? (screening?.queue ?? "SANCTIONS-L2") : queue;

    s.run.recordEscalation({
      txId,
      queue: routedQueue,
      reasonCode,
      rationale,
      proposal: carried === null ? null : { txId, from: "", to: carried.value, field: carried.field, citation: carried.citation },
      at: new Date().toISOString(),
    });

    return exitTool(s, "escalate_to_desk", {
      ok: true,
      txId,
      routedTo: routedQueue,
      queueRewritten: routedQueue !== queue,
      reasonCode,
      proposalCarried: carried !== null,
      proposalStripped: stripped,
      note: stripped
        ? "The instruction was routed with no proposed edit. A screened instruction travels untouched."
        : "Escalation recorded.",
      openFindings: validation.findings.map((f) => f.code),
    });
  },
});
