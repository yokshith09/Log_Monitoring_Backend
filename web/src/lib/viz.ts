/**
 * Visualisation parameters.
 *
 * These are the values validated by the dataviz palette checker against this
 * dashboard's own surface (#12221d). Do not add a seventh series colour or
 * reorder these without re-running the checker — the ordering IS the
 * colour-blindness safety mechanism, not a cosmetic choice.
 */

/** Categorical: identity. Fixed order, never cycled. */
export const SERIES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)"
] as const;

/** Status: state. Reserved — never reused as a series colour. */
export const SEVERITY_COLOR: Record<string, string> = {
  INFO: "var(--sev-info)",
  WARNING: "var(--sev-warning)",
  ERROR: "var(--sev-error)"
};

export const ALERT_COLOR: Record<string, string> = {
  critical: "var(--sev-error)",
  serious: "#ec835a",
  warning: "var(--sev-warning)"
};

export const GRID = "var(--grid)";
export const AXIS = "var(--axis)";
export const MUTED = "var(--muted-foreground)";
export const SURFACE = "var(--card)";

/** Assigns a stable colour per entity, so filtering never repaints survivors. */
export function seriesColor(allKeys: string[], key: string) {
  const index = [...allKeys].sort().indexOf(key);
  return SERIES[index % SERIES.length];
}

export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });

export const fmtNum = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;

export const fmtMs = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(2)}s` : `${Math.round(n)}ms`);

export const fmtPct = (n: number, digits = 1) => `${(n * 100).toFixed(digits)}%`;

export const fmtUsd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });

export const relative = (ms: number) => {
  const diff = Date.now() - ms;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
};
