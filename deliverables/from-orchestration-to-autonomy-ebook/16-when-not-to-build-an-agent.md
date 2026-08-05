## When not to build an agent

Before asking which archetypes a solution needs, ask whether it needs one at all. For a fair share of the work in front of you the answer is no, and the framework is only useful if it can say so.

Agency buys the ability to handle situations nobody listed in advance. Where the situations were listed, or could be, a model adds cost, delay, variation, and a governance burden, and nothing else. Teams reach for an archetype where ordinary software was the answer more often than they pick the wrong archetype, and it is the more expensive of the two mistakes.

Six conditions should stop a project.

**The decision is the same every time.** If you can write the rule down, write it as a rule. A threshold, a lookup, or a mapping table is cheaper, faster, repeatable to the letter, and auditable by reading it. High volume makes that case stronger, not weaker: ten thousand identical decisions a day is close to the worst use you can put a model to. Save it for the leftovers the rules cannot sort.

**You need the same answer every time, provably.** Some decisions have to be repeatable on demand and defensible line by line: tax calculation, regulated pricing, benefits eligibility, safety interlocks. A reasoning trace explains a decision after the fact, and that is weaker than the rule that decided it, applied the same way to everyone. Where a regulator, an auditor, or a court is the eventual reader, put the model somewhere else in the process.

**You have no way to tell right from wrong.** Ask how you will know, six months in, whether the system is still doing good work. If there is no ground truth, no measurable outcome, and no golden set you could plausibly build, you cannot evaluate it. A system you cannot evaluate is one you cannot run, because confident output goes bad quietly when nothing is watching. Build the measurement first, and if the measurement turns out to be impossible, treat that as the verdict on the project.

**A wrong answer costs more than the automation is worth.** Multiply a realistic error rate by the cost of an error and compare it against the labor you are displacing. Many appealing use cases lose this arithmetic outright. Others lose it only at volume, and that is the harder case to catch, because the pilot looks fine. Where the cost of an error is high and cannot be brought down, keep a human as the decision-maker and use a model to make that human faster.

**The real project is integration or data.** If the system the agent must act on has no usable interface, you have an integration project with an agent at the end of it, and the estimate has to say so. Data is the same problem in another form. An agent reasoning over stale or scattered records produces fluent, wrong output, and a better model does not make up for bad input. Scope the interface and the data work first, then decide whether the agent still pencils out.

**The process itself is broken.** An agent laid over a bad process runs the bad process faster, with less friction to warn anyone. If a workflow exists only to reconcile two systems that should agree, fix that instead. Gartner's finding that rethinking the workflow often beats wiring an agent into the existing one is the same point arriving from the cost side.

One further check, less a condition than a precondition: if you cannot name the person who owns the system and the person who is on call when it misbehaves, you are not ready to build it at any archetype. That argues for waiting, not for choosing ordinary software.

### A "no" is usually a "not this part"

Because solutions compose, this test runs per component, and it rarely returns "abandon the initiative." The common outcome is that three of the five decision points in your design were always rules, one is a real judgment call belonging in archetype 2, and one is language work belonging in archetype 1. That version costs less to build and run, is easier to govern, and stands a better chance in production than the one where a model touches everything.

Turning down the parts that never needed agency is also what earns the credibility, and the budget, to build the parts that do.
