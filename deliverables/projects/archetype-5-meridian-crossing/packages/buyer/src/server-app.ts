import { timingSafeEqual } from "node:crypto";
import express, { type Request, type Response, type NextFunction } from "express";
import { rateLimit } from "express-rate-limit";
import {
  auditLogFromTrail,
  buildComplianceExport,
  issueApprovalReceipt,
  MERIDIAN_MANDATE_ID,
  projectHalfTrail,
  reasonToA2cnTerminal,
  sseHandler,
  transactionRecordFromTrail,
  verifyApprovalReceipt,
  type ApprovalReceipt,
  type EventHub,
  type HalfTrail,
  type Scenario,
  type Signer,
  type Trail,
} from "@meridian/agent-runtime";
import type { Governor } from "./governor.js";
import type { NegotiationOutcome } from "./negotiate.js";
import type { ClearedCandidate } from "./pipeline.js";
import type { SettlementManager, SettlementPolicy, SettlementSnapshot } from "./settlement.js";

/**
 * The message from a caught value, for values that are not necessarily Errors.
 *
 * `String((err as Error).message ?? err)` looked equivalent and was not: the cast is erased at runtime, so
 * a rejection with `null` or `undefined` made `.message` a TypeError THROWN INSIDE THE CATCH BLOCK. In the
 * approve-funding handler that is the expensive case — the throw would skip the DEPOSIT_SENT branch below
 * and surface money already on the chain as an unhandled 500, which is the exact confusion that branch
 * exists to prevent.
 */
function detailOf(err: unknown): string {
  return oneLine(err instanceof Error ? err.message : String(err));
}

/**
 * Flatten a string to a single log line.
 *
 * Error text reaching the console here is not all ours: a settlement failure carries the payment
 * provider's message, and a rejected envelope carries the counterparty's. Anything with a newline in it
 * can therefore FORGE LOG RECORDS — write `\n[buyer] payment xyz settled` into an error and the audit log
 * grows an entry describing money that never moved. That matters more here than in most services, because
 * this log is the human-readable half of the evidence trail an operator reads after a disputed deal.
 *
 * Carriage returns and the rest of the C0 range go too: a bare `\r` rewinds the cursor and lets later text
 * overwrite what came before it on a terminal, which hides a line just as effectively as forging one.
 */
function oneLine(s: string): string {
  // THE NEWLINE IS DELETED, NOT SPACED, AND THAT IS NOT A STYLE CHOICE. CodeQL's log-injection sanitiser
  // is `replaces(s, "") and s.regexpMatch("\\n")` — it credits a replace only when the replacement is the
  // EMPTY STRING. Replacing with a space did the same work and was never recognised, so the taint path ran
  // through this helper into every sink that uses it and js/log-injection stayed open on the receipt-failure
  // log below. Two earlier attempts blamed the pattern (a range, then an alternation); the pattern was fine.
  // Everything else in the C0 range, `\r` included, still becomes a space: forging a record needs a newline,
  // and a lone `\r` only rewinds the cursor, which a space defeats just as well.
  return s.replace(/\n/g, "").replace(/[\u0000-\u001F\u007F]/g, " ");
}

/**
 * The buyer's control-plane HTTP surface, as a FUNCTION OF ITS DEPENDENCIES.
 *
 * WHY THIS IS SPLIT OUT. `server.ts` built every one of these dependencies at module scope and called
 * `app.listen` as an import side effect, so there was no way to construct this surface with test doubles
 * — importing it started a server, bound a port, and kicked off a real procurement run. The consequence
 * was not theoretical: the routes below hold the kill switch, the approval buttons and the money-moving
 * settlement actions, and none of them had a single unit test. Everything covering them went through a
 * browser and a full demo run, which is slow enough that it happens rarely and coarse enough that it
 * cannot say WHICH gate refused a request.
 *
 * The auth gates in particular are the kind of thing that must be testable directly. `requireControl`
 * (marker + token) and `requireControlStrict` (marker + token, FAILING CLOSED when no token is
 * configured) differ in exactly one condition, and the difference is what stands between an
 * unauthenticated caller and an irreversible stablecoin transfer.
 *
 * `server.ts` keeps the wiring: read the environment, build the real dependencies, call this, listen.
 */
export interface BuyerAppDeps {
  scenario: Scenario;
  buyerDid: string;
  /** The buyer's PUBLIC ask, as reported by `/state`. Never the private mandate figures. */
  need: { name: string; units: number; deadlineDays: number };
  /** Shared secret for the state-changing routes. Empty string means "no token configured" — the
   *  zero-config demo default, under which `requireControlToken` runs open and the strict variant does
   *  not. */
  controlToken: string;
  governor: Governor;
  trail: Trail;
  hub: EventHub;
  halfTrail: HalfTrail;
  /** The human operator's own key — a SEPARATE principal from the agent. It signs the A2CN §14
   *  ApprovalReceipts, so a deal beyond the agent's mandate carries proof a PERSON authorised it; an
   *  agent signing its own approvals would prove nothing. */
  operatorSigner: Signer;
  /** How the buyer is CONFIGURED to reason, for the dashboard badge. */
  reasoning: { mode: "llm" | "deterministic"; model?: string };
  settlement: SettlementManager | null;
  settlementPolicy: SettlementPolicy;
  /** Operator receipts for PAYMENT approvals, keyed by session. The tier-escalation receipts live on the
   *  approval queue items; these have no queue of their own, so the audit log needs them kept here. */
  settlementReceipts: Map<string, ApprovalReceipt[]>;
  /** The live run state the routes report on and act upon. Accessors rather than snapshots: the arrays
   *  are appended to as negotiations resolve, and a route must read what is true when it is called. */
  run: {
    isStarted(): boolean;
    /** Start the flow. Idempotent — a second call while running is a no-op. */
    start(): void;
    cleared(): ClearedCandidate[];
    outcomes(): NegotiationOutcome[];
  };
}

