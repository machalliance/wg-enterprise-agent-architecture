import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { OversightState } from "./state.js";

/**
 * Oversight state (M5): the halt/resume state machine and the dead-man's-switch.
 * `checkDeadMansSwitch(now)` takes an explicit clock, so the timeout is tested by
 * passing timestamps rather than sleeping.
 */

describe("oversight state — kill switch", () => {
  it("starts running", () => {
    const s = new OversightState();
    assert.equal(s.isRunning(), true);
    assert.equal(s.get().haltReason, null);
  });

  it("halt stops the agent and records the reason", () => {
    const s = new OversightState();
    const status = s.halt("manual_kill_switch");
    assert.equal(status.running, false);
    assert.equal(status.haltReason, "manual_kill_switch");
    assert.ok(status.haltedAt, "haltedAt timestamp set");
    assert.equal(s.isRunning(), false);
  });

  it("halt is idempotent — the first reason wins", () => {
    const s = new OversightState();
    s.halt("magnitude_limit");
    const second = s.halt("manual_kill_switch");
    assert.equal(second.haltReason, "magnitude_limit", "a second halt does not overwrite the original cause");
  });

  it("resume clears the halt and can carry a data filter", () => {
    const s = new OversightState();
    s.halt("anomaly_extreme");
    const status = s.resume("ignore competitor source FeedX for 5m");
    assert.equal(status.running, true);
    assert.equal(status.haltReason, null);
    assert.equal(status.dataFilter, "ignore competitor source FeedX for 5m");
  });
});

describe("oversight state — heartbeat & dead-man's-switch", () => {
  it("records the last cycle on heartbeat", () => {
    const s = new OversightState();
    s.heartbeat(7);
    assert.equal(s.get().lastCycle, 7);
    assert.ok(s.get().lastHeartbeatAt, "heartbeat timestamp set");
  });

  it("does not trip before a heartbeat has ever been sent", () => {
    const s = new OversightState(3000);
    // No heartbeat yet ⇒ the agent hasn't started ⇒ the switch must not fire.
    assert.equal(s.checkDeadMansSwitch(Date.now() + 10_000), false);
    assert.equal(s.isRunning(), true);
  });

  it("trips when no heartbeat arrives within the timeout", () => {
    const s = new OversightState(3000); // 3s timeout
    // A heartbeat "now", then check 6s later with none since.
    s.heartbeat(1);
    const heartbeatAt = new Date(s.get().lastHeartbeatAt!).getTime();
    const tripped = s.checkDeadMansSwitch(heartbeatAt + 6000);
    assert.equal(tripped, true);
    assert.equal(s.isRunning(), false);
    assert.equal(s.get().haltReason, "dead_mans_switch");
  });

  it("does not trip while heartbeats keep arriving within the timeout", () => {
    const s = new OversightState(3000);
    s.heartbeat(1);
    const t = new Date(s.get().lastHeartbeatAt!).getTime();
    // 2s later (< 3s timeout) — still alive.
    assert.equal(s.checkDeadMansSwitch(t + 2000), false);
    assert.equal(s.isRunning(), true);
  });

  it("does not trip when already halted (nothing to stop)", () => {
    const s = new OversightState(3000);
    s.heartbeat(1);
    s.halt("manual_kill_switch");
    assert.equal(s.checkDeadMansSwitch(Date.now() + 10_000), false, "already halted, switch is a no-op");
  });

  it("resume refreshes the heartbeat so the switch does not immediately re-trip", () => {
    const s = new OversightState(3000);
    s.heartbeat(1);
    const t = new Date(s.get().lastHeartbeatAt!).getTime();
    s.checkDeadMansSwitch(t + 6000); // trips
    assert.equal(s.isRunning(), false);
    const resumed = s.resume();
    assert.ok(resumed.lastHeartbeatAt, "resume set a fresh heartbeat");
    // Immediately after resume, a check at resume-time must not re-trip.
    const resumeAt = new Date(resumed.lastHeartbeatAt!).getTime();
    assert.equal(s.checkDeadMansSwitch(resumeAt + 1000), false);
  });
});
