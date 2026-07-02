## A composition worked example

The procurement ladder shows the archetypes as separate settings of one dial. Real deployments are rarely so tidy. A single production system usually runs several archetypes at once, each governing a different component. Here is one worked through end to end, so the readiness obligations land where they actually belong.

### The system

Meridian runs an **autonomous merchandising agent** that keeps its spring-line category priced and stocked. It watches demand, competitor pricing, and inventory, and it acts continuously within policy. That much is archetype 4. But trace a single day of its operation and three other archetypes are doing work underneath it.

**The continuous loop is archetype 4.** The agent runs on its own schedule, holds durable state about what has worked, reprices within permission tiers, and self-corrects when a change underperforms. This component needs a durable machine identity, checkpointed state, circuit breakers, and a tamper-evident decision trail. These are the archetype 4 requirements, and they are the ones most teams remember.

**The reprice-or-review decision is archetype 2.** Before the agent commits a price change, a model-driven step decides whether the change is routine (proceed), sensitive (notify merchandising), or risky (queue for human approval). That is a routing decision among paths the team designed. This component needs an explicit route set, a confidence threshold, a defined fallback, and a per-decision trace. Governing the continuous loop does not govern this. A miscalibrated router will wave through a change that should have gone to review.

**The merchandising note is archetype 1.** When the agent makes a change, it generates a short explanation for the merchandising team: why the price moved, what signal triggered it. This is content generation inside a fixed path. This component needs prompt versioning, output validation, and a claim-handling rule, because a generated note can still assert something the underlying data does not support ("competitor stock-out confirmed") and mislead a human who trusts it.

**Sourcing a shortfall is archetype 5, when it happens.** If inventory drops below a threshold the agent cannot fix internally, it initiates an RFQ to external supplier agents to source more. The moment it crosses that boundary, it inherits the full archetype 5 obligation: cross-organization identity verification, a negotiation protocol, a mandate that caps what it may commit to, and non-repudiable records. This component is dormant most days and the most consequential when it wakes.

### Why naming the blend matters

If you reason about this system as "our archetype 4 pricing agent," you will build the identity, state, and circuit-breaker machinery and feel covered. You will be exposed in three places. The router can misroute without ever tripping a circuit breaker. The note can publish an unsupported claim that no pricing control inspects. The sourcing path can commit you to an external deal that your internal policy tiers were never written to bound.

The readiness obligation of a composed system is the union of the obligations of every archetype in it, applied per component. The merchandising agent above must satisfy the archetype 1 checklist for its note generator, the archetype 2 checklist for its router, the archetype 4 checklist for its loop, and the archetype 5 checklist for its sourcing path. Miss one and you have governed the loudest component and left the quiet ones ungoverned.

This is the practical payoff of the whole model. Decomposing a system into archetypes is not taxonomy for its own sake. It is how you find every place the system can act, name what each place demands, and make sure your investment in policy keeps pace with your reach in architecture, one component at a time.
