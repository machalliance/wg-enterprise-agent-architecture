import {
  discoverByProduct,
  discoverySignature,
  makeDirectoryClient,
  verifyCounterparty,
  type DiscoveredCandidate,
  type Signer,
  type Tracer,
  type Transport,
} from "@meridian/agent-runtime";
import type { CapabilityAd } from "@meridian/protocol";
import type { HalfTrail, Trail } from "@meridian/agent-runtime";
import { evaluate } from "./policy.js";
import type { Mandate } from "./mandate.js";
import type { Governor } from "./governor.js";
import { runNegotiation, type NegotiationChannel, type NegotiationOutcome, type Reasoner } from "./negotiate.js";
import { QuoteBoard } from "./quote-board.js";
import { CommitCoordinator } from "./commit-coordinator.js";
import type { ApprovalItem, ApprovalOutcome } from "./approval-queue.js";

/**
 * The buyer's procurement pipeline: discover → screen → negotiate. ONE implementation, shared by both
 * entrypoints.
 *
 * WHY THIS FILE EXISTS. `index.ts` (batch: run, print, exit) and `server.ts` (long-lived: paced, with a
 * dashboard, human approval and settlement) each held their own copy of this flow. The copy had already
 * failed once — the note still in `index.ts` records a bug where one copy compared candidate COUNT for
 * directory stability while the other compared candidate IDENTITY, so the batch path opened negotiations
 * against a directory view that was still churning. That fix extracted `discoverySignature` and left both
 * loops standing, which fixed the symptom and not the cause.
 *
 * It was failing again by the time this was written, more quietly: the two `negotiation-end` trail
 * records had diverged. The batch path wrote `settleGate` and `reputation`; the served path did not. Same
 * event name, same durable artifact, different schema depending on which binary produced it — so a
 * question like "was this settle downgraded by a shared safeguard?" was answerable for some runs and not
 * others, with nothing marking which kind of run you were reading.
 *
 * So the trail writes live HERE, not in the callers. The hooks below exist for what genuinely differs —
 * console presentation, pacing, human approval, settlement — and deliberately not for the record-keeping,
 * because "both callers remember to write the same fields" is precisely the discipline that failed twice.
 */

/** A candidate that cleared every screening stage, with the trust level that rides into tier decisions. */
export interface ClearedCandidate {
  ad: CapabilityAd;
  level: "VERIFIED" | "LIMITED";
}

