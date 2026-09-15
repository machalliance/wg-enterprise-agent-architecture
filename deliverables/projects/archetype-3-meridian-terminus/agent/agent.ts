import { defineAgent } from "eve";

/**
 * Runtime configuration for the repair desk.
 *
 * `limits` is the framework's whole budget surface, and it is token-and-time
 * shaped: there is no step ceiling in eve. That matters for an archetype 3 agent,
 * because "out of budget" is one of only three ways it is allowed to finish. The
 * step and tool-call ceilings therefore live in `seed/mandate.json` and are
 * enforced by the tool layer in `agent/lib/toolkit.ts`.
 *
 * Worth knowing about the token limits: crossing one does not throw. eve pauses
 * the session and offers a person Approve (grant a fresh window) or Stop. That
 * is the right default for an assistant and the wrong one for an unattended
 * batch run, which is the second reason the hard ceiling is ours rather than the
 * framework's.
 */
export default defineAgent({
  model: "anthropic/claude-sonnet-5",
  reasoning: "medium",
  limits: {
    maxInputTokensPerSession: 400_000,
    maxOutputTokensPerSession: 60_000,
    // One batch, one sitting. A repair desk session that outlives the value date
    // is not a session, it is an unsupervised process.
    sessionTimeoutMs: 4 * 60 * 60 * 1_000,
  },
});
