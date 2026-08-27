// Dashboard — subscribes to EACH org's own SSE stream and reconstructs the story by negotiationId.
// There is no shared feed: five independent EventSource connections, one per org (see ORGS — the
// buyer plus four suppliers). The reservation
// price is never here because it is never on any stream. Crucially the AGENTS never read each other's
// data either — where this page shows two sides agreeing, it is showing two independently published
// values that happen to match, not one org inspecting another's records.

// Everything is same-origin: the dashboard server reverse-proxies each org's stream at
// /events/<org> and the buyer's control endpoints at their own paths. So in a micro-VM only THIS
// port needs publishing — the browser never addresses the agents directly.
import { resolveSupplierOrg } from "./attribution.js";
import { bannerHtml } from "./banner.js";

// Every org with its own event stream. Order matches infra/demo.mjs so the connection dots read in the
// same order as the console output.
const ORGS = ["buyer", "summit", "cascade", "alpine", "ridge"];
// Display names AND the DID->org lookup (see resolveOrgFromDid below), so a supplier missing from here
// does not merely lose its label — its records stop attributing to any org at all.
const SUPPLIER_NAME = { summit: "Summit Gear", cascade: "Cascade Gear", alpine: "Alpine Supply", ridge: "RidgeLine Trading" };

// Everything rendered via innerHTML below is untrusted: DIDs, agent names, reason strings and terms
// all originate from counterparties (a supplier picks its own agentName/did when it advertises). Escape
// before interpolation so a supplier named `<img src=x onerror=…>` cannot run script in this console.
const esc = (s) =>
  String(s == null ? "" : s).replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
const prettyDid = (d) => String(d || "").replace(/^did:web:/, "").replace(/\.example$/, "");
// Returns an HTML fragment, so EVERY part of it is escaped — including the three numbers. They are
// declared `z.number()` in the protocol schema, but this page is downstream of that check, not behind
// it: the same string reaches here from a stream event, and `deliveryTerms` right beside them was
// already escaped for exactly that reason. An unescaped hole in a function whose output is assigned to
// innerHTML is not worth the character it saves.
const fmtTerms = (t) => {
  if (!t) return "";
  const bits = [];
  if (t.unitPriceUsd != null) bits.push(`$${esc(t.unitPriceUsd)}/u`);
  if (t.units != null) bits.push(`${esc(t.units)}u`);
  if (t.leadTimeDays != null) bits.push(`${esc(t.leadTimeDays)}d`);
  if (t.deliveryTerms) bits.push(esc(t.deliveryTerms));
  return bits.join(" · ");
};

// Announce state changes to screen readers via the off-screen live regions. `assertive` (the kill
// switch) interrupts; everything else is polite. Messages that arrive within one frame — e.g. two
// parallel negotiations resolving together — are coalesced into a single utterance so none is lost
// (a plain textContent set would keep only the last). Blanking first forces a repeat to re-announce.
let liveQueue = [];
let alertQueue = [];
let liveScheduled = false;
function announce(msg, assertive) {
  (assertive ? alertQueue : liveQueue).push(msg);
  if (liveScheduled) return;
  liveScheduled = true;
  requestAnimationFrame(() => {
    liveScheduled = false;
    flushLive("live", liveQueue); liveQueue = [];
    flushLive("live-alert", alertQueue); alertQueue = [];
  });
}
function flushLive(id, queue) {
  if (!queue.length) return;
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = "";
  el.textContent = queue.join(". ");
}

// ---- state -----------------------------------------------------------------------------------------
const cands = new Map(); // did -> {did, level, reason, checks}
const negs = new Map(); // negotiationId -> {order, supplierOrg, toDid, msgs:[], tier, result, severed, walked}
// supplierOrg -> { ours, theirs, terms, record, buyerHalf }
// `ours` is the hash the BUYER published on the buyer stream; `theirs` is the hash that supplier
// published on ITS OWN stream. The browser is the only place both appear, and only because the
// operator subscribed to both — no agent ever sees the other's. Equal hashes = proven deal.
const reconciles = new Map();
const settlements = new Map(); // settlementId -> snapshot (from GET /settlement)
const settlementLog = []; // {action, detail, amountUsd, at} — built from the buyer's settlement SSE events
const settlementSeen = new Set(); // dedupe key per log event (a reconnect replays history)
const settlementInFlight = new Set(); // settlementIds with a POST outstanding — keep buttons disabled across re-renders
// True while a POST /start is outstanding. pollState() runs every 2s and drives the Start button from
// the server's `started` flag, so without this it RE-ENABLED the button mid-request — the buyer has not
// flipped `started` yet — and a second click fired a duplicate /start. Idempotent server-side, but the
// operator sees the button bounce, which reads as the first click not having registered.
let startInFlight = false;
let negOrder = 0;
let killed = false;

const shortAddr = (a) => { const s = String(a || ""); return s.length > 12 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s; };
const usd = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

// Every state-changing POST carries the same-origin marker header the dashboard proxy requires (its CSRF
// defense — a cross-origin page cannot attach a custom header without a preflight the server rejects).
function controlPost(path, body) {
  const headers = { "x-requested-by": "meridian-dashboard" };
  const opts = { method: "POST", headers };
  if (body !== undefined) { headers["content-type"] = "application/json"; opts.body = JSON.stringify(body); }
  return fetch(path, opts);
}

