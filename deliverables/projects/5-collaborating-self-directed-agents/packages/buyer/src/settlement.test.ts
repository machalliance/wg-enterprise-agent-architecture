import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  SettlementManager,
  StripeApiGateway,
  centsToUsd,
  loadSettlementPolicy,
  mapStripeStatus,
  pickDepositAddress,
  usdToCents,
  type CryptoDeposit,
  type FundRequest,
  type IntentStatus,
  type SettlementEvent,
  type SettlementPolicy,
  type StripeClientLike,
  type StripeGateway,
} from "./settlement.js";
import { KillSwitch } from "./kill-switch.js";

/**
 * The Stripe USDC settlement layer. These prove the flow's guarantees without touching the network: a
 * committed deal opens a crypto PaymentIntent, the buyer agent sends USDC to the issued Tempo deposit
 * address, and the settle reaches SUCCEEDED once Stripe reports capture. The human-approval gate parks
 * over-threshold deals, and the mandate bound refuses an over-cap draw. A fake gateway stands in for the
 * live Stripe client at the same seam the real one implements.
 */

// A no-op emitter for tests that don't assert on events.
const silent = () => {};

const fastPolicy = (over = 1_000): SettlementPolicy => ({
  humanApprovalAboveUsd: over,
  captureTimeoutMs: 200,
  pollIntervalMs: 1,
});

/** A configurable stand-in for the live Stripe client. Records what it was asked to do and returns a
 *  scripted sequence of PaymentIntent statuses from retrieveIntent (defaulting to immediate capture). */
class FakeStripeGateway implements StripeGateway {
  createdFor: string[] = [];
  deposited: string[] = [];
  retrieveCount = 0;
  #statuses: IntentStatus[];
  #failCreate: boolean;
  #failDeposit: boolean;
  #lastAmountCents = 0;

  constructor(opts: { statuses?: IntentStatus[]; failCreate?: boolean; failDeposit?: boolean } = {}) {
    // Default: the first retrieve already shows capture, so settle() completes in one poll.
    this.#statuses = opts.statuses ?? ["succeeded"];
    this.#failCreate = opts.failCreate ?? false;
    this.#failDeposit = opts.failDeposit ?? false;
  }

