#!/usr/bin/env node
/**
 * Sample the negotiation OUTCOME DISTRIBUTION — no dashboard, no browser, no Stripe.
 *
 * WHY THIS EXISTS. Once either side reasons with an LLM, "did it work?" stops being a meaningful
 * question: the same inputs legitimately produce different outputs, and a single run tells you almost
 * nothing. Every real finding in this project came from distributions, not runs — that the settle price
 * was pinned to exactly one value; that adding a `hold` move took it to three; that a supplier holding
 * its price was being scored as bad faith and walked away from. None of those are visible in one run.
 *
 * Driving the browser demo was the original instrument and it was the wrong one: ~20 minutes for five
 * data points, which is not enough signal to tell a real improvement from noise. In-process, the same
 * negotiation code path gives 20 samples in a few minutes.
 *
 * WHAT IT RUNS. The REAL `runNegotiation`, the REAL seller engine, the real signing and verification —
 * wired together by an in-process channel instead of HTTP. It also runs the parts of the ORCHESTRATION
 * that change the answer, and those are easy to leave out:
 *   - one shared Governor, so the cross-deal spend cap binds exactly as it does live;
 *   - one shared QuoteBoard, so each negotiation can see its rivals' live prices;
 *   - one shared CommitCoordinator, so suppliers reach best-and-final and the CHEAPEST is chosen.
 * That last one matters more than it looks. Without the barrier the negotiations RACE — whoever reaches
 * a committable price first settles and consumes the spend cap — so the recorded price is "who got there
 * first", not "who was cheaper", which is the comparison this harness exists to make.
 *
 * THE STANDING TRAP. A sampling rig encodes assumptions, and the ones it omits are invisible. This one
 * has been wrong three times — once by running a single supplier while the buyer's prompt talked about
 * its alternatives, once by faking a rival's price instead of running the rival, once by omitting the
 * commit barrier. Every omission flattered the result, which is not a coincidence: you leave out what you
 * are not thinking about, and that is where the problem is. When you change what the agent KNOWS, check
 * that this harness still models it. It will not warn you; it will just keep printing tidy numbers.
 *
 * Usage:
 *   pnpm sample                                    # 12 samples, deterministic, summit+cascade
 *   N=20 SUPS=summit,cascade,alpine pnpm sample    # all three trusted suppliers
 *   LLM_BASE_URL=... LLM_API_KEY=... LLM_MODEL=... pnpm sample     # LLM on both sides
 *   ENDGAME=1 pnpm sample                          # also print the last exchanges of the first runs
 *
 * Ridge is absent from the default set on purpose: it is rejected at the trust gate in the live run and
 * never negotiates, so including it here would measure a negotiation that cannot happen.
 */
import {
  createSeller,
  loadCatalog,
  loadScenario,
  loadSigner,
  loadSupplierPolicy,
  makeSellerReasoner,
  verifyCounterparty,
  verifySignedEnvelope,
// Relative to the built output rather than the package name: this script sits at the workspace ROOT,
// which is not a package and so has no @meridian/* dependency links to resolve through.
} from "../packages/agent-runtime/dist/index.js";
import { runNegotiation } from "../packages/buyer/dist/negotiate.js";
import { loadMandate } from "../packages/buyer/dist/mandate.js";
import { Governor } from "../packages/buyer/dist/governor.js";
import { makeReasoner } from "../packages/buyer/dist/llm.js";
import { QuoteBoard } from "../packages/buyer/dist/quote-board.js";
import { CommitCoordinator } from "../packages/buyer/dist/commit-coordinator.js";

const scenario = loadScenario();
const buyerDid = scenario.shortfall.buyer;
const buyerSigner = loadSigner(buyerDid);
const mandate = loadMandate(scenario);

const N = Number(process.env.N ?? 12);
const REQUESTED = (process.env.SUPS ?? "summit,cascade").split(",").map((s) => s.trim()).filter(Boolean);
const SHOW_ENDGAME = process.env.ENDGAME === "1";

// The live trust gate, run here for the same reason index.ts runs it: a REJECTED counterparty never
// exchanges a message, so including one would sample a negotiation that cannot happen, and hard-coding
// trust: "VERIFIED" would sample it at the WRONG trust level — the level feeds tier classification, so a
// LIMITED supplier that must escalate would be measured as one that can settle autonomously. Ridge is
// the live example: it fails the gate, which is exactly why it is not in the default set.
const TRUSTED = REQUESTED.map((id) => ({ id, trust: verifyCounterparty(loadCatalog(id)) })).filter(({ id, trust }) => {
  if (trust.level === "REJECTED") {
    console.log(`skipping ${id}: rejected at the trust gate (${trust.reason}) — it never negotiates in a live run`);
    return false;
  }
  return true;
});
if (TRUSTED.length === 0) throw new Error("no requested supplier cleared the trust gate");
const IDS = TRUSTED.map((t) => t.id);
const TRUST_BY_ID = new Map(TRUSTED.map((t) => [t.id, t.trust.level]));

