# Meridian Pulse — Demo Runbook (~4 minutes)

This is the script for the live demo. The goal is to **make the invisible visible**: an audience watches a continuously-running agent perceive signals, hit the policy gate, and reach a different outcome for each of three scenarios — autonomous action, escalation to a human, and detecting & rejecting bad data — while the operator dashboard and Grafana show it in real time.

Two screens to keep open:

- **Operator dashboard — http://localhost:8090** (served by the control plane): agent heartbeat/status, live decision feed, behavioral metrics, escalation queue, kill switch.
- **Grafana — http://localhost:3001**: gateway traces (Tempo) and metrics (Prometheus) — the tool-call latency and rate/magnitude gauges behind the dashboard's headline numbers.

The whole demo is driven automatically by the scenario timeline in [`seed/scenario-timeline.json`](../../seed/scenario-timeline.json) (240 seconds), replayed by the scenario driver embedded in `mcp-market-data`. The only manual interactions are the **Approve** click in Beat 3 and the **Resume** click in Beat 5 — everything else unfolds on its own.

> **Presenting live?** Run in **manual mode** (`SCENARIO_MODE=manual pnpm demo`) and advance each beat yourself with `pnpm scenario:step` (press Enter per beat). The beats below map 1:1 to the stepper's five presses, so nothing fires until you introduce it. See the top-level `HOW-TO-DEMO.md` for the mapping. Timed mode (the default) plays on a clock and is best for rehearsal or an unattended run.

## Before you start

Bring the whole system up with one command from the repo root:

```bash
pnpm demo
```

This starts the observability stack, AgentGateway, the control plane, and the agent loop, then begins replaying the scenario. (Equivalently, start each piece by hand per the [README](../../README.md): `finch compose -f infra/observability-compose.yaml up -d`, `agentgateway -f infra/agentgateway/config.yaml`, `node packages/control-plane/dist/index.js`, `packages/agent/run-loop.sh`.) Confirm the dashboard at http://localhost:8090 shows a pulsing heartbeat and the decision feed beginning to scroll before you begin narrating.

---

## Beat 1 — "It's alive" (0:00)

**Point at (dashboard):** the pulse/heartbeat indicator and the decision feed starting to scroll. Note the current cycle number ticking up and the LLM provider in use.

**Say:** "The agent is running continuously. No one asked it to do anything. It's perceiving market signals, reasoning, and making small autonomous price adjustments — and it will keep doing that until we stop it. That heartbeat is the whole point of the archetype: every other kind of agent finishes; this one persists."

Steady-state signals (`atSeconds` 5–20) produce small, in-tier moves — the feed shows green PERMIT cards.

## Beat 2 — "It responds" (0:30)

**Trigger:** at ~0:35 a competitor undercuts the hero tent `MER-TENT-3S` by ~8% (drops to $188.60 on AlpineDirect), and demand shows as elastic.

**Point at (dashboard):** the decision feed — a `MER-TENT-3S` card appears with a green **PERMIT** badge: the agent reprices within its Tier-1 (±5%) autonomy.

**Point at (Grafana):** the tool-call trace for the `set_price` and the rate-limit gauge advancing by one — the write really did traverse the gateway and policy server.

**Say:** "A competitor just dropped its price on our hero tent. The agent perceived it, reasoned that demand is elastic, and repriced — within policy, no human involved. The change didn't go straight to commerce; it went through the gateway and the policy gate, which classified it as autonomous and let it through."

## Beat 3 — "It asks when it should" (1:15)

**Trigger:** the ultralight pack `MER-PACK-UL` goes viral with thru-hikers — demand up ~40% — and a competitor raises its price, giving the agent room to move. This SKU is on the mandate's **flagged list**, so any price change to it requires human approval regardless of size.

**Point at (dashboard):** the escalation queue — a `MER-PACK-UL` entry appears with an orange **ESCALATE** badge (rule `ESCALATE:FLAGGED_SKU`), showing current price, proposed price, change %, and the agent's reasoning.