  async createCryptoDepositIntent(args: {
    amountCents: number;
    currency: string;
    negotiationId: string;
    sellerId: string;
  }): Promise<CryptoDeposit> {
    if (this.#failCreate) throw new Error("stripe rejected the PaymentIntent");
    this.createdFor.push(args.negotiationId);
    this.#lastAmountCents = args.amountCents;
    return {
      paymentIntentId: `pi_${args.negotiationId}`,
      status: "requires_action",
      network: "tempo",
      depositAddress: "0xdeposit0000000000000000000000000000beef",
      token: "USDC",
      tokenContract: "0xcontract00000000000000000000000000000abc",
      amountReceivedCents: 0,
    };
  }

  async buyerSendDeposit(args: { paymentIntentId: string; network: string; tokenCurrency: string }): Promise<void> {
    this.deposited.push(args.paymentIntentId);
    // Models the PRODUCTION path documented on the interface: the transfer is signed and broadcast, and
    // THEN something fails — a timeout awaiting the receipt. The deposit is recorded above first,
    // because that is the whole point: money may already be moving when this throws.
    if (this.#failDeposit) throw new Error("timed out awaiting the transfer receipt");
  }

  async retrieveIntent(_paymentIntentId: string): Promise<{ status: IntentStatus; amountReceivedCents: number }> {
    this.retrieveCount++;
    // Advance through the scripted statuses, then HOLD the last one (a steady state) so a short poll queue
    // does not silently flip to "succeeded" when it drains.
    const status = (this.#statuses.length > 1 ? this.#statuses.shift() : this.#statuses[0]) as IntentStatus;
    return { status, amountReceivedCents: status === "succeeded" ? this.#lastAmountCents : 0 };
  }
}

const req = (over: Partial<FundRequest> = {}): FundRequest => ({
  negotiationId: "neg-1",
  agentName: "Summit Gear",
  sellerId: "did:web:summit",
  totalUsd: 500,
  mandateRemainingUsd: 1_000_000,
  ...over,
});

describe("USD <-> Stripe minor units", () => {
  it("rounds dollars to integer cents and back", () => {
    assert.equal(usdToCents(1), 100);
    assert.equal(usdToCents(0.5), 50);
    assert.equal(usdToCents(279_000.99), 27_900_099);
    assert.equal(centsToUsd(27_900_099), 279_000.99);
  });
  it("rejects a negative or non-finite amount", () => {
    assert.throws(() => usdToCents(-1));
    assert.throws(() => usdToCents(Number.NaN));
  });
});

describe("mapStripeStatus", () => {
  it("projects Stripe statuses onto the four the settlement acts on", () => {
    assert.equal(mapStripeStatus("succeeded"), "succeeded");
    assert.equal(mapStripeStatus("processing"), "processing");
    assert.equal(mapStripeStatus("requires_action"), "requires_action");
    assert.equal(mapStripeStatus("requires_payment_method"), "requires_action");
    assert.equal(mapStripeStatus("canceled"), "failed");
    assert.equal(mapStripeStatus(undefined), "failed");
  });
});

describe("pickDepositAddress", () => {
  it("pulls the address + token + contract for the chosen network", () => {
    const pi = {
      id: "pi_1",
      next_action: {
        crypto_display_details: {
          deposit_addresses: [
            { network: "ethereum", address: "0xeth", supported_token: { symbol: "USDC", contract_address: "0xethusdc" } },
            { network: "Tempo", address: "0xtempo", supported_token: { symbol: "USDC", contract_address: "0xtempousdc" } },
          ],
        },
      },
    };
    const got = pickDepositAddress(pi, "tempo");
    assert.equal(got.address, "0xtempo");
    assert.equal(got.token, "USDC");
    assert.equal(got.tokenContract, "0xtempousdc");
  });
  it("accepts a sole entry when it IS the requested network, and reads its token off the flat shape", () => {
    const pi = {
      id: "pi_2",
      next_action: { crypto_display_details: { deposit_addresses: [{ network: "tempo", address: "0xonly", currency: "usdc", contract_address: "0xc" }] } },
    };
    const got = pickDepositAddress(pi, "tempo");
    assert.equal(got.address, "0xonly");
    // Asserting the token too, not just the address: the token/contract come from a DIFFERENT field
    // family here (`currency`/`contract_address` directly on the entry, no nested token object), and
    // checking only the address left that fallback unverified. Upper-cased on the way out.
    assert.equal(got.token, "USDC");
    assert.equal(got.tokenContract, "0xc");
  });

  it("reads the nested supported_tokens[] array shape (token_currency / token_contract_address)", () => {
    // The third field family the parser accepts, and the only one no test exercised. Preview snapshots
    // have moved between all three spellings, which is why the lookup is defensive — but a defensive
    // branch nothing covers is just an untested branch, and this one decides where real USDC is sent.
    const pi = {
      id: "pi_5",
      next_action: {
        crypto_display_details: {
          deposit_addresses: [
            { network: "tempo", address: "0xarr", supported_tokens: [{ token_currency: "usdc", token_contract_address: "0xarrusdc" }] },
          ],
        },
      },
    };
    const got = pickDepositAddress(pi, "tempo");
    assert.equal(got.address, "0xarr");
    assert.equal(got.token, "USDC");
    assert.equal(got.tokenContract, "0xarrusdc");
  });
  it("throws when the sole entry is on the WRONG network", () => {
    // There used to be a "if there's only one address, just use it" fallback here. A single entry on
    // the wrong chain is still the wrong chain, and this address is where real USDC gets sent — so a
    // mismatch has to fail loudly rather than quietly settle onto whatever Stripe happened to return.
    const pi = {
      id: "pi_4",
      next_action: { crypto_display_details: { deposit_addresses: [{ network: "ethereum", address: "0xwrongchain" }] } },
    };
    assert.throws(() => pickDepositAddress(pi, "tempo"), /no tempo deposit address/);
  });
  it("throws when no address is present for the network", () => {
    const pi = { id: "pi_3", next_action: { crypto_display_details: { deposit_addresses: [] } } };
    assert.throws(() => pickDepositAddress(pi, "tempo"));
  });

  it("selects USDC out of supported_tokens rather than taking the first entry", () => {
    // The token is not decoration: it reaches `buyerSendDeposit` as `tokenCurrency` and decides what the
    // deposit is actually made in. `supported_tokens[0]` took whatever Stripe listed first, so a network
    // that offers EURC ahead of USDC produced a network-correct, token-wrong deposit.
    const pi = {
      id: "pi_6",
      next_action: {
        crypto_display_details: {
          deposit_addresses: [
            {
              network: "tempo",
              address: "0xmulti",
              supported_tokens: [
                { token_currency: "eurc", token_contract_address: "0xeurc" },
                { token_currency: "usdc", token_contract_address: "0xusdc" },
              ],
            },
          ],
        },
      },
    };
    const got = pickDepositAddress(pi, "tempo");
    assert.equal(got.token, "USDC");
    assert.equal(got.tokenContract, "0xusdc", "the USDC contract, not the first one listed");
  });

  it("throws when the network offers tokens but not USDC", () => {
    // A list that exists and omits USDC is Stripe saying this chain cannot settle the way we intend.
    // Paying in whatever else it offered is the failure, so it fails loudly — same rule as the network.
    const pi = {
      id: "pi_7",
      next_action: {
        crypto_display_details: {
          deposit_addresses: [
            { network: "tempo", address: "0xnousdc", supported_tokens: [{ token_currency: "eurc", token_contract_address: "0xeurc" }] },
          ],
        },
      },
    };
    assert.throws(() => pickDepositAddress(pi, "tempo"), /no USDC on tempo/);
  });

  it("throws when the selected token has no contract address", () => {
    // Continuing with `tokenContract: ""` pushed the discovery of an unusable destination all the way
    // to the on-chain send.
    const pi = {
      id: "pi_8",
      next_action: {
        crypto_display_details: { deposit_addresses: [{ network: "tempo", address: "0xaddr", supported_token: { symbol: "USDC" } }] },
      },
    };
    assert.throws(() => pickDepositAddress(pi, "tempo"), /no token contract address/);
  });
});

describe("SettlementManager — autonomous (under threshold)", () => {
  it("opens a PaymentIntent, sends the deposit, and captures to SUCCEEDED", async () => {
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: (e) => events.push(e) });

    const { status, settlement } = await mgr.submit(req({ totalUsd: 500 }));

    assert.equal(status, "funded");
    assert.equal(settlement.state, "SUCCEEDED");
    assert.equal(settlement.paymentIntentId, "pi_neg-1");
    assert.equal(settlement.depositAddress, "0xdeposit0000000000000000000000000000beef");
    assert.equal(settlement.token, "USDC");
    assert.equal(settlement.network, "tempo");
    assert.equal(settlement.amountReceivedUsd, 500);
    // The buyer agent sent USDC to the issued address exactly once.
    assert.deepEqual(gw.deposited, ["pi_neg-1"]);
    // The event narrative the trail/dashboard replays, in order.
    assert.deepEqual(
      events.map((e) => e.action),
      ["INTENT_CREATED", "DEPOSIT_SENT", "CAPTURED"],
    );
  });

  it("polls until Stripe reports capture (processing -> succeeded)", async () => {
    const gw = new FakeStripeGateway({ statuses: ["processing", "processing", "succeeded"] });
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: silent });
    const { settlement } = await mgr.submit(req());
    assert.equal(settlement.state, "SUCCEEDED");
    assert.ok(gw.retrieveCount >= 3, `expected at least 3 retrieves, saw ${gw.retrieveCount}`);
  });

  it("leaves the settle DEPOSIT_SENT (retryable) when capture outruns the poll budget", async () => {
    // Perpetual "processing" → never captures within the budget, so it stays DEPOSIT_SENT for a later refresh.
    const gw = new FakeStripeGateway({ statuses: ["processing"] });
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: silent });
    const { settlement } = await mgr.submit(req());
    assert.equal(settlement.state, "DEPOSIT_SENT");
    // A refresh while Stripe still shows processing leaves it DEPOSIT_SENT (retryable, not stuck).
    const refreshed = await mgr.refresh("neg-1");
    assert.ok(refreshed, "the record exists, so refresh returns a snapshot rather than null");
    assert.equal(refreshed.state, "DEPOSIT_SENT");
  });

  it("returns null for an id it does not hold, rather than throwing", async () => {
    // The operator's Refresh button races the record's own lifecycle, so an unknown id is an ordinary
    // outcome. `refresh` documented this as safe and then threw on exactly that case.
    const mgr = new SettlementManager({ gateway: new FakeStripeGateway(), policy: fastPolicy(), emit: silent });
    assert.equal(await mgr.refresh("no-such-settlement"), null);
  });
});

