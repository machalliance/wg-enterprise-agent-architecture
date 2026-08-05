# Your Architecture Review Needs a Better Word Than "Agentic"

**By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [Agent Ecosystem](https://agentecosystem.org/)**

*Grab [From Orchestration to Autonomy](https://github.com/machalliance/wg-enterprise-agent-architecture/blob/draft-from-orchestration-to-autonomy-ebook/deliverables/from-orchestration-to-autonomy-ebook/dist/draft-from-orchestration-to-autonomy.md), a practical model of five archetypes, from LLM-assisted workflows to self-directed agents.*

You are in an architecture review. The deck says the system is "agentic." You own identity, data access, the integration surface, and the question of what happens when it acts on the wrong thing, and that one word tells you none of it. It could mean a workflow that drafts product copy. It could mean a system that reprices your catalog around the clock, or one negotiating with a supplier's agent across a trust boundary you do not control. Same word, wildly different risk.

So "agentic" is a governance problem wearing a marketing label. Gartner expects more than 40% of agentic AI projects to be [canceled by the end of 2027](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027), citing escalating cost, unclear business value, and inadequate risk controls. Those are what you get when a team cannot tell one kind of agentic system from another and scopes the controls and the budget for the wrong one.

## A word that survives the review

The fix is a sharper vocabulary. [From Orchestration to Autonomy](https://github.com/machalliance/wg-enterprise-agent-architecture/blob/draft-from-orchestration-to-autonomy-ebook/deliverables/from-orchestration-to-autonomy-ebook/dist/draft-from-orchestration-to-autonomy.md) sets out five archetypes, running from structured and human-directed to autonomous and system-directed:

1. **LLM-assisted workflows** draft or transform content inside a fixed path.
2. **LLM-directed workflows** let the model choose among paths you designed.
3. **Goal-directed agents** plan and run a bounded task, then stop.
4. **Autonomous, policy-guided agents** run continuously within policy.
5. **Collaborating, self-directed agents** work across organizational lines.

Each archetype is described on the two dimensions you weigh in any review: what the system can do, which is architecture, and what it is allowed to do, which is policy. As autonomy climbs, both climb with it. A content workflow needs prompt governance and output validation. An autonomous agent needs durable identity, circuit breakers, and an auditable decision trail. Name the archetype and you know which controls to demand.

Most real systems blend several archetypes, so the obligation attaches component by component. Govern a system by its loudest label and the quiet parts go ungoverned, which is exactly where the incidents come from.

## What separates the projects that ship

The agentic systems already running in production point the same way. A retailer ran a shopping agent through Black Friday and lifted conversion by 35%. A B2B distributor cut order processing from eight minutes to under sixty seconds. A smart-home brand opened an agent-driven sales channel at near-zero added cost. An automaker automated 90% of metadata creation for more than 16,000 users and cut compliance validation time by 70%. An auto-parts retailer runs more than 20 agents in production and booked over $500,000 in savings inside six to eight months. None of them deployed "agentic" in the abstract. Each scoped the work tightly to a real bottleneck, governed it archetype by archetype, and ran on composable, API-first foundations.

## Grab the ebook

[From Orchestration to Autonomy](https://github.com/machalliance/wg-enterprise-agent-architecture/blob/draft-from-orchestration-to-autonomy-ebook/deliverables/from-orchestration-to-autonomy-ebook/dist/draft-from-orchestration-to-autonomy.md) is the whole model: the five archetypes, the architecture and policy each one demands, the six conditions under which you should not build an agent at all, and readiness checklists you can take straight into a review. It is a working framework, shaped in the open, and it sharpens with every team that tests it.

Read it before your next architecture review, and walk in with a better word than "agentic."

**[Download From Orchestration to Autonomy →](https://github.com/machalliance/wg-enterprise-agent-architecture/blob/draft-from-orchestration-to-autonomy-ebook/deliverables/from-orchestration-to-autonomy-ebook/dist/draft-from-orchestration-to-autonomy.md)**

### Authors

This article was developed by the Enterprise Agent Architecture Working Group of the Agent Ecosystem. The working group's charter, members, and ongoing work are public at [github.com/machalliance/wg-enterprise-agent-architecture](https://github.com/machalliance/wg-enterprise-agent-architecture). Learn more about the broader agent ecosystem vision at [agentecosystem.org](https://agentecosystem.org/).
