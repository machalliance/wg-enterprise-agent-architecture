/**
 * Deterministic validators for the identifiers a payment engine checks.
 *
 * Every function here answers exactly one question and answers it the same way
 * every time. That property is what makes a Tier A repair defensible: the agent
 * is not exercising judgement, it is reading a rule.
 *
 * The comment that matters most in this file is on `ibanCheck`. Mod-97 DETECTS
 * an error; it does not LOCATE one. That single fact is why a failed check
 * digit is a human's problem and a lowercase IBAN is not.
 */

const IBAN_STRIP = /[\s   -]/g;

/** Normalise for comparison and transmission: no spaces, uppercase. Lossless. */
export function ibanNormalise(raw: string): string {
  return raw.replace(IBAN_STRIP, "").toUpperCase();
}

/** ISO 7064 MOD 97-10, computed with a running modulo so no bignum is needed. */
export function ibanMod97(iban: string): number {
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    let part: string;
    if (code >= 48 && code <= 57) {
      part = ch; // 0-9
    } else if (code >= 65 && code <= 90) {
      part = String(code - 55); // A=10 .. Z=35
    } else {
      return -1; // not a valid IBAN character
    }
    for (const digit of part) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }
  return remainder;
}

export interface IbanCheck {
  normalised: string;
  wasNormalised: boolean;
  structurallyValid: boolean;
  checkDigitsValid: boolean;
  country: string;
  /**
   * True when the ONLY thing wrong was presentation. This is the whole Tier A
   * test for an IBAN: normalising is lossless, so a normalised IBAN that then
   * passes mod-97 was always the same account number.
   */
  repairableByNormalisation: boolean;
}

export function ibanCheck(
  raw: string,
  countryLengths: Record<string, number>,
): IbanCheck {
  const normalised = ibanNormalise(raw);
  const country = normalised.slice(0, 2);
  const expectedLength = countryLengths[country];
  const structurallyValid =
    /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/.test(normalised) &&
    (expectedLength === undefined || normalised.length === expectedLength);
  const checkDigitsValid = structurallyValid && ibanMod97(normalised) === 1;
  const wasNormalised = normalised !== raw;
  return {
    normalised,
    wasNormalised,
    structurallyValid,
    checkDigitsValid,
    country,
    repairableByNormalisation: wasNormalised && checkDigitsValid,
  };
}

/** Compute the check digits for a country + BBAN. Used only by the seed builder. */
export function ibanCheckDigits(country: string, bban: string): string {
  const remainder = ibanMod97(`${country}00${bban}`);
  return String(98 - remainder).padStart(2, "0");
}

const BIC_PATTERN = /^[A-Z0-9]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

export interface BicCheck {
  input: string;
  wellFormed: boolean;
  length: 8 | 11 | 0;
  /** ISO 9362: an 8-character BIC denotes the head office and pads to XXX. */
  expandedTo11: string | null;
  country: string;
}

export function bicCheck(raw: string): BicCheck {
  const bic = raw.trim().toUpperCase();
  const wellFormed = BIC_PATTERN.test(bic);
  const length = bic.length === 8 ? 8 : bic.length === 11 ? 11 : 0;
  return {
    input: bic,
    wellFormed,
    length: wellFormed ? (length as 8 | 11) : 0,
    expandedTo11: wellFormed && length === 8 ? `${bic}XXX` : null,
    country: bic.slice(4, 6),
  };
}

/**
 * ABA routing number check digit. Weights 3,7,1 repeating; valid when the
 * weighted sum is 0 mod 10. Like mod-97 this detects without locating, so a
 * failed ABA is never auto-repaired.
 */
export function abaValid(raw: string): boolean {
  const digits = raw.trim();
  if (!/^[0-9]{9}$/.test(digits)) return false;
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1];
  let sum = 0;
  for (let i = 0; i < 9; i += 1) sum += Number(digits[i]) * w[i];
  return sum % 10 === 0;
}

/**
 * ISO 4217 minor units. `ActiveOrHistoricCurrencyAndAmount` permits 5 fraction
 * digits at the schema level, but the binding constraint is the currency's own
 * minor unit — which is why JPY 1250000.00 is rejected at the network edge.
 */
export function amountCheck(
  value: string,
  currency: string,
  minorUnits: Record<string, number>,
): { valid: boolean; expectedDecimals: number | null; canonical: string | null } {
  const expected = minorUnits[currency];
  if (expected === undefined) {
    return { valid: false, expectedDecimals: null, canonical: null };
  }
  if (!/^[0-9]+(\.[0-9]+)?$/.test(value)) {
    return { valid: false, expectedDecimals: expected, canonical: null };
  }
  const [whole, fraction = ""] = value.split(".");
  // Trailing zeros beyond the minor unit are a formatting error, not a value
  // change. Anything non-zero beyond it would change the amount, so we refuse.
  const excess = fraction.slice(expected);
  if (excess !== "" && /[^0]/.test(excess)) {
    return { valid: false, expectedDecimals: expected, canonical: null };
  }
  const kept = fraction.slice(0, expected).padEnd(expected, "0");
  const canonical = expected === 0 ? whole : `${whole}.${kept}`;
  return {
    valid: value === canonical,
    expectedDecimals: expected,
    canonical,
  };
}
