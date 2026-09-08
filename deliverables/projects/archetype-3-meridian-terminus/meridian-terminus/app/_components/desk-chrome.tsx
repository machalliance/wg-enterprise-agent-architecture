import Link from "next/link";
import { BATCH } from "@/app/_data/queue";
import { cn } from "@/lib/utils";

export function DeskChrome({
  active,
}: {
  readonly active: "desk" | "architecture";
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
      <div className="min-w-0">
        <p className="font-mono text-[11px] tracking-[0.22em] text-primary uppercase">
          Bucket 3
        </p>
        <h1 className="truncate text-lg font-medium tracking-tight">Agent example</h1>
      </div>
      <dl className="hidden items-center gap-6 text-xs md:flex">
        <div>
          <dt className="text-muted-foreground">Batch</dt>
          <dd className="font-mono">{BATCH.batchId}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Value date</dt>
          <dd className="font-mono">{BATCH.valueDate}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Debtor</dt>
          <dd className="max-w-56 truncate">{BATCH.debtor}</dd>
        </div>
      </dl>
      <nav className="flex shrink-0 items-center gap-1 rounded-md border border-border p-0.5 text-xs">
        <NavChip href="/" current={active === "desk"}>
          Desk
        </NavChip>
        <NavChip href="/architecture" current={active === "architecture"}>
          Architecture
        </NavChip>
      </nav>
    </header>
  );
}

function NavChip({
  href,
  current,
  children,
}: {
  readonly href: string;
  readonly current: boolean;
  readonly children: string;
}) {
  return (
    <Link
      aria-current={current ? "page" : undefined}
      className={cn(
        "rounded-sm px-2.5 py-1 font-medium transition-colors",
        current
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
