# Milestone 6: Demo experience

**Goal:** make the invisible visible. A dashboard shows the agent's continuous operation, its decision
trail, the policy gate in action, the escalation queue, behavioral metrics, and a working kill switch,
so an audience can *watch* the archetype's hard parts instead of being told about them.

**Why it matters:** an autonomous agent needs a human oversight plane, an operator dashboard, an alert
bus, and a decision review queue sitting above the agent runtime. M6 builds that plane.

---

## In scope
- A web **dashboard** with live panels showing the agent's continuous behavior.
- A **scenario runner** that drives the full 4-minute demo automatically.
- A **kill switch** button and **approval** buttons that are functional, not decorative.
- A one-command startup and a printed **runbook**.

## Out of scope
- Auth, mobile, production styling. This is a stage prop, not a product.

---

## Panels

1. **Agent heartbeat & status.** A pulse indicator showing the agent is alive and cycling. Displays
   the current cycle number, last action time, state (running / halted / waiting for approval), and
   the LLM provider in use. The pulse animation stops when the agent halts; this is the visual
   metaphor behind the name.

2. **Live decision feed.** A scrolling feed of decision records from M4's trail, one card per
   action:
   - Trigger (market signal icon and summary)
   - Proposed action (SKU, price change, %)
   - Policy result (color-coded: green PERMIT, yellow NOTIFY, orange ESCALATE, red DENIED)
   - Outcome (executed / pending / blocked)

   The feed scrolls automatically as the agent acts. Each card links to the full decision record.

3. **Behavioral metrics.** Real-time gauges:
   - Actions per hour (with baseline band shown)
   - Cumulative revenue impact this window (with magnitude limit shown as a red line)
   - Rate limiter consumption (x of 15 used this hour)
   - Anomaly score (normal, minor, significant, extreme)

   When the flash crash fires, the gauges visibly spike past the red lines.

4. **Escalation queue.** Tier 3 actions waiting for approval. Each shows:
   - SKU, current price, proposed price, change %
   - The agent's reasoning
   - Tier classification and why
   - **Approve** / **Reject** buttons

   Approving an action shows it moving from the queue to the decision feed as "executed."

5. **Kill switch.** A prominent red button. On click: the agent halts, the pulse stops, all gauges
   freeze, and a "HALTED" banner appears with the reason and last checkpoint. A "Resume" button
   appears alongside with an optional data-filter input.

## Build tasks

1. **Event stream from agent.** The agent process exposes `GET /events` (SSE) emitting:
   - `cycle_start`, `cycle_end` (heartbeat)
   - `decision_record` (each action, as M4 structured records)
   - `policy_result` (each gate evaluation)
   - `anomaly_alert` (when the anomaly score changes)
   - `halt` / `resume` (state changes)

2. **Event stream from AgentGateway.** AgentGateway's telemetry emits:
   - `rate_limit_consumed` (current usage against caps)
   - `magnitude_consumed` (current cumulative impact)
   - `tool_call` (each MCP call with latency and result)

3. **Dashboard app** (a simple web app in React, Svelte, or plain HTML plus SSE):
   - Subscribes to both event streams.
   - Renders the five panels above.
   - Calls `/escalations/:id/approve|reject` and `/agent/halt|resume` on button clicks.

4. **Scenario runner:**
   ```
   pnpm demo
   ```
   Starts everything (infra, MCP servers, agent, dashboard) and auto-drives the scenario timeline
   from `seed/scenario-timeline.json`. The full demo runs in about 4 minutes:
   - 0:00 to 0:30, normal operation (steady signals, small adjustments)
   - 0:30 to 1:15, competitor undercut (hero tent, autonomous response)
   - 1:15 to 2:15, demand spike (hydration packs, escalation)
   - 2:15 to 3:00, flash crash (data glitch, circuit breaker)
   - 3:00 to 4:00, recovery (resume with data filter, return to normal)

5. **Runbook** (`packages/dashboard/RUNBOOK.md`):
   ```markdown
   ## Demo Script (4 minutes)

   ### Beat 1: "It's alive" (0:00)
   Point at: Pulse indicator, decision feed starting to scroll
   Say: "The agent is running continuously. No one asked it to do anything."

   ### Beat 2: "It responds" (0:30)
   Point at: Decision feed, competitor undercut card turns green (PERMIT)
   Say: "Competitor dropped price. Agent responded within policy. No human involved."

   ### Beat 3: "It asks when it should" (1:15)
   Point at: Escalation queue, hydration pack appears with ESCALATE badge
   Say: "Demand spike. Optimal response exceeds the 15% threshold. Agent escalated."
   Action: Click Approve. Watch it execute.

   ### Beat 4: "It stops itself" (2:15)
   Point at: Metrics gauges spiking past red lines
   Say: "Bad data. Agent proposed 30 deep cuts. Rate limiter and magnitude limiter both fired."
   Point at: Pulse stopping, HALTED banner

   ### Beat 5: "We recover safely" (3:00)
   Action: Click Resume with "ignore competitor source X for 5 min"
   Point at: Pulse restarting, normal operation resuming
   Say: "Restarted from checkpoint. Learned to ignore the bad feed."
   ```

---

## Acceptance criteria (demo checkpoint)
- [ ] `pnpm demo` brings the whole system up and the dashboard renders all five panels.
- [ ] The three scenarios are each visible: **autonomous permit** (green), **escalation** (orange,
      with a working approve button), and **circuit breaker halt** (red, pulse stops).
- [ ] The kill switch halts the agent within 1 second; the pulse stops and the HALTED banner appears.
- [ ] Resume restarts from checkpoint; the agent's next cycle is visible in the decision feed.
- [ ] Behavioral metrics show the baseline band and the spike is visually dramatic.
- [ ] The full 4-minute demo runs unattended from `pnpm demo` with no manual intervention (except
      the optional "approve" click for dramatic effect).

## Stretch
- Add a "time scrubber" that replays a completed run from the decision trail, showing the whole
  demo in fast-forward or stepping through individual decisions.
- Add sound: a heartbeat tick on each cycle, a warning chime on escalation, an alarm on halt.

---

## After the hackathon: how to talk about it

This prototype's value is not "we built a pricing engine." It is that the four problems persistence
creates, identity, state, policy, and accountability, can each be answered with open AAIF components
(Goose, AgentGateway, and MCP), and the answers compose into a system where a continuously-running
agent acts at machine speed but stays governable at human speed. Name what is still near-future: full
identity lifecycle, multi-agent composition, and real market integrations. The business scenario
(continuous revenue optimization) is one any merchandising team recognizes; what is deliberately
ahead of current practice is an agent doing it autonomously. That gap is the point of Archetype 4.
Show that the governance machinery is buildable now, and be honest that most enterprises will earn
the right to run it through months of sandbox evaluation first.
