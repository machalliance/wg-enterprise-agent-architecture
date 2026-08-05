# Four data questions to answer before an agent goes live

By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [MACH Alliance](https://machalliance.org)

Agentic systems move regulated data through more places than the workflows they replace. A model call leaves your boundary. A reasoning trace lands in a store that did not exist before. For a regulated enterprise, four questions sit under every system like this, and they get harder the more autonomy it has.

**Where does the data go?** A model call can send customer or transaction data outside your boundary, and possibly outside your jurisdiction, which puts it squarely inside GDPR, sector rules, and data-residency law. You need to know which model runs where, and what classes of data may reach each one.

**How long is it kept?** Prompts, completions, reasoning traces, and decision trails are all new stores of regulated data, and an agent that keeps running produces them continuously. Set a retention period for each store on purpose, rather than inheriting whatever the platform defaults to. Then check that a deletion request reaches all of them, including the trace archive you built for auditing, which is the store nobody remembers to list. Retention also pulls against evidence: the decision trail an auditor wants kept may hold data a privacy rule says to delete, and that tension has to be settled by design rather than discovered during an incident.

**Is any of it used for training?** Whether a provider trains on your inputs can vary by tier, endpoint, and region within a single vendor, so check it against the contract and record the answer rather than taking it from a marketing page. The question applies inside your own walls too. Fine-tuning on production traffic, or building golden test sets out of it, creates a new artifact carrying the same regulated data, with its own residency and retention profile.

**Who is accountable for the action?** When an agent takes a step with legal or financial weight, the decision trail has to satisfy an auditor, not just an engineer.

The teams doing this well build compliance in from the first line rather than bolting it on. CarParts.com built PII controls, consent management, and observability into its agent stack from day one. General Motors runs a compliance agent that checks content against a regulatory rulebook of more than 130 fields as part of the workflow ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). Treat residency, retention, training permission, consent, and regulatory checks as architecture decisions made alongside the permission model. Retrofitting them after an agent is live costs far more than designing for them.
