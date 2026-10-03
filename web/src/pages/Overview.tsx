import { Figure, Section } from "@/components/layout";
import { GRADE_COLOR, GRADE_LABEL, Legend, Panel, SeverityBadge, StatTile } from "@/components/primitives";
import { RankedBars, SeverityStack } from "@/components/charts";
import { useApi } from "@/lib/api";
import type { OverviewResponse } from "@/lib/contracts";
import { ActionQueue, SummaryChip } from "@/components/actions";
import { ProjectSummary, ServiceWatchlist } from "@/components/summary";
import { buildHash } from "@/lib/nav";
import { ALERT_COLOR, SEVERITY_COLOR, fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

export function Overview({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<OverviewResponse>(`/api/overview?${win}&scope=${scope}`, [win, scope], refreshMs);
  if (loading || !data) return <PageSkeleton />;

  const {
    health, deltas, sparkline, timeline, severity, status, topEvents,
    services, alerts, activeAlertCount, performance, resourceLatest,
    actions, actionCounts, summaries, byConnection, freshness, incidents
  } = data;

  // Too little traffic in the window for a rate to mean anything.
  const sparse = health.grade === "sparse" || health.grade === "nodata";

  return (
    <div className="space-y-7">
      {/* --------------------------------------------------------- STATUS --
          The band and the action queue are one unit: who, how healthy, and what
          to do. Tight spacing inside, room after. */}
      <div className="space-y-2">
      <ProjectSummary
        connection={byConnection[0]}
        health={health}
        services={services}
        activeAlertCount={activeAlertCount}
        criticalAlertCount={alerts.filter((a) => a.active && a.severity === "critical").length}
        resolvedAlertCount={alerts.filter((a) => !a.active).length}
        actNowCount={actionCounts.critical}
        totalActions={actionCounts.total}
        freshness={freshness}
        scope={scope}
      />

      {/* ------------------------------------------------------- ACTIONS --
          First on the page, before any chart. A reader who only looks at the
          top of this dashboard should still learn what needs doing. */}
      <ActionQueue actions={actions} counts={actionCounts} sparse={sparse} />
      </div>

      {/* ---------------------------------------------------------- HEALTH */}
      <Section
        eyebrow="Right now"
        title="Service health"
      >
        <Panel>
          <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-5">
            <div>
              <div className="flex items-center gap-3">
                <span aria-hidden className="size-3 rounded-full" style={{ background: GRADE_COLOR[health.grade] }} />
                <span className="text-4xl leading-none font-semibold first-letter:uppercase">
                  {GRADE_LABEL[health.grade] ?? health.grade}
                </span>
              </div>
              <p className="text-muted-foreground mt-2.5 text-sm">
                {fmtNum(health.requests)} requests &middot; {health.requestsPerMinute}/min
                &middot; {health.uniqueServices} services &middot; {health.uniqueRoutes} routes
              </p>
            </div>

            <div className="grid grid-cols-2 gap-x-10 gap-y-4 sm:grid-cols-4">
              <Figure
                label="Availability"
                value={fmtPct(health.availability, 2)}
                help="Share of requests that did not fail on our side"
                tone={sparse ? undefined : health.availability < 0.99 ? "var(--sev-error)" : undefined}
              />
              <Figure
                label="Apdex"
                value={health.apdex.toFixed(2)}
                help="1.00 is everyone satisfied; below 0.80 needs work"
                tone={sparse ? undefined : health.apdex < 0.8 ? "var(--sev-warning)" : undefined}
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
      >
        <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 xl:grid-cols-4">
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
            spark={timeline.map((p) => p.errorRate)}
            sparkTone="var(--sev-error)"
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
            spark={timeline.map((p) => p.p95)}
            sparkTone="var(--sev-warning)"
            to="performance"
            params={{ scope }}
            caption="Threshold for the latency alert is 500ms"
          />
          <StatTile
            label="Active alerts"
            value={String(activeAlertCount)}
            tone={activeAlertCount > 0 ? "critical" : "good"}
            to="incidents"
            params={{ scope }}
            caption={activeAlertCount === 0 ? "No threshold is currently crossed" : "Thresholds crossed right now"}
          />
        </div>
      </Section>

      {/* ----------------------------------------------------------- ERRORS */}
      <Section
        eyebrow="Reliability"
        title="What is failing"
        right={<SummaryChip summary={summaries.reliability} />}
      >
        <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 xl:grid-cols-4">
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

        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold" title="Stacked, so the error share reads against total traffic rather than in isolation.">
                  Volume over time, by severity
                </h3>
              </div>
              <Legend
                items={(["INFO", "WARNING", "ERROR"] as const).map((s) => ({ label: s, color: SEVERITY_COLOR[s] }))}
              />
            </div>
            <SeverityStack data={timeline} />
          </Panel>

          <Panel>
            <h3 className="mb-1 text-sm font-semibold" title="INFO is routine traffic. Click any row to read those entries.">
              Severity split
            </h3>
            <ul className="mt-3 space-y-3">
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
        right={
          <>
            <SummaryChip summary={summaries.services} />
            <a href={buildHash("services", { scope })} className="text-muted-foreground hover:text-foreground text-xs">
              All services &rarr;
            </a>
          </>
        }
      >
        <ServiceWatchlist services={services} scope={scope} />
      </Section>

      {/* ---------------------------------------------------------- DETAIL */}
      <Section
        eyebrow="Detail"
        title="Failures and slow paths"
      >
        <div className="grid gap-2 lg:grid-cols-2">
          <Panel>
            <h3 className="mb-1 text-sm font-semibold" title="Warnings and errors grouped by event name. Click one to read just those entries.">
              Most frequent failures
            </h3>
            <ul className="mt-3 space-y-2.5">
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
            <h3 className="mb-1 text-sm font-semibold" title="Ranked by p95. Amber marks anything past the 500ms alert threshold.">
              Slowest endpoints
            </h3>
            <div className="mt-3">
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

      {/* ------------------------------------------------------- INCIDENTS */}
      <Section
        eyebrow="Attention"
        title="Open incidents"
        right={
          <a href={buildHash("incidents", { scope })} className="text-muted-foreground hover:text-foreground text-xs">
            All incidents &rarr;
          </a>
        }
      >
        <Panel className="py-0">
          {incidents.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              No threshold was crossed in this window.
            </p>
          ) : (
            <ul className="divide-border/50 divide-y">
              {incidents.map((incident) => (
                <li key={incident.id}>
                  <a
                    href={buildHash("incidents", { scope })}
                    className="hover:bg-secondary/40 flex items-start gap-4 px-5 py-3.5 transition-colors"
                  >
                    <span
                      aria-hidden
                      className="mt-1.5 size-2 shrink-0 rounded-full"
                      style={{ background: ALERT_COLOR[incident.severity] }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">{incident.title}</p>
                        <span
                          className="shrink-0 text-[0.62rem] font-medium tracking-wide uppercase"
                          style={{ color: ALERT_COLOR[incident.severity] }}
                        >
                          {incident.active ? `${incident.severity} · breaching` : incident.severity}
                        </span>
                        {incident.episodeCount > 1 && (
                          <span className="bg-secondary text-muted-foreground shrink-0 rounded-sm px-1.5 py-0.5 text-[0.6rem]">
                            {incident.episodeCount} episodes
                          </span>
                        )}
                      </div>
                      <p className="text-muted-foreground mt-0.5 truncate text-xs">{incident.description}</p>
                      {/* The leading cause is the single most useful thing to
                          put on a summary row — it is what the reader opens
                          the incident to find. */}
                      {incident.causes[0] && (
                        <p className="text-muted-foreground mt-1 truncate text-xs">
                          <span className="font-medium">Likely:</span> {incident.causes[0].claim}
                        </p>
                      )}
                    </div>
                    <div className="w-24 shrink-0 text-right">
                      <p className="text-muted-foreground tabular text-xs">{relative(incident.lastSeen)}</p>
                      <p className="text-muted-foreground tabular text-[0.65rem]">
                        {incident.durationMinutes}m breaching
                      </p>
                    </div>
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
      <div className="grid auto-rows-fr gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="bg-card/60 h-28 animate-pulse rounded-xl" />
        ))}
      </div>
      <div className="bg-card/60 h-72 animate-pulse rounded-xl" />
    </div>
  );
}
