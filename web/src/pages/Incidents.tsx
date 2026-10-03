import { useState } from "react";
import { FreshnessNote, Metric, Panel, StatTile } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import type { Incident, IncidentsResponse } from "@/lib/contracts";
import { buildHash } from "@/lib/nav";
import { ALERT_COLOR, fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

/**
 * Incidents — one row per threshold, not per breach.
 *
 * A rule re-evaluates continuously, so a bad afternoon produces dozens of
 * breach records for one problem. Those are kept as EPISODES inside the
 * incident rather than shown as separate rows, which is the alert-fatigue
 * failure mode §20 calls out.
 *
 * Opening an incident answers, in order: what happened (summary), why it
 * probably happened (ranked causes with evidence), and what to do (remediation).
 */
export function Incidents({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<IncidentsResponse>(`/api/alerts?${win}&scope=${scope}`, [win, scope], refreshMs);
  const [open, setOpen] = useState<string | null>(null);
  if (loading || !data) return <PageSkeleton />;

  const groups = [
    { title: "Breaching now", rows: data.active },
    { title: "Resolved in this window", rows: data.recent }
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Breaching now"
          value={String(data.active.length)}
          tone={data.active.length ? "critical" : "good"}
          caption="Thresholds currently crossed"
        />
        <StatTile
          label="Resolved"
          value={String(data.recent.length)}
          caption="Stopped breaching during this window"
        />
        <StatTile
          label="Total episodes"
          value={String(data.episodeTotal)}
          caption={`Across ${data.total} distinct incident${data.total === 1 ? "" : "s"}`}
        />
        <StatTile
          label="Critical"
          value={String(data.bySeverity.find((s) => s.severity === "critical")?.count ?? 0)}
          tone={(data.bySeverity.find((s) => s.severity === "critical")?.count ?? 0) > 0 ? "critical" : undefined}
          caption="Highest-severity incidents"
        />
      </div>

      <FreshnessNote freshness={data.freshness} />

      {groups.map((group) => (
        <Panel key={group.title}>
          <p className="mb-3 text-sm font-semibold">{group.title}</p>
          {group.rows.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">None.</p>
          ) : (
            <ul className="space-y-2.5">
              {group.rows.map((incident) => (
                <IncidentRow
                  key={incident.id}
                  incident={incident}
                  expanded={open === incident.id}
                  onToggle={() => setOpen(open === incident.id ? null : incident.id)}
                  scope={scope}
                />
              ))}
            </ul>
          )}
        </Panel>
      ))}
    </div>
  );
}

function IncidentRow({
  incident,
  expanded,
  onToggle,
  scope
}: {
  incident: Incident;
  expanded: boolean;
  onToggle: () => void;
  scope: string;
}) {
  const tone = ALERT_COLOR[incident.severity];

  return (
    <li
      className="border-border/60 bg-card overflow-hidden rounded-lg border"
      style={{ borderLeftWidth: 3, borderLeftColor: tone }}
    >
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="hover:bg-secondary/40 w-full px-4 py-3 text-left transition-colors"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold">{incident.title}</span>
              <span
                className="rounded-sm px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
                style={{ color: tone, background: `color-mix(in oklab, ${tone} 14%, transparent)` }}
              >
                {incident.severity}
              </span>
              {incident.episodeCount > 1 && (
                <span className="bg-secondary text-muted-foreground rounded-sm px-1.5 py-0.5 text-[0.6rem] font-medium">
                  {incident.episodeCount} episodes
                </span>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{incident.description}</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <span className="text-muted-foreground tabular text-xs">{relative(incident.lastSeen)}</span>
            <span aria-hidden className="text-muted-foreground text-xs">
              {expanded ? "▴" : "▾"}
            </span>
          </div>
        </div>

        <dl className="text-muted-foreground mt-2.5 flex flex-wrap gap-x-6 gap-y-1 text-[0.7rem]">
          <Pair label="Breaching for" value={`${incident.durationMinutes}m`} />
          <Pair label="Across" value={`${incident.spanMinutes}m`} />
          <Pair label="Matching entries" value={fmtNum(incident.count)} />
          <Pair label="Rule window" value={`${incident.windowMinutes}m`} />
          <Pair label="Started" value={new Date(incident.firstSeen).toLocaleTimeString()} />
        </dl>
      </button>

      {expanded && (
        <div className="border-border/60 bg-secondary/25 space-y-5 border-t px-4 py-4">
          <Block title="What happened">
            <p className="text-sm leading-relaxed">{incident.summary}</p>
          </Block>

          {incident.causes.length > 0 && (
            <Block
              title="Why it probably happened"
              note="Ranked by supporting evidence. These are correlations found in the same window, not proven causes."
            >
              <ol className="space-y-2.5">
                {incident.causes.map((cause, i) => (
                  <li key={cause.id} className="border-border/60 bg-card rounded-md border px-3 py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className="text-muted-foreground tabular mt-0.5 text-xs">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-sm font-medium">{cause.claim}</p>
                          <span
                            className="rounded-sm px-1.5 py-0.5 text-[0.6rem] font-medium tracking-wide uppercase"
                            style={{
                              color:
                                cause.confidence === "high"
                                  ? "var(--sev-error)"
                                  : cause.confidence === "medium"
                                    ? "var(--sev-warning)"
                                    : "var(--muted-foreground)"
                            }}
                          >
                            {cause.confidence} confidence
                          </span>
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{cause.evidence}</p>
                        <a
                          href={buildHash(cause.link.page as never, { ...cause.link.params, scope })}
                          className="mt-1.5 inline-block text-xs underline"
                        >
                          Check this →
                        </a>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Block>
          )}

          {incident.remediation && (
            <Block title="What to do">
              <ol className="space-y-1.5">
                {incident.remediation.actions.map((step: string, i: number) => (
                  <li key={step} className="flex gap-2.5 text-sm">
                    <span className="text-muted-foreground tabular shrink-0">{i + 1}.</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
              {incident.remediation.verify && (
                <p className="text-muted-foreground mt-2.5 text-xs">
                  <span className="font-medium">Resolved when:</span> {incident.remediation.verify}
                </p>
              )}
            </Block>
          )}

          {incident.patterns.length > 0 && (
            <Block title="Repeating messages in this window">
              <ul className="space-y-1.5">
                {incident.patterns.slice(0, 3).map((p) => (
                  <li key={p.pattern} className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="truncate font-mono">{p.pattern}</span>
                    <span className="tabular text-muted-foreground shrink-0">
                      ×{fmtNum(p.count)} · {p.topService}
                    </span>
                  </li>
                ))}
              </ul>
            </Block>
          )}

          <Block title="Conditions at the time">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Requests" value={fmtNum(incident.correlation.requests)} />
              <Metric label="Error rate" value={fmtPct(incident.correlation.errorRate)} />
              <Metric label="p95" value={fmtMs(incident.correlation.p95)} />
              <Metric
                label="Peak CPU"
                value={incident.correlation.peakCpu ? `${incident.correlation.peakCpu.toFixed(0)}%` : "—"}
              />
            </div>
            {incident.correlation.affectedServices.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-muted-foreground text-xs">Services carrying the failures:</span>
                {incident.correlation.affectedServices.map((svc) => (
                  <a
                    key={svc}
                    href={buildHash("logs", { service: svc, scope })}
                    className="border-border/60 bg-card hover:bg-secondary rounded border px-1.5 py-0.5 font-mono text-[0.68rem] transition-colors"
                  >
                    {svc} →
                  </a>
                ))}
              </div>
            )}
          </Block>

          {incident.episodeCount > 1 && (
            <Block title={`All ${incident.episodeCount} episodes`}>
              <table className="w-full text-left text-xs">
                <thead className="text-muted-foreground">
                  <tr className="border-border/60 border-b">
                    <th className="py-1.5 font-medium">Started</th>
                    <th className="py-1.5 font-medium">Ended</th>
                    <th className="py-1.5 text-right font-medium">Duration</th>
                    <th className="py-1.5 text-right font-medium">Entries</th>
                    <th className="py-1.5 text-right font-medium">State</th>
                  </tr>
                </thead>
                <tbody>
                  {incident.episodes.map((e) => (
                    <tr key={e.firstSeen} className="border-border/30 border-b last:border-b-0">
                      <td className="tabular py-1.5">{new Date(e.firstSeen).toLocaleTimeString()}</td>
                      <td className="tabular py-1.5">{new Date(e.lastSeen).toLocaleTimeString()}</td>
                      <td className="tabular py-1.5 text-right">{e.durationMinutes}m</td>
                      <td className="tabular py-1.5 text-right">{fmtNum(e.count)}</td>
                      <td className="py-1.5 text-right" style={{ color: e.active ? tone : undefined }}>
                        {e.active ? "breaching" : "resolved"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Block>
          )}
        </div>
      )}
    </li>
  );
}

const Pair = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-1.5">
    <dt>{label}</dt>
    <dd className="text-foreground tabular">{value}</dd>
  </div>
);

function Block({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-muted-foreground mb-2 text-[0.65rem] font-semibold tracking-[0.08em] uppercase">{title}</p>
      {note && <p className="text-muted-foreground mb-2 text-xs">{note}</p>}
      {children}
    </div>
  );
}
