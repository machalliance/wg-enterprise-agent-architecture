import { z } from "zod";
import { canonicalize } from "./canonical.js";

/**
 * The vocabulary for identity & trust — W3C DIDs and Verifiable Credentials, plus the graduated
 * trust level the buyer assigns each counterparty. Like the rest of `@meridian/protocol`, this file
 * is pure data + canonicalization: NO key material and NO crypto calls live here. Signing and
 * verification are `agent-runtime`'s job; this is only the shape both sides agree on.
 */

/**
 * How far a counterparty may be trusted, from the buyer's three-part check.
 *   VERIFIED — DID resolves, required VCs valid, commit-authority proven → autonomous settle.
 *   LIMITED  — identity ok but a claim/authority merely unproven → may negotiate, settle escalates.
 *   REJECTED — DID unresolvable or a VC invalid/revoked → hard block, no messages exchanged.
 */
export const TrustLevel = z.enum(["VERIFIED", "LIMITED", "REJECTED"]);
export type TrustLevel = z.infer<typeof TrustLevel>;

/**
 * A public key entry inside a DID document. `publicKeyMultibase` is base58btc(0xed01 ‖ raw key) — the
 * `Multikey` encoding every W3C key type actually defines.
 *
 * It used to be `publicKeyBase64` holding SPKI DER, which no standard key type has ever defined: a
 * conforming resolver reading one of our DID documents found a `Multikey`/`Ed25519VerificationKey2020`
 * with none of the properties either type requires, so it could not obtain a key at all. Our own
 * verifier agreed with our own issuer, which is exactly why nothing looked wrong.
 */
export const VerificationMethod = z.object({
  id: z.string(),
  type: z.string(),
  controller: z.string(),
  publicKeyMultibase: z.string(),
});
export type VerificationMethod = z.infer<typeof VerificationMethod>;

/** A minimal W3C DID document — enough to resolve a key and check who controls it. */
export const DidDocument = z.object({
  id: z.string(),
  verificationMethod: z.array(VerificationMethod).min(1),
  assertionMethod: z.array(z.string()).default([]),
  authentication: z.array(z.string()).default([]),
});
export type DidDocument = z.infer<typeof DidDocument>;

/** The Data Integrity proof suite this repo issues and verifies: `eddsa-jcs-2022`, whose
 *  canonicalization step is RFC 8785 JCS — the transform `canonicalize` already performs.
 *
 *  Named here rather than hardcoded at the two call sites because the suite is a CONTRACT: the label on
 *  the proof and the algorithm run over it must never drift apart. They did once, when proofs were
 *  labelled `Ed25519Signature2020` (which mandates RDF canonicalization and a multibase proofValue) while
 *  being produced as base64 over JCS. That is a credential no conforming verifier can check, and nothing
 *  in a self-consistent issuer/verifier pair can detect it. */
export const PROOF_TYPE = "DataIntegrityProof" as const;
export const CRYPTOSUITE = "eddsa-jcs-2022" as const;
/** The only proof purpose we issue or accept: these credentials are assertions by their issuer. */
export const PROOF_PURPOSE = "assertionMethod" as const;

/**
 * A W3C Data Integrity proof (`eddsa-jcs-2022`).
 *
 * `catchall` for the same reason the credential has one: `proofConfigPayload` canonicalizes the PARSED
 * proof to reproduce the bytes the issuer hashed, so any member zod stripped would be a member missing
 * from our hash and present in theirs — a valid proof that fails to verify, with nothing to point at.
 */
export const CredentialProof = z
  .object({
    type: z.string(),
    cryptosuite: z.string(),
    created: z.string(),
    proofPurpose: z.string(),
    verificationMethod: z.string(), // `<issuer-did>#<key>` that produced `proofValue`
    proofValue: z.string(), // multibase base58btc signature over credentialSigningInput(vc)
  })
  .catchall(z.unknown());
export type CredentialProof = z.infer<typeof CredentialProof>;

/**
 * A W3C Verifiable Credential. `type` always includes "VerifiableCredential" plus a concrete kind.
 *
 * `catchall` at the TOP level, matching `credentialSubject`: zod strips unknown keys by default, and
 * `credentialPayload` canonicalizes the PARSED object to reproduce the signed bytes. So any field the
 * issuer signed but this schema does not name — `expirationDate`, `credentialStatus`, a future VC
 * field — was silently dropped before hashing, and the proof failed to verify against a credential
 * that is perfectly valid. Verification must be over what the issuer signed, not over the subset we
 * happen to model.
 */
export const VerifiableCredential = z
  .object({
    "@context": z.array(z.string()),
    id: z.string(),
    type: z.array(z.string()).min(1),
    issuer: z.string(),
    issuanceDate: z.string(),
    credentialSubject: z.object({ id: z.string() }).catchall(z.unknown()),
    proof: CredentialProof,
  })
  .catchall(z.unknown());
export type VerifiableCredential = z.infer<typeof VerifiableCredential>;

/**
 * `eddsa-jcs-2022` step 1 of 2: the canonical form of the credential with its `proof` removed (the
 * suite's "transformed document"). Hashing and signing live in `agent-runtime`, which owns the crypto.
 */
export function credentialPayload(vc: VerifiableCredential): string {
  const { proof: _proof, ...rest } = vc;
  return canonicalize(rest);
}

/**
 * `eddsa-jcs-2022` step 2 of 2: the canonical form of the PROOF CONFIGURATION — the proof block minus
 * `proofValue`.
 *
 * The suite hashes this alongside the document and signs both, which is not a formality: it is what
 * binds the signature to the proof's own metadata. Signing the document alone (what this repo did while
 * the proofs were mislabelled) leaves `created`, `proofPurpose` and `verificationMethod` unsigned, so a
 * credential's proof purpose could be rewritten in transit and still verify.
 */
export function proofConfigPayload(proof: CredentialProof): string {
  const { proofValue: _proofValue, ...config } = proof;
  return canonicalize(config);
}

/**
 * The credentials the buyer requires of every seller: a verified business identity, and the
 * on-time-delivery attestation that the OASF record only *asserted* during discovery. Commit-authority is
 * checked separately because its absence is "unproven" (LIMITED), not "invalid" (REJECTED).
 */
export const REQUIRED_CREDENTIALS = ["BusinessIdentity", "OnTimeDelivery"] as const;
