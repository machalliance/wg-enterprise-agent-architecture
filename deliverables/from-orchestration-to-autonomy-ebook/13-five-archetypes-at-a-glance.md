## The five archetypes at a glance

The archetypes run from more structured, where a human directs the system, to more autonomous, where the system directs itself.

The whole framework on one screen:

| # | Archetype (handle) | In one line | Business outcome it buys | The requirement that defines it |
|---|---|---|---|---|
| 1 | LLM-assisted workflows (*assisted*) | A model drafts or reshapes content inside a fixed path | Speed and consistency on high-volume work | Output validation and prompt governance |
| 2 | LLM-directed workflows (*directed*) | The model chooses among paths you designed | Adaptive behavior, still contained | An explicit route set with a confidence fallback |
| 3 | Goal-directed agents (*goal-directed*) | The model plans and runs a bounded task, then stops | Autonomy on problems no one scripted | Scoped tools and reasoning traces |
| 4 | Autonomous, policy-guided agents (*autonomous*) | The model runs continuously within policy | Continuous tuning of a domain | Durable identity, circuit breakers, decision trails |
| 5 | Collaborating, self-directed agents (*collaborating*) | Agents work across organizational lines | Reach beyond your own walls | Cross-organization identity and mandates |

Part Two expands each row into a full chapter, and Part Three's readiness reference turns the last column into consolidated checklists.

Each archetype buys a different business outcome at a different price. Archetypes 1 and 2 buy speed and consistency on high-volume work: faster content, cleaner data, quicker routing, at low risk and predictable cost. Archetype 3 buys real autonomy on bounded problems nobody had time to script. Its price is the testing and oversight a system needs when you no longer write its plan. Archetype 4 buys continuous tuning of a domain, and asks for a governance and identity function most organizations do not yet have. Archetype 5 buys reach beyond your own walls, and asks for trust infrastructure the industry is still building. More autonomy does not mean more value. It means a different value with a different bill attached, and the skill is matching the archetype to the outcome you actually need.

Each is the best choice for a given class of problem, and most production systems use several at once. The next two sections make that last point concrete.

### Already in production

These are not hypotheticals. Enterprises are running systems all along this range today, with measured results. The examples below are drawn from MACH Alliance Agentic Achievement Award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026).

- **Bash, customer-facing commerce.** The South African retailer's shopping agent watches for shoppers who hesitate, decides on its own when to step in, and suggests products in plain language. It runs continuously, inside the policy its operators set. In a Black Friday A/B test it lifted conversion by 35% and revenue per visit by 40% against a control group. It was configured rather than coded, with no engineering from the retailer ([case study](https://machalliance.org/case-studies/bash-tfg-group-agentic-commerce-at-scale-with-a-conversational-shopping-agent)).
- **AmerCareRoyal, operations.** The distributor's order agent reads messy purchase-order PDFs, scores its own confidence, and submits clean orders straight to a legacy ERP, closing the confident cases end to end without a human. It cut processing from about eight minutes to under sixty seconds, now sends roughly 99% of structured orders through untouched, and freed about 267 staff hours a month ([case study](https://machalliance.org/case-studies/acr-amercareroyal-from-8-minutes-to-60-seconds-with-autonomous-b2b-order-processing)). It is also a live example of the composition this book argues for. The extraction step reads and structures inside a fixed path. The confidence score that decides whether an order goes straight through or to a human is a separate, model-driven routing decision. The two need governing differently.
- **General Motors, marketing operations.** The automaker's AssetIQ platform runs six specialized agent types — Librarian, Planning, Production, Compliance, Critic, and Orchestration — as one system. Metadata a Librarian agent produces is immediately available for a Compliance agent to check against more than 130 regulatory fields, and for Production agents to reuse. It serves more than 16,000 users across 35 agencies, with 90% of metadata creation automated and compliance checks 70% faster. Note what the Critic and Compliance agents are doing. The review that would otherwise be a human queue is itself agentic. That is a sound design, but not a free saving, because those agents need governing too.
- **CarParts.com, portfolio scale.** The retailer runs more than 20 agents in production across customer-facing shopping help, internal operations, vendor communication, and product data enrichment, on five model platforms at once. A shared state layer keeps agents in step that would otherwise reason in isolation. It reports 10x faster feature prototyping, roughly two hours reclaimed per developer per day, and more than $500,000 in savings inside six to eight months ([case study](https://machalliance.org/case-studies/carparts-com)). It is the clearest case in this set for governing component by component: a fitment answer given to a customer and a draft email sent to a vendor sit in different archetypes and cannot carry the same controls.
- **Wyze, cross-organization commerce.** Outside AI assistants find and buy the smart-home brand's products, and an orchestration layer routes fulfillment on its own. These are agents doing business across organizational lines with no shared orchestrator. It more than halved click-to-delivery time and opened a new sales channel at almost no added cost ([case study](https://machalliance.org/case-studies/wyze)).

Between them, these deployments run the length of the framework: content and metadata produced inside a fixed path, a bounded task closed without a human, an agent acting continuously within policy, and agents doing business across organizational lines.
