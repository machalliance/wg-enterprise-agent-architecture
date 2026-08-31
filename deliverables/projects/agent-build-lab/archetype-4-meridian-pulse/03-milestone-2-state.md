# Milestone 2: Durable state & checkpointing

**Goal:** the agent accumulates context over cycles and survives a crash. Kill it, restart it, and it
resumes from the last checkpoint rather than from zero, with its learned patterns and active
hypotheses intact.

**Why it matters:** the agent accumulates context over hours, days, or weeks. Losing that state
mid-operation is not a minor inconvenience; it is a correctness failure. Short-term working memory is
distinct from long-term learned context, and each needs different retention and recovery guarantees.

---

## In scope
- **Checkpoint store** (SQLite): the agent's accumulated context persisted every N cycles.
- **Working memory** and **long-term context** separated with different retention.
- **Resume from checkpoint** after a crash or kill; the agent picks up where it left off.
- **State versioning**: prior checkpoints retained for rollback and forensic review.

## Out of scope
- Complex memory retrieval / RAG for context window management (documented as production extension).
- Multi-session agent coordination.

---

## Build tasks

1. **Checkpoint schema:**
   ```sql
   -- packages/agent/checkpoint.db
   CREATE TABLE checkpoints (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     cycle_number INTEGER NOT NULL,
     created_at TEXT NOT NULL,
     working_memory TEXT NOT NULL,      -- JSON: current hypotheses, in-flight evaluations
     long_term_context TEXT NOT NULL,   -- JSON: learned patterns, supplier reliability, what worked
     active_skus TEXT NOT NULL,         -- JSON: SKUs currently under management with last action
     hash TEXT NOT NULL                 -- SHA-256 of the above for integrity
   );
   ```

2. **Working memory** (short-term, overwritten each checkpoint):
   ```jsonc
   {
     "currentCycle": 47,
     "inFlightActions": [
       { "sku": "MER-TENT-3S", "proposedPrice": 189.99, "awaitingOutcome": true }
     ],
     "recentObservations": [
       { "cycle": 46, "sku": "MER-TENT-3S", "action": "price_reduced", "outcome": "conversion_up_12pct" }
     ]
   }
   ```

3. **Long-term context** (accumulated, grows over time):
   ```jsonc
   {
     "learnedPatterns": [
       { "pattern": "MER-TENT-3S responds to competitor within 4% elastic", "confidence": 0.85, "since": "cycle_12" },
       { "pattern": "hydration category inelastic below $25", "confidence": 0.72, "since": "cycle_31" }
     ],
     "categoryBaselines": {
       "outdoor-tents": { "avgMargin": 0.34, "avgAdjustmentsPerDay": 3 },
       "hydration": { "avgMargin": 0.42, "avgAdjustmentsPerDay": 1 }
     }
   }
   ```

4. **Checkpoint on cycle boundary.** After each perceive→reason→act→observe cycle completes, persist
   the current state. Use Goose's session persistence or a custom hook that writes to SQLite:
   ```ts
   async function checkpoint(agent: AgentState, cycleNumber: number) {
     const record = {
       cycle_number: cycleNumber,
       created_at: new Date().toISOString(),
       working_memory: JSON.stringify(agent.workingMemory),
       long_term_context: JSON.stringify(agent.longTermContext),
       active_skus: JSON.stringify(agent.activeSkus),
     };
     record.hash = sha256(JSON.stringify(record));
     await db.insert("checkpoints", record);
   }
   ```

5. **Resume from checkpoint on startup.** When the agent starts, check for the latest checkpoint.
   If found, load it into the agent's context before the first cycle:
   ```ts
   const lastCheckpoint = await db.query("SELECT * FROM checkpoints ORDER BY id DESC LIMIT 1");
   if (lastCheckpoint) {
     agent.workingMemory = JSON.parse(lastCheckpoint.working_memory);
     agent.longTermContext = JSON.parse(lastCheckpoint.long_term_context);
     agent.cycleNumber = lastCheckpoint.cycle_number + 1;
     console.log(`Resumed from checkpoint at cycle ${lastCheckpoint.cycle_number}`);
   }
   ```

6. **Retention policy.** Keep the last 50 checkpoints. Older ones are pruned, but the hash chain
   (each record's hash includes the prior record's hash) is preserved for integrity verification.

---

## Acceptance criteria (demo checkpoint)
- [ ] After 10+ cycles, `checkpoint.db` contains multiple records with growing `long_term_context`.
- [ ] Kill the agent process. Restart it. The first log line says "Resumed from checkpoint at
      cycle N" and the agent's next reasoning references patterns it learned *before* the restart.
- [ ] The agent does not re-propose an action that was already in-flight at the time of the crash
      (working memory preserves in-flight state).
- [ ] Two successive checkpoints show different `working_memory` but consistent `long_term_context`
      growth, demonstrating the separation.
- [ ] Tampering with a checkpoint record (changing a price in `long_term_context`) breaks the hash
      chain and is detectable by a verification query.

## Stretch
- Implement a "rollback to checkpoint N" command that rewinds the agent's context to a known-good
  state (useful for the M5 recovery demo).
- Show context growth: after 20 cycles the agent's reasoning explicitly references a pattern it
  could not have known at cycle 1.
