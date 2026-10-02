import { Explain, Figure, Section } from "@/components/layout";
import { GRADE_COLOR, GradeBadge, Legend, Panel, SeverityBadge, StatTile } from "@/components/primitives";
import { RankedBars, SeverityStack } from "@/components/charts";
import { ProviderMark } from "@/components/scope";
import { useApi } from "@/lib/api";
import { buildHash } from "@/lib/nav";
import { ALERT_COLOR, SEVERITY_COLOR, fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

export function Overview({ hours, scope }: { hours: number; scope: string }) {
  const { data, loading } = useApi<any>(`/api/overview?hours=${hours}&scope=${scope}`, [hours, scope]);
  if (loading || !data) return <PageSkeleton />;

  const {
    health, deltas, sparkline, timeline, severity, status, topEvents,
    services, alerts, activeAlertCount, performance, resourceLatest, byConnection
  } = data;

  return (
    <div className="space-y-10">
      {/* ---------------------------------------------------------- HEALTH */}
      <Section
        eyebrow="Right now"
        title="Service health"
        description="One judgement from three signals: how often requests fail, how slow they are, and how many succeed at all. Everything below explains this verdict."
      >
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            <div>
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-3 rounded-full" style={{ background: GRADE_COLOR[health.grade] }} />
                <span className="text-4xl leading-none font-semibold capitalize">{health.grade}</span>
                <GradeBadge grade={health.grade} />
              </div>
              <p className="text-muted-foreground mt-2.5 text-sm">
                {fmtNum(health.requests)} requests over the last {hours}h &middot; {health.requestsPerMinute}/min
                &middot; {health.uniqueServices} services &middot; {health.uniqueRoutes} routes
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
              <Figure
                label="Availability"
                value={fmtPct(health.availability, 2)}
                help="Share of requests that did not fail on our side"
                tone={health.availability < 0.99 ? "var(--sev-error)" : undefined}
              />
              <Figure
                label="Apdex"
                value={health.apdex.toFixed(2)}
                help="1.00 is everyone satisfied; below 0.80 needs work"
                tone={health.apdex < 0.8 ? "var(--sev-warning)" : undefined}
              />
              <Figure label="p95 latency" value={fmtMs(health.p95)} help="95% of requests were faster than this" />
              <Figure label="p99 latency" value={fmtMs(health.p99)} help="The slow tail — your worst 1%" />
            </div>
          </div>
        </Panel>
      </Section>

      {/* --------------------------------------------------------- HEADLINE */}
      <Section
        eyebrow="Key numbers"
        title="At a glance"
        description="Each tile opens the view that explains it. Arrows compare the second half of the window against the first."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Requests"
            value={fmtNum(health.requests)}
            delta={deltas.requests}
            deltaLabel={`${deltas.requests >= 0 ? "+" : ""}${fmtNum(deltas.requests)} vs first half`}
            goodDirection="up"
            spark={sparkline}
            to="logs"
            params={{ scope }}
            caption="Total log entries in this window"
          />
          <StatTile
            label="Error rate"
            value={fmtPct(health.errorRate)}
            delta={deltas.errorRate}
            deltaLabel={`${fmtPct(Math.abs(deltas.errorRate), 2)} change`}
            tone={health.errorRate > 0.05 ? "critical" : health.errorRate > 0.02 ? "warning" : undefined}
            to="logs"
            params={{ severity: "ERROR", scope }}
            caption="Share of entries logged at ERROR"
          />
          <StatTile
            label="p95 latency"
            value={fmtMs(health.p95)}
            delta={deltas.p95}
            deltaLabel={`${deltas.p95 >= 0 ? "+" : ""}${fmtMs(Math.abs(deltas.p95))} change`}
            tone={health.p95 > 500 ? "warning" : undefined}
            to="performance"
            params={{ scope }}
            caption="Threshold for the latency alert is 500ms"
          />
          <StatTile
            label="Active alerts"
            value={String(activeAlertCount)}
            tone={activeAlertCount > 0 ? "critical" : "good"}
            to="alerts"
            params={{ scope }}
            caption={activeAlertCount === 0 ? "No threshold is currently crossed" : "Thresholds crossed right now"}
          />
        </div>
      </Section>

      {/* ------------------------------------------------------ WHERE FROM */}
      {byConnection.length > 1 && (
        <Section
          eyebrow="Multi-cloud"
          title="Where this traffic came from"
          description="Telemetry from every connected account, normalized into one format. Narrow the whole dashboard to a provider or a single account from the scope selector above."
          right={
            <a href={buildHash("connections")} className="text-muted-foreground hover:text-foreground text-xs">
              Manage connections &rarr;
            </a>
          }
        >
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {byConnection.map((connection: any) => (
              <a
                key={connection.id}
                href={buildHash("overview", { scope: connection.id })}
                className="border-border/60 bg-card hover:border-border hover:bg-secondary/30 rounded-lg border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <ProviderMark provider={connection.provider} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{connection.name}</p>
                      <p className="text-muted-foreground truncate font-mono text-xs">{connection.account}</p>
                    </div>
                  </div>
                  <span className="border-border/70 text-muted-foreground shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem]">
                    {connection.environment}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <Figure label="Requests" value={fmtNum(connection.requests)} size="sm" />
                  <Figure
                    label="Errors"
                    value={fmtNum(connection.errors)}
                    size="sm"
                    tone={connection.errors > 0 ? "var(--sev-error)" : undefined}
                  />
                  <Figure label="Warnings" value={fmtNum(connection.warnings)} size="sm" />
                </div>
              </a>
            ))}
          </div>
        </Section>
      )}

      {/* ----------------------------------------------------------- ERRORS */}
      <Section
        eyebrow="Reliability"
        title="What is failing"
        description="Server errors are ours to fix; client errors mean callers are sending something we rejected. They need different responses, so they are counted separately."
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            label="Server errors (5xx)"
            value={fmtNum(health.serverErrors)}
            caption={`${fmtPct(health.serverErrorRate, 2)} of traffic — our fault`}
            tone={health.serverErrors > 0 ? "critical" : "good"}
            to="logs"
            params={{ statusClass: "5xx", scope }}
          />
          <StatTile
            label="Client errors (4xx)"
            value={fmtNum(health.clientErrors)}
            caption={`${fmtPct(health.clientErrorRate, 2)} of traffic — caller side`}
            tone={health.clientErrors > 0 ? "warning" : undefined}
            to="logs"
            params={{ statusClass: "4xx", scope }}
          />
          <StatTile
            label="Slow requests"
            value={fmtNum(health.slowRequests)}
            caption="Took longer than 500ms"
            to="performance"
            params={{ scope }}
          />
          <StatTile
            label="Infrastructure"
            value={`${resourceLatest.cpuPercent?.toFixed(0) ?? 0}% CPU`}
            caption={`${resourceLatest.instanceCount ?? 0} instances · ${resourceLatest.dbConnections ?? 0} DB connections`}
            to="resources"
            params={{ scope }}
          />
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold">Volume over time, by severity</h3>
                <Explain>Stacked, so the error share reads against total traffic rather than in isolation.</Explain>
              </div>
              <Legend
                items={(["INFO", "WARNING", "ERROR"] as const).map((s) => ({ label: s, color: SEVERITY_COLOR[s] }))}
              />
            </div>
            <SeverityStack data={timeline} />
          </Panel>

          <Panel>
            <h3 className="mb-1 text-sm font-semibold">Severity split</h3>
            <Explain>INFO is routine traffic. Click any row to read those entries.</Explain>
            <ul className="mt-4 space-y-3.5">
              {severity.map((row: any) => {
                const share = health.requests === 0 ? 0 : row.count / health.requests;
                return (
                  <li key={row.severity}>
                    <a href={buildHash("logs", { severity: row.severity, scope })} className="group block">
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
                      <p className="text-muted-foreground tabular mt-1 text-xs">{fmtPct(share)} of all entries</p>
                    </a>
                  </li>
                );
              })}
            </ul>

            <div className="border-border/60 mt-5 border-t pt-4">
              <p className="text-muted-foreground mb-2.5 text-xs font-medium">By HTTP status family</p>
              <ul className="space-y-1">
                {status.map((family: any) => (
                  <li key={family.family}>
                    <a
                      href={buildHash("logs", { statusClass: family.family, scope })}
                      className="hover:bg-secondary/60 -mx-1.5 flex items-center justify-between rounded px-1.5 py-1 text-xs transition-colors"
                    >
                      <span className="text-muted-foreground">
                        <span className="text-foreground font-mono font-medium">{family.family}</span> {family.label}
                      </span>
                      <span className="tabular font-medium">{fmtNum(family.count)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </Panel>
        </div>
      </Section>

      {/* --------------------------------------------------------- SERVICES */}
      <Section
        eyebrow="Breakdown"
        title="Health by service"
        description="Which workload is responsible. A grade combines its error rate, latency and availability."
        right={
          <a href={buildHash("services", { scope })} className="text-muted-foreground hover:text-foreground text-xs">
            All services &rarr;
          </a>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.slice(0, 6).map((service: any) => (
            <a
              key={service.name}
              href={buildHash("logs", { service: service.name, scope })}
              className="border-border/60 bg-card hover:border-border hover:bg-secondary/30 rounded-lg border p-4 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-mono text-sm font-medium">{service.name}</span>
                <GradeBadge grade={service.grade} />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <Figure label="Requests" value={fmtNum(service.requests)} size="sm" />
                <Figure
                  label="Error rate"
                  value={fmtPct(service.errorRate)}
                  size="sm"
                  tone={service.errorRate > 0.02 ? "var(--sev-error)" : undefined}
                />
                <Figure label="p95" value={fmtMs(service.p95)} size="sm" />
              </div>
              {service.topFailure && (
                <p className="text-muted-foreground mt-2.5 truncate font-mono text-xs">
                  top failure: {service.topFailure} &times;{service.topFailureCount}
                </p>
              )}
            </a>
          ))}
        </div>
      </Section>

      {/* ---------------------------------------------------------- DETAIL */}
      <Section
        eyebrow="Detail"
        title="Failures and slow paths"
        description="The specific events and endpoints worth looking at first."
      >
        <div className="grid gap-3 lg:grid-cols-2">
          <Panel>
            <h3 className="mb-1 text-sm font-semibold">Most frequent failures</h3>
            <Explain>Warnings and errors grouped by event name. Click one to read just those entries.</Explain>
            <ul className="mt-4 space-y-2.5">
              {topEvents.map((row: any) => {
                const max = Math.max(...topEvents.map((e: any) => e.count), 1);
                return (
                  <li key={row.event}>
                    <a href={buildHash("logs", { event: row.event, scope })} className="group block">
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
            <h3 className="mb-1 text-sm font-semibold">Slowest endpoints</h3>
            <Explain>Ranked by p95. Amber marks anything past the 500ms alert threshold.</Explain>
            <div className="mt-4">
              <RankedBars
                data={performance}
                labelKey="route"
                valueKey="p95"
                formatter={fmtMs}
                highlightOver={500}
                height={180}
              />
            </div>
          </Panel>
        </div>
      </Section>

      {/* ---------------------------------------------------------- ALERTS */}
      <Section
        eyebrow="Attention"
        title="Recent alerts"
        description="A threshold being crossed, not every individual event. Open one for its likely cause and suggested fix."
        right={
          <a href={buildHash("alerts", { scope })} className="text-muted-foreground hover:text-foreground text-xs">
            All alerts &rarr;
          </a>
        }
      >
        <Panel>
          {alerts.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              No threshold was crossed in this window.
            </p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {alerts.map((alert: any) => (
                <li key={`${alert.ruleId}-${alert.firstSeen}`}>
                  <a
                    href={buildHash("alerts", { scope })}
                    className="hover:bg-secondary/40 -mx-2 flex items-center gap-4 rounded px-2 py-3 transition-colors"
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
                      className="shrink-0 text-xs font-medium tracking-wide uppercase"
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
      </Section>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-card/60 h-36 animate-pulse rounded-xl" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card/60 h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-card/60 h-72 animate-pulse rounded-xl" />
    </div>
  );
}
