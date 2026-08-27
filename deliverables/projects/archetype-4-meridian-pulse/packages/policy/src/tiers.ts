/**
 * Tier classification — the heart of M3 "policy as the operating system".
 *
 * Every proposed set_price is classified into exactly one of four tiers. The
 * rules are real, evaluable code (not documentation), loaded from seed/mandate.json
 * so they can change without redeploying the agent. Precedence, highest first:
 *
 *   PROHIBITED (deny)   below cost; (extendable: active-promo without approval)
 *   ESCALATE  (approve) > mandate.approve.maxPriceChangePct, flagged SKU,
 *                         premium/other category outside write scope
 *   NOTIFY              > autonomous threshold but within notify threshold
 *   PERMIT (autonomous) small change within the autonomous band
 *
 * The classifier is pure: given the proposal + current state + mandate, it
 * returns a decision. The MCP server (index.ts) applies that decision.
 */

export type Tier = "PERMIT" | "NOTIFY" | "ESCALATE" | "DENIED";

export interface Mandate {
  agent: string;
  tiers: {
    autonomous: { maxPriceChangePct: number; categories: string[] };
    notify: { maxPriceChangePct: number; notifyChannel: string; categories: string[] };
    approve: { flaggedSkus: string[]; premiumCategories: string[] };
    prohibited: { rules: string[] };
  };
  writeScopeCategories: string[];
}

export interface PriceContext {
  sku: string;
  category: string;
  currentPrice: number;
  cost: number;
}

export interface Proposal {
  sku: string;
  newPrice: number;
  reason: string;
}

export interface PolicyDecision {
  tier: Tier;
  /** Machine-readable rule that matched, e.g. "DENIED:BELOW_COST". */
  rule: string;
  /** Human-readable explanation for the trail and the operator. */
  explanation: string;
  changePct: number;
  context: PriceContext;
}

export function changePercent(currentPrice: number, newPrice: number): number {
  if (currentPrice <= 0) return Infinity;
  return (Math.abs(newPrice - currentPrice) / currentPrice) * 100;
}

/**
 * Classify a proposed price change. Order matters: check the hard boundary
 * first, then escalation triggers, then notify, then default to autonomous.
 */
export function classify(
  proposal: Proposal,
  ctx: PriceContext,
  mandate: Mandate,
): PolicyDecision {
  const changePct = changePercent(ctx.currentPrice, proposal.newPrice);
  const base = { changePct: Number(changePct.toFixed(2)), context: ctx };

  // --- Tier 4: PROHIBITED (hard block, no override) ------------------------
  if (proposal.newPrice < ctx.cost) {
    return {
      tier: "DENIED",
      rule: "DENIED:BELOW_COST",
      explanation: `Proposed $${proposal.newPrice} is below cost $${ctx.cost} for ${ctx.sku}.`,
      ...base,
    };
  }

  // --- Tier 3: APPROVE (escalate, held for human) --------------------------
  // Out-of-write-scope category (e.g. premium-footwear MER-BOOT-GTX): the
  // argument-level block deferred from M1 lands here, where we can see the SKU.
  if (!mandate.writeScopeCategories.includes(ctx.category)) {
    return {
      tier: "ESCALATE",
      rule: "ESCALATE:OUT_OF_SCOPE_CATEGORY",
      explanation: `${ctx.sku} is in '${ctx.category}', outside the agent's write scope; requires approval.`,
      ...base,
    };
  }
  if (mandate.tiers.approve.premiumCategories.includes(ctx.category)) {
    return {
      tier: "ESCALATE",
      rule: "ESCALATE:PREMIUM_CATEGORY",
      explanation: `${ctx.sku} is in premium category '${ctx.category}'; requires approval.`,
      ...base,
    };
  }
  if (mandate.tiers.approve.flaggedSkus.includes(ctx.sku)) {
    return {
      tier: "ESCALATE",
      rule: "ESCALATE:FLAGGED_SKU",
      explanation: `${ctx.sku} is a flagged SKU; requires approval.`,
      ...base,
    };
  }
  if (changePct > mandate.tiers.notify.maxPriceChangePct) {
    return {
      tier: "ESCALATE",
      rule: "ESCALATE:EXCEEDS_NOTIFY_THRESHOLD",
      explanation: `Change of ${base.changePct}% exceeds the ${mandate.tiers.notify.maxPriceChangePct}% threshold; requires approval.`,
      ...base,
    };
  }

  // --- Tier 2: NOTIFY (execute + notify) -----------------------------------
  if (changePct > mandate.tiers.autonomous.maxPriceChangePct) {
    return {
      tier: "NOTIFY",
      rule: "NOTIFY:EXCEEDS_AUTONOMOUS_THRESHOLD",
      explanation: `Change of ${base.changePct}% exceeds the ${mandate.tiers.autonomous.maxPriceChangePct}% autonomous band; executed with notification to ${mandate.tiers.notify.notifyChannel}.`,
      ...base,
    };
  }

  // --- Tier 1: PERMIT (autonomous) -----------------------------------------
  return {
    tier: "PERMIT",
    rule: "PERMIT:WITHIN_AUTONOMOUS_BAND",
    explanation: `Change of ${base.changePct}% is within the ${mandate.tiers.autonomous.maxPriceChangePct}% autonomous band.`,
    ...base,
  };
}