describe("SettlementManager — human-approval gate (over threshold)", () => {
  it("parks an over-threshold deal as PENDING_APPROVAL and opens nothing", async () => {
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: (e) => events.push(e) });

    const { status, settlement } = await mgr.submit(req({ totalUsd: 5_000 }));

    assert.equal(status, "pending-approval");
    assert.equal(settlement.state, "PENDING_APPROVAL");
    assert.equal(settlement.paymentIntentId, ""); // no intent opened yet
    assert.deepEqual(gw.createdFor, []); // Stripe was NOT called
    assert.deepEqual(events.map((e) => e.action), ["PAYMENT_REQUESTED"]);
  });

  it("approveFunding opens the payment and settles it", async () => {
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: (e) => events.push(e) });

    await mgr.submit(req({ totalUsd: 5_000 }));
    const snap = await mgr.approveFunding("neg-1");

    assert.equal(snap.state, "SUCCEEDED");
    assert.deepEqual(gw.createdFor, ["neg-1"]);
    assert.deepEqual(
      events.map((e) => e.action),
      ["PAYMENT_REQUESTED", "PAYMENT_APPROVED", "INTENT_CREATED", "DEPOSIT_SENT", "CAPTURED"],
    );
  });

  it("rejectFunding drops the deal to REJECTED and opens nothing", async () => {
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: silent });
    await mgr.submit(req({ totalUsd: 5_000 }));
    const snap = mgr.rejectFunding("neg-1");
    assert.equal(snap.state, "REJECTED");
    assert.deepEqual(gw.createdFor, []);
    assert.throws(() => mgr.rejectFunding("neg-1")); // no longer pending
  });
});

