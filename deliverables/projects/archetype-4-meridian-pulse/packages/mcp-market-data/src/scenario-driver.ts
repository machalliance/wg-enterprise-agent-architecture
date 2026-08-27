/**
 * Embedded scenario driver.
 *
 * Runs inside the mcp-market-data process (same process, per the design
 * decision: the market-data feed is the only thing the driver touches, so no
 * IPC is needed). It reads seed/scenario-timeline.json and applies each event
 * to the MarketDataStore, making the "continuous market moving" behaviour
 * visible in a short demo.
 *
 * Two modes:
 *   - timed  (default): each event fires on a setTimeout at atSeconds*tickScale,
 *             so the whole timeline plays on its own — good for an unattended
 *             run or a hands-off rehearsal.
 *   - manual: nothing fires on a clock. Events are grouped into demo BEATS and
 *             the presenter advances one beat per stepBeat() call, so each
 *             dramatic moment lands exactly when narrated. The trigger surface
 *             (HTTP / terminal) lives in index.ts; this class just owns the
 *             grouping and the "apply the next group" step.
 *
 * Logging goes to stderr so it never corrupts the MCP stdio transport on stdout.
 */

import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { MarketDataStore, DemandTrend } from "./store.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_DIR = process.env.SEED_DIR
  ? resolve(process.env.SEED_DIR)
  : resolve(__dirname, "..", "..", "..", "seed");

interface TimelineEvent {
  atSeconds: number;
  type:
    | "competitor_price_change"
    | "demand_signal"
    | "inventory_update"
    | "competitor_prices_bulk_update";
  phase?: string;
  sku?: string;
  competitor?: string;
  newPrice?: number;
  trend?: DemandTrend;
  magnitude?: number;
  reason?: string;
  onHandDelta?: number;
  source?: string;
  restoreBaseline?: boolean;
  priceMultiplier?: number;
  demoBeat?: number;
}

interface Timeline {
  durationSeconds: number;
  events: TimelineEvent[];
}

export type ScenarioMode = "timed" | "manual";

/** A group of timeline events the presenter advances through as one unit. */
export interface Beat {
  /** Beat number: from the events' `demoBeat`, or 0 for the ambient steady-state group. */
  beat: number;
  /** The `phase` string shared by the beat's events (for narration), if any. */
  phase?: string;
  events: TimelineEvent[];
}

/** What a single stepBeat() applied, so the trigger surface can report it. */
export interface StepResult {
  /** The beat just applied, or null if there was nothing left to apply. */
  beat: number | null;
  phase?: string;
  /** One line per event applied, e.g. "demand MER-HYD-2L -> rising 40% (applied)". */
  applied: string[];
  /** Beats still waiting after this step. */
  remaining: number;
  /** True once the last beat has been applied. */
  done: boolean;
}

function log(msg: string): void {
  process.stderr.write(`[scenario-driver] ${msg}\n`);
}

export interface ScenarioDriverOptions {
  /** Multiplier applied to each event's atSeconds (timed mode only). 1 = real time. */
  tickScale?: number;
  /** Restart the timeline from the top after it finishes (timed mode only). */
  loop?: boolean;
  /** "timed" (default) fires on a clock; "manual" advances one beat per stepBeat(). */
  mode?: ScenarioMode;
  /**
   * Manual mode only: path to a trigger file whose integer contents are the
   * number of beats the presenter has requested. The driver polls it and applies
   * beats until applied === requested. This is how the beat trigger survives the
   * gateway spawning this stdio child more than once: the trigger is a file, not
   * a port, so there is no bind race and no "which instance owns the socket"
   * ambiguity — the live instance (the one the gateway routes tools to) reads the
   * same file the presenter writes. Omit to disable polling (tests drive
   * stepBeat() directly).
   */
  triggerFile?: string;
  /** Manual-mode trigger-file poll interval in ms (default 400). */
  pollIntervalMs?: number;
}

export class ScenarioDriver {
  private readonly timeline: Timeline;
  private readonly timers: NodeJS.Timeout[] = [];
  private readonly options: Required<ScenarioDriverOptions>;
  private running = false;

  /** Beats in advance order (ambient beat 0 first, then ascending). Manual mode. */
  private readonly beats: Beat[];
  /** Index of the next beat stepBeat() will apply. Manual mode. */
  private nextBeatIndex = 0;
  /** Manual-mode trigger-file poll timer, if a triggerFile was given. */
  private pollTimer?: NodeJS.Timeout;

