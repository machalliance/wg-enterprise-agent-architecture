# Security

## This is an unmaintained demo

News Watcher is a working-group reference prototype for archetype 2. It is not
maintained software. There are no security patches, no advisories, no support,
and no coordinated disclosure process. It is provided "as is" under MIT, with no
warranty of any kind.

**Do not deploy it.** Read it, run it against your own feeds to see the shape of
the archetype, and take the ideas rather than the code.

## Reporting

There is no embargo process here and nothing will be patched. If you find
something worth others knowing about, open an issue on the working group
repository. Do not send anything you would not publish.

## What this program does that is worth knowing before you run it

These are properties of the design, not defects to report.

**It fetches arbitrary third-party URLs.** Research Mode opens whatever a
publication puts in an RSS `<link>` and scrapes the page. `_fetch_bytes` permits
`http`/`https` only and follows at most three redirects, re-checking the scheme
after the chain resolves, and `file://` is reachable only under
`DEMO_FIXTURES=1`. There is **no host allow-list and no private-address block**,
so a feed you trust can still point the fetcher at any reachable host, including
one on your own network. Run it where that does not matter.

**It puts untrusted text in a prompt.** Up to 6,000 words of scraped page
content goes into the claim-extraction call. The body is fenced and the system
prompt states it is quoted material and never instruction, and the fence marker
is stripped from the content so it cannot be closed early. That is mitigation,
not a guarantee — prompt injection is not a solved problem, and a sufficiently
crafted page may still influence what gets recorded as a claim.

**Its output is model-written and unverified.** `position_summary` is a
language model's synthesis of claims it extracted from pages nobody checked. It
is a reading trail, not a finding. Every claim carries an evidence excerpt and a
URL so any sentence can be walked back to a source; do that before citing
anything.

**It holds credentials in the environment.** An LLM API key, optionally a Slack
webhook URL and a GitHub token. `.env` is gitignored. The Slack webhook is a
bearer credential — anyone holding it can post to that channel.

**It can write unredacted dumps to `debug/`.** Setting `DEBUG_DUMP=1` writes
every LLM response and the complete research state, including article content,
to disk on each run. Off by default, gitignored, and never pruned once on.
Delete the directory if the feeds you scan are not public.

**Nothing rate-limits or budget-caps it.** There is no per-run ceiling on
articles fetched or model calls made. A feed that suddenly returns hundreds of
items in the lookback window will be scored and read in full. See
`docs/known-limitations.md`.
