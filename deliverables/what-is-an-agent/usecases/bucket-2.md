# Bucket 2: LLM-Directed Workflows

**By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [Agent Ecosystem](https://agentecosystem.org)**

## 1. Intelligent Ticket Routing Across a MACH Stack

A support ticket comes in: “My order says delivered, but I never received it, and the tracking page is broken.”

In a traditional workflow, routing might depend on tags, keywords, or manually selected categories. In an LLM-directed workflow, the system can evaluate the ticket and choose the right path inside a predefined set of options.

For example, the LLM may route the ticket to:

1. Delivery investigation.
2. Payment issue.
3. Product defect.
4. Website bug.
5. Fraud review.
6. High-priority escalation.

The important part is that the available paths are designed by the organization. The LLM does not invent a new process. It chooses from known branches based on the context.

This is a good bucket 2 example because it introduces model-driven decision-making while keeping operational boundaries tight.

**Why this fits Bucket 2:** The LLM decides which predefined workflow path to take.

## 2. Product Data Quality Triage

In a MACH commerce setup, product data may enter from suppliers, ERP systems, PIM tools, marketplaces, spreadsheets, and enrichment providers. Data quality problems are common: missing attributes, inconsistent units, vague descriptions, duplicate products, invalid categories, or claims that require review.

An LLM-directed workflow can inspect a product record and choose the appropriate remediation path.

For example:

1. Missing required attributes go to supplier correction.
2. Weak descriptions go to enrichment.
3. Regulated claims go to legal review.
4. Duplicate-looking products go to merge review.
5. Category ambiguity goes to taxonomy review.
6. Complete records go to publishing.

The LLM is not freely managing the product catalog. It is making a routing decision within a designed governance process.

**Why this fits Bucket 2:** The LLM evaluates context and decides which existing process should handle the product record.

## 3. Adaptive Content Review Workflow

A CMS or digital experience platform may need different review flows depending on the content type, channel, region, brand, and risk level.

An LLM-directed workflow can evaluate a content item and decide which review path it should follow.

For example:

1. Low-risk blog updates go to editorial review.
2. Product claims go to legal review.
3. Medical, financial, or sustainability claims go to compliance.
4. Campaign copy for a regulated market goes to regional approval.
5. Accessibility issues go to UX review.
6. Translation issues go to local market review.

This avoids forcing every content item through the same heavy approval chain, while still applying more governance where the risk is higher.

**Why this fits Bucket 2:** The LLM does not publish the content. It decides the appropriate review route inside a predefined workflow.

## 4. Don’t Burn Tokens on What a Script Can Do

The idea is that not every step in an “agentic” system should be performed by an LLM. Some work is better handled by scripts, rules, APIs, or deterministic services. The LLM’s role is to decide which path or tool is appropriate, not to perform every operation itself.

For example, in a commerce migration or content operation:

1. Use deterministic scripts for validation, formatting, ID mapping, and schema checks.
2. Use APIs for fetching product, order, or content data.
3. Use rules for known business constraints.
4. Use the LLM only when judgment, ambiguity, language understanding, or routing is needed.

This creates a more efficient and more reliable system. The LLM provides decision-making where it adds value, while deterministic components handle repeatable work cheaply and predictably.

**Why this fits Bucket 2:** The LLM chooses among designed paths or tools, but the actual execution remains bounded and deterministic where possible.

## 5. Commerce Exception Handling

Many commerce operations involve exceptions: failed payments, address mismatches, inventory conflicts, suspicious orders, shipment delays, or return policy edge cases.

An LLM-directed workflow can analyze the exception context and choose the correct operational path.

For example:

1. Payment failure goes to payment retry flow.
2. Address mismatch goes to customer confirmation.
3. High-value suspicious order goes to fraud review.
4. Out-of-stock item goes to substitution or cancellation flow.
5. Delayed shipment goes to proactive customer communication.
6. Unclear cases go to human escalation.

This does not require a fully autonomous agent. The company designs the possible exception-handling paths. The LLM helps choose the most appropriate one based on messy, real-world context.

**Why this fits Bucket 2:** The model makes a routing decision, but only within a controlled operational framework.

## 6. Iterative Product Description Quality Loop

Not every bucket 2 use case is a routing decision. Bucket 1 uses an LLM to draft product copy once, then hands it to a human or a deterministic validator. A bucket 2 version of the same workflow adds a model-judged refinement loop on top of that single generation step.

A generator model drafts a product description from the approved attribute package. A separate evaluator model scores the draft against a fixed rubric — brand voice, required attributes, reading level, SEO completeness — and returns structured feedback. If the draft passes, the workflow ships it or queues it for light review. If it fails, the feedback returns to the generator for a revision and the loop runs again, up to a fixed maximum number of attempts. If the copy still falls short on the last attempt, the record escalates to a human instead of looping indefinitely.

This is not routing. The model is not choosing among predefined branches; it is deciding whether the output is good enough to stop. That pass-fail-revise judgment is a model-made decision that directs control flow — the bucket 2 agency line — but the shape is a bounded loop rather than a branch. The rubric, the revision cap, and the escalation fallback are all human-designed, which is what keeps it inside bucket 2.

**Why this fits Bucket 2:** The model decides whether to revise or ship, not which route to take. The agency is loop-continuation inside a human-designed, bounded structure.
