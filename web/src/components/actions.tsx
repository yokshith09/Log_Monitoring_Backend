import { useState } from "react";
import { buildHash, type PageId } from "@/lib/nav";
import type { Action, Priority, SectionSummary } from "@/lib/contracts";
import { fmtNum, relative } from "@/lib/viz";
import { cn } from "@/lib/utils";

const PRIORITY_COLOR: Record<Priority, string> = {
  critical: "var(--sev-error)",
  high: "var(--sev-warning)",
  medium: "var(--chart-4)",
  low: "var(--muted-foreground)"
};

const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Act now",
  high: "Act soon",
  medium: "Look into",
  low: "Monitor"
};

/**
 * The action queue — the first thing on the page.
 *
 * Each row answers three questions in order: what is wrong, why it matters,
 * and what to do first. Priority is phrased as an instruction ("Act now")
 * rather than a severity word, because the reader's question is what to do,
 * not how to categorise it.
 */
export function ActionQueue({
  actions,
  counts,
  sparse = false
}: {
  actions: Action[];
  counts: { critical: number; high: number; total: number };
  /** The window holds too little traffic for a rate to be meaningful. */
  sparse?: boolean;
}) {
  const [expanded, setExpanded] = useState<string | null>(actions.find((a) => a.active)?.id ?? null);
  const active = actions.filter((a) => a.active);

  if (active.length === 0) {
    return (
      <div
        className="flex items-center gap-3 rounded-lg border px-5 py-4"
        style={{
          borderColor: `color-mix(in oklab, ${sparse ? "var(--muted-foreground)" : "var(--status-good)"} 32%, transparent)`,
          background: `color-mix(in oklab, ${sparse ? "var(--muted-foreground)" : "var(--status-good)"} 7%, transparent)`
        }}
      >
        <span
          aria-hidden
          className="size-2.5 shrink-0 rounded-full"
          style={{ background: sparse ? "var(--muted-foreground)" : "var(--status-good)" }}
        />
        <div>
          <p className="text-sm font-semibold">
            {sparse ? "Not enough traffic to judge" : "Nothing needs your attention"}
          </p>
          <p className="text-muted-foreground mt-0.5 text-sm">
            {sparse
              ? "This window holds too few requests for an error rate to mean anything. Widen the window to see a verdict."
              : "No alert is firing and every service is inside its healthy range."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="border-border/70 bg-card overflow-hidden rounded-lg border">
      <div className="border-border/70 flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2.5">
          <span
            aria-hidden
            className="size-2.5 rounded-full"
            style={{ background: counts.critical > 0 ? "var(--sev-error)" : "var(--sev-warning)" }}
          />
          <h2 className="text-sm font-semibold">
            {active.length} {active.length === 1 ? "thing needs" : "things need"} attention
          </h2>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {counts.critical > 0 && (
            <span style={{ color: "var(--sev-error)" }}>
              <span className="tabular font-semibold">{counts.critical}</span> act now
            </span>
          )}
          {counts.high > 0 && (
            <span style={{ color: "var(--sev-warning)" }}>
              <span className="tabular font-semibold">{counts.high}</span> act soon
            </span>
          )}
        </div>
      </div>

      <ul className="divide-border/60 divide-y">
        {active.map((action) => {
          const open = expanded === action.id;
          return (
            <li key={action.id}>
              <button
                onClick={() => setExpanded(open ? null : action.id)}
                aria-expanded={open}
                className="hover:bg-secondary/40 w-full px-5 py-3.5 text-left transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wide whitespace-nowrap uppercase"
                    style={{
                      color: PRIORITY_COLOR[action.priority],
                      background: `color-mix(in oklab, ${PRIORITY_COLOR[action.priority]} 13%, transparent)`
                    }}
                  >
                    {PRIORITY_LABEL[action.priority]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.title}</p>
                    <p className="text-muted-foreground mt-0.5 text-sm">{action.detail}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground tabular text-xs">{relative(action.lastSeen)}</span>
                    <span aria-hidden className="text-muted-foreground text-xs">
                      {open ? "▴" : "▾"}
                    </span>
                  </div>
                </div>
              </button>

              {open && (
                <div className="bg-secondary/25 border-border/60 space-y-3 border-t px-5 py-4">
                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Why this matters</p>
                    <p className="text-sm">{action.why}</p>
                  </div>

                  <div>
                    <p className="text-muted-foreground mb-1 text-xs font-medium">Do this first</p>
                    <p className="text-sm">{action.firstStep}</p>
                  </div>

                  {action.verify && (
                    <div>
                      <p className="text-muted-foreground mb-1 text-xs font-medium">You will know it worked when</p>
                      <p className="text-sm">{action.verify}</p>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <a
                      href={buildHash(action.link.page as PageId, action.link.params)}
                      className="border-border/70 bg-card hover:bg-secondary rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
                    >
                      Investigate &rarr;
                    </a>
                    {action.affected.map((service) => (
                      <a
                        key={service}
                        href={buildHash("logs", { service })}
                        className="border-border/70 bg-card hover:bg-secondary rounded-md border px-2.5 py-1 font-mono text-xs transition-colors"
                      >
                        {service}
                      </a>
                    ))}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {fmtNum(action.count)} matching {action.count === 1 ? "entry" : "entries"}
                    </span>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * A section's own rollup, shown in its header so the reader learns whether the
 * section needs them without scanning it.
 */
export function SummaryChip({ summary }: { summary: SectionSummary }) {
  const ok = summary.count === 0;
  const color = ok ? "var(--status-good)" : PRIORITY_COLOR[summary.worst ?? "medium"];

  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs")}
      style={{ color, background: `color-mix(in oklab, ${color} 10%, transparent)` }}
      title={summary.text}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="max-w-[22rem] truncate">{summary.text}</span>
    </span>
  );
}
