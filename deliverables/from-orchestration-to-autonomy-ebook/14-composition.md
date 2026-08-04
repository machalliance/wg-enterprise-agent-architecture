## Composition: why real solutions blend archetypes

The archetypes are patterns, and a real solution rarely lives in just one of them. It composes several, because different parts of the same job have different shapes. And it composes them cleanly only on composable, connected foundations: a content step you can call as a service, a policy engine you can gate any action through, an identity you can scope and revoke on its own. Where the foundation is a monolith, every archetype you add inherits its limits.

Take an ordinary case: a workflow that handles inbound customer email. A model reads each message and drafts a reply, which is archetype 1 work — language production inside a fixed path. But the same system also decides what to do with each message: answer it directly, ask the customer for more detail, or hand it to a human specialist. That decision changes what the system does next, which puts it above the agency line and squarely in archetype 2. One modest deployment, two archetypes, and the parts have almost nothing in common.

The demands attach to each component separately. The drafting step needs prompt versioning and output validation, so a reply cannot promise a refund policy that does not exist. The routing step needs a confidence threshold and a defined fallback, so an ambiguous complaint reaches a person instead of getting a confident wrong answer. Neither control does anything for the other half. A team that describes this as "our AI support tool" and governs it as one thing will end up governing whichever half it happened to think about first.

So the framing question is not "which archetype is my solution?" It is "which archetypes does my solution use, and am I resourced for each one?" A solution that spans three archetypes inherits the readiness requirements of all three, applied per component. Naming them separately is what lets you see the full obligation instead of the loudest part of it.

The next section gives you a way to do that naming quickly, and Part Three works a larger system — four archetypes in one deployment — all the way through.
