# Part Three · Putting It Together

## One domain, all five: the procurement ladder

The archetypes are easiest to feel when you hold the domain fixed and let the autonomy vary. Meridian Outfitters' procurement and replenishment does this well, because the same business need shows up at every point along the range, and each step adds exactly one thing to the one before it. Where Part Two followed the spring line from content to sourcing, this ladder holds a single job, keeping Meridian's shelves stocked, and turns the autonomy dial up one notch at a time.

**1. LLM-assisted.** A model extracts purchase-order data from incoming supplier emails. Vendor name, SKUs, quantities, dates. The workflow decides what to do with the extracted fields. The model only reads and structures. This is language work inside a fixed path.

**2. LLM-directed.** A model classifies and routes requisitions by category and spend threshold. Office supplies under a limit go straight through; capital expenditure routes to finance; anything ambiguous goes to a buyer. The model picks the route. People drew the routes.

**3. Goal-directed.** An agent takes "restock store 142 for the weekend promo" and drafts the purchase orders. It checks current stock, reads the promo plan, works out quantities, and produces the orders, then stops. The plan is the agent's; the goal, the tools, and the stop are yours.

**4. Autonomous, policy-guided.** An agent watches inventory and demand signals and reorders continuously within policy, without being asked each time. It runs on its own schedule, holds durable state about supplier lead times and seasonal patterns, and self-corrects when an order arrives late. This is archetype 4's revenue optimization agent applied to replenishment, still entirely inside one retailer.

**5. Collaborating, self-directed.** A buyer's procurement agent runs an RFQ against several suppliers' selling agents, trading counteroffers on price, quantity, and lead time, and settles the deal within its mandate. The suppliers' agents optimize for the other side. No shared orchestrator sits above them.

Notice where the real break is. Steps 1 through 4 are all things one organization's systems do to its own data, under its own control, with a single operator who can answer for the outcome. Step 5 is the first time the work becomes something that multiple organizations' agents do with each other, across a boundary no one party owns. Everything before it scales autonomy inside your walls. The last step scales it past them, which is why it carries a class of requirement, cross-organization identity, protocol, and arbitration, that none of the earlier steps need.

The ladder is also a reminder that the archetypes describe the same underlying capability at different settings of one dial: how much the system directs itself, and how far that self-direction reaches. You do not have to climb it. Most procurement organizations will run steps 1 through 3 for years and be right to. But seeing the whole ladder in one domain makes the boundaries concrete, and the boundaries are what the vocabulary is for.
