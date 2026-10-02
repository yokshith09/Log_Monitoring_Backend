import { Legend, Metric, Panel, SectionHead, StatTile } from "@/components/primitives";
import { CostBars, RankedBars, TrendArea, TrendLine } from "@/components/charts";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import { SERIES, fmtMs, fmtUsd } from "@/lib/viz";

/* ------------------------------------------------------------ performance */

export function Performance({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/performance?hours=${hours}`, [hours]);
  if (loading || !data) return <PageSkeleton />;

  const latest = data.latency.at(-1) ?? { p50: 0, p95: 0, p99: 0 };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="p50 latency" value={fmtMs(latest.p50)} />
        <StatTile label="p95 latency" value={fmtMs(latest.p95)} tone={latest.p95 > 500 ? "warning" : undefined} />
        <StatTile label="p99 latency" value={fmtMs(latest.p99)} tone={latest.p99 > 1000 ? "critical" : undefined} />
      </div>

      <Panel>
        <SectionHead
          title="Latency percentiles"
          hint="One axis — percentiles share a unit, so they belong on one chart"
          right={
            <Legend
              items={[
                { label: "p50", color: SERIES[0] },
                { label: "p95", color: SERIES[1] },
                { label: "p99", color: SERIES[2] }
              ]}
            />
          }
        />
        <TrendLine
          data={data.latency}
          yFormatter={fmtMs}
          series={[
            { key: "p50", label: "p50", color: SERIES[0] },
            { key: "p95", label: "p95", color: SERIES[1] },
            { key: "p99", label: "p99", color: SERIES[2] }
          ]}
        />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHead title="Slowest routes" hint="By p95 — amber marks anything over the 500ms threshold" />
          <RankedBars
            data={data.slowestRoutes}
            labelKey="route"
            valueKey="p95"
            formatter={fmtMs}
            highlightOver={500}
          />
        </Panel>

        <Panel>
          <SectionHead
            title="Throughput and failures"
            hint="Volume against 4xx/5xx, so a spike can be read against load"
            right={
              <Legend
                items={[
                  { label: "Requests", color: SERIES[0] },
                  { label: "Failures", color: "var(--sev-error)" }
                ]}
              />
            }
          />
          <TrendLine
            data={data.throughput}
            series={[
              { key: "requests", label: "Requests", color: SERIES[0] },
              { key: "failures", label: "Failures", color: "var(--sev-error)" }
            ]}
          />
        </Panel>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- resources */

export function Resources({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/resources?hours=${hours}`, [hours]);
  if (loading || !data) return <PageSkeleton />;

  const { latest, peaks, series } = data;

  // Four different units — four charts. Never a dual axis.
  const panels = [
    { key: "cpuPercent", title: "CPU utilisation", unit: (v: number) => `${v.toFixed(0)}%`, color: SERIES[0], peak: `${peaks.cpuPercent.toFixed(1)}%` },
    { key: "memoryMb", title: "Memory", unit: (v: number) => `${v.toFixed(0)}MB`, color: SERIES[1], peak: `${peaks.memoryMb}MB` },
    { key: "dbConnections", title: "Database connections", unit: (v: number) => `${v.toFixed(0)}`, color: SERIES[2], peak: String(peaks.dbConnections) },
    { key: "instanceCount", title: "Instance count", unit: (v: number) => `${v.toFixed(0)}`, color: SERIES[3], peak: String(peaks.instanceCount) }
  ];

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-wrap gap-8">
          <Metric label="CPU now" value={`${latest.cpuPercent?.toFixed(1) ?? 0}%`} />
          <Metric label="Memory now" value={`${latest.memoryMb ?? 0}MB`} />
          <Metric label="DB connections" value={String(latest.dbConnections ?? 0)} />
          <Metric label="Instances" value={String(latest.instanceCount ?? 0)} />
          <Metric label="Event loop lag" value={`${latest.eventLoopLagMs ?? 0}ms`} />
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {panels.map((panel) => (
          <Panel key={panel.key}>
            <SectionHead title={panel.title} hint={`Peak ${panel.peak} over the window`} />
            <TrendArea
              data={series}
              dataKey={panel.key}
              label={panel.title}
              color={panel.color}
              yFormatter={panel.unit}
              xKey="timestamp"
              xFormatter={(t: string) => new Date(t).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              height={180}
            />
          </Panel>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- cost */

export function Cost() {
  const { data, loading } = useApi<any>("/api/cost", []);
  if (loading || !data) return <PageSkeleton />;

  const { cost, recommendations, provenance } = data;
  const anomalyDates = new Set<string>(cost.anomalies.map((a: any) => a.date));

  return (
    <div className="space-y-5">
      {/* Provenance is stated up front — never let sample figures read as real spend. */}
      <div
        className="flex items-start gap-3 rounded-md border px-4 py-3 text-xs"
        style={{ borderColor: "color-mix(in oklab, var(--sev-warning) 35%, transparent)", background: "color-mix(in oklab, var(--sev-warning) 8%, transparent)" }}
      >
        <span aria-hidden style={{ color: "var(--sev-warning)" }}>⚠</span>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">Sample cost data.</span> {provenance.note} Schema:{" "}
          <code className="font-mono">{provenance.schema}</code>
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label={`Spend (${cost.days}d)`} value={fmtUsd(cost.total)} />
        <StatTile label="Daily mean" value={fmtUsd(cost.dailyMean)} />
        <StatTile label="Projected monthly" value={fmtUsd(cost.projectedMonthly)} />
        <StatTile
          label="Cost anomalies"
          value={String(cost.anomalies.length)}
          tone={cost.anomalies.length > 0 ? "warning" : undefined}
        />
      </div>

      <Panel>
        <SectionHead
          title="Daily spend"
          hint="Amber marks a day above 1.5× the period mean — the §14 cost anomaly rule"
        />
        <CostBars data={cost.trend} anomalyDates={anomalyDates} />
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHead title="Cost by service" hint="Where the money goes" />
          <RankedBars data={cost.byService} labelKey="service" valueKey="cost" formatter={fmtUsd} />
        </Panel>
        <Panel>
          <SectionHead title="Cost by SKU" hint="The billing export's finest granularity" />
          <RankedBars data={cost.bySku.slice(0, 8)} labelKey="sku" valueKey="cost" formatter={fmtUsd} />
        </Panel>
      </div>

      <Panel>
        <SectionHead
          title="Optimisation recommendations"
          hint="Advisory only — every one carries its evidence and estimated impact, and none of them act"
        />
        <ul className="space-y-3">
          {recommendations.map((rec: any) => (
            <li key={rec.id} className="border-border/60 bg-secondary/30 rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rec.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{rec.reason}</p>
                </div>
                <div className="text-right">
                  <p className="tabular text-base font-semibold" style={{ color: "var(--status-good)" }}>
                    ~{fmtUsd(rec.impact)}
                  </p>
                  <p className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
                    est. saving · {rec.confidence} confidence
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground mb-1 text-[0.65rem] tracking-[0.08em] uppercase">Evidence</p>
                  <ul className="space-y-0.5">
                    {rec.evidence.map((line: string) => (
                      <li key={line} className="text-muted-foreground font-mono text-[0.7rem]">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1 text-[0.65rem] tracking-[0.08em] uppercase">
                    Suggested action
                  </p>
                  <p className="text-xs">{rec.action}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
