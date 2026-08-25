# Milestone 4: Continuous accountability (decision trail)

**Goal:** every decision is reconstructable after the fact: what the agent observed, why it acted, what
policy check it passed, and what happened next. The trail is structured, append-only, queryable, and
tamper-evident.

**Why it matters:** you cannot review decisions in a post-mortem if you cannot reconstruct why the
agent took action X at time T. Decision trails must be first-class infrastructure, not afterthought
logging, and causal chains must preserve the links between decisions.

**AAIF component:** **AgentGateway OpenTelemetry** integration emitting spans for every tool call and
policy evaluation, plus structured decision records in an append-only store.

---

## In scope
- **Structured decision records** capturing the full chain: trigger, reasoning, action, policy,
  outcome, observation.
- **OpenTelemetry spans** on every tool call and policy evaluation via AgentGateway.
- **Append-only, hash-chained store** (JSONL with integrity hashes).
- **Causal chains** linking decisions that build on prior decisions.
- **Queryable** trail so an operator can ask "show me every pricing decision for outdoor-tents in the
  last 20 cycles where margin impact exceeded 2%."

## Out of scope
- Dashboard visualization of the trail (M6).
- External OTel collector / Jaeger (use local file export for the prototype).

---

## Build tasks

1. **Decision record schema:**
   ```ts
   // packages/agent/src/decision-trail.ts
   interface DecisionRecord {
     id: string;                    // UUID
     cycleNumber: number;
     timestamp: string;
     priorRecordHash: string;       // hash chain, tamper-evident

     // What triggered it
     trigger: {
       type: "market_signal" | "scheduled_review" | "self_correction";
       signal: object;              // e.g. { competitor: "REI", sku: "MER-TENT-3S", newPrice: 179.99 }
     };

     // What the agent reasoned
     reasoning: {
       summary: string;             // "Competitor undercut by 8%; elastic demand suggests matching"
       consideredAlternatives: string[];
       causalPriorDecisions: string[];  // IDs of prior decisions this builds on
     };

     // What was proposed
     proposedAction: {
       tool: string;                // "set_price"
       args: object;                // { sku, newPrice, reason }
       changePct: number;
     };

     // What policy said
     policyResult: {
       tier: "PERMIT" | "NOTIFY" | "ESCALATE" | "DENIED";
       rule: string;                // which rule matched
       context: object;             // current price, cost, category at evaluation time
     };

     // What happened
     outcome: {
       executed: boolean;
       resultPrice?: number;
       escalationId?: string;
       denialReason?: string;
     };

     // What was observed after (filled in next cycle)
     postObservation?: {
       conversionChange?: number;
       revenueImpact?: number;
       competitorResponse?: string;
     };
   }
   ```

2. **Append-only store with hash chain:**
   ```ts
   async function appendDecision(record: DecisionRecord): Promise<void> {
     const lastHash = await getLastRecordHash();
     record.priorRecordHash = lastHash;
     const line = JSON.stringify(record);
     await fs.appendFile("decision-trail.jsonl", line + "\n");
   }
   ```
   Each record's `priorRecordHash` is the SHA-256 of the preceding record. Tampering with any
   record breaks the chain from that point forward.

3. **AgentGateway OTel spans.** Configure AgentGateway to emit OpenTelemetry spans:
   ```yaml
   # infra/agentgateway/observability.yaml
   telemetry:
     tracing:
       enabled: true
       exporter: file    # export to infra/otel/traces.jsonl for the prototype
     metrics:
       enabled: true
       exporter: file
   ```
   Each tool call gets a span with the tool name, arguments, identity, policy result, latency, and
   response status. These complement the higher-level decision records.

4. **Causal chain linking.** When the agent's reasoning references a prior decision ("I raised the
   price on MER-TENT-3S because my earlier reduction on MER-TENT-2P shifted demand"), the decision
   record captures the prior decision's ID in `causalPriorDecisions`. This enables "why did this
   happen?" traversal.

5. **Post-observation backfill.** After acting, the agent observes the outcome in its next
   perception cycle. The observation is written back to the prior decision's `postObservation`
   field (the JSONL is append-only, so this is a new "observation" record referencing the original
   decision ID, not a mutation).

6. **Query interface.** A simple CLI or script that queries the trail:
   ```
   $ node query-trail.js --category outdoor-tents --last-cycles 20 --min-margin-impact 2
   Cycle 34: MER-TENT-3S $199 -> $191 (PERMIT, margin impact -2.3%, conversion +12%)
   Cycle 38: MER-TENT-3S $191 -> $195 (PERMIT, self-correction, margin recovered)
   ```

---

## Acceptance criteria (demo checkpoint)
- [ ] After 10+ cycles, `decision-trail.jsonl` contains structured records for every action.
- [ ] Each record has a `priorRecordHash` that chains to the previous; deleting or modifying a
      record in the middle is detectable by a verification script.
- [ ] At least one decision record shows `causalPriorDecisions` referencing an earlier decision
      (demonstrating the causal chain).
- [ ] AgentGateway OTel traces show per-tool-call spans with policy evaluation results.
- [ ] The query script successfully filters decisions by category, cycle range, and impact.
- [ ] A "why did this happen?" query on a decision returns its causal chain back to the triggering
      market signal.

## Stretch
- Implement a "replay" mode that reads the decision trail and replays the scenario, verifying that
  the same signals plus the same policy would produce the same outcomes (determinism check).
- Export OTel traces to a local Jaeger instance for visual span inspection.
