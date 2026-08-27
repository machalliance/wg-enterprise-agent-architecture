/**
 * The money layer for a COMMITTED deal, settled by a REAL Stripe crypto PaymentIntent — USDC on the
 * Tempo network, no mock ledger. This is the `--usdc` path (Path A of the 2026-07-31 settlement pivot):
 * once the buyer's agent and a winning seller confirm a price, the buyer opens a Stripe PaymentIntent in
 * crypto `deposit` mode, Stripe returns a Tempo deposit address, the buyer agent sends USDC to it, and
 * Stripe watches the chain and captures the intent automatically once funds settle.
 *
 * There are no tranches, no 2-of-3 multisig, and no arbiter here anymore — the self-contained on-chain
 * escrow model those needed was the "mock payment" this replaces. A crypto PaymentIntent captures once,
 * so the deal is a single settle: created -> deposit address issued -> USDC sent -> captured.
 *
 * What is real vs. modelled:
 *   - REAL: the Stripe PaymentIntent, the deposit address, the on-chain USDC token + contract Stripe
 *     reports, and the automatic capture. All of it goes through the live Stripe API (see StripeApiGateway).
 *   - MODELLED (sandbox only): the buyer agent's on-chain USDC transfer. In production the agent wallet
 *     signs and broadcasts a Tempo transfer to the deposit address; in a Stripe SANDBOX, PaymentIntents
 *     do not monitor real testnets, so we drive the deposit with Stripe's `simulate_crypto_deposit`
 *     test-helper instead. That is the ONLY substitution — everything else is the production path.
 *
 * The amount is POLICY, never a constant: it comes from the settled deal terms (unitPrice x units), and
 * the whole draw is bounded by the buyer's pre-approved spend mandate, asserted here one more time.
 */

import { z } from "zod";

// ---- the Stripe preview surface (pinned in ONE place) ----------------------------------------------
// The crypto / deposit-mode / Tempo PaymentIntent is a Stripe preview feature; pin the exact snapshot the
// integration was built against. Bump this string (not the call sites) to move to a newer preview.
export const STRIPE_API_VERSION = "2026-07-29.preview";
// The stablecoin network we settle on. Stripe's deposit-address network id is lower-case; "Tempo" is the
// display name. Matched case-insensitively against the networks Stripe echoes back.
export const SETTLEMENT_NETWORK = "tempo";
// The stablecoin we expect on that network. Stripe reports the actual supported token + contract on the
// PaymentIntent; this is only the default label shown before the intent exists.
export const SETTLEMENT_TOKEN = "USDC";
// SANDBOX ONLY: the on-chain deposit is simulated, not broadcast. The simulate_crypto_deposit test-helper
// requires one of Stripe's supported test-mode transaction hashes — the `…testsuccess` sentinel drives a
// captured deposit (Stripe also exposes a `…testfailure` sentinel for the failure path). The sender wallet
// is irrelevant in the sandbox, so a zero address stands in for the buyer agent's wallet.
export const SIMULATED_DEPOSIT_TX_HASH = "0x00000000000000000000000000000000000000000000000000000testsuccess";
export const SIMULATED_BUYER_WALLET = "0x0000000000000000000000000000000000000000";

// ---- USD <-> Stripe minor units --------------------------------------------------------------------
// Stripe amounts are integers in the currency's smallest unit — cents for USD. Dollars are a display /
// deal-terms concern; convert at the edge so the wire amount is always an exact integer.
export function usdToCents(usd: number): number {
  if (!Number.isFinite(usd) || usd < 0) throw new Error(`invalid USD amount: ${usd}`);
  return Math.round(usd * 100);
}
export function centsToUsd(cents: number): number {
  return cents / 100;
}

// ---- the Stripe gateway seam -----------------------------------------------------------------------
// A tiny domain-level interface over the two Stripe calls the settlement needs. The manager speaks USD +
// status through this; all Stripe specifics (SDK, api version, param shape, response parsing) live in the
// implementation. Tests inject a fake so the money flow is exercised without the network.

/** The lifecycle status of a crypto PaymentIntent, projected to what the settlement cares about. */
export type IntentStatus = "requires_action" | "processing" | "succeeded" | "failed";

/** What Stripe hands back when a crypto deposit PaymentIntent is created: the on-chain address the buyer
 *  agent must pay, plus the token + contract Stripe will accept on the chosen network. */
export interface CryptoDeposit {
  paymentIntentId: string;
  status: IntentStatus;
  network: string;
  depositAddress: string;
  token: string;
  tokenContract: string;
  amountReceivedCents: number;
}

export interface StripeGateway {
  /** Open a crypto PaymentIntent in `deposit` mode on the Tempo network, confirmed, and return the Tempo
   *  deposit address Stripe issues (plus the supported token + contract). Maps to stripe.paymentIntents.create. */
  createCryptoDepositIntent(args: {
    amountCents: number;
    currency: string;
    negotiationId: string;
    sellerId: string;
  }): Promise<CryptoDeposit>;
  /** The buyer agent pays USDC to the deposit address. In a Stripe SANDBOX this is the
   *  `simulate_crypto_deposit` test-helper, because sandbox PaymentIntents do not watch real testnets;
   *  in production this method is where the agent wallet signs + broadcasts the on-chain transfer. The
   *  network + token are needed because the test-helper must be told which chain/token the deposit lands on. */
  buyerSendDeposit(args: { paymentIntentId: string; network: string; tokenCurrency: string }): Promise<void>;
  /** Re-read the PaymentIntent to see whether Stripe has captured the on-chain deposit yet. Maps to
   *  stripe.paymentIntents.retrieve. */
  retrieveIntent(paymentIntentId: string): Promise<{ status: IntentStatus; amountReceivedCents: number }>;
}

// ---- the live Stripe implementation ----------------------------------------------------------------

/** The shape of the Stripe client methods we touch — loosely typed so this module compiles without the
 *  `stripe` package's types (it is imported dynamically only when a key is configured). */
