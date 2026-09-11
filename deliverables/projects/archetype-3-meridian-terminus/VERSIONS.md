# Versions

Every dependency in `package.json` is pinned to an exact version. No carets, no
tildes, no ranges. This matches Meridian Pulse (Archetype 4) and Meridian
Crossing (Archetype 5), and it is deliberate.

## Why

This prototype's entire value is that its claims are checkable. The README says
54 tests pass, that a frozen instruction yields zero candidates, that the replay
terminates `GOAL_ACHIEVED`. A reviewer should be able to clone it and see exactly
that — not something close to it.

A range breaks that. `next@^16.3.0-preview.6` is the sharpest case: a caret on a
*preview* release means two clean clones a week apart resolve to different
builds. The prototype would then be making claims about software the reviewer
does not have. When it disagreed with its own documentation, nobody could tell
whether the architecture was wrong or the dependency had moved underneath it.

Pinning trades freshness for reproducibility. For a product that is the wrong
trade. For a reference prototype whose job is to be read and argued with, it is
the only one that makes sense.

## What is pinned, and what that costs

All 29 runtime and dev dependencies. The load-bearing ones:

| Package | Version | Why it matters here |
|---|---|---|
| `eve` | 0.44.3 | Beta framework; the tool, approval and sandbox APIs this prototype is written against move between releases. |
| `ai` | 7.0.78 | Model routing and tool-call shape. |
| `zod` | 4.4.3 | Every tool's input schema. A validation change is a behaviour change. |
| `next` | 16.3.0-preview.6 | Preview release. The caret this replaced was the worst offender. |
| `react` / `react-dom` | 19.2.6 | Paired; must move together. |
| `typescript` | 6.0.3 | `npm run typecheck` is one of the prototype's claims. A compiler bump can change what passes. |
| `just-bash` | 3.4.2 | Sandbox backend. See `agent/sandbox.ts` for why this backend specifically. |

The cost is explicit: **these versions will go stale, and known vulnerabilities
will accumulate in them.** That is accepted. This is an unmaintained demo and
`SECURITY.md` says so without hedging. Do not deploy it.

## Updating

Change a pin only with a reason, and re-run the whole offline suite afterwards —
that suite is what the documentation's claims rest on:

```bash
npm install
npm test            # 54 tests
npm run typecheck
npm run replay:commit
npm run verify:trail
```

If any of those change their output, the documentation is now wrong and needs
updating in the same commit. Note the deliberate exception in `package.json`:
`engines.node` is `>=24`, a range, because that is eve's floor rather than a
version this prototype chose.
