/**
 * Multibase base58btc + Ed25519 Multikey encoding — the wire encodings the W3C Data Integrity suites
 * mandate, and the reason this module exists at all.
 *
 * The identity layer used to emit `publicKeyBase64` in its DID documents and a base64 `proofValue` on
 * every credential proof, while LABELLING the proof `Ed25519Signature2020`. Both of those encodings are
 * wrong for every standard suite: `Ed25519VerificationKey2020` / `Multikey` require
 * `publicKeyMultibase`, and a Data Integrity `proofValue` is multibase too. Because our own issuer and
 * our own verifier agreed with each other, nothing looked broken — but no conforming verifier could
 * have read a single credential we issued, which is the one property a credential exists to have.
 *
 * Pure data, like the rest of `@meridian/protocol`: no key material, no crypto calls. Turning the
 * decoded bytes into a key is `agent-runtime`'s job.
 */

/** The base58btc alphabet (Bitcoin ordering) — no 0/O/I/l, which is the point of the encoding. */
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Multibase prefix for base58btc. A multibase string is `<prefix><encoded>`, so the prefix is data,
 *  not decoration: dropping it produces a string a conforming implementation cannot classify. */
export const MULTIBASE_BASE58BTC = "z" as const;

/** Multicodec header for an Ed25519 public key (`ed25519-pub`, varint 0xed01). A `Multikey`'s
 *  `publicKeyMultibase` is base58btc(header ‖ raw 32-byte key) — the header is what makes the value
 *  self-describing, so a verifier never has to guess the curve. */
const ED25519_PUB_MULTICODEC = Uint8Array.from([0xed, 0x01]);

/** Raw Ed25519 public keys are 32 bytes; signatures are 64. Checked on decode so a truncated or
 *  padded value is refused at the boundary rather than reaching `createPublicKey` as a vague error. */
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

/** base58btc-encode raw bytes (no multibase prefix). */
export function base58btcEncode(bytes: Uint8Array): string {
  // Leading zero bytes carry no value in a big-endian integer, so they are encoded positionally as
  // leading '1's instead — the standard base58 treatment. Counting them first also keeps the digit
  // loop below from emitting a spurious extra '1' for an all-zero input.
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits: number[] = [];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i]!;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j]! * 256;
      digits[j] = carry % 58;
      carry = Math.floor(carry / 58);
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let out = ALPHABET[0]!.repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += ALPHABET[digits[i]!];
  return out;
}

/** base58btc-decode (no multibase prefix). Throws on any character outside the alphabet. */
export function base58btcDecode(text: string): Uint8Array {
  let zeros = 0;
  while (zeros < text.length && text[zeros] === ALPHABET[0]) zeros++;
  const bytes: number[] = [];
  for (let i = zeros; i < text.length; i++) {
    const value = ALPHABET.indexOf(text[i]!);
    if (value < 0) throw new Error(`base58btc: '${text[i]}' is not a base58 character`);
    let carry = value;
    for (let j = 0; j < bytes.length; j++) {
      carry += bytes[j]! * 58;
      bytes[j] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  const out = new Uint8Array(zeros + bytes.length);
  for (let i = 0; i < bytes.length; i++) out[zeros + i] = bytes[bytes.length - 1 - i]!;
  return out;
}

/** A raw 32-byte Ed25519 public key → the `publicKeyMultibase` value of a `Multikey`. */
export function encodeEd25519Multikey(rawPublicKey: Uint8Array): string {
  if (rawPublicKey.length !== ED25519_PUBLIC_KEY_BYTES) {
    throw new Error(`Ed25519 public key must be ${ED25519_PUBLIC_KEY_BYTES} bytes, got ${rawPublicKey.length}`);
  }
  const framed = new Uint8Array(ED25519_PUB_MULTICODEC.length + rawPublicKey.length);
  framed.set(ED25519_PUB_MULTICODEC, 0);
  framed.set(rawPublicKey, ED25519_PUB_MULTICODEC.length);
  return MULTIBASE_BASE58BTC + base58btcEncode(framed);
}

/**
 * A `publicKeyMultibase` → the raw 32-byte Ed25519 public key. Throws on anything else, INCLUDING a
 * well-formed multibase value whose multicodec header names a different curve: silently accepting one
 * would mean verifying an Ed25519 signature against key bytes the issuer published as something else.
 */
export function decodeEd25519Multikey(publicKeyMultibase: string): Uint8Array {
  if (!publicKeyMultibase.startsWith(MULTIBASE_BASE58BTC)) {
    throw new Error(`publicKeyMultibase must be base58btc ('${MULTIBASE_BASE58BTC}' prefix)`);
  }
  const framed = base58btcDecode(publicKeyMultibase.slice(MULTIBASE_BASE58BTC.length));
  if (framed[0] !== ED25519_PUB_MULTICODEC[0] || framed[1] !== ED25519_PUB_MULTICODEC[1]) {
    throw new Error("publicKeyMultibase is not an ed25519-pub multikey (expected the 0xed01 header)");
  }
  const raw = framed.subarray(ED25519_PUB_MULTICODEC.length);
  if (raw.length !== ED25519_PUBLIC_KEY_BYTES) {
    throw new Error(`ed25519-pub multikey must carry ${ED25519_PUBLIC_KEY_BYTES} key bytes, got ${raw.length}`);
  }
  return raw;
}

/** A raw 64-byte Ed25519 signature → a Data Integrity `proofValue` (multibase base58btc, no codec
 *  header — a proofValue is bare signature bytes, unlike a Multikey). */
export function encodeProofValue(signature: Uint8Array): string {
  if (signature.length !== ED25519_SIGNATURE_BYTES) {
    throw new Error(`Ed25519 signature must be ${ED25519_SIGNATURE_BYTES} bytes, got ${signature.length}`);
  }
  return MULTIBASE_BASE58BTC + base58btcEncode(signature);
}

/** A Data Integrity `proofValue` → the raw signature bytes. Throws if it is not base58btc multibase. */
export function decodeProofValue(proofValue: string): Uint8Array {
  if (!proofValue.startsWith(MULTIBASE_BASE58BTC)) {
    throw new Error(`proofValue must be base58btc ('${MULTIBASE_BASE58BTC}' prefix)`);
  }
  return base58btcDecode(proofValue.slice(MULTIBASE_BASE58BTC.length));
}