// A human-readable name for a negotiation's counterparty, for both display and announcements.
function negName(n) {
  return n.supplierOrg ? SUPPLIER_NAME[n.supplierOrg] : n.toDid ? prettyDid(n.toDid) : "supplier";
}

function neg(id) {
  let n = negs.get(id);
  if (!n) {
    n = { order: negOrder++, supplierOrg: null, toDid: null, msgs: [], seen: new Set(), tier: null, result: null, severed: false, walked: false };
    negs.set(id, n);
  }
  return n;
}

// ---- record routing --------------------------------------------------------------------------------
function handleRecord(org, rec) {
  // Discovery / verification — from the buyer's stream.
  if (org === "buyer" && rec.stage === "trust" && rec.did) {
    cands.set(rec.did, { did: rec.did, level: rec.level, reason: rec.reason, checks: rec.checks });
    if (rec.level) announce(`${prettyDid(rec.did)} identity ${rec.level}`);
    renderCands();
  }
  if (org === "buyer" && rec.event === "discovered" && Array.isArray(rec.candidates)) {
    for (const c of rec.candidates) if (!cands.has(c.did)) cands.set(c.did, { did: c.did, level: null, reason: "discovered" });
    renderCands();
  }

  // Column identity: a supplier naming itself on a negotiationId.
  if (org !== "buyer" && rec.negotiationId) {
    const n = neg(rec.negotiationId);
    if (!n.supplierOrg) { n.supplierOrg = org; renderNegs(); }
  }

  // A2CN §9 transaction records arrive from BOTH sides: the buyer publishes its derived hash on the
  // buyer stream, and each supplier publishes its own on ITS OWN stream. This handler must therefore
  // sit OUTSIDE the buyer-only section — the whole proof is having both, from two separate sources.
  if (rec.event === "transaction-record" && rec.recordHash) {
    const so = org === "buyer" ? resolveSupplierOrg(rec, negs, supplierOrgFromDid) : org;
    if (so) {
      const prev = reconciles.get(so) || {};
      const next = org === "buyer"
        ? { ...prev, ours: rec.recordHash, terms: rec.settledTerms ?? prev.terms }
        : { ...prev, theirs: rec.recordHash, terms: prev.terms ?? rec.settledTerms };
      reconciles.set(so, next);
      if (next.ours && next.theirs) {
        announce(`${SUPPLIER_NAME[so] || so}: transaction records ${next.ours === next.theirs ? "match — both sides derived the same deal" : "DISAGREE"}`);
      }
      renderRecs();
    }
  }

  // Negotiation transcript — the buyer's half (sent + received), no duplication with supplier streams.
  if (org === "buyer" && rec.negotiationId && rec.type && rec.direction) {
    const n = neg(rec.negotiationId);
    // Dedupe by message identity: a reconnect replays the hub's whole history, so without this the
    // same bubble would be appended twice after the stream recovers.
    const key = `${rec.direction}:${rec.correlationId}:${rec.type}:${rec.round}`;
    if (!n.seen.has(key)) {
      n.seen.add(key);
      if (rec.direction === "sent" && rec.to) n.toDid = rec.to;
      n.msgs.push({ dir: rec.direction, type: rec.type, terms: rec.terms, round: rec.round, reasonCode: rec.reasonCode });
      if (rec.type === "WALKAWAY") n.walked = true;
    }
    renderNegs();
  }
  if (org === "buyer" && rec.negotiationId) {
    const n = neg(rec.negotiationId);
    if (rec.event === "decision" && rec.tier) n.tier = rec.tier;
    if (rec.event === "escalated") {
      n.tier = rec.tier; n.result = n.result || "ESCALATE";
      announce(`${negName(n)} needs your approval before it can commit — a dialog has opened`);
    }
    if (rec.event === "negotiation-end") {
      n.result = rec.result; if (rec.tier) n.tier = rec.tier;
      announce(`${negName(n)} negotiation ${rec.result}`);
    }
    if (rec.event === "accept-revoked" || rec.event === "killed") n.severed = true;
    renderNegs();
  }

  // Stripe USDC settlement events — the buyer's money layer narrates itself onto its own trail.
  if (org === "buyer" && rec.event === "settlement" && rec.settlementId && rec.action) {
    const key = `${rec.settlementId}:${rec.action}:${rec.at || ""}`;
    if (!settlementSeen.has(key)) {
      settlementSeen.add(key);
      settlementLog.push({ action: rec.action, detail: rec.detail, amountUsd: rec.amountUsd, at: rec.at });
      announce(`Settlement ${String(rec.action).replace(/_/g, " ").toLowerCase()}: ${rec.detail || ""}`);
      renderSettlementLog();
    }
    // A streamed transition means the snapshot changed — refresh the cards promptly, not just on the poll.
    pollSettlement();
  }

  // Global kill — dim every unsettled column.
  if (org === "buyer" && rec.event === "kill-switch") {
    killed = true;
    for (const n of negs.values()) if (n.result !== "SETTLED") n.severed = true;
    announce("Kill switch activated — every live negotiation severed and uncommitted deals revoked", true);
    markKilled();
    renderNegs();
  }
}

