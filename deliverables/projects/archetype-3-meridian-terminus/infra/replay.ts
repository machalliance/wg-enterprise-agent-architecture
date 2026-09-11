/**
 * The deterministic replay.
 *
 * This is NOT the agent. It is the agent's tool and policy layer, driven by a
 * fixed operator that always makes the same choices in the same order — so the
 * run proves what the guardrails do, and proves nothing whatsoever about what a
 * model would decide. Those are different claims and it is worth being blunt
 * about which one you are watching.
 *
 * What it demonstrates, offline, with no API key:
 *   - the validation gate is computed, so a repair genuinely changes the verdict
 *   - Tier A repairs commit with a citation
 *   - Tier B repairs are proposed, never committed
 *   - Tier C instructions are refused by the tool even when the operator asks
 *     nicely, and travel to the desk with no proposed edit attached
 *   - the run terminates by declaring which of the three endings it reached
 *
 * Run it starved (`MAX_STEPS=4`) to see the third terminal branch.
 */

import { loadReferenceData } from "../agent/lib/refdata.ts";
import {
  accountFor,
  candidateRepairs,
  classify,
  guardRepair,
} from "../agent/lib/policy.ts";
import { RunStore, projectField, readField } from "../agent/lib/store.ts";
import { Trail } from "../agent/lib/trail.ts";
import { validateInstruction } from "../agent/lib/validate.ts";
import type { Termination } from "../agent/lib/types.ts";

const mode = process.env.REPAIR_MODE === "commit" ? "commit" : "dry-run";
const maxSteps = process.env.MAX_STEPS ? Number(process.env.MAX_STEPS) : undefined;
const runId = `replay-${Date.now()}`;

const run = new RunStore(mode, maxSteps ? { maxSteps } : undefined);
const trail = new Trail(runId);
const ref = loadReferenceData();

const log: string[] = [];
function say(line: string): void {
  log.push(line);
}

say(`Meridian Terminus — deterministic replay`);
say(`batch ${run.batch.batchId}  value date ${run.batch.valueDate}  mode ${mode}`);
say(`mandate ${run.mandate.mandateId}  step ceiling ${run.mandate.budget.maxSteps}`);
say("");

trail.append("goal", 0, "Replay opened", {
  batchId: run.batch.batchId,
  mode,
  budget: run.mandate.budget,
});

let termination: Termination = "GOAL_ACHIEVED";
let budgetNote = "";

