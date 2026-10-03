import { GRADE_COLOR, GradeBadge } from "@/components/primitives";
import { buildHash } from "@/lib/nav";
import { fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";
import type { Connection, Freshness, HealthMetrics, ServiceHealth } from "@/lib/contracts";

const GRADE_LABEL: Record<string, string> = {
  healthy: "Healthy",
  watch: "Watch",
  degraded: "Degraded",
  critical: "Critical",
  nodata: "No data",
  sparse: "Too few requests"
};

/**
 * The status header: project identity and service health as one block.
 *
 * These were two sections with a chart's worth of space between them, which
 * made the reader scroll to learn whether the project named at the top was
 * actually healthy. Same question, so: one panel, identity on the first row,
 * the verdict and the six numbers that produce it on the second.
 *
 * Every number is stated with its name beside it rather than under a chart —
 * the Datadog/Grafana status-strip pattern.
 */
export function ProjectSummary({
  connection,
  health,
  services,
  activeAlertCount,
  criticalAlertCount,
  resolvedAlertCount,
  actNowCount,
  totalActions,
  freshness,
  scope,
  sparse
}: {
  connection?: Connection;
  health: HealthMetrics;
  services: ServiceHealth[];
  activeAlertCount: number;
  criticalAlertCount: number;
  resolvedAlertCount: number;
  actNowCount: number;
  totalActions: number;
  freshness: Freshness;
  scope: string;
  sparse: boolean;
}) {
  const degraded = services.filter((s) => s.grade === "degraded" || s.grade === "critical").length;
  const graded = services.filter((s) => s.grade !== "nodata" && s.grade !== "sparse").length;

  /** Row 2: the state of things. */
  const status: Cell[] = [
    {
      label: "Services",
      value:
        services.length === 0
          ? "None"
          : graded === 0
            ? "Too few"
            : `${graded - degraded}/${graded}`,
      unit: graded === 0 ? "requests to judge" : "healthy",
      tone: graded === 0 ? undefined : degraded > 0 ? "var(--sev-warning)" : "var(--status-good)",
      to: buildHash("services", scope === "all" ? {} : { scope })
    },
    {
      label: "Alerts firing",
      value: String(activeAlertCount),
      unit: criticalAlertCount > 0 ? `${criticalAlertCount} critical` : resolvedAlertCount > 0 ? `${resolvedAlertCount} resolved` : "none open",
      tone:
        criticalAlertCount > 0
          ? "var(--sev-error)"
          : activeAlertCount > 0
            ? "var(--sev-warning)"
            : "var(--status-good)",
      to: buildHash("incidents", scope === "all" ? {} : { scope })
    },
    {
      label: "Fix now",
      value: String(actNowCount),
      unit: `of ${totalActions} open`,
      tone: actNowCount > 0 ? "var(--sev-error)" : "var(--status-good)"
    }
  ];

  /** Row 2 continued: the measurements behind the grade. */
  const vitals: Cell[] = [
    {
      label: "Availability",
      value: fmtPct(health.availability, 2),
      unit: "not our fault",
      tone: sparse ? undefined : health.availability < 0.99 ? "var(--sev-error)" : undefined
    },
    {
      label: "Apdex",
      value: health.apdex.toFixed(2),
      unit: "1.00 is best",
      tone: sparse ? undefined : health.apdex < 0.8 ? "var(--sev-warning)" : undefined
    },
    { label: "p95", value: fmtMs(health.p95), unit: "95% faster than" },
    { label: "p99", value: fmtMs(health.p99), unit: "slow tail" }
  ];

  return (
    <section data-panel aria-label="Project status" className="border-border bg-card overflow-hidden rounded-md border">
      {/* Identity. */}
      <div className="border-border flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b px-4 py-2.5">
        <h2 className="truncate text-sm font-semibold tracking-tight">
          {connection?.name ?? "Connected project"}
        </h2>
        <p className="text-muted-foreground truncate font-mono text-[0.7rem]">
          {connection
            ? `${connection.account} · ${connection.region} · ${connection.environment}`
            : "No project connected"}
        </p>
        <p className="text-muted-foreground ml-auto shrink-0 text-[0.7rem]">
          {freshness.operational.cadence} · last entry {relative(Date.parse(freshness.operational.lastEntry))}
        </p>
      </div>

      {/* Verdict plus the numbers behind it, on one rail. */}
      <div className="divide-border flex flex-wrap items-stretch divide-x">
        <div className="flex min-w-[190px] items-center gap-3 px-4 py-3">
          <span
            aria-hidden
            className="h-9 w-1 shrink-0 rounded-full"
            style={{ background: GRADE_COLOR[health.grade] }}
          />
          <div className="min-w-0">
            <p className="text-muted-foreground text-[0.62rem] font-medium tracking-[0.07em] uppercase">
              Overall health
            </p>
            <p
              className="mt-0.5 text-[1.35rem] leading-none font-semibold tracking-tight"
              style={{ color: GRADE_COLOR[health.grade] }}
            >
              {GRADE_LABEL[health.grade]}
            </p>
            <p className="text-muted-foreground tabular mt-1 text-[0.68rem]">
              {fmtNum(health.requests)} req · {health.requestsPerMinute}/min · {health.uniqueRoutes} routes
            </p>
          </div>
        </div>

        {[...status, ...vitals].map((cell) => (
          <StatusCell key={cell.label} cell={cell} />
        ))}
      </div>
    </section>
  );
}

interface Cell {
  label: string;
  value: string;
  unit: string;
  tone?: string;
  to?: string;
}

/** Name above, number below, qualifier under it. Same shape in every cell. */
function StatusCell({ cell }: { cell: Cell }) {
  const body = (
    <>
      <p className="text-muted-foreground truncate text-[0.62rem] font-medium tracking-[0.07em] uppercase">
        {cell.label}
      </p>
      <p
        className="tabular mt-0.5 text-[1.35rem] leading-none font-semibold tracking-tight"
        style={{ color: cell.tone }}
      >
        {cell.value}
      </p>
      <p className="text-muted-foreground mt-1 truncate text-[0.68rem]">{cell.unit}</p>
    </>
  );

  const shape = "min-w-[122px] flex-1 px-4 py-3";
  return cell.to ? (
    <a href={cell.to} className={`${shape} hover:bg-secondary/50 transition-colors`}>
      {body}
    </a>
  ) : (
    <div className={shape}>{body}</div>
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
    <div className="border-border bg-card overflow-x-auto rounded-md border" data-panel>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border text-muted-foreground border-b text-[0.66rem] tracking-[0.07em] uppercase">
            <th className="px-4 py-2 font-medium">Service</th>
            <th className="py-2 font-medium">Grade</th>
            <th className="py-2 text-right font-medium">Requests</th>
            <th className="py-2 text-right font-medium">Error rate</th>
            <th className="py-2 text-right font-medium">p95</th>
            <th className="py-2 pl-6 font-medium">Trend</th>
            <th className="px-4 py-2 font-medium">Top failure</th>
          </tr>
        </thead>
        <tbody>
          {services.map((service) => (
            <tr
              key={service.name}
              onClick={() => (location.hash = buildHash("logs", { service: service.name, scope }))}
              className="border-border/40 hover:bg-secondary/50 cursor-pointer border-b transition-colors last:border-b-0"
            >
              <td className="px-4 py-2 font-mono text-xs font-medium">{service.name}</td>
              <td className="py-2">
                <GradeBadge grade={service.grade} />
              </td>
              <td className="tabular py-2 text-right text-xs">{fmtNum(service.requests)}</td>
              <td
                className="tabular py-2 text-right text-xs font-medium"
                style={{ color: service.errorRate > 0.02 ? "var(--sev-error)" : undefined }}
              >
                {fmtPct(service.errorRate)}
              </td>
              <td
                className="tabular py-2 text-right text-xs font-medium"
                style={{ color: service.p95 > 500 ? "var(--sev-warning)" : undefined }}
              >
                {fmtMs(service.p95)}
              </td>
              <td className="py-2 pl-6">
                <RowSpark
                  points={service.sparkline}
                  tone={service.errorRate > 0.02 ? "var(--sev-error)" : "var(--chart-1)"}
                />
              </td>
              <td className="text-muted-foreground max-w-[14rem] truncate px-4 py-2 font-mono text-[0.7rem]">
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
  const h = 18;
  const max = Math.max(...points, 1);
  const min = Math.min(...points);
  const span = max - min || 1;
  const d = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${((i / (points.length - 1)) * w).toFixed(1)},${(h - ((p - min) / span) * h).toFixed(1)}`
    )
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden className="overflow-visible">
      <path d={d} fill="none" stroke={tone} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