  constructor(
    private readonly store: MarketDataStore,
    options: ScenarioDriverOptions = {},
  ) {
    this.options = {
      tickScale: options.tickScale ?? 1,
      loop: options.loop ?? false,
      mode: options.mode ?? "timed",
      triggerFile: options.triggerFile ?? "",
      pollIntervalMs: options.pollIntervalMs ?? 400,
    };
    this.timeline = JSON.parse(
      readFileSync(resolve(SEED_DIR, "scenario-timeline.json"), "utf8"),
    ) as Timeline;
    this.beats = groupIntoBeats(this.timeline.events);
  }

  get isManual(): boolean {
    return this.options.mode === "manual";
  }

  /** The beat grouping, exposed for the trigger surface and for tests. */
  getBeats(): readonly Beat[] {
    return this.beats;
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    if (this.isManual) {
      log(
        `manual mode: ${this.beats.length} beats ready ` +
          `(${this.beats.map((b) => b.beat).join(", ")}). Advance with stepBeat().`,
      );
      if (this.options.triggerFile) {
        log(`watching trigger file ${this.options.triggerFile} (poll ${this.options.pollIntervalMs}ms)`);
        this.pollTimer = setInterval(() => {
          void this.pollTrigger();
        }, this.options.pollIntervalMs);
      }
      return; // nothing fires until the presenter advances
    }

    log(
      `starting timeline: ${this.timeline.events.length} events over ` +
        `${this.timeline.durationSeconds}s (tickScale=${this.options.tickScale}, loop=${this.options.loop})`,
    );
    this.scheduleAll();
  }

  /**
   * Manual mode: apply the next beat's events and report what happened.
   * Idempotent past the end — extra calls return {beat:null, done:true}.
   */
  stepBeat(): StepResult {
    if (this.nextBeatIndex >= this.beats.length) {
      return { beat: null, applied: [], remaining: 0, done: true };
    }
    const group = this.beats[this.nextBeatIndex]!; // guarded by the bounds check above
    this.nextBeatIndex++;
    const applied = group.events.map((e) => this.apply(e));
    const remaining = this.beats.length - this.nextBeatIndex;
    log(
      `beat ${group.beat}${group.phase ? ` (${group.phase})` : ""}: applied ${applied.length} event(s), ${remaining} beat(s) remaining`,
    );
    return {
      beat: group.beat,
      phase: group.phase,
      applied,
      remaining,
      done: remaining === 0,
    };
  }

  /**
   * Manual mode: read the trigger file's integer (beats requested) and apply
   * beats until we have caught up. The file is the source of truth, so this is
   * safe if the file is written by another process (the presenter/stepper or the
   * control plane) and idempotent against re-reads — we only ever move forward,
   * never re-apply a beat. A missing/empty/garbage file means "no steps yet".
   */
  private async pollTrigger(): Promise<void> {
    let requested = 0;
    try {
      const raw = await readFile(this.options.triggerFile, "utf8");
      const n = Number.parseInt(raw.trim(), 10);
      requested = Number.isFinite(n) && n > 0 ? n : 0;
    } catch {
      return; // file not created yet — nothing requested
    }
    while (this.nextBeatIndex < requested && this.nextBeatIndex < this.beats.length) {
      this.stepBeat();
    }
  }

  private scheduleAll(): void {
    for (const event of this.timeline.events) {
      const delayMs = event.atSeconds * 1000 * this.options.tickScale;
      const timer = setTimeout(() => this.apply(event), delayMs);
      this.timers.push(timer);
    }

    if (this.options.loop) {
      const loopMs = this.timeline.durationSeconds * 1000 * this.options.tickScale;
      const timer = setTimeout(() => {
        log("timeline complete; looping");
        this.timers.length = 0;
        this.scheduleAll();
      }, loopMs);
      this.timers.push(timer);
    }
  }