// The DID label each supplier org publishes, mapped explicitly. `prettyDid` reduces
// `did:web:ridgeline-trading.example` to `ridgeline-trading`, which is NOT the org id `ridge` — hence
// the alias. Substring matching handled that by accident and was order-dependent while doing it: the
// loop returned the first org id appearing anywhere in the label, so a future supplier whose label
// contained another's id ("summit-gear-north", "alpine-ridge-outfitters") would be attributed to
// whichever key `Object.entries` happened to yield first. Attribution decides which column a message
// lands in, so getting it wrong silently retells the story with the wrong counterparty.
const ORG_BY_DID_LABEL = {
  "summit-gear": "summit",
  "cascade-gear": "cascade",
  "alpine-supply": "alpine",
  "ridgeline-trading": "ridge",
};

function supplierOrgFromDid(did) {
  return ORG_BY_DID_LABEL[prettyDid(did)] ?? null;
}

// ---- rendering -------------------------------------------------------------------------------------
function renderCands() {
  const el = document.getElementById("cands");
  if (cands.size === 0) return;
  el.innerHTML = "";
  for (const c of cands.values()) {
    const div = document.createElement("div");
    div.className = "cand";
    const level = c.level || "…";
    div.innerHTML =
      `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center">` +
      `<span class="did">${esc(prettyDid(c.did))}</span>` +
      `<span class="badge b-${esc(level)}">${esc(level)}</span></div>` +
      `<div class="reason">${esc(c.reason)}</div>`;
    el.appendChild(div);
  }
}

function renderNegs() {
  const el = document.getElementById("cols");
  const list = [...negs.values()].sort((a, b) => a.order - b.order);
  if (list.length === 0) return;
  el.innerHTML = "";
  for (const n of list) {
    const name = negName(n);
    const col = document.createElement("div");
    col.className = "col" + (n.severed ? " severed" : "");
    // Each column is a labelled group so a screen reader can navigate deal-by-deal, with tier/result
    // and any severed state folded into the group's accessible name.
    col.setAttribute("role", "group");
    const status = [n.tier, n.result, n.severed ? "severed" : ""].filter(Boolean).join(", ");
    col.setAttribute("aria-label", `Negotiation with ${name}${status ? ` — ${status}` : ""}`);
    let head = `<div class="head"><span class="name">${esc(name)}</span>`;
    if (n.tier) head += ` <span class="tier tier-${esc(n.tier)}">${esc(n.tier)}</span>`;
    if (n.result) head += ` <span class="result r-${esc(n.result)}">${esc(n.result)}</span>`;
    head += `</div>`;
    let stream = `<div class="stream">`;
    for (const m of n.msgs) {
      const cls = m.dir === "sent" ? "sent" : "recv";
      // Direction is otherwise only shown by left/right alignment — spell it out for non-visual users.
      const dirWord = m.dir === "sent" ? "Sent" : "Received";
      const terms = fmtTerms(m.terms);
      stream += `<div class="bub ${cls}"><div class="t"><span class="sr-only">${dirWord}: </span>${esc(m.type)}${m.round != null ? ` · r${esc(m.round)}` : ""}</div>` +
        (terms ? `<div class="terms">${terms}</div>` : "") + `</div>`;
    }
    if (n.walked) stream += `<div class="walk"><span aria-hidden="true">✕ </span>walk-away</div>`;
    stream += `</div>`;
    col.innerHTML = head + stream;
    el.appendChild(col);
    // Pin each column to its newest message. `.col` is capped at 62vh and `.stream` scrolls, so once a
    // negotiation runs past that height every further turn was appended BELOW the visible area and the panel
    // silently stopped showing the conversation — a long negotiation looked frozen while it was still going.
    // Must run after appendChild: scrollHeight is 0 until the node is in the document.
    const sc = col.querySelector(".stream");
    if (sc) sc.scrollTop = sc.scrollHeight;
  }
}

function halfColumn(title, records) {
  const rows = (records || [])
    .map((r) => {
      const arrow = r.direction === "SENT" ? "→" : "←";
      const dirWord = r.direction === "SENT" ? "Sent" : "Received";
      return `<div class="htrec"><span class="htdir ${r.direction === "SENT" ? "sent" : "recv"}" aria-hidden="true">${arrow}</span>` +
        `<span class="sr-only">${dirWord}: </span>` +
        `<span class="httype">${esc(r.msgType)}</span><span class="htr">r${esc(r.round)}</span>` +
        `<span class="htcid" title="${esc(r.correlationId)}">${esc(String(r.correlationId).slice(0, 8))}</span></div>`;
    })
    .join("");
  return `<div class="half"><div class="half-h">${esc(title)}</div>${rows || '<div class="empty">—</div>'}</div>`;
}

