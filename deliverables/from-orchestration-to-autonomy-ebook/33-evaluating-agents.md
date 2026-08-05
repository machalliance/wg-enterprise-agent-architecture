## Evaluating agentic systems

Evaluation is the hardest operational problem in this space, and the one most likely to be underfunded, because it produces no visible feature.

The difficulty runs deeper than the fact that output varies. A deterministic system has one right output per input, so a test is an equality check. An agentic system has a whole range of acceptable behavior, so evaluating it means deciding what that range is, sampling it, and noticing when the system steps outside. That is a measurement practice, not a test suite.

### What you are measuring changes with the archetype

Using one evaluation strategy across a composed system is the first mistake. Each archetype fails differently and has to be measured differently.

| Archetype | The question | What you evaluate |
|---|---|---|
| 1. LLM-assisted | Is the artifact good? | Output against a rubric: schema conformance, factual support in the source data, tone, localization, banned claims |
| 2. LLM-directed | Was the decision right? | Chosen route against a labeled expected route; how well the confidence score is calibrated; behavior of the fallback path |
| 3. Goal-directed | Did it get there, and how? | Outcome against the goal, plus the path: steps taken, tools called, errors recovered, cost, escalations |
| 4. Autonomous | Is it still behaving? | Behavior over time against a baseline; drift; quality of decisions in aggregate rather than per run |
| 5. Collaborating | Are the terms good, and the protocol honored? | Settled outcomes against mandate and market, protocol compliance, counterparty behavior over a relationship |

The shift at archetype 4 is worth dwelling on. Below it, evaluation happens before release. At and above it, evaluation becomes a monitoring job that never finishes, because a system that passed in March tells you nothing about how it behaves in September.

### Golden sets when there is no single right answer

A golden set is a fixed collection of representative inputs with known-good outcomes, and it is the closest thing to a unit test available here. Building a useful one depends less on size than on three properties.

**Draw it from production, not imagination.** Invented examples only cover the failures you already thought of. Real traffic carries the ones you did not: the supplier who ships dimensions as strings, the category nobody mapped, the description in two languages. Sample from live data, and over-sample the cases that went wrong.

**Break it into slices, and never report only the total.** A single pass rate hides a broken slice. Split by supplier, category, region, language, and record age, and read the slices. An agent at 94% overall can sit at 40% on one supplier's feed, and that is the condition behind an incident nobody saw coming.

**Label the right thing.** For content, label the acceptable output. For an agent, label the acceptable outcome and leave the path free. Fixing the path in the label turns the golden set into a test of one particular plan instead of a test of the agent's judgment.

Then keep it alive. A set frozen at launch stops matching production within a quarter or two, and once it stops matching production it is worse than nothing, because the passing scores it hands you mean nothing. Give it an owner and a refresh cadence.

### The path as well as the outcome

From archetype 3 up there are two distinct questions, and most teams ask only the first.

Did it reach an acceptable outcome? That is correctness. Did it get there acceptably? That is the path, covering cost, safety, and how reviewable the run is. An agent can produce the right result after twelve retries, a tool call it should never have needed, and a write that happened to fall inside its scope. That is a hidden failure that scores as a pass. Teams that evaluate outcomes alone ship agents that look clean on the golden set and behave badly in production.

Measure these per run, and read them as distributions rather than averages, because the average hides the tail and the tail is where incidents live: goal completion rate, steps to completion, tool-call error rate, recovery rate after a tool error, human-escalation rate, budget-exhaustion rate, and cost per resolved task. Watch their shape across releases. A change that improves completion while doubling steps to completion has moved a quality problem into the cost column.

### LLM-as-judge, and where it goes circular

Scoring open-ended output at volume needs a model in the loop, because humans cannot read every draft and no rule can score prose. A model judge is the only practical way to evaluate archetype 1 and 2 output at production scale. It is also an easy way to manufacture false confidence.

It goes circular when the judge shares the generator's model, prompt lineage, or blind spots. A judge that reasons the way the generator reasons will approve exactly the errors you most need to catch, and hand them a high score with a fluent justification. Four rules keep it honest. Judge against a written rubric with explicit criteria, rather than asking whether the output is good. Calibrate the judge against human labels on a sample, measure how far the two agree, and re-calibrate whenever either model changes. Use a different model family for the judge where the stakes justify it. And never let a judge be the only gate in front of an action you cannot undo.

Its hard limit matters too: a judge can assess whether a claim looks supported, not whether it is true. Facts get checked against the source system — validate the attribute against the PIM, not against a second opinion.

### Replay and regression

Prompt and model changes are the most frequent source of changed behavior, and they become testable once you have recorded enough to re-run a decision: the input, the assembled context, the prompt and model versions, the tool results, and the action taken. With that in hand, a change becomes an experiment. Replay a few hundred recorded decisions under the new setup and diff the result against the old behavior.

Read the disagreements rather than the pass rate. A change that agrees everywhere did nothing. A change that disagrees on 8% of cases has told you which eighty decisions to look at, and whether the new behavior is better is a judgment a human should make on those cases. This is also the only responsible way to take a model upgrade at archetype 4, where a swap shifts behavior across everything running at once.

One caveat: replay re-runs the reasoning against recorded tool results, so it checks judgment rather than the live system. A changed API, a slower dependency, or a tool whose output format drifted will all get through. Pair it with a shadow run — the new setup processing live traffic without acting — before you promote it.

### Sandboxes, dry runs, and earning write access

For anything that acts, evaluation is also how permission gets granted. A dry-run mode that proposes actions without committing them, a sandbox that mirrors production structure, and a set of known-bad inputs with known-good resolutions together let you watch an agent's judgment at length before it can affect anything. This is what "you earn the agent's write scope by watching what it does without it" means in practice, and at archetype 3 it is the highest-value evaluation you can invest in, because it turns an unbounded risk into one you can see.

### Staffing it

Because it ships nothing a customer sees, evaluation is the first line cut from a plan and the last one restored. Treat it as a named deliverable with an owner and a budget, on the same footing as the agent itself. Teams that skip it do not avoid the work. They do it after the incident, under pressure, while a stakeholder asks why nobody knew.
