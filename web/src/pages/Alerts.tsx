import { useState } from "react";
import { FreshnessNote, Metric, Panel, SectionHead, StatTile } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import { buildHash } from "@/lib/nav";
import { ALERT_COLOR, fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

/**
 * §14's alert model, with §10.6's "plain-language action" and §12 step 4's
 * "related signals for the same time period". Expanding an alert answers three
 * questions: what else was happening, why it probably happened, and what to do.
 */
export function Alerts({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/alerts?hours=${hours}`, [hours]);
  const [open, setOpen] = useState<string | null>(null);
  if (loading || !data) return <PageSkeleton />;

  const groups = [
    { title: "Active", hint: "Breaching now — these need attention", rows: data.active },
    { title: "Recent", hint: "Resolved — the threshold is no longer crossed", rows: data.recent }
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Active" value={String(data.active.length)} tone={data.active.length ? "critical" : "good"} />
        <StatTile label="Resolved in window" value={String(data.recent.length)} />
        {data.bySeverity.slice(0, 2).map((row: any) => (
          <StatTile
            key={row.severity}
            label={`${row.severity} incidents`}
            value={String(row.count)}
            tone={row.severity === "critical" && row.count ? "critical" : undefined}
          />
        ))}
      </div>

      <FreshnessNote freshness={data.freshness} />

      {groups.map((group) => (
        <Panel key={group.title}>
          <SectionHead title={group.title} hint={group.hint} />
          {group.rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">Nothing here.</p>
          ) : (
            <ul className="space-y-3">
              {group.rows.map((alert: any) => {
                const id = `${alert.ruleId}-${alert.firstSeen}`;
                const expanded = open === id;
                return (
                  <li
                    key={id}
                    className="border-border/60 overflow-hidden rounded-md border"
                    style={{ borderLeftWidth: 3, borderLeftColor: ALERT_COLOR[alert.severity] }}
                  >
                    <button
                      onClick={() => setOpen(expanded ? null : id)}
                      aria-expanded={expanded}
                      className="hover:bg-secondary/30 w-full p-4 text-left transition-colors"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-medium">{alert.title}</p>
                            <span
                              className="rounded-sm px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
                              style={{
                                color: ALERT_COLOR[alert.severity],
                                background: `color-mix(in oklab, ${ALERT_COLOR[alert.severity]} 14%, transparent)`
                              }}
                            >
                              {alert.severity}
                            </span>
                          </div>
                          <p className="text-muted-foreground mt-1 text-xs">{alert.description}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <span className="text-muted-foreground tabular text-xs">{relative(alert.lastSeen)}</span>
                          <span aria-hidden className="text-muted-foreground text-xs">
                            {expanded ? "▴" : "▾"}
                          </span>
                        </div>
                      </div>

                      <dl className="text-muted-foreground mt-3 flex flex-wrap gap-x-6 gap-y-1 text-[0.7rem]">
                        <div className="flex gap-1.5">
                          <dt>First seen</dt>
                          <dd className="text-foreground tabular">{new Date(alert.firstSeen).toLocaleTimeString()}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>Last seen</dt>
                          <dd className="text-foreground tabular">{new Date(alert.lastSeen).toLocaleTimeString()}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>Matching entries</dt>
                          <dd className="text-foreground tabular">{fmtNum(alert.count)}</dd>
                        </div>
                        <div className="flex gap-1.5">
                          <dt>Window</dt>
                          <dd className="text-foreground tabular">{alert.windowMinutes}m</dd>
                        </div>
                      </dl>
                    </button>

                    {expanded && (
                      <div className="border-border/60 bg-secondary/20 space-y-4 border-t p-4">
                        <div>
                          <p className="text-muted-foreground mb-2 text-[0.65rem] tracking-[0.08em] uppercase">
                            What else was happening in this window
                          </p>
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <Metric label="Requests" value={fmtNum(alert.correlation.requests)} />
                            <Metric label="Error rate" value={fmtPct(alert.correlation.errorRate)} />
                            <Metric label="p95" value={fmtMs(alert.correlation.p95)} />
                            <Metric
                              label="Peak CPU"
                              value={alert.correlation.peakCpu ? `${alert.correlation.peakCpu.toFixed(0)}%` : "—"}
                            />
                          </div>

                          {alert.correlation.affectedServices.length > 0 && (
                            <div className="mt-3 flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground text-xs">Affected services:</span>
                              {alert.correlation.affectedServices.map((svc: string) => (
                                <a
                                  key={svc}
                                  href={buildHash("logs", { service: svc })}
                                  className="border-border/60 bg-card hover:bg-secondary rounded border px-1.5 py-0.5 font-mono text-[0.68rem] transition-colors"
                                >
                                  {svc} &rarr;
                                </a>
                              ))}
                            </div>
                          )}

                          {alert.correlation.topEvents.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <span className="text-muted-foreground text-xs">Top events:</span>
                              {alert.correlation.topEvents.map((e: any) => (
                                <a
                                  key={e.event}
                                  href={buildHash("logs", { event: e.event })}
                                  className="border-border/60 bg-card hover:bg-secondary rounded border px-1.5 py-0.5 font-mono text-[0.68rem] transition-colors"
                                >
                                  {e.event} &times;{e.count}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>

                        {alert.remediation && (
                          <>
                            <div>
                              <p className="text-muted-foreground mb-1.5 text-[0.65rem] tracking-[0.08em] uppercase">
                                Likely cause
                              </p>
                              <p className="text-sm">{alert.remediation.likelyCause}</p>
                            </div>

                            <div>
                              <p className="text-muted-foreground mb-1.5 text-[0.65rem] tracking-[0.08em] uppercase">
                                Suggested actions
                              </p>
                              <ol className="space-y-1.5">
                                {alert.remediation.actions.map((action: string, i: number) => (
                                  <li key={action} className="flex gap-2.5 text-sm">
                                    <span className="text-muted-foreground tabular shrink-0">{i + 1}.</span>
                                    <span>{action}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>

                            <div
                              className="rounded-md border px-3 py-2"
                              style={{
                                borderColor: "color-mix(in oklab, var(--status-good) 30%, transparent)",
                                background: "color-mix(in oklab, var(--status-good) 7%, transparent)"
                              }}
                            >
                              <p className="text-muted-foreground text-[0.65rem] tracking-[0.08em] uppercase">
                                How you will know it is fixed
                              </p>
                              <p className="mt-1 text-sm">{alert.remediation.verify}</p>
                            </div>
                          </>
                        )}

                        <div className="flex flex-wrap gap-2">
                          <a
                            href={buildHash(
                              "logs",
                              alert.filter?.event ? { event: String(alert.filter.event) } : { severity: "ERROR" }
                            )}
                            className="border-border/60 bg-card hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
                          >
                            Open matching logs &rarr;
                          </a>
                          <a
                            href={buildHash("resources")}
                            className="border-border/60 bg-card hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
                          >
                            Check resources &rarr;
                          </a>
                          <a
                            href={buildHash("performance")}
                            className="border-border/60 bg-card hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
                          >
                            Check latency &rarr;
                          </a>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      ))}
    </div>
  );
}
