export function ArchitectureView() {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-6xl flex-col gap-10 px-4 py-8 sm:px-6">
        <section className="max-w-3xl">
          <p className="wp-eyebrow">Archetype 3 · Goal-directed agent</p>
          <h2 className="mt-2 font-condensed text-4xl uppercase tracking-[0.03em]">
            The path is gone. The session still ends.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            MACH Alliance archetype 3 hands the system a goal and a toolset, then
            lets the model invent the steps. This example applies that shape to
            one failed outbound payment batch: inspect, investigate, act,
            re-validate, adapt, and stop. Vercel hosts the loop; it does not
            draw the flowchart.
          </p>
        </section>

        <RuntimeDiagram />
        <LoopStrip />
        <VercelStack />
        <GuardrailGrid />
        <Terminals />
        <MappingTable />
      </div>
    </div>
  );
}

function RuntimeDiagram() {
  return (
    <section aria-label="Vercel architecture diagram">
      <div className="rounded-md border border-border bg-surface p-4 sm:p-6">
        <p className="wp-eyebrow">Vercel · one project, one origin</p>

        <div className="mt-4 grid gap-3">
          <DiagramRow
            label="Intake"
            title="Desk UI"
            detail="Next.js on the CDN. Goal is posted same-origin to /eve/v1/session."
          />
          <DiagramArrow />
          <div className="rounded-md border border-action bg-action-wash p-3 sm:p-4">
            <p className="font-mono text-[10px] tracking-[0.16em] text-action uppercase">
              eve runtime · Fluid Compute + Workflow
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["Goal", "Reason", "Select", "Act"].map((name) => (
                <div
                  key={name}
                  className="rounded-sm border border-border bg-surface px-2 py-2 text-center text-xs font-medium"
                >
                  {name}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center font-mono text-[10px] text-text-3">
              observe → adapt → reason again · until a terminal
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              <Mini label="AI Gateway" value="Claude Sonnet via OIDC" />
              <Mini label="Guardrails" value="allow-list · mandate · budget" />
              <Mini label="Identity" value="ephemeral wrun_* session" />
            </div>
          </div>
          <DiagramArrow />
          <div className="grid gap-2 sm:grid-cols-4">
            <Mini label="Read" value="queue · instruction · screening" />
            <Mini label="Lookup" value="reference data · scheme rules" />
            <Mini label="Write" value="apply_repair + re-validate" />
            <Mini label="Escalate" value="Tier C desks, untouched" />
          </div>
          <DiagramArrow />
          <DiagramRow
            label="Ground truth"
            title="Payment engine (seed)"
            detail="Validation, screening, and standing reference data. The model does not get to declare a repair successful."
          />
          <DiagramArrow />
          <DiagramRow
            label="Finish"
            title="close_batch + hash-chained trail"
            detail="GOAL_ACHIEVED · BLOCKED · BUDGET_EXHAUSTED. Session released. Agent Runs keeps the episode."
          />
        </div>
      </div>
    </section>
  );
}

function DiagramRow({
  label,
  title,
  detail,
}: {
  readonly label: string;
  readonly title: string;
  readonly detail: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-hairline bg-surface px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
      <p className="w-24 shrink-0 font-mono text-[10px] tracking-[0.16em] text-signal uppercase">
        {label}
      </p>
      <div>
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}

function DiagramArrow() {
  return (
    <p aria-hidden="true" className="text-center font-mono text-xs text-signal">
      ↓
    </p>
  );
}

function Mini({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-sm border border-hairline bg-surface px-3 py-2">
      <p className="font-mono text-[10px] text-signal">{label}</p>
      <p className="mt-0.5 text-xs text-text-3">{value}</p>
    </div>
  );
}

function LoopStrip() {
  const steps = [
    {
      n: "01",
      title: "Inspect",
      body: "list_repair_queue and get_screening_status load the failing instructions. No path is prescribed.",
    },
    {
      n: "02",
      title: "Investigate",
      body: "get_instruction, lookup_reference_data, and validate_instruction form a hypothesis against standing data.",
    },
    {
      n: "03",
      title: "Act",
      body: "apply_repair writes inside the mandate, or escalate_to_desk parks what the desk must not touch.",
    },
    {
      n: "04",
      title: "Adapt",
      body: "The validation engine is ground truth. A repair that exposes a new finding is a new step, not a failure.",
    },
    {
      n: "05",
      title: "Finish",
      body: "close_batch accepts only GOAL_ACHIEVED, BLOCKED, or BUDGET_EXHAUSTED — then the session is released.",
    },
  ];

  return (
    <section>
      <h3 className="wp-title text-lg">Operational loop</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Perceive → reason → act → observe. The agent owns the next step; the
        engine owns whether it worked.
      </p>
      <ol className="mt-4 grid gap-3 md:grid-cols-5">
        {steps.map((step) => (
          <li
            key={step.n}
            className="rounded-md border border-border bg-surface p-3"
          >
            <p className="font-mono text-[11px] text-signal">{step.n}</p>
            <p className="mt-1 text-sm font-medium">{step.title}</p>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function VercelStack() {
  return (
    <section>
      <h3 className="wp-title text-lg">How Vercel hosts the loop</h3>
      <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
        One project, one origin. The Next.js desk and the eve runtime deploy
        together. The browser never crosses a CORS boundary to talk to the
        agent.
      </p>

      <div className="mt-4 overflow-hidden rounded-md border border-border">
        <div className="border-b border-border bg-action-wash px-4 py-2">
          <p className="font-mono text-[11px] tracking-[0.18em] text-action uppercase">
            Vercel production
          </p>
        </div>

        <div className="grid gap-px bg-border md:grid-cols-3">
          <StackCard
            kicker="Intake"
            title="Next.js on the CDN"
            body="The desk is the invoking human's console. Open the batch posts the goal to /eve/v1/session. withEve rewrites those routes onto the agent service before filesystem routing."
          />
          <StackCard
            kicker="Runtime"
            title="eve on Fluid Compute"
            body="The model directs its own tool use. Durable turns run as Vercel Workflows, so a parked approval or a mid-repair retry does not lose the session cursor."
          />
          <StackCard
            kicker="Reasoning"
            title="AI Gateway"
            body="anthropic/claude-sonnet-5 is a Gateway model id. The deployment authenticates with project OIDC — no provider key in the repo, no standing credential for the desk."
          />
        </div>

        <div className="grid gap-px bg-border md:grid-cols-3">
          <StackCard
            kicker="Guardrails"
            title="Tool allow-list in code"
            body="bash, read_file, write_file, web_fetch, and web_search are disableTool(). The action surface is the eight typed payment tools, not the sandbox."
          />
          <StackCard
            kicker="Systems"
            title="Seed payment engine"
            body="Batch, screening, and reference data stand in for PIM / validation / taxonomy. apply_repair re-validates against that engine after every write."
          />
          <StackCard
            kicker="Observability"
            title="Trail + Agent Runs"
            body="A hash-chained per-run trail records goal, reasoning, tool I/O, approvals, and the terminal. Vercel Agent Runs reconstructs the same episode from the platform side."
          />
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Session identity is the eve <span className="font-mono">wrun_*</span>{" "}
            id. It is created when the goal arrives, used as the credential for
            every tool call, and released at <span className="font-mono">close_batch</span>.
            There is no standing machine identity — that would be archetype 4.
          </p>
        </div>
      </div>
    </section>
  );
}

function StackCard({
  kicker,
  title,
  body,
}: {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
}) {
  return (
    <article className="bg-surface p-4">
      <p className="font-mono text-[10px] tracking-[0.16em] text-signal uppercase">
        {kicker}
      </p>
      <h4 className="mt-1 text-sm font-medium">{title}</h4>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{body}</p>
    </article>
  );
}

function GuardrailGrid() {
  const rows = [
    {
      spec: "Permission scope",
      here: "Mandate write-scope. Debtor-side fields and currency are unreachable, not discouraged.",
    },
    {
      spec: "Tool allow-list",
      here: "Eight payment tools. Framework shell and web tools removed so authority cannot grow by omission.",
    },
    {
      spec: "Iteration & budget",
      here: "Step and tool-call ceilings in seed/mandate.json, enforced in the tool layer. Exhausted tools return BUDGET_EXHAUSTED.",
    },
    {
      spec: "Stop conditions",
      here: "close_batch is the only ending. GOAL_ACHIEVED is refused while any instruction is unaccounted for.",
    },
    {
      spec: "Human checkpoints",
      here: "Tier A auto-executes. Tier B parks for maker-checker. Tier C (screening) is denied — never offered as an approval.",
    },
  ];

  return (
    <section>
      <h3 className="wp-title text-lg">Guardrails bound the loop</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        The agent chooses its own steps. It cannot choose its own tools, exceed
        its budget, or outlive its session.
      </p>
      <div className="mt-4 overflow-hidden rounded-md border border-border bg-surface">
        {rows.map((row) => (
          <div
            key={row.spec}
            className="grid gap-2 border-b border-hairline px-4 py-3 last:border-b-0 md:grid-cols-[11rem_1fr]"
          >
            <p className="font-mono text-[11px] text-signal">{row.spec}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{row.here}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function Terminals() {
  const ends = [
    {
      code: "GOAL_ACHIEVED",
      meaning:
        "Every instruction passes validation and is screening-clear, or carries a reason code and a named owner.",
    },
    {
      code: "BLOCKED",
      meaning:
        "Work remains that needs a decision this desk cannot make. State comes back with the human.",
    },
    {
      code: "BUDGET_EXHAUSTED",
      meaning:
        "A ceiling was reached. Partial progress is reported; the remainder is named. This is the guaranteed stop.",
    },
  ];

  return (
    <section>
      <h3 className="wp-title text-lg">Three terminals — the full decision space</h3>
      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {ends.map((end) => (
          <article key={end.code} className="rounded-md border border-border bg-surface p-4">
            <p className="font-mono text-xs font-semibold text-signal">{end.code}</p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              {end.meaning}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}

function MappingTable() {
  const rows = [
    ["Goal intake", "Open the batch → POST /eve/v1/session", "Next.js UI on Vercel"],
    ["Reasoning engine", "agent.ts model + instructions.md", "AI Gateway + OIDC"],
    ["Tool selector", "Model-chosen calls against the allow-list", "eve harness"],
    ["Action executor", "apply_repair / escalate_to_desk", "Vercel Function / Workflow step"],
    ["Ground truth", "validate_instruction after every write", "Seed validation engine"],
    ["Catalog systems analog", "batch.json, screening.json, reference-data.json", "In-process seed (prototype)"],
    ["Ephemeral identity", "wrun_* session, released at close", "eve session cursor"],
    ["Reasoning traces", "hooks/trail.ts + hash-chained JSONL", "Vercel Agent Runs"],
    ["Outcome record", "close_batch writes *.outcome.json", "Trail artifact"],
  ];

  return (
    <section className="pb-8">
      <h3 className="wp-title text-lg">Spec → this desk → Vercel</h3>
      <div className="mt-4 overflow-x-auto rounded-md border border-border bg-surface">
        <table className="w-full min-w-[40rem] text-left text-xs">
          <thead className="border-b-2 border-foreground text-text-2">
            <tr>
              <th className="px-4 py-2 font-medium">Archetype 3 component</th>
              <th className="px-4 py-2 font-medium">This example</th>
              <th className="px-4 py-2 font-medium">Vercel</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row[0]} className="border-b border-hairline last:border-b-0">
                <td className="px-4 py-2.5 font-medium">{row[0]}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                  {row[1]}
                </td>
                <td className="px-4 py-2.5 text-muted-foreground">{row[2]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
