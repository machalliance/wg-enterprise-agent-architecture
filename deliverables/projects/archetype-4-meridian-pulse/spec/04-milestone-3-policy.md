# Milestone 3: Policy as the operating system

**Goal:** every proposed action passes through a policy layer before execution. The policy produces
one of four tier outcomes: **permit, notify, escalate, or deny**. Permission tiers are implemented as
real, evaluable rules, not just documentation.

**Why it matters:** without task-by-task human approval, the policies you define *are* the
supervision. They must be precise, enforceable, and auditable. The four tiers used here are
Autonomous (within ±5%), Notify (within ±5% to ±15%), Approve (beyond ±15% or flagged SKUs), and
Prohibited (below cost or across a compliance boundary).

---

## How the policy layer splits

Two things are doing policy work, at two layers, and the split matters for correctness:

- **AgentGateway (deterministic allow/deny).** A CEL policy on the gateway enforces the hard
  boundary that must never be crossed: deny below-cost prices, deny out-of-scope SKUs. A gateway CEL
  policy returns allow or deny, which is exactly what it is good at. This is the Tier 1 permit vs
  Tier 4 hard-block guardrail, and the agent cannot reason around it.
- **Policy service (`packages/policy`, tier classification).** The richer notify-vs-escalate routing
  runs in a small policy service in the request path. It classifies a permitted action into a tier
  and decides whether to execute silently, execute and notify, or hold for approval.

Both are "policy," but the gateway owns the unbypassable boundary and the service owns the routing.

---

## In scope
- AgentGateway CEL policy enforcing the deterministic allow/deny boundary.
- A policy service classifying permitted actions into the four tiers.
- The policy layer intercepts every `set_price` call and classifies it.
- An **escalation queue** (in-memory + file-backed) for Tier 3 actions.
- A simple **approval endpoint** that unblocks escalated actions.
- Tier 4 (prohibited) hard-blocks and logs, with no override path.

## Out of scope
- Circuit breakers and rate limiting (M5; these are *cumulative* guards, whereas M3 is per-action).
- Full dashboard UI (M6).

---

## The mandate (`seed/mandate.json`)

```jsonc
{
  "agent": "meridian-pulse:revenue-optimizer",
  "tiers": {
    "autonomous": {
      "maxPriceChangePct": 5,
      "categories": ["outdoor-tents", "hydration", "packs"],
      "requireVerified": true
    },
    "notify": {
      "maxPriceChangePct": 15,
      "notifyChannel": "merchandising-team",
      "categories": ["outdoor-tents", "hydration", "packs"]
    },
    "approve": {
      "description": "Beyond +/-15%, flagged SKUs, or premium categories",
      "flaggedSkus": ["MER-TENT-EXP", "MER-PACK-UL"],
      "premiumCategories": ["premium-footwear"]
    },
    "prohibited": {
      "rules": [
        "price < cost (below-cost selling)",
        "flagged_regulatory SKUs without legal review",
        "price change during active promotion without promo-manager approval"
      ]
    }
  },
  "costFloor": "per SKU from catalog.cost field"
}
```

## Tier classification (illustrative pseudo-CEL)

CEL is a single-expression language, so the classification below is shown as illustrative
pseudo-CEL for readability. In the build, the gateway enforces the `DENIED` cases as a boolean
allow/deny policy, and the policy service computes the notify/escalate tier.

```
// Tier classification for set_price calls
// Input: request.args.sku, request.args.newPrice, context.currentPrice, context.cost, context.category
// changePct = abs(newPrice - currentPrice) / currentPrice * 100

// Tier 4: PROHIBITED (gateway hard-block)
newPrice < context.cost                              -> "DENIED:BELOW_COST"
context.sku in mandate.flaggedSkus && !override      -> "DENIED:FLAGGED_SKU_NO_OVERRIDE"

// Tier 3: APPROVE (policy service escalates)
changePct > 15.0                                     -> "ESCALATE:EXCEEDS_15PCT"
context.category in mandate.approve.premiumCategories -> "ESCALATE:PREMIUM_CATEGORY"
context.sku in mandate.approve.flaggedSkus           -> "ESCALATE:FLAGGED_SKU"

// Tier 2: NOTIFY (policy service executes + notifies)
changePct > 5.0                                      -> "NOTIFY:EXCEEDS_5PCT"

// Tier 1: AUTONOMOUS (execute silently)
otherwise                                            -> "PERMIT"
```