outer: for (const instruction of run.batch.instructions) {
  // Each instruction costs one step. The ceiling is checked the way a tool
  // checks it, before doing the work rather than after.
  run.countStep();
  const budget = run.budgetState();
  if (budget.exhausted) {
    termination = "BUDGET_EXHAUSTED";
    budgetNote = budget.reason ?? "";
    say(`-- halted: ${budgetNote}`);
    trail.append("refusal", run.steps, `Halted: ${budgetNote}`);
    break outer;
  }

  run.countToolCall();
  const validation = validateInstruction(instruction, ref);
  const screening = run.screeningFor(instruction.txId);
  const disposition = classify(instruction, validation, screening, run.mandate);

  // Screening is consulted before the pass/fail shortcut, not after. TX-008 is
  // in the batch precisely to make that visible: it is clean on every field and
  // must still not be released.
  if (validation.txSts === "ACTC" && !disposition.frozen) {
    say(`${instruction.txId}  ACTC  passes, screened clear — untouched`);
    continue;
  }
  const codes = validation.findings.map((f) => f.code).join(",") || "clean";
  say(
    `${instruction.txId}  ${validation.txSts}  ${codes.padEnd(12)} tier ${disposition.tier}  screening ${
      screening?.state ?? "UNSCREENED"
    }${validation.txSts === "ACTC" ? "  <- clean on every field, still not releasable" : ""}`,
  );
  trail.append("reasoning", run.steps, `${instruction.txId} dispositioned tier ${disposition.tier}`, {
    codes: validation.findings.map((f) => f.code),
    rationale: disposition.rationale,
    screening: screening?.state ?? "UNSCREENED",
  });

  // Tier C: the operator deliberately ATTEMPTS a repair here, because a control
  // you never exercise is a control you are only assuming you have.
  if (disposition.tier === "C") {
    const probeField = "creditor.postalAddress";
    const verdict = guardRepair(probeField, disposition, screening, run.mandate);
    say(
      `        probe apply_repair(${probeField}) -> ${
        verdict.allowed ? "ALLOWED (!!)" : "REFUSED"
      }${verdict.hardStop ? " [hard stop]" : ""}`,
    );
    trail.append("refusal", run.steps, `Repair probe refused on ${instruction.txId}`, {
      field: probeField,
      reason: verdict.reason,
    });

    const candidates = candidateRepairs(instruction, validation, disposition, ref);
    say(`        candidates offered: ${candidates.length} (expected 0)`);

    run.recordEscalation({
      txId: instruction.txId,
      queue: screening?.queue ?? "SANCTIONS-L2",
      reasonCode: screening?.disclosureToCounterparty ?? "RR04",
      rationale: disposition.rationale,
      proposal: null,
      at: new Date().toISOString(),
    });
    say(
      `        -> ${screening?.queue ?? "SANCTIONS-L2"} as ${
        screening?.disclosureToCounterparty ?? "RR04"
      }, instruction untouched, no proposal`,
    );
    continue;
  }

  const candidates = candidateRepairs(instruction, validation, disposition, ref);
  let handled = false;

  for (const candidate of candidates) {
    run.countToolCall();
    const verdict = guardRepair(candidate.field, disposition, screening, run.mandate);
    if (!verdict.allowed) {
      say(`        ${candidate.field}: refused — ${verdict.reason}`);
      continue;
    }

    if (candidate.tier === "A") {
      const before = readField(instruction, candidate.field);
      const after = validateInstruction(
        projectField(instruction, candidate.field, candidate.to),
        ref,
      );
      run.writeField(instruction.txId, candidate.field, candidate.to);
      run.recordRepair({
        txId: instruction.txId,
        field: candidate.field,
        from: before,
        to: candidate.to,
        citation: candidate.citation,
        tier: "A",
        appliedAt: new Date().toISOString(),
        approvedBy: null,
        mode,
        revalidation: after.txSts,
      });
      say(
        `        REPAIR ${candidate.field}: ${before} -> ${candidate.to}   revalidates ${after.txSts}`,
      );
      say(`               cite: ${candidate.citation}`);
      trail.append("tool-result", run.steps, `Tier A repair applied to ${instruction.txId}`, {
        field: candidate.field,
        from: before,
        to: candidate.to,
        citation: candidate.citation,
        revalidation: after.txSts,
      });
      handled = true;
    } else {
      run.recordEscalation({
        txId: instruction.txId,
        queue: candidate.owner ?? disposition.owner ?? "PAYMENT-REPAIR-L1",
        reasonCode: validation.findings[0]?.code ?? "MS03",
        rationale: candidate.question ?? disposition.rationale,
        proposal: candidate,
        at: new Date().toISOString(),
      });
      say(
        `        PROPOSE ${candidate.field}: ${candidate.from} -> ${candidate.to}  (awaits ${
          candidate.owner ?? disposition.owner
        })`,
      );
      say(`               ask: ${candidate.question ?? "confirm"}`);
      trail.append("approval-requested", run.steps, `Tier B proposal on ${instruction.txId}`, candidate);
      handled = true;
    }
  }

  if (!handled) {
    run.recordEscalation({
      txId: instruction.txId,
      queue: disposition.owner ?? "PAYMENT-REPAIR-L1",
      reasonCode: validation.findings[0]?.code ?? "MS03",
      rationale:
        "No value follows deterministically from reference data and none can be responsibly proposed. " +
        disposition.rationale,
      proposal: null,
      at: new Date().toISOString(),
    });
    say(
      `        ESCALATE untouched -> ${disposition.owner} as ${validation.findings[0]?.code} (detection without a determinable value)`,
    );
  }
}

// Termination.
const accounting = accountFor(
  run.batch.instructions.map((i) => {
    const v = validateInstruction(i, ref);
    const d = classify(i, v, run.screeningFor(i.txId), run.mandate);
    return {
      txId: i.txId,
      passes: v.txSts === "ACTC",
      frozen: d.frozen,
      handled: run.handled(i.txId),
    };
  }),
);
const { stillFailing, unaccounted } = accounting;

if (termination !== "BUDGET_EXHAUSTED" && unaccounted.length > 0) {
  termination = "BLOCKED";
}

const narrative =
  termination === "GOAL_ACHIEVED"
    ? "Every instruction either passes validation and is screened clear, or carries a reason code and a named owner."
    : termination === "BUDGET_EXHAUSTED"
      ? `Halted before the batch was complete: ${budgetNote}. Unaccounted: ${unaccounted.join(", ") || "none"}.`
      : `Work remains that needs a decision the desk cannot make. Unaccounted: ${unaccounted.join(", ")}.`;

const outcome = run.close(termination, narrative, stillFailing);
trail.append("termination", run.steps, `Run closed: ${termination}`, outcome);

say("");
say(`termination      ${outcome.termination}`);
say(`steps            ${outcome.steps}   tool calls ${outcome.toolCalls}`);
say(`repaired         ${outcome.repaired.join(", ") || "none"}`);
say(`escalated        ${outcome.escalated.map((e) => `${e.txId}->${e.queue}(${e.reasonCode})`).join(", ") || "none"}`);
say(`still failing    ${outcome.stillFailing.join(", ") || "none"}`);
say(`untouched        ${outcome.untouched.join(", ") || "none"}`);
say(`trail            ${trail.path}`);
say("");
say(narrative);

console.log(log.join("\n"));
