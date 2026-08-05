# Part Three · Putting It Together

## Cross-cutting concerns

The archetype chapters cover what each pattern demands on its own. Four concerns cut across all of them, and they are where enterprise agentic work actually succeeds or stalls. None is optional, and all of them get harder as autonomy grows.

### Integration and legacy reality

The examples in this book run against clean systems: a PIM with an API, a validation service that just answers. Most enterprises do not have that. They have a fifteen-year-old order management system with no real API, three overlapping ERPs, and data spread across silos that were never meant to talk. An agent is only as capable as the tools it can reach, so most of the cost and risk of an agentic initiative sits in integration, not intelligence. Bolt an agent onto a monolith and it inherits every limit of that monolith.

Gartner makes the same point about where projects get expensive. Connecting agents to legacy systems is technically hard, often disrupts the way people work, and takes costly changes, and in many cases rethinking the workflow around the agent beats wiring an agent into the old one ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). So before you scope the agent, scope the integration. If a system the agent must act on has no clean interface, the first project is building that interface, and the estimate has to include it. Data foundations are the same problem in another form. An agent reasoning over inconsistent, stale, or unreachable data produces confident, wrong output.

The production deployments that work bear this out. AmerCareRoyal put its order agent in front of a decades-old IBM AS/400 ERP by connecting through an integration layer and an orchestration engine, rather than rebuilding the backend. Wyze added a whole agent-driven sales channel with no changes at all to its existing fulfillment infrastructure, because that infrastructure was already API-first ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). The lesson repeats: a composable, connected, API-first foundation is what makes the agent layer cheap to add. Where that foundation is missing, building it is the first honest line item.

### Security and the agent attack surface

Agents add a class of risk that ordinary software does not have. Because an agent acts on the content it reads, any untrusted input can try to redirect it. Prompt injection — a malicious instruction hidden in a document, a web page, or a supplier feed — is the headline case, and it gets more dangerous as autonomy rises. A goal-directed agent can be steered mid-task, and an autonomous agent can be steered with no human in the loop to catch it. The mirror risk is a data leak, where an agent with broad read access and any outward action becomes a path for data to escape.

The defenses hold across every archetype. Keep instructions separate from data in the context you assemble. Keep read scope and write scope as narrow as the task allows, so a compromised agent has a small blast radius. Route any action that crosses a trust boundary through the policy engine rather than the model's judgment. And treat tool results as untrusted input rather than ground truth to obey. Security here comes from how the tools and permissions are scoped from the start. Bolting a review on at the end does not create it.

### Cost and latency

Autonomy costs money in a way a single model call does not. A goal-directed agent may make dozens of model calls to finish one task. An autonomous agent runs continuously. A cross-organization negotiation runs several rounds against several counterparties. Each of those is a token and compute bill that grows with the autonomy you buy, and a use case that pencils out at one call per record can stop paying at fifty. Treat cost as a design constraint you work out before scaling, not an invoice you discover later. Set per-task and per-window budgets, keep cheap deterministic work out of the model, and cache where inputs are stable. Latency follows the same logic. An agent that reasons through many steps is slower than a single call, which matters for anything a customer waits on.

### Operating model and timelines

An agent that acts at machine speed needs an operating model to match. Someone owns each agent. Someone is on call when a circuit breaker trips at 2am. There are runbooks for pausing an agent, revoking its identity, and rebuilding what it did, and an incident process that treats an agent's bad action like a production incident, because that is what it is. The human-oversight box in every architecture diagram stands for a team and a set of procedures. That capacity has to be staffed and planned; it does not appear on its own.

Timelines should be set accordingly. Archetypes 1 and 2 can deliver value in weeks. A goal-directed agent trustworthy enough for live write access is a matter of months, most of it spent in sandbox and evaluation. An autonomous agent with its own identity, durable state, and governance is a program measured in quarters, and the collaborating case depends partly on infrastructure the industry is still building. "Start now" is fair advice. "Transform overnight" is how projects end up cancelled.
