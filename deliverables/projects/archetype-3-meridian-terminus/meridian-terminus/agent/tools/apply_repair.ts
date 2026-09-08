import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadReferenceData } from "../lib/refdata.ts";
import { candidateRepairs, classify, guardRepair, isScreeningRelevant } from "../lib/policy.ts";
import { projectField, readField } from "../lib/store.ts";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";
import { validateInstruction } from "../lib/validate.ts";
import type { RepairRecord } from "../lib/types.ts";

const input = z.object({
  txId: z.string().describe("Transaction id, e.g. TX-002."),
  field: z
    .string()
    .describe(
      "Dotted path of the field to change, e.g. creditorAgent.bicfi. Must appear in the mandate's repairable-field allow-list.",
    ),
  value: z.string().describe("The new value."),
  citation: z
    .string()
    .describe(
      "The reference-data entry or scheme rule that makes this the correct value. A repair with no citation is not deterministic and will be refused.",
    ),
});

/**
 * The only tool that writes.
 *
 * Three gates stand in front of it and they are not interchangeable:
 *
 *   1. `approval` — decided before execution. A frozen instruction is DENIED
 *      here, not escalated to a human. That distinction is deliberate: asking an
 *      operator "may I edit the name that matched the sanctions list?" frames a
 *      compliance stop as a permission question, and a tired operator at 16:55
 *      on a cut-off day is exactly who should never be offered that button.
 *
 *   2. `guardRepair` inside `execute` — the same function the approval policy
 *      called, so an approval obtained under one reading cannot be spent under
 *      another. It is called twice on purpose and it is one function on purpose.
 *
 *   3. Re-validation — the write is only useful if the engine agrees. The
 *      result is returned whether it improved or not, including the case where
 *      a repair resolved one finding and exposed another.
 *
 * In dry-run mode the write is computed and traced but not committed. That is
 * how the desk earns its write scope: you watch a run without it first.
 */
export default defineTool({
  description:
    "Apply one field repair to one instruction and re-validate it. Tier A repairs commit directly; Tier B repairs pause for a named human approver; instructions under any screening state are refused outright and cannot be repaired by this or any other tool.",
  inputSchema: input,

  approval: ({ session: evesession, toolInput }) => {
    const parsed = input.safeParse(toolInput);
    if (!parsed.success) return "user-approval";
    const s = session(evesession?.id);
    const instruction = s.run.instruction(parsed.data.txId);
    if (!instruction) return { type: "denied", reason: "Unknown instruction." };

    const ref = loadReferenceData();
    const validation = validateInstruction(instruction, ref);
    const screening = s.run.screeningFor(parsed.data.txId);
    const disposition = classify(instruction, validation, screening, s.run.mandate);
    const verdict = guardRepair(parsed.data.field, disposition, screening, s.run.mandate);

    if (!verdict.allowed) {
      return { type: "denied", reason: verdict.reason };
    }

    const candidates = candidateRepairs(instruction, validation, disposition, ref);
    const match = candidates.find(
      (c) => c.field === parsed.data.field && c.to === parsed.data.value,
    );

    // A value the agent invented is never Tier A, however plausible it looks.
    if (!match) {
      return "user-approval";
    }
    return match.tier === "A" ? "not-applicable" : "user-approval";
  },

  async execute({ txId, field, value, citation }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "apply_repair", { txId, field, value });
    if (refusal) return refusal;

    const instruction = s.run.instruction(txId);
    if (!instruction) {
      return exitTool(s, "apply_repair", { ok: false, reason: `No instruction ${txId}.` });
    }

    const ref = loadReferenceData();
    const before = validateInstruction(instruction, ref);
    const screening = s.run.screeningFor(txId);
    const disposition = classify(instruction, before, screening, s.run.mandate);
    const verdict = guardRepair(field, disposition, screening, s.run.mandate);

    if (!verdict.allowed) {
      s.trail.append("refusal", s.run.steps, `apply_repair refused on ${txId}.${field}`, {
        reason: verdict.reason,
        hardStop: verdict.hardStop,
        screeningState: screening?.state ?? "CLEAR",
      });
      return exitTool(s, "apply_repair", {
        ok: false,
        refused: true,
        hardStop: verdict.hardStop,
        reason: verdict.reason,
        guidance: verdict.hardStop
          ? `Do not attempt another field on ${txId}. Call escalate_to_desk with the instruction untouched and no proposal.`
          : "Choose a field inside the mandate's allow-list, or escalate.",
      });
    }

    if (citation.trim().length < 12) {
      return exitTool(s, "apply_repair", {
        ok: false,
        refused: true,
        hardStop: false,
        reason:
          "A repair must name the reference-data entry or scheme rule that makes this the correct value. Call lookup_reference_data first.",
      });
    }

    const candidates = candidateRepairs(instruction, before, disposition, ref);
    const match = candidates.find((c) => c.field === field && c.to === value);
    const tier = match?.tier ?? "B";

    const previous = readField(instruction, field);

    // Evaluate the outcome on a projection first, so a dry run reports whether
    // the repair WOULD have worked rather than merely that it was attempted.
    const after = validateInstruction(projectField(instruction, field, value), ref);
    s.run.writeField(txId, field, value);

    const record: RepairRecord = {
      txId,
      field,
      from: previous,
      to: value,
      citation,
      tier,
      appliedAt: new Date().toISOString(),
      approvedBy: tier === "A" ? null : "operator (via approval prompt)",
      mode: s.run.mode,
      revalidation: after.txSts,
    };
    s.run.recordRepair(record);

    return exitTool(s, "apply_repair", {
      ok: true,
      mode: s.run.mode,
      tier,
      applied: { txId, field, from: previous, to: value },
      screeningRelevantField: isScreeningRelevant(field, s.run.mandate),
      revalidation: {
        before: { txSts: before.txSts, codes: before.findings.map((f) => f.code) },
        after: { txSts: after.txSts, codes: after.findings.map((f) => f.code) },
        resolved: before.findings
          .map((f) => f.code)
          .filter((c) => !after.findings.some((f) => f.code === c)),
        remaining: after.findings,
      },
      note:
        s.run.mode === "dry-run"
          ? "DRY RUN — the change was evaluated and traced but not committed to the batch."
          : "Committed to the working copy of the batch.",
    });
  },
});
