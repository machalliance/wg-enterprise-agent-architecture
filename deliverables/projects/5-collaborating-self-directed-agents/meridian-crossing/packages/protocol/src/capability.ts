import { z } from "zod";

/**
 * A supplier's capability advertisement — the domain-level shape a supplier seeds and publishes.
 * This is Meridian Crossing's vocabulary, NOT the OASF wire format; see the mapping below.
 */
export const CapabilityAd = z.object({
  did: z.string(),
  // Counterparty-controlled. This name arrives on a SUPPLIER's directory advertisement and is then
  // written to buyer logs, to `trail.append` reasons, to the dashboard, and into the rival-quote context
  // the buyer's model reads. An unbounded `z.string()` let a supplier put newlines, ANSI escapes or
  // console format specifiers in its own name and forge lines in all four — a fabricated
  // "[buyer] payment ... captured" in the audit trail being the one that actually costs something.
  // Constrained HERE, at the single boundary every consumer parses through (`oasfRecordToCapability`
  // ends in `CapabilityAd.parse`), rather than escaping at each sink and hoping the next sink remembers.
  agentName: z
    .string()
    .min(1)
    .max(64)
    // `min(1)` plus the allowed-character class still admits `" "`, which renders as a blank supplier
    // name everywhere the name is displayed — an unattributable line in the audit trail.
    .regex(/\S/u, "agentName must contain at least one non-space character")
    .regex(/^[\p{L}\p{N} .,'&-]+$/u, "agentName may contain only letters, digits, spaces and . , ' & -"),
  product: z.string(),
  maxUnits: z.number().int().positive(),
  minLeadTimeDays: z.number().int().positive(),
  regions: z.array(z.string()).min(1),
  claims: z.object({
    onTimeDeliveryRate: z.number().min(0).max(1),
    iso9001: z.boolean(),
  }),
  a2aEndpoint: z.url(),
});
export type CapabilityAd = z.infer<typeof CapabilityAd>;

/**
 * The subset of an OASF record we depend on. The Directory validates the FULL record against the
 * public OASF schema; the buyer validates THIS against what comes back, so it never trusts the
 * directory's shape blindly. Domain facts live in `annotations` (the OASF-native, indexable place
 * for free-form key:value data) rather than in a bespoke field the schema would reject.
 */
export const OasfSkill = z.object({ name: z.string(), id: z.number() });
export const OasfRecord = z.object({
  name: z.string(),
  version: z.string(),
  schema_version: z.string(),
  description: z.string().optional(),
  authors: z.array(z.string()).optional(),
  created_at: z.string().optional(),
  skills: z.array(OasfSkill).optional(),
  annotations: z.record(z.string(), z.string()).default({}),
});
export type OasfRecord = z.infer<typeof OasfRecord>;

/** Annotation keys used to carry capability facts on the OASF record. */
export const ANNOTATION = {
  did: "did",
  agentName: "agent_name",
  product: "product",
  maxUnits: "max_units",
  minLeadTimeDays: "min_lead_time_days",
  regions: "regions",
  onTimeDeliveryRate: "on_time_delivery_rate",
  iso9001: "iso9001",
  a2aEndpoint: "a2a_endpoint",
  /** Declares that `skills[]` carries a taxonomy placeholder rather than a real capability claim — see
   *  PLACEHOLDER_SKILL. A consumer that reads `skills` learns something untrue about this agent, so the
   *  record says so in the record itself. A code comment is invisible to everyone reading the directory. */
  skillPlaceholder: "skill_placeholder",
} as const;

// OASF requires at least one skill from its taxonomy. Selling tents has no OASF skill, so we attach
// a valid taxonomy entry to satisfy schema validation; the real capability semantics are in the
// annotations above. Swap for a negotiation-specific skill if OASF ever adds one.
//
// This is the one place the repo puts a statement in a STANDARDS field that is not true of the agent:
// these suppliers do not generate text. The `skill_placeholder` annotation below is what keeps that
// disclosed on the record rather than only in this comment.
const PLACEHOLDER_SKILL: z.infer<typeof OasfSkill> = {
  name: "natural_language_processing/natural_language_generation/text_completion",
  id: 10201,
};

/** Build the OASF record `data` object (what gets wrapped as `{ data }` and pushed to the dir). */
export function capabilityToOasfData(ad: CapabilityAd): Record<string, unknown> {
  return {
    name: ad.agentName,
    version: "v1.0.0",
    schema_version: "0.8.0",
    description: `Selling agent for ${ad.product}`,
    authors: [ad.did],
    // A FIXED LITERAL, not `new Date()`, and it therefore does not state when this record was created —
    // the second field here that is untrue of the agent (see infra/VERSIONS.md). The Directory is
    // content-addressed, so a real timestamp gives the same advertisement a different CID on every boot,
    // and `publishCapability`'s idempotent re-publish — plus the "already exists" recovery that compares
    // WHOLE records to find the CID the directory holds — depends on these bytes being stable across runs.
    created_at: "2026-07-15T00:00:00Z",
    skills: [PLACEHOLDER_SKILL],
    annotations: {
      [ANNOTATION.did]: ad.did,
      [ANNOTATION.agentName]: ad.agentName,
      [ANNOTATION.product]: ad.product,
      [ANNOTATION.maxUnits]: String(ad.maxUnits),
      [ANNOTATION.minLeadTimeDays]: String(ad.minLeadTimeDays),
      // JSON (not a comma-join) so a region string containing a comma round-trips losslessly.
      [ANNOTATION.regions]: JSON.stringify(ad.regions),
      [ANNOTATION.onTimeDeliveryRate]: String(ad.claims.onTimeDeliveryRate),
      [ANNOTATION.iso9001]: String(ad.claims.iso9001),
      [ANNOTATION.a2aEndpoint]: ad.a2aEndpoint,
      [ANNOTATION.skillPlaceholder]: "true",
    },
  };
}

/** Recover a CapabilityAd from a validated OASF record's annotations. */
export function oasfRecordToCapability(record: OasfRecord): CapabilityAd {
  const a = record.annotations;
  const need = (key: string): string => {
    const v = a[key];
    if (v === undefined) throw new Error(`OASF record missing annotation '${key}'`);
    return v;
  };
  // The one annotation that is parsed rather than read. A raw SyntaxError from JSON.parse escapes the
  // descriptive contract every other field here honours ("missing annotation 'x'" / a zod issue), and
  // it reaches `discoverByProduct`, whose per-record catch prints it — so a malformed directory entry
  // reported "Unexpected token }" with no clue which annotation or record was at fault.
  const needJson = (key: string): unknown => {
    const raw = need(key);
    try {
      return JSON.parse(raw);
    } catch (err) {
      throw new Error(
        `OASF record annotation '${key}' is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  };
  return CapabilityAd.parse({
    did: need(ANNOTATION.did),
    agentName: need(ANNOTATION.agentName),
    product: need(ANNOTATION.product),
    maxUnits: Number(need(ANNOTATION.maxUnits)),
    minLeadTimeDays: Number(need(ANNOTATION.minLeadTimeDays)),
    regions: needJson(ANNOTATION.regions),
    claims: {
      onTimeDeliveryRate: Number(need(ANNOTATION.onTimeDeliveryRate)),
      iso9001: need(ANNOTATION.iso9001) === "true",
    },
    a2aEndpoint: need(ANNOTATION.a2aEndpoint),
  });
}

/** The annotation query string the buyer searches by (`product:three-season-tent`). */
export function productAnnotationQuery(product: string): string {
  return `${ANNOTATION.product}:${product}`;
}
