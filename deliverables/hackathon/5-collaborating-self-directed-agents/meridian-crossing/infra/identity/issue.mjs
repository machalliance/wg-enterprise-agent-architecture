#!/usr/bin/env node
// AGNTCY Identity — issuance authority.
//
// A self-contained mock trust anchor that mints W3C DIDs + Verifiable Credentials over real Ed25519.
// This is the "stand up the Identity service" build task: it produces the material the agents verify
// against at runtime, under `generated/`:
//   keys/<domain>.json          — each org's private signing key (PKCS8 DER, base64)   [KEPT across runs]
//   did-docs/<domain>.json      — each org's resolvable did:web document (public key)  [regenerated]
//   credentials/<domain>.json   — the VCs issued to each org                           [regenerated]
//   revocations.json            — the seeded credential-status list                    [regenerated]
//
// RidgeLine's fixture is read from config.json — flip it to prove the gate is cryptographic, not a
// name check. Private keys are DERIVED from a committed seed (see ensureKey) so a fresh clone
// reproduces the same identities, and flipping a mode never churns the keys other processes trust.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
} from "node:crypto";
// One of two files that must stay in lockstep with @meridian/protocol (see `canonicalize` below and
// `base58btc` further down). This script runs BEFORE the workspace is built — `pnpm test` mints
// identities first — so it cannot import the compiled package and the primitives are duplicated.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const GEN = here("./generated");
const seed = (p) => here(`../../seed/${p}`);

const ISSUANCE_DATE = "2026-07-15T00:00:00Z";
const TRUST_ANCHOR_DID = "did:web:meridian-trust-anchor.example";
const ROGUE_ISSUER_DID = "did:web:rogue-issuer.example";
/**
 * The human operator who approves over-mandate deals. A SEPARATE principal from the buyer agent on
 * purpose: A2CN §14.1 requires an ApprovalReceipt to be "signed by an operator-side key trusted by the
 * mandate issuer". If the agent signed its own approvals the receipt would prove nothing — the whole
 * point is evidence that a HUMAN, not the agent, authorised a deal the agent could not authorise alone.
 */
const OPERATOR_DID = "did:web:meridian-operator.example";

// Must match packages/protocol/src/canonical.ts EXACTLY — the buyer verifies against these bytes.
// Any divergence here is a credential that will not verify, so keep the two in lockstep.
function canonicalize(value) {
  const json = serialize(value);
  if (json === undefined) {
    throw new TypeError(`canonicalize: ${typeof value} is not serializable to JSON`);
  }
  return json;
}
function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
// Built from sorted entries rather than sorted INTO an object: ECMAScript iterates integer-like keys
// first in numeric order regardless of insertion order, so `{"2":…,"10":…}` could never be emitted in
// the UTF-16 order RFC 8785 requires. Emitting directly is the only way to control it.
function serialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v) ?? "null").join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    if (!isPlainObject(value)) {
      if (typeof value.toJSON === "function") return serialize(value.toJSON());
      throw new TypeError(
        `canonicalize: cannot serialize ${value.constructor?.name ?? "non-plain object"} — ` +
          `it has no own enumerable state and would canonicalize to {}`,
      );
    }
    const parts = [];
    for (const key of Object.keys(value).sort()) {
      const encoded = serialize(value[key]);
      if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${parts.join(",")}}`;
  }
  return JSON.stringify(value);
}

// Must match packages/protocol/src/multibase.ts EXACTLY, for the same reason as `canonicalize`: these
// are the encodings the W3C key type and proof suite require, and the buyer decodes what is written here.
const B58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58btcEncode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = B58_ALPHABET[0].repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58_ALPHABET[digits[i]];
  return out;
}
// SPKI DER prelude for Ed25519 (12 bytes), then the raw 32-byte key. Node exports SPKI; a `Multikey`
// wants the raw key behind the ed25519-pub multicodec header (0xed01), so strip one and add the other.
const SPKI_ED25519_PREFIX_LEN = 12;
const ED25519_PUB_MULTICODEC = Buffer.from("ed01", "hex");
function ed25519Multikey(spkiDer) {
  const raw = spkiDer.subarray(SPKI_ED25519_PREFIX_LEN);
  if (raw.length !== 32) throw new Error(`expected a 32-byte Ed25519 public key, got ${raw.length}`);
  return "z" + base58btcEncode(Buffer.concat([ED25519_PUB_MULTICODEC, raw]));
}
/** A Data Integrity `proofValue`: multibase base58btc over the bare signature bytes (no codec header). */
const proofValueOf = (signature) => "z" + base58btcEncode(signature);

const didDocFile = (did) => `${did.replace(/^did:web:/, "")}.json`;
const keyIdFor = (did) => `${did}#key-1`;

