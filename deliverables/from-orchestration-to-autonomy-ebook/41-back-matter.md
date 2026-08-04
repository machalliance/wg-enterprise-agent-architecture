# Glossary

Terms as this book uses them. Where a term first becomes load-bearing in a particular archetype, that is noted.

**A2A (Agent2Agent).** An open protocol defining how independently built agents exchange structured messages and take turns, independent of how either is implemented. Started at Google, donated to the Linux Foundation in 2025, now governed by a multi-vendor technical steering committee. Archetype 5.

**Agent directory.** Shared infrastructure where agents publish machine-readable descriptions of what they can do, so other organizations' agents can find and evaluate them without a human wiring the connection first. Archetype 5.

**Agentic system.** A system where an AI model evaluates context and makes decisions that shape the system's behavior. A model that only generates or transforms content inside a fixed path is *LLM-assisted*, not agentic. This is the line the whole model is built on.

**Archetype.** A recurring pattern of agentic system with its own best-fit problems, its own architecture demands, and its own policy demands. Deliberately not a *level* or *maturity stage*: there is no top, and most real solutions compose several archetypes at once.

**Architecture.** In this book, one of the two dimensions: what a system *can* do — reasoning, coordination, state, and the tools and integrations through which it acts on the world.

**Blast radius.** The worst outcome an agent's permissions allow, independent of how well it reasons. Scoping tools and write access is how you bound it.

**Checkpointing.** Periodically persisting an agent's full accumulated context so a crash resumes from the last good state rather than from zero. Archetype 4.

**Circuit breaker.** A machine-speed automatic halt triggered by rate or cumulative-magnitude limits rather than by the validity of any individual action. Distinct from a **kill switch**, which is an operator's immediate, unconditional manual halt. Archetype 4.

**Confidence threshold.** The score below which a model's recommendation is not acted on, routing instead to a defined fallback. Archetype 2.

**Context package.** The curated set of data a workflow assembles and passes to a model: approved attributes, terminology rules, constraints, prior approved examples, prohibited claims. The model sees only this, so a weak package produces weak output regardless of model quality. Archetype 1.

**Dead man's switch.** A control that pauses an agent if it has not checked in with oversight within a defined interval, covering the case where the agent is running but observability has failed. Archetype 4.

**Decentralized identifier (DID) and verifiable credential.** W3C standards letting an identity and its claims be checked cryptographically rather than accepted on assertion — the general technique behind cross-organization identity verification. Archetype 5.

**Decision trail.** An append-only, tamper-evident record of each decision: the triggering observation, the reasoning, the proposed action, the policy result, the outcome, and the post-action observation. At archetype 4 it is infrastructure, not logging.

**Drift.** Behavior changing over time while each individual decision still looks plausible. *Route drift*: the distribution of routing decisions shifts (archetype 2). *Agent drift*: the agent finds edge cases that pass policy but violate intent. *Policy drift*: the policies are stale and the agent is faithfully following them. *Semantic drift*: stated rationales become repetitive, circular, or disconnected from what was observed.

**Durable execution.** Frameworks (Temporal, AWS Step Functions, Restate and similar) that persist workflow state across failures and restarts — one common way to implement archetype 4's durable state.

**Ephemeral credential.** A short-lived, task-scoped credential that exists for the life of a single run and expires with it. The cleanest fault line between archetype 3 and archetype 4, which needs a standing identity instead.

**Exfiltration.** Data leaving your boundary through an agent that has both broad read access and some external action. The mirror risk to prompt injection.

**Golden test set.** A fixed set of representative inputs with known-good outputs or resolutions, run as a regression check whenever a prompt or model changes. The substitute for asserting one correct output in a non-deterministic system.

**LLM-as-judge.** Using a model to score another model's output against a rubric, at volumes humans cannot review. Sound when the judge is calibrated against human labels and independent of the generator; circular when it shares the generator's model, prompt lineage, or blind spots. It can assess whether a claim looks supported, never whether it is true.

**Machine identity.** A durable, dedicated credential belonging to the agent itself — distinct from a shared service account or a delegated human session — with its own provisioning, rotation, scoping, monitoring, revocation, and decommissioning. Archetype 4.

**Mandate.** Policy governing what an agent may commit *you* to in a deal with an outside party, as distinct from what it may do to your own systems. Held privately; a counterparty who can infer your mandate can exploit it. Archetype 5.

**MCP (Model Context Protocol).** A standard interface for exposing tools and context to a single agent. Not an alternative to A2A: it sits at a different layer and complements it.

**Non-repudiable.** Signed and tied to a verified identity, so neither party can later deny having made or accepted an offer. Archetype 5.

**OASF (Open Agentic Schema Framework).** A machine-readable format for describing an agent's capabilities and identity independent of vendor or framework, used for directory publication and discovery. Part of AGNTCY.

