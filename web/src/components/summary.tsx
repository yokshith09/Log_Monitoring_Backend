import { GRADE_COLOR, GradeBadge } from "@/components/primitives";
import { buildHash } from "@/lib/nav";
import { fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

const GRADE_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  degraded: "Degraded",
  critical: "Critical",
  nodata: "No data",
  sparse: "Too few requests"
};
import type { Connection, Freshness, HealthMetrics, ServiceHealth } from "@/lib/contracts";

/**
 * The band at the very top of the Overview.
 *
 * Answers, in one glance and before any chart: which project this is, how much
 * of it we are watching, whether it is healthy right now, and how many alerts
 * and actions are open. Everything below the band is the explanation of this
 * band.
 */
export function ProjectSummary({
  connection,
  health,
  services,
  activeAlertCount,
  criticalAlertCount,
  resolvedAlertCount,
  actNowCount,
  freshness,
  scope
}: {
  connection?: Connection;
  health: HealthMetrics;
  services: ServiceHealth[];
  activeAlertCount: number;
  criticalAlertCount: number;
  resolvedAlertCount: number;
  actNowCount: number;
  freshness: Freshness;
  scope: string;
}) {
  const degraded = services.filter((s) => s.grade === "degraded" || s.grade === "critical").length;
  const graded = services.filter((s) => s.grade !== "nodata" && s.grade !== "sparse").length;

  const cells: { label: string; value: string; help: string; tone?: string; to?: string }[] = [
    {
      label: "Overall",
      value: GRADE_LABEL[health.grade],
      help: "Error rate, latency and availability combined",
      tone: GRADE_COLOR[health.grade]
    },
    {
      label: "Services",
      value:
        services.length === 0
          ? "No traffic"
          : graded === 0
            ? "Too few requests to judge"
            : degraded > 0
              ? `${graded - degraded} of ${graded} healthy`
              : `${graded} healthy`,
      help: "A workload counts as degraded below a “watch” grade",
      tone: graded === 0 ? "var(--muted-foreground)" : degraded > 0 ? "var(--sev-warning)" : "var(--status-good)",
      to: buildHash("services", scope === "all" ? {} : { scope })
    },
    {
      label: "Open alerts",
      value:
        criticalAlertCount > 0
          ? `${activeAlertCount} firing · ${criticalAlertCount} critical`
          : activeAlertCount > 0
            ? `${activeAlertCount} firing`
            : resolvedAlertCount > 0
              ? `0 firing · ${resolvedAlertCount} resolved`
              : "0 firing",
      help:
        activeAlertCount === 0 && resolvedAlertCount > 0
          ? "Nothing crossing a threshold right now; these fired earlier in the window"
          : "Rules currently crossing their threshold",
      tone: criticalAlertCount > 0 ? "var(--sev-error)" : activeAlertCount > 0 ? "var(--sev-warning)" : "var(--status-good)",
      to: buildHash("alerts", scope === "all" ? {} : { scope })
    },
    {
      label: "Act now",
      value: String(actNowCount),
      help: "Actions that should not wait for the next working day",
      tone: actNowCount > 0 ? "var(--sev-error)" : "var(--status-good)"
    }
  ];

  return (
    <section
      data-panel
      aria-label="Project summary"
      className="border-border/70 bg-card overflow-hidden rounded-xl border"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <h2 className="truncate text-base font-semibold tracking-tight">
              {connection?.name ?? "Connected project"}
            </h2>
            <GradeBadge grade={health.grade} />
          </div>
          <p className="text-muted-foreground mt-1 font-mono text-xs">
            {connection
              ? `${connection.account} · ${connection.region} · ${connection.environment}`
              : "No project connected"}
          </p>
        </div>

        <p className="text-muted-foreground ml-auto text-right text-xs">
          Logs {freshness.operational.cadence}
          <br />
          last entry {relative(Date.parse(freshness.operational.lastEntry))}
        </p>
      </div>

      {/* The status cells. Dense and evenly weighted, the way a trading
          terminal puts its headline figures on one rail. */}
      <dl className="border-border/60 divide-border/60 grid grid-cols-2 divide-x divide-y border-t sm:grid-cols-4 sm:divide-y-0">
        {cells.map((cell) => {
          const body = (
            <>
              <dt className="text-muted-foreground text-[0.68rem] font-medium tracking-[0.08em] uppercase">
                {cell.label}
              </dt>
              <dd className="mt-1 text-lg leading-tight font-semibold" style={{ color: cell.tone }}>
                {cell.value}
              </dd>
              <dd className="text-muted-foreground mt-0.5 text-xs">{cell.help}</dd>
            </>
          );
          return cell.to ? (
            <a key={cell.label} href={cell.to} className="hover:bg-secondary/40 px-5 py-3.5 transition-colors">
              {body}
            </a>
          ) : (
            <div key={cell.label} className="px-5 py-3.5">
              {body}
            </div>
          );
        })}
      </dl>
    </section>
  );
}

/**
 * Services as a dense watchlist rather than a card grid.
 *
 * Six cards of three figures each take a full screen to compare; one row per
 * service with aligned tabular columns lets you read down a column and spot
 * the outlier without reading any label twice.
 */
export function ServiceWatchlist({ services, scope }: { services: ServiceHealth[]; scope: string }) {
  return (
    <div className="border-border/70 bg-card overflow-x-auto rounded-xl border" data-panel>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border/60 text-muted-foreground border-b text-[0.68rem] tracking-[0.08em] uppercase">
            <th className="px-4 py-2.5 font-medium">Service</th>
            <th className="py-2.5 font-medium">Grade</th>
            <th className="py-2.5 text-right font-medium">Requests</th>
            <th className="py-2.5 text-right font-medium">Error rate</th>
            <th className="py-2.5 text-right font-medium">p95</th>
            <th className="py-2.5 pl-6 font-medium">Trend</th>
            <th className="px-4 py-2.5 font-medium">Top failure</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr
              key={service.name}
              onClick={() => (location.hash = buildHash("logs", { service: service.name, scope }))}
              className="border-border/40 hover:bg-secondary/40 cursor-pointer border-b transition-colors last:border-b-0"
            >
              <td className="px-4 py-2.5 font-mono text-sm font-medium">{service.name}</td>
              <td className="py-2.5">
                <GradeBadge grade={service.grade} />
              </td>
              <td className="tabular py-2.5 text-right">{fmtNum(service.requests)}</td>
              <td
                className="tabular py-2.5 text-right"
                style={{ color: service.errorRate > 0.02 ? "var(--sev-error)" : undefined }}
              >
                {fmtPct(service.errorRate)}
              </td>
              <td
                className="tabular py-2.5 text-right"
                style={{ color: service.p95 > 500 ? "var(--sev-warning)" : undefined }}
              >
                {fmtMs(service.p95)}
              </td>
              <td className="py-2.5 pl-6">
                <RowSpark points={service.sparkline} tone={service.errorRate > 0.02 ? "var(--sev-error)" : "var(--chart-1)"} />
              </td>
              <td className="text-muted-foreground max-w-[14rem] truncate px-4 py-2.5 font-mono text-xs">
                {service.topFailure ? `${service.topFailure} ×${service.topFailureCount}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RowSpark({ points, tone }: { points: number[]; tone: string }) {
  if (!points || points.length < 2) return null;
  const w = 90;
  const h = 20;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`)
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={tone} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