export interface StripeClientLike {
  paymentIntents: {
    /** `options` carries Stripe's per-request settings — `idempotencyKey` is the one this code sends. */
    create(params: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, any>>;
    retrieve(id: string): Promise<Record<string, any>>;
  };
  rawRequest(method: string, path: string, params?: Record<string, unknown>): Promise<Record<string, any>>;
}

/**
 * The PaymentIntent fields this integration DEPENDS ON, validated the moment Stripe answers.
 *
 * Deliberately narrow, and `catchall` so the rest of the object rides through untouched: this is not an
 * attempt to model Stripe's schema, it is a check that the three things we act on are the types we act on
 * them as. `next_action` stays `unknown` on purpose — `pickDepositAddress` reads the deposit-address entry
 * tolerantly across preview snapshots (field names there genuinely drift), and pinning that shape here
 * would refuse responses the tolerant reader handles correctly.
 *
 * `amount_received` is why this exists. It was read as `Number(pi.amount_received ?? 0)`, so anything
 * non-numeric became NaN, and NaN is the one value that fails silently all the way out: it survives
 * `centsToUsd`, renders in the operator's settlement panel and the CAPTURED trail event as `$NaN`, and
 * `JSON.stringify` writes it into `/settlement` as `null` — a payment reporting an unknown amount as no
 * amount. A money figure that cannot be parsed must stop here, where the response is still in hand and
 * the error can name the field.
 */
const StripePaymentIntent = z
  .object({
    id: z.string().min(1),
    status: z.string().optional(),
    /** Minor units, and Stripe sends an integer. Absent means "nothing captured yet", which is 0. */
    amount_received: z.number().int().nonnegative().optional(),
    next_action: z.unknown().optional(),
  })
  .catchall(z.unknown());

/** Validate a PaymentIntent at the gateway boundary, naming the call that produced it. */
function parseIntent(raw: unknown, where: string): z.infer<typeof StripePaymentIntent> {
  const parsed = StripePaymentIntent.safeParse(raw);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ");
    throw new Error(`Stripe ${where} did not return a usable PaymentIntent: ${detail}`);
  }
  return parsed.data;
}

/**
 * Does global `fetch` actually route through `HTTPS_PROXY` in THIS process?
 *
 * Two conditions, and both are required. The runtime has to CARRY proxy-env support at all — probed by
 * asking whether `--use-env-proxy` is a flag this build accepts, rather than by comparing version numbers,
 * because the feature shipped in 24.x and was backported into 22.x and a `>=22` engines range says nothing
 * about which of those you are on. And it has to be TURNED ON, since the support is opt-in: a runtime that
 * has the flag but was started without it leaves fetch ignoring the proxy entirely.
 *
 * Either half missing is a SILENT bypass, which is the reason this is checked at all: the caller below
 * swapped in the fetch client on the strength of the package baseline alone, so on a Node without the flag
 * it selected a client that ignored the proxy and sent the Stripe secret key straight out of the network
 * the operator had confined it to.
 */
function fetchHonoursEnvProxy(): boolean {
  if (!process.allowedNodeEnvironmentFlags.has("--use-env-proxy")) return false;
  if (process.env.NODE_USE_ENV_PROXY === "1") return true;
  return [...process.execArgv, ...(process.env.NODE_OPTIONS ?? "").split(/\s+/)].includes("--use-env-proxy");
}

/**
 * The production gateway: a real Stripe client, pinned to the preview api version, doing exactly the
 * documented crypto-deposit flow. Constructed only when a secret key is present (see stripeGatewayFromEnv).
 */
export class StripeApiGateway implements StripeGateway {
  #client: StripeClientLike | null = null;
  readonly #secretKey: string;

  /**
   * `client` pre-seeds the lazily-constructed Stripe client, and exists so a test can assert the PARAMS
   * this class puts on the wire.
   *
   * That is a gap worth closing rather than a convenience: every other test here injects a fake
   * `StripeGateway`, which replaces this class wholesale — so the request bodies it builds (the
   * lower-cased `token_currency`, the deposit-mode payment_method_options) had no coverage at all, and the
   * case bug that broke every `--usdc` settle was found by running the live sandbox, not by the suite.
   *
   * Deliberately not a public "mode": with no `client` the behaviour is exactly as before, and nothing in
   * the product passes one.
   */
  constructor(secretKey: string, client?: StripeClientLike) {
    if (!secretKey) throw new Error("STRIPE_SECRET_KEY is required for the live Stripe gateway");
    this.#secretKey = secretKey;
    this.#client = client ?? null;
  }

  /** Lazily construct the Stripe client. The package is imported dynamically so the workspace builds and
   *  the demo runs without `stripe` installed — the client is only needed when USDC settlement is on AND a
   *  key is set. */
  async #stripe(): Promise<StripeClientLike> {
    if (this.#client) return this.#client;
    // Indirect the specifier so tsc does not statically resolve `stripe`'s types: the package is a runtime
    // dependency loaded only when a key is set, and the workspace must build without it installed.
    const pkg = "stripe";
    const mod = await import(pkg);
    const Stripe = (mod.default ?? mod) as unknown as (new (key: string, opts: Record<string, unknown>) => StripeClientLike) & {
      createFetchHttpClient(): unknown;
    };
    // Pin the preview snapshot via the Stripe-Version header for every request from this client.
    const opts: Record<string, unknown> = { apiVersion: STRIPE_API_VERSION };
    // When an outbound HTTP proxy is configured, route the SDK through global fetch instead of its default
    // Node https agent. The SDK's own agent bypasses the proxy; the fetch client honors Node's proxy env
    // (NODE_USE_ENV_PROXY), so requests actually traverse it. Without this, an egress-proxied environment
    // sees the call fail or leave unproxied, and any proxy that supplies the Stripe credential on the
    // operator's behalf never gets the chance. No proxy set → default agent, unchanged.
    //
    // Selecting that client is only correct where fetch will really honour the proxy — see
    // `fetchHonoursEnvProxy`. Where it will not, REFUSE: there is no proxy-aware client to fall back to
    // here (the SDK's `httpAgent` route needs a proxy-agent dependency this workspace deliberately does not
    // carry), and both silent alternatives send a live secret key outside the operator's egress. A settle
    // that fails loudly with the remedy in the message is the only honest option left.
    if (process.env.HTTPS_PROXY || process.env.https_proxy) {
      if (!fetchHonoursEnvProxy()) {
        throw new Error(
          "HTTPS_PROXY is set but this Node will not route fetch through it, so the Stripe call would " +
            "leave unproxied: start Node 22.21+/24.5+ with NODE_USE_ENV_PROXY=1 (or --use-env-proxy), or " +
            "unset the proxy variables to call Stripe directly. Refusing to send the secret key outside " +
            "the configured proxy.",
        );
      }
      opts.httpClient = Stripe.createFetchHttpClient();
    }
    this.#client = new Stripe(this.#secretKey, opts);
    return this.#client;
  }

