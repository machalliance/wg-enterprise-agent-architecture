# Milestone 6 — Demo experience

**Goal:** make the invisible visible. A dashboard shows the two half-trails **side by side**, the three
negotiation outcomes as they happen, the approval queue, and a working kill switch — so an audience can
*watch* the archetype's hard parts instead of being told about them.

**Chapter tie-in:** the whole point of Archetype 5 is that "no one can see the whole decision trail."
The dashboard honours that: it does not have a god view. It subscribes to **each organization's own
event stream** and reconstructs the picture the way the reconcile tool (M5) does — by correlation ID,
after the fact.

---

## In scope
- A **Next.js** dashboard subscribing via SSE to the buyer and each supplier process.
- Four panels: **Discovery/Verification**, **Live negotiations**, **Approval queue**, **Reconcile**.
- A **kill-switch** button hitting the buyer's M4 endpoint.
- A one-command demo runner and a printed runbook.

## Out of scope
- Auth, styling beyond legibility, mobile. This is a stage prop, not a product.

---

## Panels

1. **Discovery & verification (M1 + M2).** The three candidates from the directory, each with its OASF
   capability claims and a trust badge: `VERIFIED` (Summit, Alpine) / `REJECTED` (RidgeLine, with the
   reason). Makes the "findable ≠ trusted" point in one glance.
2. **Live negotiations (M3 + M4).** One column per active `negotiationId`, streaming turns as chat
   bubbles (RFQ → QUOTE → COUNTER…). Each bubble shows the terms and the round. The buyer's side shows
   the **tier classification** of each incoming quote (`AUTONOMOUS_SETTLE` / `NOTIFY` / `APPROVE` /
   `PROHIBITED`) — but **never** the reservation price. A red "walk-away" marker when the round budget
   fires on RidgeLine.
3. **Approval queue (M4 Tier 3).** Alpine's escalated deal appears here with Approve / Reject buttons.
   Approving lets the held `ACCEPT` proceed; the audience sees the human-in-the-loop boundary work.
4. **Reconcile (M5).** Split screen: buyer half-trail | supplier half-trail. A **Reconcile** button runs
   `reconcile()` live and shows green (matched, terms proven by both DIDs) or red (mismatch). This is
   the closer.

## The kill switch
A single prominent button → buyer's kill endpoint (M4). On click: all active negotiations receive
`WALKAWAY`, any pending-but-unconfirmed `ACCEPT` is revoked, and the negotiation columns visibly go
dark. Rehearse triggering it mid-Alpine-negotiation — it is the most memorable 3 seconds of the demo.

## Build tasks
1. **Event streams.** Each org process exposes `GET /events` (SSE) emitting its own trail records and
   state transitions. The dashboard opens one connection per org — never a shared feed.
2. **Dashboard app** in `packages/dashboard`, four panels as above, subscribing to all four streams.
3. **Demo runner.** `pnpm demo` boots infra (SLIM/dir/identity), all four agents, the dashboard, and
   optionally auto-drives the scenario end to end for an unattended run.
4. **Runbook** (`packages/dashboard/RUNBOOK.md`): the numbered demo script from `00-overview.md §7`,
   annotated with what to say and which panel to point at for each beat, plus a reset command.

---

## Acceptance criteria (demo checkpoint)
- [ ] `pnpm demo` brings the whole system up and the dashboard renders all four panels.
- [ ] The three outcomes are each visible on screen: Summit **settles**, Alpine **escalates then is
      approved**, RidgeLine is **rejected at verification** (and/or **walked away** if admitted).
- [ ] The reservation price never appears anywhere in the UI or the event streams.
- [ ] Reconcile shows a live green match between the buyer and Summit half-trails.
- [ ] Kill switch severs a live negotiation and the UI reflects it within a second.
- [ ] The dashboard consumes only per-org streams — there is no shared/god-view data source.

## Stretch
- A timeline scrubber that replays a completed run from the two half-trails (proving the trails alone
  are enough to reconstruct the story).
- Toggle transport SLIM↔gRPC live to show the negotiation contract is transport-independent (M0).

---

## After the hackathon — how to talk about it

This prototype's value is not "we built a marketplace of agents." It is: **the four unavoidable
questions of Archetype 5 — discovery, cross-org identity, protocol, accountability — can each be
answered today with real, open standards (A2A + AGNTCY), and the answers compose into a system where two
organizations' agents reach a defensible commercial outcome with no orchestrator between them.** Name
what is still unsolved and moving — settled infrastructure, arbitration when two faithful agents reach a
regretted outcome, trust between parties with opposed interests — because the book does, and honesty
about the frontier is the credible way to demo it.
