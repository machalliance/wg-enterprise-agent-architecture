/**
 * Runtime oversight state (M5): halt status + heartbeat dead-man's-switch.
 *
 * Held in memory in the control plane. The policy server consults `running`
 * before executing a write; the agent loop consults it between cycles. A halt
 * preserves state (the checkpoint store already has it) and waits for a human.
 */

export type HaltReason =
  | "manual_kill_switch"
  | "rate_limit_hour"
  | "rate_limit_burst"
  | "magnitude_limit"
  | "anomaly_extreme"
  | "dead_mans_switch"
  | null;

export interface AgentStatus {
  running: boolean;
  haltReason: HaltReason;
  haltedAt: string | null;
  lastHeartbeatAt: string | null;
  lastCycle: number | null;
  dataFilter: string | null; // e.g. "ignore competitor source FeedX" after recovery
}

export class OversightState {
  private status: AgentStatus = {
    running: true,
    haltReason: null,
    haltedAt: null,
    lastHeartbeatAt: null,
    lastCycle: null,
    dataFilter: null,
  };

  /** Dead-man's-switch: if no heartbeat within this many ms, auto-halt. */
  constructor(private readonly heartbeatTimeoutMs = Number(process.env.HEARTBEAT_TIMEOUT_MS ?? "60000")) {}

  get(): AgentStatus {
    return { ...this.status };
  }

  isRunning(): boolean {
    return this.status.running;
  }

  halt(reason: Exclude<HaltReason, null>): AgentStatus {
    if (this.status.running) {
      this.status.running = false;
      this.status.haltReason = reason;
      this.status.haltedAt = new Date().toISOString();
    }
    return this.get();
  }

  resume(dataFilter: string | null = null): AgentStatus {
    this.status.running = true;
    this.status.haltReason = null;
    this.status.haltedAt = null;
    this.status.dataFilter = dataFilter;
    // Fresh heartbeat so the dead-man's-switch doesn't immediately re-trip.
    this.status.lastHeartbeatAt = new Date().toISOString();
    return this.get();
  }

  heartbeat(cycle?: number): void {
    this.status.lastHeartbeatAt = new Date().toISOString();
    if (typeof cycle === "number") this.status.lastCycle = cycle;
  }

  /**
   * Check the dead-man's-switch. If the agent was running but has not sent a
   * heartbeat within the timeout, auto-halt. Returns true if it just tripped.
   */
  checkDeadMansSwitch(now: number = Date.now()): boolean {
    if (!this.status.running) return false;
    if (!this.status.lastHeartbeatAt) return false; // no heartbeat yet = not started
    const last = new Date(this.status.lastHeartbeatAt).getTime();
    if (now - last > this.heartbeatTimeoutMs) {
      this.halt("dead_mans_switch");
      return true;
    }
    return false;
  }
}
