import { randomUUID } from "node:crypto";
import {
  IllegalTransition,
  NegotiationTracker,
  isPeerRefusal,
  sendSignedEnvelope,
  actHashOf,
  safeOutboundRationale,
  selectWireProfile,
  sendSignedEnvelopeVerbose,
  transactionRecordFromTrail,
  verifyApprovalReceipt,
  wireProfileFromEnv,
  withNegotiationSpan,
  WIRE_PROFILE_ATTR,
  type HalfTrail,
  type MoveView,
  type Signer,
  type Span,
  type Tracer,
  type Trail,
  type Transport,
  type WireProfile,
} from "@meridian/agent-runtime";
import {
  makeEnvelope,
  Terms,
  type CapabilityAd,
  type Envelope,
  type ReasonCode,
  type SignedEnvelope,
  type TrustLevel,
} from "@meridian/protocol";
import type { Mandate } from "./mandate.js";
import type { Tier } from "./classify.js";
import { decide, type Decision, type DecisionContext } from "./strategy.js";
import { SettleBindError, type Governor } from "./governor.js";
import { KillSwitchTripped } from "./kill-switch.js";
import type { ApprovalItem, ApprovalOutcome } from "./approval-queue.js";
import type { CommitCandidate, CommitCoordinator, CommitVerdict } from "./commit-coordinator.js";
import type { QuoteBoard } from "./quote-board.js";
import { NegotiationSession } from "./negotiation-session.js";
import { CounterpartyConduct } from "./counterparty-conduct.js";

/** A pluggable reasoner — deterministic by default, optionally LLM-backed (see llm.ts). */
export type Reasoner = (mandate: Mandate, ctx: DecisionContext) => Promise<Decision> | Decision;

/**
 * A verified reply plus the raw signed payload it arrived as, and the profile that carried it. The
 * raw payload is what the buyer records on its half-trail as the counterparty's non-repudiation
 * artifact; the profile tags the record so it is later read back under the right scheme.
 */
export interface ChannelReply {
  env: Envelope;
  raw: unknown;
  wireProfile: "meridian" | "a2cn";
}

/**
 * The buyer's one-way exchange over the wire, abstracted so the negotiation code path can run both
 * over A2A (default) and in-process (a test wiring the buyer straight to a seller engine) with the
 * SAME crypto and the SAME state machine. It sends a signed envelope and returns the verified reply
 * together with the raw payload the half-trail records.
 */
export interface NegotiationChannel {
  send(signed: SignedEnvelope): Promise<ChannelReply>;
}

export interface NegotiationOutcome {
  supplierDid: string;
  agentName: string;
  negotiationId: string;
  result: "SETTLED" | "ESCALATE" | "WALKED";
  /**
   * Why a WALKED negotiation ended, as the protocol's own typed code rather than prose.
   *
   * The §10 audit log needs this: `reasonToA2cnTerminal` maps DONE to WITHDRAWN and TIMEOUT to
   * TIMED_OUT, and only everything else to REJECTED_FINAL. Without it the server had nothing typed to
   * read and recorded every walk as REJECTED_FINAL — so an amicable stand-down (a sibling deal won the
   * units; the buyer sends DONE) was filed in a compliance artifact as a final rejection of that
   * supplier. `detail` is operator-facing prose and must never be parsed to recover this.
   */
  reasonCode?: ReasonCode;
  terms?: Terms;
  /** The tier the terminal terms classified into. */
  tier?: Tier;
  rounds: number;
  detail: string;
  /** Present when a tier-approved settle was downgraded to a hold by a shared safeguard. */
  settleGate?: string;
  /** The counterparty's reputation at the end of the negotiation (after any down-weighting). */
  reputation?: number;
  /** correlationId of the last message exchanged — the chain anchor for the illegal-move probe. */
  lastCorrelationId?: string;
  /** A2CN §9: this org's OWN derived transaction-record hash for a settled deal. */
  recordHash?: string;
  /** The counterparty's derived record hash, as volunteered on the ACK. */
  counterpartyRecordHash?: string;
  /** True when both independently-derived records hash identically — the agreement proof. Undefined
   *  when either side did not produce one (e.g. a test path with no half-trail). */
  recordsAgree?: boolean;
  /** Set when the settling exchange completed but broke protocol (e.g. the supplier answered the
   *  binding ACCEPT with something other than an ACK). The deal still stands — the ACCEPT bound the
   *  buyer — so this is carried as a recorded anomaly rather than an un-settle. */
  settleAnomaly?: string;
}

