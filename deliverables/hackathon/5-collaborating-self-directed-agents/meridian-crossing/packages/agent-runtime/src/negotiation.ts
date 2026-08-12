import type { NegotiationType, ReasonCode } from "@meridian/protocol";

/**
 * The shared turn-taking state machine. Both roles run their OWN copy of this (buyer and
 * supplier share no memory), so an illegal move is caught BEFORE it is sent AND again by the
 * receiver. "A message that is not a legal successor for its negotiationId/round is rejected and
 * logged." Ambiguity is the enemy the chapter names — this removes it.
 *
 *         RFQ
 *          │
 *          ▼
 *     ┌─ QUOTE ◄────────┐
 *     │    │            │ COUNTER (either side, references prior round)
 *     │    ▼            │
 *     │  COUNTER ───────┘
 *     │    │
 *     │    ├── ACCEPT ──────────────► [SETTLED]   (terminal — one message, no CONFIRM)
 *     │    │
 *     └────┴── WALKAWAY ───────────► [WALKED / WITHDRAWN / IMPASSE]  (terminal, either side, any time)
 *
 * The WALKAWAY terminal is WIDENED so A2CN's terminal vocabulary maps losslessly BOTH ways (see
 * a2cn.ts). A generic walk stays `WALKED` (↔ A2CN `REJECTED_FINAL`); a clean mutual disengage
 * becomes `WITHDRAWN`; a budget/round exhaustion becomes `IMPASSE`. The refinement is driven by the
 * WALKAWAY's reasonCode, so the default profile — which never supplies a reasonCode to the machine —
 * still lands in `WALKED`. Nothing about the transitions changes.
 */

export type NegotiationState =
  | "START" // nothing sent yet
  | "AWAIT_QUOTE" // buyer sent RFQ, waiting on the supplier's QUOTE
  | "NEGOTIATING" // a QUOTE/COUNTER is on the table
  | "SETTLED" // terminal — a single ACCEPT committed the deal (↔ A2CN COMPLETED)
  | "WALKED" // terminal — a generic WALKAWAY (↔ A2CN REJECTED_FINAL)
  | "WITHDRAWN" // terminal — a clean, mutual disengage with no deal (↔ A2CN WITHDRAWN)
  | "IMPASSE"; // terminal — budget/round exhausted (↔ A2CN REJECTED_FINAL for budget, TIMED_OUT for timeout)

export const TERMINAL_STATES: ReadonlySet<NegotiationState> = new Set([
  "SETTLED",
  "WALKED",
  "WITHDRAWN",
  "IMPASSE",
]);

/**
 * Resolve a WALKAWAY's `reasonCode` to the terminal state it lands in. This is the single
 * source of truth the state machine AND the A2CN codec share, so the internal model and the wire
 * mapping can never drift. A missing reasonCode (the default) collapses to the generic `WALKED`.
 */
export function walkawayTerminal(reasonCode?: ReasonCode): "WALKED" | "WITHDRAWN" | "IMPASSE" {
  switch (reasonCode) {
    case "BUDGET_EXHAUSTED":
    case "TIMEOUT":
      return "IMPASSE";
    case "DONE":
      return "WITHDRAWN";
    default:
      // OUT_OF_TERMS / POLICY / undefined — a substantive rejection of the offer on the table.
      return "WALKED";
  }
}

/** Thrown when a message is not a legal successor. Carries enough context to log the drop. */
export class IllegalTransition extends Error {
  constructor(
    readonly negotiationId: string,
    readonly from: NegotiationState,
    readonly type: NegotiationType,
    readonly detail: string,
  ) {
    super(`illegal ${type} in state ${from} for ${negotiationId}: ${detail}`);
    this.name = "IllegalTransition";
  }
}

/** The minimal view of a message the machine needs — works on an Envelope or a NegotiationMsg. */
export interface MoveView {
  negotiationId: string;
  type: NegotiationType;
  round: number;
  correlationId: string;
  inReplyTo?: string;
  /** A WALKAWAY's reason code, so the machine can pick WALKED/WITHDRAWN/IMPASSE. Optional;
   *  the default (meridian) callers omit it and a WALKAWAY collapses to WALKED. */
  reasonCode?: ReasonCode;
}

export interface NegotiationRecord {
  negotiationId: string;
  state: NegotiationState;
  /** Highest round seen so far — the wire round must never go backwards. */
  round: number;
  /** correlationId of the last admitted message, for inReplyTo chaining. */
  lastCorrelationId?: string;
  lastType?: NegotiationType;
  /** Compact turn log — the sequence reconstructable from this side alone. */
  history: Array<{ type: NegotiationType; round: number; correlationId: string }>;
  /** Every correlationId admitted for this negotiation — the §13.1 in-session replay guard. */
  seen: Set<string>;
}

