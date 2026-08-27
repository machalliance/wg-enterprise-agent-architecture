import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { safeOutboundRationale } from "./rationale.js";

/**
 * The outbound no-leak check compares NUMERIC VALUES, not characters, because prose formats money: a
 * reservation of 9168 must be caught whether the model writes "$9,168.00", "9 168" or "9168". These tests
 * fix the separator set that the tokeniser recognises, which is the part that decides whether a spelling
 * is seen as one number at all.
 */

const RESERVATION = "9168";

describe("safeOutboundRationale — numeric separators", () => {
  it("passes a rationale that speaks no secret", () => {
    assert.equal(
      safeOutboundRationale("their price is $96/u, which works for us", [RESERVATION]),
      "their price is $96/u, which works for us",
    );
  });

  // The spellings that already worked, kept here so a change to the strip set cannot silently drop one.
  for (const spelling of ["9168", "$9,168.00", "9 168", "$9168"]) {
    it(`suppresses the reservation written as "${spelling}"`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [RESERVATION]), undefined);
    });
  }

  // The regression. `_` is JavaScript's own numeric separator, which a model writing about code reaches
  // for; `'` is the de-CH/it-CH thousands mark. Neither was in the tokeniser's character class, so
  // "9_168" tokenised as the two unrelated numbers 9 and 168 — every reading missed the secret and the
  // reservation price went out on the wire intact.
  for (const spelling of ["9_168", "9'168"]) {
    it(`suppresses the reservation written as "${spelling}"`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [RESERVATION]), undefined);
    });
  }

  it("still normalises a separated literal to the SAME value, not just to 'suspicious'", () => {
    // 9168 is forbidden; 9169 is not. A tokeniser that merely gave up on underscored literals would
    // suppress both, which would look like a pass while actually being a different bug.
    assert.equal(safeOutboundRationale("we can go to 9_169 per unit", [RESERVATION]), "we can go to 9_169 per unit");
  });

  // A greedy token used to swallow the gap between two unrelated numbers and register only the FUSED
  // reading, so the secret sitting inside it was never registered at all. The substring test does not
  // cover the space-grouped form — the text says "9 168", not "9168" — so the reservation went out.
  for (const [label, text] of [
    ["a preceding number and a comma", "at round 2, 9 168 per unit"],
    ["a preceding number and a full stop", "round 2. 9 168 per unit"],
    ["a trailing number", "9 168 per unit, 3 units minimum"],
  ] as const) {
    it(`suppresses the reservation adjacent to ${label}`, () => {
      assert.equal(safeOutboundRationale(text, [RESERVATION]), undefined);
    });
  }

  it("does not invent a value by fusing two unrelated numbers", () => {
    // The other half of the same fix, and the one that proves it is a tokenising fix rather than a
    // blanket suppression: "2, 9168" must not register 29168, or a mandate whose cap happens to be
    // 29168 would drop every rationale that put a round number in front of a price.
    assert.equal(safeOutboundRationale("at round 2, 9169 per unit", ["29169"]), "at round 2, 9169 per unit");
  });

  // Zero-width obfuscation. These render as nothing, so the text LOOKS like the secret to a human while
  // tokenising as two unrelated numbers — the leak check has to see through them, not around them.
  for (const [label, spelling] of [
    ["soft hyphen U+00AD", "9\u00AD168"],
    ["word joiner U+2060", "9\u2060168"],
    ["zero-width space U+200B", "9\u200B168"],
    ["BOM / ZWNBSP U+FEFF", "9\uFEFF168"],
  ] as const) {
    it(`suppresses the reservation split by a ${label}`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [RESERVATION]), undefined);
    });
  }

  it("deletes the invisible character rather than substituting a space", () => {
    // The sanitised text must not gain a gap where the joiner was: it is returned to callers and written
    // to the trail, so "9 168" would misreport what the model actually wrote.
    assert.equal(safeOutboundRationale("their 1\u00AD234 units arrive soon", ["9999"]), "their 1234 units arrive soon");
  });

  // Magnitude suffixes. "9.168k" and "9168" are the same money; a check that only compared digit strings
  // saw an unrelated 9.168 and let the reservation out.
  for (const spelling of ["9.168k", "9.168K", "9168"]) {
    it(`suppresses a reservation of 9168 written as "${spelling}"`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, ["9168"]), undefined);
    });
  }

  it("suppresses a cap of 12000 written as 12k, and leaves 13k alone", () => {
    assert.equal(safeOutboundRationale("the cap is 12k", ["12000"]), undefined);
    assert.equal(safeOutboundRationale("the cap is 13k", ["12000"]), "the cap is 13k");
  });

  // Alternate digit glyphs. `\d` and Number() are ASCII-only, so a fullwidth spelling was invisible to the
  // check while reading as the plain number to any human. NFKC on the scanned copy folds them together.
  for (const [label, spelling] of [
    ["fullwidth digits", "\uFF19\uFF11\uFF16\uFF18"],
    ["fullwidth with a magnitude suffix", "\uFF19.\uFF11\uFF16\uFF18k"],
  ] as const) {
    it(`suppresses a reservation of 9168 written in ${label}`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [RESERVATION]), undefined);
    });
  }

  it("returns the model's own words, not the normalised form, when nothing leaks", () => {
    // Normalisation is for the CHECK. A passing rationale must come back as written.
    const written = "their \uFF19\uFF10 units ship soon";
    assert.equal(safeOutboundRationale(written, [RESERVATION]), written);
  });

  // The magnitude must scale EVERY locale reading, not just the decimal one: to a de-DE reader "9.168k" is
  // nine-thousand-one-hundred-sixty-eight thousand.
  it("suppresses 9168000 written as 9.168k (dot-grouped reading, then scaled)", () => {
    assert.equal(safeOutboundRationale("we can go to 9.168k per unit", ["9168000"]), undefined);
  });

  // Scientific notation. Split at the "e", the tokeniser saw 9.2 and 3 and the secret went out.
  for (const [spelling, secret] of [
    ["9.168e3", "9168"],
    ["9.2e3", "9200"],
    ["12e3", "12000"],
    ["1.2E4", "12000"],
  ] as const) {
    it(`suppresses ${secret} written as ${spelling}`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [secret]), undefined);
    });
  }

  it("does not over-block: an exponent denoting a different value passes", () => {
    assert.equal(safeOutboundRationale("we can go to 9.3e3 per unit", ["9200"]), "we can go to 9.3e3 per unit");
  });

  // The SECRET is normalised too, not just the text. Otherwise a forbidden value carrying any
  // compatibility character matched nothing in the folded text and passed.
  it("suppresses a rival name whose forbidden entry is spelled with a fullwidth character", () => {
    assert.equal(safeOutboundRationale("Alpine Supply quoted lower", ["\uFF21lpine Supply"]), undefined);
  });

  it("suppresses a numeric secret whose forbidden entry carries a non-breaking space", () => {
    assert.equal(safeOutboundRationale("we can go to 9168 per unit", ["9\u00A0168"]), undefined);
  });

  // Comma as the decimal separator (de-DE, fr-FR, ...). Stripping it as a thousands mark read "9,2" as 92,
  // so the value a European reader actually hears went unchecked.
  for (const [spelling, secret] of [
    ["9,2k", "9200"],
    ["9,2k", "92000"],
    ["9,168", "9.168"],
    ["9,168", "9168"],
  ] as const) {
    it(`suppresses ${secret} written as ${spelling}`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [secret]), undefined);
    });
  }

  it("does not over-block a comma-decimal denoting a different value", () => {
    assert.equal(safeOutboundRationale("we can go to 9,3k per unit", ["9200"]), "we can go to 9,3k per unit");
  });

  // Fully-written money, under either convention: whichever separator comes LAST is the decimal mark.
  for (const [spelling, secret] of [
    ["9.168,00", "9168"],
    ["9,168.00", "9168"],
    ["9.168,00k", "9168000"],
    ["1.234.567,89", "1234567.89"],
  ] as const) {
    it(`suppresses ${secret} written as ${spelling}`, () => {
      assert.equal(safeOutboundRationale(`we can go to ${spelling} per unit`, [secret]), undefined);
    });
  }

  // Non-ASCII digit scripts. `\d` is ASCII-only and NFKC does not fold these, so the number they spell was
  // invisible to the check. Folded by code point, which covers every digit script rather than a listed few.
  for (const [label, spelling] of [
    ["Arabic-Indic", "\u0669\u0661\u0666\u0668"],
    ["Devanagari", "\u096F\u0967\u096C\u096E"],
    ["Bengali", "\u09EF\u09E7\u09EC\u09EE"],
  ] as const) {
    it(`suppresses a reservation of 9168 written in ${label} digits`, () => {
      assert.equal(safeOutboundRationale(`we can go to \u0669\u0661\u0666\u0668 per unit`.replace("\u0669\u0661\u0666\u0668", spelling), [RESERVATION]), undefined);
    });
  }

  it("folds digit scripts without mangling ordinary prose", () => {
    assert.equal(safeOutboundRationale("their 90 units ship soon", [RESERVATION]), "their 90 units ship soon");
  });

  it("leaves non-numeric secrets to the substring test (a rival's name)", () => {
    assert.equal(safeOutboundRationale("Alpine Supply Co quoted lower", ["Alpine Supply Co"]), undefined);
  });
});
