import {
  createHash,
  createPrivateKey,
  createPublicKey,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  CRYPTOSUITE,
  DidDocument,
  PROOF_PURPOSE,
  PROOF_TYPE,
  VerifiableCredential,
  REQUIRED_CREDENTIALS,
  credentialPayload,
  decodeEd25519Multikey,
  decodeProofValue,
  proofConfigPayload,
  signaturePayload,
  type CapabilityAd,
  type Envelope,
  type SignedEnvelope,
  type TrustLevel,
} from "@meridian/protocol";

/**
 * The identity layer. This is the harder half of Archetype 4→5: verifying an identity that
 * SOMEONE ELSE issued. It is a self-contained W3C DID/VC implementation over real Ed25519
 * (`node:crypto`) — DIDs resolve to local `did:web` documents, VCs carry W3C Data Integrity proofs
 * (`eddsa-jcs-2022`), and a seeded mock trust anchor is the only issuer the buyer trusts. The material lives under
 * `infra/identity/generated`, minted by `infra/identity/issue.mjs`. The production swap-in is the
 * real AGNTCY Identity service; nothing above this module would change.
 *
 * Because verification keys off real signatures and issuer bindings — never a name — flipping
 * RidgeLine's fixture to a valid identity re-admits it. The gate is cryptographic, not nominal.
 */

/** The one issuer the buyer trusts. A VC from any other issuer is treated as invalid, not merely weak. */
export const TRUST_ANCHOR_DID = "did:web:meridian-trust-anchor.example";

/**
 * The human operator's DID — a principal SEPARATE from every agent. It signs A2CN §14
 * ApprovalReceipts, so a commitment beyond an agent's own mandate carries proof that a person
 * authorised it. Minted by infra/identity with an `ApprovalAuthority` credential from the trust anchor;
 * an agent's own key can never stand in for it.
 */
export const OPERATOR_DID = "did:web:meridian-operator.example";

function identityPath(...parts: string[]): string {
  return fileURLToPath(
    new URL(`../../../infra/identity/generated/${parts.join("/")}`, import.meta.url),
  );
}

/**
 * A `did:web` we are willing to turn into a filesystem path. The `from`/issuer/sender DID on an inbound
 * message is attacker-controlled and flows straight into `didDocFile` → `identityPath` during signature
 * verification, so anything outside this strict shape (a `/`, `..`, `%`, null byte, …) is rejected
 * before it can walk out of `generated/`. Our real DIDs are all `did:web:<host-label>` — this matches
 * them and nothing that traverses.
 */
function isResolvableDidWeb(did: string): boolean {
  return /^did:web:[a-zA-Z0-9.-]+$/.test(did);
}

/** `did:web:summit-gear.example` → `summit-gear.example.json` (the local resolution target). */
function didDocFile(did: string): string {
  return `${did.replace(/^did:web:/, "")}.json`;
}

// --- DID resolution ---------------------------------------------------------

/** Resolve a `did:web` to its DID document, or null if it does not resolve / is malformed. */
export function resolveDid(did: string): DidDocument | null {
  if (!isResolvableDidWeb(did)) return null;
  const file = identityPath("did-docs", didDocFile(did));
  if (!existsSync(file)) return null;
  try {
    return DidDocument.parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return null;
  }
}

/** "Is it who it says it is": the DID resolves to a well-formed document that claims that same id. */
export function resolveAndVerifyDid(did: string): boolean {
  const doc = resolveDid(did);
  return doc !== null && doc.id === did && doc.verificationMethod.length > 0;
}

/** DER prelude for an Ed25519 SubjectPublicKeyInfo, followed by the raw 32-byte key. Node builds a
 *  public key from SPKI DER but not from raw multikey bytes, so the header is re-attached here. */
const SPKI_ED25519_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