/** The legal next verbs from each non-terminal state. */
const SUCCESSORS: Record<NegotiationState, ReadonlySet<NegotiationType>> = {
  START: new Set<NegotiationType>(["RFQ"]),
  AWAIT_QUOTE: new Set<NegotiationType>(["QUOTE", "WALKAWAY"]),
  NEGOTIATING: new Set<NegotiationType>(["COUNTER", "ACCEPT", "WALKAWAY"]),
  SETTLED: new Set<NegotiationType>(),
  WALKED: new Set<NegotiationType>(),
  WITHDRAWN: new Set<NegotiationType>(),
  IMPASSE: new Set<NegotiationType>(),
};

function nextState(type: NegotiationType, reasonCode?: ReasonCode): NegotiationState {
  switch (type) {
    case "RFQ":
      return "AWAIT_QUOTE";
    case "QUOTE":
    case "COUNTER":
      return "NEGOTIATING";
    case "ACCEPT":
      return "SETTLED"; // one message settles; there is no CONFIRM to wait for
    case "WALKAWAY":
      return walkawayTerminal(reasonCode);
  }
}

/**
 * Tracks every negotiation this process is party to, keyed by negotiationId. Parallel negotiations
 * never cross-talk because each id has its own record. Call `admit` on EVERY message this process
 * sends and receives — that is what keeps the two independent state machines in lock-step.
 */
export class NegotiationTracker {
  private readonly records = new Map<string, NegotiationRecord>();

  get(negotiationId: string): NegotiationRecord | undefined {
    return this.records.get(negotiationId);
  }

  state(negotiationId: string): NegotiationState {
    return this.records.get(negotiationId)?.state ?? "START";
  }

  isTerminal(negotiationId: string): boolean {
    return TERMINAL_STATES.has(this.state(negotiationId));
  }

  /**
   * Validate `move` against the current state and record it. Throws IllegalTransition on:
   *   - a verb that is not a legal successor of the current state (e.g. COUNTER after WALKAWAY,
   *     a second ACCEPT after SETTLED),
   *   - a round that goes backwards,
   *   - an inReplyTo that does not chain to the last admitted message.
   * Returns the updated record on success.
   */
  admit(move: MoveView): NegotiationRecord {
    const current = this.records.get(move.negotiationId);
    const from: NegotiationState = current?.state ?? "START";

    if (TERMINAL_STATES.has(from)) {
      throw new IllegalTransition(move.negotiationId, from, move.type, "negotiation already terminal");
    }
    if (!SUCCESSORS[from].has(move.type)) {
      const legal = [...SUCCESSORS[from]].join(", ") || "(none)";
      throw new IllegalTransition(move.negotiationId, from, move.type, `legal successors: ${legal}`);
    }
    // Round must be monotonic non-decreasing across the whole negotiation.
    if (current && move.round < current.round) {
      throw new IllegalTransition(
        move.negotiationId,
        from,
        move.type,
        `round ${move.round} < last round ${current.round}`,
      );
    }
    // A2CN §13.1: "Implementations MUST reject messages with `message_id` values already seen in the
    // session." The turn-taking chain below already stops a straight replay of the LAST message, but
    // not a fresh message that re-uses an earlier id — and ids are load-bearing now: the §9
    // transaction record looks the accepted offer up BY id, so a duplicate could make the two parties
    // bind to different offers.
    if (current?.seen.has(move.correlationId)) {
      throw new IllegalTransition(
        move.negotiationId,
        from,
        move.type,
        `correlationId ${move.correlationId} was already used in this negotiation`,
      );
    }
    // Turn-taking chain: every message after the RFQ must reference its immediate predecessor.
    if (move.type === "RFQ") {
      if (move.inReplyTo) {
        throw new IllegalTransition(move.negotiationId, from, move.type, "RFQ must not set inReplyTo");
      }
    } else if (current && move.inReplyTo !== current.lastCorrelationId) {
      throw new IllegalTransition(
        move.negotiationId,
        from,
        move.type,
        `inReplyTo ${move.inReplyTo ?? "(none)"} does not chain to ${current.lastCorrelationId}`,
      );
    }

    const record: NegotiationRecord = current ?? {
      negotiationId: move.negotiationId,
      state: from,
      round: move.round,
      history: [],
      seen: new Set<string>(),
    };
    record.state = nextState(move.type, move.reasonCode);
    record.round = move.round;
    record.lastCorrelationId = move.correlationId;
    record.lastType = move.type;
    record.history.push({ type: move.type, round: move.round, correlationId: move.correlationId });
    record.seen.add(move.correlationId);
    this.records.set(move.negotiationId, record);
    return record;
  }
}
