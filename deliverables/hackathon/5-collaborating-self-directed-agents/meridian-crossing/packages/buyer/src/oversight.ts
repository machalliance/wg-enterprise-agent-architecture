/**
 * The oversight / notification channel, and the "suspend on disconnect" safeguard inherited from
 * Archetype 4. Tier 2 (NOTIFY_ON_SETTLE) pushes a notification to the buying team when it settles; the
 * safeguard says: if that channel is DOWN, the buyer must not commit new deals it cannot report — so a
 * disconnected channel suspends new ACCEPTs (a negotiation may continue to non-terminal states, but no
 * settle goes out).
 *
 * Modelled as an in-process channel with an up/down flag and a captured notification log so a test can
 * assert both the notify path and the suspend-on-disconnect path.
 */
export interface Notification {
  kind: "settle" | "escalation" | "walkaway" | "kill";
  supplierDid: string;
  negotiationId: string;
  message: string;
}

export class OversightChannel {
  // No initialiser: the constructor assigns it unconditionally, so `= true` here was dead — and worse,
  // it read as the default when the real default lives in the constructor's parameter.
  private up: boolean;
  private readonly log: Notification[] = [];
  /** Notifications that could not be delivered because the channel was down, oldest first. Kept rather
   *  than discarded: a dropped notification is an unreported action, and the suspend-on-disconnect
   *  safeguard only covers deals not yet committed — anything already settled when the link went down
   *  still owes the team a message. */
  private readonly undelivered: Notification[] = [];

  constructor(connected = true) {
    this.up = connected;
  }

  get connected(): boolean {
    return this.up;
  }

  /** Simulate the oversight link going down / coming back — the suspend-on-disconnect trigger.
   *  Coming back UP flushes whatever was missed while it was down, in order. */
  setConnected(connected: boolean): void {
    const reconnected = connected && !this.up;
    this.up = connected;
    if (reconnected) this.flushUndelivered();
  }

  /** Push a notification. Returns false if the channel is down — the notification is QUEUED, not lost. */
  notify(n: Notification): boolean {
    if (!this.up) {
      this.undelivered.push(n);
      return false;
    }
    this.log.push(n);
    return true;
  }

  notifications(): Notification[] {
    return [...this.log];
  }

  /** What is still owed to the team. Non-empty means someone has not been told something. */
  pending(): Notification[] {
    return [...this.undelivered];
  }

  /** Deliver everything queued while the channel was down. Returns how many were flushed. */
  flushUndelivered(): number {
    if (!this.up || this.undelivered.length === 0) return 0;
    const n = this.undelivered.length;
    this.log.push(...this.undelivered);
    this.undelivered.length = 0;
    return n;
  }
}
