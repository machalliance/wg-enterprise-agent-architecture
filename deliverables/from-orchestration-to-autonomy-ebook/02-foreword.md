# Foreword

If you are building in the agent ecosystem right now, you have already hit the problem this book exists to fix. Nobody agrees on what "agentic" means. A vendor calls their language-model routing workflow agentic. Another uses the same word for a system that plans across domains, delegates to sub-agents, and self-corrects when something breaks.

Treat that as a design problem, because the consequences are practical. When one term covers everything from an intelligent workflow to an autonomous system acting on your behalf, you cannot write clear requirements, compare two vendors on equal footing, or decide where the safety boundaries belong. The confusion becomes technical debt before anyone writes a line of code.

We wrote this to give people who build a common language. The model has five archetypes, laid out from structured and human-directed to autonomous and system-directed. Every point along that range is valid. Each is the right choice for some class of problem. None is a trophy for outgrowing the one before it.

Two decisions shape how we present them.

First, we call them archetypes rather than levels. A maturity model implies you are meant to reach the top and that everything below it is a waystation. That framing is wrong for this material. A content-generation workflow is the correct architecture for a lot of high-volume language work, and plenty of production systems should never move past it. It has not failed by staying there.

Second, we frame the model around the solution being built. You will not find a quiz that sorts you, the reader, into a single archetype, because real solutions combine several. An autonomous agent still calls content-generation steps that belong to archetype 1. The useful question is which archetypes a given solution needs, and whether you are resourced for the demands each one places on your architecture and your policy.

Read Part One for the argument in full. Read Part Two when you need depth on a specific archetype. Read Part Three to see the archetypes working together and to check your own readiness. This is a working framework, shaped in the open, and it gets sharper the more people build against it.