// --- key material (stable across runs) --------------------------------------

/** Load an org's key if minted before, else generate and persist it. Returns { privateKey, publicKeyMultibase, keyId }. */
// A committed, public seed. See the note in ensureKey: these identities are fixtures, not secrets.
const KEY_DERIVATION_SEED = "meridian-crossing/demo-identity/v1";
// PKCS8 DER header for an Ed25519 private key, followed by the raw 32-byte seed. Node will not build a
// key from a seed directly, but it will parse this wrapper.
const PKCS8_ED25519_PREFIX = Buffer.from("302e020100300506032b657004220420", "hex");
function derivedEd25519Pkcs8(did) {
  const seed = createHash("sha256").update(`${KEY_DERIVATION_SEED}:${did}`, "utf8").digest();
  return Buffer.concat([PKCS8_ED25519_PREFIX, seed]);
}

function ensureKey(did) {
  // 0o700 / 0o600: these files hold raw Ed25519 private keys, including the trust anchor's ISSUING key
  // — whoever reads that can mint a credential the buyer will accept. Default perms are world-readable
  // under a typical umask, so set them explicitly rather than inherit.
  const keyDir = `${GEN}/keys`;
  mkdirSync(keyDir, { recursive: true, mode: 0o700 });
  // mkdirSync's mode applies only when it CREATES the directory, and even then umask masks it. A key
  // store left world-readable by an earlier run (or a looser umask) therefore stayed that way forever.
  // chmod unconditionally so the permission is a fact about the directory, not about how it was made.
  chmodSync(keyDir, 0o700);
  const file = `${GEN}/keys/${didDocFile(did)}`;
  let privateKeyBase64;
  const keyId = keyIdFor(did);
  // DERIVED, not random. `generateKeyPairSync` produced a fresh keypair per machine, and because the
  // key store is gitignored that meant a fresh clone minted different identities every time — which
  // silently broke the byte-stable A2CN fixture in seed/a2cn/ (its protocol-act JWS is signed by
  // Summit's key, so it could only ever verify on the machine that created it). The demo is also just
  // easier to reason about when two people running it see identical DIDs, signatures and trails.
  //
  // These are throwaway demo identities on `.example` domains and MUST NOT be used for anything real:
  // the seed above is public, so every private key here is public too. That is the deliberate trade —
  // reproducibility for fixtures that have nothing to protect. A production issuer generates randomly.
  //
  // WRITE FIRST, then fall back to reading, rather than `existsSync` then write. The check-then-write
  // form leaves a window between the two calls in which another process — `pnpm test` mints identities
  // concurrently with anything else already running — can create the same file, and the second writer
  // would truncate a key the first had already handed out. `wx` makes the create atomic: exactly one
  // caller wins, and the loser reads what the winner wrote instead of clobbering it.
  try {
    privateKeyBase64 = derivedEd25519Pkcs8(did).toString("base64");
    writeFileSync(file, JSON.stringify({ did, keyId, privateKeyBase64 }, null, 2) + "\n", {
      mode: 0o600,
      flag: "wx",
    });
  } catch (err) {
    if (err?.code !== "EEXIST") throw err;
    ({ privateKeyBase64 } = JSON.parse(readFileSync(file, "utf8")));
  }
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  const publicKeyMultibase = ed25519Multikey(
    createPublicKey(privateKey).export({ type: "spki", format: "der" }),
  );
  return { privateKey, publicKeyMultibase, keyId };
}

