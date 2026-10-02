import { Legend, Metric, Panel, SectionHead, StatTile } from "@/components/primitives";
import { RankedBars, TrendArea, TrendLine } from "@/components/charts";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import type { PerformanceResponse, ResourcesResponse } from "@/lib/contracts";
import { SERIES, fmtMs } from "@/lib/viz";

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