async function renderRecs() {
  const el = document.getElementById("recs");
  const settled = [...negs.values()].filter((n) => n.result === "SETTLED" && n.supplierOrg);
  if (settled.length === 0 && reconciles.size === 0) return;
  el.innerHTML = "";
  const orgs = new Set([...settled.map((n) => n.supplierOrg), ...reconciles.keys()]);
  for (const org of orgs) {
    // Normalised to {} so a settled deal with no record yet still renders the waiting state. Left
    // undefined it skipped the whole block below and drew a bare "Show record" button with no
    // explanation — the row looked broken rather than pending.
    const r = reconciles.get(org) || {};
    const row = document.createElement("div");
    row.className = "rec-row";
    const supName = SUPPLIER_NAME[org] || org;
    const both = r && r.ours && r.theirs;
    const agree = both && r.ours === r.theirs;
    let html = `<div class="rec-head"><span class="name">Buyer ⇄ ${esc(supName)}</span>` +
      `<button data-org="${esc(org)}" aria-label="Show the buyer's transaction record for ${esc(supName)}">Show record</button>`;
    if (both) {
      html += agree
        ? `<span class="rec-verdict match"><span aria-hidden="true">✓ </span>MATCH</span>`
        : `<span class="rec-verdict mismatch"><span aria-hidden="true">✕ </span>MISMATCH</span>`;
    }
    html += `</div>`;
    // The two independently-derived fingerprints, each published by the org that computed it. This is
    // the whole proof: same 43 characters, worked out separately, neither party reading the other.
    html += `<div class="halves">${hashColumn("buyer derived", r.ours)}${hashColumn(`${supName} derived`, r.theirs)}</div>`;
    if (both) {
      html += agree
        ? `<div class="rec-detail">${fmtTerms(r.terms)} — both sides independently derived the same record (neither read the other's log)</div>`
        : `<div class="rec-detail">the two sides derived DIFFERENT records — this deal is not proven</div>`;
    } else {
      html += `<div class="rec-detail">waiting for both sides to publish their record…</div>`;
    }
    if (r.buyerHalf) html += `<div class="halves">${halfColumn("buyer half-trail (its own messages)", r.buyerHalf)}</div>`;
    row.innerHTML = html;
    el.appendChild(row);
  }
  el.querySelectorAll("button[data-org]").forEach((b) =>
    b.addEventListener("click", () => runReconcile(b.getAttribute("data-org"))),
  );
}

/** One side's derived fingerprint. Two of these side by side ARE the proof. */
function hashColumn(title, hash) {
  const body = hash
    ? `<div class="htrec"><span class="htcid" title="${esc(hash)}">${esc(String(hash).slice(0, 24))}…</span></div>`
    : '<div class="empty">not published yet</div>';
  return `<div class="half"><div class="half-h">${esc(title)}</div>${body}</div>`;
}

/** Fetch the buyer's OWN record. There is deliberately no endpoint that returns a supplier's — the
 *  supplier's hash reaches this page only because the operator subscribed to the supplier's stream. */
async function runReconcile(org) {
  try {
    const res = await fetch(`/record?supplier=${org}`);
    // A 4xx/5xx body is not a record. Parsing it anyway produced `undefined` hashes that the `?? prev`
    // fallbacks then hid entirely, so a failing endpoint looked exactly like a deal still waiting for
    // its counterparty — the one thing this panel must never misreport.
    if (!res.ok) throw new Error(`record request failed with status ${res.status}`);
    const data = await res.json();
    const prev = reconciles.get(org) || {};
    reconciles.set(org, {
      ...prev,
      ours: data.recordHash ?? prev.ours,
      theirs: data.counterpartyRecordHash ?? prev.theirs,
      terms: data.record?.agreed_terms ?? prev.terms,
      buyerHalf: data.buyerHalf ?? prev.buyerHalf,
    });
    renderRecs();
  } catch (e) {
    console.error("record fetch failed", e);
    announce(`${SUPPLIER_NAME[org] || org}: buyer record fetch failed`, true);
  }
}

// ---- Stripe USDC settlement ------------------------------------------------------------------------
// The panel is fed two ways: GET /settlement for the authoritative snapshots (state, deposit address,
// token/contract) and the buyer's settlement SSE events for the live event log. Buttons POST the buyer's
// control routes; the control token is injected by the proxy, never held here.
async function pollSettlement() {
  try {
    const res = await fetch(`/settlement`);
    // A non-OK body is an error object, not state. Parsing it regardless made a 401 (no control token
    // reaching the buyer) look like `enabled: undefined` — so the panel silently hid itself and the
    // operator saw a working dashboard with the settlement section simply absent.
    if (!res.ok) return void console.error("poll /settlement failed:", res.status);
    const data = await res.json();
    const section = document.getElementById("settlement");
    if (!data.enabled) { section.hidden = true; return; }
    section.hidden = false;
    for (const s of data.settlements || []) settlements.set(s.settlementId, s);
    const sub = document.getElementById("escrow-sub");
    if (sub) {
      const net = (data.network || "tempo");
      const cap = data.policy ? usd(data.policy.humanApprovalAboveUsd) : "";
      sub.textContent = `${data.token || "USDC"} on ${net} · Stripe crypto PaymentIntent · human approval over ${cap}`;
    }
    renderSettlements();
  } catch (e) { /* buyer not up yet, or settlement off */ }
}

// The payment's progress, as a label + colour class for its status badge.
const SETTLEMENT_STAGE = {
  PENDING_APPROVAL: "awaiting approval",
  REJECTED: "rejected",
  REQUIRES_DEPOSIT: "awaiting deposit",
  DEPOSIT_SENT: "capturing",
  SUCCEEDED: "captured",
  FAILED: "failed",
};

