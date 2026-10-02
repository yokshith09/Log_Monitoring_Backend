import { Legend, Metric, Panel, SectionHead, SeverityBadge, StatTile } from "@/components/primitives";
import { RankedBars, SeverityStack, TrendArea } from "@/components/charts";
import { useApi } from "@/lib/api";
import { ALERT_COLOR, SEVERITY_COLOR, fmtMs, fmtNum, fmtPct, relative, seriesColor } from "@/lib/viz";

export function Overview({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/overview?hours=${hours}`, [hours]);
  if (loading || !data) return <PageSkeleton />;

  const { totals, deltas, timeline, sparkline, severity, topEvents, components, alerts } = data;
  const healthy = totals.errorRate < 0.05 && alerts.filter((a: any) => a.active).length === 0;

  return (
    <div className="space-y-6">
      {/* Hero — the one number the dashboard leads with. */}
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div>
            <p className="text-muted-foreground text-[0.7rem] tracking-[0.1em] uppercase">System health</p>
            <div className="mt-2 flex items-center gap-3">
              <span
                aria-hidden
                className="size-3 rounded-full"
                style={{ background: healthy ? "var(--status-good)" : "var(--sev-error)" }}
              />
              <span className="text-[2.5rem] leading-none font-semibold">
                {healthy ? "Healthy" : "Degraded"}
              </span>
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              {totals.requests.toLocaleString()} requests over the last {hours}h ·{" "}
              {alerts.filter((a: any) => a.active).length} active alert
              {alerts.filter((a: any) => a.active).length === 1 ? "" : "s"}
            </p>
          </div>

          <div className="flex gap-8">
            <Metric label="Error rate" value={fmtPct(totals.errorRate)} />
            <Metric label="p95 latency" value={fmtMs(totals.p95)} />
            <Metric label="p99 latency" value={fmtMs(totals.p99)} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Requests"
          value={fmtNum(totals.requests)}
          delta={deltas.requests}
          deltaLabel={`${deltas.requests >= 0 ? "+" : ""}${fmtNum(deltas.requests)} vs first half`}
          goodDirection="up"
          spark={sparkline}
        />
        <StatTile
          label="Error rate"
          value={fmtPct(totals.errorRate)}
          delta={deltas.errorRate}
          deltaLabel={`${fmtPct(Math.abs(deltas.errorRate), 2)} change`}
          tone={totals.errorRate > 0.05 ? "critical" : undefined}
        />
        <StatTile
          label="p95 latency"
          value={fmtMs(totals.p95)}
          delta={deltas.p95}
          deltaLabel={`${deltas.p95 >= 0 ? "+" : ""}${fmtMs(Math.abs(deltas.p95))} change`}
          tone={totals.p95 > 500 ? "warning" : undefined}
        />
        <StatTile
          label="Warnings"
          value={fmtNum(totals.warnings)}
          tone={totals.warnings > 0 ? "warning" : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionHead
            title="Request volume by severity"
            hint="Stacked so error share reads against total traffic"
            right={
              <Legend
                items={[
                  { label: "INFO", color: SEVERITY_COLOR.INFO },
                  { label: "WARNING", color: SEVERITY_COLOR.WARNING },
                  { label: "ERROR", color: SEVERITY_COLOR.ERROR }
                ]}
              />
            }
          />
          <SeverityStack data={timeline} />
        </Panel>

        <Panel>
          <SectionHead title="Severity split" hint={`Across ${fmtNum(totals.requests)} entries`} />
          <ul className="mt-2 space-y-4">
            {severity.map((row: any) => {
              const share = totals.requests === 0 ? 0 : row.count / totals.requests;
              return (
                <li key={row.severity}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <SeverityBadge severity={row.severity} />
                    <span className="tabular text-sm font-medium">{fmtNum(row.count)}</span>
                  </div>
                  <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${Math.max(1, share * 100)}%`, background: SEVERITY_COLOR[row.severity] }}
                    />
                  </div>
                  <p className="text-muted-foreground tabular mt-1 text-xs">{fmtPct(share)}</p>
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHead title="Most frequent failures" hint="Warnings and errors, grouped by event name" />
          <RankedBars data={topEvents} labelKey="event" valueKey="count" height={200} />
        </Panel>

        <Panel>
          <SectionHead
            title="Traffic by component"
            hint="Which service is doing the work"
            right={
              <Legend
                items={components.components.slice(0, 6).map((c: string) => ({
                  label: c,
                  color: seriesColor(components.components, c)
                }))}
              />
            }
          />
          <TrendArea
            data={components.series}
            dataKey={components.components[0]}
            label={components.components[0]}
            color={seriesColor(components.components, components.components[0])}
            height={200}
          />
        </Panel>
      </div>

      <Panel>
        <SectionHead title="Recent alerts" hint="Threshold breaches, most recent first" />
        {alerts.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No threshold was crossed in this window.
          </p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {alerts.map((alert: any) => (
              <li key={`${alert.ruleId}-${alert.firstSeen}`} className="flex items-center gap-4 py-3">
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ background: ALERT_COLOR[alert.severity] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{alert.title}</p>
                  <p className="text-muted-foreground truncate text-xs">{alert.description}</p>
                </div>
                <span
                  className="shrink-0 text-[0.65rem] font-medium tracking-wide uppercase"
                  style={{ color: ALERT_COLOR[alert.severity] }}
                >
                  {alert.severity}
                </span>
                <span className="text-muted-foreground tabular w-20 shrink-0 text-right text-xs">
                  {relative(alert.lastSeen)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="bg-card/60 h-28 animate-pulse rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card/60 h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-card/60 h-72 animate-pulse rounded-xl" />
    </div>
  );
}
