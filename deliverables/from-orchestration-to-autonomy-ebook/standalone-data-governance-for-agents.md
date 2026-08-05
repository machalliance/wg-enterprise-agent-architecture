# Four data questions to answer before an agent goes live

By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [MACH Alliance](https://machalliance.org)

Agentic systems move regulated data through more places than the workflows they replace. A model call leaves your boundary, and a reasoning trace lands in a store that did not exist before. For a regulated enterprise, four questions sit underneath every such system, and they get harder the more autonomy it has.

**Where does the data go?** A model call can send customer or transaction data outside your boundary, potentially outside your jurisdiction, which puts it squarely inside GDPR, sector regulation, and data-residency rules. You need to know which model runs where and what data classes may reach each one.

**How long is it kept?** Prompts, completions, reasoning traces, and decision trails are all new stores of regulated data, and an agent that persists produces them continuously. Set a retention period per store deliberately rather than inheriting whatever the platform defaults to, and check that a deletion request reaches all of them — including the trace archive you built for auditability, which is the store nobody remembers to enumerate. Retention also pulls against evidence: the decision trail an auditor wants preserved may hold data a privacy rule says to delete, and that tension has to be settled by design rather than discovered during an incident.

**Is any of it used for training?** Whether a provider trains on your inputs varies by tier, endpoint, and region within a single vendor, so verify it against the contract and record the answer rather than assuming it from a marketing page. The question applies internally too: fine-tuning on production traffic, or building golden test sets out of it, creates a new artifact carrying the same regulated data under its own residency and retention profile.

**Who is accountable for the action?** When an agent takes a step with legal or financial weight, the decision trail has to satisfy an auditor, not just an engineer.

The teams doing this well build compliance in from the first line rather than bolting it on. CarParts.com embedded PII controls, consent management, and observability into its agent stack from day one, and General Motors runs a compliance agent that validates content against a regulatory rulebook of more than 130 fields as part of the workflow ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). Treat residency, retention, training permission, consent, and regulatory validation as architecture decisions made alongside the permission model, because retrofitting them after an agent is live is far more expensive than designing for them.