  /** Apply one event to the store; returns a one-line human-readable summary. */
  private apply(event: TimelineEvent): string {
    const beat = event.demoBeat ? ` [demo beat ${event.demoBeat}]` : "";
    const prefix = `${event.phase ?? ""}${beat}`;
    let line: string;
    switch (event.type) {
      case "competitor_price_change": {
        if (event.sku && event.competitor && event.newPrice !== undefined) {
          const ok = this.store.setCompetitorPrice(event.sku, event.competitor, event.newPrice);
          line = `competitor ${event.competitor} on ${event.sku} -> $${event.newPrice} (${ok ? "applied" : "unknown SKU"})`;
        } else {
          line = `competitor_price_change skipped (incomplete event)`;
        }
        break;
      }
      case "demand_signal": {
        if (event.sku && event.trend && event.magnitude !== undefined) {
          const ok = this.store.setDemandSignal(
            event.sku,
            event.trend,
            event.magnitude,
            event.reason ?? "",
          );
          line = `demand ${event.sku} -> ${event.trend} ${(event.magnitude * 100).toFixed(0)}% (${ok ? "applied" : "unknown SKU"})`;
        } else {
          line = `demand_signal skipped (incomplete event)`;
        }
        break;
      }
      case "inventory_update": {
        if (event.sku && event.onHandDelta !== undefined) {
          const ok = this.store.adjustInventory(event.sku, event.onHandDelta);
          line = `inventory ${event.sku} delta ${event.onHandDelta} (${ok ? "applied" : "unknown SKU"})`;
        } else {
          line = `inventory_update skipped (incomplete event)`;
        }
        break;
      }
      case "competitor_prices_bulk_update": {
        if (!event.source) {
          line = `competitor_prices_bulk_update skipped (no source)`;
        } else if (event.restoreBaseline) {
          const n = this.store.restoreCompetitorBaselineBySource(event.source);
          line = `restored ${n} ${event.source} quotes to baseline`;
        } else if (event.priceMultiplier !== undefined) {
          const n = this.store.bulkMultiplyCompetitorPriceBySource(event.source, event.priceMultiplier);
          const pctOff = Math.round((1 - event.priceMultiplier) * 100);
          line = `GLITCH: ${event.source} fat-fingered ${pctOff}% off — multiplied ${n} quotes by ${event.priceMultiplier}`;
        } else if (event.newPrice !== undefined) {
          const n = this.store.bulkSetCompetitorPriceBySource(event.source, event.newPrice);
          line = `GLITCH: set ${n} ${event.source} quotes -> $${event.newPrice}`;
        } else {
          line = `competitor_prices_bulk_update skipped (no newPrice/priceMultiplier/restoreBaseline)`;
        }
        break;
      }
    }
    log(`${prefix} ${line}`);
    return line;
  }

  stop(): void {
    for (const timer of this.timers) clearTimeout(timer);
    this.timers.length = 0;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    this.running = false;
    log("stopped");
  }
}

/**
 * Group timeline events into ordered beats.
 *
 * The grouping key is `phase`, not `demoBeat`: only the FIRST event of each beat
 * carries a `demoBeat` tag, but every event in a beat shares the same `phase`
 * (verified against the seed). Grouping by `demoBeat ?? 0` would wrongly sweep a
 * beat's untagged continuation events (e.g. the demand rise that accompanies the
 * competitor undercut) into the ambient group, so a step would fire an incomplete
 * beat. Grouping by `phase` keeps each beat whole.
 *
 * Beats are ordered by their earliest event (so steady-state opens, recovery
 * closes), event order within a beat is preserved, and the display `beat` number
 * is taken from whichever event in the group carries a `demoBeat` (0 for the
 * ambient steady-state group that has none). Beat numbers need not be contiguous:
 * the timeline has no beat 1 (M1 was identity, not a market event).
 *
 * Exported so tests can assert the grouping directly against the seed.
 */
export function groupIntoBeats(events: TimelineEvent[]): Beat[] {
  const byPhase = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const key = event.phase ?? "";
    const bucket = byPhase.get(key);
    if (bucket) bucket.push(event);
    else byPhase.set(key, [event]);
  }
  return [...byPhase.values()]
    // order beats by their earliest event so the timeline reads front to back
    .sort((a, b) => a[0]!.atSeconds - b[0]!.atSeconds)
    .map((beatEvents) => ({
      beat: beatEvents.find((e) => e.demoBeat !== undefined)?.demoBeat ?? 0,
      phase: beatEvents.find((e) => e.phase)?.phase,
      events: beatEvents,
    }));
}
