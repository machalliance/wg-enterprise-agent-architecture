/**
 * Machine-identity minting for the Meridian Pulse agent (M1).
 *
 * Generates an RSA keypair, publishes the public half as a JWKS the gateway
 * trusts, and mints a short-lived RS256 JWT carrying the agent's scopes. This is
 * the demo-friendly stand-in for a real machine-identity provider: the point is
 * that the agent presents a *scoped, verifiable* credential the gateway checks
 * on every call — not that we run a full issuer.
 *
 * Layout (all under seed/identity/, gitignored except jwks.json which is public):
 *   priv.pem              private signing key (NEVER commit)
 *   jwks.json             public JWKS the gateway validates against
 *   agent-credential.json the minted token + its decoded claims (NEVER commit)
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
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
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

function keygen(): void {
  mkdirSync(IDENTITY_DIR, { recursive: true });
  if (existsSync(PRIV_PATH) && existsSync(JWKS_PATH)) {
    process.stderr.write(`[identity] keys already exist at ${IDENTITY_DIR}; leaving them\n`);
    return;
  }
  const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(PRIV_PATH, privateKey.export({ type: "pkcs8", format: "pem" }));

  const jwk = publicKey.export({ format: "jwk" }) as Record<string, unknown>;
  jwk.use = "sig";
  jwk.alg = "RS256";
  jwk.kid = KID;
  writeFileSync(JWKS_PATH, JSON.stringify({ keys: [jwk] }, null, 2) + "\n");
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
