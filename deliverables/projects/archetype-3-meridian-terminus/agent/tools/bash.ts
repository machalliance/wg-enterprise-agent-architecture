import { disableTool } from "eve/tools";

/**
 * A payment repair desk has no business owning a shell.
 *
 * eve ships `bash`, `read_file` and `write_file` by default, proxying into the
 * sandbox. Left in place they would be a second action surface running alongside
 * the eight audited tools — one with no tier check, no citation requirement, no
 * screening guard and no entry in the mandate's write allow-list.
 *
 * That is the quiet way an agent's authority grows past what anyone intended:
 * not by someone adding a dangerous tool, but by nobody removing a general one.
 */
export default disableTool();
