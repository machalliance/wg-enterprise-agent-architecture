import Link from "next/link";
import { BATCH } from "@/app/_data/queue";
import { cn } from "@/lib/utils";

export function DeskChrome({
  active,
}: {
  readonly active: "desk" | "architecture";
}) {
  return (
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b-2 border-foreground bg-surface px-4 py-3.5 sm:px-6">
      <div className="min-w-0">
        <p className="wp-eyebrow">Archetype 3</p>
        <h1 className="truncate font-condensed text-[25px] uppercase tracking-[0.04em]">
          Meridian Terminus
        </h1>
      </div>
      <dl className="hidden items-center gap-6 font-mono text-[13px] md:flex">
        <div>
          <dt className="text-text-3">Batch</dt>
          <dd>{BATCH.batchId}</dd>
        </div>
        <div>
          <dt className="text-text-3">Value date</dt>
          <dd>{BATCH.valueDate}</dd>
        </div>
        <div>
          <dt className="text-text-3">Debtor</dt>
          <dd className="max-w-56 truncate font-sans">{BATCH.debtor}</dd>
        </div>
      </dl>
      <nav className="flex shrink-0 items-center gap-1.5">
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
        "rounded-full border px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.06em] transition-colors",
        current
          ? "border-action bg-action-wash text-action"
          : "border-border text-text-3 hover:bg-fill hover:text-foreground",
      )}
      href={href}
    >
      {children}
    </Link>
  );
}
