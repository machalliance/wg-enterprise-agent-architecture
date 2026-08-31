/**
 * Escalation queue (M3).
 *
 * When the policy classifier returns ESCALATE, the proposed price change is held
 * here instead of executing. An operator approves or rejects it (via the control
 * plane in M6, or the approvals CLI now). Approving releases the held change to
 * the commerce server; rejecting discards it and tells the agent.
 *
 * Backed by an append-only JSONL file so the full history (including status
 * transitions) is inspectable. The current state is the last record per id.
 */

import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_QUEUE_PATH = resolve(__dirname, "..", "escalation-queue.jsonl");

export type EscalationStatus = "pending" | "approved" | "rejected";

export interface EscalatedAction {
  id: string;
  timestamp: string;
  sku: string;
  proposedPrice: number;
  currentPrice: number;
  changePct: number;
  reason: string; // the agent's reasoning
  tierResult: string; // e.g. "ESCALATE:EXCEEDS_NOTIFY_THRESHOLD"
  explanation: string; // human-readable policy explanation
  status: EscalationStatus;
}

interface QueueEvent {
  event: "created" | "approved" | "rejected";
  at: string;
  action: EscalatedAction;
}

export class EscalationQueue {
  private readonly path: string;

  constructor(path: string = process.env.ESCALATION_QUEUE_PATH || DEFAULT_QUEUE_PATH) {
    this.path = path;
  }

  private append(ev: QueueEvent): void {
    appendFileSync(this.path, JSON.stringify(ev) + "\n");
  }

  /** Replay the JSONL to reconstruct the latest state of every action. */
  private readAll(): Map<string, EscalatedAction> {
    const byId = new Map<string, EscalatedAction>();
    if (!existsSync(this.path)) return byId;
    const lines = readFileSync(this.path, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line) as QueueEvent;
        byId.set(ev.action.id, ev.action);
      } catch {
        // skip malformed lines
      }
    }
    return byId;
  }

  /** Hold a new escalated action. Returns its generated id. */
  enqueue(input: Omit<EscalatedAction, "id" | "timestamp" | "status">): EscalatedAction {
    const action: EscalatedAction = {
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      status: "pending",
      ...input,
    };
    this.append({ event: "created", at: action.timestamp, action });
    return action;
  }

  get(id: string): EscalatedAction | undefined {
    return this.readAll().get(id);
  }

  listPending(): EscalatedAction[] {
    return [...this.readAll().values()].filter((a) => a.status === "pending");
  }

  listAll(): EscalatedAction[] {
    return [...this.readAll().values()];
  }

  /** Mark approved. Returns the updated action, or undefined if not found/not pending. */
  approve(id: string): EscalatedAction | undefined {
    const action = this.get(id);
    if (!action || action.status !== "pending") return undefined;
    const updated: EscalatedAction = { ...action, status: "approved" };
    this.append({ event: "approved", at: new Date().toISOString(), action: updated });
    return updated;
  }

  /** Mark rejected. Returns the updated action, or undefined if not found/not pending. */
  reject(id: string): EscalatedAction | undefined {
    const action = this.get(id);
    if (!action || action.status !== "pending") return undefined;
    const updated: EscalatedAction = { ...action, status: "rejected" };
    this.append({ event: "rejected", at: new Date().toISOString(), action: updated });
    return updated;
  }
}
