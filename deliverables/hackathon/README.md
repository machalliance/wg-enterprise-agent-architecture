# Agent Architecture Hackathon in a Box

A self-contained, reusable hackathon for learning how to **design, combine, and build agent architectures**. It is structured as two half-day segments: a guided morning that walks through agent archetypes and the patterns behind them, and an open afternoon where you build something real to see how those patterns hold up in practice.

This kit makes its debut at **[MACH X Amsterdam](https://mach-x.machalliance.org/amsterdam/), September 29–30, 2026**, but it is built to be lifted and re-run. MACH Alliance members, brands, partner agencies, or anyone else can take this repository and deliver the same experience for their own teams and communities.

> **Status:** Active development ahead of MACH X Amsterdam. Sections marked **TBC** (to be confirmed) are still being finalized. If you are running this yourself, those are the parts you'll want to localize.

---

## What you'll get out of it

By the end of the day you should be able to:

- Recognize the common **agent archetypes** and the architectural patterns each one represents.
- Reason about **when and where** a given pattern is a good fit, and where it isn't.
- Understand how to **combine patterns** into a larger architecture, and what that combination implies.
- Identify the **infrastructure primitives** an architecture needs to actually run (memory, tools, orchestration, evaluation, observability, guardrails, and so on).
- Have **built something** — however small — that turns the theory into hands-on intuition about how agents behave.

The goal is learning through building, not shipping a finished product. There are no losers here; the point is to experiment and come away understanding agents better than you did that morning.

---

## Who this is for

The day is designed primarily for **attendees** — a technical, hands-on audience comfortable reading and writing code, with an interest in agentic systems and composable architecture.

A second audience is **anyone who wants to run this hackathon themselves**. If that's you, see [Running this yourself](#running-this-yourself). The same material serves both: attendees follow it as a participant guide, facilitators read it as a playbook.

No deep prior agent experience is assumed for the morning. The afternoon rewards people who arrive with an idea, but it is equally open to those who'd rather pick up a ready-made scenario.

---

## Format at a glance

| | **Morning — Architecture & Patterns** | **Afternoon — Build** |
|---|---|---|
| **Feel** | Guided, mostly learning, lightly hands-on | Open, mostly building, lightly guided |
| **Audience lean** | Developer / architect | Anyone who wants to build |
| **You leave with** | A mental model of agent patterns and how to combine them | Something you built, and the experience of building it |
| **Output** | Shared understanding | Optional show & tell |

The two halves are designed to work together but can be run independently if you only have half a day.

---

## Morning — Architecture & Patterns

A walkthrough of the building blocks of agent systems. We move through the agent archetypes one at a time and, for each, look at:

- **The pattern** — what it is and the shape of the problem it solves.
- **What it's good for** — the situations where it shines.
- **When and where to apply it** — the signals that tell you to reach for it, and the ones that tell you not to.
- **How it combines** — how the pattern composes with others into a larger architecture.
- **Implications and primitives** — the considerations, trade-offs, and infrastructure primitives you'll want available to implement it well.

This segment is mostly learning with light hands-on moments, so you finish with a working mental model rather than a finished build.

### The five archetypes

We work from the spectrum laid out in the MACH Alliance article [From Orchestration to Autonomy](https://machalliance.org/insights-hub/from-orchestrations-to-autonomy), by the Agent Ecosystem's Enterprise Agent Architecture Working Group. The archetypes are **not a maturity ladder** — each is the right choice for a particular problem, and most real systems use several at once:

1. **LLM-assisted workflows** — a fixed, human-authored flow that calls a model to generate or transform content at certain steps. The model does real work but never chooses the path, so it sits below the line where agency begins.
2. **LLM-directed workflows** — the structure is still authored by people, but the model decides which path to take within it (routing, parallelization, evaluation loops).
3. **Goal-directed, task-oriented agents** — given a goal and tools, the agent figures out its own steps for a bounded task, observing results and adapting as it goes.
4. **Autonomous, policy-guided agents** — the system runs over extended periods, monitoring and acting on its own according to policy, rather than waiting for a task to be assigned.
5. **Collaborating, self-directed agents** — multiple agents working together across teams, vendors, or organizational boundaries, up to agents representing different interests negotiating with one another.

For each archetype the morning covers what it's good for, when to apply it, how it combines with the others, and the infrastructure and policy primitives it demands — read traces and scoped permissions, machine identity and audit trails, discovery protocols and verified identity across trust boundaries, and so on. Two themes run through all of it: **architecture** (what a system can do) and **policy** (what it's allowed to do) scale together, and getting one far ahead of the other is how agent projects fail.

The article is the canonical reference for this section — read it before the event if you can.

---

## Afternoon — Build

An open space to build, experiment, and learn. There are two supported ways in, and you can lean on facilitators throughout either path:

### Path A — Bring your own idea

Arrive with something you want to make and get hands-on support shaping it into an agent architecture. Good for people who already have a problem in mind and want help applying the morning's patterns to it.

### Path B — Pick a scenario

Choose from a set of prepared scenarios and implement one to learn by doing. Good for people who want a clear starting point and a defined goal. Each scenario is built to exercise one or more of the patterns from the morning.

> **Scenarios — TBC.** The scenario set will be provided in this repository ahead of the event. _(Scenario briefs to be added.)_

### Wrap-up — Show & tell

The day closes with an **optional, low-key show & tell**. Anyone who wants to share their progress can demo what they built or talk through what they learned. There's no judging and no formal scoring — it's a space to swap findings and see what others tried.

---

## Before you arrive

> **Prerequisites — TBC.** A core set of prerequisites will be published here before the event. They may differ between the morning and the afternoon, so this section will be split accordingly.

The shape of what to expect:

- **Core prerequisites (both halves):** _to be confirmed_ — likely a working development environment and accounts/keys for the tools we'll use.
- **Morning add-ons:** _to be confirmed_ — anything specific to the guided walkthrough.
- **Afternoon add-ons:** _to be confirmed_ — anything additional needed to build freely, which may depend on the path you choose.

When in doubt, arrive with a laptop you can install on and admin rights to do so. Specifics will be filled in here as they're locked.

---

## What's in the box

> **Repository contents — TBC.** The exact structure is still being assembled. What follows is the intended shape, not a final manifest.

This kit is expected to include a mix of:

- **Instructional material** — slides, walkthroughs, and supporting articles for the morning.
- **Reference architectures** — starting points described here and linked out to their own GitHub repositories, so each can be cloned and run on its own.
- **Scenario briefs** — the prepared afternoon challenges (see [Path B](#path-b--pick-a-scenario)).
- **Possibly more** — additional supporting material may be added as the kit takes shape.

Reference architectures are intentionally kept in separate repositories rather than vendored into this one, so they can be versioned, run, and contributed to independently. Links will be collected here.

```
deliverables/
└── hackathon/
    └── readme.md          ← you are here
    └── ...                ← structure to be confirmed
```

---

## Running this yourself

This hackathon is a utility, not a one-off. To deliver it for your own team, community, or event:

1. **Clone this repository** and review the morning and afternoon segments above.
2. **Localize the prerequisites** once they're confirmed — your environment, accounts, and keys may differ from the MACH X setup.
3. **Choose your scenarios** — use the provided set, adapt them, or write your own using the same pattern-exercising approach.
4. **Decide your timing** — the default is two half-days, but each half can run standalone if that's all you have.
5. **Run the wrap-up** as a show & tell, keeping it optional and low-stakes.

If you adapt or extend the kit, contributions back are welcome — see [Contributing](#contributing).

---

## Reference & further reading

- [MACH X Amsterdam, September 29–30, 2026](https://mach-x.machalliance.org/amsterdam/) — the event where this kit debuts.
- [From Orchestration to Autonomy](https://machalliance.org/insights-hub/from-orchestrations-to-autonomy) — MACH Alliance Insights Hub. The five archetypes and the architecture/policy framing for the morning.
- [Enterprise Agent Architecture Working Group](https://github.com/machalliance/wg-enterprise-agent-architecture) — the working group behind the article; charter, members, and ongoing work.
- Reference architectures — **TBC** _(links to be added)._

---

## Contributing

> **TBC.** Contribution guidelines will be added. In the meantime, issues and pull requests that improve the material, fix scenarios, or add reference architectures are welcome.

---

## License

> **TBC.** A license will be added so the kit can be freely reused and adapted by MACH Alliance members, brands, and others.