function writeDidDoc(did, publicKeyMultibase) {
  const keyId = keyIdFor(did);
  const doc = {
    id: did,
    // `Multikey` with `publicKeyMultibase` — the verification method type `eddsa-jcs-2022` requires.
    // This used to say `Ed25519VerificationKey2020` while carrying a `publicKeyBase64` property that no
    // W3C key type defines, so a conforming resolver could not obtain a key from these documents at all.
    verificationMethod: [{ id: keyId, type: "Multikey", controller: did, publicKeyMultibase }],
    // The key is authorised for assertions, which is what a credential proof claims. `verifyCredentialProof`
    // checks a proof's `verificationMethod` against THIS list, so it is an authorisation, not a label.
    assertionMethod: [keyId],
    authentication: [keyId],
  };
  writeFileSync(`${GEN}/did-docs/${didDocFile(did)}`, JSON.stringify(doc, null, 2) + "\n");
}

/**
 * Build a signed VC with a W3C Data Integrity proof (`eddsa-jcs-2022`). `issuer` supplies
 * { did, privateKey, keyId }.
 *
 * The suite signs SHA-256(canonical proof config) ‖ SHA-256(canonical credential), in that order — so
 * the proof's own `created` / `proofPurpose` / `verificationMethod` are inside the signature, not merely
 * next to it. An earlier version signed the credential alone and labelled the result
 * `Ed25519Signature2020`, a suite that mandates RDF canonicalization and a multibase proofValue; the
 * label was a claim about an algorithm this code never ran.
 */
function issueVc(type, subjectDid, claims, issuer) {
  const vc = {
    // VC 1.1 plus the Data Integrity context that defines `DataIntegrityProof` and `cryptosuite`.
    // Without the second entry those proof terms are undefined for a JSON-LD processor.
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/security/data-integrity/v2",
    ],
    id: `urn:vc:${type.toLowerCase()}:${did2slug(subjectDid)}`,
    type: ["VerifiableCredential", type],
    issuer: issuer.did,
    issuanceDate: ISSUANCE_DATE,
    credentialSubject: { id: subjectDid, ...claims },
  };
  const proofConfig = {
    type: "DataIntegrityProof",
    cryptosuite: "eddsa-jcs-2022",
    created: ISSUANCE_DATE,
    proofPurpose: "assertionMethod",
    verificationMethod: issuer.keyId,
  };
  const sha256 = (text) => createHash("sha256").update(text, "utf8").digest();
  const hashData = Buffer.concat([sha256(canonicalize(proofConfig)), sha256(canonicalize(vc))]);
  vc.proof = { ...proofConfig, proofValue: proofValueOf(edSign(null, hashData, issuer.privateKey)) };
  return vc;
}

const did2slug = (did) => did.replace(/^did:web:/, "").replace(/[^a-z0-9]+/gi, "-");

// --- scenario ---------------------------------------------------------------

const scenario = JSON.parse(readFileSync(seed("scenario.json"), "utf8"));
const config = JSON.parse(readFileSync(here("./config.json"), "utf8"));
// Exactly the three modes the RidgeLine branch below implements (see `unresolvable` / `useRogueIssuer`
// / `revoke`). Validated rather than defaulted: an unrecognised value — a typo like "revoke" for
// "revoked" — matched none of those tests and silently issued RidgeLine a perfectly VALID credential.
// The demo's whole point is that RidgeLine fails the trust gate, so the failure mode is not cosmetic
// configuration; a run that quietly clears all four suppliers looks like a pass and proves nothing.
const RIDGE_FAILURE_MODES = ["untrusted-issuer", "unresolvable-did", "revoked"];
const ridgeMode = config.ridgeFailureMode ?? "untrusted-issuer";
if (!RIDGE_FAILURE_MODES.includes(ridgeMode)) {
  throw new Error(
    `infra/identity/config.json: ridgeFailureMode '${ridgeMode}' is not recognised — ` +
      `expected one of ${RIDGE_FAILURE_MODES.map((m) => `'${m}'`).join(", ")}`,
  );
}

const catalog = (id) => JSON.parse(readFileSync(seed(`catalogs/${id}.capability.json`), "utf8"));
const LEGAL_NAMES = {
  summit: "Summit Gear Co.",
  cascade: "Cascade Gear Works LLC",
  alpine: "Alpine Supply Ltd.",
  ridge: "RidgeLine Trading LLC",
};

