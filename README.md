# Enterprise Agent Architecture Working Group

Part of the [Agent Ecosystem](https://github.com/machalliance/agent-ecosystem) initiative by the [MACH Alliance](https://machalliance.org).

This working group defines architectural patterns for designing and operating agent-driven systems across enterprise environments. It translates lessons from real-world implementations into reference architectures and design guidance that enterprises can use to build scalable agent-driven systems.

## The five archetypes

The group's central output is a five-part classification of agent systems, published as [From Orchestration to Autonomy](https://machalliance.org/insights-hub/from-orchestration-to-autonomy). The archetypes are not a maturity ladder — each is the right answer to a particular problem, and real systems usually combine several:

1. **LLM-assisted workflows** — a fixed, human-authored flow calls a model to generate or transform content at certain steps. The model does real work but never chooses the path.
2. **LLM-directed workflows** — the structure is still authored by people, but the model decides which path to take within it.
3. **Goal-directed, task-oriented agents** — given a goal and tools, the agent works out its own steps for a bounded task.
4. **Autonomous, policy-guided agents** — long-running and self-initiating, monitoring a domain and acting within policy rather than waiting for a task.
5. **Collaborating, self-directed agents** — multiple agents cooperating or negotiating across team, vendor, or organizational boundaries.

Two themes run through all five: architecture (what a system can do) and policy (what it is allowed to do) have to scale together, and letting one get far ahead of the other is how agent projects fail.

## Deliverables

Proposed artifacts are described in the [charter](./CHARTER.md#proposed-artifacts). What exists today is in [`deliverables/`](./deliverables/):

| Deliverable | What it is | State |
|---|---|---|
| [`from-orchestration-to-autonomy-ebook/`](./deliverables/from-orchestration-to-autonomy-ebook/) | The reference guide, published as [From Orchestration to Autonomy](https://machalliance.org/insights-hub/from-orchestration-to-autonomy): the five archetypes, the architecture-and-policy framing, composition, cross-cutting concerns, evaluation, and a readiness reference. | Published |
| [`what-is-an-agent/`](./deliverables/what-is-an-agent/) | Working material on the definition of an agent and where the line of agency sits, with a chapter and use cases per archetype. | Working material |
| [`projects/`](./deliverables/projects/) | Buildable deliverables — reference architecture specs, runnable prototypes, and the Hackathon in a Box. | Mixed |

## Leadership

| Name | Role | Organization | Title |
|------|------|-------------|-------|
| George Fitzgibbons | Co-Chair | Vercel | Principal Sales Engineer |
| Tim Benniks | Co-Chair | Contentstack | Developer Experience Lead |
| Everett Zufelt | Program Lead, Agent Ecosystem | Orium | VP, Agentic Systems & Partnerships |
| Rebecca Veldon | Working Group Admin | MACH Alliance | Data and Systems Manager |

## Members

<!-- Add members as they join -->

| Name | Organization | Title |
|------|-------------|---------|
| [Devon Hillard](https://github.com/devondragon) | [McFadyen Digital](https://mcfadyen.com) | Principal Architect - AI |
| [Daniele Stroppa](https://github.com/dstroppa) | [Amazon Web Services](https://aws.amazon.com) | WW Sr. Partner Solutions Architect, Retail & Consumer Goods |

## Backlog

Work items are tracked as [GitHub Issues](https://github.com/machalliance/wg-enterprise-agent-architecture/issues).

## Links

- [Charter](./CHARTER.md) — scope, membership, and proposed artifacts.
- [From Orchestration to Autonomy](https://machalliance.org/insights-hub/from-orchestration-to-autonomy) — the reference guide on the MACH Alliance Insights Hub.
- [Agent Ecosystem](https://github.com/machalliance/agent-ecosystem) — the wider initiative this group is part of.
- [Meeting minutes](./meetings/) — notes from the bi-weekly working sessions.
- [MACH X Amsterdam](https://mach-x.machalliance.org/amsterdam/), September 29–30, 2026 — where the Hackathon in a Box debuts.
