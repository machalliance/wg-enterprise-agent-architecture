# Security

**This is an unmaintained demo. Do not deploy it. Use it at your own risk.**

Meridian Terminus is a reference prototype built by the Enterprise Agent
Architecture Working Group of the Agent Ecosystem to illustrate Archetype 3 —
goal-directed, task-oriented agents. It exists to be read, run locally, and
argued with. It is not a product, not a control, and not a starting point for
anything that touches real payment instructions.

There is no security patch process, no advisory process, no coordinated
disclosure process, and no response-time commitment. Please do not report
vulnerabilities against it expecting a fix. If you find something instructive,
open an issue on the working group repository so the *documentation* can say it
out loud — that is the only remediation this deliverable offers.

Dependencies are pinned exactly (`eve` 0.44.3, `ai` 7.0.78, `zod` 4.4.3,
`just-bash` 3.4.2) so that
the prototype keeps behaving the way its documentation describes. They will go
stale, and known vulnerabilities will accumulate in them over time. That is an
accepted consequence of pinning a demo rather than maintaining it.

The MIT licence's "as is" clause is the operative one here. It is not boilerplate
in this case.

Two specific things worth knowing before anyone gets ideas:

- **The sanctions screening in this prototype is a JSON file with four states.**
  There is no matching engine behind it. What the prototype demonstrates is the
  agent's *response* to a screening state, not the detection of one. Nothing here
  screens anything.
- **The compliance discussion in `README.md`, `PLAN.md` and
  `agent/skills/triage-payment-exception.md` cites public
  enforcement actions and standards texts as evidence for a design constraint.**
  It is not legal or compliance advice; some of it is inference clearly marked as
  inference in `docs/known-limitations.md` §22; and running this
  software makes no one compliant with anything.
- **There is a `just-bash` sandbox with no network isolation.** That is a
  deliberate choice explained in `agent/sandbox.ts` and safe
  only because no tool can reach it. It stops being safe the moment someone adds
  one.

For the accepted architecture debt and the places the model diverges from a real
payment operation, see `docs/known-limitations.md`.
