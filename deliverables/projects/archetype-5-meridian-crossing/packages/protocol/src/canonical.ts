/**
 * Deterministic JSON serialization: object keys sorted recursively, `undefined` values dropped.
 *
 * This is the substrate that makes cross-org signatures possible. Both the envelope signature
 * and every Verifiable Credential proof are computed over THIS canonical form — so a buyer and a
 * supplier that share no code still hash byte-identical input and their signatures line up. Any
 * divergence in key order here would make every cross-boundary signature silently fail to verify.
 *
 * The string is BUILT from sorted entries rather than sorted into an object and handed to
 * `JSON.stringify`. That earlier approach could not express the required order: ECMAScript iterates
 * integer-like own keys first, in ascending NUMERIC order, whatever order they were inserted in — so
 * `{"2":…,"10":…}` always stringified with "2" before "10", while RFC 8785 (JCS) requires UTF-16 code
 * unit ordering, where "10" sorts first. Any object with numeric-looking keys — `custom_terms` is
 * operator-supplied and unconstrained — hashed differently here than in a conforming implementation,
 * and cross-org verification would fail with nothing visibly wrong on either side.
 */
export function canonicalize(value: unknown): string {
  // `serialize` returns undefined for values JSON has no representation for (`undefined`, functions,
  // symbols), mirroring `JSON.stringify`. The signature promises a string, and returning undefined let
  // it reach `createHash().update()` as the literal text "undefined" — so every unsignable value
  // hashed IDENTICALLY. Two different inputs sharing one signature is precisely what this module
  // exists to prevent, so refuse loudly instead.
  const json = serialize(value);
  if (json === undefined) {
    throw new TypeError(`canonicalize: ${typeof value} is not serializable to JSON`);
  }
  return json;
}

/** Is this a bag of own keys we can sort, rather than an object whose meaning lives elsewhere?
 *  `Object.create(null)` counts — a caller may hand us one. A Date, Map or class instance does NOT:
 *  its state is not in its own enumerable keys, so sorting them yields `{}`. */
function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** JSON text for `value`, or undefined when JSON cannot represent it (matching `JSON.stringify`). */
function serialize(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    // `undefined` in an array becomes `null` — the array's length is structural, so a hole cannot be
    // dropped the way an object member can. Again matching `JSON.stringify`.
    //
    // Indexed explicitly rather than via `.map`, because `.map` SKIPS holes instead of visiting them:
    // a sparse `[,1]` produced `[,1]`, which is not merely different from `JSON.stringify`'s `[null,1]`
    // — it is not valid JSON at all. This function feeds record hashes and signatures, so a value that
    // canonicalizes to unparseable text is a verification failure at the far end, and one that
    // canonicalizes differently on each side is a signature that silently does not match.
    const out: string[] = [];
    for (let i = 0; i < value.length; i++) out.push(serialize(value[i]) ?? "null");
    return `[${out.join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    if (!isPlainObject(value)) {
      // Anything else is a signature hazard, not an inconvenience: two distinct Dates both have zero
      // own enumerable keys, so they canonicalize to the SAME `{}` and a signature over one verifies
      // the other. Follow `toJSON` where the value defines it (Date, URL, Buffer — exactly what
      // `JSON.stringify` would do, so a counterparty's serializer agrees with ours), and refuse the
      // rest loudly. A throw is a bug report; a silent `{}` is a forged-payload window.
      const toJson = (value as { toJSON?: unknown }).toJSON;
      if (typeof toJson === "function") return serialize((toJson as () => unknown).call(value));
      throw new TypeError(
        `canonicalize: cannot serialize ${value.constructor?.name ?? "non-plain object"} — ` +
          `it has no own enumerable state and would canonicalize to {}`,
      );
    }
    const source = value as Record<string, unknown>;
    const parts: string[] = [];
    // `Object.keys` already suffers the integer-first reordering, but sorting its RESULT fixes that:
    // the order that matters is the one we emit, not the one we read. `__proto__` is an ordinary own
    // key here and survives into the signed output rather than mutating an accumulator and vanishing.
    for (const key of Object.keys(source).sort()) {
      const encoded = serialize(source[key]);
      if (encoded !== undefined) parts.push(`${JSON.stringify(key)}:${encoded}`);
    }
    return `{${parts.join(",")}}`;
  }
  // Primitives: delegate, so string escaping and number formatting stay exactly JSON's.
  return JSON.stringify(value);
}