function publicKeyForMethod(doc: DidDocument, verificationMethod: string): KeyObject | null {
  const vm = doc.verificationMethod.find((m) => m.id === verificationMethod);
  if (!vm) return null;
  try {
    const raw = decodeEd25519Multikey(vm.publicKeyMultibase);
    return createPublicKey({
      key: Buffer.concat([SPKI_ED25519_PREFIX, raw]),
      format: "der",
      type: "spki",
    });
  } catch {
    return null;
  }
}

// --- Verifiable Credentials -------------------------------------------------

function loadCredentials(did: string): VerifiableCredential[] {
  if (!isResolvableDidWeb(did)) return [];
  const file = identityPath("credentials", didDocFile(did));
  if (!existsSync(file)) return [];
  try {
    return VerifiableCredential.array().parse(JSON.parse(readFileSync(file, "utf8")));
  } catch {
    return [];
  }
}

/** The seeded revocation set — the one credential-status signal we model (no live status service). */
function revokedIds(): Set<string> {
  const file = identityPath("revocations.json");
  if (!existsSync(file)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(file, "utf8")) as string[]);
  } catch {
    return new Set();
  }
}

/**
 * The `eddsa-jcs-2022` hashing step: SHA-256 of the canonical proof configuration, joined with SHA-256
 * of the canonical document — proof config FIRST, which is the order the suite fixes. The signature is
 * over those 64 bytes, so it covers the proof's own metadata as well as the credential's contents.
 */
function credentialSigningInput(vc: VerifiableCredential): Buffer {
  const sha256 = (text: string): Buffer => createHash("sha256").update(text, "utf8").digest();
  return Buffer.concat([sha256(proofConfigPayload(vc.proof)), sha256(credentialPayload(vc))]);
}

/**
 * Verify a VC's proof cryptographically: the suite is one we implement, the proof purpose is one the
 * issuer's DID document authorises that key for, the issuer resolves, and the signature checks out.
 *
 * The suite check is not bureaucracy. A verifier that ignores `type`/`cryptosuite` runs ITS algorithm
 * over whatever arrives, so a proof produced under different rules either fails for an unexplainable
 * reason or — worse, when the rules overlap — passes while covering less than it claims to. Refusing an
 * unknown suite says "I cannot check this", which is the honest answer.
 */
export function verifyCredentialProof(vc: VerifiableCredential): boolean {
  if (vc.proof.type !== PROOF_TYPE || vc.proof.cryptosuite !== CRYPTOSUITE) return false;
  if (vc.proof.proofPurpose !== PROOF_PURPOSE) return false;
  const issuerDoc = resolveDid(vc.issuer);
  if (!issuerDoc) return false;
  // Data Integrity: the verification method must be authorised for the proof's purpose. Without this
  // the `proofPurpose` above is a self-declared string — an authentication-only key could sign
  // assertions and nothing would notice, because the signature over it verifies perfectly.
  if (!issuerDoc.assertionMethod.includes(vc.proof.verificationMethod)) return false;
  const key = publicKeyForMethod(issuerDoc, vc.proof.verificationMethod);
  if (!key) return false;
  try {
    return edVerify(null, credentialSigningInput(vc), key, Buffer.from(decodeProofValue(vc.proof.proofValue)));
  } catch {
    // Includes a malformed `proofValue`: `decodeProofValue` throws on anything that is not base58btc
    // multibase, and an unreadable signature is a failed verification, not a crash.
    return false;
  }
}

export interface CheckResult {
  /** valid = present, trusted issuer, signature ok, not revoked. invalid = active red flag. missing = absent. */
  status: "valid" | "invalid" | "missing";
  detail: string;
}

function checkCredential(did: string, type: string, revoked: Set<string>): CheckResult {
  const vc = loadCredentials(did).find(
    (c) => c.type.includes(type) && c.credentialSubject.id === did,
  );
  if (!vc) return { status: "missing", detail: `no '${type}' credential presented` };
  if (vc.issuer !== TRUST_ANCHOR_DID) {
    return { status: "invalid", detail: `'${type}' issued by untrusted issuer ${vc.issuer}` };
  }
  if (!verifyCredentialProof(vc)) {
    return { status: "invalid", detail: `'${type}' signature does not verify` };
  }
  if (revoked.has(vc.id)) {
    return { status: "invalid", detail: `'${type}' credential ${vc.id} is revoked` };
  }
  const window = checkValidityWindow(vc, type);
  if (window) return window;
  return { status: "valid", detail: `'${type}' valid` };
}

