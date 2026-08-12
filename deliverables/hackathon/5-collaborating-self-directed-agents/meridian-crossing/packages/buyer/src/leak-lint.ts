import assert from "node:assert/strict";
import { numericValueOf, spokenNumericValues } from "@meridian/agent-runtime";

/**
 * The shared assertion behind every "a private mandate number must not appear here" check — the wire
 * envelopes, the LLM prompt, the A2CN messages, and the trail records the dashboard streams.
 *
 * WHY IT IS SHARED. Four checks existed, each written independently against `String(secret)` +
 * `includes`, and each therefore caught only the one spelling `String()` happens to produce. A
 * reservation of 96 written `96.00`, `96.0` or `9.6e1`, or a cap of 150000 written `150,000`, passed
 * all four — while their titles claimed the guarantee held, which is the worse half of the problem: a
 * test that cannot fail is indistinguishable from a guarantee that cannot break. Two of them also
 * misfired the other way, because `String(90)` is a substring of `"9000"`, `"1900"` and of any id that
 * happens to contain those digits, and a check that cries wolf gets loosened by the next person.
 *
 * It delegates to `spokenNumericValues`, the SAME tokeniser `safeOutboundRationale` runs on the way
 * out. That is deliberate and is the property worth keeping: these lints should fail exactly when the
 * outbound guard would have let something through, so a hole opened in one is visible in the other
 * rather than papered over by a second, more forgiving implementation.
 */
export function assertSpeaksNoSecret(text: string, secrets: readonly string[], where: string): void {
  const spoken = spokenNumericValues(text);
  for (const secret of secrets) {
    const value = numericValueOf(secret);
    // A non-numeric secret (an agent name) has no value form; fall back to a plain substring test,
    // exactly as `safeOutboundRationale` does.
    if (value === undefined) {
      assert.ok(!text.includes(secret), `private value '${secret}' leaked in ${where}`);
      continue;
    }
    assert.ok(
      !spoken.has(value),
      `private value ${secret} leaked in ${where} — the text speaks it (values found: ${[...spoken].join(", ")})`,
    );
  }
}

/**
 * Walk a parsed structure and collect every number it carries, as canonical value strings — numeric
 * fields AND numeric-looking strings, since a price can arrive either way across a JSON boundary.
 *
 * The structural walk exists because `JSON.stringify` + substring is wrong in both directions on a
 * message: it misses `93.0` and `9.3e1` (the same value, different characters) and it fires on `90`
 * inside an unrelated `"pi_9000"` id. Reading the VALUES out of the parsed shape has neither problem.
 */
export function numbersIn(value: unknown, into = new Set<string>()): Set<string> {
  if (typeof value === "number") {
    if (Number.isFinite(value)) into.add(String(value));
    return into;
  }
  if (typeof value === "string") {
    // A string that is ENTIRELY a number is a number that crossed a JSON boundary — "9168", "$9,168.00".
    const n = numericValueOf(value);
    if (n !== undefined) into.add(n);
    // PROSE is tokenised; IDENTIFIERS are not, and the discriminator is a space.
    //
    // This looks like a hack and is load-bearing. The tokeniser reads digit runs from anywhere in a
    // string, with no word boundary — by design, since "$9,168.00" must be read out of a sentence. Run
    // it over a correlationId like "96bba7c1-…" and it reports the value 96, so a reservation of 96
    // would "leak" in every record carrying a UUID. That false positive is not hypothetical: the
    // hand-rolled detector this replaced accumulated a lookbehind, a lookahead and a `\.\d` guard over
    // successive fixes for exactly it, and a lint that cries wolf is one somebody eventually deletes.
    //
    // Hex ids, base64url hashes and DIDs contain no spaces; a human-readable `rationale` or `detail`
    // always does. So the space is what separates "text a model wrote" from "an identifier a machine
    // minted", and only the former needs reading as prose.
    if (/\s/.test(value)) for (const spoken of spokenNumericValues(value)) into.add(spoken);
    return into;
  }
  if (Array.isArray(value)) {
    for (const v of value) numbersIn(v, into);
    return into;
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) numbersIn(v, into);
  }
  return into;
}

/** `numbersIn`, asserted: no private value may appear anywhere in the parsed structure. */
export function assertStructureHidesSecrets(value: unknown, secrets: readonly string[], where: string): void {
  const present = numbersIn(value);
  for (const secret of secrets) {
    const canonical = numericValueOf(secret);
    if (canonical === undefined) continue; // non-numeric secrets are a text concern, not a structural one
    assert.ok(
      !present.has(canonical),
      `private value ${secret} leaked in ${where} (numbers present: ${[...present].join(", ")})`,
    );
  }
}
