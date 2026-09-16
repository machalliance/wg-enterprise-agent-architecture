/**
 * The identifier validators.
 *
 * These are the arithmetic the Tier A/Tier B line rests on, so they are tested
 * against published check values rather than against themselves.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  abaValid,
  amountCheck,
  bicCheck,
  ibanCheck,
  ibanCheckDigits,
  ibanMod97,
  ibanNormalise,
} from "../agent/lib/codes.ts";
import { loadReferenceData } from "../agent/lib/refdata.ts";

const ref = loadReferenceData();
const lengths = ref.ibanCountryLengths;

test("mod-97 accepts published IBANs and rejects a single-digit change", () => {
  const valid = [
    "DE89370400440532013000",
    "FR1420041010050500013M02606",
    "BE68539007547034",
    "GB33BUKB20201555555555",
  ];
  for (const iban of valid) {
    assert.equal(ibanMod97(iban), 1, iban);
  }
  assert.notEqual(ibanMod97("DE89370400440532013001"), 1);
});

test("normalisation is lossless and case-insensitive", () => {
  const messy = "de89 3704 0044 0532 0130 00";
  const check = ibanCheck(messy, lengths);
  assert.equal(check.normalised, "DE89370400440532013000");
  assert.equal(check.wasNormalised, true);
  assert.equal(check.checkDigitsValid, true);
  assert.equal(check.repairableByNormalisation, true);
});

test("a wrong check digit is detected but is not repairable by normalisation", () => {
  const check = ibanCheck("DE89370400440532013001", lengths);
  assert.equal(check.structurallyValid, true);
  assert.equal(check.checkDigitsValid, false);
  assert.equal(check.repairableByNormalisation, false);
});

test("a wrong country length fails structurally", () => {
  assert.equal(ibanCheck("DE8937040044053201300", lengths).structurallyValid, false);
});

test("check-digit generation round-trips", () => {
  const bban = "370400440532013000";
  assert.equal(ibanCheckDigits("DE", bban), "89");
  assert.equal(ibanMod97(`DE${ibanCheckDigits("DE", bban)}${bban}`), 1);
});

test("an 8-character BIC expands to 11 with XXX", () => {
  const check = bicCheck("DEUTDEFF");
  assert.equal(check.wellFormed, true);
  assert.equal(check.length, 8);
  assert.equal(check.expandedTo11, "DEUTDEFFXXX");
});

test("an 11-character BIC is left alone and a malformed one is rejected", () => {
  assert.equal(bicCheck("PSSTFRPPLYO").expandedTo11, null);
  assert.equal(bicCheck("DEUT1EFF").wellFormed, false); // country must be letters
  assert.equal(bicCheck("DEUTDEF").wellFormed, false); // too short
});

test("ABA checksum accepts a real routing number and rejects a transposition", () => {
  assert.equal(abaValid("121000248"), true);
  assert.equal(abaValid("121000284"), false);
  assert.equal(abaValid("12100024"), false);
});

test("minor units follow the currency, not the schema", () => {
  const jpy = amountCheck("1250000.00", "JPY", ref.currencyMinorUnits);
  assert.equal(jpy.valid, false);
  assert.equal(jpy.canonical, "1250000");

  assert.equal(amountCheck("18450.00", "EUR", ref.currencyMinorUnits).valid, true);
  assert.equal(amountCheck("18450.5", "EUR", ref.currencyMinorUnits).canonical, "18450.50");

  const kwd = amountCheck("120.500", "KWD", ref.currencyMinorUnits);
  assert.equal(kwd.valid, true, "KWD carries three minor units");
});

test("a non-zero digit beyond the minor unit is refused, not rounded", () => {
  // Rounding here would change the amount. Detecting is correct; repairing is not.
  const jpy = amountCheck("1250000.75", "JPY", ref.currencyMinorUnits);
  assert.equal(jpy.valid, false);
  assert.equal(jpy.canonical, null);
});

test("normalise strips ordinary and non-breaking spaces", () => {
  assert.equal(ibanNormalise("de89 3704 0044-0532 0130 00"), "DE89370400440532013000");
});
