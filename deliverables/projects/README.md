# Projects

Buildable deliverables of the [Enterprise Agent Architecture Working Group](../../README.md) — reference architectures, specs, and runnable prototypes that put the patterns from [From Orchestration to Autonomy](../from-orchestration-to-autonomy-ebook/) into working code.

## What's here

| Project | What it is | State |
|---|---|---|
| [`hackathon/`](./hackathon/) | **Agent Architecture Hackathon in a Box** — a reusable two-half-day hackathon for learning to design and combine agent architectures. Debuts at MACH X Amsterdam, September 29–30, 2026. | Active development |
| [`4-autonomous-policy-guided-agents/`](./4-autonomous-policy-guided-agents/) | Specification for an **archetype 4** reference architecture: an agent that runs over extended periods and acts on its own according to policy. Written as a milestone-sequenced spec (identity, state, policy, accountability, circuit breakers, demo). | Spec |
| [`5-collaborating-self-directed-agents/`](./5-collaborating-self-directed-agents/) | **Meridian Outfitters** — a working **archetype 5** prototype: multiple self-directed agents representing different interests, negotiating across trust boundaries. | Prototype |

Project directories are numbered by the archetype they exercise, so the numbering matches the five archetypes in the article. Not every archetype has a project yet.

## The five archetypes

Projects here map onto the spectrum defined by the working group:

1. **LLM-assisted workflows** — fixed human-authored flow, model generates or transforms at certain steps.
2. **LLM-directed workflows** — human-authored structure, model chooses the path within it.
3. **Goal-directed, task-oriented agents** — given a goal and tools, the agent plans its own steps for a bounded task.
4. **Autonomous, policy-guided agents** — long-running, self-initiating, bounded by policy.
5. **Collaborating, self-directed agents** — multiple agents cooperating or negotiating across organizational boundaries.

The archetypes are not a maturity ladder; each is the right answer to a particular problem, and real systems usually combine several.
