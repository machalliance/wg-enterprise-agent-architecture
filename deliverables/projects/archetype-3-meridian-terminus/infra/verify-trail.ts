/**
 * Verify a run's trail end to end.
 *
 * With no argument it checks every trail in trails/. A trail that verifies tells
 * you the file has not been edited since it was written. It does not tell you
 * the file is the only file, or that the run wrote everything it did — that is
 * a bucket-4 problem and this is deliberately the bucket-3 version.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { trailsDir } from "../agent/lib/refdata.ts";
import { verifyTrail, type TrailRecord } from "../agent/lib/trail.ts";

const explicit = process.argv[2];
const files = explicit
  ? [explicit]
  : readdirSync(trailsDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => join(trailsDir, f));

if (files.length === 0) {
  console.log("No trails found. Run `npm run replay` first.");
  process.exit(0);
}

let failures = 0;
for (const file of files) {
  const result = verifyTrail(file);
  const lines = readFileSync(file, "utf8").trim().split("\n").filter(Boolean);
  const records = lines.map((l) => JSON.parse(l) as TrailRecord);
  const counts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.kind] = (acc[r.kind] ?? 0) + 1;
    return acc;
  }, {});
  const terminal = records.filter((r) => r.kind === "termination").at(-1);

  console.log(`${result.ok ? "OK  " : "BAD "} ${file}`);
  console.log(`     ${records.length} records  ${JSON.stringify(counts)}`);
  console.log(
    `     ends: ${terminal ? terminal.summary : "NO TERMINATION RECORD — the run did not declare an ending"}`,
  );
  if (!result.ok) {
    failures += 1;
    console.log(`     chain breaks at record ${result.brokenAt}`);
  }
  if (!terminal) failures += 1;
}

process.exit(failures === 0 ? 0 : 1);
