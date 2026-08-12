// The scenario banner — one sentence framing the buyer's public ask, above the panels.
//
// The supplier count is COUNTED, not hardcoded: it is however many candidates actually cleared the
// trust gate, because that is the number the audience should read. (It once said "three suppliers"
// while only two had cleared, and only became true by accident when a fourth supplier was added.)
//
// Counting it is not enough — it has to TRACK. `/state` returns `cleared: []` from the very first poll,
// which happens BEFORE Start while nothing has been verified yet. Rendering the sentence once and
// latching it there froze the banner at "negotiates with 0 suppliers" for the entire run: the panels
// filled in, three negotiations ran to settlement, and the header still said 0 until someone reloaded
// the page. So the caller re-renders whenever the count changes, and until at least one supplier has
// cleared, the sentence does not claim a number at all rather than claiming a wrong one.
//
// `esc` is injected (like attribution.js takes its resolver) so the escaping is exercised by the test
// rather than trusted: `need` comes from the buyer's own scenario file, but it is still interpolated
// into innerHTML.
export function bannerHtml(need, clearedCount, esc) {
  const units = Number(need?.units || 0).toLocaleString();
  const ask =
    `The buyer needs <b>${units}</b> × <b>${esc(need?.name)}</b> ` +
    `within <b>${esc(need?.deadlineDays)} days</b>`;
  const who =
    clearedCount > 0
      ? `<b>${clearedCount}</b> ${clearedCount === 1 ? "supplier" : "suppliers"}`
      : "competing suppliers";
  return (
    `${ask}, and its agent negotiates with ${who} in parallel to fill it — ` +
    `each panel below is one organization's own view, streamed live.`
  );
}