describe("SettlementManager — the kill switch reaches the money layer", () => {
  /**
   * The guarantee README, HOW-TO-DEMO and KillSwitch's own docstring all asserted, and which nothing
   * implemented or covered: tripping the switch must revoke the scoped payment authorization.
   *
   * The old coverage was vacuous in the way that is hardest to see — `money-safety.test.ts` registered its
   * OWN inline listener described as "a stand-in for an async transfer-halt" and asserted that listener
   * ran. That proves `KillSwitch` calls its listeners; it says nothing about whether the settlement layer
   * is one of them. These tests drive the REAL `revokeAuthorization` through a real `KillSwitch`, which is
   * the single line server.ts wires.
   */
  it("rejects a parked payment and refuses to approve it afterwards", async () => {
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: (e) => events.push(e) });
    const ks = new KillSwitch();
    ks.onTrip((reason) => mgr.revokeAuthorization(reason)); // exactly what server.ts registers

    await mgr.submit(req({ totalUsd: 5_000 })); // over threshold → PENDING_APPROVAL
    assert.equal(mgr.get("neg-1")?.state, "PENDING_APPROVAL", "parked, waiting on a human");

    await ks.trip("operator hit the kill switch");

    assert.equal(mgr.get("neg-1")?.state, "REJECTED", "the parked authorization is revoked");
    assert.ok(events.some((e) => e.action === "AUTHORIZATION_REVOKED"), "the revocation is on the trail");
    // THE BUG THIS EXISTS FOR: before the listener, this call opened a real PaymentIntent and sent USDC
    // after the emergency stop had been pressed.
    await assert.rejects(() => mgr.approveFunding("neg-1"), /authorization revoked/);
    assert.deepEqual(gw.createdFor, [], "Stripe was never called");
  });

  it("refuses a deal that settles AFTER the trip", async () => {
    // The latch, not just the sweep of existing records. A negotiation still in flight when the switch is
    // hit can resolve moments later and reach `submit`; an authorization revoked for deals already parked
    // but granted to the next one is not revoked at all.
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: silent });
    const ks = new KillSwitch();
    ks.onTrip((reason) => mgr.revokeAuthorization(reason));

    await ks.trip("halt");

    await assert.rejects(() => mgr.submit(req({ totalUsd: 5_000 })), /authorization revoked/);
    // ...including an UNDER-threshold deal, which would otherwise pay autonomously with no human anywhere
    // near it — the case with the least chance of being caught by a person watching the dashboard.
    await assert.rejects(() => mgr.submit(req({ negotiationId: "neg-2", totalUsd: 500 })), /authorization revoked/);
    assert.deepEqual(gw.createdFor, []);
  });

  it("leaves a deposit already on the chain alone", async () => {
    // The asymmetry that matters: USDC that has been sent cannot be recalled, so those records must keep
    // being swept to capture. Revoking them would abandon a payment in flight, which is the one outcome
    // worse than the gap this whole fix closes.
    const gw = new FakeStripeGateway({ statuses: ["processing"] });
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(10_000), emit: silent });
    const ks = new KillSwitch();
    ks.onTrip((reason) => mgr.revokeAuthorization(reason));

    await mgr.submit(req({ totalUsd: 500 })); // under threshold → settles autonomously, never captures
    assert.equal(mgr.get("neg-1")?.state, "DEPOSIT_SENT", "the deposit went out before the trip");

    await ks.trip("halt");

    assert.equal(mgr.get("neg-1")?.state, "DEPOSIT_SENT", "an in-flight deposit is not revoked");
    // "Still swept" has to be proved by the POLL, not by the return value. `sweep()` returns `string[]`,
    // so the old `!== undefined` check could not fail: had `revokeAuthorization` been changed to reject
    // DEPOSIT_SENT records too, sweep would have skipped this one, returned `[]`, and the test would still
    // have passed while asserting the opposite of what it proves. The gateway holds "processing" forever,
    // so nothing captures — the observable is that Stripe was asked at all, after the trip.
    const polledBefore = gw.retrieveCount;
    assert.deepEqual(await mgr.sweep(), [], "still processing, so nothing has captured yet");
    assert.ok(gw.retrieveCount > polledBefore, "the in-flight intent was polled after the trip");
  });

  it("survives being registered after the trip", async () => {
    // `KillSwitch.onTrip` runs a late listener immediately, which is the case that actually happens: the
    // settlement layer comes up with the payment machinery and may register after an early trip.
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(1_000), emit: silent });
    const ks = new KillSwitch();

    await ks.trip("halt");
    await ks.onTrip((reason) => mgr.revokeAuthorization(reason));

    assert.equal(mgr.revoked, true, "a listener registered after the trip still revokes");
    // A second trip JOINS the first's in-flight listener run rather than re-running listeners, so this
    // asserts the KILL SWITCH's latch holds — it says nothing about `revokeAuthorization` being idempotent,
    // which is why that is exercised directly in the test below rather than through the switch.
    await ks.trip("halt again");
    assert.equal(mgr.revoked, true);
  });

  it("revokes once: a second call keeps the FIRST reason and re-reports nothing", async () => {
    // Driven straight at the method, because a second `KillSwitch.trip` joins the first run and never
    // reaches it. What the latch protects is the stored REASON: it is what every subsequent refusal
    // reports to the operator (`payment authorization revoked (<reason>)`), and it must name the halt that
    // actually stopped the money. Without the latch a later, more mundane trip overwrites the original —
    // so the operator investigating why a payment was refused is told about the wrong event.
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(100), emit: (e) => events.push(e) });

    await mgr.submit(req({ totalUsd: 500 })); // over the $100 threshold → parked for a human
    assert.equal(mgr.get("neg-1")?.state, "PENDING_APPROVAL", "the deal is awaiting approval, not paid");

    mgr.revokeAuthorization("first halt");
    mgr.revokeAuthorization("second halt");

    // The refusal path is where the stored reason surfaces, so that is where it is asserted.
    await assert.rejects(() => mgr.submit(req({ negotiationId: "neg-2", totalUsd: 500 })), /first halt/);
    await assert.rejects(() => mgr.approveFunding("neg-1"), /first halt/);
    // The parked deal is rejected once, by the first call — the second finds nothing left to revoke.
    assert.equal(mgr.get("neg-1")?.state, "REJECTED");
    assert.match(mgr.get("neg-1")?.lastError ?? "", /first halt/);
    assert.equal(events.filter((e) => e.action === "AUTHORIZATION_REVOKED").length, 1);
  });
});

