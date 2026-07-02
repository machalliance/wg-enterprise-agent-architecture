## The five archetypes at a glance

The archetypes run from more structured, where a human directs the system, to more autonomous, where the system directs itself.

![Horizontal arrow from "More Structured / Human direction" on the left to "More Autonomous / System direction" on the right, marking five stages. 1: LLM-assisted workflows (not yet agents). 2: LLM-directed workflows. 3: Goal-directed, task-oriented agents. 4: Long running, policy driven. 5: Collaborating across domains and organizations.](diagram-degrees-of-agency.png)

The whole model on one screen:

| # | Archetype | In one line | Business outcome it buys | The requirement that defines it |
|---|---|---|---|---|
| 1 | LLM-assisted workflows | A model drafts or transforms content inside a fixed path | Speed and consistency on high-volume work | Output validation and prompt governance |
| 2 | LLM-directed workflows | The model chooses among paths you designed | Adaptive behavior, still contained | An explicit route set with a confidence fallback |
| 3 | Goal-directed agents | The model plans and runs a bounded task, then stops | Autonomy on problems no one scripted | Scoped tools and reasoning traces |
| 4 | Autonomous, policy-guided agents | The model runs continuously within policy | Continuous optimization of a domain | Durable identity, circuit breakers, decision trails |
| 5 | Collaborating, self-directed agents | Agents work across organizational lines | Reach beyond your own walls | Cross-organization identity and mandates |

The sections below expand each row, and Part Three's readiness reference turns the last column into full checklists.

**1. LLM-assisted workflows (not yet agents).** A deterministic workflow uses a model to generate or transform content at one or more steps. Summarize this transcript, draft this email, translate this paragraph. The model does real work but does not choose the path. This sits below the agency line.

**2. LLM-directed workflows.** The model makes decisions inside a structure people designed. You build the paths; the model chooses which one to take, or whether to loop and try again. Intelligent routing, parallel processing, bounded evaluation loops. The structure is authored by people; the decisions at each step are the model's.

**3. Goal-directed, task-oriented agents.** You hand the system a goal and a set of tools, and it works out the steps itself. Fix this bug, research this codebase, clean up this feed. No predefined path. The task is bounded and the agent stops when it is done. This is the first archetype that is genuinely an agent rather than a workflow.

**4. Autonomous, policy-guided agents.** The system operates independently over long durations, monitoring a domain, deciding, acting, and self-correcting, without waiting for an assignment. The shift from archetype 3 is persistence and self-direction. It does not complete a task and report back. It watches a domain and acts on what it finds, continuously, within defined policy.

**5. Collaborating, self-directed agents.** Agents work together across teams, vendors, or organizational lines, and at the far end they do so on behalf of parties with opposing interests. A buyer's agent and a seller's agent, each optimizing for a different outcome, negotiating directly. No shared orchestrator. No single party in control.

Each archetype also buys a different business outcome at a different price. Archetypes 1 and 2 buy speed and consistency on high-volume work: faster content, cleaner data, quicker routing, at low risk and predictable cost. Archetype 3 buys real autonomy on bounded problems no one had time to script, with the cost of testing and oversight for a system whose plan you no longer write. Archetype 4 buys continuous optimization of a domain, and requires a governance and identity function most organizations do not yet have. Archetype 5 buys reach beyond your own walls, and requires trust infrastructure the industry is still building. More autonomy does not mean more value; it means a different value with a different bill attached, and the skill is matching the archetype to the outcome you actually need.

Each is the best choice for a given class of problem, and most production systems use several at once. The next two sections make that last point concrete.

### Already in production

These are not hypotheticals. Enterprises are running each archetype today, with measured results. The examples below are drawn from MACH Alliance Agentic Achievement Award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026).

- **Archetype 4, customer-facing (Bash).** The South African retailer's shopping agent watches for hesitating shoppers, decides on its own when to engage, and recommends products in natural language. In a Black Friday A/B test it lifted conversion by 35% and revenue per visit by 40% against a control group, configured rather than coded, with no engineering from the retailer ([case study](https://machalliance.org/case-studies/bash-tfg-group-agentic-commerce-at-scale-with-a-conversational-shopping-agent)).
- **Archetype 3 to 4, operations (AmerCareRoyal).** A distributor's order agent reads unstructured purchase-order PDFs, scores its own confidence, and submits clean orders straight to a legacy ERP, cutting processing from about eight minutes to under sixty seconds and freeing roughly 267 staff hours a month ([case study](https://machalliance.org/case-studies/acr-amercareroyal-from-8-minutes-to-60-seconds-with-autonomous-b2b-order-processing)).
- **Archetype 5, cross-organization (Wyze).** External AI assistants discover and buy the smart-home brand's products, and an orchestration layer routes fulfillment autonomously, more than halving click-to-delivery time and opening a new sales channel at near-zero added cost ([case study](https://machalliance.org/case-studies/wyze)).

The through-line is the one this book argues: each result came from scoping an archetype tightly to a real bottleneck, on composable, API-first foundations, with governance in place before scale.
