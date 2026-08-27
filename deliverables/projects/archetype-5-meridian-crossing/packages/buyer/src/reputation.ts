import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Counterparty reputation. A seeded static score per DID that the buyer DOWN-WEIGHTS within a
 * session when it observes bad-faith behaviour — a stall (no concession round over round) or a probe
 * (a message fishing for the buyer's limits). A score that falls below the mandate's floor triggers an
 * early walk-away: the buyer stops spending its round budget on a counterparty it no longer trusts.
 *
 * IN scope: seeded score + in-session down-weighting. OUT of scope: learning reputation across many
 * negotiations — that is the `persist()` hook below, deliberately a no-op here. Wire it to the buyer's
 * store to carry a supplier's reputation from one negotiation to the next.
 */

interface ReputationFile {
  scores: Record<string, number>;
}

function reputationPath(): string {
  return fileURLToPath(new URL("../../../seed/reputation.json", import.meta.url));
}

const STALL_PENALTY = 0.05;
const PROBE_PENALTY = 0.25;

export class ReputationBook {
  private readonly scores: Map<string, number>;

  constructor(seed: Record<string, number> = {}) {
    this.scores = new Map(Object.entries(seed));
  }

  static fromSeed(): ReputationBook {
    const path = reputationPath();
    // Both fallbacks are LOUD. An empty book is not a harmless default: every DID then scores the
    // neutral-low 0.5 from `score()`, which silently relaxes the reputation walk-away floor for a
    // counterparty the seed may have marked as untrustworthy. Failing open on a missing or corrupt seed
    // is the safe engineering choice for a demo, but it must never be a quiet one.
    if (!existsSync(path)) {
      console.error(`[buyer] reputation seed not found at ${path} — every supplier starts at the neutral score`);
      return new ReputationBook();
    }
    try {
      const file = JSON.parse(readFileSync(path, "utf8")) as ReputationFile;
      return new ReputationBook(file.scores ?? {});
    } catch (err) {
      console.error(
        `[buyer] reputation seed at ${path} could not be read — every supplier starts at the neutral score: ` +
          `${err instanceof Error ? err.message : String(err)}`,
      );
      return new ReputationBook();
    }
  }

  /** Current score for a DID. Unknown counterparties start neutral-low (novel, unproven). */
  score(did: string): number {
    return this.scores.get(did) ?? 0.5;
  }

  private penalize(did: string, amount: number): number {
    const next = Math.max(0, this.score(did) - amount);
    this.scores.set(did, next);
    return next;
  }

  /** Round with no downward price movement — a stall. Lowers the score a little. */
  noteStall(did: string): number {
    return this.penalize(did, STALL_PENALTY);
  }

  /** A detected attempt to fish for the buyer's limits — a serious red flag. Lowers the score a lot. */
  noteProbe(did: string): number {
    return this.penalize(did, PROBE_PENALTY);
  }

  /** True when the counterparty has dropped below the mandate floor — walk away early. */
  belowFloor(did: string, floor: number): boolean {
    return this.score(did) < floor;
  }

  /**
   * Cross-session learning hook. In production this writes the current scores back to the buyer's own
   * store so a supplier's reputation persists across negotiations. Intentionally a no-op in the
   * prototype — reputation resets each run so the demo is reproducible.
   */
  persist(): void {
    /* documented hook — see reference prototype notes */
  }
}
