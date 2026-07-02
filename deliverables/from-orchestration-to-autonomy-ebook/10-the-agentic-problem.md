# Part One · The Model

## The "agentic" problem: one word, many systems

Watch two vendors present at the same conference. The first shows a workflow that uses a language model to route support tickets and calls it agentic. The second shows a system that plans across domains, delegates to specialized sub-agents, and recovers when a step fails, and calls it agentic too. The word is doing no work. It describes both a routing rule with a model attached and a system that can act on the world with little supervision.

For a buyer, that is a real cost. You cannot compare two products when the label that is supposed to distinguish them applies equally to both. You cannot write a requirement around a term that means seven things. You cannot set a safety boundary when the vendor's definition of the capability and yours do not overlap.

The confusion is not accidental, and analysts have named it. Gartner calls it "agent washing": vendors rebranding assistants, chatbots, and robotic process automation as agents without the underlying capability. Of the thousands of vendors describing themselves as agentic, Gartner estimates only about 130 are real ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). When the label is that diluted, the burden of telling capability apart falls entirely on the buyer.

The ambiguity shows up as technical debt before anyone writes code. Requirements get written against a fuzzy target, so the system that gets built solves a different problem than the one that was scoped. Security teams size their controls for the wrong risk, either over-governing a content generator or under-governing a system that can move money. Procurement approves a pilot on one understanding of "agent" and inherits the operational burden of another.

The fix is a shared vocabulary with enough resolution to name the differences that matter, rather than a stricter definition of a single overloaded word. That is what the rest of Part One builds: a line that marks where agency begins, two dimensions that scale with autonomy, and five archetypes that give teams a precise label for what they are actually building.