export interface NegotiateOptions {
  buyerDid: string;
  mandate: Mandate;
  governor: Governor;
  /** The trust level for this counterparty — an input to the tier classification. */
  trust: TrustLevel;
  ad: CapabilityAd;
  trail: Trail;
  signer: Signer;
  reasoner?: Reasoner;
  /** Wire transport (used to build the default channel). Optional if `channel` is supplied. */
  transport?: Transport;
  /** Pre-built channel (e.g. an in-process one). Overrides `transport` when present. */
  channel?: NegotiationChannel;
  /** Sink for every outbound signed envelope — the no-leak lint reads exactly what went on the wire. */
  onOutbound?: (signed: SignedEnvelope) => void;
  /** This organization's display name, declared on the RFQ and carried into the §9 transaction record's
   *  `parties.initiator.organization_name`. Defaults to the DID's own label. */
  orgName?: string;
  /** The buyer's own signed half-trail. When set, every negotiation message this deal sends and
   *  receives is appended as a tamper-evident record (the buyer's provable half of the exchange). */
  halfTrail?: HalfTrail;
  /** When set, the whole negotiation runs inside one OTel span (one trace per negotiationId). */
  tracer?: Tracer;
  /** Delay between turns so the dashboard can render the exchange and the kill switch has a live
   *  window. 0/undefined keeps the batch/test path at full speed. */
  paceMs?: number;
  /** When set, an APPROVE_BEFORE_COMMIT escalation BLOCKS on the operator's decision instead of
   *  finalizing immediately. On "approved" the held deal proceeds to a real ACCEPT on the same live
   *  channel; on "rejected"/"timeout" the deal stays held. Only the buyer server passes this — the
   *  batch/test path leaves it unset, so escalation resolves immediately exactly as before. */
  onEscalation?: (item: ApprovalItem) => Promise<ApprovalOutcome>;
  /** When set, this negotiation does NOT commit on its own. On reaching a committable settle-tier offer
   *  it reveals that offer to the shared barrier and waits: no ACCEPT goes out until every parallel
   *  negotiation sharing this coordinator has revealed its best-and-final, and only the selected winner
   *  commits (the rest stand down). This is what keeps the buyer from binding to one supplier before it
   *  knows another's best offer. Unset (the batch/test path) keeps the immediate autonomous settle. */
  commitCoordinator?: CommitCoordinator;
  /** How many suppliers the buyer is negotiating with in parallel, including this one. Passed to the
   *  reasoner as the buyer's BATNA; see DecisionContext.parallelNegotiations. Defaults to 1, which is
   *  the honest answer for the single-negotiation test and batch paths. */
  parallelNegotiations?: number;
  /** Meridian's shared view of every quote on its desk. Each negotiation posts its supplier's standing
   *  offer here every round and reads its rivals' back, so a thread can negotiate against a live
   *  competing price instead of an abstract claim that alternatives exist. Intra-org and unsigned by
   *  design — see quote-board.ts for why that is not the cross-org read this codebase deleted. */
  quoteBoard?: QuoteBoard;
}

/**
 * Dial the counterparty and AGREE the wire profile with it.
 *
 * `preference` is what this process would like to speak (`WIRE_PROFILE`). What it actually speaks is
 * `selectWireProfile(preference, card)`: A2CN only when the counterparty's own card advertises the
 * extension, `meridian` otherwise. That negotiation used to be skipped entirely — `selectWireProfile`
 * existed, was documented as the mechanism, and was called by nothing outside the tests — so a buyer set
 * to `a2cn` encoded A2CN at every supplier regardless of its card, and a supplier on the default profile
 * refused every negotiation verb (`profileForInbound`) instead of the pair quietly downgrading. The
 * README's "falls back to meridian with no code change" was true of a function and false of the system.
 *
 * An INJECTED channel (the in-process test wiring) keeps the preference: there is no card to read, and
 * both halves of that pairing are built by the same caller, which is the thing a card would be telling us.
 */
