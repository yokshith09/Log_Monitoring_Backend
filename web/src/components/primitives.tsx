import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SEVERITY_COLOR, fmtNum } from "@/lib/viz";
import { buildHash, type PageId } from "@/lib/nav";

/* ------------------------------------------------------------- stat tile */

/**
 * A single current value with a delta and optional sparkline.
 *
 * When `to` is supplied the whole tile becomes a link. §12's journey is a
 * drill-down, so every headline number is a doorway into the view that
 * explains it rather than a dead end.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  goodDirection = "down",
  spark,
  sparkTone,
  tone,
  to,
  params,
  caption
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  goodDirection?: "up" | "down";
  spark?: number[];
  sparkTone?: string;
  tone?: "critical" | "warning" | "good";
  to?: PageId;
  params?: Record<string, string>;
  caption?: string;
}) {
  const improving = delta === undefined ? null : goodDirection === "down" ? delta < 0 : delta > 0;
  const flat = delta !== undefined && Math.abs(delta) < 1e-9;
  const toneColor =
    tone === "critical"
      ? "var(--sev-error)"
      : tone === "warning"
        ? "var(--sev-warning)"
        : tone === "good"
          ? "var(--status-good)"
          : undefined;

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="text-muted-foreground text-[0.66rem] font-medium tracking-[0.07em] uppercase">{label}</p>
        {to && (
          <span
            aria-hidden
            className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          >
            →
          </span>
        )}
      </div>

      <div className="mt-1.5 flex items-end justify-between gap-3">
        <span className="text-[1.6rem] leading-none font-semibold tracking-tight" style={{ color: toneColor }}>
          {value}
        </span>
        {spark && spark.length > 1 && <Sparkline points={spark} tone={sparkTone} />}
      </div>

      {delta !== undefined && (
        <p className="text-muted-foreground mt-1.5 flex items-center gap-1.5 text-xs">
          <span
            aria-hidden
            style={{ color: flat ? "var(--muted-foreground)" : improving ? "var(--status-good)" : "var(--sev-error)" }}
          >
            {flat ? "→" : delta > 0 ? "↑" : "↓"}
          </span>
          <span className="tabular">{deltaLabel}</span>
        </p>
      )}
      {caption && !delta && <p className="text-muted-foreground mt-1.5 text-xs leading-snug">{caption}</p>}
    </>
  );

  if (!to) {
    return (
      <Card data-panel className="bg-card border-border/70 h-full gap-0 py-3.5">
        <CardContent className="px-4">{body}</CardContent>
      </Card>
    );
  }

  return (
    <a
      href={buildHash(to, params)}
      className="group focus-visible:ring-ring rounded-xl focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent focus-visible:outline-none"
    >
      <Card
        data-panel
        className="bg-card border-border/70 hover:border-ring/40 hover:bg-secondary/30 h-full gap-0 py-3.5 transition-colors"
      >
        <CardContent className="px-4">{body}</CardContent>
      </Card>
    </a>
  );
}

function Sparkline({ points, tone = "var(--chart-1)" }: { points: number[]; tone?: string }) {
  const w = 64;
  const h = 22;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="shrink-0 overflow-visible">
      <path d={d} fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ---------------------------------------------------------------- badges */

/** Severity always ships colour + label, so meaning never rests on hue. */
export function SeverityBadge({ severity, className }: { severity: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase",
        className
      )}
      style={{
        color: SEVERITY_COLOR[severity],
        background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 12%, transparent)`
      }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} />
      {severity}
    </span>
  );
}

const GRADE_COLOR: Record<string, string> = {
  healthy: "var(--status-good)",
  watch: "var(--chart-4)",
  degraded: "var(--sev-warning)",
  critical: "var(--sev-error)",
  // No traffic is its own state, deliberately neutral so it never reads as a
  // pass or a failure.
  nodata: "var(--muted-foreground)",
  sparse: "var(--muted-foreground)"
};

const GRADE_LABEL: Record<string, string> = {
  healthy: "healthy",
  watch: "watch",
  degraded: "degraded",
  critical: "critical",
  nodata: "no data",
  sparse: "too few requests"
};

export function GradeBadge({ grade }: { grade: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-[0.65rem] font-medium tracking-wide uppercase"
      style={{ color: GRADE_COLOR[grade], background: `color-mix(in oklab, ${GRADE_COLOR[grade]} 12%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: GRADE_COLOR[grade] }} />
      {GRADE_LABEL[grade] ?? grade}
    </span>
  );
}

export function StatusPill({ code }: { code: number }) {
  const tone = code >= 500 ? "var(--sev-error)" : code >= 400 ? "var(--sev-warning)" : "var(--status-good)";
  return (
    <span className="tabular text-xs font-medium" style={{ color: tone }}>
      {code}
    </span>
  );
}

export { GRADE_COLOR, GRADE_LABEL };

/* ------------------------------------------------------------- scaffolding */

export function SectionHead({
  title,
  hint,
  right,
  to,
  params
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
  to?: PageId;
  params?: Record<string, string>;
}) {
  // `hint` is a tooltip, never a visible subtitle. A line of prose under every
  // panel heading triples the vertical cost of a header row and gets skipped on
  // the second visit anyway; the reader who wants the method can hover.
  return (
    <div className="mb-3 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight" title={hint}>
          {title}
        </h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        {to && (
          <a
            href={buildHash(to, params)}
            className="text-muted-foreground hover:text-foreground shrink-0 text-xs whitespace-nowrap transition-colors"
          >
            View all →
          </a>
        )}
      </div>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card data-panel className={cn("bg-card border-border/70 gap-0 py-5", className)}>
      <CardContent className="px-5">{children}</CardContent>
    </Card>
  );
}

/** Legend — always present for two or more series. */
export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
      {items.map((item) => (
        <li key={item.label} className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <span aria-hidden className="size-2 rounded-[2px]" style={{ background: item.color }} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[0.7rem] tracking-[0.08em] uppercase">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold" style={{ color: tone }}>
        {value}
      </p>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="text-muted-foreground py-8 text-center text-sm">{children}</p>;
}

/** Freshness is stated explicitly — §8 separates operational from billing cadence. */
export function FreshnessNote({ freshness }: { freshness: any }) {
  if (!freshness) return null;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 text-[0.7rem]">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--status-good)" }} />
        Operational telemetry · {freshness.operational.cadence}
      </span>
      <span className="flex items-center gap-1.5">
        <span aria-hidden className="size-1.5 rounded-full" style={{ background: "var(--sev-warning)" }} />
        Billing · {freshness.billing.cadence}, last export{" "}
        {new Date(freshness.billing.lastExport).toLocaleString()}
      </span>
    </div>
  );
}

export const compact = fmtNum;