/** One screening decision, for a caller that wants to narrate it. The trail entry is already written. */
export interface ScreenEvent {
  stage: "shortfall" | "policy" | "trust";
  admitted: boolean;
  ad: CapabilityAd;
  reason: string;
  /** Present on the trust stage only. REJECTED is a hard block — no message is ever sent to it. */
  level?: "VERIFIED" | "LIMITED" | "REJECTED";
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Poll the directory until the candidate SET stabilizes — suppliers announce asynchronously, so the first
 * answer is rarely the whole field.
 *
 * Stability is candidate IDENTITY, never count (see `discoverySignature`). A set that swaps one supplier
 * for another keeps its length and is not stable; treating it as stable is what let a run start
 * negotiating against a directory view still in flux.
 */
export async function discoverStable(
  product: string,
  opts: { attempts?: number; intervalMs?: number; stableRounds?: number } = {},
): Promise<DiscoveredCandidate[]> {
  const { attempts = 30, intervalMs = 1000, stableRounds = 2 } = opts;
  const dir = await makeDirectoryClient();
  let lastSignature = "";
  let stable = 0;
  let candidates: DiscoveredCandidate[] = [];
  for (let i = 0; i < attempts; i++) {
    try {
      candidates = await discoverByProduct(dir, product);
    } catch {
      candidates = [];
    }
    const signature = discoverySignature(candidates);
    if (signature && signature === lastSignature) {
      if (++stable >= stableRounds) break;
    } else {
      stable = 0;
    }
    lastSignature = signature;
    await delay(intervalMs);
  }
  return candidates;
}

/**
 * The three screening stages, in the order a candidate must survive them:
 *
 *   1. SHORTFALL — can it cover the units within the deadline? (advertised, not yet verified)
 *   2. POLICY    — findable is not the same as cleared to buy; a buyer-private allow/deny gate.
 *   3. TRUST     — the three-part cryptographic identity check. REJECTED is a HARD block: no negotiation
 *                  message is ever exchanged with it. VERIFIED/LIMITED proceed, and the level rides
 *                  downstream to gate how far a settle may go without escalation.
 *
 * Every decision is appended to the caller's trail here, so both entrypoints produce identical records.
 * `onScreen` is presentation only.
 */
export function screenCandidates(
  candidates: DiscoveredCandidate[],
  need: { unitsNeeded: number; deadlineDays: number },
  trail: Trail,
  onScreen?: (ev: ScreenEvent) => void,
): ClearedCandidate[] {
  const report = (ev: ScreenEvent): void => {
    trail.append({
      event: ev.admitted ? "admitted" : "dropped",
      stage: ev.stage,
      did: ev.ad.did,
      reason: ev.reason,
      ...(ev.level ? { level: ev.level } : {}),
    });
    onScreen?.(ev);
  };

  const cleared: ClearedCandidate[] = [];
  for (const c of candidates) {
    const ad = c.ad;
    if (ad.maxUnits < need.unitsNeeded || ad.minLeadTimeDays > need.deadlineDays) {
      report({
        stage: "shortfall",
        admitted: false,
        ad,
        reason: `advertises ${ad.maxUnits}u/${ad.minLeadTimeDays}d vs need ${need.unitsNeeded}u/${need.deadlineDays}d`,
      });
      continue;
    }

    const policy = evaluate(ad);
    report({ stage: "policy", admitted: policy.admitted, ad, reason: policy.reason });
    if (!policy.admitted) continue;

    const trust = verifyCounterparty(ad);
    // `checks` rides on the trust record only — it is the evidence for the level, and the generic
    // reporter above has no field for it.
    trail.append({
      event: trust.level === "REJECTED" ? "dropped" : "admitted",
      stage: "trust",
      did: ad.did,
      level: trust.level,
      reason: trust.reason,
      checks: trust.checks,
    });
    onScreen?.({ stage: "trust", admitted: trust.level !== "REJECTED", ad, reason: trust.reason, level: trust.level });
    if (trust.level === "REJECTED") continue;
    cleared.push({ ad, level: trust.level });
  }
  return cleared;
}

/** Everything a negotiation needs that is the same for every supplier in a run. */
export interface NegotiationContext {
  buyerDid: string;
  mandate: Mandate;
  governor: Governor;
  /** The wire transport. Required in both entrypoints; optional here only because `channelFor` can
   *  stand in for it. `runNegotiation` refuses a negotiation that has neither. */
  transport?: Transport;
  /**
   * In-process channel factory — the SAME seam the negotiation suites already drive `runNegotiation`
   * through, lifted one level so the pipeline itself can be exercised. When set it replaces the
   * transport, so a test gets the real barrier, the real trail records and the real hooks against seller
   * engines in the same process: no directory, no ports, no HTTP.
   *
   * Neither entrypoint sets it. It exists because the alternative was leaving `negotiateAll` — which is
   * the thing that now owns the `negotiation-end` record both entrypoints used to write differently —
   * covered only by a full demo run.
   */
  channelFor?: (ad: CapabilityAd) => NegotiationChannel;
  signer: Signer;
  trail: Trail;
  halfTrail?: HalfTrail;
  tracer?: Tracer;
  reasoner?: Reasoner;
  orgName?: string;
}

/** The hooks that genuinely differ between the batch and served entrypoints. */
export interface NegotiateAllHooks {
  /** Delay between turns. The served path paces so an audience can follow and the kill switch has a live
   *  window; the batch path leaves it unset and runs flat out. */
  paceMs?: number;
  /** When set, an APPROVE_BEFORE_COMMIT escalation BLOCKS on the operator instead of resolving at once. */
  onEscalation?: (item: ApprovalItem) => Promise<ApprovalOutcome>;
  /** Called as each negotiation resolves, BEFORE the others finish — this is what lets the served path
   *  show one supplier's settle while another is still waiting on a human. Awaited, so a hook that opens
   *  a payment completes before the run is reported done. */
  onResolved?: (outcome: NegotiationOutcome) => void | Promise<void>;
  /** Called for a negotiation that threw. The default records it on the trail and continues; a throw here
   *  must not take down the sibling deals. */
  onError?: (err: unknown) => void;
}

/**
 * Open one negotiation per cleared supplier, IN PARALLEL, behind a shared commit barrier.
 *
 * The barrier is the point: no supplier is committed to until every parallel negotiation has revealed its
 * best-and-final, and only then is the single best committable offer chosen (the rest stand down). That
 * is what stops the buyer binding to one supplier before it knows what another would have offered. Every
 * cleared supplier is a participant and each reports exactly once — including one that throws, which
 * `runNegotiation`'s own backstop withdraws, so the barrier can never hang.
 */
export async function negotiateAll(
  cleared: ClearedCandidate[],
  ctx: NegotiationContext,
  hooks: NegotiateAllHooks = {},
): Promise<NegotiationOutcome[]> {
  const { trail } = ctx;
  const coordinator = new CommitCoordinator(cleared.length, {
    onSelect: ({ mode, winner, candidates }) =>
      trail.append({
        event: "commit-selection",
        mode,
        winner: winner ? { did: winner.supplierDid, agentName: winner.agentName, terms: winner.terms } : undefined,
        candidates: candidates.map((k) => ({ did: k.supplierDid, agentName: k.agentName, terms: k.terms, tier: k.tier })),
      }),
  });
  // Meridian's own view of the quotes on its desk, shared across the concurrent negotiations so each can
  // press against a live competing price rather than an abstract alternative. See quote-board.ts.
  const quoteBoard = new QuoteBoard();

  const outcomes: NegotiationOutcome[] = [];
  await Promise.allSettled(
    cleared.map(({ ad, level }) =>
      runNegotiation({
        transport: ctx.transport,
        channel: ctx.channelFor?.(ad),
        signer: ctx.signer,
        buyerDid: ctx.buyerDid,
        mandate: ctx.mandate,
        governor: ctx.governor,
        trust: level,
        ad,
        trail,
        reasoner: ctx.reasoner,
        halfTrail: ctx.halfTrail,
        tracer: ctx.tracer,
        orgName: ctx.orgName,
        parallelNegotiations: cleared.length,
        commitCoordinator: coordinator,
        quoteBoard,
        paceMs: hooks.paceMs,
        onEscalation: hooks.onEscalation,
      })
        .then(async (o) => {
          outcomes.push(o);
          // The ONE place a `negotiation-end` record is written. `reasonCode` is the protocol's own typed
          // terminal code and `detail` is operator-facing prose that must never be parsed to recover it
          // (see NegotiationOutcome.reasonCode); `settleGate` and `reputation` were present on one
          // entrypoint's copy of this and absent from the other's, which is the divergence that motivated
          // this module.
          trail.append({
            event: "negotiation-end",
            did: o.supplierDid,
            negotiationId: o.negotiationId,
            result: o.result,
            reasonCode: o.reasonCode,
            tier: o.tier,
            terms: o.terms,
            rounds: o.rounds,
            detail: o.detail,
            settleGate: o.settleGate,
            reputation: o.reputation,
          });
          await hooks.onResolved?.(o);
        })
        // `.catch` CHAINED, not a second argument to the `.then` above. As `then(onOk, onErr)` the
        // rejection handler saw only `runNegotiation`'s own failures: a throw from `trail.append` or from
        // `await hooks.onResolved` rejected the promise `then` returned, `Promise.allSettled` discarded
        // that rejection, and the failure vanished — no `negotiation-error` record, no `onError` call, no
        // console line. `server.ts` passes an `onResolved` that opens the PaymentIntent and sends the
        // USDC, so the silent path was the money path.
        .catch((err) => {
          trail.append({ event: "negotiation-error", reason: String(err) });
          hooks.onError?.(err);
        }),
    ),
  );
  return outcomes;
}