/** Tolerance for clock skew between the issuer's machine and ours, applied only to `issuanceDate`. A
 *  credential minted seconds ago on a host running slightly ahead is a clock problem, not a forgery, and
 *  failing the trust gate over it would be a self-inflicted outage. Expiry gets no grace: the whole
 *  purpose of an end date is that it is honoured. */
const CLOCK_SKEW_MS = 60_000;

/**
 * Is the credential in force RIGHT NOW, not merely authentic?
 *
 * A signature proves the issuer wrote it and nothing about whether it still counts, so an EXPIRED
 * credential verified perfectly and was returned as `valid` — which defeats the only reason an expiry
 * exists. Checked after the signature deliberately: a date the issuer did not sign is not evidence, so
 * validating it before the proof would be reading an attacker-supplied field.
 *
 * `expirationDate` is not named in our zod model (it survives via `.catchall`, so the proof still covers
 * it), hence the defensive read. But PRESENT-and-unusable is a hard failure rather than something to skip:
 * silently ignoring an expiry we cannot parse is indistinguishable from having no expiry at all.
 */
function checkValidityWindow(vc: VerifiableCredential, type: string): CheckResult | undefined {
  const now = Date.now();
  const issued = Date.parse(vc.issuanceDate);
  if (!Number.isFinite(issued)) {
    return { status: "invalid", detail: `'${type}' has an unparseable issuanceDate '${vc.issuanceDate}'` };
  }
  if (issued > now + CLOCK_SKEW_MS) {
    return { status: "invalid", detail: `'${type}' is not valid yet (issuanceDate ${vc.issuanceDate})` };
  }
  const raw = (vc as Record<string, unknown>).expirationDate;
  if (raw === undefined || raw === null) return undefined; // no expiry is a legitimate shape
  if (typeof raw !== "string") {
    return { status: "invalid", detail: `'${type}' has a non-string expirationDate` };
  }
  const expires = Date.parse(raw);
  if (!Number.isFinite(expires)) {
    return { status: "invalid", detail: `'${type}' has an unparseable expirationDate '${raw}'` };
  }
  if (expires <= now) {
    return { status: "invalid", detail: `'${type}' expired at ${raw}` };
  }
  return undefined;
}

/** "Verifiable, not merely asserted": every required VC is present, trusted, signed, and unrevoked. */
export function verifyCredentials(
  did: string,
  requiredTypes: readonly string[] = REQUIRED_CREDENTIALS,
): CheckResult {
  const revoked = revokedIds();
  for (const type of requiredTypes) {
    const r = checkCredential(did, type, revoked);
    if (r.status !== "valid") return r;
  }
  return { status: "valid", detail: `all required credentials valid: ${requiredTypes.join(", ")}` };
}

/** "Authorized to commit its supplier": a valid CommitAuthority credential from the trust anchor. */
export function verifyCommitAuthority(did: string): CheckResult {
  return checkCredential(did, "CommitAuthority", revokedIds());
}

export interface TrustAssessment {
  level: TrustLevel;
  reason: string;
  checks: { identity: boolean; claims: CheckResult; authority: CheckResult };
}

/**
 * The three-part check, run per candidate before ANY value is exchanged. Ordering matters: an
 * unresolvable DID is a hard REJECT before we even look at credentials; an *invalid* (not merely
 * missing) VC is also a REJECT; only genuinely unproven-but-not-invalid state degrades to LIMITED.
 */