**Say:** "This pack just went viral and the agent wants to reprice it — but it's a flagged, high-visibility product, so policy says the agent can't touch it alone, no matter how small the change. Instead of acting, it escalated and queued the change for a human. It asked, because policy said it must."

**Action:** click **Approve** on the escalation. The approval releases the change to commerce; watch the item move out of the queue and appear in the decision feed as **executed**.

**Say:** "I approve it. Now it executes — and the whole exchange, escalation and approval, is in the decision trail."

## Beat 4 — "It catches bad data" (2:15)

**Trigger:** FeedX fat-fingers a promotion — a 75%-off discount meant for a single product is applied to their **entire** catalog, so every FeedX competitor price collapses to a quarter of its value.

**Point at (dashboard):** the red **⚠ Agent-flagged anomalies** panel — a card appears naming the SKU, what the agent observed ("FeedX quotes ~75% below normal across the catalog"), why it's suspicious ("feed pricing error, not a genuine price move"), and what it did instead ("flagged; no price change").

**Say:** "Now bad data. A competitor's feed just slashed every price by 75% — a pricing error, not a real move. A naive agent would chase it and start a fire sale. This one recognizes the data is implausible, refuses to act, and flags it for me instead. The decision *not* to act is itself a first-class, recorded event — you can see it here, and it's in the tamper-evident trail."

> **Why anomaly-detection, not a circuit-breaker trip.** With a capable model (Claude Sonnet 5) the agent *reasons* that a catalog-wide 75% cut is bad data and declines — a stronger story than a mechanical halt, because it's the model's own judgment. The **circuit breaker remains in the implementation as a backstop**: if a weaker model failed to catch this and pushed a burst of deep cuts, the rate/magnitude/anomaly breakers would trip and halt the agent. It simply doesn't fire here, by design. To show a hard stop on camera, use the kill switch (Beat 5).

## Beat 5 — "We stay in control" (3:00)

**Trigger:** the timeline restores the FeedX prices to baseline (`atSeconds` 210).

**Action (the reliable hard-stop moment):** on the dashboard, hit **■ KILL SWITCH** — the pulse stops and the HALTED banner appears within a second. Then click **▶ RESUME** and enter a data filter such as `ignore competitor source FeedX for 5 min`.

**Point at (dashboard):** the pulse stops on kill, then restarts on resume; the next cycle appears in the decision feed with green PERMIT cards again.

**Say:** "The agent already handled the bad data on its own — but I'm always in control. One button halts it within a second, and it resumes from its last checkpoint with a filter to ignore the bad source. It acts at machine speed but stays governable at human speed — that's the whole system."

---

## Recovery notes (if something misbehaves live)

- **Kill switch, any time.** The red kill-switch button halts the agent within about a second: the pulse stops and the HALTED banner appears. The agent loop polls the control plane between cycles and pauses while halted; **Resume** brings it back from the last checkpoint.
- **Escalation didn't appear.** Approve/reject and the queue read the shared `packages/policy/escalation-queue.jsonl`. From a terminal you can list and act on it directly: `node packages/policy/dist/approvals-cli.js list`, then `... approve <id>`.
- **Need to explain a decision after the fact.** Query the decision trail: `node packages/policy/dist/query-trail.js list` (recent decisions), `... why <id>` (why it reached its tier), or `... stats`.
- **Anomaly card didn't appear (Beat 4).** The card comes from the agent calling `report_anomaly` → the decision trail → the control plane's `/anomalies`. Confirm the agent flagged it rather than repricing: `node packages/policy/dist/query-trail.js list` should show an `anomaly` record, and `curl localhost:8090/anomalies` should return it. With a very capable model this is reliable; if it instead repriced the FeedX SKUs, give it another cycle or check the recipe's report_anomaly instruction is present.
- **Grafana panels are empty.** The gateway runs fine without the OTel collector; if traces/metrics aren't showing, confirm the `finch compose` stack is up. The demo's core behavior does not depend on it.
