# How to demo — autonomous, policy-guided pricing agent

This is the presenter's guide: how to boot the system and talk an audience through it in about four
minutes. The demo makes the invisible visible — a single agent runs continuously, perceives market
signals, hits a policy gate on every write, and reaches a *different* outcome for each of three
scenarios (autonomous action, escalation to a human, and detecting & rejecting bad data), while the
operator dashboard and Grafana show it in real time.

Before you present, make sure the prototype is set up and the tests pass — see
[`GETTING-STARTED.md`](GETTING-STARTED.md). This doc assumes that is done.

For the fully annotated beat-by-beat narration,
[`meridian-pulse/packages/control-plane/RUNBOOK.md`](meridian-pulse/packages/control-plane/RUNBOOK.md) has
the extended script; everything you need to run the demo cold is below.

## The two screens

Keep both open the whole time:

- **Operator dashboard — http://localhost:8090** (served by the control plane): the agent heartbeat and
  status, the live decision feed, the behavioral-metrics gauges (rate / revenue-magnitude / anomaly), the
  **autonomous-actions feed** (with a pop-up **toast** each time the agent reprices within policy — so you
  can *see* it working even when nothing is escalated), the escalation queue, the agent-flagged anomalies
  panel, and the kill switch. This is the screen you narrate from.
- **Grafana — http://localhost:3001**: gateway traces (Tempo) and metrics (Prometheus) — the tool-call
  latency and rate/magnitude gauges *behind* the dashboard's headline numbers. It opens straight onto the
  Meridian Pulse dashboard (no clicking to find it).

Everything runs on **one host** over loopback; the only ports a browser needs are `8090` and `3001`. If
you present from a **remote host**, forward those two — an SSH tunnel is simplest:
`ssh -L 8090:localhost:8090 -L 3001:localhost:3001 <you>@<host>`. Every other port
(`3000`/`4000`/`15020`/`4317`) is internal.

## 1. Boot everything

From `meridian-pulse/`:

```bash
pnpm demo
```

This starts the observability stack, AgentGateway, the control plane, and the agent loop, then begins
replaying the scenario. Confirm the dashboard at http://localhost:8090 shows a pulsing heartbeat and the
decision feed beginning to scroll before you start narrating.

To rehearse without Grafana (core behaviour is identical, you just lose the trace/metric panels):

```bash
NO_OBSERVABILITY=1 pnpm demo
```

`Ctrl-C` tears everything down, including the container stack. To reset between takes, Ctrl-C first, then
re-run — the decision trail and checkpoint DB persist across runs by design (they are the durable
evidence), so delete `packages/policy/decision-trail.jsonl`, `packages/policy/escalation-queue.jsonl`, and
`packages/agent/checkpoint.db` if you want a clean slate.

