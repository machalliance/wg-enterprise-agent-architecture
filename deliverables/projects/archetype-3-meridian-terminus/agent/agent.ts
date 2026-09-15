import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
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

/**
 * Model routing, and the reason it is two branches rather than one.
 *
 * A bare string model id routes through Vercel AI Gateway, which is how the
 * deployed demo runs: the Vercel project holds the credential as OIDC and no
 * provider key exists in the repo. That is the default and it is unchanged.
 *
 * But a prototype whose only route to a model is one vendor's gateway cannot be
 * run by a reviewer who does not have one, and what a model does when handed
 * these tools is the part worth checking for yourself. Setting LLM_BASE_URL
 * therefore redirects it at any OpenAI-compatible endpoint — OpenRouter, Bedrock behind a shim, a local
 * server — which is the same three-variable contract Meridian Pulse and Meridian
 * Crossing use. Nothing below the model reference changes: the tools, the
 * mandate, the tier policy and the terminals are all provider-agnostic already.
 */
const provider =
  process.env.LLM_BASE_URL !== undefined && process.env.LLM_BASE_URL !== ""
    ? createOpenAICompatible({
        name: "llm",
        baseURL: process.env.LLM_BASE_URL,
        apiKey: process.env.LLM_API_KEY,
      })
    : null;

export default defineAgent({
  // The direct-provider default is an OpenRouter id, and deliberately one from
  // the US/ZDR regional catalogue (us.openrouter.ai) rather than the global one,
  // because a payment-operations demo pointed at a residency-constrained gateway
  // is the likely case. Set LLM_MODEL to override — the id has to be valid in
  // whatever namespace LLM_BASE_URL points at, which is not this one by default.
  model: provider
    ? provider(process.env.LLM_MODEL ?? "openai/gpt-5.4")
    : "anthropic/claude-sonnet-5",

  /**
   * Required on the direct-provider branch, and the failure without it is
   * opaque enough to be worth naming here.
   *
   * eve sizes compaction against the model's context window, which it looks up
   * in the AI Gateway catalog. A provider-authored model has no catalog entry,
   * so the lookup returns null and the build aborts with "does not have known AI
   * Gateway context window metadata" — before `next dev` ever prints a server
   * URL. Declaring the window here is what supplies the number the catalog
   * cannot. 200k is the floor across the models anyone is likely to point this
   * at; lower it if you route to something smaller, because the consequence of
   * overstating it is a context overflow eve was trying to prevent.
   */
  ...(provider ? { modelContextWindowTokens: 200_000 } : {}),

  reasoning: "medium",
  limits: {
    maxInputTokensPerSession: 400_000,
    maxOutputTokensPerSession: 60_000,
    // One batch, one sitting. A repair desk session that outlives the value date
    // is not a session, it is an unsupervised process.
    sessionTimeoutMs: 4 * 60 * 60 * 1_000,
  },
});