/**
 * The same-origin marker the dashboard attaches to state-changing requests. Must match REQUEST_MARKER
 * in packages/dashboard/server.mjs — the proxy forwards the browser's header through unchanged.
 */
export const REQUEST_MARKER = "meridian-dashboard";

export function createBuyerApp(deps: BuyerAppDeps): express.Express {
  const {
    scenario,
    buyerDid,
    need,
    controlToken,
    governor,
    trail,
    hub,
    halfTrail,
    operatorSigner,
    reasoning,
    settlement,
    settlementPolicy,
    settlementReceipts,
    run,
  } = deps;

  const app = express();
  app.use(express.json());
  // No wildcard CORS: the browser only ever reaches this server THROUGH the dashboard's same-origin
  // reverse proxy, so a permissive `access-control-allow-origin: *` bought nothing and let any web page
  // the operator visited POST to the kill switch cross-origin. Same-origin is the default; we add nothing.

  // Gate the state-changing endpoints on the shared control token. When the token is unset the demo
  // stays open (with a startup warning); when set, a missing/mismatched token is a 401 — so reaching the
  // port is no longer the same as having authority over the negotiations in flight.
  // Constant-time compare so the control token is not a timing oracle (matches the dashboard's
  // timing-safe basic-auth check). Unequal lengths short-circuit — timingSafeEqual requires equal length.
  function tokenMatches(provided: string | undefined): boolean {
    const a = Buffer.from(provided ?? "", "utf8");
    const b = Buffer.from(controlToken, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  }

  function requireControlToken(req: Request, res: Response, next: NextFunction): void {
    if (!controlToken) return next();
    if (tokenMatches(req.header("x-control-token"))) return next();
    res.status(401).json({ ok: false, error: "control token required" });
  }

  /**
   * CSRF gate for STATE-CHANGING routes, enforced HERE rather than only at the dashboard proxy.
   *
   * The proxy already checks this marker, but the proxy is not the only way in: the buyer listens on its
   * own port, and with no control token configured (the zero-config demo default) `requireControlToken`
   * waves everything through. Any page the operator happened to have open could therefore POST to
   * `localhost:41100/kill` directly and sever every live negotiation — a plain form POST needs no CORS
   * permission, and there was nothing else in the way. A defence implemented only in the reverse proxy
   * is not a defence of the thing behind it.
   *
   * `x-requested-by` is not a secret; its value is irrelevant. What matters is that it is not a
   * CORS-safelisted header, so a cross-origin caller must win a preflight this server never answers.
   * That makes it exactly the control the token cannot be: the proxy injects the token server-side, so
   * the token proves nothing about WHERE the request came from.
   */
  function requireRequestMarker(req: Request, res: Response, next: NextFunction): void {
    if (req.header("x-requested-by") === REQUEST_MARKER) return next();
    res.status(403).json({ ok: false, error: "missing same-origin request marker" });
  }

  /**
   * Like `requireControlToken`, but FAILS CLOSED: if no control token is configured it rejects instead of
   * running open. Used for the money-moving settlement routes, which must never be reachable
   * unauthenticated. The demo launcher provisions a token for `--usdc` (see infra/demo.mjs), so the
   * zero-config demo still works; a bare `node server.js` with USDC but no token gets 401 here rather
   * than exposing settlement.
   */
  function requireControlTokenStrict(req: Request, res: Response, next: NextFunction): void {
    if (!controlToken) {
      res.status(401).json({ ok: false, error: "settlement actions require CONTROL_TOKEN to be configured" });
      return;
    }
    if (tokenMatches(req.header("x-control-token"))) return next();
    res.status(401).json({ ok: false, error: "control token required" });
  }

  /**
   * A cap on how FAST the control plane can be driven, which neither gate above provides.
   *
   * The token answers "who", the marker answers "from where", and nothing answered "how often". Two things
   * that costs: `requireControlToken` runs OPEN when no token is configured (the zero-config demo default),
   * so an unauthenticated caller could spin `/kill` or `/approvals/:id/approve` as fast as the loop allows;
   * and where a token IS set, the endpoints become an online guessing oracle. `timingSafeEqual` removes the
   * timing side channel but not the ability to simply try again, and a short demo token does not survive
   * unlimited attempts.
   *
   * `express-rate-limit` rather than the ten lines this needs, and the reason is the SCANNER, not the
   * behaviour: CodeQL's `js/missing-rate-limiting` identifies rate limiting by recognising known middleware,
   * so a correct hand-rolled limiter leaves a permanent open alert — and a known-stale alert is how the next
   * real one gets ignored. Its memory store is right for a single-process demo buyer; behind a real load
   * balancer this wants a shared store, or each replica grants the full allowance over again.
   *
   * The window is generous because the callers are a human operator and the test suite, not a client that
   * needs throughput: nothing legitimate here sends 120 control requests a minute.
   *
   * ORDERING MATTERS, and it is the kill switch that decides it — see `requireControl` below.
   */
  const rateLimitControl = rateLimit({
    windowMs: 60_000,
    limit: 120,
    // The gates below answer with this shape, and an operator dashboard that parses `error` on every other
    // rejection should not meet a bare string only when it is being throttled.
    message: { ok: false, error: "too many control requests" },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  /**
   * All three gates, in the order a caller trips them: ORIGIN FIRST, then rate, then authority.
   *
   * The marker check deliberately runs BEFORE the limiter, which is the opposite of the usual advice to
   * reject expensive work as early as possible. The reason is that this limiter's buckets are effectively
   * ONE bucket: the browser reaches this server through the dashboard's reverse proxy, so every legitimate
   * request arrives from the proxy's address and `req.ip` is the same value for all of them. With the
   * limiter first, anything that can reach the port could spend the whole 120-request allowance on requests
   * that were going to be rejected as marker-less anyway, and the operator's next `POST /kill` would meet a
   * 429. A safety control an attacker can switch off by flooding is worse than one with no limiter at all,
   * so the cheap header check culls those requests before they can consume budget.
   *
   * That is not a licence to flood: a marker-less request is refused by a header comparison and never
   * touches the governor, the trail or a signing key.
   */
  const requireControl = [requireRequestMarker, rateLimitControl, requireControlToken];
  const requireControlStrict = [requireRequestMarker, rateLimitControl, requireControlTokenStrict];

  /**
   * The read routes' limiter — a SEPARATE instance, deliberately, not the one above.
   *
   * These routes carry no marker (they change nothing, so there is no CSRF to stop) but they do check the
   * token, which made them the remaining unlimited guessing oracle: the same secret that guards `/kill`
   * could be tried without bound against `GET /state`.
   *
   * Sharing `rateLimitControl` would have reintroduced the very problem the ordering note above describes,
   * one layer along. Read traffic and control traffic would draw on one budget, so anyone able to reach the
   * port could spend it on `GET /state` and leave the operator's `POST /kill` answering 429. Two stores
   * means read floods can starve reads and nothing else.
   *
   * The limit is high because the dashboard POLLS: `pollApprovals` every 1.5s plus `pollState` and
   * `pollSettlement` every 2s is ~100 requests a minute from a SINGLE open tab (see packages/dashboard/
   * public/app.js). At the control routes' 120 a minute, one operator with two tabs open would rate-limit
   * themselves out of their own dashboard. 600 leaves room for several tabs and a reconnecting SSE stream
   * while still bounding a brute-force attempt to something a random token survives comfortably.
   */
  const rateLimitRead = rateLimit({
    windowMs: 60_000,
    limit: 600,
    message: { ok: false, error: "too many control requests" },
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const requireControlRead = [rateLimitRead, requireControlToken];

  // This org's own event stream — exactly what it writes to its trail, nothing more.
  //
  // Gated, and it is the BUYER's stream specifically that makes this possible. The buyer's trail carries
  // `commit-selection`, which names every competing supplier's best-and-final terms, plus every decision
  // and settlement event — so an unauthenticated stream hands a rival supplier the whole run. Supplier
  // streams cannot be gated the same way (the control token is the buyer's own secret and forwarding it to
  // a supplier process would leak it to exactly the party it protects against; those need a per-agent
  // credential and remain open — see the note in the dashboard proxy). This one needs no new secret: the
  // token already exists and the proxy already injects it on buyer paths.
  app.get("/events", requireControlRead, sseHandler(hub));

  // A convenience snapshot for a late-joining dashboard. Excludes EVERY private mandate number —
  // reservation, target, maxBid, AND the cross-deal cap — so no policy figure leaks even to a caller
  // holding the token. Only committed spend (derivable from wire prices) is shown.
  //
  // Gated like /audit, /record and /settlement. Withholding the mandate numbers was the right instinct
  // but the wrong boundary: `outcomes` still carries every counterparty's agreed TERMS, tier and result,
  // so a rival supplier polling this over loopback reads exactly what its competitors settled for — the
  // same disclosure those three routes are gated to prevent, in the endpoint next to them. The dashboard
  // is unaffected: its proxy injects the token (see `shouldInjectControlToken`) on every poll, including
  // the pre-Start ones, because the token is server-side configuration rather than session state.
  app.get("/state", requireControlRead, (_req: Request, res: Response) => {
    res.json({
      started: run.isStarted(),
      // The buyer's PUBLIC ask (already implied by the discovery filters) — lets the dashboard frame the
      // scenario for a newcomer. NOT private: reservation, target, and cap are still withheld below.
      need,
      reasoning,
      // Whether the Stripe USDC settlement layer is active — the dashboard shows its panel only then.
      usdcEnabled: Boolean(settlement),
      killed: governor.killSwitch.active,
      killReason: governor.killSwitch.reason,
      committedUsd: governor.ledger.committedUsd(),
      cleared: run.cleared().map((c) => ({ did: c.ad.did, agentName: c.ad.agentName, level: c.level })),
      outcomes: run.outcomes().map((o) => ({
        supplierDid: o.supplierDid,
        agentName: o.agentName,
        negotiationId: o.negotiationId,
        result: o.result,
        tier: o.tier,
        terms: o.terms,
        detail: o.detail,
      })),
      approvals: governor.approvals.all(),
    });
  });

  // Start the paced flow on the operator's cue (the dashboard's Start button). State-changing, so it is
  // control-token gated like /kill. Idempotent — a second press while running just reports started:true.
  app.post("/start", requireControl, (_req: Request, res: Response) => {
    // A HALTED buyer must not be restartable. `/kill` latches the switch but does not clear `started`, so
    // nothing here refused a second press of Start after an emergency stop: `run()` ran discovery and the
    // three-part identity check again, and the dashboard reported a fresh flow. The negotiations would
    // have died at the next `assertLive()` and the settlement latch would have refused every payment, so
    // no money could move — but an operator who has just hit the stop watching the run appear to begin
    // again is being told the switch did not hold.
    if (governor.killSwitch.active) {
      return res.status(409).json({
        ok: false,
        error: `kill switch is active (${governor.killSwitch.reason}) — refusing to start`,
        killed: true,
      });
    }
    const wasStarted = run.isStarted();
    run.start();
    if (!wasStarted) trail.append({ event: "flow-start" });
    res.json({ ok: true, started: true, alreadyRunning: wasStarted });
  });

  // The kill switch — one prominent button. Severs every live negotiation and revokes any pending,
  // uncommitted reservation, and unblocks any deal waiting on a human approval.
  app.post("/kill", requireControl, async (req: Request, res: Response) => {
    // CHECKED, not cast. `as string` was a lie to the type checker: a JSON body of `{"reason": 12}` or
    // `{"reason": {}}` satisfied `?? default` and travelled as a non-string into `killSwitch.trip`, the
    // trail entry and this response — and `trip` logs the reason as a DATA argument precisely because it
    // is caller-supplied, which only helps if it is actually text.
    //
    // A bad value falls back to the default rather than returning 400: the kill switch must trip on a
    // malformed request too. Refusing the halt to complain about the reason field would make this route
    // fail closed on the one request that must never fail closed.
    //
    // FLATTENED AT THE BOUNDARY, once, rather than at each sink. Every current sink happens to be safe on
    // its own — `trip` logs it inside an object, so Node's inspection quotes the string and escapes the
    // newline; the trail and this response are JSON, which escapes it too. But "safe" there is a property
    // of how those three callers format today, and this value is read back out through
    // `killSwitch.reason`, which `/start` interpolates into a plain string on line 330. Sanitising where
    // the untrusted value ENTERS means the next reader of `reason` inherits the guarantee instead of
    // having to rediscover it.
    const given: unknown = req.body?.reason;
    const reason = oneLine(
      typeof given === "string" && given.trim() !== "" ? given : "operator hit the kill switch",
    );
    // Await the trip so the response is sent only once every side effect (incl. any async
    // transfer-halt) has settled. The latch is set synchronously regardless; a listener failure is
    // reported but the switch IS tripped.
    try {
      await governor.killSwitch.trip(reason);
    } catch (err) {
      // `detailOf`, not `String(err)`. The trail is JSON, so a newline in here is escaped rather than
      // forging a record — but this was the one caught value in the file that bypassed the shared helper,
      // and a reader comparing the two paths would reasonably conclude one of them had a reason to differ.
      trail.append({ event: "kill-switch", reason, listenerError: detailOf(err) });
      return res.status(500).json({ ok: false, killed: true, reason, error: "a kill-switch side effect failed" });
    }
    trail.append({ event: "kill-switch", reason });
    res.json({ ok: true, killed: true, reason });
  });

  // Gated with the other control-plane reads. A queue item carries the counterparty, the full agreed
  // terms, the tier that forced the escalation and the offer hash — the same disclosure `/state`,
  // `/audit`, `/record` and `/settlement` are gated for, on the deals the buyer has NOT yet committed to.
  app.get("/approvals", requireControlRead, (_req: Request, res: Response) => {
    res.json({ pending: governor.approvals.pending(), all: governor.approvals.all() });
  });

  app.post("/approvals/:id/approve", requireControl, (req: Request, res: Response) => {
    const pending = governor.approvals.find(String(req.params.id));
    if (!pending || pending.status !== "pending") return res.status(404).json({ ok: false, error: "no such pending approval" });
    // A2CN §14.1: mint a receipt signed by the HUMAN OPERATOR's key — a different principal from this
    // agent, holding an ApprovalAuthority credential from the trust anchor. The agent cannot approve its
    // own over-mandate deal; that is the whole reason the receipt exists.
    const receipt = issueApprovalReceipt(
      {
        decision: "approve",
        sessionId: pending.negotiationId,
        offerHash: pending.offerHash,
        amountUsd: pending.amountUsd,
        thresholdUsd: pending.thresholdUsd,
        now: new Date(),
      },
      operatorSigner,
    );
    // VERIFY BEFORE the queue changes state, not after. `negotiate.ts` verifies the receipt it receives
    // from `awaitDecision`, but only once `approve` has already flipped the item to "approved" — so a
    // receipt bound to a different session or a different offer was accepted, recorded, and reported to
    // the dashboard and the trail as an approval, and only then rejected by the negotiation. The deal
    // never settled, so no money moved; the operator surface simply said something untrue about a signed
    // artifact, which is the one thing this whole path exists to be trustworthy about.
    //
    // Checked here rather than inside `ApprovalQueue` deliberately: the queue is documented as dumb
    // bookkeeping over items and dispositions, and giving it a crypto dependency and a verification
    // policy would make every caller inherit both. The gate belongs where the receipt is minted.
    const check = verifyApprovalReceipt(receipt, {
      sessionId: pending.negotiationId,
      offerHash: pending.offerHash,
      now: new Date(),
    });
    if (!check.ok) {
      trail.append({ event: "approval-rejected", approvalId: pending.id, reason: check.reason });
      return res.status(422).json({ ok: false, error: `approval receipt did not verify: ${check.reason}` });
    }
    const item = governor.approvals.approve(pending.id, receipt);
    if (!item) return res.status(404).json({ ok: false, error: "no such pending approval" });
    trail.append({ event: "approval-action", approvalId: item.id, action: "approve", receiptId: receipt.id, signerDid: receipt.signer_did });
    res.json({ ok: true, item, receipt });
  });

  app.post("/approvals/:id/reject", requireControl, (req: Request, res: Response) => {
    const item = governor.approvals.reject(String(req.params.id));
    if (!item) return res.status(404).json({ ok: false, error: "no such pending approval" });
    trail.append({ event: "approval-action", approvalId: item.id, action: "reject" });
    res.json({ ok: true, item });
  });

  /**
   * A2CN §10 — this organisation's audit log for one session, and the §10.5 compliance export around it.
   *
   * Unlike /record this is NOT settle-only. §10.1 requires a log on entering any terminal state, "for all
   * outcomes including failures, withdrawals, and timeouts" — the sessions an auditor asks about are the
   * ones that went wrong, so a walk-away has to produce a log too.
   *
   * `?export=1` returns the §10.5 package: the log plus the transaction record, the message history, the
   * mandate reference carrying the approval threshold, and any signed ApprovalReceipts verbatim. Article
   * 14 evidence lives in four places (§10.4) and assembling it by hand is how it goes missing.
   *
   * Reads only the BUYER's half-trail — same rule as /record, no path into another org's store.
   */
  app.get("/audit", requireControlRead, (req: Request, res: Response) => {
    const id = String(req.query.supplier ?? "");
    const did = scenario.suppliers.find((s) => s.id === id)?.did;
    if (!did) return res.status(400).json({ ok: false, error: `unknown supplier '${id}'` });
    const outcome = run.outcomes().find((o) => o.supplierDid === did);
    if (!outcome) return res.json({ ok: true, terminal: false, reason: `no negotiation with ${id} yet` });

    // §14.2: AWAITING_HUMAN_APPROVAL is explicitly a NON-terminal pause state, so there is no audit log
    // to generate yet. Reporting one would assert the session ended when it is still waiting on a person.
    if (outcome.result === "ESCALATE") {
      return res.json({ ok: true, terminal: false, state: "AWAITING_HUMAN_APPROVAL", supplier: id });
    }

    const record = outcome.result === "SETTLED" ? transactionRecordFromTrail(halfTrail.entries(), outcome.negotiationId) : null;
    // Both kinds of human approval bound to this session: the tier escalation that releases
    // AWAITING_HUMAN_APPROVAL, and the payment authorisation before an irreversible transfer.
    const escalationReceipts = governor.approvals
      .all()
      .filter((a) => a.negotiationId === outcome.negotiationId && a.receipt)
      .map((a) => a.receipt!);
    const receipts = [...escalationReceipts, ...(settlementReceipts.get(outcome.negotiationId) ?? [])];

    const auditLog = auditLogFromTrail(halfTrail.entries(), outcome.negotiationId, {
      // Map through the protocol's own reason code, not `detail` prose and not a two-way SETTLED/else
      // collapse. Every non-settled session was being filed as REJECTED_FINAL, so the most common
      // multi-supplier ending — a stand-down because a sibling deal won the units, which goes out on the
      // wire as DONE — appeared in the §10 compliance artifact as a final rejection of a supplier the
      // buyer had no complaint about. `reasonToA2cnTerminal` is the same mapping the a2cn codec uses on
      // the wire, so the audit log and the messages now agree by construction.
      sessionOutcome: outcome.result === "SETTLED" ? "COMPLETED" : reasonToA2cnTerminal(outcome.reasonCode),
      recordId: record?.record_id ?? null,
      // Whose log this is. Part of `log_id`, so the buyer's §10 artifact for a session cannot collide
      // with the supplier's artifact for the same session.
      declaringOrgDid: buyerDid,
      // True for BOTH reasoning modes. §10.3 says this SHOULD be true when an AI agent was involved and
      // MAY be false only where a human drives the tooling directly. A deterministic policy engine
      // negotiating and committing on its own is still an automated decision system; claiming otherwise
      // because no model was called would be the kind of self-serving attestation §10.3 warns recipients
      // about.
      aiSystemInvolved: true,
      // A person can pause or stop this run at any point: the dashboard exposes a live kill switch and
      // the approval queue. That is the assertion this field makes, and it is about capability, not usage.
      humanOversightPresent: true,
      // §10.3 defines this narrowly: "true if the agent made offers or accepted terms without per-round
      // human approval." It is about the NEGOTIATION acts, so only escalation receipts count. A run whose
      // negotiation was autonomous but whose payment a person authorised reports `true` here AND carries
      // a receipt below — which is the honest description of what happened, and more informative than
      // collapsing the two into one flag.
      autonomousDecision: escalationReceipts.length === 0,
      approvalReceipts: receipts,
    });

    if (req.query.export !== "1") return res.json({ ok: true, terminal: true, auditLog });
    res.json({
      ok: true,
      terminal: true,
      export: buildComplianceExport({
        auditLog,
        transactionRecord: record,
        messageHistory: projectHalfTrail(halfTrail.entries(), outcome.negotiationId),
        mandateReferences: [
          {
            party: "initiator",
            mandate_id: MERIDIAN_MANDATE_ID,
            mandate_hash: null,
            // NULL, deliberately. This was `notifyOnSettle.priceAtOrBelow * unitsNeeded` — the exact
            // boundary of the buyer's autonomous band, published in an export that is readable by anyone
            // who can reach this port whenever no control token is set. A supplier that learns where
            // approval kicks in prices just under it and never triggers a human review again; it is the
            // same class of disclosure as the reservation price, which this codebase refuses to emit
            // anywhere (see PRIVATE_MANDATE_FIELDS and the no-leak lint in demo.test.ts).
            //
            // Not substituted with the reservation price either — that is strictly MORE sensitive. The
            // §10.5 field is nullable precisely because a party may be unable to disclose its internal
            // threshold, and the export stays schema-valid without it. `mandate_id` still identifies the
            // governing mandate, so an auditor holding it can look the figure up out of band, which is
            // what a mandate reference is for.
            requires_human_approval_above: null,
            currency: "USD",
          },
        ],
        approvalReceipts: receipts,
      }),
    });
  });

  // The buyer's OWN A2CN §9 transaction record for a settled deal, plus the counterparty hash the
  // supplier volunteered on its ACK. Equal hashes = both sides independently derived the identical deal.
  // This endpoint reads only the BUYER's half-trail; there is deliberately no path by which one org can
  // open another's store (that is what the old /reconcile did, and why it is gone). It is control-token
  // gated for the same reason: the buyer's own half legitimately CONTAINS the counterparty's agreed
  // terms, so serving it open would let any process that can reach this port over loopback — including a
  // rival supplier agent — read the buyer's record of someone else's deal.
  app.get("/record", requireControlRead, (req: Request, res: Response) => {
    const id = String(req.query.supplier ?? "");
    const did = scenario.suppliers.find((s) => s.id === id)?.did;
    if (!did) return res.status(400).json({ ok: false, error: `unknown supplier '${id}'` });
    const settled = run.outcomes().find((o) => o.supplierDid === did && o.result === "SETTLED");
    if (!settled) return res.json({ ok: true, settled: false, reason: `no settled negotiation with ${id} yet` });

    const record = transactionRecordFromTrail(halfTrail.entries(), settled.negotiationId);
    if (!record) return res.json({ ok: true, settled: true, derived: false, reason: "could not derive a record" });
    // Deliberately side-effect free: a GET that appends is a GET that rewrites history every time the
    // dashboard polls, padding the trail with one duplicate `transaction-record` entry per read. The
    // authoritative append happens once, on settle, in `onResolved`.
    res.json({
      ok: true,
      settled: true,
      derived: true,
      agree: settled.recordsAgree ?? null,
      recordHash: record.record_hash,
      counterpartyRecordHash: settled.counterpartyRecordHash ?? null,
      record,
      // The buyer's own half of the exchange, for display. The supplier's half is NOT here and cannot be:
      // each org serves only its own stream.
      buyerHalf: projectHalfTrail(halfTrail.entries(), settled.negotiationId),
    });
  });

  // --------------------------------------------------------------------------------------------------
  // Stripe USDC settlement (only live with USDC_SETTLEMENT + a Stripe key). A snapshot read, the two
  // human-approval buttons for over-threshold deals, and a refresh that re-polls Stripe for on-chain
  // capture. There is no release/dispute anymore: a crypto PaymentIntent captures once, so a settle is a
  // single Stripe-monitored payment. All the buttons are state-changing → control-token gated.
  // --------------------------------------------------------------------------------------------------
  // Gated like `/audit` and `/record`, and for the same reason: a snapshot names the counterparty, the
  // agreed total, and the deposit address for every deal the buyer is paying. Served open, any process
  // that can reach the buyer over loopback — including a rival SUPPLIER agent in this very demo — reads
  // what its competitors settled for. `requireControlToken`, not the strict variant, because this is an
  // idempotent READ: it matches the other two reads and still runs open in the tokenless dev default,
  // where the state-changing settlement routes below already fail closed on their own.
  app.get("/settlement", requireControlRead, (_req: Request, res: Response) => {
    if (!settlement) return res.json({ enabled: false, settlements: [] });
    res.json({
      enabled: true,
      // Public policy inputs so the panel can explain why a deal is awaiting approval. None is private.
      policy: { humanApprovalAboveUsd: settlementPolicy.humanApprovalAboveUsd },
      network: "tempo",
      token: "USDC",
      settlements: settlement.snapshots(),
    });
  });

  /**
   * Mint, store and trail the operator's A2CN §14 receipt for a PAYMENT decision.
   *
   * ONE helper for both decisions and every exit, because the evidence went missing at the exits. The
   * approve-funding route recorded the receipt only on its clean success path, so the in-flight branch
   * (`DEPOSIT_SENT`, capture unconfirmed) returned before ever reaching it — and `/refresh`, which is what
   * eventually drives that record to SUCCEEDED, never minted one either. The result was a payment that
   * completed with no signed evidence that a human authorised it, permanently: `/audit` exports
   * `settlementReceipts` (see the compliance export above), so the §10.5 package for that session showed a
   * captured transfer and no approval behind it. The catch block below treats precisely that end state as
   * serious enough to warn about; the early return produced it in silence.
   *
   * `reject-funding` had no receipt at all, which was the same gap from the other side: the two halves of
   * one irreversible human decision, only one of which left proof. `issueApprovalReceipt` already takes
   * `decision: "reject"`.
   *
   * Idempotent, because the callers can now legitimately reach it twice for one payment (the in-flight
   * branch, then a later refresh or sweep). The receipt id is derived from the session and the act, so a
   * re-mint for the same decision is dropped rather than doubling the audit evidence.
   *
   * Never throws: a signing failure must not turn "the payment is open" into an error response, so the
   * failure is returned for the caller to report alongside the outcome that actually happened.
   */
  function recordFundingDecision(
    snap: SettlementSnapshot,
    decision: "approve" | "reject",
  ): { receipt?: ApprovalReceipt; error?: string } {
    const action = decision === "approve" ? "approve-funding" : "reject-funding";
    try {
      // Bound to the §9 record hash rather than an offer hash: what a person decides here is payment for
      // one specific, already-agreed deal, and the record hash is the identifier both parties derived for
      // exactly that deal. `threshold_crossed` records the settlement gate, which is a different and lower
      // bar than the negotiation-act threshold in `mandate_references`.
      const record = transactionRecordFromTrail(halfTrail.entries(), snap.negotiationId);
      const receipt = issueApprovalReceipt(
        {
          decision,
          sessionId: snap.negotiationId,
          offerHash: record?.record_hash ?? `settlement:${snap.settlementId}`,
          amountUsd: snap.amountUsd,
          thresholdUsd: settlementPolicy.humanApprovalAboveUsd,
          now: new Date(),
        },
        operatorSigner,
      );
      const held = settlementReceipts.get(snap.negotiationId) ?? [];
      // Matched on the decision too, not the id alone: the id does not encode the decision, and two
      // contradictory receipts for one payment is evidence worth keeping rather than deduplicating away.
      if (!held.some((r) => r.id === receipt.id && r.scope.decision === receipt.scope.decision)) {
        settlementReceipts.set(snap.negotiationId, [...held, receipt]);
        trail.append({
          event: "approval-action",
          approvalId: snap.settlementId,
          action,
          receiptId: receipt.id,
          signerDid: receipt.signer_did,
        });
      }
      return { receipt };
    } catch (err) {
      const detail = detailOf(err);
      console.error(
        // `settlementId` is flattened too, not just `detail`. It reads as internal — the manager throws
        // rather than returning a snapshot for an id it does not hold — but it ENTERED through `:id` on the
        // route, and "a lookup rejects unknown ids" is a property of today's manager, not of this log line.
        `[buyer] payment ${oneLine(snap.settlementId)} was ${decision}d but its receipt failed to issue — ` +
          `the audit log will be missing evidence for this decision: ${detail}`,
      );
      trail.append({ event: "approval-receipt-failed", approvalId: snap.settlementId, action, detail });
      return { error: detail };
    }
  }

  // The human-approval buttons for OPENING the payment (over-threshold deals). State-changing → gated.
  app.post("/settlement/:id/approve-funding", requireControlStrict, async (req: Request, res: Response) => {
    if (!settlement) return res.status(404).json({ ok: false, error: "USDC settlement not enabled" });

    // PHASE 1 — open the payment. A failure here USUALLY means no PaymentIntent was opened and no money
    // moved, which is what makes a 400 truthful. But `approveFunding` also throws when the capture poll
    // fails AFTER the deposit went out: `settlement.ts` deliberately leaves that record DEPOSIT_SENT and
    // retryable rather than FAILED, and the route was flattening the distinction back into a 400 the
    // dashboard renders as "Settlement approve-funding failed". Money on the chain reported as a refused
    // approval is the exact confusion the DEPOSIT_SENT state exists to prevent, so ask the record which
    // case this is instead of assuming.
    let snap;
    try {
      snap = await settlement.approveFunding(String(req.params.id));
    } catch (err) {
      const detail = detailOf(err);
      const after = settlement.get(String(req.params.id));
      if (after?.state === "DEPOSIT_SENT") {
        // Identifiers as DATA, not in the format string — same reason as the kill-switch logger: a `%s`
        // in an interpolated id would consume the next argument and forge the line.
        console.error("[buyer] payment is IN FLIGHT (deposit sent) but capture is unconfirmed.", {
          settlementId: after.settlementId,
          detail,
        });
        // The operator's approval is recorded HERE too, not only on the clean path. The deposit is on the
        // chain, so the human decision that authorised it has already had its irreversible effect; leaving
        // without a receipt (this branch returns, and the sweep or a later refresh is what finishes the
        // capture) left the §10.5 export showing a captured payment nobody had signed for.
        const { receipt, error } = recordFundingDecision(after, "approve");
        return res.json({
          ok: true,
          settlement: after,
          captureUnconfirmed: true,
          receipt,
          ...(error ? { receiptIssued: false } : {}),
          warning: `deposit sent; capture unconfirmed (${detail}). The sweep retries automatically, or use refresh.`,
        });
      }
      return res.status(400).json({ ok: false, error: detail });
    }

    // PHASE 2 — record the evidence. Past this line the PaymentIntent EXISTS and USDC is being sent, so
    // nothing here may report failure in a way that reads as "the approval did not happen". A single try
    // around both phases returned the same generic 400 whether Stripe refused the payment or the receipt
    // merely failed to sign — and the dashboard rendered both as "Settlement approve-funding failed",
    // telling an operator no money moved while it was already on the chain. The states are not close
    // enough to share a response: one is "nothing happened", the other is "it happened and the audit
    // trail is short a receipt".
    //
    // The receipt itself is the human step this demo exercises most: the negotiation usually completes
    // inside the mandate (autonomous), then stops for a person before money moves, so authorising an
    // irreversible stablecoin transfer is the most consequential decision in a run.
    const { receipt, error } = recordFundingDecision(snap, "approve");
    if (error) {
      // ok:true — the thing the operator pressed the button for DID happen. `receiptIssued: false` is the
      // caveat, and it is a real one: the §10 audit log will have no signed evidence for this approval, so
      // it is returned rather than swallowed (the helper has already logged it). 200, not 4xx: the payment
      // is open, and a status code that says otherwise would be the lie this split exists to prevent.
      return res.json({
        ok: true,
        settlement: snap,
        receiptIssued: false,
        warning: `payment is open, but the approval receipt could not be issued: ${error}`,
      });
    }
    res.json({ ok: true, settlement: snap, receipt });
  });

  app.post("/settlement/:id/reject-funding", requireControlStrict, (req: Request, res: Response) => {
    if (!settlement) return res.status(404).json({ ok: false, error: "USDC settlement not enabled" });
    try {
      const snap = settlement.rejectFunding(String(req.params.id));
      // A REJECTION is a signed human decision too. Only the approve half minted a receipt, so the audit
      // export could show that a person had authorised a payment and never that a person had refused one —
      // and refusing is the decision an auditor asking "why was this deal never paid?" is looking for.
      const { receipt, error } = recordFundingDecision(snap, "reject");
      res.json({ ok: true, settlement: snap, receipt, ...(error ? { receiptIssued: false } : {}) });
    } catch (err) {
      res.status(400).json({ ok: false, error: detailOf(err) });
    }
  });

  // Re-poll Stripe for on-chain capture of a still-pending payment (the "Refresh" button / manual retry).
  app.post("/settlement/:id/refresh", requireControlStrict, async (req: Request, res: Response) => {
    if (!settlement) return res.status(404).json({ ok: false, error: "USDC settlement not enabled" });
    try {
      const snap = await settlement.refresh(String(req.params.id));
      // `refresh` returns null for an id it does not hold — a 404 is the honest status for that, and it
      // keeps the caller from reading `settlement: null` as a successful refresh of an empty record.
      if (!snap) return res.status(404).json({ ok: false, error: `no settlement ${String(req.params.id)}` });
      res.json({ ok: true, settlement: snap });
    } catch (err) {
      res.status(400).json({ ok: false, error: detailOf(err) });
    }
  });

  return app;
}
