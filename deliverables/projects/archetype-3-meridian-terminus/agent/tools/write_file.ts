import { disableTool } from "eve/tools";

/**
 * See `bash.ts`.
 *
 * This one is the sharpest of the five. `apply_repair` is the only writer in the
 * architecture, and every claim in the README rests on that being true — the
 * approval policy, the screening freeze, the mandate allow-list and the citation
 * requirement all live on that one path. A general-purpose file writer sitting
 * beside it would route around all four.
 */
export default disableTool();