export function verifyCounterparty(ad: CapabilityAd): TrustAssessment {
  const idOk = resolveAndVerifyDid(ad.did);
  const skipped: CheckResult = { status: "missing", detail: "skipped (DID did not resolve)" };
  if (!idOk) {
    return {
      level: "REJECTED",
      reason: `DID does not resolve or is malformed (${ad.did})`,
      checks: { identity: false, claims: skipped, authority: skipped },
    };
  }
  const claims = verifyCredentials(ad.did);
  const authority = verifyCommitAuthority(ad.did);
  const checks = { identity: true, claims, authority };

  if (claims.status === "invalid") return { level: "REJECTED", reason: claims.detail, checks };
  if (authority.status === "invalid") return { level: "REJECTED", reason: authority.detail, checks };
  if (claims.status === "valid" && authority.status === "valid") {
    return {
      level: "VERIFIED",
      reason: "identity resolved, required credentials valid, commit-authority proven",
      checks,
    };
  }
  const unproven = claims.status !== "valid" ? claims.detail : authority.detail;
  return { level: "LIMITED", reason: `identity ok but unproven: ${unproven}`, checks };
}

// --- Message signing --------------------------------------------------------

export interface Signer {
  readonly did: string;
  readonly keyId: string;
  /** Attach a signature over the canonical envelope, producing a wire-ready SignedEnvelope. */
  sign(env: Envelope): SignedEnvelope;
  /** Raw Ed25519 signature over arbitrary bytes — the primitive A2CN's EdDSA JWS is built on. */
  signDetached(data: Buffer): Buffer;
}

/** Load an agent's own signing key from `infra/identity/generated/keys`. */
export function loadSigner(did: string): Signer {
  const file = identityPath("keys", didDocFile(did));
  if (!existsSync(file)) {
    throw new Error(`No signing key for ${did}; run 'pnpm identity:issue' to mint identities`);
  }
  const { keyId, privateKeyBase64 } = JSON.parse(readFileSync(file, "utf8")) as {
    keyId: string;
    privateKeyBase64: string;
  };
  const privateKey = createPrivateKey({
    key: Buffer.from(privateKeyBase64, "base64"),
    format: "der",
    type: "pkcs8",
  });
  return {
    did,
    keyId,
    sign(env: Envelope): SignedEnvelope {
      const sig = edSign(null, Buffer.from(signaturePayload(env)), privateKey).toString("base64");
      return { ...env, sig, didKeyId: keyId };
    },
    signDetached(data: Buffer): Buffer {
      return edSign(null, data, privateKey);
    },
  };
}

/**
 * Verify a raw Ed25519 detached signature against a DID's verification method — the primitive the
 * A2CN EdDSA JWS check is built on. Returns false if the DID does not resolve, the method is
 * absent, or the signature does not check out. Keeps DID resolution inside the identity layer.
 */
export function verifyDetached(did: string, verificationMethod: string, data: Buffer, sig: Buffer): boolean {
  const doc = resolveDid(did);
  if (!doc) return false;
  const key = publicKeyForMethod(doc, verificationMethod);
  if (!key) return false;
  try {
    return edVerify(null, data, key, sig);
  } catch {
    return false;
  }
}

export interface VerifyResult {
  ok: boolean;
  reason: string;
}

/**
 * Verify a received SignedEnvelope: the `from` DID must resolve, name the signing verification
 * method, and the signature must check out over the canonical envelope. A tampered body or a
 * wrong-key signature fails here and the receiver drops the message.
 */
export function verifySignedEnvelope(signed: SignedEnvelope): VerifyResult {
  const doc = resolveDid(signed.from);
  if (!doc) return { ok: false, reason: `sender DID ${signed.from} does not resolve` };
  const key = publicKeyForMethod(doc, signed.didKeyId);
  if (!key) {
    return { ok: false, reason: `verification method ${signed.didKeyId} not in ${signed.from} DID document` };
  }
  let ok = false;
  try {
    ok = edVerify(null, Buffer.from(signaturePayload(signed)), key, Buffer.from(signed.sig, "base64"));
  } catch {
    ok = false;
  }
  return ok
    ? { ok: true, reason: "signature valid" }
    : { ok: false, reason: "signature does not verify (tampered body or wrong key)" };
}
