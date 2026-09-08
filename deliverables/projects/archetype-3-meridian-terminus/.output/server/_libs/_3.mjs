import { fileURLToPath as __eveFileURLToPath } from "node:url";
import { dirname as __eveDirname } from "node:path";
const __filename = __eveFileURLToPath(import.meta.url);
__eveDirname(__filename);
import { i as gateway } from "./@ai-sdk/gateway+[...].mjs";
import "./ai.mjs";
export { gateway };