async function connectChannel(
  opts: NegotiateOptions,
  preference: WireProfile,
): Promise<{ channel: NegotiationChannel; profile: WireProfile }> {
  if (opts.channel) return { channel: opts.channel, profile: preference };
  if (!opts.transport) throw new Error("runNegotiation requires either a channel or a transport");
  const { client, card } = await opts.transport.connect(opts.ad.a2aEndpoint);
  const profile = selectWireProfile(preference, card);
  // Pass the signer so the agreed wire profile can produce its own signature (A2CN's protocol-act JWS);
  // meridian ignores it. `profile` is captured ONCE here and handed back to the caller, so the encoder,
  // the half-trail tag and the trace attribute are all the same value — see `runNegotiation`.
  return {
    channel: {
      async send(signed): Promise<ChannelReply> {
        const reply = await sendSignedEnvelopeVerbose(client, signed, profile, opts.signer);
        return { env: reply.env, raw: reply.raw, wireProfile: reply.profile.name };
      },
    },
    profile,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run one full negotiation with one supplier over the channel. The buyer DRIVES every turn; the
 * supplier answers. Beyond the mechanism (validate every move against the local state machine),
 * this loop enforces the judgment:
 *   - the round + wall-clock BUDGET bounds the buyer's patience (adversarial walk-away),
 *   - each supplier offer down-weights REPUTATION on a stall/probe and can trigger an early walk-away,
 *   - the tier CLASSIFICATION decides settle vs hold vs walk-away,
 *   - and a tier-approved settle still passes the GOVERNOR's shared gates (kill switch,
 *     suspend-on-disconnect, cross-deal spend cap) before any ACCEPT goes out.
 * The reservation price is read only inside those checks; it is never placed in a message.
 *
 * The negotiationId is generated up front so the whole exchange can run inside ONE OTel span
 * (one trace per negotiation, tagged with the active wire profile). When no tracer is supplied the
 * span wrapper is skipped entirely — free in the default run.
 */
export async function runNegotiation(opts: NegotiateOptions): Promise<NegotiationOutcome> {
  const negotiationId = randomUUID();
  // Read the environment ONCE, here, for this process's PREFERENCE, and hand it down. It used to be read
  // at three separate points — the span attribute, the outbound encoder, and inside the channel's `send`,
  // i.e. once per message — so a negotiation's own record of what it spoke, the bytes it actually
  // encoded, and the profile it reported to the tracer were three independent reads of mutable global
  // state that merely happened to agree. Nothing mutates `WIRE_PROFILE` mid-run today, which is exactly
  // what made the coupling invisible: the half-trail's `wireProfile` tag is what a §9 record is later
  // read back under, so a disagreement would surface as an unverifiable non-repudiation artifact rather
  // than as an error here.
  //
  // The EFFECTIVE profile is agreed with the counterparty inside `connectChannel` and can differ from
  // this, which is why the span attribute is now stamped down there rather than being predicted here.
  const preference = wireProfileFromEnv();
  const run = opts.tracer
    ? withNegotiationSpan(
        opts.tracer,
        { negotiationId, counterpartyDid: opts.ad.did },
        (span) => runNegotiationCore(opts, negotiationId, preference, span),
      )
    : runNegotiationCore(opts, negotiationId, preference);
  if (!opts.quoteBoard) return run;
  // Tell Meridian's own desk how this thread ended. A rival still listed as "negotiating" after it has
  // walked is a BATNA the buyer does not have, and a sibling thread would negotiate as if it did. The
  // catch path marks it gone too: a thread that threw is no more an alternative than one that walked.
  try {
    const outcome = await run;
    opts.quoteBoard.close(opts.ad.did, outcome.result === "WALKED" ? "walked" : "closed");
    return outcome;
  } catch (err) {
    opts.quoteBoard.close(opts.ad.did, "walked");
    throw err;
  }
}

/**
 * One participant's view of the shared commit barrier, with the once-only reporting contract made
 * explicit and safe. `active` is false when no barrier is shared (the batch/test path — autonomous
 * settle). `offer` reveals a committable offer and awaits the choice; `withdraw` reports this deal is
 * out of the autonomous running — idempotent, so it can be called at the escalate decision point AND
 * again by the wrapper's finally backstop without ever over-counting the barrier.
 */
class BarrierParticipant {
  #done = false;
  constructor(private readonly coord?: CommitCoordinator) {}
  get active(): boolean {
    return this.coord !== undefined;
  }
  offer(candidate: CommitCandidate): Promise<CommitVerdict> {
    this.#done = true;
    return this.coord!.offer(candidate);
  }
  withdraw(): void {
    if (this.coord && !this.#done) {
      this.#done = true;
      this.coord.withdraw();
    }
  }
}

async function runNegotiationCore(
  opts: NegotiateOptions,
  negotiationId: string,
  preference: WireProfile,
  span?: Span,
): Promise<NegotiationOutcome> {
  const participant = new BarrierParticipant(opts.commitCoordinator);
  try {
    return await driveNegotiation(opts, negotiationId, participant, preference, span);
  } finally {
    // Backstop for the barrier's once-only contract: driveNegotiation reports on every NORMAL terminal
    // branch (offer / escalate-withdraw / walk-away), but a throw BEFORE any of those (connect, RFQ, a
    // transport failure) would otherwise leave a shared coordinator waiting forever. This idempotent
    // withdraw guarantees every participant reports exactly once, so the barrier can never hang.
    participant.withdraw();
  }
}

async function driveNegotiation(
  opts: NegotiateOptions,
  negotiationId: string,
  participant: BarrierParticipant,
  preference: WireProfile,
  span?: Span,
): Promise<NegotiationOutcome> {
  const { buyerDid, mandate, governor, trust, ad, trail, signer, halfTrail } = opts;
  const reasoner: Reasoner = opts.reasoner ?? decide;
  const startedAt = Date.now();
  // Dial the counterparty and agree the profile from its card BEFORE anything is encoded — see
  // `connectChannel`. Everything downstream (the encoder, the half-trail tag, the trace) uses this one
  // value, so there is no second read that could disagree with it.
  const connected = await connectChannel(opts, preference);
  // Stamp the trace with what was AGREED, not what this process preferred: the span is the record of
  // what actually went on the wire, and it can only be set here because the answer comes from a card
  // that does not exist until the connect above.
  span?.setAttribute(WIRE_PROFILE_ATTR, connected.profile.name);
  // The message layer — validate, admit, sign, record, send, record the reply. It also owns the two
  // pieces of last-exchange state the judgment below reads: the counterparty's raw signed bytes (what
  // A2CN §14.1(3) binds an ApprovalReceipt to) and its sanitised rationale.
  const session = new NegotiationSession({
    negotiationId,
    buyerDid,
    ad,
    signer,
    channel: connected.channel,
    outboundProfile: connected.profile,
    trail,
    halfTrail,
    onOutbound: opts.onOutbound,
    quoteBoard: opts.quoteBoard,
  });
  // Negotiation state the reasoner reads each turn.
  let lastBidUsd: number | undefined;

  const base = (result: NegotiationOutcome["result"], rounds: number): NegotiationOutcome => ({
    supplierDid: ad.did,
    agentName: ad.agentName,
    negotiationId,
    result,
    rounds,
    detail: "",
    reputation: governor.reputation.score(ad.did),
  });

  // Both halves of the budget, read ONCE per turn. Kept as one call rather than two predicates so the
  // wall-clock test and the combined gate cannot disagree: two separate `Date.now()` reads either side of
  // the cutoff would let `budgetExhausted` be true while `wallClockExpired` is false, and `decide` would
  // then attribute a timeout to the round budget.
  const budgetState = (
    countersSent: number,
  ): { budgetExhausted: boolean; roundsExhausted: boolean; wallClockExpired: boolean } => {
    const roundsExhausted = countersSent >= mandate.budget.maxRounds;
    const wallClockExpired = Date.now() - startedAt > mandate.budget.maxWallClockMs;
    return { budgetExhausted: roundsExhausted || wallClockExpired, roundsExhausted, wallClockExpired };
  };

  // 1. RFQ — open with the shortfall shape; price is deliberately omitted (the buyer never leaks a
  //    number first). round 0.
  const rfq = makeEnvelope({
    type: "RFQ",
    from: buyerDid,
    to: ad.did,
    negotiationId,
    body: {
      round: 0,
      terms: { sku: mandate.sku, units: mandate.unitsNeeded, leadTimeDays: mandate.deadlineDays },
      // Who we are, declared on our first message. A2CN puts this on SessionInit; Meridian has no
      // separate handshake, so the RFQ carries it. §9 requires the transaction record's party names to
      // come from a protocol message both sides hold — this is that message.
      party: { organization_name: opts.orgName ?? buyerDid.replace(/^did:web:/, ""), agent_id: buyerDid },
    },
  });
  let reply = await session.exchange(rfq, 0);

  // A quote with no PRICE is not a quote. The guard used to accept any `terms` object and then cast it
  // to `Terms`, defaulting a missing `unitPriceUsd` to Infinity — which does not fail, it poisons: the
  // opening price becomes Infinity, so `bestOfferSeen` and the monotonicity check treat every later
  // number as an improvement, and the reputation score the good-faith test depends on is computed from
  // a figure the supplier never sent. Parsing here means the cast below is backed by validation rather
  // than by assumption.
  const openingTerms = Terms.safeParse(reply.body.terms);
  if (reply.type === "WALKAWAY" || !reply.body.terms || !openingTerms.success) {
    const o = base("WALKED", reply.body.round);
    o.reasonCode = reply.body.reasonCode ?? "OUT_OF_TERMS";
    o.detail = reply.body.terms && !openingTerms.success
      ? `supplier opened with incomplete terms (${openingTerms.error.issues.map((i) => i.path.join(".")).join(", ") || "unparseable"})`
      : `supplier disengaged (${reply.body.reasonCode ?? "no terms"})`;
    return o;
  }

  const firstOfferPriceUsd = openingTerms.data.unitPriceUsd;
  let offer = openingTerms.data;
  let countersSent = 0;
  // What the counterparty's price has DONE — the good-faith arithmetic behind the reputation signals and
  // the concession curve the reasoner reads. The policy (what a probe costs, where the floor is) stays
  // here; see counterparty-conduct.ts.
  const conduct = new CounterpartyConduct(firstOfferPriceUsd, mandate.counterStepUsd);

  const enqueueHold = (terms: Terms, tier: Tier, reason: string) => {
    const item = governor.approvals.enqueue({
      supplierDid: ad.did,
      agentName: ad.agentName,
      negotiationId,
      terms,
      tier,
      reason,
      // Bind the hold to the exact act awaiting approval (§14.1(3)) and record why a human was needed.
      offerHash: actHashOf(session.lastOfferRaw, reply),
      amountUsd: terms.unitPriceUsd * terms.units,
      thresholdUsd: mandate.tiers.notifyOnSettle.priceAtOrBelow * terms.units,
    });
    trail.append({ event: "escalated", negotiationId, approvalId: item.id, tier, reason, terms });
    return item;
  };

  const escalateOutcome = (terms: Terms, tier: Tier, reason: string, settleGate?: string): NegotiationOutcome => {
    const o = base("ESCALATE", reply.body.round);
    o.terms = terms;
    o.tier = tier;
    o.detail = reason;
    o.settleGate = settleGate;
    return o;
  };

  /**
   * Reveal a committable offer to the shared barrier and wait for the choice, going quiet on the live
   * channel while every sibling negotiation shows its best-and-final (the supplier holds its state, so a
   * later ACCEPT on the same channel settles cleanly).
   *
   * Returns the verdict, or a terminal outcome when the wait itself ended the deal. Only ONE thing can:
   * a kill switch tripping while we held. That sever was written out twice — once in the ACCEPT branch
   * and once in the ESCALATE branch — which is two places to forget that a run being torn down must not
   * be committed into.
   */
  async function revealToBarrier(
    decision: { terms: Terms; tier: Tier },
  ): Promise<{ verdict: CommitVerdict } | { outcome: NegotiationOutcome }> {
    trail.append({ event: "ready-to-commit", negotiationId, did: ad.did, tier: decision.tier, terms: decision.terms });
    const verdict = await participant.offer({
      negotiationId,
      supplierDid: ad.did,
      agentName: ad.agentName,
      terms: decision.terms,
      tier: decision.tier,
    });
    // A kill switch tripped while we held for the choice tears the run down — sever this deal rather
    // than commit into a kill.
    if (governor.killSwitch.active) {
      await session.walkaway("POLICY", reply.body.round + 1, reply.correlationId);
      const o = base("WALKED", reply.body.round + 1);
      o.reasonCode = "POLICY";
      o.detail = `commit hold severed by kill switch (${governor.killSwitch.reason})`;
      return { outcome: o };
    }
    return { verdict };
  }

  /**
   * Stand this supplier down: a better offer was chosen elsewhere, so walk it cleanly.
   *
   * The reason code is DONE, and that is not cosmetic. `reasonToA2cnTerminal` maps DONE to WITHDRAWN and
   * everything unrecognised to REJECTED_FINAL, so a stand-down filed under any other code appears in the
   * §10 compliance artifact as a final rejection of a supplier the buyer had no complaint about.
   */
  async function standDown(
    decision: { terms: Terms; tier: Tier },
    rationale: string,
    because: string,
  ): Promise<NegotiationOutcome> {
    // `rationale` is passed whole rather than assembled from `because`: the two branches name the offer
    // differently ("best-and-final" vs "out-of-policy") and word the outcome differently ("chosen" vs
    // "selected"). Both are what an operator reads to tell WHICH kind of stand-down this was, so they are
    // preserved verbatim instead of being normalised by this refactor.
    trail.append({
      event: "decision",
      negotiationId,
      action: "STAND_DOWN",
      rationale,
    });
    await session.walkaway("DONE", reply.body.round + 1, reply.correlationId);
    const o = base("WALKED", reply.body.round + 1);
    o.terms = decision.terms;
    o.tier = decision.tier;
    o.reasonCode = "DONE";
    o.detail = `stood down after best-and-final $${decision.terms.unitPriceUsd}/u — ${because}`;
    return o;
  }

  /**
   * Commit `terms`: run the governor's shared gates, then send the ACCEPT that settles the deal.
   * Shared by the autonomous-settle path AND the human-approved-escalation path, so an
   * operator-approved deal commits through the exact same gates and signed exchange as an autonomous
   * one — nothing is replayed or faked.
   *
   * THE ACCEPT IS THE SETTLE. There is no CONFIRM and therefore no window in which a sent ACCEPT can
   * be un-committed: the moment it goes on the wire the buyer is bound, exactly as A2CN treats an
   * acceptance. Everything that could stop the deal — kill switch, oversight-down, the cross-deal cap,
   * the commit barrier, human approval — is therefore checked BEFORE the ACCEPT is emitted, never
   * after. `authorizeSettle` is the last gate, and the supplier's ACK that follows is a transport
   * acknowledgement, not consent (it already consented by signing the offer we are accepting).
   */
  async function settle(terms: Terms, tier: Tier, rationale: string): Promise<NegotiationOutcome> {
    // Tier says commit. The governor decides whether the shared safeguards allow it RIGHT NOW. This is
    // the point of no return: past here the ACCEPT binds.
    const gate = governor.authorizeSettle(negotiationId, ad.did, terms);
    if (!gate.ok) {
      trail.append({ event: "decision", negotiationId, action: "SETTLE_BLOCKED", rationale: gate.reason });
      // A blocked settle does not walk away — it holds for a human (suspend / cap / kill all → hold).
      enqueueHold(terms, "APPROVE_BEFORE_COMMIT", gate.reason);
      return escalateOutcome(terms, "APPROVE_BEFORE_COMMIT", gate.reason, gate.reason);
    }

    trail.append({ event: "decision", negotiationId, action: "ACCEPT", tier, rationale });
    const acceptRound = reply.body.round + 1;
    const accept = makeEnvelope({
      type: "ACCEPT",
      from: buyerDid,
      to: ad.did,
      negotiationId,
      inReplyTo: reply.correlationId,
      body: { round: acceptRound, terms },
    });
    // The reservation is bound inside `exchangeSettling`, as the last step before the bytes leave — see
    // the comment there for why it belongs at that exact point and not here. It deliberately does NOT
    // happen before this call: everything between here and the send can still fail locally, and binding
    // early commits ledger headroom for an ACCEPT that never reached the wire.
    let ack: Envelope;
    try {
      ack = await session.exchangeSettling(accept, acceptRound, () => governor.bindSettle(negotiationId));
    } catch (err) {
      // ONE exception to "the ACCEPT is already away": `bindSettle` throws BEFORE `channel.send`, so
      // nothing reached the supplier. Recording that as `settle-unknown` would tell an operator a
      // binding ACCEPT might be outstanding when none is — the opposite of the truth, and the more
      // alarming direction. It is a clean sever: the hold it went looking for was already revoked.
      if (err instanceof SettleBindError) {
        trail.append({
          event: "settle-severed",
          negotiationId,
          reservationHeld: false,
          detail: err.message,
        });
        throw err;
      }
      // The ACCEPT was signed, recorded and put on the wire before this threw, so a transport or verify
      // failure means the buyer did not HEAR BACK — not that the supplier never received it. Releasing
      // the reservation here assumed the deal had failed and freed the money for another negotiation
      // while the supplier may hold a binding ACCEPT, which is the one outcome the cross-deal cap exists
      // to prevent. The reservation stands; the state of this deal is explicitly unknown.
      trail.append({
        event: "settle-unknown",
        negotiationId,
        reservationHeld: true,
        detail: err instanceof Error ? err.message : String(err),
      });
      throw err;
    }
    // A reply — of ANY kind — proves the supplier received the ACCEPT, and the ACCEPT is the settle: the
    // buyer was bound the moment it went out. Answering with something other than an ACK is the
    // supplier's protocol violation, not a way to un-commit a deal that is already closed, so it is
    // recorded as an anomaly and carried on the outcome rather than thrown. Throwing released the
    // reservation and reported no settle at all, leaving the buyer's books denying a deal the supplier
    // can prove with the buyer's own signature.
    const anomaly = ack.type === "ACK" ? undefined : `supplier answered the ACCEPT with '${ack.type}' rather than an ACK`;
    if (anomaly) trail.append({ event: "settle-anomaly", negotiationId, expected: "ACK", got: ack.type, detail: anomaly });

    governor.confirmSettle(negotiationId, ad.did, terms, tier);
    const o = base("SETTLED", acceptRound);
    o.terms = terms;
    o.tier = tier;
    o.lastCorrelationId = accept.correlationId;
    o.detail = `settled ${tier} at $${terms.unitPriceUsd}/u, ${terms.units}u, ${terms.leadTimeDays}d ${terms.deliveryTerms}`;
    if (anomaly) o.detail += ` (${anomaly})`;
    o.settleAnomaly = anomaly;

    // A2CN §9. The buyer derives the transaction record from its OWN half-trail; the supplier derived
    // the same record from its own and volunteered the hash on the ACK. Equal hashes prove both sides
    // hold the identical deal — WITHOUT either one reading the other's store, which is what the old
    // reconcile() needed. A disagreement does not un-settle the deal (the ACCEPT already bound us) but
    // it is recorded and it blocks payment downstream.
    if (halfTrail) {
      const record = transactionRecordFromTrail(halfTrail.entries(), negotiationId);
      o.recordHash = record?.record_hash;
      const theirs = (ack.body as { recordHash?: string } | undefined)?.recordHash;
      o.counterpartyRecordHash = theirs;
      if (o.recordHash && theirs) o.recordsAgree = o.recordHash === theirs;
      trail.append({
        event: "transaction-record",
        negotiationId,
        recordHash: o.recordHash,
        counterpartyRecordHash: theirs,
        agree: o.recordsAgree,
      });
    }
    return o;
  }

  try {
    // 2. Turn-taking loop until a terminal branch is reached.
    for (;;) {
      // Pace turns so the dashboard can render each move and the kill switch has a live window.
      if (opts.paceMs) await delay(opts.paceMs);
      governor.killSwitch.assertLive();

      // Down-weight a probe (price moving AWAY from a deal) or a stonewall; a good-faith concession
      // costs nothing, and the opening offer is the baseline rather than a judgment. What counts as
      // either is `conduct`'s arithmetic — see counterparty-conduct.ts for the failures behind the rules.
      const signal = conduct.observe(offer.unitPriceUsd);
      if (signal) {
        const score = signal === "probe" ? governor.reputation.noteProbe(ad.did) : governor.reputation.noteStall(ad.did);
        trail.append({ event: "reputation", negotiationId, did: ad.did, signal, score });
      }

      // Reputation floor: a counterparty we no longer trust is walked away from without spending the
      // rest of the round budget on it.
      if (governor.reputation.belowFloor(ad.did, mandate.reputationWalkawayBelow)) {
        trail.append({
          event: "decision",
          negotiationId,
          action: "WALKAWAY",
          rationale: `reputation ${governor.reputation.score(ad.did).toFixed(2)} < floor ${mandate.reputationWalkawayBelow}`,
        });
        await session.walkaway("POLICY", reply.body.round + 1, reply.correlationId);
        const o = base("WALKED", reply.body.round + 1);
        o.reasonCode = "POLICY";
        o.detail = `walked away early: reputation below floor (${governor.reputation.score(ad.did).toFixed(2)})`;
        return o;
      }

      const ctx: DecisionContext = {
        offer,
        countersSent,
        firstOfferPriceUsd,
        trust,
        ...budgetState(countersSent),
        lastBidUsd,
        lastConcessionUsd: conduct.lastConcessionUsd,
        concessionHistory: conduct.concessionHistory,
        counterpartyRationale: session.counterpartyRationale,
        parallelNegotiations: opts.parallelNegotiations ?? 1,
        rivalQuotes: opts.quoteBoard?.rivalsOf(opts.ad.did),
      };
      const decision = await reasoner(mandate, ctx);

      if (decision.action === "ACCEPT") {
        // No barrier → the batch/test path: commit autonomously right now, exactly as before.
        if (!participant.active) {
          return await settle(decision.terms, decision.tier, decision.rationale);
        }
        // With a barrier: this is a committable offer, but we do NOT fire ACCEPT yet. Reveal it and wait
        // until every parallel negotiation has shown its best-and-final, so the field is known before a
        // choice is made.
        const held = await revealToBarrier(decision);
        if ("outcome" in held) return held.outcome;
        // Selected → drive the real settling ACCEPT on the still-live channel, same gates and signed
        // exchange as an immediate settle. Anything else stands down: this offer is IN policy, so the
        // barrier resolves it to commit or standDown and never to escalate.
        if (held.verdict === "commit") {
          return await settle(decision.terms, decision.tier, decision.rationale);
        }
        return await standDown(
          decision,
          `best-and-final $${decision.terms.unitPriceUsd}/u not selected — a better committable offer was chosen`,
          "a better committable offer was selected",
        );
      }

      if (decision.action === "COUNTER") {
        countersSent += 1;
        lastBidUsd = decision.terms.unitPriceUsd;
        trail.append({ event: "decision", negotiationId, action: "COUNTER", rationale: decision.rationale });
        const counter = makeEnvelope({
          type: "COUNTER",
          from: buyerDid,
          to: ad.did,
          negotiationId,
          inReplyTo: reply.correlationId,
          body: {
            round: reply.body.round + 1,
            terms: decision.terms,
            // Our stated reason, already validated (llm.ts drops anything echoing a private figure).
            // A competing quote is legitimate leverage, but a rival's IDENTITY is its confidential business
            // and not Meridian's to hand to a competitor. The prompt asks the model not to name it; this
            // enforces it, because a prompt is guidance and free text is free text.
            //
            // Rival PRICES are deliberately not in this list, and the reason is worth stating: prices
            // converge as a negotiation runs, so the buyer's own bid frequently equals a rival's quote.
            // Forbidding the figure would silently drop the buyer's explanation exactly when the two match
            // — most often near the end, where the reasoning matters most — and it would buy nothing,
            // because the buyer is about to put that same number on the wire as its own bid anyway. What
            // leaks is the ATTRIBUTION ("Alpine quoted 87"), and dropping the name removes it.
            rationale: safeOutboundRationale(decision.rationale, [
              String(mandate.reservationUnitPriceUsd),
              String(mandate.maxTotalCommittedUsd),
              ...(ctx.rivalQuotes ?? []).map((q) => q.agentName),
            ]),
          },
        });
        reply = await session.exchange(counter, reply.body.round + 1);
        if (reply.type === "WALKAWAY") {
          const o = base("WALKED", reply.body.round);
          o.reasonCode = reply.body.reasonCode ?? "OUT_OF_TERMS";
          o.detail = `supplier walked away (${reply.body.reasonCode ?? "unknown"})`;
          return o;
        }
        // PARSED, not cast — the same guard the opening quote gets. Only the first reply was validated,
        // which left every later round on a raw cast: a round-three counter carrying terms without
        // `unitPriceUsd` became the live `offer` and flowed straight into the pricing comparison, the
        // monotonicity check and the reputation score. `undefined` there does not throw, it silently
        // makes every subsequent number look like an improvement.
        // ABSENT terms are a failure too, not a no-op. Guarding the parse behind `if (reply.body.terms)`
        // preserved the old skip-and-continue for a reply that carries none — so the buyer went on
        // negotiating against the PREVIOUS round's `offer`, quoting a price the supplier had already
        // moved off. A non-WALKAWAY reply in a priced round is supposed to carry terms; when it does
        // not, the exchange has broken down and the opening guard's answer is the right one here too.
        const parsed = Terms.safeParse(reply.body.terms);
        if (!parsed.success) {
          const o = base("WALKED", reply.body.round);
          o.reasonCode = "OUT_OF_TERMS";
          o.detail = reply.body.terms
            ? `supplier sent incomplete terms (${parsed.error.issues.map((i) => i.path.join(".")).join(", ") || "unparseable"})`
            : `supplier replied with ${reply.type} but no terms`;
          return o;
        }
        offer = parsed.data;
        continue;
      }

      if (decision.action === "ESCALATE") {
        // This is a committable offer, but OUT of autonomous policy (APPROVE_BEFORE_COMMIT). With a
        // barrier, reveal it and wait for the choice: if ANY in-policy offer exists anywhere, that wins
        // autonomously and this one stands down — the operator is never bothered. Only when NOTHING is in
        // policy does the barrier tell every out-of-policy offer to `escalate` to the human.
        if (participant.active) {
          const held = await revealToBarrier(decision);
          if ("outcome" in held) return held.outcome;
          if (held.verdict === "standDown") {
            return await standDown(
              decision,
              `out-of-policy $${decision.terms.unitPriceUsd}/u not selected — an in-policy offer was committed`,
              "an in-policy offer was committed",
            );
          }
          // verdict === "escalate": no in-policy offer existed — fall through to the human-approval path.
        }
        // Buyer-internal hold — the supplier just sees the buyer go quiet. Enqueue for human approval.
        const item = enqueueHold(decision.terms, decision.tier, decision.rationale);
        // When the server supplies an approval callback, BLOCK on the operator's decision on the
        // live channel. Approve → the held deal proceeds to a real signed ACCEPT through `settle`
        // (same gates, same exchange). Reject/timeout (or a kill mid-wait) → the deal stays held.
        if (opts.onEscalation) {
          const verdict = await opts.onEscalation(item);
          if (governor.killSwitch.active) {
            // Close the supplier's side: a held deal severed by the kill switch must send the terminal
            // WALKAWAY, or the counterparty is left waiting on an approval that will never come.
            await session.walkaway("POLICY", reply.body.round + 1, reply.correlationId);
            governor.abandonSettle(negotiationId);
            const o = base("WALKED", reply.body.round + 1);
            o.reasonCode = "POLICY";
            o.detail = `held deal severed by kill switch (${governor.killSwitch.reason})`;
            return o;
          }
          if (verdict.decision === "approved") {
            // A2CN §14: leaving AWAITING_HUMAN_APPROVAL requires a VALID receipt, not merely a
            // decision. Verified against the exact paused act, this session, an unexpired window, and
            // an operator key the trust anchor granted ApprovalAuthority. Anything less and the deal
            // stays held — an unverifiable approval must not move money.
            const check = verdict.receipt
              ? verifyApprovalReceipt(verdict.receipt, { sessionId: negotiationId, offerHash: item.offerHash, now: new Date() })
              : { ok: false, reason: "operator approved but produced no signed receipt" };
            if (!check.ok) {
              trail.append({ event: "approval-rejected", negotiationId, approvalId: item.id, reason: check.reason });
              return escalateOutcome(decision.terms, decision.tier, `approval not honoured: ${check.reason}`);
            }
            trail.append({
              event: "approval-receipt",
              negotiationId,
              approvalId: item.id,
              receiptId: verdict.receipt!.id,
              offerHash: item.offerHash,
              signerDid: verdict.receipt!.signer_did,
            });
            return await settle(decision.terms, decision.tier, `[approved] ${decision.rationale}`);
          }
          trail.append({ event: "approval-resolved", negotiationId, approvalId: item.id, verdict: verdict.decision });
        }
        return escalateOutcome(decision.terms, decision.tier, decision.rationale);
      }

      // WALKAWAY — send it on the wire with a reason code; the supplier mirrors it.
      trail.append({ event: "decision", negotiationId, action: "WALKAWAY", rationale: decision.rationale });
      await session.walkaway(decision.reasonCode, reply.body.round + 1, reply.correlationId);
      const o = base("WALKED", reply.body.round + 1);
      o.reasonCode = decision.reasonCode;
      o.detail = decision.rationale;
      return o;
    }
  } catch (err) {
    if (err instanceof KillSwitchTripped) {
      // The kill switch tripped between turns — sever this negotiation cleanly.
      await session.walkaway("POLICY", reply.body.round + 1, reply.correlationId);
      governor.abandonSettle(negotiationId);
      trail.append({ event: "killed", negotiationId, reason: err.message });
      const o = base("WALKED", reply.body.round + 1);
      o.reasonCode = "POLICY";
      o.detail = err.message;
      return o;
    }
    throw err;
  }
}

/**
 * Prove the state machine is real: after a settle, try two illegal moves on the SAME negotiation —
 * once against the buyer's own tracker (caught locally) and once on the wire (rejected by the
 * supplier's tracker). "A COUNTER after settle, or a second ACCEPT, is rejected."
 */
export async function probeIllegalTransition(
  opts: { transport: Transport; signer: Signer; buyerDid: string; ad: CapabilityAd; trail: Trail },
  negotiationId: string,
  lastCorrelationId: string,
  round: number,
): Promise<void> {
  const { transport, signer, buyerDid, ad, trail } = opts;

  const settledTracker = new NegotiationTracker();
  const seed = (type: MoveView["type"], r: number, inReplyTo: string | undefined, id: string) =>
    settledTracker.admit({ negotiationId, type, round: r, correlationId: id, inReplyTo });
  seed("RFQ", 0, undefined, "c0");
  seed("QUOTE", 1, "c0", "c1");
  seed("ACCEPT", 2, "c1", "c2"); // the ACCEPT alone drives the machine to SETTLED
  try {
    settledTracker.admit({ negotiationId, type: "COUNTER", round: 3, correlationId: "c3", inReplyTo: "c2" });
    trail.append({ event: "illegal-probe", scope: "local", outcome: "UNEXPECTED-ACCEPT" });
  } catch (err) {
    const detail = err instanceof IllegalTransition ? err.detail : String(err);
    trail.append({ event: "illegal-probe", scope: "local", outcome: "rejected-as-expected", detail });
  }

  const illegal = makeEnvelope({
    type: "COUNTER",
    from: buyerDid,
    to: ad.did,
    negotiationId,
    inReplyTo: lastCorrelationId,
    body: { round: round + 1, terms: { sku: "MER-TENT-3S", units: 1, unitPriceUsd: 1, leadTimeDays: 1 } },
  });
  try {
    // `connect` inside the try, and the outcome split three ways — see the header of probes.ts. The wire
    // half of this probe claims the SUPPLIER's tracker refused the move, so only a refusal the supplier
    // itself computed may be recorded as one; an unreachable supplier is INCONCLUSIVE, not proof.
    const { client } = await transport.connect(ad.a2aEndpoint);
    // The signer is threaded through because COUNTER is a NEGOTIATION VERB: on the a2cn profile the
    // codec re-expresses it as a real A2CN message and needs a signer for the §7.3.1 protocol act, so
    // without one the send threw here — inside this process, before any byte reached the supplier. The
    // probe then recorded its own local crash as the supplier's verdict. Passing it is correct precisely
    // because this probe's illegality is the STATE TRANSITION and nothing else: the message must be
    // perfectly valid and perfectly signed, so the only thing left for the supplier to refuse is the move.
    await sendSignedEnvelope(client, signer.sign(illegal), undefined, signer);
    trail.append({ event: "illegal-probe", scope: "wire", target: ad.did, outcome: "UNEXPECTED-ACCEPT" });
  } catch (err) {
    trail.append({
      event: "illegal-probe",
      scope: "wire",
      target: ad.did,
      outcome: isPeerRefusal(err) ? "rejected-as-expected" : "INCONCLUSIVE",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
