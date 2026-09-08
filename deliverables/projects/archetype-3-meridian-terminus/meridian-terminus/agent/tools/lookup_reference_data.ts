import { defineTool } from "eve/tools";
import { z } from "zod";
import { loadReferenceData } from "../lib/refdata.ts";
import { candidateRepairs, classify } from "../lib/policy.ts";
import { enterTool, exitTool, session } from "../lib/toolkit.ts";
import { validateInstruction } from "../lib/validate.ts";

/**
 * The standing reference data, plus the candidate repairs that follow from it.
 *
 * A Tier A repair is only defensible if it can name the entry that justified it,
 * so every candidate this returns carries its citation. A candidate with no
 * citation is not returned at all — which is why a failed IBAN check digit
 * produces nothing here. Mod-97 detects the error; it does not locate it, and
 * a located digit is a guess about where the money goes.
 *
 * For an instruction under a screening state this returns no candidates, because
 * `candidateRepairs` returns an empty array before it inspects a finding.
 */
export default defineTool({
  description:
    "Look up the standing reference data for one instruction — IBAN registry lengths, the institution directory, ISO 4217 minor units, scheme charge-bearer rules, the account registry — and return the repair candidates that follow deterministically from it, each with the citation that justifies it and the tier that governs it. Returns no candidates when none can be justified.",
  inputSchema: z.object({
    txId: z.string().describe("Transaction id, e.g. TX-005."),
    include: z
      .array(z.enum(["bicDirectory", "accountRegistry", "chargeBearerRules", "currencyMinorUnits", "purposeCodes"]))
      .default([])
      .describe("Optional raw reference-data sections to return alongside the candidates."),
  }),
  async execute({ txId, include }, ctx) {
    const s = session(ctx.session?.id);
    const refusal = enterTool(s, "lookup_reference_data", { txId, include });
    if (refusal) return refusal;

    const instruction = s.run.instruction(txId);
    if (!instruction) {
      return exitTool(s, "lookup_reference_data", { ok: false, reason: `No instruction ${txId}.` });
    }

    const ref = loadReferenceData();
    const validation = validateInstruction(instruction, ref);
    const disposition = classify(instruction, validation, s.run.screeningFor(txId), s.run.mandate);
    const candidates = candidateRepairs(instruction, validation, disposition, ref);

    const sections: Record<string, unknown> = {};
    for (const key of include) sections[key] = ref[key];

    return exitTool(s, "lookup_reference_data", {
      ok: true,
      txId,
      tier: disposition.tier,
      frozen: disposition.frozen,
      candidates,
      candidatesWithoutRepair: validation.findings
        .filter((f) => !candidates.some((c) => c.field === f.field))
        .map((f) => ({
          code: f.code,
          field: f.field,
          why: "No value follows deterministically from reference data. This is a detection, not a repair.",
        })),
      sections,
    });
  },
});
