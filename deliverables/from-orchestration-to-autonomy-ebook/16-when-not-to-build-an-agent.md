## When not to build an agent

Every diagnostic in this book so far routes a solution *into* an archetype. This section routes it out. The framework is only useful if it can return the answer "none of these," and for a meaningful share of the work in front of you it should.

That answer is not a failure of ambition. Agency buys you the ability to handle situations nobody enumerated in advance. Where the situations *were* enumerated, or could be, a model adds cost, latency, variance, and a governance obligation in exchange for nothing. The most common expensive mistake in this space is not choosing the wrong archetype. It is reaching for any archetype where ordinary software was the answer.

Six conditions say stop.

**The decision is the same every time.** If you can write the rule down, write the rule down. A threshold, a lookup, a mapping table, and a validation schema are cheaper, faster, exactly repeatable, and auditable by reading them. Volume makes this stronger, not weaker: ten thousand identical decisions a day is the best possible case for code and among the worst for a model. Reserve the model for the residue the rules cannot classify, which is usually a small fraction of the traffic and the only part that was ever ambiguous.

**You need the same answer every time, provably.** Some decisions have to be reproducible on demand and defensible line by line: tax calculation, regulated pricing, benefits eligibility, safety interlocks, anything where "the system determined it" must be replaced by "here is the rule that determined it, and it determined it this way for everyone." A reasoning trace explains a decision after the fact. It is not the same artifact as a deterministic rule, and in some rooms only the rule will do. Where a regulator, an auditor, or a court is the eventual reader, put the model somewhere else in the process.

**You have no way to tell right from wrong.** Ask how you will know, six months in, whether the system is still doing good work. If there is no ground truth, no measurable outcome, no expert who can adjudicate a sample, and no golden set you could plausibly build, then you cannot evaluate the system, which means you cannot operate it. You will get confident output and no signal, and confident output with no signal degrades quietly. Build the measurement first. If the measurement is impossible, so is the responsible version of the system.

**The cost of a wrong answer exceeds the value of automating it.** Multiply the realistic error rate by the cost of an error and compare it against the labour you are displacing. Many appealing use cases lose this arithmetic outright, and some lose it only at scale, which is worse because the pilot looks fine. Where the error cost is high and unavoidable, the honest design keeps a human as the decision-maker and uses a model to make that human faster — archetype 1, doing exactly what it is good at.

**The real project is integration or data.** If the system the agent must act on has no usable interface, you do not have an agent project, you have an integration project with an agent at the end of it. The same is true of data: an agent reasoning over inconsistent, stale, or fragmented records produces fluent, wrong output, and no amount of model capability fixes an input problem. Scope the interface and the data work honestly, put them first, and decide whether the agent still pencils out once they are in the estimate. Sometimes the interface is the whole win and the agent turns out to be optional.

**The process itself is broken.** An agent laid over a bad process executes the bad process faster and with less friction to alert anyone. If the workflow only exists to reconcile two systems that should agree, or to route work that should never have been split, fix that. Gartner's finding that rethinking the workflow often beats wiring an agent into the existing one is the same observation from the cost side.

And one prerequisite rather than a condition: if you cannot name the person who owns the system and the person who is on call when it misbehaves, you are not ready to build it at any archetype. That is not a reason to choose deterministic software. It is a reason to wait.

### A "no" is usually a "not this part"

Because solutions compose, this test runs per component, like the rest of the diagnostic. The useful outcome is rarely "abandon the initiative." It is that three of the five decision points in your design were always rules, one is a genuine judgment call that belongs in archetype 2, and one is language work that belongs in archetype 1. That system is cheaper to build, cheaper to run, easier to govern, and more likely to survive contact with production than the version where a model touches everything.

Saying no to the parts that did not need agency is what earns you the credibility, and the budget, to say yes where it counts.