function renderSettlements() {
  const el = document.getElementById("escrows");
  if (settlements.size === 0) return;
  el.innerHTML = "";
  for (const s of settlements.values()) {
    const div = document.createElement("div");
    div.className = "escrow";
    const pending = s.state === "PENDING_APPROVAL";
    const capturing = s.state === "REQUIRES_DEPOSIT" || s.state === "DEPOSIT_SENT";
    // A request for this settlement is outstanding — keep its buttons disabled even if a poll re-renders
    // the card before the server-side state changes, so a double-click can't fire a second action.
    const busy = settlementInFlight.has(s.settlementId);
    const id = esc(s.settlementId);
    // Buttons depend on the stage: an over-threshold deal must first be APPROVED into a payment
    // (Create payment / Reject); a payment still capturing can be re-polled with Refresh.
    let actions = "";
    if (pending) {
      actions =
        `<button class="release" data-settlement-action="approve-funding" data-settlement-id="${id}" ${busy ? "disabled" : ""} aria-label="Approve — open the ${usd(s.amountUsd)} Stripe payment">Create payment</button>` +
        `<button class="dispute" data-settlement-action="reject-funding" data-settlement-id="${id}" ${busy ? "disabled" : ""} aria-label="Reject — do not open the payment">Reject</button>`;
    } else if (capturing) {
      actions = `<button class="release" data-settlement-action="refresh" data-settlement-id="${id}" ${busy ? "disabled" : ""} aria-label="Refresh — re-check Stripe for on-chain capture">Refresh</button>`;
    }
    const stage = SETTLEMENT_STAGE[s.state] || String(s.state).replace(/_/g, " ");
    // On-chain payment facts: the deposit address the buyer agent paid, and the token + its contract.
    const addrBit = s.depositAddress
      ? `<span>deposit <b>${esc(shortAddr(s.depositAddress))}</b></span>`
      : `<span>deposit <b>—</b></span>`;
    const tokenBit = s.tokenContract
      ? `<span>${esc(s.token || "USDC")} <b>${esc(shortAddr(s.tokenContract))}</b></span>`
      : `<span>token <b>${esc(s.token || "USDC")}</b></span>`;
    const piBit = s.paymentIntentId ? `intent ${esc(shortAddr(s.paymentIntentId))}` : "not yet opened";
    div.innerHTML =
      `<div class="escrow-head"><span class="name">${esc(s.agentName || "seller")}</span>` +
      `<span class="e-state e-${esc(s.state)}">${esc(stage)}</span>` +
      `<span class="escrow-addr">${piBit}</span></div>` +
      (pending ? `<div class="escrow-note">Deal value <b>${usd(s.amountUsd)}</b> is over the auto-pay limit — a human must approve opening the payment.</div>` : "") +
      (s.lastError ? `<div class="escrow-note">Payment error: ${esc(s.lastError)}</div>` : "") +
      `<div class="escrow-meta"><span>amount <b>${usd(s.amountUsd)}</b></span>` +
        `<span>network <b>${esc(s.network || "tempo")}</b></span>` +
        tokenBit + addrBit +
        (s.amountReceivedUsd > 0 ? `<span>received <b>${usd(s.amountReceivedUsd)}</b></span>` : "") +
      `</div>` +
      `<div class="escrow-actions">${actions}</div>`;
    el.appendChild(div);
  }
  el.querySelectorAll("button[data-settlement-action]").forEach((b) =>
    b.addEventListener("click", () => settlementAction(b.getAttribute("data-settlement-id"), b.getAttribute("data-settlement-action"))),
  );
}

function renderSettlementLog() {
  const el = document.getElementById("escrow-log");
  if (settlementLog.length === 0) return;
  el.innerHTML = "";
  // Newest last (append order), matching a chain of events read top-to-bottom.
  for (const ev of settlementLog) {
    const row = document.createElement("div");
    row.className = "elog";
    const t = ev.at ? new Date(ev.at).toLocaleTimeString() : "";
    row.innerHTML =
      `<span class="ea">${esc(String(ev.action).replace(/_/g, " "))}</span>` +
      `<span class="ed">${esc(ev.detail || "")}</span>` +
      `<span class="et">${esc(t)}</span>`;
    el.appendChild(row);
  }
  el.scrollTop = el.scrollHeight;
}

async function settlementAction(id, action) {
  // Mark this settlement in-flight so its buttons stay disabled — even across a pollSettlement() re-render
  // mid-request — until the action completes. Prevents a double-click firing two actions (e.g.
  // approve-then-reject) before the snapshot reflects the new state.
  if (settlementInFlight.has(id)) return;
  settlementInFlight.add(id);
  [...document.querySelectorAll("#escrows button")].filter((b) => b.getAttribute("data-settlement-id") === id).forEach((b) => (b.disabled = true));
  try {
    const res = await controlPost(`/settlement/${encodeURIComponent(id)}/${action}`);
    // Status BEFORE body. `res.json()` throws on a non-JSON error page and, worse, a 401/403 body has
    // no `ok` field at all — so `!data.ok` was true and the operator saw "Settlement <action> failed",
    // which is the right words for the wrong reason: it reports a refused REQUEST as a refused PAYMENT.
    // These are the money buttons; the distinction between "the buyer rejected this" and "the buyer
    // never saw it" is the whole message. Matches decide() and the pollers.
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.error || `HTTP ${res.status}`;
      console.error("settlement action rejected", detail);
      announce(`Settlement ${action} was REJECTED by the buyer: ${detail}`, true);
    } else if (!data.ok) {
      console.error("settlement action failed", data.error);
      announce(`Settlement ${action} failed: ${data.error || "error"}`);
    } else {
      announce(`Settlement ${action} submitted`);
    }
  } catch (e) {
    console.error(e);
    announce(`Settlement ${action} failed to reach the buyer`, true);
  } finally { settlementInFlight.delete(id); await pollSettlement(); }
}

