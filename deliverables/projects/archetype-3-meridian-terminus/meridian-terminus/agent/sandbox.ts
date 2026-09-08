import { defineSandbox } from "eve/sandbox";
import { justbash } from "eve/sandbox/just-bash";

/**
 * The sandbox this agent has and never uses.
 *
 * Every eve agent gets exactly one sandbox, so the question is not whether to
 * have one but how capable to make it. This desk reaches the world only through
 * eight typed tools, all of which run in the app runtime — so the right answer
 * is the least capable backend on offer, plus no tool that can reach it. The
 * five `disableTool()` files next door remove `bash`, `read_file`, `write_file`,
 * `web_fetch` and `web_search` from the model's surface entirely.
 *
 * `justbash()` is a pure-JS interpreter with no real binaries. It is pinned
 * rather than left to `defaultBackend()` for two reasons, one architectural and
 * one practical:
 *
 *   - Architectural: the action surface is closed at the tool layer, which is
 *     where it should be closed. A network policy on a stronger backend would be
 *     defending a door nothing can walk through, and would read as though the
 *     firewall were the control.
 *
 *   - Practical: `defaultBackend()` resolves Vercel → Docker → microsandbox →
 *     just-bash, so the same code silently gets a different isolation posture on
 *     every machine — and on a host with no Docker daemon it lands on just-bash
 *     anyway, but unpinned, which fails at startup unless the package is
 *     installed. Pinning makes the weakest case the only case, and therefore the
 *     one that gets reviewed.
 *
 * Note what this deliberately is NOT: a hardened sandbox. just-bash has no
 * network isolation to configure and rejects `setNetworkPolicy` outright. If you
 * fork this and give the agent a tool that shells out, this file becomes wrong
 * immediately — pin `docker()` or `microsandbox()` and set `networkPolicy` on
 * the factory. See docs/known-limitations.md.
 */
export default defineSandbox({
  backend: justbash(),
});
