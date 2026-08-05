# Executive Summary

If you are building in the agent ecosystem right now, you have already hit the problem this book exists to fix: nobody agrees on what "agentic" means. If you read nothing else, read this.

### The problem: one word, many systems

The word "agentic" now covers everything from a workflow that calls a language model to a system that negotiates a contract on your behalf. Vendors know it, and many are "agent washing": rebranding assistants, chatbots, and robotic process automation as agents. Gartner estimates only about 130 of the thousands of self-described agentic AI vendors are real ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). For a buyer, the single label makes it impossible to compare products, write requirements, or set safety boundaries — and that confusion becomes technical debt before anyone writes a line of code.

### The stakes, both ways

It is also expensive to get wrong. Gartner predicts that over 40% of agentic AI projects will be canceled by the end of 2027, for three reasons: escalating costs, unclear business value, and inadequate risk controls. Those three share a root cause: a system's capability outrunning the governance around it, or governance built for a capability that was never there. Matching the two is the difference between a pilot that ships and one that gets written off.

The upside is just as real, and already in production. B2B distributor AmerCareRoyal cut purchase-order processing from about eight minutes to under sixty seconds, with 99% of structured orders now flowing through untouched. Retailer Bash ran a shopping agent through Black Friday and saw a 35% lift in conversion and a 40% lift in revenue per visit against a control group. Smart-home brand Wyze more than halved click-to-delivery time and opened a new sales channel at near-zero added cost. General Motors automated 90% of metadata creation and made compliance validation 70% faster for more than 16,000 users. CarParts.com runs more than 20 agents in production and reports over $500,000 in savings inside six to eight months. These are documented outcomes from MACH Alliance Agentic Achievement Award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). One pattern runs behind all five wins: a narrow, high-value workflow taken first and measured before anything was expanded, on composable and connected infrastructure, with governance built in from the start. It is the same balance the cancelled projects got wrong.

### The five archetypes

This book gives you a way to do that matching. It names five **archetypes** of agentic system, from a workflow that uses a model to draft content, through to independent agents negotiating across company lines:

1. **LLM-assisted workflows** (*assisted*) draft and transform content inside a fixed process. Fast wins, low risk.
2. **LLM-directed workflows** (*directed*) let the model choose among paths you designed. Adaptive, still contained.
3. **Goal-directed agents** (*goal-directed*) take a bounded goal and work out the steps themselves, then stop.
4. **Autonomous, policy-guided agents** (*autonomous*) run continuously, monitoring and acting within policy.
5. **Collaborating, self-directed agents** (*collaborating*) work across organizational lines, including with parties whose interests differ from yours.

None of these is a trophy for outgrowing the one before it: a content-generation workflow is the right architecture for a lot of high-volume language work, and plenty of production systems should never move past it. They are patterns to compose with — most real systems use several at once — and each places its own demands on your architecture (what the system can do) and your policy (what it is allowed to do).

### What to do now

Three moves a leadership team can make now, without a single line of code:

- **Name where your solutions actually sit.** Most solutions in production today sit in archetypes 1 and 2, with early goal-directed agents appearing. Knowing which archetypes a given initiative uses tells you what it will demand and what it is worth, and the one-initiative worksheet in Part Three turns that into an afternoon's work with no code.
- **Fund governance in step with capability.** The Gartner cancellation reasons are a checklist in disguise. Before approving an agentic initiative, ask whether the risk controls, the cost model, and the business case scale with the autonomy you are buying. If they do not, you are funding a future write-off.
- **Refuse "agentic" as an answer.** Ask a vendor which archetype their system is, and what it demands of you. A precise answer is a sign of a real product. A wave at "agentic" is a sign of agent washing.

### A note on terms

We use *archetype* rather than *level* or *maturity stage* on purpose. A level implies a ladder with a top. An archetype is a recurring pattern with its own best-fit problems. Nobody is at an archetype; a solution uses them. So there are two questions to carry into the rest of the book: does this work need an agent at all, and if it does, which archetypes does the solution need and are we resourced for each one?

The organizations that get value are the ones doing the archetype in front of them well before reaching for the next. Part One gives the model in business terms; stop there and you have what you need to fund and scope. Part Two goes deep on each archetype for the people who build. Part Three covers the concerns that cut across every archetype and consolidates the readiness requirements into checklists you can hold your own position against. The leadership team and the people who build work from the same map. This is a working framework, shaped in the open, and it gets sharper the more people build against it.