/** One full buying round: every supplier negotiated concurrently, then the best committable offer taken. */
async function sampleOnce() {
  const rationales = [];
  const trail = {
    append(r) {
      if (SHOW_ENDGAME && (r.rationale || r.event === "seller-walked")) rationales.push(r);
    },
  };
  // Shared across the concurrent negotiations, exactly as packages/buyer/src/server.ts wires them.
  const governor = new Governor(mandate);
  const quoteBoard = new QuoteBoard();
  const coordinator = new CommitCoordinator(IDS.length);

  const negotiate = async (id) => {
    const ad = loadCatalog(id);
    const sellerSigner = loadSigner(ad.did);
    const seller = createSeller(
      {
        ...loadSupplierPolicy(id),
        capacityUnits: ad.maxUnits,
        leadTimeDays: ad.minLeadTimeDays,
        orgName: ad.agentName,
      },
      { did: ad.did, trail, reasoner: makeSellerReasoner(id, ad.agentName) ?? undefined },
    );
    const outcome = await runNegotiation({
      buyerDid,
      signer: buyerSigner,
      mandate,
      governor,
      trust: TRUST_BY_ID.get(id),
      ad,
      trail,
      orgName: "Meridian Outfitters",
      reasoner: makeReasoner(),
      parallelNegotiations: IDS.length,
      quoteBoard,
      commitCoordinator: coordinator,
      channel: {
        async send(signed) {
          if (!verifySignedEnvelope(signed).ok) throw new Error("signature rejected");
          const reply = sellerSigner.sign(await seller.handleAsync(signed));
          return { env: reply, raw: reply, wireProfile: "meridian" };
        },
      },
    });
    return {
      id,
      result: outcome.result,
      price: outcome.terms?.unitPriceUsd ?? null,
      rounds: outcome.rounds,
      detail: outcome.detail,
    };
  };

  const per = await Promise.all(
    IDS.map((id) => negotiate(id).catch((e) => ({ id, result: "ERROR", price: null, detail: String(e).slice(0, 80) }))),
  );
  // What the buyer actually buys: the cheapest supplier that settled.
  const won = per.filter((r) => r.result === "SETTLED").sort((a, b) => a.price - b.price)[0] ?? null;
  return {
    per,
    rationales,
    result: won ? "SETTLED" : per.some((r) => r.result === "ESCALATE") ? "ESCALATE" : "WALKED",
    price: won?.price ?? null,
    winner: won?.id ?? null,
    rounds: Math.max(...per.map((r) => r.rounds ?? 0)),
  };
}

const runs = [];
for (let i = 0; i < N; i++) {
  try {
    runs.push(await sampleOnce());
  } catch (e) {
    runs.push({ per: [], result: "ERROR", price: null, detail: String(e).slice(0, 80) });
  }
  process.stdout.write(".");
}

const tally = (xs) => {
  const m = new Map();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};

console.log(`\n\n${IDS.join("+").toUpperCase()} — ${N} samples (price = what the buyer actually paid)`);
for (const [k, v] of tally(runs.map((r) => (r.result === "SETTLED" ? `SETTLED $${r.price}` : r.result)))) {
  console.log(`  ${String(v).padStart(3)}  ${k}`);
}

const prices = runs.filter((r) => r.price != null).map((r) => r.price);
if (prices.length) {
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  console.log(
    `  range $${Math.min(...prices)} – $${Math.max(...prices)}   distinct ${new Set(prices).size}   mean $${mean.toFixed(2)}`,
  );
}

const winners = tally(runs.map((r) => r.winner).filter(Boolean));
if (winners.length) {
  console.log("\n  WHO WON THE BUSINESS");
  for (const [k, v] of winners) console.log(`  ${String(v).padStart(3)}  ${k}`);
}

// Rounds are worth watching: maxRounds is a RUNAWAY GUARD, not the stopping rule (see seed/mandate.json).
// If the longest negotiations are sitting on the guard, it has quietly become the stopping rule again and
// the outcome is arithmetic rather than a decision.
const rounds = runs.map((r) => r.rounds ?? 0).filter(Boolean);
if (rounds.length) {
  const atGuard = rounds.filter((r) => r >= mandate.budget.maxRounds).length;
  const mean = rounds.reduce((a, b) => a + b, 0) / rounds.length;
  console.log(
    `\n  ROUNDS  mean ${mean.toFixed(1)}  max ${Math.max(...rounds)}  guard ${mandate.budget.maxRounds}` +
      `  hit-guard ${atGuard}/${rounds.length}${atGuard ? "   <-- the guard is acting as the stopping rule" : ""}`,
  );
}

const gate = Number(process.env.SETTLEMENT_APPROVAL_ABOVE_USD ?? 9_100);
const totals = runs.filter((r) => r.price != null).map((r) => r.price * scenario.shortfall.unitsNeeded);
if (totals.length) {
  const human = totals.filter((t) => t > gate).length;
  console.log(
    `\n  HUMAN PAYMENT GATE at $${gate.toLocaleString()}: ${human}/${totals.length} runs need approval ` +
      `(${Math.round((human / totals.length) * 100)}%)`,
  );
}

if (SHOW_ENDGAME) {
  console.log("\n  ENDGAME of the first 3 runs (last 4 exchanges each):");
  for (const r of runs.slice(0, 3)) {
    console.log(`\n  --- ${r.result}${r.price ? ` $${r.price}` : ""} ---`);
    for (const m of (r.rationales ?? []).slice(-4)) {
      console.log(`    ${String(m.rationale ?? m.reason ?? "").slice(0, 104)}`);
    }
  }
}
