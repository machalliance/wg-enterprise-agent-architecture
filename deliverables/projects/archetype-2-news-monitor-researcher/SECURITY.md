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

**It fetches arbitrary third-party URLs, and publishes what comes back.**
Research Mode opens whatever a publication puts in an RSS `<link>` and scrapes
the page. `_fetch_bytes` permits `http`/`https` only and follows at most three
redirects, and `file://` is reachable only under `DEMO_FIXTURES=1`. There is
**no host allow-list and no private-address block**, and the check after the
redirect chain resolves re-validates the **scheme only, not the host**. So a
feed you trust can point the fetcher at any reachable host, including one on
your own network, either directly or via a redirect from a public URL.

Treat that as an exfiltration path, not only a reachability one. Whatever the
fetch returns is scraped, summarised by the model, and written into
`research/state.json`, a Slack message and a GitHub Issue — which is to say the
party who chose the URL also gets to read the response. Run it only where an
outbound request to your own network does not matter.

**Under `DEMO_FIXTURES=1` it will read any file it has permission to read.**
That variable exists so the demo can serve fixture articles from disk without a
web server, and `demo/run-demo.sh` is the only thing that sets it — alongside a
`CONFIG_PATH` pinned to local fixture feeds, which is the whole of what keeps it
contained. The path is rebuilt from the feed-supplied URL with no confinement to
`demo/`. Do not export it in a shell you then run a real scan from.

**It puts untrusted text in a prompt.** Up to 6,000 words of scraped page
content goes into the claim-extraction call, along with the article's title and
URL. All three are fenced, the system prompt states the fenced region is quoted
material and never instruction, and the fence marker is stripped from each so
none can close it early. That is mitigation, not a guarantee — prompt injection
is not a solved problem, and a sufficiently crafted page may still influence
what gets recorded as a claim.

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
