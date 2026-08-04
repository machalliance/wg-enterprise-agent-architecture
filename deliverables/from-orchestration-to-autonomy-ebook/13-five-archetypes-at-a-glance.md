## The five archetypes at a glance

The archetypes run from more structured, where a human directs the system, to more autonomous, where the system directs itself.

![Horizontal arrow from "More Structured / Human direction" on the left to "More Autonomous / System direction" on the right, marking five stages. 1: LLM-assisted workflows (not yet agents). 2: LLM-directed workflows. 3: Goal-directed, task-oriented agents. 4: Autonomous, policy-guided agents. 5: Collaborating, self-directed agents.](diagram-degrees-of-agency.png)

The whole model on one screen:

| # | Archetype (handle) | In one line | Business outcome it buys | The requirement that defines it |
|---|---|---|---|---|
| 1 | LLM-assisted workflows (*assisted*) | A model drafts or transforms content inside a fixed path | Speed and consistency on high-volume work | Output validation and prompt governance |
| 2 | LLM-directed workflows (*directed*) | The model chooses among paths you designed | Adaptive behavior, still contained | An explicit route set with a confidence fallback |
| 3 | Goal-directed agents (*goal-directed*) | The model plans and runs a bounded task, then stops | Autonomy on problems no one scripted | Scoped tools and reasoning traces |
| 4 | Autonomous, policy-guided agents (*autonomous*) | The model runs continuously within policy | Continuous optimization of a domain | Durable identity, circuit breakers, decision trails |
| 5 | Collaborating, self-directed agents (*collaborating*) | Agents work across organizational lines | Reach beyond your own walls | Cross-organization identity and mandates |

Part Two expands each row into a full chapter, and Part Three's readiness reference turns the last column into consolidated checklists.

Each archetype buys a different business outcome at a different price. Archetypes 1 and 2 buy speed and consistency on high-volume work: faster content, cleaner data, quicker routing, at low risk and predictable cost. Archetype 3 buys real autonomy on bounded problems no one had time to script, with the cost of testing and oversight for a system whose plan you no longer write. Archetype 4 buys continuous optimization of a domain, and requires a governance and identity function most organizations do not yet have. Archetype 5 buys reach beyond your own walls, and requires trust infrastructure the industry is still building. More autonomy does not mean more value; it means a different value with a different bill attached, and the skill is matching the archetype to the outcome you actually need.

Each is the best choice for a given class of problem, and most production systems use several at once. The next two sections make that last point concrete.

### Already in production

These are not hypotheticals. Enterprises are running systems all along this range today, with measured results. The examples below are drawn from MACH Alliance Agentic Achievement Award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026).

- **Bash, customer-facing commerce.** The South African retailer's shopping agent watches for hesitating shoppers, decides on its own when to engage, and recommends products in natural language, acting continuously within its configured policy. In a Black Friday A/B test it lifted conversion by 35% and revenue per visit by 40% against a control group, configured rather than coded, with no engineering from the retailer ([case study](https://machalliance.org/case-studies/bash-tfg-group-agentic-commerce-at-scale-with-a-conversational-shopping-agent)).
- **AmerCareRoyal, operations.** The distributor's order agent reads unstructured purchase-order PDFs, scores its own confidence, and submits clean orders straight to a legacy ERP, closing the confident cases end to end without a human. It cut processing from about eight minutes to under sixty seconds, now runs roughly 99% of structured orders through untouched, and freed roughly 267 staff hours a month ([case study](https://machalliance.org/case-studies/acr-amercareroyal-from-8-minutes-to-60-seconds-with-autonomous-b2b-order-processing)). It is also a live example of the composition this book argues for: the extraction step reads and structures inside a fixed path, and the confidence score that decides whether an order goes straight through or to a human is a separate, model-driven routing decision. One deployment, two archetypes, each governed differently.
- **Wyze, cross-organization commerce.** External AI assistants discover and buy the smart-home brand's products, and an orchestration layer routes fulfillment autonomously, agents transacting across organizational lines with no shared orchestrator. It more than halved click-to-delivery time and opened a new sales channel at near-zero added cost ([case study](https://machalliance.org/case-studies/wyze)).

Between them these deployments cover the more autonomous half of the model, from a bounded task closed without a human, to an agent acting continuously within policy, to agents transacting across organizational lines. The through-line is the one this book argues: each result came from scoping the work tightly to a real bottleneck, on composable, API-first foundations, with governance in place before scale.