describe("SettlementManager — safety", () => {
  it("refuses a draw over the remaining spend mandate", async () => {
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: silent });
    await assert.rejects(() => mgr.submit(req({ totalUsd: 500, mandateRemainingUsd: 100 })), /exceeds remaining spend mandate/);
    assert.deepEqual(gw.createdFor, []);
  });

  it("marks the settle FAILED and rethrows when Stripe rejects the intent", async () => {
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway({ failCreate: true });
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: (e) => events.push(e) });
    await assert.rejects(() => mgr.submit(req()), /stripe rejected/);
    const snap = mgr.get("neg-1");
    assert.equal(snap?.state, "FAILED");
    assert.ok(events.some((e) => e.action === "FAILED"));
  });

  it("keeps a settle whose deposit call threw as DEPOSIT_SENT, not terminally FAILED", async () => {
    // The state was set AFTER `buyerSendDeposit` returned, so a throw from that call left the record at
    // REQUIRES_DEPOSIT and the catch read it as "nothing left the buyer" and marked it FAILED. FAILED is
    // terminal — `sweep()` skips anything that is not REQUIRES_DEPOSIT/DEPOSIT_SENT — so on the
    // production path documented on `buyerSendDeposit`, where the call signs and broadcasts, a timeout
    // awaiting the receipt abandoned a payment that may well be on the chain, with no path back.
    const events: SettlementEvent[] = [];
    const gw = new FakeStripeGateway({ failDeposit: true });
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: (e) => events.push(e) });
    await assert.rejects(() => mgr.submit(req()), /timed out awaiting the transfer receipt/);

    const snap = mgr.get("neg-1");
    assert.equal(snap?.state, "DEPOSIT_SENT", "a record that may have money in flight stays retryable");
    assert.ok(!events.some((e) => e.action === "FAILED"), "no terminal FAILED for an unknown-outcome broadcast");
    assert.ok(events.some((e) => e.action === "CAPTURE_UNCONFIRMED"), "the operator is told the outcome is unknown");
    // Retryable means the sweep will actually pick it up again, which is the property that matters.
    assert.ok(await mgr.refresh("neg-1"), "the record is still there to be re-polled");
  });

  it("refuses a duplicate settlement for the same negotiation", async () => {
    const gw = new FakeStripeGateway();
    const mgr = new SettlementManager({ gateway: gw, policy: fastPolicy(), emit: silent });
    await mgr.submit(req());
    await assert.rejects(() => mgr.submit(req()), /already exists/);
  });
});

