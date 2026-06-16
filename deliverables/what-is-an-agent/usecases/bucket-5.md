# Bucket 5: Collaborating, Self-Directed Agents

**By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [Agent Ecosystem](https://agentecosystem.org)**

The use cases below illustrate the category defined in [Bucket 5: Collaborating, Self-Directed Agents](../bucket-5-collaborating-self-directed-agents.md), where independently built agents from different organizations coordinate across boundaries with no shared orchestrator.

Every use case below crosses a boundary the earlier buckets never had to. There is no shared orchestrator and no single operator who controls the whole system — each organization runs its own agent, under its own policy, and the agents meet only through verified, mediated exchange. The examples are ordered along the continuum the bucket 5 article describes: from **coordinated agents with aligned intent** at the top, toward **self-interested agents with opposed intent** at the end. As you move down that continuum, every assumption you could leave implicit inside one organization has to become an explicit, verifiable protocol.

## 1. Multi-Vendor Composable Stack Coordination

A composable commerce architecture is, by definition, many vendors: a commerce engine, an OMS, a CMS or DXP, a search provider, a payment provider, a CDP. In bucket 4, each of those might run its own autonomous agent inside its own domain. Bucket 5 is what happens when those agents coordinate *directly* on a shared objective without a central orchestrator wiring every interaction by hand.

Consider a "campaign launch readiness" objective ahead of a major sale. The CMS vendor's agent confirms content is published and localized, the search vendor's agent confirms the new collection is indexed and boosted, the commerce engine's agent confirms pricing and promotions are live, and the OMS vendor's agent confirms inventory and fulfillment capacity. Each agent was built by a different team on a different stack. They share intent — a successful launch — but they do not share a runtime. They discover each other's capabilities through a directory and exchange status and requests over a common protocol rather than through a brittle web of point-to-point integrations.

**Why this fits Bucket 5:** Independently built agents collaborate toward a shared objective across vendor boundaries, with no single party orchestrating them. Intent is aligned, so trust can be relatively lightweight — but the coordination is still cross-organizational and protocol-mediated.

## 2. Brand and Retailer Joint Promotion Planning

A brand and the retailers that carry it both want a successful co-marketing push, but their interests are not identical. The brand wants prominent placement and protected pricing; the retailer wants margin and inventory turns. Today this is negotiated in spreadsheets, emails, and calls over weeks.

A brand's planning agent and a retailer's merchandising agent can collaborate directly: proposing a promotion window, co-op budget split, featured SKUs, placement, and minimum advertised price. They iterate on a joint plan, each consulting its own organization's policy privately, until they converge on terms both can commit to — or escalate the gaps to their respective humans. The plan that results is a shared artifact, but neither agent ever sees the other's internal targets or constraints.

**Why this fits Bucket 5:** Two organizations' agents collaborate on a shared outcome while optimizing for partly opposed interests. It sits in the middle of the continuum — cooperative framing, but with enough divergence that mandates, information minimization, and verifiable agreement start to matter.

## 3. Cross-Organization Procurement RFQ and Negotiation

This is the running example from the bucket 5 article. A retailer's procurement agent must source a seasonal product and negotiate terms with several independent suppliers' selling agents, none of which it controls.

The procurement agent discovers candidate supplier agents through a directory rather than a hardcoded endpoint list, verifies each counterparty's identity and claims before exchanging anything of value, issues an RFQ, and trades counteroffers on price, quantity, lead time, and delivery terms. Each supplier agent is optimizing for the *other* side of the deal. The procurement agent settles on terms within its mandate, escalates anything beyond it, and records a decision trail it can defend even though it can only see its own half of the exchange. A counterparty can stall, misrepresent, or refuse, so "walk away cleanly and fall back to the next-best supplier" is a first-class outcome, not an error.

**Why this fits Bucket 5:** Agents from different organizations with genuinely opposed interests negotiate a binding commitment with no shared orchestrator. Verified identity, a shared negotiation protocol, private mandates, and non-repudiable records stop being nice-to-haves and become the foundation.

## 4. Dynamic Supplier Discovery and Sourcing

A primary supplier's agent reports it cannot fulfill an urgent reorder — a factory delay, a raw-material shortage. Inside one organization you cannot pre-integrate every alternative supplier on earth, so the usual answer is a human scrambling to find a substitute.

A sourcing agent can instead query an agent directory for counterparties whose published, machine-readable capability descriptions match the requirement — the right product category, certifications, region, and lead time — and decide which to engage. Discovery is filtered by policy: finding an agent is not the same as being allowed to transact with it, so candidates still pass identity verification and an approved-counterparty check before any RFQ goes out. The capability description functions as a contract the agent can reason about, not a PDF integration guide a human has to read.

**Why this fits Bucket 5:** The agent finds and engages counterparties it never pre-integrated, using open discovery and verifiable capability descriptions. Dynamic discovery across organizational lines is something none of the earlier buckets require.

## 5. Cross-Organization Logistics and Dispute Resolution

A shipment is damaged in transit. Resolving it touches a retailer, a carrier, and sometimes a marketplace or insurer — separate organizations, each with its own systems and its own record of what happened.

A retailer's fulfillment agent can negotiate a remedy directly with a carrier's claims agent: rerouting, expediting a replacement, or settling a claim, within the authority each side has been granted. The hard part is accountability. Each party sees only its own half of the exchange, so the agents rely on signed, non-repudiable messages and shared correlation identifiers, so that the retailer's, carrier's, and customer's records of the same remedy can later be lined up. When the two agents reach an outcome a human disputes, the correlated trails feed a pre-agreed arbitration path rather than a stalemate of two partial logs.

**Why this fits Bucket 5:** Agents from multiple organizations jointly produce an outcome no single one of them fully controls or observes. It foregrounds the accountability problem — non-repudiable exchange, correlatable trails, and dispute resolution when no one sees the whole picture.

## 6. Consumer Shopping Agent in an Agent Marketplace

The far end of the continuum, and the long-term vision behind a true marketplace of agents: a consumer's personal shopping agent transacting on their behalf against retailers' selling agents.

The buyer's agent holds a mandate — budget, preferences, must-have specs, a reservation price — and engages multiple retailers' selling agents to find and purchase the best fit. Each selling agent is unambiguously self-interested, optimizing for the merchant's margin and conversion, and may probe for the buyer's willingness to pay. The buyer's agent reveals only what each turn requires, never its internal targets or urgency, runs the interaction within round and time budgets, and down-weights counterparties that repeatedly stall or renege. A commitment is only valid if both identities are verified and the terms fall inside the buyer's mandate; anything else is void by protocol, not litigated after the fact.

**Why this fits Bucket 5:** Two agents representing parties with directly opposed commercial interests transact across organizational lines with no shared orchestrator and no mutual trust assumed. This is the end of the continuum where the full apparatus — verified identity, secure messaging, private mandates, and adversarial-counterparty defenses — is non-negotiable.
