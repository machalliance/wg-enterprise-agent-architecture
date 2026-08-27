# When Your Agent Negotiates Against Someone Else's

**What four supplier agents and one buyer taught us about transacting across a trust boundary nobody owns.**

Your company already lets software spend money with nobody watching. EDI purchase orders and automatic replenishment commit real budget every day, on terms somebody negotiated once and wrote down as rules. That works because the terms are fixed.

Autonomous commerce changes that. The terms stop being fixed. An agent acting for you settles price and delivery in the moment, against an agent acting for a company that wants the opposite of what you want. Nobody encoded the outcome in advance, because there is no outcome to encode.

When a negotiating agent gets this wrong, nothing looks wrong. The messages verify. The terms sit inside policy, the audit trail is complete, the counterparty is who it claimed to be, and your company is committed to a worse deal than it could have had. You find out at the quarterly spend review, if at all.

As part of the MACH Alliance [Enterprise Agent Architecture working group](https://github.com/machalliance/wg-enterprise-agent-architecture), we built a prototype of that situation, to find out where it breaks.

## The scenario

[Meridian Crossing](https://github.com/machalliance/wg-enterprise-agent-architecture/tree/main/deliverables/projects/archetype-5-meridian-crossing) is a retailer 100 units short of a three-season tent it needs on shelf. Its buying agent may pay up to $94 a unit, and must not let any supplier learn that number. Four supplier agents, each run by a different company, can cover the order:

| Supplier | How it plays | Where it lands |
| --- | --- | --- |
| Summit | Cooperative. Concedes steadily under pressure | Will go as low as $86, the cheapest in the field |
| Cascade | Competitive. Opens below Summit and drops faster | Stops at $89, so Summit beats it in a long fight |
| Alpine | Firm. Barely moves | Stops at $95, above what the buyer may pay |
| RidgeLine | Adversarial. Best prices in the directory | Its credentials don't check out |

A deal runs in six steps. The buyer searches a directory for anyone selling the product. It verifies each candidate's credentials. It opens a separate negotiation with every supplier that passes, all at the same time. It compares what comes back. It commits to one. Then it pays. Six questions turned out to matter, and they're the ones we'd now put to any system where an agent transacts on your behalf with an agent that doesn't work for you.

Everything below runs on published standards rather than plumbing of our own:

| Layer | The job | What we used |
| --- | --- | --- |
| Transport | Move a message between two companies' agents | [A2A](https://a2a-protocol.org/latest/specification/) v1.0, over its HTTP/JSON-RPC binding. Each supplier declares how it is reachable in its own agent card, and the buyer dials whatever that card says. |
| Discovery | Find suppliers without naming them in our code | [AGNTCY Agent Directory](https://dir.agntcy.org/latest/dir/dir-overview/), listings in [OASF](https://github.com/agntcy/oasf) format |
| Identity | Prove an agent may sign for its employer | [W3C DIDs](https://www.w3.org/TR/did-core/) and [Verifiable Credentials](https://www.w3.org/TR/vc-data-model/) |
| Negotiation | Offer, counter, accept, walk away | [A2CN v0.2.0](https://github.com/A2CN-protocol/A2CN), a draft marked not for production. We built against its published schemas and tested against a saved example rather than claiming interoperability we haven't proven. |
| Payment | Move the money | [Stripe USDC](https://docs.stripe.com/payments/stablecoin-payments) on [Tempo](https://tempo.xyz/) |

Reading the transport off the counterparty's card matters more than it sounds, because you will never get to dictate how another company's agent is reachable. Our buyer resolves it from the card in one place, and nothing above that knows which binding is in use — so adding a second one is a card entry plus a client factory, with no change to any negotiation code. Every agent here declares the same HTTP/JSON-RPC binding, which is A2A's "always works" one, so that seam is a design property rather than something we exercised.

## 1. Who is this counterparty, really?

Suppliers advertise themselves by publishing a listing to the directory: product, quantity, lead time, and the web address where their agent can be reached. The buyer searches, filters, and starts calling those addresses. Which means it is about to make outbound requests to a URL a stranger wrote. Point that URL at an internal service and the buyer will fetch whatever the attacker wants fetched. Message signing does not save you here, because a signature proves who wrote a message and says nothing about where a link leads. Ours checks every address against an approved list before calling it. We ended up applying the same suspicion to the supplier's prose, since that text reaches a model and can carry a hidden instruction.

Then credentials. Three checks: the supplier's identifier resolves to a real cryptographic key, its credentials are signed by an issuer we trust rather than merely asserted, and it holds a credential saying this agent may commit its employer. Summit, Cascade and Alpine pass. RidgeLine has the best prices in the directory and never receives a single message, because its credentials fail.

**Requirement to steal:** an agent must refuse to transact with a counterparty it cannot cryptographically verify, and refuse to call an address it cannot verify separately.

## 2. What is my agent allowed to commit me to?

The buyer holds a private mandate: what it will pay at each volume, the $94 ceiling, and a total budget shared across every deal it has running. Suppliers see none of it. Offers inside the mandate it accepts on its own. Offers outside it wait for a person. A kill switch cuts every live negotiation and cancels payment permission on anything not yet closed.

Keeping the ceiling secret is harder than it sounds, because the agent explains its reasoning in prose and the number can ride out inside a sentence. A test fails the build if any private figure appears in an outgoing message or a prompt, and it compares numeric values rather than text, because a model writes money however it likes. We caught the same figure escaping as `9.168k`, and once in full-width digits. If you can't fail a build over your rules, you don't have rules.

**Requirement to steal:** the limits on an agent's authority belong in a test that breaks the build, not in a policy document.

## 3. When is my agent allowed to commit?

Knowing what your agent may agree to tells you nothing about when it may agree.

Our buyer negotiates with Summit, Cascade and Alpine simultaneously, the way a real buyer would. Take out one piece of the code and those three conversations become a race, and whoever replies first gets the order. Not the cheapest. The fastest. Nothing crashes and no alert fires, because from the system's point of view a valid deal closed with a verified supplier at a price inside policy. The company simply paid more, and the reason was network timing.

The missing piece is a rule: say yes to nobody until everybody has given a final answer. Then the cheapest acceptable offer wins, the rest are turned down, and no human is involved. A person is called only when no offer is acceptable. In our standard run that rule is what lets the buyer see Cascade at $91.68 next to Summit's final $92.24 and take the cheaper one, instead of banking whichever arrived first. The comparison uses public information only, so a private number is never the reason a supplier won.

A rule like that can't negotiate, though. It learns each supplier's position only at the end, once that conversation has stopped moving. So the buyer also keeps a running list of the quotes it has received, visible across its own three conversations, and pushes back with a rival's standing price while there are still rounds left to matter. Those quotes were sent to us and stay in our own memory, so nothing crosses a company boundary and neither supplier ever learns what the other said.

**Requirement to steal:** concurrent agents need an explicit commitment point, or latency decides your commercial outcomes.

## 4. What happens when interests conflict?

Both sides run the same rulebook covering whose turn it is and which moves are legal, so a counter after the deal closed is refused by the sender's own code and again by the receiver.

Underneath that, agents bid against themselves. A counter has to stay under two limits: your own ceiling, and the price the other side has already offered. Miss the second and your agent offers more than it was being asked for. We had to enforce it in reverse too, so a supplier never accepts less than the buyer has already put on the table.

Early on, with no competitive supplier in the field, the buyer had nothing to push with. It settled at an average of $91.88 against its $94 ceiling, and paid the full ceiling in 3 of 20 runs. It was not negotiating badly; it had no alternative to point at. Later, once suppliers reasoned with a model, five identical runs settled at exactly the supplier's floor every time, because our suppliers had no reason to ever walk away and pressing them therefore cost the buyer nothing. Adding a random chance of walking away would have produced variety with no reason behind it, so we gave each supplier private circumstances instead: how badly it needs this deal, whether another buyer is waiting, how close quarter end is.

**Requirement to steal:** a negotiating agent needs a credible alternative and a credible ability to refuse. Both are architecture, not prompt text.

## 5. Can either side prove what was agreed?

There is no shared database and no shared log. Each company keeps a signed record of its own half of every conversation, chained so a later edit is obvious. Line the buyer's and the supplier's records up side by side and the deal is provable, because the offer and the acceptance carry identical terms. We write an audit record whenever a negotiation ends, walk-aways and timeouts included, since those are the ones an auditor asks about.

Agreeing is not paying, either. When a deal commits, the buyer opens a Stripe payment and sends USDC to the address it gets back. The same budget that limits what the agent may agree to limits what it may spend, and above $9,100 nothing moves until a person approves. That threshold is deliberately awkward: our standard run settles at $9,168, so it always stops for a human, while across model-driven runs between 53% and 64% stopped and the rest paid themselves.

**Requirement to steal:** each side must be able to prove the deal from its own records alone, with no shared system either party controls.

## 6. How would you know any of this works?

Once a model is doing the reasoning, identical inputs produce different outputs, so a single run tells you almost nothing. We run the real negotiation code many times over and read the distribution of outcomes.

That is the only reason we found the $91.88 average and the three runs at the ceiling. Watch one negotiation and you see a settlement inside policy, which looks like success. Watch twenty and you see an agent with no leverage, quietly paying the most it was allowed to pay. If your evidence is a demo you watched, you don't have evidence.

## Where this goes next

Meridian Crossing is open source as the working group's Archetype 5 deliverable, covering collaborating, self-directed agents. We'll walk through the code at the Agent Build Lab at [MACH X in Amsterdam](https://mach-x.machalliance.org/amsterdam/), September 29 to 30.
