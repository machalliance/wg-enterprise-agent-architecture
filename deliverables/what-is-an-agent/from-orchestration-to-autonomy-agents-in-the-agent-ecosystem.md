# From Orchestration to Autonomy: Agents in the Agent Ecosystem
*The industry throws "agentic" at everything. Here's a practical progression model for those who build, not debate.*

**By the [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) of the [Agent Ecosystem](https://agentecosystem.org)**

If you're building in the Agent Ecosystem right now, you've already hit the problem: nobody agrees on what "agentic" means. A vendor calls their LLM-powered routing workflow agentic. Another uses the same word for a system that plans across domains, delegates to specialized sub-agents, and self-corrects when things break. Both on stage at the same conference. Same word. Fundamentally different systems.

**This is more than a semantic debate. It's a design problem.** When one term covers everything from an intelligent workflow to a fully autonomous system negotiating on your behalf, you can't write requirements, evaluate vendors, or set safety boundaries. The ambiguity becomes technical debt before anyone writes a line of code.

The [Agent Ecosystem](https://agentecosystem.org) we're building spans a wide range — from LLM-assisted workflows that lean on a model for content generation, through to autonomous systems working collaboratively with each other and with humans. Every point along that range is valid and valuable. But to build across it, we need shared language.

## A working definition

Here's where we're starting:

> **"An agentic system is one where an AI model evaluates context and makes decisions that shape the system's behavior."**

The moment an LLM decides to route down path A instead of path B, the workflow is no longer fully deterministic. That's where agency begins. Using an LLM purely to generate or transform content inside an otherwise fixed flow is powerful, but it sits *below* that line — it's LLM-assisted, not agentic.

What changes as you move along the spectrum isn't whether something qualifies as agentic — it's how much autonomy the system has, how many decisions it chains together, and what it demands from your organization. Those demands fall along two dimensions that scale in tandem: **architecture and policy**.

- **Architecture** determines what the system *can* do — how it reasons, coordinates, and interacts with the world around it.
- **Policy** determines what it's *allowed* to do — identity, governance, permissions, and oversight.

More autonomy requires more of both. A sophisticated architecture without rigorous policy creates risk. Rigorous policy without the right architecture creates friction. Getting them wrong together is how agentic pilots fail.

## Five buckets in the Agent Ecosystem

These aren't levels to climb. They aren't a maturity model. Each is the best choice for a given problem, and most production systems will use several at once.

We've grouped them into five buckets, knowing that the last bucket deliberately collapses two distinct ideas — collaboration across systems and self-directed autonomy — into one. They're separable in theory, but the group landed on this grouping because it's the easiest to reason about in practice.

![Horizontal arrow diagram showing five stages of AI autonomy, from "More Structured / Human direction" on the left to "More Autonomous / System direction" on the right. Stage 1: LLM-assisted workflows (not yet agents). Stage 2: LLM-directed workflows. Stage 3: Goal-directed, task-oriented agents. Stage 4: Long running, policy driven. Stage 5: Collaborating across domains and organizations.](diagram-degrees-of-agency.png)

### 1. LLM-assisted workflows (not yet agents)

A fully deterministic workflow that uses an LLM to *synthesize or generate content* at one or more steps. Summarize this transcript. Draft this email. Translate this paragraph. The model is doing real work, but it isn't choosing the path — the flow control is entirely human-authored.

This is the right architecture for high-volume, well-understood work where you want the language capabilities of an LLM but none of the unpredictability of model-driven control flow. It sits below the agency line in our working definition above. Calling it "agentic" is what creates the vendor confusion this taxonomy is trying to resolve.

### 2. LLM-directed workflows

AI makes decisions *within a designed structure*. You build the paths; the LLM decides which ones to take. Given context and a prompt, the model chooses between A, B, or C — and the workflow proceeds accordingly. This includes patterns like intelligent routing, parallel processing, and evaluation loops — the workflow patterns [Anthropic describes](https://www.anthropic.com/engineering/building-effective-agents) in "Building Effective Agents." The structure is authored by people; the decisions at each step are driven by the model.

Anthropic groups both this tier and the content-generation case in bucket 1 under the single label "workflows." We split them because the line between *the LLM generates content* and *the LLM picks the path* is exactly where the industry's confusion about the word "agentic" lives — and a taxonomy that wants to resolve that confusion has to draw the line there explicitly.

This is the right architecture for well-defined, high-volume work where you want consistency and predictability with a layer of intelligence on top.

### 3. Goal-directed, task-oriented agents

Hand the system a goal, some tools, and it figures out the steps. No predefined path — the agent dynamically directs its own process and tool usage based on what it encounters along the way. Fix this bug. Research this codebase. Compile this report. Bounded scope, finite task.

This maps to [Anthropic's](https://www.anthropic.com/engineering/building-effective-agents) definition of an "agent" — a system that maintains control over how it accomplishes a task. The agent perceives its environment, reasons about what to do, acts, observes the result, and adapts. That feedback loop is what separates an agent from a workflow. The policy requirements shift here too: you need to understand not just what the agent did, but why — which means reasoning traces and scoped permissions become non-negotiable.

### 4. Autonomous, policy-guided agents

The system operates independently over extended durations — monitoring, deciding, acting, self-correcting — without waiting for a task assignment. The difference from a goal-directed agent isn't just "more autonomy." It's **persistence and self-direction**. This isn't "complete a task and report back." It's "watch this domain and act on what you find, continuously, according to these policies."

That shift changes the infrastructure conversation. You need persistent machine identity with full lifecycle governance, behavioral anomaly detection, and auditable decision trails that can reconstruct why the agent took a specific action at a specific time. The architecture must support long-running durable state. The policy must support ongoing accountability.

### 5. Collaborating, self-directed agents

Multiple agents working together — across teams, vendors, or organizational boundaries — and, at the far end, doing so on behalf of parties with different interests. A buyer's agent and a seller's agent, each optimizing for different outcomes, negotiating with each other. No shared orchestrator. No single party controls the system.

This bucket deliberately combines two ideas that could be split apart: *coordinated multi-agent systems* (independently built agents working toward a shared objective) and *discoverable, self-interested autonomous agents* (independent agents with their own goals interacting across organizational lines). They sit on a continuum of trust and intent, and the infrastructure needs run in the same direction: open protocols like [A2A](https://a2a-protocol.org) and [AGNTCY's](https://agntcy.org) infrastructure for agent discovery and composition, support — when agents start representing distinct interests — verified identity, and secure messaging across trust boundaries.

[MIT Sloan's Sinan Aral](https://mitsloan.mit.edu/faculty/directory/sinan-aral) draws the far end of this bucket explicitly: a marketplace of agents representing both sides of a transaction. This is also the long-term vision behind the AGNTCY Internet of Agents. When agents are self-interested and operating across organizational lines, the infrastructure for trust isn't optional. It's the foundation.

## Where most organizations sit today

Most enterprises are working in buckets 1 and 2 — LLM-assisted workflows and LLM-directed workflows — with some early goal-directed agents in production. Summarization, content routing, basic coding assistance. Others are beginning to experiment with more advanced use cases that call for collaborating, self-directed agents.

The organizations that move successfully along this spectrum are the ones doing their current bucket well. Getting reliable checkpoint-and-rollback in place. Establishing machine identity governance. Building reasoning traces into their observability stack. These foundations compound, and they're exactly what you'll need as the work matures.

## Defining the taxonomy together

We're shaping this taxonomy in the open because the Agent Ecosystem only works if the people building in it share a common understanding. The taxonomy above is grounded in established work from [Anthropic](https://www.anthropic.com/engineering/building-effective-agents), [AGNTCY](https://agntcy.org), and [MIT](https://mitsloan.mit.edu) — but it's a working framework, not a finished standard.

If something here doesn't map to what you're seeing in practice, or if there's a gap we should fill, we want to hear it. Questions, [feedback, and suggestions are welcome](https://github.com/machalliance/wg-enterprise-agent-architecture). This gets sharper the more people contribute.

---

**Authors**

This article was developed by the Enterprise Agent Architecture Working Group of the Agent Ecosystem. The working group's charter, members, and ongoing work are public at [github.com/machalliance/wg-enterprise-agent-architecture](https://github.com/machalliance/wg-enterprise-agent-architecture). Learn more about the broader agent ecosystem vision at [agentecosystem.org](https://agentecosystem.org).
