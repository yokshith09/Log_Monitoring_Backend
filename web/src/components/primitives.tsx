import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SEVERITY_COLOR, fmtNum } from "@/lib/viz";

/* ------------------------------------------------------------- stat tile */

/**
 * A single current value with a delta and an optional sparkline.
 * Per the dataviz form heuristic, a headline number is a stat tile — not a
 * one-bar bar chart.
 */
export function StatTile({
  label,
  value,
  delta,
  deltaLabel,
  goodDirection = "down",
  spark,
  tone
}: {
  label: string;
  value: string;
  delta?: number;
  deltaLabel?: string;
  goodDirection?: "up" | "down";
  spark?: number[];
  tone?: "critical" | "warning" | "good";
}) {
  const improving = delta === undefined ? null : goodDirection === "down" ? delta < 0 : delta > 0;
  const flat = delta !== undefined && Math.abs(delta) < 1e-9;

  return (
    <Card className="bg-card border-border/60 gap-0 py-5">
      <CardContent className="px-5">
        <p className="text-muted-foreground text-[0.7rem] font-medium tracking-[0.08em] uppercase">{label}</p>

        <div className="mt-2 flex items-end justify-between gap-3">
          <span
            className="text-[2rem] leading-none font-semibold"
            style={{
              color:
                tone === "critical"
                  ? "var(--sev-error)"
                  : tone === "warning"
                    ? "var(--sev-warning)"
                    : tone === "good"
                      ? "var(--status-good)"
                      : undefined
            }}
          >
            {value}
          </span>
          {spark && spark.length > 1 && <Sparkline points={spark} />}
        </div>

        {delta !== undefined && (
          <p className="text-muted-foreground mt-2 flex items-center gap-1.5 text-xs">
            {/* Direction is carried by the glyph and the word, never colour alone. */}
            <span
              aria-hidden
              style={{ color: flat ? "var(--muted-foreground)" : improving ? "var(--status-good)" : "var(--sev-error)" }}
            >
              {flat ? "→" : delta > 0 ? "↑" : "↓"}
            </span>
            <span className="tabular">{deltaLabel}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Sparkline({ points }: { points: number[] }) {
  const w = 72;
  const h = 28;
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
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
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
      style={{ color: SEVERITY_COLOR[severity], background: `color-mix(in oklab, ${SEVERITY_COLOR[severity]} 12%, transparent)` }}
    >
      <span aria-hidden className="size-1.5 rounded-full" style={{ background: SEVERITY_COLOR[severity] }} />
      {severity}
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

/* ------------------------------------------------------------- scaffolding */

export function SectionHead({
  title,
  hint,
  right
}: {
  title: string;
  hint?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-sm font-semibold tracking-tight">{title}</h2>
        {hint && <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>}
      </div>
      {right}
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Card className={cn("bg-card border-border/60 gap-0 py-5", className)}>
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

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="text-muted-foreground border-border/60 rounded-md border border-dashed px-6 py-10 text-center text-sm">
      {children}
    </div>
  );
}

export function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-[0.7rem] tracking-[0.08em] uppercase">{label}</p>
      <p className="tabular mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

export const compact = fmtNum;