  async createCryptoDepositIntent(args: {
    amountCents: number;
    currency: string;
    negotiationId: string;
    sellerId: string;
  }): Promise<CryptoDeposit> {
    const stripe = await this.#stripe();
    // The documented crypto-deposit PaymentIntent: confirmed at creation so Stripe issues the Tempo
    // deposit address up front in next_action. `confirm: true` is what turns a bare intent into one that
    // is already waiting on-chain for funds.
    const pi = parseIntent(
      await stripe.paymentIntents.create({
        amount: args.amountCents,
        currency: args.currency,
        payment_method_types: ["crypto"],
        payment_method_data: { type: "crypto" },
        payment_method_options: {
          crypto: { mode: "deposit", deposit_options: { networks: [SETTLEMENT_NETWORK] } },
        },
        confirm: true,
        // Correlate the Stripe object back to our negotiation + seller for reconciliation in the Dashboard.
        metadata: { negotiationId: args.negotiationId, sellerId: args.sellerId },
      },
      {
        // IDEMPOTENCY, keyed on the negotiation rather than the attempt. `confirm: true` means creating
        // this intent is what puts a payment in flight, so a retried create is a second real transfer for
        // one deal. The in-process guards do not cover it: `submit` refuses a duplicate negotiationId, but
        // the record holding that id is in memory only, so a restart between the request and its answer —
        // or an operator pressing the button again after a timeout — arrives with nothing to collide with.
        // Stripe's own SDK generates keys for ITS internal network retries; this covers ours.
        //
        // Deliberately stable across attempts and deliberately NOT unique per call: one negotiation gets
        // one payment (a crypto PaymentIntent captures once), so a repeat must return the FIRST intent
        // rather than open another. Stripe also rejects a reused key whose params differ, which turns a
        // changed amount for the same deal into an error instead of a second charge.
        idempotencyKey: `meridian-deposit-${args.negotiationId}`,
      }),
      "paymentIntents.create",
    );
    const addr = pickDepositAddress(pi, SETTLEMENT_NETWORK);
    return {
      paymentIntentId: pi.id,
      status: mapStripeStatus(pi.status),
      network: addr.network,
      depositAddress: addr.address,
      token: addr.token,
      tokenContract: addr.tokenContract,
      amountReceivedCents: pi.amount_received ?? 0,
    };
  }

  async buyerSendDeposit(args: { paymentIntentId: string; network: string; tokenCurrency: string }): Promise<void> {
    const stripe = await this.#stripe();
    // SANDBOX ONLY: sandbox PaymentIntents do not monitor real testnets, so the buyer agent's on-chain USDC
    // transfer is simulated with the test-helper endpoint. Test-helpers are a top-level namespace
    // (`/v1/test_helpers/<resource>/…`), and the crypto-deposit helper requires a supported test-mode
    // transaction hash plus the network + token it lands on. This is a preview route not in the typed SDK,
    // so it goes through rawRequest (still on the pinned api version).
    // BOTH ids are lower-cased, and `token_currency` is not defensive tidying — the helper rejects
    // anything else outright with `Invalid token_currency: must be usdc` (400). The asymmetry is real and
    // it is Stripe's: the deposit-address block REPORTS the token in display form (`USDC`), and
    // `pickDepositAddress` faithfully carries that through to `CryptoDeposit.token`, where the dashboard
    // and the trail want it — while this endpoint accepts only the lower-case id. So the normalisation
    // belongs here, at the one call that demands it, rather than by lower-casing what we record.
    // The same is already true of `network` ("tempo" vs the "Tempo" display name; see SETTLEMENT_NETWORK).
    //
    // Found by running the real sandbox flow rather than by reading: every test here injects a fake
    // gateway, so no assertion in the suite ever reaches this endpoint.
    await stripe.rawRequest("POST", `/v1/test_helpers/payment_intents/${args.paymentIntentId}/simulate_crypto_deposit`, {
      transaction_hash: SIMULATED_DEPOSIT_TX_HASH,
      network: args.network.toLowerCase(),
      token_currency: args.tokenCurrency.toLowerCase(),
      buyer_wallet: SIMULATED_BUYER_WALLET,
    });
  }

  async retrieveIntent(paymentIntentId: string): Promise<{ status: IntentStatus; amountReceivedCents: number }> {
    const stripe = await this.#stripe();
    const pi = parseIntent(await stripe.paymentIntents.retrieve(paymentIntentId), "paymentIntents.retrieve");
    return { status: mapStripeStatus(pi.status), amountReceivedCents: pi.amount_received ?? 0 };
  }
}

/** Project Stripe's PaymentIntent status onto the four we act on. `requires_action` = deposit address
 *  issued, waiting on the buyer's USDC; `processing` = deposit seen, capturing; `succeeded` = captured. */
export function mapStripeStatus(status: unknown): IntentStatus {
  switch (status) {
    case "succeeded":
      return "succeeded";
    case "processing":
      return "processing";
    case "requires_action":
    case "requires_confirmation":
    case "requires_payment_method":
      return "requires_action";
    default:
      return "failed";
  }
}

/**
 * Pull the deposit address (and the supported token + its contract) for the chosen network out of a
 * PaymentIntent's next_action. The preview response nests these under
 * next_action.crypto_display_details.deposit_addresses; field names within an entry are read tolerantly
 * because the exact preview shape may drift. Throws if the chosen network has no address — a settle that
 * cannot be paid must fail loudly, not silently strand.
 */
export function pickDepositAddress(
  pi: Record<string, any>,
  network: string,
): { network: string; address: string; token: string; tokenContract: string } {
  const details = pi?.next_action?.crypto_display_details ?? {};
  const raw = details.deposit_addresses;
  const want = network.toLowerCase();
  // The preview reports deposit_addresses two ways: an ARRAY of entries that each tag their own `network`,
  // or an OBJECT keyed by network id (`{ tempo: { address, supported_tokens } }`). Normalise both to a list
  // of [networkId, entry] pairs so the lookup is shape-agnostic (the live 2026-07-29.preview uses the map).
  const pairs: Array<[string, any]> = Array.isArray(raw)
    ? raw.map((a) => [String(a?.network ?? ""), a])
    : raw && typeof raw === "object"
      ? Object.entries(raw)
      : [];
  // Match the requested network EXACTLY. There is deliberately no "if there's only one entry, use it"
  // fallback: that would send real USDC to whatever chain Stripe happened to return, which is the
  // silent-stranding this function exists to prevent. A single entry on the wrong network is still the
  // wrong network.
  const match = pairs.find(([net]) => net.toLowerCase() === want);
  if (!match) {
    const saw = pairs.map(([net]) => net).join(", ") || "none";
    throw new Error(
      `Stripe returned no ${network} deposit address for PaymentIntent ${pi?.id ?? "?"} (networks offered: ${saw})`,
    );
  }
  const [netId, entry] = match;
  const address = entry.address ?? entry.deposit_address ?? entry.value;
  if (!address) throw new Error(`Stripe ${network} deposit entry has no address`);
  // The token + contract may sit directly on the entry or in a nested supported-token record; field names
  // vary across preview snapshots (symbol/currency/token/token_currency, *contract_address/token_contract).
  //
  // SELECT the SETTLEMENT_TOKEN entry, exactly as the network above is selected, and for the identical
  // reason. `supported_tokens[0]` took whichever token Stripe happened to list first — and this token is
  // not decoration: it is passed to `buyerSendDeposit` as `tokenCurrency`, which is what the deposit is
  // actually made in. A network-correct, token-wrong deposit is the same silent stranding the comment
  // above refuses to allow one entry to cause, one field over.
  const tokenInfo = entry.supported_token ?? pickSupportedToken(entry, pi, netId ?? network) ?? entry;
  const token = tokenInfo?.symbol ?? tokenInfo?.currency ?? tokenInfo?.token ?? tokenInfo?.token_currency ?? SETTLEMENT_TOKEN;
  const tokenContract =
    tokenInfo?.contract_address ?? tokenInfo?.token_contract ?? tokenInfo?.token_contract_address ?? tokenInfo?.address_contract ?? "";
  // An empty contract address is not a usable destination for an ERC-20 transfer, and continuing with
  // `""` pushed the discovery of that all the way to a failed or mis-sent on-chain send. The address
  // above already fails loudly for the same reason; so does this.
  if (!tokenContract) {
    throw new Error(
      `Stripe ${network} deposit entry for ${String(token).toUpperCase()} has no token contract address ` +
        `(PaymentIntent ${pi?.id ?? "?"})`,
    );
  }
  return { network: String(entry.network ?? netId ?? network), address: String(address), token: String(token).toUpperCase(), tokenContract: String(tokenContract) };
}

