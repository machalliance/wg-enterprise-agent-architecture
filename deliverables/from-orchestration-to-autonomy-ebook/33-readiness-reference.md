## Readiness reference

A consolidated view of the readiness requirements from all five archetypes, on the two dimensions from Part One. Use it as a standalone reference. For a composed system, apply the rows for every archetype in play, per component.

### Architecture readiness

| Archetype | What the system can do | Core architecture requirements |
|---|---|---|
| 1. LLM-assisted | Generate or transform content in a fixed path | Model runs as a workflow step under deterministic orchestration; curated context packages; versioned prompts; output validators; deterministic work kept out of the model |
| 2. LLM-directed | Choose among designed paths, or loop | Explicit route set; structured, schema-validated output; separate decision evaluator; confidence thresholds and fallbacks; bounded loops; per-decision trace |
| 3. Goal-directed | Plan and execute a bounded task | Scoped tool allow-list with read/write separated; carefully specified tools; explicit stop conditions; in-loop error recovery; full-sequence reasoning trace; ephemeral session identity |
| 4. Autonomous | Persist, monitor, and act continuously | Durable machine identity; automated credential rotation; checkpointed, versioned state; behavioral anomaly detection; append-only tamper-evident decision trail; policy gate on every action |
| 5. Collaborating | Interact with agents it does not control | Agent directory and machine-readable capability descriptions; cross-org identity verification; shared negotiation protocol over secure transport; non-repudiable, correlatable exchange |

### Policy readiness

| Archetype | What the system is allowed to do | Core policy requirements |
|---|---|---|
| 1. LLM-assisted | Draft, never decide | Data minimization and approved models per data class; named approval owner; claim-handling rules; golden test sets; content provenance |
| 2. LLM-directed | Select from permitted routes | Route permissions per model, brand, region; escalations carry rationale and evidence; prompt/model change control; route-drift monitoring; decision audit record |
| 3. Goal-directed | Act within a scoped task | Permission boundary enforces "safely"; human checkpoints by reversibility and risk; after-the-fact trace review; tool additions reviewed; sandbox evaluation before live write access |
| 4. Autonomous | Act without per-task approval | Full identity lifecycle ownership; permission tiers in a policy store; rate and magnitude limiters, dead man's and manual kill switches; agent- and policy-drift detection; compliance attestation |
| 5. Collaborating | Commit you to outside parties | Mandate tiers held privately; counterparty cannot infer mandate; round/time budgets and counterparty reputation; kill switch severs live deals and caps total spend; pre-agreed dispute and liability terms |

### How to use it

Run the diagnostic in "Locating your solution" first, component by component. For each component, find its archetype row and treat both the architecture and policy cells as the minimum bar for that component. A component clears the bar only when both cells are satisfied, because capability without matching governance is the failure mode from Part One.

Then read the whole set for your system. The obligations compound as autonomy grows: archetype 4 assumes you already have archetype 3's scoped tools and traces, and archetype 5 assumes you already have archetype 4's durable identity and decision trail. A gap in a lower archetype is not hidden by strength in a higher one. It is the crack the higher one is built on.
