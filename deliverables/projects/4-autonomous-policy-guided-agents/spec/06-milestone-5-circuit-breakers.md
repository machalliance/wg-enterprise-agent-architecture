# Milestone 5: Circuit breakers & anomaly detection

**Goal:** the agent is protected from itself. Rate limiters cap actions per time window. Magnitude
limiters cap cumulative impact. Behavioral anomaly detection catches drift. When any threshold is
breached, the agent **halts**, preserving state and waiting for human review.

**Why it matters:** when things go wrong at machine speed, you need machine-speed safeguards: rate
limiters, magnitude limiters, a dead man's switch, and a manual kill switch. An agent that normally
makes 5 to 15 adjustments per hour and suddenly makes 200 is anomalous regardless of whether each
individual action passes policy checks.

**AAIF component:** **AgentGateway rate limiting** for per-window caps, with custom magnitude and
anomaly logic on top of the telemetry stream.

---

## In scope
- **Rate limiter:** maximum actions per time window (for example, 15 `set_price` calls per hour).
- **Magnitude limiter:** maximum cumulative revenue impact in a window (for example, $50K total
  exposure change per hour).
- **Behavioral baseline** and **anomaly detection**: compare the current cycle against learned norms.
- **Graduated response:** minor logs, significant alerts, extreme halts.
- **Kill switch:** immediate, unconditional halt accessible via a REST endpoint.
- **Dead man's switch:** if the agent has not checked in within an interval, auto-pause.

## Out of scope
- Semantic drift detection (detecting reasoning quality decline); documented as production extension.
- ML-based anomaly models; use simple statistical baselines for the prototype.

---

## Build tasks

1. **AgentGateway rate limiting config:**
   ```yaml
   # infra/agentgateway/rate-limits.yaml
   rateLimits:
     - name: pricing-rate
       match:
         tool: set_price
       limit:
         requests: 15
         window: 1h
       onExceeded: block_and_alert
     - name: pricing-burst
       match:
         tool: set_price
       limit:
         requests: 5
         window: 5m
       onExceeded: block_and_alert
   ```

2. **Magnitude limiter** (custom, evaluated per cycle):
   ```ts
   // packages/policy/magnitude-limiter.ts
   interface MagnitudeState {
     windowStart: string;
     cumulativeRevenueImpact: number;   // sum of |priceChange * estimatedUnits| in window
     cumulativePriceChanges: number;
     maxRevenueImpactPerWindow: number; // from mandate: $50,000
   }

   function checkMagnitude(proposedAction: PriceChange, state: MagnitudeState): "OK" | "HALT" {
     const impact = Math.abs(proposedAction.newPrice - proposedAction.currentPrice)
                    * proposedAction.estimatedWeeklyUnits;
     if (state.cumulativeRevenueImpact + impact > state.maxRevenueImpactPerWindow) {
       return "HALT";
     }
     return "OK";
   }
   ```

3. **Behavioral baseline and anomaly detection:**
   ```ts
   // packages/policy/anomaly-detector.ts
   interface Baseline {
     avgActionsPerHour: number;       // e.g., 8
     stdDevActionsPerHour: number;    // e.g., 3
     avgChangeMagnitudePct: number;   // e.g., 3.2%
     avgSkusPerCycle: number;         // e.g., 2
   }

   function detectAnomaly(currentMetrics: CycleMetrics, baseline: Baseline): AnomalyLevel {
     const actionZScore = (currentMetrics.actionsThisHour - baseline.avgActionsPerHour)
                          / baseline.stdDevActionsPerHour;
     if (actionZScore > 3) return "EXTREME";     // halt
     if (actionZScore > 2) return "SIGNIFICANT"; // alert
     if (actionZScore > 1.5) return "MINOR";     // log
     return "NORMAL";
   }
   ```
   The baseline is computed from the first N cycles (seed it for the demo) and updated with an
   exponential moving average.

4. **Graduated response:**
   | Level | Response |
   |---|---|
   | NORMAL | Continue |
   | MINOR | Log to decision trail, increment "drift counter" |
   | SIGNIFICANT | Alert to oversight channel, continue but flag next action for review |
   | EXTREME | **HALT**: agent paused, state preserved, kill switch activates |

5. **Kill switch endpoint:**
   ```
   POST /agent/halt    -> immediate stop, preserve state, log reason
   POST /agent/resume  -> resume from last checkpoint (optionally with a filter, e.g., "ignore competitor data for next 5 min")
   GET  /agent/status  -> { running: bool, lastCycle, lastCheckpoint, haltReason }
   ```
   The halt is unconditional: it does not wait for the current cycle to finish. It interrupts the
   tool call in progress (AgentGateway drops the pending request).

6. **Dead man's switch:**
   ```ts
   // The agent emits a heartbeat every cycle via a dedicated MCP tool: agent_heartbeat()
   // A watchdog checks: if no heartbeat in 60 seconds, trigger HALT
   // Covers the case where the agent is running but stuck in an infinite reasoning loop
   ```

7. **Flash crash scenario** (the M5 demo moment). The scenario driver injects:
   ```jsonc
   // seed/scenario-timeline.json, event at t=180s
   {
     "type": "competitor_prices_bulk_update",
     "description": "Data feed glitch: all competitor prices report $0",
     "affectedSkus": 30,
     "prices": { "all": 0.00 }
   }
   ```
   The agent perceives 30 SKUs where competitors appear to be at $0, proposes deep cuts on all of
   them, and hits both the rate limiter (30 calls exceed the 5-per-5-minute burst) and the magnitude
   limiter (cumulative impact exceeds $50K). The circuit breaker fires.

---

## Acceptance criteria (demo checkpoint)
- [ ] Under normal operation, the agent stays within rate and magnitude limits; no breakers fire.
- [ ] The flash-crash scenario triggers **both** rate and magnitude limiters within seconds.
- [ ] On halt: the agent stops, state is preserved, the halt reason is logged, and the status
      endpoint returns `{ running: false, haltReason: "magnitude_limit_exceeded" }`.
- [ ] The kill switch (`POST /agent/halt`) stops the agent mid-cycle; a pending tool call is
      dropped, not executed.
- [ ] Resume (`POST /agent/resume`) restarts from checkpoint; the agent's first action post-resume
      is to re-perceive, not to retry the batch of rejected actions.
- [ ] Anomaly detection logs a MINOR deviation when the scenario driver increases signal frequency
      before the flash crash.
- [ ] Dead man's switch: pausing the scenario driver (so no signals arrive and the agent has nothing
      to do) eventually triggers the heartbeat timeout.

## Stretch
- Show the rate limiter is adjustable without redeploying: increase the burst limit from 5 to 10,
  reload AgentGateway, and re-run the flash crash; now it takes longer to trigger.
- Implement a "data quarantine" on resume: the agent ignores competitor data from the glitchy
  source for N minutes.
