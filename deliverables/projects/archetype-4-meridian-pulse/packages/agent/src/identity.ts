/**
 * Machine-identity minting for the Meridian Pulse agent (M1).
 *
 * Generates an RSA keypair, publishes the public half as a JWKS the gateway
 * trusts, and mints a short-lived RS256 JWT carrying the agent's scopes. This is
 * the demo-friendly stand-in for a real machine-identity provider: the point is
 * that the agent presents a *scoped, verifiable* credential the gateway checks
 * on every call — not that we run a full issuer.
 *
 * Layout (all under seed/identity/, all gitignored):
 *   priv.pem              private signing key (NEVER commit)
 *   jwks.json             public JWKS the gateway validates against
 *   agent-credential.json the minted token + its decoded claims (NEVER commit)
 *
 * jwks.json is safe to publish but is deliberately not tracked: it is derived
 * from priv.pem, and tracking only one half of the pair lets git hand you a JWKS
 * whose private half does not exist locally — which surfaces only as a gateway
 * 401 (Error(InvalidSignature)) on every MCP call.
 *
 * Usage:
 *   node dist/identity.js keygen   # create priv.pem + jwks.json (idempotent)
 *   node dist/identity.js mint      # mint a fresh agent token -> agent-credential.json
 *   node dist/identity.js token     # print just the token (for env/Authorization)
 */

import {
  generateKeyPairSync,
  createPublicKey,
  createPrivateKey,
  createSign,
} from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDENTITY_DIR = resolve(__dirname, "..", "..", "..", "seed", "identity");
const PRIV_PATH = resolve(IDENTITY_DIR, "priv.pem");
const JWKS_PATH = resolve(IDENTITY_DIR, "jwks.json");
const CRED_PATH = resolve(IDENTITY_DIR, "agent-credential.json");

const KID = "meridian-key-1";
const ISSUER = process.env.AGENT_JWT_ISSUER ?? "meridian-pulse";
const AUDIENCE = process.env.AGENT_JWT_AUDIENCE ?? "meridian-pulse-gateway";
const SUBJECT = "agent:meridian-pulse:revenue-optimizer";
/**
 * The agent's scopes. `commerce:write` is what unlocks set_price at the gateway.
 * A read-only identity omits it. Category/argument-level scoping is enforced in
 * M3 (the gateway authorizes by tool identity, not by tool arguments).
 */
const SCOPES = ["market-data:read", "commerce:read", "commerce:write"];
/** Short TTL to make "rotation" visible; re-mint to refresh. */
const TTL_SECONDS = Number(process.env.AGENT_JWT_TTL_S ?? 3600);

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * True when jwks.json actually carries the public half of priv.pem. Existence of
 * both files is not enough: a mismatched pair is indistinguishable from a healthy
 * one at setup time and only shows up as a gateway 401 on every MCP call, so
 * keygen checks agreement rather than presence.
 */
function pairMatches(): boolean {
  try {
    const pub = createPublicKey(readFileSync(PRIV_PATH)).export({ format: "jwk" }) as {
      n?: string;
      e?: string;
    };
    const { keys } = JSON.parse(readFileSync(JWKS_PATH, "utf8")) as {
      keys: Array<{ n?: string; e?: string }>;
    };
    return keys.some((k) => k.n === pub.n && k.e === pub.e);
  } catch {
    return false;
  }
}

function keygen(): void {
  mkdirSync(IDENTITY_DIR, { recursive: true });
  if (existsSync(PRIV_PATH) && existsSync(JWKS_PATH)) {
    if (pairMatches()) {
      process.stderr.write(`[identity] keys already exist at ${IDENTITY_DIR}; leaving them\n`);
      return;
    }
    process.stderr.write(
      `[identity] jwks.json does not match priv.pem; regenerating both in ${IDENTITY_DIR}\n`,
    );
  }
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(PRIV_PATH, privateKey.export({ type: "pkcs8", format: "pem" }));

  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  jwk.use = "sig";
  jwk.alg = "RS256";
  jwk.kid = KID;
  writeFileSync(JWKS_PATH, JSON.stringify({ keys: [jwk] }, null, 2) + "\n");
  // Any credential minted from the previous key is unverifiable against the new
  // JWKS, and readToken() would happily keep serving it until it expired. Drop it
  // so the next mint() issues a token signed by the key the gateway now trusts.
  if (existsSync(CRED_PATH)) rmSync(CRED_PATH);
  process.stderr.write(`[identity] wrote priv.pem + jwks.json to ${IDENTITY_DIR}\n`);
}

function mint(): string {
  if (!existsSync(PRIV_PATH)) keygen();
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: ISSUER,
    aud: AUDIENCE,
    sub: SUBJECT,
    scopes: SCOPES,
    iat: now,
    exp: now + TTL_SECONDS,
  };
  const header = { alg: "RS256", typ: "JWT", kid: KID };
  const signingInput = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  const priv = createPrivateKey(readFileSync(PRIV_PATH));
  const token = `${signingInput}.${b64url(signer.sign(priv))}`;

  writeFileSync(
    CRED_PATH,
    JSON.stringify({ token, claims, issuedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  process.stderr.write(
    `[identity] minted agent token (sub=${SUBJECT}, ttl=${TTL_SECONDS}s) -> ${CRED_PATH}\n`,
  );
  return token;
}

function readToken(): string {
  if (!existsSync(CRED_PATH)) return mint();
  const cred = JSON.parse(readFileSync(CRED_PATH, "utf8")) as {
    token: string;
    claims: { exp: number };
  };
  // Re-mint if expired.
  if (cred.claims.exp * 1000 <= Date.now()) return mint();
  return cred.token;
}

const cmd = process.argv[2] ?? "mint";
switch (cmd) {
  case "keygen":
    keygen();
    break;
  case "mint":
    mint();
    break;
  case "token":
    // stdout: just the token, for `export AGENT_TOKEN=$(node dist/identity.js token)`
    process.stdout.write(readToken() + "\n");
    break;
  default:
    process.stderr.write(`[identity] unknown command '${cmd}'. Use keygen | mint | token.\n`);
    process.exit(1);
}

export { keygen, mint, readToken };
