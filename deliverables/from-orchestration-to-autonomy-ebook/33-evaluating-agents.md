## Evaluating agentic systems

This is the hardest operational problem in the space and the one most likely to be underfunded, because it produces no visible feature. It gets its own section for that reason.

The difficulty is not only that the same input can produce a different path twice. It is that "correct" stops being a single value you can assert. A deterministic system has one right output per input, so a test is an equality check. An agentic system has a space of acceptable behaviours, and evaluating it means deciding what that space is, sampling it, and noticing when the system leaves it. That is a measurement discipline, not a test suite.

### What you are measuring changes with the archetype

The first mistake is applying one evaluation strategy across a composed system. Each archetype fails differently, so each is measured differently.

| Archetype | The question | What you evaluate |
|---|---|---|
| 1. LLM-assisted | Is the artifact good? | Output against a rubric: schema conformance, factual support in the source data, tone, localization, prohibited claims |
| 2. LLM-directed | Was the decision right? | Chosen route against a labelled expected route; calibration of the confidence score; behaviour of the fallback path |
| 3. Goal-directed | Did it get there, and how? | Outcome against the goal, plus the trajectory: steps taken, tools called, errors recovered, cost, escalations |
| 4. Autonomous | Is it still behaving? | Behaviour over time against a baseline; drift; outcome quality of decisions in aggregate rather than per run |
| 5. Collaborating | Are the terms good, and the protocol honoured? | Settled outcomes against mandate and market, protocol compliance, counterparty behaviour over a relationship |

Notice the shift at archetype 4. Below it, evaluation is something you do before release. At and above it, evaluation is a monitoring function that never finishes, because a system that passed in March tells you nothing about its behaviour in September.

### Golden sets when there is no single right answer

A golden set is a fixed collection of representative inputs with known-good outcomes, and it is the closest thing to a unit test you get. Building a useful one has less to do with size than with three properties.

**Draw it from production, not imagination.** Invented examples encode the failure modes you already thought of. Real traffic contains the ones you did not: the supplier who ships dimensions as strings, the category nobody mapped, the description in two languages. Sample from live data, and over-sample the cases that went wrong.

**Stratify it, and never report only the aggregate.** A single pass rate hides a broken slice. Segment by supplier, category, region, language, and record age, and read the segments. An agent at 94% overall can be at 40% on one supplier's feed, which is exactly the condition that produces an incident nobody predicted.

**Label the right thing.** For content, label the acceptable output. For an agent, label the acceptable *outcome* and leave the path free, because fixing the path in the label turns your golden set into a test of one particular plan rather than of the agent's judgment.

Then keep it alive. A golden set frozen at launch stops representing production within a quarter or two, and a set that no longer represents production is worse than none, because it produces passing scores that mean nothing. Assign it an owner and a refresh cadence.

### Trajectory as well as outcome

For archetype 3 and above there are two distinct questions, and most teams ask only the first.

*Did it reach an acceptable outcome?* That is correctness. *Did it get there acceptably?* That is trajectory, and it covers cost, safety, and reviewability. An agent can produce exactly the right result after twelve retries, a tool call it should never have needed, and a write that happened to be in scope — a latent failure that scores as a pass. Outcome-only evaluation is how a team ships an agent that looks clean on the golden set and behaves badly in production.

Worth measuring per run, and worth reading as distributions rather than means, because the mean hides the tail and the tail is where the incidents live: goal completion rate, steps to completion, tool-call error rate, recovery rate after a tool error, human-escalation rate, budget-exhaustion rate, and cost per resolved task. Watch the shape of these over releases. A change that improves completion while doubling steps to completion has moved your cost problem, not solved your quality problem.

### LLM-as-judge, and where it goes circular

Scoring open-ended output at volume needs a model in the loop, because humans cannot read every draft and no rule can score prose. Used carefully, a model judge is the only practical way to evaluate archetype 1 and 2 output at production scale. Used carelessly, it manufactures confidence.

It goes circular when the judge shares the generator's model, prompt lineage, or blind spots. A judge that reasons the way the generator reasons will ratify precisely the errors you most need to catch, and it will do so with a high score and a fluent justification. Four rules keep it honest. Judge against a written rubric with explicit criteria rather than asking whether the output is good. Calibrate the judge against human labels on a sample, measure the agreement, and re-calibrate whenever either model changes. Use a different model family for the judge where the stakes justify it. And never let a judge be the only gate in front of an irreversible action.

Know its hard limit, too: a judge can tell you whether a claim *looks* supported. It cannot tell you whether the claim is true. Factual verification comes from the source system — validate the attribute against the PIM, not against a second opinion.

### Replay and regression

Prompt and model changes are the highest-frequency source of behavioural change, and they are testable if you have recorded enough to re-run a decision: the input, the assembled context, the prompt and model versions, the tool results, and the action taken. With that, a change becomes an experiment. Replay a few hundred recorded decisions under the new configuration and diff the new behaviour against the old.

Read the disagreements, not the pass rate. A change that agrees with the old behaviour everywhere did nothing; a change that disagrees on 8% of cases has told you exactly which eighty decisions to look at, and whether the new behaviour is better is a judgment call a human should make on those cases. This is also the only responsible way to take a model upgrade at archetype 4, where a swap shifts behaviour across everything running at once.

One caveat: replay re-runs reasoning against *recorded* tool results, so it validates judgment rather than the live system. It will not catch a changed API, a slower dependency, or a tool whose output format drifted. Pair it with a shadow run — the new configuration processing live traffic without acting — before you promote it.

### Sandboxes, dry runs, and earning write access

For anything that acts, evaluation is also how permission is granted. A dry-run mode that proposes actions without committing them, a sandbox that mirrors production structure, and a set of known-bad inputs with known-good resolutions together let you watch an agent's judgment at length before it can affect anything. This is what "you earn the agent's write scope by watching what it does without it" means in practice, and it is the single highest-value evaluation investment at archetype 3, because it converts an unbounded risk into an observable one.

### Staffing it

Because it ships nothing a customer sees, evaluation is the first line cut and the last one restored. Treat it as a named deliverable with an owner and a budget, on the same footing as the agent itself. The alternative is not that you skip the work. It is that you do it after the incident, under pressure, with a stakeholder asking why nobody knew.