## Build tasks

1. **AgentGateway allow/deny policy.** Load a CEL policy into AgentGateway, evaluated on every
   `set_price` tool call passing through the MCP gateway. It denies below-cost and out-of-scope
   calls outright:
   ```yaml
   # infra/agentgateway/policies.yaml
   policies:
     - name: pricing-hard-boundary
       match:
         tool: set_price
       evaluate: file://packages/policy/gateway-boundary.cel
       context:
         - source: mcp-server
           tool: get_current_price
           bind: context.currentPrice
         - source: mcp-server
           tool: get_margin
           bind: context.cost
         - source: catalog
           bind: context.category
   ```

2. **Context enrichment.** Before evaluating, the gateway calls `get_current_price` and `get_margin`
   for the context the policy needs. This ensures the policy evaluates against *current* state, not
   the agent's possibly-stale view.

3. **Policy service tier classification.** For calls the gateway permits, the policy service computes
   the tier (permit / notify / escalate) using the pseudo-CEL logic above.

4. **Escalation queue.** When the tier is `ESCALATE:*`, the action is held:
   ```ts
   // packages/policy/escalation-queue.ts
   interface EscalatedAction {
     id: string;
     timestamp: string;
     sku: string;
     proposedPrice: number;
     currentPrice: number;
     changePct: number;
     reason: string;      // from the agent's reasoning
     tierResult: string;  // e.g. "ESCALATE:EXCEEDS_15PCT"
     status: "pending" | "approved" | "rejected";
   }
   ```
   Persisted to `escalation-queue.jsonl`. Exposed via a REST endpoint for the dashboard (M6).

5. **Approval endpoint.** A simple HTTP endpoint the operator (or dashboard) calls:
   ```
   POST /escalations/:id/approve  -> executes the held set_price call
   POST /escalations/:id/reject   -> discards it, notifies the agent
   ```

6. **Agent observes policy results.** The agent sees the tool call result as one of:
   - Success (permitted or approved): observe outcome normally.
   - Escalated: "Your price change for SKU X is pending approval." Agent moves on.
   - Denied: "Price change denied: below cost." Agent adjusts reasoning.

7. **Notification path (Tier 2).** For `NOTIFY:*`, the action executes immediately but a
   notification is emitted (written to a notifications log / SSE stream for the dashboard).

---

## Acceptance criteria (demo checkpoint)
- [ ] A ±3% price change on an in-scope SKU executes **immediately** with no human involvement
      (Tier 1, PERMIT).
- [ ] A ±10% price change executes but a **notification** appears in the notify log (Tier 2, NOTIFY).
- [ ] A ±20% price change is **held** in the escalation queue; the commerce platform price is
      unchanged until the operator approves (Tier 3, ESCALATE).
- [ ] A price change below cost is **hard-blocked by the gateway**; no escalation path exists
      (Tier 4, DENIED).
- [ ] Approving an escalated action via the REST endpoint executes it; rejecting it discards it.
- [ ] The agent's next cycle reflects the policy outcome (does not re-propose a denied action;
      waits for an escalated one before proposing another change to the same SKU).

## Stretch
- Show the mandate is adjustable without redeploying: change `maxPriceChangePct` from 5 to 8 in the
  config, reload the policy, and the agent's next ±7% change now passes Tier 1 instead of Tier 2.
- Log every policy evaluation result with full context (input, rule matched, result); this feeds M4.
