# Archetype 4: Autonomous, Policy-Guided Agents

**By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [Agent Ecosystem](https://agentecosystem.org)**

The use cases below illustrate the category defined in [Archetype 4: Autonomous, Policy-Guided Agents](../archetype-4-autonomous-policy-guided-agents.md), where an agent runs continuously, monitoring a domain and acting within policy without waiting for a task to be assigned.

Every use case below shares the same structural shift from archetype 3: the agent does not finish. It persists, monitors, decides, acts, observes, and self-corrects, continuously and without a human in the loop for each decision. That persistence forces four requirements that no earlier archetype demands: a durable machine identity, checkpointed state, continuous accountability via decision trails, and policy as the operating system. The examples are ordered from the most common near-term deployments toward more complex autonomous operations.

## 1. Continuous Revenue Optimization Across a Category

A mid-market omnichannel retailer runs thousands of SKUs across channels. Demand shifts by the hour: a competitor drops price on a hero product, a weather event spikes tent sales, a supplier delay constrains inventory. No merchandising team can reprice thousands of products continuously. A revenue optimization agent can.

The agent monitors pricing signals, inventory levels, competitor pricing, demand forecasts, and margin targets. It decides when to adjust pricing, trigger promotions, or flag conditions that require human review. It acts by pushing price changes to the commerce platform and updating the promotion engine. When a change underperforms, such as a price reduction that tanks margin instead of lifting conversion, it observes the result and self-corrects on the next cycle.

Permission tiers bound the blast radius. Small adjustments within ±5% execute autonomously. Larger moves notify merchandising. Changes beyond ±15% or to flagged SKUs queue for approval. Pricing below cost in jurisdictions where that is illegal is a hard block. The agent runs 24/7 on its own schedule; the tiers and circuit breakers are what make that safe.

**Why this fits Archetype 4:** The agent does not wait for a "reprice this SKU" task. It monitors, reasons, and acts continuously within defined policy boundaries, and self-corrects when outcomes diverge from expectations.

## 2. Autonomous Inventory Replenishment

In a composable commerce stack, inventory data lives across warehouse management systems, supplier feeds, demand forecasting services, and the commerce platform. A human buyer cannot continuously watch every SKU across every channel and every store. An autonomous replenishment agent can.

The agent watches inventory positions against demand forecasts and reorder points. When stock-to-sales ratios drop below threshold, it generates and submits purchase orders to approved suppliers through the existing procurement system. It tracks lead times, adjusts safety stock based on observed supplier reliability, and self-corrects when a supplier consistently delivers late or short.

The policy layer governs what the agent may commit. Within a defined spend ceiling per supplier per week, it orders autonomously. Above that ceiling, it escalates. It never orders from unapproved suppliers, never exceeds category budget caps, and pauses all new commitments if the oversight channel goes down. A kill switch halts all pending orders immediately.

**Why this fits Archetype 4:** The agent runs continuously without being asked each time. It holds durable state about supplier patterns, accumulates context over weeks, and makes decisions within permission tiers, rather than being bounded by a single task with a clear end.

## 3. Dynamic Pricing Compliance and Regulatory Monitoring

Retailers operating across multiple jurisdictions face a moving landscape of pricing regulations: minimum advertised price (MAP) policies, below-cost selling restrictions, promotional claim requirements, and region-specific labeling rules. A compliance agent monitors the retailer's live pricing against a continuously updated regulatory rulebook.

The agent perceives every price change pushed to commerce channels, whether by humans, the revenue optimization agent (use case 1), or automated promotion rules. It evaluates each against applicable regulations for the jurisdiction, product category, and channel. Compliant changes pass silently. Non-compliant changes are flagged, and depending on severity, either corrected automatically (a MAP violation is reverted to the minimum) or escalated to legal review.

The agent does not generate prices. It watches what others generate and ensures continuous compliance. Its decision trail is the audit record: what rule applied, what action was taken, what evidence supported the decision. That trail satisfies regulators without requiring a human to review every change.

**Why this fits Archetype 4:** The agent persists and monitors continuously. It does not wait for a compliance check to be triggered. It watches a domain (all pricing changes across channels) and acts within defined regulatory rules, with an auditable decision trail for every action.

## 4. Autonomous Markdown and Clearance Optimization

Every season ends with excess inventory. Markdowns happen too late, too deep, or in the wrong sequence, destroying margin. An autonomous clearance agent manages end-of-season sell-through as a continuous optimization problem rather than a series of manual discount events.

The agent monitors sell-through rates, weeks of cover, warehouse costs, and margin floor constraints for end-of-life and seasonal SKUs. It progressively adjusts markdowns to hit a target sell-through date while maximizing recovered margin. Early in the clearance window, discounts are shallow and targeted. As the deadline approaches and sell-through lags, the agent deepens discounts, but never below the margin floor without approval.

The agent self-corrects: if a 20% markdown on a tent line accelerates sales faster than expected, it pauses further reductions to preserve margin. If the same markdown on a different line produces no movement, it proposes a deeper cut or channel shift. This feedback loop runs faster than weekly planning meetings allow.

**Why this fits Archetype 4:** The agent operates continuously over weeks, accumulating context about what works. It is not assigned a task per SKU. It manages a domain (end-of-season clearance) with self-correcting judgment and permission boundaries.

## 5. Customer Lifecycle Revenue Protection

Customer churn is a lagging indicator. By the time a customer stops buying, the relationship was lost weeks earlier. A retention agent monitors behavioral signals across the commerce stack (declining visit frequency, abandoned carts, lapsed subscriptions, returns spikes, support escalations) and acts before churn materializes.

The agent watches the customer base continuously. When early signals breach a risk threshold, it takes action within its permission scope: triggering a personalized re-engagement sequence, offering a targeted incentive, escalating a high-value account to a human relationship manager, or flagging a systemic issue (a product category generating returns that predict churn).

The permission model is strict. The agent may send pre-approved re-engagement content and standard-tier incentives autonomously. Non-standard offers, anything above a value threshold, or outreach to customers in regulated categories (financial, healthcare) escalate. The agent never contacts customers who have opted out or are in active dispute.

**Why this fits Archetype 4:** The agent monitors a domain (the full customer base) continuously, identifies risk from accumulated behavioral context, and acts within policy tiers. It does not respond to a "check on customer X" task. It detects the condition and initiates the response.

## 6. Continuous Assortment and Catalog Health

A retailer with tens of thousands of SKUs across hundreds of categories has a catalog that degrades daily: products go out of stock permanently, descriptions drift from current specifications, new competitor alternatives appear, category taxonomies become stale, and dead products occupy merchandising real estate.

A catalog health agent monitors the full product catalog continuously. It detects decay signals: a product with zero sales in 90 days, a description contradicted by a supplier spec update, a category where competitor coverage has shifted, a product image that fails current accessibility standards. It acts within scope: archiving dead SKUs, re-queuing stale descriptions for enrichment, flagging taxonomy gaps for merchandising review, and publishing a daily health score per category.

The agent does not enrich content (that is archetype 1 work). It does not triage individual records (archetype 2). It watches the catalog as a whole, detects degradation patterns over time, and takes bounded corrective actions or escalates. Its durable state includes learned patterns: which suppliers' products decay fastest, which categories need more frequent review, which seasons trigger specification changes.

**Why this fits Archetype 4:** The agent persists, accumulates context about catalog patterns over months, and acts on its own schedule. It monitors a domain (the entire catalog) rather than processing individual tasks, and its value comes from the patterns it learns over time that no single-task agent could see.
