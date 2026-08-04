## When not to build an agent

The diagnostics so far help you find which archetype a solution belongs to. This section asks whether it belongs in any of them. For a meaningful share of the work in front of you it will not, and the framework is only useful if it can say so.

Agency buys the ability to handle situations nobody enumerated in advance. Where the situations were enumerated, or could be, a model adds cost, latency, variance, and a governance obligation while adding nothing else. Teams reach for an archetype where ordinary software was the answer more often than they pick the wrong archetype, and it is the more expensive of the two errors.

Six conditions should stop a project.

**The decision is the same every time.** If you can write the rule down, write it as a rule. A threshold, a lookup, a mapping table, and a validation schema are cheaper, faster, exactly repeatable, and auditable by reading them. High volume strengthens the case for code rather than weakening it: ten thousand identical decisions a day is close to the worst use of a model available. Reserve the model for the residue the rules cannot classify, which is usually a small fraction of traffic and the only part that was ever ambiguous.

**You need the same answer every time, provably.** Some decisions have to be reproducible on demand and defensible line by line: tax calculation, regulated pricing, benefits eligibility, safety interlocks, anything where "the system determined it" has to be replaced by the rule that determined it, applied identically to everyone. A reasoning trace explains a decision after the fact, which is a weaker artifact than a deterministic rule and in some rooms an unacceptable substitute for one. Where a regulator, an auditor, or a court is the eventual reader, put the model somewhere else in the process.

**You have no way to tell right from wrong.** Ask how you will know, six months in, whether the system is still doing good work. If there is no ground truth, no measurable outcome, no expert who can adjudicate a sample, and no golden set you could plausibly build, you cannot evaluate the system, and a system you cannot evaluate is one you cannot operate. You will get confident output and no signal, and confident output degrades quietly when nothing is watching. Build the measurement first, and if the measurement turns out to be impossible, treat that as a verdict on the project.

**The cost of a wrong answer exceeds the value of automating it.** Multiply a realistic error rate by the cost of an error and compare it against the labor you are displacing. Many appealing use cases lose this arithmetic outright. Others lose it only at volume, which is the harder case to catch, because the pilot looks fine. Where the error cost is high and cannot be reduced, keep a human as the decision-maker and use a model to make that human faster, which is archetype 1 doing what it is good at.

**The real project is integration or data.** If the system the agent must act on has no usable interface, what you have is an integration project with an agent at the end of it, and the estimate has to say so. Data is the same problem in another form: an agent reasoning over inconsistent, stale, or fragmented records produces fluent, wrong output, and model capability does not compensate for input quality. Scope the interface and the data work first, then decide whether the agent still pencils out. Occasionally the interface delivers most of the value and the agent becomes optional.

**The process itself is broken.** An agent laid over a bad process executes the bad process faster and with less friction to alert anyone. If a workflow exists only to reconcile two systems that should agree, or to route work that should never have been split, fix that instead. Gartner's finding that rethinking the workflow often beats wiring an agent into the existing one is the same observation arriving from the cost side.

One further check, though it is a prerequisite rather than a condition: if you cannot name the person who owns the system and the person who is on call when it misbehaves, you are not ready to build it at any archetype. That argues for waiting rather than for choosing deterministic software.

### A "no" is usually a "not this part"

Because solutions compose, this test runs per component like the rest of the diagnostic, and it rarely returns "abandon the initiative." The common outcome is that three of the five decision points in your design were always rules, one is a genuine judgment call belonging in archetype 2, and one is language work belonging in archetype 1. That version costs less to build and run, is easier to govern, and stands a better chance in production than the one where a model touches everything.

Turning down the parts that never needed agency is also what earns the credibility, and the budget, to build the parts that do.