/**
 * The entry in `supported_tokens` that is actually SETTLEMENT_TOKEN, or undefined when the entry carries
 * no such list at all (the flat shape, where the caller falls back to reading the entry itself).
 *
 * Throws — rather than returning undefined — when the list EXISTS and does not offer the token, because
 * those two cases mean opposite things. No list is an older/flatter response shape to be read another
 * way; a list without USDC in it is Stripe telling us this network cannot settle the way we intend, and
 * quietly paying in whatever else it offered is the failure mode.
 */
function pickSupportedToken(entry: Record<string, any>, pi: Record<string, any>, netId: string): any {
  const list = entry?.supported_tokens;
  if (!Array.isArray(list) || list.length === 0) return undefined;
  const want = SETTLEMENT_TOKEN.toLowerCase();
  const named = (t: any): string =>
    String(t?.symbol ?? t?.currency ?? t?.token ?? t?.token_currency ?? "").toLowerCase();
  const match = list.find((t) => named(t) === want);
  if (!match) {
    const saw = list.map((t) => named(t) || "?").join(", ") || "none";
    throw new Error(
      `Stripe offers no ${SETTLEMENT_TOKEN} on ${netId} for PaymentIntent ${pi?.id ?? "?"} (tokens offered: ${saw})`,
    );
  }
  return match;
}

/**
 * Build the gateway from the environment, or null if no key is set (USDC settlement then stays off,
 * exactly as it did before). The buyer server logs the missing key so the operator knows why.
 *
 * REFUSES A LIVE KEY. Nothing checked before, and the failure mode is the worst one available here:
 * with `sk_live_…` the gateway constructs happily and `createCryptoDepositIntent` opens a REAL
 * PaymentIntent against real money. The run then dies at `buyerSendDeposit`, because the crypto-deposit
 * test-helper only exists in sandbox — but by then the charge infrastructure has already been touched,
 * and the failure looks like a bug rather than the near-miss it is.
 *
 * This is a demo. Every document says test mode; that was a convention, and a convention is not a
 * control. Fail at construction, before any network call, with the reason spelled out.
 */
export function stripeGatewayFromEnv(env: NodeJS.ProcessEnv = process.env): StripeGateway | null {
  const key = env.STRIPE_SECRET_KEY ?? "";
  if (!key) return null;
  assertTestModeKey(key);
  return new StripeApiGateway(key);
}

/**
 * Reject anything that is not a Stripe TEST secret key.
 *
 * Allowlist, not a denylist: `sk_test_`/`rk_test_` pass and everything else is refused, so an
 * unfamiliar future prefix fails CLOSED rather than being waved through because it did not happen to
 * match `sk_live_`. Restricted test keys (`rk_test_`) are accepted — they are still sandbox.
 */
export function assertTestModeKey(key: string): void {
  if (/^(sk|rk)_test_/.test(key)) return;
  const shape = key.slice(0, 8).replace(/[^a-z_]/gi, "") || "unrecognised";
  throw new Error(
    `STRIPE_SECRET_KEY must be a Stripe TEST key (sk_test_… or rk_test_…), got '${shape}…'. ` +
      `This demo simulates the on-chain deposit with Stripe's sandbox test-helper, which does not exist ` +
      `in live mode — a live key would open a real PaymentIntent before failing. Refusing to start.`,
  );
}

// ---- settlement state, events, and snapshots -------------------------------------------------------
// PENDING_APPROVAL and REJECTED are the human-gate states (a deal over the approval threshold waits until
// an operator presses the button). The rest track the Stripe PaymentIntent through capture.
export type SettlementState =
  | "PENDING_APPROVAL"
  | "REJECTED"
  | "REQUIRES_DEPOSIT"
  | "DEPOSIT_SENT"
  | "SUCCEEDED"
  | "FAILED";

/** Every money-side action emits one of these onto the buyer's trail (and thus the Dashboard). Amounts
 *  are PUBLIC deal figures — never a private mandate number. */
export interface SettlementEvent {
  event: "settlement";
  settlementId: string;
  negotiationId: string;
  action:
    | "PAYMENT_REQUESTED"
    | "PAYMENT_APPROVED"
    | "PAYMENT_REJECTED"
    // The kill switch reaching the money layer: every parked authorization is revoked and no new one may
    // be opened. Distinct from PAYMENT_REJECTED, which is a human declining one specific deal.
    | "AUTHORIZATION_REVOKED"
    | "INTENT_CREATED"
    | "DEPOSIT_SENT"
    | "CAPTURED"
    // Deposit is on the chain but this buyer could not confirm capture. Deliberately NOT "FAILED": the
    // record stays DEPOSIT_SENT and retryable, and the dashboard must not tell an operator that a payment
    // failed when the money is in flight.
    | "CAPTURE_UNCONFIRMED"
    | "FAILED";
  state: SettlementState;
  detail: string;
  amountUsd?: number;
}

export type SettlementEmit = (e: SettlementEvent) => void;

/** A read-only projection safe for the open `/settlement` endpoint: public deal figures + the on-chain
 *  address/token, never a wallet balance or a mandate number. */
export interface SettlementSnapshot {
  settlementId: string;
  negotiationId: string;
  agentName: string;
  sellerId: string;
  state: SettlementState;
  amountUsd: number;
  currency: string;
  network: string;
  token: string;
  tokenContract: string;
  paymentIntentId: string;
  depositAddress: string;
  amountReceivedUsd: number;
  requestedAt: string;
  updatedAt: string;
  lastError?: string;
}