describe("loadSettlementPolicy", () => {
  it("defaults so the demo actually exercises a human step", () => {
    const p = loadSettlementPolicy({} as NodeJS.ProcessEnv);
    assert.ok(p.captureTimeoutMs > 0 && p.pollIntervalMs > 0);
    assert.equal(p.humanApprovalAboveUsd, 9_100);
    const needsHuman = (total: number) => total > p.humanApprovalAboveUsd;

    // Exactly ONE deal settles per run: the losing suppliers stand down at the commit barrier and Ridge
    // never negotiates. So if that one payment does not stop for a person, the whole run contains no
    // human step at all. The deterministic run is the reproducible one, and it must always stop.
    // $91.68/u is measured, not assumed — it is where Cascade lands against the deterministic reasoner.
    const deterministicDeal = 91.68 * 100;
    assert.equal(needsHuman(deterministicDeal), true, "the deterministic run must stop for a human before money moves");

    // The LLM run must SOMETIMES stop and sometimes not — a gate that catches every LLM price is a
    // formality, and one that catches none removes the human from a demo about human oversight. Sampled
    // LLM settles span $89–$93/u, so the gate has to fall strictly inside that band.
    assert.equal(needsHuman(89 * 100), false, "the cheap end of the LLM band must pay autonomously");
    assert.equal(needsHuman(93 * 100), true, "the dear end of the LLM band must wait for a person");

    // And the gate must still sit high enough that it is a JUDGEMENT, not a formality: a genuinely
    // small deal pays itself. The original $1,000 default failed this — it caught everything.
    assert.equal(needsHuman(500), false, "a small deal still pays autonomously");
  });
  it("reads overrides from the environment", () => {
    const p = loadSettlementPolicy({ SETTLEMENT_APPROVAL_ABOVE_USD: "250" } as unknown as NodeJS.ProcessEnv);
    assert.equal(p.humanApprovalAboveUsd, 250);
  });
});

