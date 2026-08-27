# Projects

Buildable deliverables of the [Enterprise Agent Architecture Working Group](../../README.md) — reference architectures, specs, and runnable prototypes that put the patterns from [From Orchestration to Autonomy](../from-orchestration-to-autonomy-ebook/) into working code.

## What's here

| Project | What it is | State |
|---|---|---|
| [`agent-build-lab/`](./agent-build-lab/) | **Agent Architecture Hackathon in a Box** — a reusable two-half-day hackathon for learning to design and combine agent architectures. Debuts at MACH X Amsterdam, September 29–30, 2026. | Active development |
| [`archetype-4-meridian-pulse/`](./archetype-4-meridian-pulse/) | **Meridian Pulse** — a working **archetype 4** reference prototype: an agent that runs over extended periods and acts on its own according to policy, with real policy gates, circuit breakers, and an auditable decision trail. The step-by-step build guide lives in [`agent-build-lab/archetype-4-meridian-pulse/`](./agent-build-lab/archetype-4-meridian-pulse/). | Prototype |
| [`archetype-5-meridian-crossing/`](./archetype-5-meridian-crossing/) | **Meridian Crossing** — a working **archetype 5** prototype: multiple self-directed agents representing different interests, negotiating across trust boundaries. | Prototype |

Project directories are named `archetype-<n>-<project>`, so the numbering matches the five archetypes in the article. Not every archetype has a project yet.

## The five archetypes

Projects here map onto the spectrum defined by the working group:

1. **LLM-assisted workflows** — fixed human-authored flow, model generates or transforms at certain steps.
2. **LLM-directed workflows** — human-authored structure, model chooses the path within it.
3. **Goal-directed, task-oriented agents** — given a goal and tools, the agent plans its own steps for a bounded task.
4. **Autonomous, policy-guided agents** — long-running, self-initiating, bounded by policy.
5. **Collaborating, self-directed agents** — multiple agents cooperating or negotiating across organizational boundaries.

The archetypes are not a maturity ladder; each is the right answer to a particular problem, and real systems usually combine several.