// ---- settlement policy (the approval threshold & capture poll are inputs) ---------------------------
export interface SettlementPolicy {
  /**
   * A deal whose total is STRICTLY ABOVE this many USD must be approved by a human before the buyer
   * opens a PaymentIntent. At or below it, the agent pays autonomously.
   *
   * The default, $9,100, is chosen so the demo actually EXERCISES a human step — verified by running it,
   * and re-verified after Cascade joined the scenario and moved every price.
   *
   * This needs saying because the obvious values all fail, in both directions. At $1,000 (the original)
   * the gate sat ~9x below the cheapest possible deal, so it fired on literally every payment and "the
   * agent settles autonomously" was never true. At $9,300 — the mandate's autonomous band — it fired on
   * none: the run then contained NO human step anywhere, because the losing suppliers stand down at the
   * commit barrier and Ridge is rejected at the trust gate, leaving one autonomous settle as the only
   * outcome. A demo about human oversight with no human in it.
   *
   * $9,200 fails for a subtler reason and is worth recording so nobody tries it again. The gate is
   * STRICTLY above, and the deterministic run settles at exactly $91.68/u x 100u = $9,168 — just under
   * it. So $9,200 silently removes the human step from the reproducible run, and on the LLM run catches
   * only the $93/u tail (2 of 20 sampled). It is the one value that breaks both modes at once.
   *
   * $9,100 sits between the two behaviours, measured over 20 LLM samples ($89–$93/u, mean $90.75):
   *   - the DETERMINISTIC run: settles $9,168, every time, so it ALWAYS stops for a person before money
   *     moves. Same every run — that is the human-oversight story, and it is the interesting one.
   *   - the LLM run: roughly half to two-thirds of runs land above the gate and wait for a person; the
   *     rest pay themselves. Measured 53% (n=19) and 64% (n=14) across two samples — the spread is the
   *     model's own variance, which is the point: it is not a coin flip we engineered.
   *
   * Moving it trades the two behaviours against each other, and the direction is worth stating because
   * it is easy to get backwards: the gate fires on deals ABOVE it, so LOWERING it makes the human step
   * MORE frequent, not less. $9,000 therefore catches strictly more of the LLM range than $9,100 already
   * does at 53–64% — it does not produce a 50/50 split, which is what an earlier version of this comment
   * claimed (and HOW-TO-DEMO.md repeated). A true 50/50 would sit near the LLM median rather than below
   * it; the figure is left unstated here because it has not been measured, and an invented one is how the
   * wrong claim survived in the first place. Raise it above ~$9,300 — the top of the LLM range — to demo
   * the fully-autonomous end-to-end path instead. The deterministic run is unaffected by either move: at
   * $9,168 it sits above both.
   */
  humanApprovalAboveUsd: number;
  /** How long to poll Stripe for on-chain capture before leaving the settle in DEPOSIT_SENT (retryable via
   *  refresh). Default 30s. */
  captureTimeoutMs: number;
  /** How often to poll for capture within that budget. Default 1.5s. */
  pollIntervalMs: number;
}

export function loadSettlementPolicy(env: NodeJS.ProcessEnv = process.env): SettlementPolicy {
  const approveAbove = Number(env.SETTLEMENT_APPROVAL_ABOVE_USD ?? 9_100);
  const captureTimeout = Number(env.SETTLEMENT_CAPTURE_TIMEOUT_MS ?? 30_000);
  const pollInterval = Number(env.SETTLEMENT_POLL_INTERVAL_MS ?? 1_500);
  return {
    humanApprovalAboveUsd: Number.isFinite(approveAbove) && approveAbove >= 0 ? approveAbove : 9_100,
    captureTimeoutMs: Number.isFinite(captureTimeout) && captureTimeout > 0 ? captureTimeout : 30_000,
    pollIntervalMs: Number.isFinite(pollInterval) && pollInterval > 0 ? pollInterval : 1_500,
  };
}

// ---- the manager (what the buyer server drives) ----------------------------------------------------
export interface FundRequest {
  negotiationId: string;
  agentName: string;
  /** Stable label for the seller (its DID) — carried into the PaymentIntent metadata. */
  sellerId: string;
  /** The transaction total, from the settled deal terms. */
  totalUsd: number;
  /** The buyer's remaining pre-approved spend headroom. The funder asserts the draw fits inside it — the
   *  same cap that bounds what the agent may COMMIT also bounds what it may PAY. */
  mandateRemainingUsd: number;
}

/** Internal record for one deal's settlement, mutated as the PaymentIntent progresses. */
interface SettlementRecord {
  req: FundRequest;
  state: SettlementState;
  currency: string;
  paymentIntentId: string;
  network: string;
  token: string;
  tokenContract: string;
  depositAddress: string;
  amountReceivedCents: number;
  requestedAt: string;
  updatedAt: string;
  lastError?: string;
}

/**
 * Owns the Stripe gateway, the settlement policy, and every live settlement. The buyer server calls
 * `submit` on a settled+reconciled deal; over the approval threshold the deal parks as PENDING_APPROVAL
 * until an operator approves it, then `settle` opens the PaymentIntent, the buyer agent sends USDC, and
 * capture is polled to completion.
 */
export class SettlementManager {
  readonly #gateway: StripeGateway;
  readonly #policy: SettlementPolicy;
  readonly #emit: SettlementEmit;
  readonly #records = new Map<string, SettlementRecord>();
  readonly currency: string;
  /** Set once `revokeAuthorization` runs. A one-way latch, mirroring the kill switch's own. */
  #revoked = "";

  constructor(opts: { gateway: StripeGateway; policy?: SettlementPolicy; emit?: SettlementEmit; currency?: string }) {
    this.#gateway = opts.gateway;
    this.#policy = opts.policy ?? loadSettlementPolicy();
    this.#emit = opts.emit ?? (() => {});
    this.currency = opts.currency ?? "usd";
  }

  get policy(): SettlementPolicy {
    return this.#policy;
  }

  /** True once the payment authorization has been revoked (the kill switch tripped). */
  get revoked(): boolean {
    return this.#revoked !== "";
  }