/**
 * What `StripeApiGateway` actually PUTS ON THE WIRE.
 *
 * Every test above injects a fake `StripeGateway`, which stands in for this class entirely — so the
 * request bodies it builds were untested, and one of them was wrong in a way that broke every `--usdc`
 * settle: `simulate_crypto_deposit` rejects `token_currency: "USDC"` with a 400 (`must be usdc`), while
 * the deposit-address block Stripe returns reports the token in exactly that display form. The fix
 * lower-cases at the call; these assertions are what stop it regressing, since no fake-gateway test can
 * reach this layer and the live sandbox is not part of `pnpm test`.
 */
describe("StripeApiGateway request bodies", () => {
  /** A minimal stand-in for the `stripe` client, recording the calls this class makes. */
  function recordingClient(): {
    client: StripeClientLike;
    created: Array<Record<string, unknown>>;
    raw: Array<{ method: string; path: string; params?: Record<string, unknown> }>;
  } {
    const created: Array<Record<string, unknown>> = [];
    const raw: Array<{ method: string; path: string; params?: Record<string, unknown> }> = [];
    const client: StripeClientLike = {
      paymentIntents: {
        create: async (params) => {
          created.push(params);
          // Shaped like the live 2026-07-29.preview response: deposit_addresses keyed by network id,
          // reporting the token in DISPLAY form — which is the input that produced the bug.
          return {
            id: "pi_test_1",
            status: "requires_action",
            amount_received: 0,
            next_action: {
              crypto_display_details: {
                deposit_addresses: {
                  tempo: {
                    address: "0xdeadbeef",
                    supported_tokens: [
                      { symbol: "USDC", contract_address: "0xc0ffee" },
                    ],
                  },
                },
              },
            },
          };
        },
        // `id` included because a real PaymentIntent always carries one, and the boundary schema requires
        // it — a response without an id is not the object this integration thinks it is holding.
        retrieve: async () => ({ id: "pi_test_1", status: "succeeded", amount_received: 916800 }),
      },
      rawRequest: async (method, path, params) => {
        raw.push({ method, path, params });
        return {};
      },
    };
    return { client, created, raw };
  }

  it("reports the token in display form but sends the lower-case id to the test-helper", async () => {
    const { client, raw } = recordingClient();
    const gw = new StripeApiGateway("sk_test_x", client);
    const dep = await gw.createCryptoDepositIntent({
      amountCents: 916800,
      currency: "usd",
      negotiationId: "neg-1",
      sellerId: "did:web:summit-gear.example",
    });
    // What we RECORD keeps Stripe's display form — the dashboard and the trail show "USDC".
    assert.equal(dep.token, "USDC", "the reported token stays in the form Stripe returned");

    await gw.buyerSendDeposit({
      paymentIntentId: dep.paymentIntentId,
      network: dep.network,
      tokenCurrency: dep.token,
    });
    const call = raw.find((r) => r.path.endsWith("/simulate_crypto_deposit"));
    assert.ok(call, "the deposit goes through the test-helper route");
    // ...and what we SEND is lower-cased. Asserted against the literals rather than
    // `dep.token.toLowerCase()`, so a change that lower-cased the RECORDED value instead would fail the
    // assertion above rather than quietly satisfying this one.
    assert.equal(call.params?.token_currency, "usdc", "token_currency must be the lower-case id (Stripe 400s otherwise)");
    assert.equal(call.params?.network, "tempo", "network is the lower-case id too");
  });

  it("passes the token the buyer was actually offered, uppercased or not", async () => {
    // Non-vacuity: prove the lower-casing is the code's doing and not an artifact of the fixture already
    // being lower-case. An already-lower-case token must arrive unchanged rather than mangled.
    const { client, raw } = recordingClient();
    const gw = new StripeApiGateway("sk_test_x", client);
    await gw.buyerSendDeposit({ paymentIntentId: "pi_test_1", network: "TEMPO", tokenCurrency: "usdc" });
    const call = raw.find((r) => r.path.endsWith("/simulate_crypto_deposit"));
    assert.equal(call?.params?.token_currency, "usdc");
    assert.equal(call?.params?.network, "tempo", "an upper-cased network is normalised too");
  });

  it("opens the PaymentIntent in crypto deposit mode on the settlement network", async () => {
    const { client, created } = recordingClient();
    const gw = new StripeApiGateway("sk_test_x", client);
    await gw.createCryptoDepositIntent({
      amountCents: 916800,
      currency: "usd",
      negotiationId: "neg-2",
      sellerId: "did:web:summit-gear.example",
    });
    const params = created[0]!;
    assert.deepEqual(params.payment_method_types, ["crypto"]);
    assert.equal(params.confirm, true, "confirmed at creation, or Stripe issues no deposit address");
    const opts = params.payment_method_options as { crypto?: { mode?: string; deposit_options?: { networks?: string[] } } };
    assert.equal(opts.crypto?.mode, "deposit");
    assert.deepEqual(opts.crypto?.deposit_options?.networks, ["tempo"]);
    // The correlation the dashboard reconciles against — losing it silently orphans the payment.
    assert.deepEqual(params.metadata, { negotiationId: "neg-2", sellerId: "did:web:summit-gear.example" });
  });

  /**
   * The BOUNDARY SCHEMA on Stripe's answer.
   *
   * `amount_received` used to be read as `Number(pi.amount_received ?? 0)`, so a non-numeric value became
   * NaN — and NaN is the one figure that fails without failing: it survives `centsToUsd`, reaches the
   * operator's settlement panel and the CAPTURED trail line as `$NaN`, and `JSON.stringify` writes it into
   * `/settlement` as `null`, i.e. a captured payment reporting no amount received. These assertions are
   * about a MONEY field, so the requirement is that a value we cannot parse stops at the call that
   * produced it, where the error can still name what was wrong.
   */
  function clientReturning(intent: Record<string, unknown>): StripeClientLike {
    return {
      paymentIntents: { create: async () => intent, retrieve: async () => intent },
      rawRequest: async () => ({}),
    };
  }

  it("refuses a PaymentIntent whose amount_received is not a number", async () => {
    const gw = new StripeApiGateway("sk_test_x", clientReturning({ id: "pi_x", status: "succeeded", amount_received: "lots" }));
    await assert.rejects(
      () => gw.retrieveIntent("pi_x"),
      /paymentIntents\.retrieve did not return a usable PaymentIntent.*amount_received/s,
    );
  });

  it("refuses a PaymentIntent with no id", async () => {
    // The id is what every later call — the deposit, the capture poll, the sweep — is addressed to. An
    // intent without one cannot be followed up, so accepting it would strand a payment by construction.
    const gw = new StripeApiGateway("sk_test_x", clientReturning({ status: "succeeded", amount_received: 0 }));
    await assert.rejects(() => gw.retrieveIntent("pi_x"), /did not return a usable PaymentIntent.*id/s);
  });

  it("still accepts a PaymentIntent that has captured nothing yet (absent amount_received)", async () => {
    // Non-vacuity in the other direction: the guard must not turn the ORDINARY case — Stripe omitting
    // `amount_received` before any deposit lands — into a failure. Absent means zero.
    const gw = new StripeApiGateway("sk_test_x", clientReturning({ id: "pi_x", status: "requires_action" }));
    assert.deepEqual(await gw.retrieveIntent("pi_x"), { status: "requires_action", amountReceivedCents: 0 });
  });
});
