import {
  FreshnessNote,
  GRADE_COLOR,
  GradeBadge,
  Legend,
  Metric,
  Panel,
  SectionHead,
  SeverityBadge,
  StatTile
} from "@/components/primitives";
import { RankedBars, SeverityStack } from "@/components/charts";
import { useApi } from "@/lib/api";
import { buildHash } from "@/lib/nav";
import { ALERT_COLOR, SEVERITY_COLOR, fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

export function Overview({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/overview?hours=${hours}`, [hours]);
  if (loading || !data) return <PageSkeleton />;

  const { health, deltas, sparkline, timeline, severity, status, topEvents, services, alerts, activeAlertCount, performance, resourceLatest, freshness } = data;

  return (
    <div className="space-y-6">
      {/* Health hero — the one number the dashboard leads with. */}
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <p className="text-muted-foreground text-[0.7rem] tracking-[0.1em] uppercase">System health</p>
            <div className="mt-2 flex items-center gap-3">
              <span aria-hidden className="size-3 rounded-full" style={{ background: GRADE_COLOR[health.grade] }} />
              <span className="text-[2.5rem] leading-none font-semibold capitalize">{health.grade}</span>
              <GradeBadge grade={health.grade} />
            </div>
            <p className="text-muted-foreground mt-2 text-sm">
              {fmtNum(health.requests)} requests over {hours}h · {health.requestsPerMinute}/min ·{" "}
              {health.uniqueServices} services · {health.uniqueRoutes} routes
            </p>
            <div className="mt-3">
              <FreshnessNote freshness={freshness} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
            <Metric label="Availability" value={fmtPct(health.availability, 2)} tone={health.availability < 0.99 ? "var(--sev-error)" : undefined} />
            <Metric label="Apdex" value={health.apdex.toFixed(2)} tone={health.apdex < 0.8 ? "var(--sev-warning)" : undefined} />
            <Metric label="p95" value={fmtMs(health.p95)} />
            <Metric label="p99" value={fmtMs(health.p99)} />
          </div>
        </div>
      </Panel>

      {/* Every tile drills into the view that explains it. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Requests"
          value={fmtNum(health.requests)}
          delta={deltas.requests}
          deltaLabel={`${deltas.requests >= 0 ? "+" : ""}${fmtNum(deltas.requests)} vs first half`}
          goodDirection="up"
          spark={sparkline}
          to="logs"
        />
        <StatTile
          label="Error rate"
          value={fmtPct(health.errorRate)}
          delta={deltas.errorRate}
          deltaLabel={`${fmtPct(Math.abs(deltas.errorRate), 2)} change`}
          tone={health.errorRate > 0.05 ? "critical" : health.errorRate > 0.02 ? "warning" : undefined}
          to="logs"
          params={{ severity: "ERROR" }}
        />
        <StatTile
          label="p95 latency"
          value={fmtMs(health.p95)}
          delta={deltas.p95}
          deltaLabel={`${deltas.p95 >= 0 ? "+" : ""}${fmtMs(Math.abs(deltas.p95))} change`}
          tone={health.p95 > 500 ? "warning" : undefined}
          to="performance"
        />
        <StatTile
          label="Active alerts"
          value={String(activeAlertCount)}
          tone={activeAlertCount > 0 ? "critical" : "good"}
          caption={activeAlertCount === 0 ? "No threshold is currently crossed" : "Needs attention"}
          to="alerts"
        />
      </div>

      {/* 4xx and 5xx mean different things — callers vs us. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Server errors (5xx)"
          value={fmtNum(health.serverErrors)}
          caption={`${fmtPct(health.serverErrorRate, 2)} of traffic — our fault`}
          tone={health.serverErrors > 0 ? "critical" : "good"}
          to="logs"
          params={{ statusClass: "5xx" }}
        />
        <StatTile
          label="Client errors (4xx)"
          value={fmtNum(health.clientErrors)}
          caption={`${fmtPct(health.clientErrorRate, 2)} of traffic — caller side`}
          tone={health.clientErrors > 0 ? "warning" : undefined}
          to="logs"
          params={{ statusClass: "4xx" }}
        />
        <StatTile
          label="Slow requests"
          value={fmtNum(health.slowRequests)}
          caption="Over the 500ms threshold"
          to="performance"
        />
        <StatTile
          label="CPU now"
          value={`${resourceLatest.cpuPercent?.toFixed(0) ?? 0}%`}
          caption={`${resourceLatest.instanceCount ?? 0} instances · ${resourceLatest.dbConnections ?? 0} DB connections`}
          to="resources"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SectionHead
            title="Request volume by severity"
            hint="Stacked so error share reads against total traffic"
            to="logs"
            right={
              <Legend
                items={(["INFO", "WARNING", "ERROR"] as const).map((s) => ({ label: s, color: SEVERITY_COLOR[s] }))}
              />
            }
          />
          <SeverityStack data={timeline} />
        </Panel>

        <Panel>
          <SectionHead title="Severity split" hint="Click a row to filter the logs" />
          <ul className="mt-1 space-y-3.5">
            {severity.map((row: any) => {
              const share = health.requests === 0 ? 0 : row.count / health.requests;
              return (
                <li key={row.severity}>
                  <a href={buildHash("logs", { severity: row.severity })} className="group block">
                    <div className="mb-1.5 flex items-center justify-between">
                      <SeverityBadge severity={row.severity} />
                      <span className="tabular text-sm font-medium group-hover:underline">{fmtNum(row.count)}</span>
                    </div>
                    <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(1, share * 100)}%`, background: SEVERITY_COLOR[row.severity] }}
                      />
                    </div>
                    <p className="text-muted-foreground tabular mt-1 text-xs">{fmtPct(share)}</p>
                  </a>
                </li>
              );
            })}
          </ul>

          <div className="border-border/60 mt-5 border-t pt-4">
            <p className="text-muted-foreground mb-2.5 text-[0.7rem] tracking-[0.08em] uppercase">
              Status families
            </p>
            <ul className="space-y-2">
              {status.map((family: any) => (
                <li key={family.family}>
                  <a
                    href={buildHash("logs", { statusClass: family.family })}
                    className="hover:bg-secondary/50 -mx-1.5 flex items-center justify-between rounded px-1.5 py-1 text-xs transition-colors"
                  >
                    <span className="text-muted-foreground">
                      <span className="text-foreground font-mono">{family.family}</span> {family.label}
                    </span>
                    <span className="tabular font-medium">{fmtNum(family.count)}</span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </Panel>
      </div>

      {/* Per-service overview — §11 "errors by service". */}
      <Panel>
        <SectionHead
          title="Services"
          hint="Health per component — click through to that service's logs"
          to="services"
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.slice(0, 6).map((service: any) => (
            <a
              key={service.name}
              href={buildHash("logs", { service: service.name })}
              className="border-border/60 hover:border-border hover:bg-secondary/30 group rounded-lg border p-3.5 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm">{service.name}</span>
                <GradeBadge grade={service.grade} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <div>
                  <p className="text-muted-foreground text-[0.62rem] tracking-wide uppercase">Requests</p>
                  <p className="tabular text-sm font-medium">{fmtNum(service.requests)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[0.62rem] tracking-wide uppercase">Errors</p>
                  <p
                    className="tabular text-sm font-medium"
                    style={{ color: service.errorRate > 0.02 ? "var(--sev-error)" : undefined }}
                  >
                    {fmtPct(service.errorRate)}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-[0.62rem] tracking-wide uppercase">p95</p>
                  <p className="tabular text-sm font-medium">{fmtMs(service.p95)}</p>
                </div>
              </div>
              {service.topFailure && (
                <p className="text-muted-foreground mt-2.5 truncate font-mono text-[0.68rem]">
                  top failure: {service.topFailure} ×{service.topFailureCount}
                </p>
              )}
            </a>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <SectionHead
            title="Most frequent failures"
            hint="Warnings and errors by event name — click to filter"
            to="logs"
            params={{ severity: "ERROR" }}
          />
          <ul className="space-y-2.5">
            {topEvents.map((row: any) => {
              const max = Math.max(...topEvents.map((e: any) => e.count), 1);
              return (
                <li key={row.event}>
                  <a href={buildHash("logs", { event: row.event })} className="group block">
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="truncate font-mono text-xs group-hover:underline">{row.event}</span>
                      <span className="tabular text-muted-foreground shrink-0 text-xs">{fmtNum(row.count)}</span>
                    </div>
                    <div className="bg-secondary h-1.5 overflow-hidden rounded-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max(2, (row.count / max) * 100)}%`,
                          background: SEVERITY_COLOR[row.severity]
                        }}
                      />
                    </div>
                  </a>
                </li>
              );
            })}
          </ul>
        </Panel>

        <Panel>
          <SectionHead title="Slowest routes" hint="By p95 — amber marks over 500ms" to="performance" />
          <RankedBars data={performance} labelKey="route" valueKey="p95" formatter={fmtMs} highlightOver={500} height={190} />
        </Panel>
      </div>

      <Panel>
        <SectionHead title="Recent alerts" hint="Threshold breaches, most recent first" to="alerts" />
        {alerts.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No threshold was crossed in this window.</p>
        ) : (
          <ul className="divide-border/60 divide-y">
            {alerts.map((alert: any) => (
              <li key={`${alert.ruleId}-${alert.firstSeen}`}>
                <a
                  href={buildHash("alerts")}
                  className="hover:bg-secondary/30 -mx-2 flex items-center gap-4 rounded px-2 py-3 transition-colors"
                >
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
                </a>
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
      <div className="bg-card/60 h-32 animate-pulse rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card/60 h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-card/60 h-72 animate-pulse rounded-xl" />
    </div>
  );
}
