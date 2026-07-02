## Composition: why real solutions blend archetypes

The archetypes are patterns, and a real solution rarely lives in just one of them. It composes several, because different parts of the same job have different shapes.

Take the autonomous revenue optimization agent from archetype 4. It runs continuously and reprices within policy, which is squarely archetype 4 work. But when it needs to draft the merchandising note that explains a price change, it calls a content-generation step that belongs to archetype 1. When it decides whether a flagged SKU goes to human review or proceeds, it is making the kind of routed decision that defines archetype 2. One deployed system, three archetypes, each governing a different component.

This matters because the demands attach to each component separately. The content-generation step needs prompt versioning and output validation. The routed decision needs a confidence threshold and a fallback. The continuous loop needs durable identity, circuit breakers, and a decision trail. If you reason about the system as "an archetype 4 agent" and stop there, you will govern the loop and forget that the content step can still publish an unsupported claim.

So the framing question is not "which archetype is my solution?" It is "which archetypes does my solution use, and am I resourced for each one?" A solution that spans three archetypes inherits the readiness requirements of all three. Naming them separately is what lets you see the full obligation instead of the loudest part of it.

The next section gives you a way to do that naming quickly.
