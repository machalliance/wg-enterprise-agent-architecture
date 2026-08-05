# Executive Summary

If you are building in the agent ecosystem right now, you have already hit the problem this book exists to fix: nobody agrees on what "agentic" means. If you read nothing else, read this.

### The problem: one word, many systems

The word "agentic" now covers everything from a workflow that calls a language model to a system that negotiates a contract on your behalf. Vendors know it, and many are "agent washing": relabeling assistants, chatbots, and robotic process automation as agents. Of the thousands of vendors that call themselves agentic, Gartner counts only about 130 as the real thing ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). One label stretched over all of it leaves a buyer with no way to compare products, write requirements, or set safety limits. That confusion turns into technical debt before anyone writes a line of code.

### The stakes, both ways

Getting it wrong is expensive. Gartner predicts that over 40% of agentic AI projects will be canceled by the end of 2027, for three reasons: rising costs, unclear business value, and weak risk controls. All three come from the same place. Either what the system can do has outrun the rules around it, or the rules were built for a capability that was never there. Matching the two is what separates a pilot that ships from one that gets written off.

The upside is just as real, and already in production. B2B distributor AmerCareRoyal cut purchase-order processing from about eight minutes to under sixty seconds, and now sends 99% of structured orders through untouched. Retailer Bash ran a shopping agent through Black Friday and saw a 35% lift in conversion and a 40% lift in revenue per visit against a control group. Smart-home brand Wyze more than halved click-to-delivery time and opened a new sales channel at almost no added cost. General Motors automated 90% of metadata creation and made compliance checks 70% faster for more than 16,000 users. CarParts.com runs more than 20 agents in production and reports over $500,000 in savings inside six to eight months. These are measured results from MACH Alliance Agentic Achievement Award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). One pattern sits behind all five wins. Each team took a narrow, high-value workflow first and measured it before expanding anything, built on composable and connected infrastructure, and put governance in from the start. That is the same balance the cancelled projects got wrong.

### The five archetypes

This book gives you a way to do that matching. It names five **archetypes** of agentic system, from a workflow that uses a model to draft content, through to independent agents negotiating across company lines:

1. **LLM-assisted workflows** (*assisted*) draft and transform content inside a fixed process. Fast wins, low risk.
2. **LLM-directed workflows** (*directed*) let the model choose among paths you designed. Adaptive, still contained.
3. **Goal-directed agents** (*goal-directed*) take a bounded goal and work out the steps themselves, then stop.
4. **Autonomous, policy-guided agents** (*autonomous*) run continuously, watching and acting within policy.
5. **Collaborating, self-directed agents** (*collaborating*) work across organizational lines, including with parties whose interests differ from yours.

None of these is a prize for outgrowing the one before it. A content-generation workflow is the right design for a lot of high-volume language work, and plenty of production systems should never move past it. They are patterns you combine, and most real systems use several at once. Each one makes its own demands on your architecture (what the system can do) and your policy (what it is allowed to do).

### What to do now

Three moves a leadership team can make now, without a single line of code:

- **Name where your solutions actually sit.** Most solutions in production today sit in archetypes 1 and 2, with early goal-directed agents appearing. Knowing which archetypes an initiative uses tells you what it will demand and what it is worth. The one-initiative worksheet in Part Three turns that into an afternoon's work, with no code.
- **Fund governance in step with capability.** The Gartner cancellation reasons are a checklist in disguise. Before approving an agentic initiative, ask whether the risk controls, the cost model, and the business case scale with the autonomy you are buying. If they do not, you are funding a future write-off.
- **Refuse "agentic" as an answer.** Ask a vendor which archetype their system is, and what it demands of you. A precise answer is a sign of a real product. A wave at "agentic" is a sign of agent washing.

### A note on terms

We use *archetype* rather than *level* or *maturity stage* on purpose. A level implies a ladder with a top. An archetype is a recurring pattern with its own best-fit problems. Nobody is at an archetype; a solution uses them. So carry two questions into the rest of the book. Does this work need an agent at all? And if it does, which archetypes does the solution need, and are we resourced for each one?

The organizations that get value are the ones that do the archetype in front of them well before reaching for the next. Part One gives the framework in business terms; stop there and you have what you need to fund and scope. Part Two goes deep on each archetype for the people who build. Part Three covers the concerns that cut across every archetype, and gathers the readiness requirements into checklists you can hold your own work against. The leadership team and the people who build work from the same map. This is a working framework, shaped in the open, and it gets sharper the more people build against it.
