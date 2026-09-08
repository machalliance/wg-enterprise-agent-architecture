/**
 * Loads the seed corpus: the batch, the standing reference data, the screening
 * output and the mandate.
 *
 * Reference data is read once and treated as immutable for the life of the run.
 * A repair desk that re-reads a directory mid-run can justify two different
 * repairs with the same citation, and the trace stops being reconstructable.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import batchSeed from "../../seed/batch.json" with { type: "json" };
import mandateSeed from "../../seed/mandate.json" with { type: "json" };
import referenceSeed from "../../seed/reference-data.json" with { type: "json" };
import screeningSeed from "../../seed/screening.json" with { type: "json" };
import type { Batch, Screening } from "./types.ts";

const here = dirname(fileURLToPath(import.meta.url));

/** agent/lib -> agent -> project root. Trails stay on disk for local replay. */
export const projectRoot = process.env.VERCEL ? "/tmp" : join(here, "..", "..");
export const seedDir = join(projectRoot, "seed");
export const trailsDir = join(projectRoot, "trails");

export interface ReferenceData {
  ibanCountryLengths: Record<string, number>;
  currencyMinorUnits: Record<string, number>;
  chargeBearerRules: Record<string, { allowed: string[]; recommended: string }>;
  schemeRules: Record<
    string,
    { purposeCodeRequired: boolean; structuredAddressRequired: boolean }
  >;
  bicDirectory: Record<
    string,
    { institution: string; country: string; status: string }
  >;
  clearingSystemMembers: Record<
    string,
    { institution: string; country: string; status: string }
  >;
  accountRegistry: Record<
    string,
    { accountHolder: string; status: string; currencies: string[] }
  >;
  purposeCodes: Record<string, string>;
  statusReasonCodes: Record<string, string>;
}

export interface Mandate {
  mandateId: string;
  grantedBy: string;
  writeScope: {
    repairableFields: string[];
    neverRepairable: string[];
    maxInstructionValue: { value: string; currency: string };
  };
  screeningRelevantFields: { fields: string[] };
  tiers: Record<string, { label: string; control: string; requires: string }>;
  escalationQueues: Record<string, string>;
  budget: {
    maxSteps: number;
    maxToolCalls: number;
    maxRepairsPerRun: number;
    wallClockMs: number;
  };
  successCriteria: { definition: string; partialAllowed: boolean };
}

let refCache: ReferenceData | null = null;
let mandateCache: Mandate | null = null;

export function loadReferenceData(): ReferenceData {
  refCache ??= structuredClone(referenceSeed) as unknown as ReferenceData;
  return refCache;
}

export function loadMandate(): Mandate {
  mandateCache ??= structuredClone(mandateSeed) as unknown as Mandate;
  return mandateCache;
}

/** A fresh working copy every call — the store owns the mutable one. */
export function loadBatch(): Batch {
  return structuredClone(batchSeed) as unknown as Batch;
}

export function loadScreening(): Record<string, Screening> {
  return structuredClone(screeningSeed.instructions) as unknown as Record<string, Screening>;
}
