import { BATCH } from "@/app/_data/queue";
import { AgentChat } from "./agent-chat";
import { DeskChrome } from "./desk-chrome";

export function RepairDesk({
  sessionId,
}: {
  readonly sessionId?: string;
}) {
  const holds = BATCH.instructions.filter((row) => row.hold !== null).length;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <DeskChrome active="desk" />

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-88 shrink-0 flex-col border-r border-border lg:flex">
          <div className="flex items-baseline justify-between px-4 py-3">
            <h2 className="text-sm font-medium">Repair queue</h2>
            <p className="font-mono text-[11px] text-muted-foreground">
              {BATCH.instructions.length} RJCT · {holds} hold
            </p>
          </div>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {BATCH.instructions.map((row) => (
              <li key={row.txId} className="border-t border-border px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs">{row.txId}</p>
                    <p className="truncate text-sm">{row.creditor}</p>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {row.endToEndId} · {row.country}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-mono text-xs">{row.amount}</p>
                    <p className="mt-1 font-mono text-[10px] tracking-wide text-muted-foreground">
                      {row.scheme}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <StatusChip tone={row.hold ? "hold" : "reject"}>
                    {row.hold ?? "RJCT"}
                  </StatusChip>
                </div>
              </li>
            ))}
          </ol>
        </aside>

        <section className="flex min-w-0 flex-1 flex-col">
          <AgentChat sessionId={sessionId} />
        </section>
      </div>
    </div>
  );
}

function StatusChip({
  children,
  tone,
}: {
  readonly children: string;
  readonly tone: "reject" | "hold";
}) {
  return (
    <span
      className={
        tone === "hold"
          ? "rounded-sm bg-amber-500/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-amber-200"
          : "rounded-sm bg-destructive/15 px-1.5 py-0.5 font-mono text-[10px] tracking-wide text-red-300"
      }
    >
      {children}
    </span>
  );
}