// ---- approval dialog (polled) ----------------------------------------------------------------------
// Pending approvals surface as a modal, not a side panel: a deal the agent CANNOT commit without a
// human is an interrupt, so it takes focus until you decide. Only PENDING items appear; a resolved
// one just closes (its outcome is announced and shows on its negotiation column).
let apprSig = "";
let modalReturnFocus = null; // element to restore focus to when the dialog closes

async function pollApprovals() {
  try {
    const res = await fetch(`/approvals`);
    // Same reason: on a 401 `data.all` is undefined, the pending list reads as empty, and the approval
    // dialog closes — showing "nothing to approve" while a deal is in fact blocked waiting for a human.
    if (!res.ok) return void console.error("poll /approvals failed:", res.status);
    const data = await res.json();
    const pending = (data.all || []).filter((i) => i.status === "pending");
    // Re-render only on a real change: this poll runs every 1.5s, and rebuilding the dialog every tick
    // would yank keyboard focus off the Approve/Reject button a user is trying to activate.
    //
    // The signature must cover EVERYTHING `renderApprovalItems` displays, not just the id. Keyed on id
    // alone, an item whose terms or tier changed while pending kept its old rendering indefinitely —
    // and those are the numbers on the button's own aria-label, so a screen-reader user could be told
    // they are approving a price that is no longer the one on offer. Focus preservation is worth a
    // stale frame; it is not worth a stale figure on the approve button.
    const sig = JSON.stringify(
      pending.map((i) => [i.id, i.agentName, i.supplierDid, i.tier, i.reason, i.terms]),
    );
    if (sig === apprSig) return;
    apprSig = sig;
    if (pending.length === 0) { closeApprovalModal(); return; }
    renderApprovalItems(pending);
    openApprovalModal();
  } catch (e) { /* buyer not up yet */ }
}

function renderApprovalItems(pending) {
  const el = document.getElementById("approval-items");
  el.innerHTML = "";
  for (const item of pending) {
    const div = document.createElement("div");
    div.className = "appr";
    const name = item.agentName || prettyDid(item.supplierDid);
    const terms = fmtTerms(item.terms);
    div.innerHTML =
      `<div style="display:flex;justify-content:space-between;gap:8px"><b>${esc(name)}</b>` +
      `<span class="tier tier-${esc(item.tier)}">${esc(item.tier)}</span></div>` +
      `<div class="terms">${terms}</div>` +
      `<div class="reason" style="color:var(--dim);font-size:12px">${esc(item.reason)}</div>` +
      `<div style="margin-top:6px">` +
      `<button class="approve" data-approve="${esc(item.id)}" aria-label="Approve ${esc(name)} deal: ${terms}">Approve</button>` +
      `<button class="reject" data-reject="${esc(item.id)}" aria-label="Reject ${esc(name)} deal: ${terms}">Reject</button></div>`;
    el.appendChild(div);
  }
  el.querySelectorAll("button[data-approve]").forEach((b) => b.addEventListener("click", () => decide(b.getAttribute("data-approve"), "approve")));
  el.querySelectorAll("button[data-reject]").forEach((b) => b.addEventListener("click", () => decide(b.getAttribute("data-reject"), "reject")));
}

// Everything behind the dialog is made `inert` so neither a mouse nor Tab can reach it while a decision
// is pending — the standard modal contract. (The kill switch goes inert too; Reject is the safe exit.)
function setBackgroundInert(on) {
  for (const node of [document.querySelector("header"), document.getElementById("banner"), document.querySelector("main")]) {
    if (!node) continue;
    if (on) node.setAttribute("inert", "");
    else node.removeAttribute("inert");
  }
}

function openApprovalModal() {
  const backdrop = document.getElementById("approval-backdrop");
  const first = backdrop.querySelector("button");
  if (backdrop.hidden) {
    // Remember where focus was so we can return it on close, then move focus into the dialog.
    modalReturnFocus = document.activeElement;
    backdrop.hidden = false;
    setBackgroundInert(true);
    if (first) first.focus();
  } else if (!backdrop.contains(document.activeElement) && first) {
    // Already open but re-rendered (a new pending arrived): only re-grab focus if it was lost.
    first.focus();
  }
}

function closeApprovalModal() {
  const backdrop = document.getElementById("approval-backdrop");
  if (backdrop.hidden) return;
  backdrop.hidden = true;
  setBackgroundInert(false);
  if (modalReturnFocus && document.contains(modalReturnFocus)) modalReturnFocus.focus();
  modalReturnFocus = null;
}