  /**
   * REVOKE THE SCOPED PAYMENT AUTHORIZATION — the kill switch reaching the money layer.
   *
   * Wired as a `KillSwitch.onTrip` listener in server.ts. Until it existed, the switch severed live
   * negotiations and released uncommitted reservations while leaving the payment side untouched: a deal
   * parked as PENDING_APPROVAL stayed approvable, so an operator who had just hit the emergency stop could
   * press "Create payment" and send real USDC. Three documents claimed this method's behaviour; nothing
   * implemented it.
   *
   * What it can and cannot do is the same asymmetry as the ACCEPT: a PaymentIntent whose deposit has been
   * sent is on the chain and cannot be recalled, so those records are LEFT ALONE and keep being swept to
   * capture — abandoning them is how money goes missing. What is revoked is authorization that has not yet
   * been exercised: every PENDING_APPROVAL record is rejected, and the latch refuses any later `submit` or
   * `approveFunding`. A settle that is mid-`settle()` will fail at its next guard.
   *
   * Idempotent, and safe to call after the fact: `KillSwitch.onTrip` runs a listener registered AFTER a
   * trip immediately, which is precisely the case this has to survive (the settlement layer comes up with
   * the payment machinery, potentially after an early trip).
   */
  revokeAuthorization(reason: string): void {
    if (this.#revoked) return;
    this.#revoked = reason;
    for (const [id, rec] of this.#records) {
      if (rec.state !== "PENDING_APPROVAL") continue;
      rec.state = "REJECTED";
      rec.lastError = `payment authorization revoked: ${reason}`;
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: id,
        negotiationId: rec.req.negotiationId,
        action: "AUTHORIZATION_REVOKED",
        state: "REJECTED",
        detail: `payment authorization revoked (${reason}) — no PaymentIntent opened, no funds moved`,
        amountUsd: rec.req.totalUsd,
      });
    }
  }

  /** Throw if the authorization has been revoked. Called by every path that could move money. */
  #assertAuthorized(): void {
    if (this.#revoked) {
      throw new Error(`payment authorization revoked (${this.#revoked}) — refusing to open or approve a payment`);
    }
  }

  /**
   * The policy gate a settled deal enters. Under (or at) the human-approval threshold the agent pays
   * autonomously; STRICTLY ABOVE it the deal parks as PENDING_APPROVAL and no PaymentIntent is opened
   * until an operator calls `approveFunding`. Returns the resulting snapshot tagged with `status`.
   */
  async submit(req: FundRequest): Promise<{ status: "funded" | "pending-approval"; settlement: SettlementSnapshot }> {
    // FIRST, before the duplicate check and before any policy branch. A revoked authorization must not be
    // able to park a NEW deal for approval either — the switch is a latch, so anything arriving after it
    // is as unauthorised as anything already in the queue.
    this.#assertAuthorized();
    if (this.#records.has(req.negotiationId)) {
      throw new Error(`settlement already exists for negotiation ${req.negotiationId}`);
    }
    if (!Number.isFinite(req.totalUsd) || req.totalUsd <= 0) throw new Error("settlement total must be positive");
    if (req.totalUsd > req.mandateRemainingUsd + 1e-6) {
      throw new Error(`payment $${req.totalUsd.toLocaleString()} exceeds remaining spend mandate — refusing to pay`);
    }
    if (req.totalUsd <= this.#policy.humanApprovalAboveUsd) {
      return { status: "funded", settlement: await this.settle(req) };
    }
    // Above the threshold: park it for a human. Record the intent to pay; open no PaymentIntent yet.
    const now = new Date().toISOString();
    this.#records.set(req.negotiationId, {
      req,
      state: "PENDING_APPROVAL",
      currency: this.currency,
      paymentIntentId: "",
      network: SETTLEMENT_NETWORK,
      token: SETTLEMENT_TOKEN,
      tokenContract: "",
      depositAddress: "",
      amountReceivedCents: 0,
      requestedAt: now,
      updatedAt: now,
    });
    this.#emit({
      event: "settlement",
      settlementId: req.negotiationId,
      negotiationId: req.negotiationId,
      action: "PAYMENT_REQUESTED",
      state: "PENDING_APPROVAL",
      detail:
        `deal value $${req.totalUsd.toLocaleString()} is over the $${this.#policy.humanApprovalAboveUsd.toLocaleString()} ` +
        `auto-pay limit — a human must approve opening the payment`,
      amountUsd: req.totalUsd,
    });
    return { status: "pending-approval", settlement: this.#snapshot(req.negotiationId) };
  }

  /** Approve a parked payment: the human's button. Opens the PaymentIntent and runs the settle now. */
  async approveFunding(settlementId: string): Promise<SettlementSnapshot> {
    // Checked explicitly rather than relying on `revokeAuthorization` having already flipped the record to
    // REJECTED. Both are true today, but the state check below would report "settlement X is REJECTED, not
    // awaiting approval" — which reads to an operator like someone declined the deal, not like the
    // emergency stop is engaged. The reason matters more than the refusal here.
    this.#assertAuthorized();
    const rec = this.#records.get(settlementId);
    if (!rec) throw new Error(`no settlement awaiting approval for ${settlementId}`);
    if (rec.state !== "PENDING_APPROVAL") throw new Error(`settlement ${settlementId} is ${rec.state}, not awaiting approval`);
    // `state: "PENDING_APPROVAL"` — the state the record is actually IN as this event is emitted.
    // Claiming REQUIRES_DEPOSIT here was a prediction, not a report: `settle()` had not run yet, and on
    // a validation failure the record is restored to PENDING_APPROVAL below — leaving a trail (and a
    // dashboard) asserting the settlement had reached REQUIRES_DEPOSIT when it never left the queue.
    // The action name already carries the news that a human approved; the state field must stay a fact.
    this.#emit({
      event: "settlement",
      settlementId,
      negotiationId: settlementId,
      action: "PAYMENT_APPROVED",
      state: "PENDING_APPROVAL",
      detail: "human approved — opening the Stripe crypto PaymentIntent",
      amountUsd: rec.req.totalUsd,
    });
    // Drop the parked record so settle() can re-create it cleanly (it guards against duplicates).
    this.#records.delete(settlementId);
    try {
      return await this.settle(rec.req);
    } catch (err) {
      // settle() validates BEFORE it inserts its own record (positive total, within the remaining
      // mandate), so those throws leave nothing behind and the approval the operator was looking at
      // disappears from `snapshots()` — with reject/approve then both answering "no settlement awaiting
      // approval". Put it back so the queue stays truthful and the operator can retry or reject.
      //
      // Only when ABSENT: a settle that failed after inserting owns a FAILED record describing a real
      // payment attempt, and reverting that to PENDING_APPROVAL would invite a second attempt at a
      // payment that may already be in flight.
      if (!this.#records.has(settlementId)) this.#records.set(settlementId, rec);
      throw err;
    }
  }

  /** Reject a parked payment: no PaymentIntent is opened and no money moves. */
  rejectFunding(settlementId: string): SettlementSnapshot {
    const rec = this.#records.get(settlementId);
    if (!rec) throw new Error(`no settlement awaiting approval for ${settlementId}`);
    if (rec.state !== "PENDING_APPROVAL") throw new Error(`settlement ${settlementId} is ${rec.state}, cannot reject`);
    rec.state = "REJECTED";
    rec.updatedAt = new Date().toISOString();
    this.#emit({
      event: "settlement",
      settlementId,
      negotiationId: settlementId,
      action: "PAYMENT_REJECTED",
      state: "REJECTED",
      detail: "human rejected the payment — no PaymentIntent opened, no funds moved",
      amountUsd: rec.req.totalUsd,
    });
    return this.#snapshot(settlementId);
  }

  /**
   * Open a Stripe crypto PaymentIntent for a just-approved deal, hand the deposit address to the buyer
   * agent, have it send USDC, and poll until Stripe captures the on-chain deposit. Bound-checked against
   * the mandate. This is the immediate path; `submit` is the policy-gated entry the server uses.
   */
  async settle(req: FundRequest): Promise<SettlementSnapshot> {
    // The last gate before a PaymentIntent is opened. `submit` and `approveFunding` both check too, but
    // this is the only method that actually calls Stripe, and it is public — so the guard belongs on the
    // call that moves the money, not only on the two that usually precede it.
    this.#assertAuthorized();
    if (this.#records.has(req.negotiationId)) {
      throw new Error(`settlement already exists for negotiation ${req.negotiationId}`);
    }
    if (!Number.isFinite(req.totalUsd) || req.totalUsd <= 0) throw new Error("settlement total must be positive");
    if (req.totalUsd > req.mandateRemainingUsd + 1e-6) {
      throw new Error(`payment $${req.totalUsd.toLocaleString()} exceeds remaining spend mandate — refusing to pay`);
    }
    const now = new Date().toISOString();
    const rec: SettlementRecord = {
      req,
      state: "REQUIRES_DEPOSIT",
      currency: this.currency,
      paymentIntentId: "",
      network: SETTLEMENT_NETWORK,
      token: SETTLEMENT_TOKEN,
      tokenContract: "",
      depositAddress: "",
      amountReceivedCents: 0,
      requestedAt: now,
      updatedAt: now,
    };
    this.#records.set(req.negotiationId, rec);

    try {
      // 1. Open the confirmed crypto deposit PaymentIntent; Stripe issues the Tempo deposit address.
      const dep = await this.#gateway.createCryptoDepositIntent({
        amountCents: usdToCents(req.totalUsd),
        currency: this.currency,
        negotiationId: req.negotiationId,
        sellerId: req.sellerId,
      });
      rec.paymentIntentId = dep.paymentIntentId;
      rec.network = dep.network;
      rec.token = dep.token;
      rec.tokenContract = dep.tokenContract;
      rec.depositAddress = dep.depositAddress;
      rec.state = "REQUIRES_DEPOSIT";
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: req.negotiationId,
        negotiationId: req.negotiationId,
        action: "INTENT_CREATED",
        state: rec.state,
        detail:
          `opened PaymentIntent ${dep.paymentIntentId} — issued ${dep.token} deposit address ${dep.depositAddress} ` +
          `on ${dep.network} to the buyer agent`,
        amountUsd: req.totalUsd,
      });

      // 2. The buyer agent sends USDC to the deposit address (sandbox: simulate_crypto_deposit). The token
      //    currency is lower-cased to Stripe's on-wire form (the display label is upper-case "USDC").
      //
      // DEPOSIT_SENT is set BEFORE the call, not after it. The state means "we may have put money on
      // the chain", and the moment that becomes true is the moment we hand the request over — not the
      // moment it returns. In the sandbox this is the `simulate_crypto_deposit` test-helper and the
      // distinction is academic; on the production path documented on `buyerSendDeposit` (lines 81-85)
      // this call SIGNS AND BROADCASTS an on-chain transfer, so a throw after the broadcast — a timeout
      // waiting for the receipt is the obvious one — left `rec.state` at REQUIRES_DEPOSIT. The catch
      // below then read that as "nothing left the buyer", marked the record terminally FAILED, and
      // `sweep()` skips terminal records forever: real USDC in flight and nothing watching for it.
      //
      // Setting it early can only err the other way, toward a record that keeps being polled when no
      // deposit was made. That is the recoverable direction, and it is the same fail-safe choice the
      // catch below already makes for the capture step.
      rec.state = "DEPOSIT_SENT";
      this.#touch(rec);
      await this.#gateway.buyerSendDeposit({
        paymentIntentId: dep.paymentIntentId,
        network: dep.network,
        tokenCurrency: dep.token.toLowerCase(),
      });
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: req.negotiationId,
        negotiationId: req.negotiationId,
        action: "DEPOSIT_SENT",
        state: rec.state,
        detail: `buyer agent sent ${rec.token} to ${rec.depositAddress} — Stripe is watching the chain to capture`,
        amountUsd: req.totalUsd,
      });

      // 3. Poll until Stripe captures the on-chain deposit (or the budget runs out — retryable via refresh).
      await this.#pollUntilCaptured(rec);
      return this.#snapshot(req.negotiationId);
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      // Once the deposit is sent, USDC is on the chain and this buyer cannot un-send it. FAILED is a
      // TERMINAL state — `sweep()` skips anything that is not REQUIRES_DEPOSIT/DEPOSIT_SENT — so marking
      // a record FAILED here because a status read threw would abandon a payment that is very likely
      // mid-capture, with no path back. The record stays DEPOSIT_SENT and keeps being swept; only Stripe
      // explicitly reporting a failed intent (see `#applyStatus`) is allowed to make it terminal.
      //
      // This branch now also covers a throw from `buyerSendDeposit` ITSELF, because the state is set
      // before that call rather than after it. That is the point: on the production path that call
      // broadcasts, so its failure is precisely the case where the buyer cannot know whether money
      // moved — the one case that must never be filed as terminally FAILED.
      if (rec.state === "DEPOSIT_SENT") {
        rec.lastError = message;
        this.#touch(rec);
        this.#emit({
          event: "settlement",
          settlementId: req.negotiationId,
          negotiationId: req.negotiationId,
          action: "CAPTURE_UNCONFIRMED",
          state: rec.state,
          detail: `deposit sent but capture is unconfirmed: ${message} — still polling, retry with refresh`,
          amountUsd: req.totalUsd,
        });
        throw err;
      }
      // Nothing left the buyer yet (the intent or the deposit call itself failed), so FAILED is honest.
      rec.state = "FAILED";
      rec.lastError = message;
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: req.negotiationId,
        negotiationId: req.negotiationId,
        action: "FAILED",
        state: "FAILED",
        detail: `settlement failed: ${rec.lastError}`,
        amountUsd: req.totalUsd,
      });
      throw err;
    }
  }

  /**
   * Re-read the PaymentIntent from Stripe and advance the record if the on-chain deposit has now been
   * captured. The operator's "Refresh" button and the background sweep both call this; safe on a settled
   * or non-existent id (returns its current snapshot). Returns the snapshot after the check.
   */
  async refresh(settlementId: string): Promise<SettlementSnapshot | null> {
    const rec = this.#records.get(settlementId);
    // The docstring promised "safe on a settled or NON-EXISTENT id" and then threw on exactly that.
    // The operator's Refresh button races the record's own lifecycle, so an id that has gone is an
    // ordinary outcome, not an error. Null says "nothing here" without inventing a snapshot.
    if (!rec) return null;
    // Only poll when there is an intent to poll for. A PENDING_APPROVAL record has `paymentIntentId: ""`
    // — it is parked precisely because no intent was opened — and the state guard below happens to
    // exclude it today, so this is belt-and-braces against a future state landing in that set and
    // sending `retrieveIntent("")` to Stripe.
    if ((rec.state === "REQUIRES_DEPOSIT" || rec.state === "DEPOSIT_SENT") && rec.paymentIntentId) {
      const { status, amountReceivedCents } = await this.#gateway.retrieveIntent(rec.paymentIntentId);
      this.#applyStatus(rec, status, amountReceivedCents);
    }
    return this.#snapshot(settlementId);
  }

  /** Poll Stripe for capture within the policy budget. Each check applies the latest status; the loop ends
   *  the moment the intent succeeds or fails, or when the budget elapses (leaving it DEPOSIT_SENT). */
  async #pollUntilCaptured(rec: SettlementRecord): Promise<void> {
    const deadline = this.#nowMs() + this.#policy.captureTimeoutMs;
    while (this.#nowMs() < deadline) {
      try {
        // Bound each READ, not just the loop. The deadline is only consulted between iterations, so a
        // single `retrieveIntent` that hangs — a stalled socket rather than a refused one — parked the
        // whole settle indefinitely and the budget never got a chance to elapse. The per-read cap is
        // the remaining budget, so a hung read expires exactly when the overall poll would have.
        const remaining = Math.max(1, deadline - this.#nowMs());
        const { status, amountReceivedCents } = await this.#withReadDeadline(
          this.#gateway.retrieveIntent(rec.paymentIntentId),
          remaining,
        );
        this.#applyStatus(rec, status, amountReceivedCents);
        if (rec.state === "SUCCEEDED" || rec.state === "FAILED") return;
      } catch (err) {
        // A status READ failing says nothing about the payment — the deposit is already on the chain and
        // Stripe is watching it. Note the error and keep polling to the budget; a blown budget leaves the
        // record DEPOSIT_SENT, which sweep() and the operator's Refresh both retry. Abandoning the loop on
        // the first flaky read would have surfaced as a failed settlement for a payment about to capture.
        rec.lastError = (err as Error).message ?? String(err);
        this.#touch(rec);
      }
      await this.#sleep(this.#policy.pollIntervalMs);
    }
  }

  /**
   * Reject `p` if it has not settled within `ms`. Unblocks the poll loop; it does not cancel the
   * underlying Stripe request (the SDK call is already in flight). That is the right trade here — the
   * loop is deciding whether to keep waiting, and a leaked in-flight read resolves or errors on its own.
   */
  async #withReadDeadline<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        p,
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error(`Stripe read timed out after ${ms}ms`)), ms);
          timer.unref?.();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Fold a fresh Stripe status into the record, emitting CAPTURED/FAILED on a terminal transition. */
  #applyStatus(rec: SettlementRecord, status: IntentStatus, amountReceivedCents: number): void {
    rec.amountReceivedCents = amountReceivedCents;
    if (status === "succeeded" && rec.state !== "SUCCEEDED") {
      rec.state = "SUCCEEDED";
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: rec.req.negotiationId,
        negotiationId: rec.req.negotiationId,
        action: "CAPTURED",
        state: rec.state,
        detail: `Stripe captured the on-chain deposit — $${centsToUsd(amountReceivedCents).toLocaleString()} ${rec.token} settled to the Stripe balance`,
        amountUsd: rec.req.totalUsd,
      });
    } else if (status === "failed" && rec.state !== "FAILED") {
      rec.state = "FAILED";
      rec.lastError = "PaymentIntent moved to a failed state";
      this.#touch(rec);
      this.#emit({
        event: "settlement",
        settlementId: rec.req.negotiationId,
        negotiationId: rec.req.negotiationId,
        action: "FAILED",
        state: rec.state,
        detail: "Stripe reported the PaymentIntent failed",
        amountUsd: rec.req.totalUsd,
      });
    } else if (status === "processing" && rec.state === "REQUIRES_DEPOSIT") {
      rec.state = "DEPOSIT_SENT";
      this.#touch(rec);
    }
  }

  /** Sweep every not-yet-terminal settlement and refresh it from Stripe. Returns the ids that reached
   *  SUCCEEDED, so the caller can log them. Safe on a timer — settled records are skipped. */
  async sweep(): Promise<string[]> {
    const captured: string[] = [];
    for (const [id, rec] of this.#records) {
      if (rec.state !== "REQUIRES_DEPOSIT" && rec.state !== "DEPOSIT_SENT") continue;
      // Same guard as `refresh`: no intent id, nothing to poll. Without it a record in one of these
      // states but carrying `paymentIntentId: ""` would send an empty id to Stripe on every sweep tick.
      if (!rec.paymentIntentId) continue;
      try {
        const { status, amountReceivedCents } = await this.#gateway.retrieveIntent(rec.paymentIntentId);
        this.#applyStatus(rec, status, amountReceivedCents);
        // Cast defeats the stale narrowing from the guard above — #applyStatus may have advanced the state.
        if ((rec.state as SettlementState) === "SUCCEEDED") captured.push(id);
      } catch {
        // Isolate each poll: one settlement's failure must not abort the sweep.
      }
    }
    return captured;
  }

  get(settlementId: string): SettlementSnapshot | undefined {
    return this.#records.has(settlementId) ? this.#snapshot(settlementId) : undefined;
  }

  snapshots(): SettlementSnapshot[] {
    return [...this.#records.keys()].map((id) => this.#snapshot(id));
  }

  #touch(rec: SettlementRecord): void {
    rec.updatedAt = new Date().toISOString();
  }

  #snapshot(settlementId: string): SettlementSnapshot {
    const rec = this.#records.get(settlementId);
    if (!rec) throw new Error(`no settlement ${settlementId}`);
    return {
      settlementId,
      negotiationId: rec.req.negotiationId,
      agentName: rec.req.agentName,
      sellerId: rec.req.sellerId,
      state: rec.state,
      amountUsd: rec.req.totalUsd,
      currency: rec.currency,
      network: rec.network,
      token: rec.token,
      tokenContract: rec.tokenContract,
      paymentIntentId: rec.paymentIntentId,
      depositAddress: rec.depositAddress,
      amountReceivedUsd: centsToUsd(rec.amountReceivedCents),
      requestedAt: rec.requestedAt,
      updatedAt: rec.updatedAt,
      lastError: rec.lastError,
    };
  }

  // Time + sleep are indirected so tests can run the poll loop without real delay.
  #nowMs(): number {
    return Date.now();
  }
  #sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
