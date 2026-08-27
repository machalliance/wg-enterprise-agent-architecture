/**
 * The kill switch, inherited from Archetype 4 and extended outward. Archetype 4's kill switch
 * halted what an agent could do to your OWN systems; here it must sever what the agent is doing in
 * deals with OUTSIDE parties: send WALKAWAY to every live negotiation and release every reservation
 * held for a deal that has not yet committed.
 *
 * It CANNOT un-commit a settled deal. An ACCEPT settles on its own (see protocol/negotiation.ts), so
 * the moment one is emitted the buyer is bound — there is no post-ACCEPT window to revoke in. That is
 * a deliberate consequence of matching A2CN's single-acceptance model: the safeguard did not vanish,
 * it moved EARLIER. Everything that could stop a deal now runs before the ACCEPT is sent.
 *
 * It is a one-way latch: once tripped it stays tripped for the run. Wired to a dashboard button.
 * If settlement is present, `onTrip` also revokes the scoped payment authorization and halts any
 * pending transfer — so a halt reaches the money layer, not just the negotiation state.
 */
export class KillSwitch {
  private tripped = false;
  private reasonText = "";
  private readonly listeners: Array<(reason: string) => void | Promise<void>> = [];
  /** The first trip's listener run. Later trips await THIS rather than resolving immediately. */
  private inFlight?: Promise<void>;

  get active(): boolean {
    return this.tripped;
  }

  get reason(): string {
    return this.reasonText;
  }

  /**
   * Register a side effect to run when the switch trips (e.g. release the ledger's pending holds).
   * May be async — a listener that halts a real transfer returns a promise `trip` awaits.
   *
   * Registering AFTER a trip runs the listener immediately, with the stored reason. The latch is
   * one-way and permanent, so "already tripped" is a state a listener must still honour, not an event
   * it missed: the settlement layer attaches its revoke-authorization listener when the payment
   * machinery comes up, which can be after an early trip, and silently dropping that registration left
   * the kill switch believing it had halted a money layer it never reached.
   *
   * The returned promise is for the immediate case; `trip`'s own promise cannot cover a listener that
   * did not exist when it ran. Callers that need the revoke to have completed should await it.
   */
  onTrip(fn: (reason: string) => void | Promise<void>): Promise<void> {
    this.listeners.push(fn);
    if (!this.tripped) return Promise.resolve();
    // Run it now, but never let the failure escape as an unhandled rejection: every existing caller
    // (see the Governor constructor) registers listeners for side effects and ignores the return value,
    // so a throwing late listener would have taken the process down under Node's default
    // --unhandled-rejections=throw. The rejection is still delivered to a caller that DOES await —
    // `catch` on a separate branch leaves `run` itself untouched — and reported either way, because a
    // revoke that failed is exactly the thing an operator must not learn about from silence.
    const run = (async () => fn(this.reasonText))();
    run.catch((err) => {
      // `reasonText` is passed as DATA, never interpolated into the format string. It originates in the
      // `POST /kill` request body, so a reason of "%s" or "%o" would have consumed the `err` argument
      // and logged a forged line with the real failure silently dropped — in the one message that
      // reports a revoke not running.
      console.error("[kill-switch] a listener registered AFTER the trip failed to run.", {
        reason: this.reasonText,
        error: err,
      });
    });
    return run;
  }

  /**
   * Trip the switch. Idempotent — later trips are ignored so the first reason stands. The latch is set
   * SYNCHRONOUSLY (so `active`/`assertLive` reflect the trip immediately, before any await), then every
   * listener runs — sync ones complete inline, async ones (e.g. a transfer-halt) are AWAITED, so
   * `await trip()` does not return until the money layer has actually settled. Every listener runs even
   * if an earlier one throws or rejects (the money-side revoke must not be skipped because the
   * approval-side revoke failed); collected failures reject together once all have run.
   */
  async trip(reason: string): Promise<void> {
    // A second trip JOINS the first instead of returning immediately. The contract above is that
    // `await trip()` does not return until the money layer has settled; returning a resolved promise to
    // the second caller broke exactly that, and did so for the callers most likely to be relying on it —
    // a dashboard button and an internal halt racing, where the second one continued as though every
    // transfer were already halted. Joining also propagates the AggregateError to BOTH callers, so a
    // listener failure cannot be observed by only whichever call happened to arrive first.
    if (this.inFlight) return this.inFlight;
    this.tripped = true;
    this.reasonText = reason;
    this.inFlight = (async () => {
      // Wrap each call in an async thunk so a synchronous throw becomes a rejected promise too — that way
      // allSettled runs EVERY listener and collects both sync-throw and async-reject failures.
      const results = await Promise.allSettled(this.listeners.map(async (fn) => fn(reason)));
      const failures = results.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));
      if (failures.length) throw new AggregateError(failures, "kill-switch listeners failed");
    })();
    // Same shape as `onTrip` above, and for the same reason: the AggregateError must reach a caller that
    // awaits, without taking the process down for one that does not. `POST /kill` and the internal halts
    // are fire-and-forget in places, so a listener failure would surface as an unhandled rejection —
    // fatal under Node's default --unhandled-rejections=throw, and the crash would be the KILL PATH
    // killing the process it was asked to wind down safely.
    //
    // `catch` on a SEPARATE branch, not on `this.inFlight` itself: reassigning it to the caught promise
    // would swallow the rejection for awaiting callers too, which is the failure this must not trade for.
    this.inFlight.catch((err) => {
      // `reason` is logged as DATA, never interpolated into the format string — it comes from the
      // `POST /kill` body, so a value of "%s"/"%o" would otherwise consume the `err` argument and drop
      // the real failure from the one message reporting that a revoke did not run.
      console.error("[kill-switch] one or more listeners failed during the trip.", { reason, error: err });
    });
    return this.inFlight;
  }

  /** Throw if the switch is active — call between turns to abort a negotiation in flight. */
  assertLive(): void {
    if (this.tripped) throw new KillSwitchTripped(this.reasonText);
  }
}

export class KillSwitchTripped extends Error {
  constructor(reason: string) {
    super(`kill switch tripped: ${reason}`);
    this.name = "KillSwitchTripped";
  }
}
