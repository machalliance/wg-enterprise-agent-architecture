# Executive Summary

If you read nothing else, read this.

### The problem: one word, many systems

The word "agentic" now covers everything from a workflow that calls a language model to a system that negotiates a contract on your behalf. Vendors know it, and many are "agent washing": rebranding assistants, chatbots, and robotic process automation as agents. Gartner estimates only about 130 of the thousands of self-described agentic AI vendors are real ([Gartner, June 2025](https://www.gartner.com/en/newsroom/press-releases/2025-06-25-gartner-predicts-over-40-percent-of-agentic-ai-projects-will-be-canceled-by-end-of-2027)). For a buyer, the single label makes it impossible to compare products, write requirements, or set safety boundaries. The cost of that lands on the business long before it reaches engineering.

### The stakes, both ways

It is also expensive to get wrong. Gartner predicts that over 40% of agentic AI projects will be canceled by the end of 2027, for three reasons: escalating costs, unclear business value, and inadequate risk controls. Those three share a root cause. They are what happens when a system's capability outruns the governance around it, or when governance is built for a capability that was never there. Matching the two is the difference between a pilot that ships and one that gets written off.

The upside is just as real, and it is already in production. B2B distributor AmerCareRoyal cut purchase-order processing from about eight minutes to under sixty seconds, with 99% of structured orders now flowing through untouched. Retailer Bash ran a shopping agent through Black Friday and saw a 35% lift in conversion and a 40% lift in revenue per visit against a control group. Smart-home brand Wyze more than halved click-to-delivery time and opened a new sales channel at near-zero added cost. These are documented outcomes from MACH Alliance award deployments ([The First Wave of Agentic AI](https://machalliance.org/insights-hub/The-First-Wave-of-Agentic-AI), 2026). The pattern behind the wins is consistent: a narrow, high-value workflow, measured before it was expanded, on composable infrastructure, with governance built in from the start. That is the same balance the cancelled projects got wrong.

### The five archetypes

This book gives you a way to do that matching. It names five **archetypes** of agentic system, from a workflow that uses a model to draft content, through to independent agents negotiating across company lines:

1. **LLM-assisted workflows** draft and transform content inside a fixed process. Fast wins, low risk.
2. **LLM-directed workflows** let the model choose among paths you designed. Adaptive, still contained.
3. **Goal-directed agents** take a bounded goal and work out the steps themselves, then stop.
4. **Autonomous, policy-guided agents** run continuously, monitoring and acting within policy.
5. **Collaborating, self-directed agents** work across organizational lines, including with parties whose interests differ from yours.

They are patterns to compose with. Most real systems use several at once, and each one places its own demands on your architecture (what the system can do) and your policy (what it is allowed to do).

### What to do now

Three moves a leadership team can make now, without a single line of code:

- **Name where your solutions actually sit.** Run the short diagnostic in "Locating your solution." Most enterprises are in archetypes 1 and 2 today, with early goal-directed agents. Knowing which archetypes a given initiative uses tells you what it will demand and what it is worth.
- **Fund governance in step with capability.** The Gartner cancellation reasons are a checklist in disguise. Before approving an agentic initiative, ask whether the risk controls, the cost model, and the business case scale with the autonomy you are buying. If they do not, you are funding a future write-off.
- **Refuse "agentic" as an answer.** Ask a vendor which archetype their system is, and what it demands of you. A precise answer is a sign of a real product. A wave at "agentic" is a sign of agent washing.

The organizations that get value are the ones doing their current archetype well before reaching for the next. The chapters that follow give the business case in Part One and the build detail in Part Two, so both the leadership team and the people who build have the same map.
