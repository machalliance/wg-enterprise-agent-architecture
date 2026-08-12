import type { z } from "zod";

/**
 * ONE shared, provider-agnostic LLM client for all four agents (buyer + three suppliers). It
 * speaks the OpenAI **Chat Completions** API (`POST {base}/chat/completions`) with **tool calling**
 * for structured output, so no agent code is tied to a provider: point `LLM_BASE_URL` at any
 * OpenAI-compatible gateway (Vercel AI Gateway, OpenRouter, …) and the four agents may even run on
 * different models — a heterogeneous negotiation, honest to the archetype, as a config change.
 *
 * Load-bearing constraint: this is a CLIENT LIBRARY, never a meeting point. Each agent imports it,
 * builds its OWN private prompt + tool, and gets back only its own decision. There is no shared state
 * in THIS process. The gateway, however, is a TRUSTED party: when the four agents point at the same
 * `LLM_BASE_URL`/`LLM_API_KEY` it does see each side's prompts and could in principle correlate the two
 * halves of a negotiation. The isolation here is architectural — no shared in-process state, each
 * agent's decision private to it — not a guarantee against a hostile gateway; point agents at distinct
 * gateways/keys if that matters. The model output is always clamped by the caller onto the negotiation state
 * machine (and, for the buyer, the mandate) before anything is signed, so turning the agents into
 * LLMs adds no new wire risk.
 */

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Resolve this agent's LLM config from the environment. Returns null when `LLM_BASE_URL` is unset —
 * the signal for the caller to fall back to its deterministic reasoner, so the demo runs offline and
 * in CI with no key. A per-agent model override (`BUYER_LLM_MODEL`, `SUMMIT_LLM_MODEL`, …) wins over
 * the shared `LLM_MODEL`.
 */
/** Sensible default when a gateway is configured but no model named — a reliable tool-calling model. */
export const DEFAULT_LLM_MODEL = "deepseek/deepseek-v3.2";

export function llmConfigFromEnv(agent: string): LlmConfig | null {
  const baseUrl = process.env.LLM_BASE_URL?.replace(/\/+$/, "");
  if (!baseUrl) return null;
  const perAgent = process.env[`${agent.toUpperCase()}_LLM_MODEL`];
  const model = perAgent ?? process.env.LLM_MODEL ?? DEFAULT_LLM_MODEL;
  return { baseUrl, apiKey: process.env.LLM_API_KEY ?? "PLACEHOLDER", model };
}

/** The single tool an agent forces the model to call, plus a zod schema to validate its arguments. */
export interface ToolSpec<T> {
  name: string;
  description: string;
  /** JSON Schema for the tool's `parameters` (OpenAI function-calling shape). */
  parameters: Record<string, unknown>;
  /** zod schema the returned arguments are parsed with — the structured-output guarantee. */
  schema: z.ZodType<T>;
}

export interface AskOptions<T> {
  config: LlmConfig;
  system: string;
  user: string;
  tool: ToolSpec<T>;
  /** Retries on 429/5xx/network before giving up (caller then falls back). Default 4. */
  retries?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Per-attempt deadline in ms. Default 30s. Composed WITH `signal` — caller cancellation still wins. */
  timeoutMs?: number;
}

/** Default per-request deadline so a hung gateway can never wedge a negotiation turn indefinitely. */
const DEFAULT_TIMEOUT_MS = 30_000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A gateway failure that must NOT be retried (a non-retriable 4xx). Short-circuits the retry loop. */
class PermanentLlmError extends Error {}

/**
 * Ask the model for one forced tool call and return its zod-validated arguments. Retries transient
 * gateway failures (429 rate-limit, 5xx, network) with exponential backoff; throws once retries are
 * exhausted so the caller can fall back to its deterministic reasoner. `temperature: 0` by default so
 * the demo's three outcomes reproduce live.
 */
export async function askForTool<T>(opts: AskOptions<T>): Promise<T> {
  const { config, system, user, tool } = opts;
  const retries = opts.retries ?? 4;
  const body = {
    model: config.model,
    temperature: opts.temperature ?? 0,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
    tool_choice: { type: "function", function: { name: tool.name } },
  };

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) await delay(Math.min(4000, 300 * 2 ** (attempt - 1)));
    try {
      // Fresh per-attempt deadline, composed with any caller cancellation: whichever fires first aborts
      // this attempt. A caller abort surfaces as AbortError (not retried); the internal timeout is a
      // TimeoutError (treated as transient, so a hung attempt is retried up to the cap).
      const deadline = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      const signal = opts.signal ? AbortSignal.any([opts.signal, deadline]) : deadline;
      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });
      if (!res.ok) {
        // 429 and 5xx are transient upstream conditions worth retrying; a non-retriable 4xx (bad
        // request, auth, model-not-found) will fail identically on every retry — surface it at once.
        const retriable = res.status === 429 || res.status >= 500;
        const text = await res.text().catch(() => "");
        const msg = `LLM gateway ${res.status}: ${text.slice(0, 200)}`;
        if (!retriable) throw new PermanentLlmError(msg);
        lastErr = new Error(msg);
        if (attempt < retries) continue;
        throw lastErr;
      }
      const data = (await res.json()) as {
        choices?: Array<{ message?: { tool_calls?: Array<{ function?: { arguments?: string } }> } }>;
      };
      const args = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
      if (!args) throw new Error("LLM returned no tool call");
      return tool.schema.parse(JSON.parse(args));
    } catch (err) {
      lastErr = err;
      // A permanent gateway error (non-retriable 4xx) or an aborted request must never be retried —
      // re-throw immediately. A parse/JSON error IS retried (one reroll can fix a malformed tool call),
      // up to the cap, rather than failing the whole turn on the first malformed response.
      if (err instanceof PermanentLlmError) throw err;
      if (err instanceof Error && err.name === "AbortError") throw err;
      if (attempt >= retries) break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