**Which LLM am I on?** The dashboard header and the agent's startup log show the provider in use. The
provider is chosen in the gateway config, not on the command line (see
[`GETTING-STARTED.md` step 2](GETTING-STARTED.md#2-configure-the-llm-provider)); pick a model you have
confirmed works before presenting.

## 1a. (Recommended for a live audience) manual mode — advance beats by hand

By default the scenario plays on a **wall clock**: the competitor undercut fires at 0:35, the demand
spike at 1:15, the feed glitch at 3:00 — whether or not you are ready to narrate them. For a live demo
that is a risk: a beat can land mid-sentence. **Manual mode** puts the pacing in your hands — nothing
fires until you advance to the next beat, so each dramatic moment lands exactly when you introduce it.

Enable it by setting `SCENARIO_MODE=manual` before `pnpm demo`:

```bash
SCENARIO_MODE=manual pnpm demo
```

Then, in a second pane, drive the beats with the stepper — press **Enter** to advance one beat:

```bash
pnpm scenario:step
```

It prints the beat plan up front and, on each Enter, applies the next beat and shows what moved. There
are **five beats**, matching the talk-track below exactly:

| Press | Beat | What it injects | Expected agent outcome |
|---|---|---|---|
| 1 | steady-state | ambient demand/competitor noise | small green **PERMIT** cards |
| 2 | competitor-undercut | AlpineDirect drops the hero tent ~8% **+** its demand turns elastic | autonomous **PERMIT** |
| 3 | demand-spike | ultralight pack **MER-PACK-UL** goes viral (+40%) — a *flagged* SKU | **ESCALATE** (flagged SKU → any change needs a human) → you Approve |
| 4 | data-glitch | FeedX fat-fingers a 75%-off promo across its **entire** catalog | agent **flags it as bad data** → red anomaly card |
| 5 | recovery | FeedX restored to baseline | you Resume (kill-switch story) |

So the full demo is: press Enter (beat) → narrate → watch the agent react → press Enter for the next.
The two dashboard interactions (Approve after beat 3, and the kill-switch / Resume around beat 5) are the
manual touches.

If you prefer not to use the helper, the stepper just increments a small trigger file the market-data
driver watches — you can drive it by hand (handy for a scripted or a future dashboard-button trigger):

```bash
# advance one beat = bump the integer in the trigger file
echo $(( $(cat packages/mcp-market-data/scenario-step.trigger 2>/dev/null || echo 0) + 1 )) \
  > packages/mcp-market-data/scenario-step.trigger
```

The trigger file lives at `packages/mcp-market-data/scenario-step.trigger` (override with
`SCENARIO_TRIGGER_FILE`) and the driver only watches it in **manual mode**. It is a file rather than a
socket so it survives the gateway spawning the market-data MCP child more than once. Timed mode (the
default) is unchanged and remains the right choice for an unattended run or a quick rehearsal.

## 2. The talk-track — five beats

The whole run is driven by the 240-second scenario timeline. In **timed mode** (default) it plays on a
clock and **the only two manual interactions are the Approve click in Beat 3 and the Resume click in
Beat 5**. In **manual mode** (see [1a](#1a-recommended-for-a-live-audience-manual-mode--advance-beats-by-hand))
you also advance each beat yourself with `pnpm scenario:step` — recommended for a live audience so the
beats land on your narration. Either way, narrate as each beat lands:

1. **"It's alive" (0:00).** *Point at:* the heartbeat indicator and the decision feed starting to scroll,
   the cycle number ticking up. Steady-state signals produce small in-band moves — green **PERMIT** cards.
   *Say:* "The agent is running continuously. No one asked it to do anything. It's perceiving, reasoning,
   and making small autonomous price adjustments, and it will keep doing that until we stop it. That
   heartbeat is the whole point of the archetype — every other kind of agent finishes; this one persists."

2. **"It responds" (0:30).** *Trigger:* a competitor undercuts the hero tent `MER-TENT-3S` by ~8%.
   *Point at:* a `MER-TENT-3S` card with a green **PERMIT** badge — the agent reprices within its Tier-1
   (±5%) autonomy; and in Grafana, the `set_price` trace and the rate gauge advancing by one.
   *Say:* "A competitor dropped its price. The agent perceived it, reasoned that demand is elastic, and
   repriced — within policy, no human involved. The write didn't go straight to commerce; it went through
   the gateway and the policy gate, which classified it autonomous and let it through."

3. **"It asks when it should" (1:15).** *Trigger:* the ultralight pack **MER-PACK-UL** goes viral with
   thru-hikers — demand +40%, and a competitor raises its price, giving the agent room to move. This SKU
   is on the mandate's **flagged list**, so *any* price change to it requires a human. *Point at:* the
   escalation queue — an orange **ESCALATE** entry (rule `ESCALATE:FLAGGED_SKU`) with current price,
   proposed price, change %, and the agent's reasoning. *Say:* "This pack just went viral, and the agent
   wants to reprice it. But it's a flagged, high-visibility product — policy says the agent can't touch it
   alone, no matter how small the change. So instead of acting, it escalated and queued the change for a
   human. It asked, because policy said it must." **Action:** click **Approve**. The change releases to
   commerce, moves out of the queue, and appears in the feed as *executed*. *Say:* "I approve it, it
   executes, and the whole exchange — escalation and approval — is in the decision trail."

4. **"It catches bad data" (2:15).** *Trigger:* FeedX fat-fingers a promotion — a 75%-off discount meant
   for one product gets applied to their **entire** catalog, so every FeedX competitor price collapses to
   a quarter of its value. *Point at:* the red **⚠ Agent-flagged anomalies** panel — a card appears naming
   the SKU, what the agent saw ("FeedX quotes ~75% below normal across the catalog"), why it's suspicious
   ("feed pricing error, not a genuine price move"), and what it did ("flagged; no price change"). *Say:*
   "Now bad data. A competitor's feed just slashed every price 75% — a pricing error, not a real move. A
   naive agent would chase it and start a fire sale. Watch what this one does: it recognizes the data is
   implausible, refuses to act, and flags it for me instead. The judgment not to act is itself a
   first-class, recorded decision — you can see it right here, and it's in the tamper-evident trail."

   > **Why this beat, not a circuit-breaker trip:** with a capable model (Claude Sonnet 5) the agent
   > *reasons* that a 75%-catalog-wide cut is bad data and declines — so the story is the model's own
   > judgment, which is stronger than a mechanical halt. The **circuit breaker is still there** as a
   > backstop: if a weaker model failed to catch this and tried to push a burst of deep cuts, the
   > rate/magnitude/anomaly breakers would trip and halt the agent. You just won't see that with this
   > model, by design. (If you *want* to show the breaker, the kill switch in the next beat is the
   > reliable "hard stop" moment.)

5. **"We stay in control" (3:00).** *Trigger:* the timeline restores FeedX to baseline. *Point at:* the
   kill switch. **Action (optional, the reliable hard-stop moment):** hit **■ KILL SWITCH** — the pulse
   stops, a red **HALTED** banner appears; then **▶ RESUME** with a data filter such as `ignore competitor
   source FeedX for 5 min`, and the agent picks up from its last checkpoint. *Say:* "The agent already
   handled the bad data on its own. But I'm always in control: one button halts it within a second, and it
   resumes from exactly where it left off, with a filter to ignore the bad source. It acts at machine
   speed but stays governable at human speed — that's the whole system."

## 3. If something misbehaves live

- **Kill switch, any time.** The red kill-switch button halts the agent within about a second — the pulse
  stops and the HALTED banner appears. The loop polls the control plane between cycles and pauses while
  halted; **Resume** brings it back from the last checkpoint.
- **Escalation didn't appear.** The queue and the Approve/Reject buttons read the shared
  `packages/policy/escalation-queue.jsonl`. From a terminal:
  `node packages/policy/dist/approvals-cli.js list`, then `... approve <id>`.
- **Need to explain a decision.** `node packages/policy/dist/query-trail.js list` (recent decisions),
  `... why <id>` (why it reached its tier), or `... stats`.
- **Grafana panels are empty.** The gateway runs fine without the OTel collector; if traces/metrics aren't
  showing, confirm the `finch compose` stack is up. The demo's core behaviour does not depend on it.
- **Anomaly card didn't appear (Beat 4).** The card is fed from `report_anomaly` → the decision trail →
  the control plane's `/anomalies`. Check the agent actually flagged it: `node
  packages/policy/dist/query-trail.js list` should show an `anomaly` record, and `curl
  localhost:8090/anomalies` should return it. If the agent instead *repriced* the FeedX SKUs, it didn't
  treat the data as anomalous — give it another cycle, or confirm the recipe's report_anomaly instruction
  is present.
- **Ports already in use.** A previous run is still alive. Kill by process AND reap orphaned MCP children
  by port (a gateway-spawned child can outlive its parent as an orphan):
  `pkill -f 'agentgateway -f infra'; pkill -f 'control-plane/dist/index.js'; pkill -f run-loop.sh`, then
  `pkill -f 'meridian-pulse/packages/mcp-'`. If a port is still held, find and kill the holder:
  `lsof -tiTCP:8090 -sTCP:LISTEN | xargs kill -9`.

## Knobs

Set these in `meridian-pulse/.env` (copied from `.env.example`, which lists every variable with its
default). A shell variable overrides the file for a single run. **The recording setup uses:**
`SEED_DIR=seed-demo`, `SCENARIO_MODE=manual`, `AGENT_CYCLE_INTERVAL_S=30`, `HEARTBEAT_TIMEOUT_MS=600000`.

- `SEED_DIR` (default `seed`) — `seed-demo` is the recording baseline: every SKU priced at its competitor
  median so the agent sits **calm at rest** (no baseline escalations, no self-tripped breaker) and your
  beats are the only stimulus. The real `seed/` is untouched.
- `NO_OBSERVABILITY=1` — skip the container stack (gateway + control plane + agent only).
- `SCENARIO_MODE` (default `timed`) — `manual` waits for you to advance each beat (see
  [1a](#1a-recommended-for-a-live-audience-manual-mode--advance-beats-by-hand)); `timed` plays on a clock.
- `SCENARIO_TRIGGER_FILE` (default `packages/mcp-market-data/scenario-step.trigger`) — manual mode's
  beat-advance trigger file; `pnpm scenario:step` increments it. A file, not a port, so it survives the
  gateway respawning the MCP child.
- `AGENT_CYCLE_INTERVAL_S` (default 8; **demo uses 30**) — seconds between perceive→reason→act cycles.
  Slower keeps the agent calm between hand-paced beats and stops it churning into the burst breaker.
- `HEARTBEAT_TIMEOUT_MS` (default 60000; **demo uses 600000**) — the dead-man's-switch window. The agent
  heartbeats once per cycle; on Bedrock a cycle can run long and you pause to narrate, so 60s is too tight
  for a hand-paced demo — 10 minutes is safe.
- `AGENT_MAX_CYCLES` (default 0 = run forever) — stop after N cycles; useful for a bounded, unattended run.
- `SCENARIO_TICK_SCALE` (default 1) — multiplier on the scenario's scheduled times (timed mode only):
  `<1` compresses the timeline, `>1` slows it. `SCENARIO_LOOP=1` replays the timeline forever.

The full variable reference is in [`meridian-pulse/.env.example`](meridian-pulse/.env.example).

## Teardown

`Ctrl-C` the `pnpm demo` process — it stops the gateway, control plane, and agent, and runs
`finch compose ... down` for the observability stack on its way out. If you exposed `8090`/`3001` from a
remote host, tear that forwarding down too.