// Keep Tab within the dialog while it is open — a modal must not let focus wander behind it.
document.getElementById("approval-modal").addEventListener("keydown", (e) => {
  // Escape is INTERCEPTED, not honoured. Every other modal convention says Escape dismisses, and this
  // one deliberately does not: the deal is paused server-side until a human approves or rejects, there
  // is no close control, and "dismissing" would only hide a decision that is still blocking. Since this
  // is a `role="dialog"` div rather than a native <dialog>, Escape did nothing at all — indistinguishable
  // from a frozen page for a keyboard user. Say so out loud instead.
  if (e.key === "Escape") {
    e.preventDefault();
    announce("This approval is still required — choose approve or reject for each deal.", true);
    return;
  }
  if (e.key !== "Tab") return;
  const btns = [...document.getElementById("approval-modal").querySelectorAll("button")];
  if (!btns.length) return;
  const first = btns[0], last = btns[btns.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
});

// Approval ids with a decision request currently in flight. A second click before the first resolves
// used to fire a second POST for the SAME deal: the buyer's approve route is not idempotent, so the
// duplicate either raced the first to commit or came back 404/409 after the queue had already moved on —
// and the failure branch then announced "Deal approve FAILED" over a decision that had in fact succeeded.
// The 1.5s poll leaves a wide window for that double-click, and the button gives no busy feedback of its
// own, so the guard is here rather than relying on the operator not to click twice.
const decisionsInFlight = new Set();

async function decide(id, action) {
  if (decisionsInFlight.has(id)) return;
  decisionsInFlight.add(id);
  // Disable BOTH controls for this id, not just the one clicked — approve and reject are mutually
  // exclusive decisions about one deal, so the other button is equally unsafe while this request is out.
  const controls = [
    ...document.querySelectorAll(`button[data-approve="${cssEscape(id)}"]`),
    ...document.querySelectorAll(`button[data-reject="${cssEscape(id)}"]`),
  ];
  for (const b of controls) b.disabled = true;
  try {
    // Check the response before announcing. `controlPost` resolves for a 401/404/500 exactly as it does
    // for success — fetch only rejects on a network error — so this announced "approved, it will now
    // commit" for a request the buyer had refused. Announcing a commitment that did not happen is the
    // worst possible thing for this particular button to get wrong. Mirrors settlementAction() above.
    // Success must be POSITIVELY confirmed. `data.ok === false` only caught an explicit denial, so a 200
    // whose body did not parse — `.catch(() => ({}))` yields `{}`, as does any non-JSON proxy/error page —
    // left `data.ok` undefined, failed that test, and fell through to "approved, it will now commit" on a
    // response that confirmed nothing. The route answers `{ok: true, …}` on success and `{ok: false,
    // error}` on failure, so requiring `ok === true` is exactly the signal the buyer actually sends.
    //
    // Split three ways, matching settlementAction(): a refused REQUEST and a refused DECISION are
    // different messages to give an operator, and collapsing them reports "the buyer rejected this" when
    // the truth is "the buyer never saw it".
    const res = await controlPost(`/approvals/${encodeURIComponent(id)}/${action}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const detail = data.error || `HTTP ${res.status}`;
      console.error("approval action rejected", detail);
      announce(`Deal ${action} was REJECTED by the buyer: ${detail}`, true);
    } else if (data.ok !== true) {
      const detail = data.error || "the buyer did not confirm it";
      console.error("approval action failed", detail);
      announce(`Deal ${action} FAILED: ${detail}`, true);
    } else {
      announce(`Deal ${action === "approve" ? "approved — it will now commit" : "rejected"}`);
    }
  } catch (e) {
    console.error(e);
    announce(`Deal ${action} failed to reach the buyer`, true);
  } finally {
    // Released BEFORE the re-poll, and the buttons re-enabled here too. `pollApprovals` re-renders only
    // when the pending signature actually changed, so a decision that left the queue unchanged (a failed
    // approve) would never rebuild these nodes — leaving them disabled forever with no way to retry.
    // Re-enabling the existing nodes covers that; a re-render replaces them with fresh enabled ones.
    decisionsInFlight.delete(id);
    for (const b of controls) b.disabled = false;
    // Re-poll either way: the queue is the source of truth about what actually happened.
    await pollApprovals();
  }
}

/** Quote a value for use inside a CSS attribute selector. `CSS.escape` where available (every browser
 *  this dashboard targets), with a conservative manual fallback so the selector cannot break on an id
 *  containing a quote or backslash. */
function cssEscape(value) {
  const s = String(value);
  return window.CSS && typeof window.CSS.escape === "function" ? window.CSS.escape(s) : s.replace(/["\\]/g, "\\$&");
}

// ---- header state (polled) -------------------------------------------------------------------------
let started = false;
// The count last written into the banner. -1 (not 0) so the very first poll always renders: 0 is a real
// value the banner must be able to show, not a "nothing yet" sentinel.
let bannerCount = -1;
let modeSet = false;
async function pollState() {
  try {
    const res = await fetch(`/state`);
    // Same reason: `s.committedUsd || 0` renders committed spend as $0 on any failed poll, which is the
    // single most misleading number this page can show.
    if (!res.ok) return void console.error("poll /state failed:", res.status);
    const s = await res.json();
    document.getElementById("spend").textContent =
      `committed $${(s.committedUsd || 0).toLocaleString()} (cap is private)`;
    // Reasoning mode badge: LLM (with model) vs deterministic. Set once — it doesn't change mid-run.
    if (s.reasoning && !modeSet) {
      const el = document.getElementById("mode");
      if (s.reasoning.mode === "llm") {
        el.className = "mode llm";
        el.textContent = `LLM · ${s.reasoning.model}`;
        el.setAttribute("aria-label", `Agents reason with an LLM (${s.reasoning.model}), clamped to the mandate`);
        el.title = "Each agent's moves come from an LLM, clamped to the mandate. Falls back to deterministic per turn on error.";
      } else {
        el.className = "mode det";
        el.textContent = "Deterministic";
        el.setAttribute("aria-label", "No LLM configured — agents use built-in deterministic strategy");
        el.title = "No LLM_BASE_URL set — built-in strategy. Reproducible and offline; same outcomes as the LLM path.";
      }
      modeSet = true;
    }
    // Frame the scenario in plain language from the buyer's public ask. Re-rendered whenever the number
    // of cleared suppliers changes — NOT latched on the first poll, which happens before Start when
    // nothing has cleared and used to pin the banner at "0 suppliers" all run. See banner.js.
    if (s.need && Array.isArray(s.cleared) && s.cleared.length !== bannerCount) {
      bannerCount = s.cleared.length;
      document.getElementById("banner").innerHTML = bannerHtml(s.need, bannerCount, esc);
    }
    if (s.killed && !killed) { killed = true; markKilled(); }
    // Show Start only while the flow is armed-but-idle. Once it has begun (here or in a terminal run)
    // the button is retired — nothing to start, and re-pressing would be a no-op.
    started = !!s.started;
    const startBtn = document.getElementById("start");
    startBtn.hidden = started;
    // Keep it disabled while our own request is in flight, whatever the server currently reports.
    startBtn.disabled = started || startInFlight;
  } catch (e) { /* ignore */ }
}

// Both handlers check res.ok before announcing. `controlPost` resolves for a 401/403/500 exactly as it
// does for success, so these announced "started" / left the kill switch looking armed for requests the
// buyer had refused — and a rejected /start also left the button disabled, so there was no way to retry
// and no indication why. Same fix as `decide()`; these two were the remaining unchecked callers.
document.getElementById("start").addEventListener("click", async () => {
  const btn = document.getElementById("start");
  if (startInFlight) return;
  startInFlight = true;
  btn.disabled = true;
  try {
    const res = await controlPost(`/start`);
    if (!res.ok) {
      const detail = await res.json().then((d) => d.error).catch(() => null);
      console.error("start failed", detail ?? res.status);
      announce(`Start FAILED: ${detail ?? `HTTP ${res.status}`}`, true);
      startInFlight = false;
      btn.disabled = false;
      return;
    }
    announce("Demo started — the buyer is discovering and verifying suppliers");
    // Cleared BEFORE the poll so pollState() sees the true state and can settle the button itself.
    startInFlight = false;
    await pollState();
  } catch (e) {
    console.error(e);
    announce("Start failed to reach the buyer", true);
    startInFlight = false;
    btn.disabled = false;
  }
});

function markKilled() {
  const btn = document.getElementById("kill");
  btn.textContent = "SEVERED";
  btn.setAttribute("aria-label", "Kill switch activated — negotiations severed");
  btn.classList.remove("armed");
  btn.disabled = true;
}

document.getElementById("kill").addEventListener("click", async () => {
  if (!confirm("Sever every live negotiation and revoke uncommitted deals?")) return;
  try {
    const res = await controlPost(`/kill`, { reason: "dashboard kill switch" });
    if (!res.ok) {
      const detail = await res.json().then((d) => d.error).catch(() => null);
      console.error("kill failed", detail ?? res.status);
      // Assertive: an operator who pressed the kill switch must not be left believing it landed.
      announce(`KILL SWITCH FAILED — negotiations are still live: ${detail ?? `HTTP ${res.status}`}`, true);
    }
    // On success the buyer's own `kill-switch` trail event drives markKilled() over SSE, so there is
    // nothing to announce here — the stream is the confirmation.
  } catch (e) {
    console.error(e);
    announce("KILL SWITCH FAILED to reach the buyer — negotiations may still be live", true);
  }
});

// ---- streams ---------------------------------------------------------------------------------------
function connect(org) {
  const es = new EventSource(`/events/${org}`);
  es.onmessage = (ev) => {
    try { handleRecord(org, JSON.parse(ev.data)); } catch (e) { /* keepalive/comment */ }
    setConn();
  };
  es.onerror = () => {
    setConn();
    // Native EventSource does NOT auto-reconnect after a FAILED connection (a non-200 response — e.g.
    // the proxy's 502 while the buyer was still starting): it goes straight to CLOSED and gives up. So
    // if it has closed, re-open it ourselves after a short delay. On reconnect the hub replays history,
    // so a stream opened before the agents were ready recovers on its own — no manual page reload.
    // (A transient drop mid-stream leaves it CONNECTING, where native retry handles it — we don't touch that.)
    if (es.readyState === EventSource.CLOSED) {
      setTimeout(() => connect(org), 1000);
    }
  };
  connState[org] = es;
}
const connState = {};
function setConn() {
  const dots = ORGS.map((o) => {
    const s = connState[o];
    const up = s && s.readyState === 1;
    const color = up ? `var(--${o})` : "var(--dim)";
    // The dot is decorative (color only); the connected/offline state is spelled out for screen readers.
    return `<span class="dot" style="background:${color}" aria-hidden="true"></span>${o}<span class="sr-only"> ${up ? "connected" : "offline"}</span>`;
  });
  document.getElementById("conn").innerHTML = dots.join("&nbsp;&nbsp;");
}

for (const org of ORGS) connect(org);
setConn();
setInterval(pollApprovals, 1500);
setInterval(pollState, 2000);
// Settlement snapshot poll keeps the capture status fresh while Stripe watches the chain.
setInterval(pollSettlement, 2000);
pollApprovals();
pollState();
pollSettlement();