// Regenerate the derived material every run; keep only the stable key store.
for (const dir of ["did-docs", "credentials"]) {
  const path = `${GEN}/${dir}`;
  if (existsSync(path)) rmSync(path, { recursive: true, force: true });
  mkdirSync(path, { recursive: true });
}

// --- issuers ----------------------------------------------------------------

const anchorKey = ensureKey(TRUST_ANCHOR_DID);
writeDidDoc(TRUST_ANCHOR_DID, anchorKey.publicKeyMultibase);
const anchor = { did: TRUST_ANCHOR_DID, privateKey: anchorKey.privateKey, keyId: anchorKey.keyId };

const rogueKey = ensureKey(ROGUE_ISSUER_DID);
writeDidDoc(ROGUE_ISSUER_DID, rogueKey.publicKeyMultibase);
const rogue = { did: ROGUE_ISSUER_DID, privateKey: rogueKey.privateKey, keyId: rogueKey.keyId };

// --- buyer (needs a resolvable identity + key to sign its own messages) ------

const buyerDid = scenario.shortfall.buyer;
const buyerKey = ensureKey(buyerDid);
writeDidDoc(buyerDid, buyerKey.publicKeyMultibase);

// --- human operator (signs ApprovalReceipts; NOT the buyer agent's key) ------

const operatorKey = ensureKey(OPERATOR_DID);
writeDidDoc(OPERATOR_DID, operatorKey.publicKeyMultibase);
// The trust anchor attests that this key may approve commitments beyond an agent's own mandate.
writeFileSync(
  `${GEN}/credentials/${didDocFile(OPERATOR_DID)}`,
  JSON.stringify(
    [issueVc("ApprovalAuthority", OPERATOR_DID, { authorizedTo: "approve-over-mandate-commitments", organization: "Meridian Outfitters" }, anchor)],
    null,
    2,
  ) + "\n",
);

// --- suppliers --------------------------------------------------------------

const revocations = [];

for (const supplier of scenario.suppliers) {
  const { id, did } = supplier;
  const key = ensureKey(did); // every supplier can always sign, even if its trust fixture is broken
  const cat = catalog(id);
  const legalName = LEGAL_NAMES[id] ?? cat.agentName;

  const isRidge = id === "ridge";
  const unresolvable = isRidge && ridgeMode === "unresolvable-did";
  const useRogueIssuer = isRidge && ridgeMode === "untrusted-issuer";
  const revoke = isRidge && ridgeMode === "revoked";
  const issuer = useRogueIssuer ? rogue : anchor;

  // Failure mode 1: unresolvable DID — simply do not publish the DID document.
  if (!unresolvable) writeDidDoc(did, key.publicKeyMultibase);

  const vcs = [
    issueVc("BusinessIdentity", did, { legalName, jurisdiction: "US" }, issuer),
    issueVc("OnTimeDelivery", did, { onTimeDeliveryRate: cat.claims.onTimeDeliveryRate }, issuer),
    issueVc("CommitAuthority", did, { authorizedTo: "commit-supplier", supplier: legalName }, issuer),
  ];
  writeFileSync(`${GEN}/credentials/${didDocFile(did)}`, JSON.stringify(vcs, null, 2) + "\n");

  // Failure mode 3: revoked — put this org's credentials on the status list.
  if (revoke) revocations.push(...vcs.map((v) => v.id));

  const status = unresolvable
    ? "REJECT (unresolvable DID)"
    : useRogueIssuer
      ? "REJECT (untrusted issuer)"
      : revoke
        ? "REJECT (revoked VCs)"
        : "issued valid VCs";
  console.log(`  ${id.padEnd(6)} ${did} -> ${status}`);
}

writeFileSync(`${GEN}/revocations.json`, JSON.stringify(revocations, null, 2) + "\n");
writeFileSync(
  `${GEN}/manifest.json`,
  JSON.stringify(
    { issuedAt: ISSUANCE_DATE, trustAnchor: TRUST_ANCHOR_DID, ridgeFailureMode: ridgeMode },
    null,
    2,
  ) + "\n",
);

const keyCount = readdirSync(`${GEN}/keys`).length;
console.log(
  `\nidentity: issued for ${scenario.suppliers.length} suppliers + buyer + 2 issuers ` +
    `(${keyCount} keys), ridgeFailureMode=${ridgeMode}`,
);