**Policy.** In this book, the second of the two dimensions: what a system is *allowed* to do — identity, governance, permissions, and oversight. It has to scale in step with architecture.

**Policy engine.** The component that evaluates every proposed action against stored policy before execution, returning permit, escalate, or halt. At archetype 4 no path from reasoning to action may bypass it.

**Prompt injection.** A malicious instruction hidden in content an agent reads — a document, a web page, a supplier feed — which the agent may treat as a goal. Not a fringe case for agents whose job is ingesting external content. Contained by permission boundaries, not by the model's judgment.

**Reasoning trace.** A per-run record of each step, its rationale, the tool call it produced, and the result. Treat it as evidence rather than proof: a model's stated rationale is its account of what it did, not a guaranteed-faithful log of the computation, so pair it with the tool-call log and observed results. Archetype 3.

**Reservation price.** The least favourable price your agent is authorized to accept. Part of the mandate, and never disclosed to a counterparty. Archetype 5.

**Route set.** The explicit, enumerated list of paths a model may choose among, defined before the model is introduced, with required inputs and unavailability conditions for each. Defining it is the primary act of architecture at archetype 2.

**Shadow run.** A new prompt, model, or configuration processing live traffic without acting on it, so its behaviour can be compared against the live system before promotion. Catches what replay against recorded results cannot.

**SLIM (Secure Low-Latency Interactive Messaging).** One encrypted transport that can carry a negotiation protocol between organizations; plain gRPC or a message bus can play the same role. Part of AGNTCY.

**Tool allow-list.** The enumerated set of tools an agent may call, with read and write scoped separately. Everything an agent can do is the union of its tools, so this is the action surface. Archetype 3.

**Trajectory evaluation.** Scoring *how* an agent reached its result — steps taken, tools called, errors recovered, cost, escalations — as distinct from whether the result was correct. An agent can produce the right outcome by an unacceptable route, which outcome-only evaluation records as a pass.

# References and further reading

- Gartner, [Over 40% of Agentic AI Projects Will Be Canceled by End of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027) (June 2025)
- Anthropic, [Building Effective Agents](https://www.anthropic.com/engineering/building-effective-agents)
- AGNTCY, [agntcy.org](https://agntcy.org) and the [Internet of Agents](https://agntcy.org)
- AGNTCY, [Identity](https://github.com/agntcy/identity), the [Open Agentic Schema Framework (OASF)](https://docs.agntcy.org/), and the [Observe SDK](https://docs.agntcy.org/)
- [A2A (Agent-to-Agent) protocol](https://a2a-protocol.org)
- [MIT Sloan's Sinan Aral](https://mitsloan.mit.edu/faculty/directory/sinan-aral) on marketplaces of agents

Agentic AI in production (MACH Alliance):

- Everett Zufelt, [The First Wave of Agentic AI Is Already in Production](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI) (2026)
- [Bash (TFG Group): Agentic Commerce at Scale with a Conversational Shopping Agent](https://machalliance.org/case-studies/bash-tfg-group-agentic-commerce-at-scale-with-a-conversational-shopping-agent)
- [ACR (AmerCareRoyal): From 8 Minutes to 60 Seconds with Autonomous B2B Order Processing](https://machalliance.org/case-studies/acr-amercareroyal-from-8-minutes-to-60-seconds-with-autonomous-b2b-order-processing)
- [Wyze: End-to-End Agentic Commerce from AI-Powered Discovery to Doorstep Delivery](https://machalliance.org/case-studies/wyze)
- [CarParts.com: Building a Multi-Agent Ecosystem for Agentic Automotive Commerce](https://machalliance.org/case-studies/carparts-com)

# Contributors

This book was shaped by members of the Enterprise Agent Architecture Working Group, with thanks to:

- Daniele Stroppa, [Amazon Web Services](https://aws.amazon.com)
- Danny Lake, [Orium](https://orium.com)
- Devon Hillard, [McFadyen Digital](https://mcfadyen.com)
- Doug Wessel, [viax](https://viax.io)
- Everett Zufelt, [Orium](https://orium.com)
- George FitzGibbons, [Vercel](https://vercel.com)
- Ryan Lunka, [Aries Solutions](https://ariessolutions.io)
- Sana Remekie, [Conscia](https://www.conscia.ai)
- Tim Benniks, [Contentstack](https://www.contentstack.com)

# About the working group

This book was developed by the Enterprise Agent Architecture Working Group of the [MACH Alliance](https://machalliance.org). The working group's charter, members, and ongoing work are public at [github.com/machalliance/wg-enterprise-agent-architecture](https://github.com/machalliance/wg-enterprise-agent-architecture).

Learn more about the broader agent ecosystem vision at [agentecosystem.org](https://agentecosystem.org).

# How to cite

Enterprise Agent Architecture Working Group, *From Orchestration to Autonomy: A composable model for building across the agent ecosystem*. MACH Alliance, 2026.
