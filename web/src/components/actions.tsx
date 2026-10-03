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

/**
 * Priority as a deadline, not a severity word.
 *
 * "Act now" and "Act soon" sound like the same instruction at two volumes and
 * leave the reader to work out the difference. A timeframe does not.
 */
export const PRIORITY_LABEL: Record<Priority, string> = {
  critical: "Fix now",
  high: "Fix today",
  medium: "Investigate",
  low: "Keep watching"
};

/**
 * The action queue — the first thing on the page.
 *
 * Each row answers three questions in order: what is wrong, why it matters,
 * and what to do first. Priority is phrased as a deadline ("Fix now",
 * "Fix today") rather than a severity word, because the reader's question is
 * when this has to be dealt with, not how to categorise it.
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
    <div className="border-border bg-card overflow-hidden rounded-lg border">
      <div className="border-border flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3">
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
                    className="mt-px shrink-0 rounded px-1.5 py-[3px] text-[0.62rem] font-semibold tracking-wide whitespace-nowrap uppercase"
                    style={{
                      color: PRIORITY_COLOR[action.priority],
                      background: `color-mix(in oklab, ${PRIORITY_COLOR[action.priority]} 14%, transparent)`
                    }}
                  >
                    {PRIORITY_LABEL[action.priority]}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className="text-sm font-semibold">{action.title}</p>
                      <SeverityTag severity={action.severity} />
                      {action.affected.slice(0, 2).map((service) => (
                        <span
                          key={service}
                          className="border-border text-muted-foreground rounded border px-1.5 py-px font-mono text-[0.65rem]"
                        >
                          {service}
                        </span>
                      ))}
                    </div>
                    <p className="text-muted-foreground mt-0.5 text-xs">{action.detail}</p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-muted-foreground tabular text-[0.7rem]">{relative(action.lastSeen)}</span>
                    <span aria-hidden className="text-muted-foreground text-xs">
                      {open ? "▴" : "▾"}
                    </span>
                  </div>
                </div>
              </button>

              {open && (
                <div className="bg-secondary/30 border-border border-t px-5 py-3.5">
                  <dl className="divide-border/50 divide-y text-sm">
                    <Row label="Issue">{action.detail}</Row>
                    <Row label="Severity">
                      <span className="flex items-center gap-2">
                        <SeverityTag severity={action.severity} />
                        <span className="text-muted-foreground text-xs">
                          {action.active ? "breaching now" : "not currently breaching"}
                          {action.episodes && action.episodes > 1 ? ` · ${action.episodes} episodes` : ""}
                        </span>
                      </span>
                    </Row>
                    <Row label="Affected">
                      {action.affected.length === 0 ? (
                        <span className="text-muted-foreground">Whole application</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {action.affected.map((service) => (
                            <a
                              key={service}
                              href={buildHash("logs", { service })}
                              className="border-border bg-card hover:bg-secondary rounded border px-1.5 py-px font-mono text-xs transition-colors"
                            >
                              {service} &rarr;
                            </a>
                          ))}
                        </span>
                      )}
                    </Row>
                    <Row label="Likely cause">{action.why}</Row>
                    <Row label="Do this">{action.firstStep}</Row>
                    {action.verify && <Row label="Fixed when">{action.verify}</Row>}
                  </dl>

                  <div className="border-border/50 mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                    <a
                      href={buildHash(action.link.page as PageId, action.link.params)}
                      className="border-border bg-card hover:bg-secondary rounded border px-2.5 py-1 text-xs font-medium transition-colors"
                    >
                      Investigate &rarr;
                    </a>
                    <span className="text-muted-foreground tabular ml-auto text-xs">
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

/** One labelled fact. Fixed label column, so the eye finds a field by position. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-5">
      <dt className="text-muted-foreground w-[7.5rem] shrink-0 text-[0.68rem] font-medium tracking-[0.05em] uppercase sm:pt-px">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 leading-relaxed">{children}</dd>
    </div>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "var(--sev-error)",
  serious: "var(--sev-warning)",
  warning: "var(--chart-4)"
};

/** Severity always ships colour and word together. */
function SeverityTag({ severity }: { severity: string }) {
  const tone = SEVERITY_TONE[severity] ?? "var(--muted-foreground)";
  return (
    <span
      className="shrink-0 rounded px-1.5 py-px text-[0.62rem] font-semibold tracking-wide uppercase"
      style={{ color: tone, border: `1px solid color-mix(in oklab, ${tone} 45%, transparent)` }}
    >
      {severity}
    </span>
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
