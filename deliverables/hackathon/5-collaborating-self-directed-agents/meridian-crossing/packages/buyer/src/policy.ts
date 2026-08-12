import type { CapabilityAd } from "@meridian/protocol";

/**
 * The buyer's PRIVATE discovery policy. Being findable in the directory is not the same as being
 * cleared to engage: the buyer applies its own allowlist/denylist over the results before it will
 * talk to anyone. This policy lives only in the buyer process and is never sent on the wire.
 *
 * Note: this is a coarse discovery gate (region, explicit denylist). It deliberately does NOT
 * verify a supplier's claimed identity or certifications — that is the identity layer — nor the commercial mandate
 * (reservation price, tiers) — that is the mandate.
 */
export interface DiscoveryPolicy {
  allowedRegions: string[];
  deniedDids: string[];
}

export const discoveryPolicy: DiscoveryPolicy = {
  allowedRegions: ["NA"],
  deniedDids: [],
};

export interface PolicyDecision {
  admitted: boolean;
  reason: string;
}

export function evaluate(ad: CapabilityAd, policy: DiscoveryPolicy = discoveryPolicy): PolicyDecision {
  if (policy.deniedDids.includes(ad.did)) {
    return { admitted: false, reason: `DID on denylist (${ad.did})` };
  }
  const regionOk = ad.regions.some((r) => policy.allowedRegions.includes(r));
  if (!regionOk) {
    return {
      admitted: false,
      reason: `no region in allowlist [${policy.allowedRegions.join(",")}] (has [${ad.regions.join(",")}])`,
    };
  }
  return { admitted: true, reason: `region ${ad.regions.join(",")} allowed; DID not denied` };
}
