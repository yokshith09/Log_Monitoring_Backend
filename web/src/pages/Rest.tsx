import { Legend, Metric, Panel, SectionHead, StatTile } from "@/components/primitives";
import { CostBars, RankedBars, TrendArea, TrendLine } from "@/components/charts";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import type { CostResponse, PerformanceResponse, ResourcesResponse } from "@/lib/contracts";
import { buildHash } from "@/lib/nav";
import { SERIES, fmtMs, fmtNum, fmtPct, fmtUsd } from "@/lib/viz";

/* ------------------------------------------------------------ performance */

export function Performance({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<PerformanceResponse>(`/api/performance?${win}&scope=${scope}`, [win, scope], refreshMs);
  if (loading || !data) return <PageSkeleton />;

  // The final bucket is partial at "now" and often empty, which rendered 0ms.
  // Headline percentiles come from the whole window instead.
  const latest = data.health ?? { p50: 0, p95: 0, p99: 0 };

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
        {/* A table, not a ranked bar of eight. The overview counts every route
            in the window, so this must show every route in the window —
            claiming 11 and showing 8 is the kind of quiet mismatch that makes a
            reader stop trusting the other numbers. */}
        <Panel className="py-0">
          <div className="px-5 pt-5">
            <SectionHead
              title={`All routes (${data.slowestRoutes.length})`}
              hint="Sorted by p95. Amber marks anything over the 500ms threshold."
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-border/60 text-muted-foreground border-b text-[0.68rem] tracking-[0.08em] uppercase">
                  <th className="px-5 py-2.5 font-medium">Route</th>
                  <th className="py-2.5 text-right font-medium">Requests</th>
                  <th className="py-2.5 text-right font-medium">Error rate</th>
                  <th className="py-2.5 text-right font-medium">Mean</th>
                  <th className="px-5 py-2.5 text-right font-medium">p95</th>
                </tr>
              </thead>
              <tbody>
                {data.slowestRoutes.map((row) => (
                  <tr
                    key={row.route}
                    onClick={() => (location.hash = buildHash("logs", { route: row.route, scope }))}
                    className="border-border/40 hover:bg-secondary/40 cursor-pointer border-b transition-colors last:border-b-0"
                  >
                    <td className="px-5 py-2.5 font-mono text-xs">{row.route}</td>
                    <td className="tabular py-2.5 text-right">{fmtNum(row.count)}</td>
                    <td
                      className="tabular py-2.5 text-right"
                      style={{ color: row.errorRate > 0.02 ? "var(--sev-error)" : undefined }}
                    >
                      {fmtPct(row.errorRate)}
                    </td>
                    <td className="tabular text-muted-foreground py-2.5 text-right">{fmtMs(row.avg)}</td>
                    <td
                      className="tabular px-5 py-2.5 text-right font-medium"
                      style={{ color: row.p95 > 500 ? "var(--sev-warning)" : undefined }}
                    >
                      {fmtMs(row.p95)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

export function Resources({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<ResourcesResponse>(`/api/resources?${win}&scope=${scope}`, [win, scope], refreshMs);
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

export function Cost({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<CostResponse>(`/api/cost?${win}&scope=${scope}`, [win, scope], refreshMs);
  if (loading || !data) return <PageSkeleton />;

  const { cost, recommendations, provenance } = data;
  const anomalyDates = new Set<string>(cost.anomalies.map((a) => a.date));

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
          title="Recommended actions"
          hint="Advisory only — nothing here changes a resource. Each carries its evidence and an estimated monthly saving."
          right={
            <span className="tabular text-sm font-semibold" style={{ color: "var(--status-good)" }}>
              ~{fmtUsd(recommendations.reduce((sum, r) => sum + r.impact, 0))}/mo total
            </span>
          }
        />
        {recommendations.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Nothing in this window suggests a saving worth the change.
          </p>
        ) : (
          <ol className="space-y-2.5">
            {recommendations.map((rec, i) => (
              <li key={rec.id} className="border-border/60 bg-card rounded-lg border px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
                  <div className="flex min-w-0 gap-3">
                    <span className="text-muted-foreground tabular mt-0.5 text-sm">{i + 1}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold">{rec.action}</p>
                      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{rec.reason}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-base font-semibold" style={{ color: "var(--status-good)" }}>
                      ~{fmtUsd(rec.impact)}
                    </p>
                    <p className="text-muted-foreground text-[0.62rem] tracking-wide uppercase">
                      est. saving · {rec.confidence}
                    </p>
                  </div>
                </div>

                <details className="group mt-2.5 ml-9">
                  <summary className="text-muted-foreground hover:text-foreground cursor-pointer text-xs">
                    Evidence ({rec.evidence.length})
                  </summary>
                  <ul className="mt-1.5 space-y-0.5">
                    {rec.evidence.map((line) => (
                      <li key={line} className="text-muted-foreground font-mono text-[0.7rem]">
                        {line}
                      </li>
                    ))}
                  </ul>
                </details>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  );
}
