# Deliverables

Artifacts produced by the [Enterprise Agent Architecture Working Group](../README.md), part of the [Agent Ecosystem](https://github.com/machalliance/agent-ecosystem) initiative by the [MACH Alliance](https://machalliance.org).

The proposed set of artifacts is described in the [charter](../CHARTER.md#proposed-artifacts). This directory holds the ones that exist.

## What's here

| Path | What it is |
|---|---|
| [`from-orchestration-to-autonomy-ebook/`](./from-orchestration-to-autonomy-ebook/) | The working group's flagship written artifact: the five agent archetypes, the architecture-and-policy framing, composition, cross-cutting concerns, evaluation, and a readiness reference. Chapters are numbered source files; assembled drafts land in `dist/`. |
| [`projects/`](./projects/) | Buildable deliverables — reference architecture specs, runnable prototypes, and the [Hackathon in a Box](./projects/agent-build-lab/). See the [projects README](./projects/README.md). |
| [`what-is-an-agent/`](./what-is-an-agent/) | Working material on the definition of an agent and where the line of agency sits. |

## How this is organized

- **Written artifacts** (ebooks, articles, definitions) get a directory of numbered Markdown source files, with generated or assembled output kept separately under `dist/`.
- **Buildable artifacts** (specs, prototypes, workshop kits) go under [`projects/`](./projects/), one directory each.
- Each directory carries its own `README.md` (or front matter) explaining what it is and its current state.
