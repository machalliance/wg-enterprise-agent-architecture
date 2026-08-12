import { randomBytes } from "node:crypto";

/**
 * Decide the CONTROL_TOKEN the launcher hands its child processes.
 *
 * Extracted from demo.mjs so it can be tested at all: demo.mjs spawns the whole agent fleet from top-level
 * code, so importing it to check one value would boot the demo. The rule is small but it is the difference
 * between the control surface being authenticated and running wide open, and the auto-provisioned branch had
 * no coverage — every test and sweep set the token explicitly, which is precisely the path that does NOT
 * exercise this.
 *
 * The rule:
 *   - An operator-set CONTROL_TOKEN always wins, so a value pinned in the shell or `.env.local` is honoured.
 *   - Otherwise a fresh random token is minted, but ONLY when the control surface is actually reachable
 *     (`--web` brings up the dashboard; `--usdc` exposes the money routes, which fail closed without one).
 *   - Otherwise the empty string: a terminal, non-settlement run has no control surface to protect, and
 *     minting a token there would imply an authentication boundary that nothing is behind.
 */
export function provisionControlToken({ web, usdc, existing }) {
  if (existing) return existing;
  return web || usdc ? randomBytes(24).toString("hex") : "";
}
