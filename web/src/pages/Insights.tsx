import { FreshnessNote, Panel, SectionHead, SeverityBadge, StatTile } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import type { InsightsResponse, LogPattern } from "@/lib/contracts";
import { buildHash } from "@/lib/nav";
import { fmtMs, fmtNum, fmtPct, relative } from "@/lib/viz";

/**
 * Insights — the two analyses that find things no threshold was written for.
 *
 * Pattern detection answers "what keeps happening"; anomaly detection answers
 * "what is unusual right now". Both run on the telemetry deterministically,
 * and both show the evidence, because a finding a reader cannot check is a
 * guess with better typography.
 */
export function Insights({ window: win, scope, refreshMs }: { window: string; scope: string; refreshMs: number }) {
  const { data, loading } = useApi<InsightsResponse>(`/api/insights?${win}&scope=${scope}`, [win, scope], refreshMs);
  if (loading || !data) return <PageSkeleton />;

  const dominant = data.patterns[0];

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Distinct patterns"
          value={String(data.patterns.length)}
          caption="Failure messages grouped by template"
        />
        <StatTile
          label="Most frequent"
          value={dominant ? fmtNum(dominant.count) : "0"}
          tone={dominant && dominant.severity === "ERROR" ? "critical" : undefined}
          caption={dominant ? `${dominant.topService} · ${dominant.pattern.slice(0, 40)}` : "Nothing repeating"}
        />
        <StatTile
          label="Anomalies"
          value={String(data.anomalies.length)}
          tone={data.anomalies.length > 0 ? "warning" : "good"}
          caption="Buckets far outside this window's own normal"
        />
        <StatTile
          label="Analysis"
          value="Deterministic"
          caption="Same window, same findings, every time"
        />
      </div>

      <FreshnessNote freshness={data.freshness} />

      <Panel>
        <SectionHead
          title="Anomaly detection"
          hint="Modified z-score against this window's median — a single spike cannot hide itself the way it can in a mean"
        />
        {data.anomalies.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">
            Nothing in this window sits far enough outside its own normal to flag.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.anomalies.map((a) => (
              <li
                key={`${a.metric}-${a.t}`}
                className="border-border/60 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border px-3.5 py-2.5"
                style={{ borderLeftWidth: 3, borderLeftColor: Math.abs(a.z) > 6 ? "var(--sev-error)" : "var(--sev-warning)" }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{a.description}</p>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {new Date(a.t).toLocaleTimeString()} · {relative(a.t)}
                    {a.buckets > 1 && ` · ${a.buckets} consecutive buckets`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="tabular text-sm font-semibold">{Math.abs(a.z).toFixed(1)}σ</p>
                  <p className="text-muted-foreground text-[0.65rem]">deviation</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel className="py-0">
        <div className="px-5 pt-5">
          <SectionHead
            title="Log pattern detection"
            hint="Messages collapsed to their template, so one failure seen 300 times is one row, not 300"
          />
        </div>
        <PatternTable patterns={data.patterns} scope={scope} />
      </Panel>

      <Panel className="py-0">
        <div className="px-5 pt-5">
          <SectionHead
            title="All traffic patterns"
            hint="Including routine traffic — useful for spotting what normal actually looks like"
          />
        </div>
        <PatternTable patterns={data.allPatterns} scope={scope} />
      </Panel>
    </div>
  );
}

function PatternTable({ patterns, scope }: { patterns: LogPattern[]; scope: string }) {
  if (patterns.length === 0) {
    return <p className="text-muted-foreground px-5 py-10 text-center text-sm">No repeating patterns in this window.</p>;
  }
  const max = Math.max(...patterns.map((p) => p.count), 1);

  return (
    <div className="-mx-0 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-border/60 text-muted-foreground border-b text-[0.68rem] tracking-[0.08em] uppercase">
            <th className="px-5 py-2.5 font-medium">Pattern</th>
            <th className="py-2.5 font-medium">Severity</th>
            <th className="py-2.5 font-medium">Service</th>
            <th className="py-2.5 text-right font-medium">Count</th>
            <th className="py-2.5 pl-4 font-medium">Share</th>
            <th className="py-2.5 text-right font-medium">Median</th>
            <th className="px-5 py-2.5 text-right font-medium">Last seen</th>
          </tr>
        </thead>
        <tbody>
          {patterns.map((p) => (
            <tr
              key={p.pattern}
              onClick={() => (location.hash = buildHash("logs", { service: p.topService ?? "", scope }))}
              className="border-border/40 hover:bg-secondary/40 cursor-pointer border-b transition-colors last:border-b-0"
            >
              <td className="max-w-[26rem] px-5 py-2.5">
                <p className="truncate font-mono text-xs" title={p.pattern}>
                  {p.pattern}
                </p>
                {p.topRoute && <p className="text-muted-foreground mt-0.5 font-mono text-[0.65rem]">{p.topRoute}</p>}
              </td>
              <td className="py-2.5">
                <SeverityBadge severity={p.severity} />
              </td>
              <td className="py-2.5 font-mono text-xs">
                {p.topService}
                {p.concentration < 0.9 && (
                  <span className="text-muted-foreground"> +{p.services.length - 1}</span>
                )}
              </td>
              <td className="tabular py-2.5 text-right font-medium">{fmtNum(p.count)}</td>
              <td className="w-28 py-2.5 pl-4">
                {/* Direct label plus the bar — the bar alone is not readable at
                    these widths, and the light palette's contrast WARN makes a
                    visible value mandatory. */}
                <div className="flex items-center gap-2">
                  <div className="bg-secondary h-1.5 flex-1 overflow-hidden rounded-full">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(3, (p.count / max) * 100)}%`,
                        background: p.severity === "ERROR" ? "var(--sev-error)" : "var(--chart-1)"
                      }}
                    />
                  </div>
                  <span className="tabular text-muted-foreground shrink-0 text-[0.68rem]">{fmtPct(p.share)}</span>
                </div>
              </td>
              <td className="tabular text-muted-foreground py-2.5 text-right text-xs">{fmtMs(p.medianLatency)}</td>
              <td className="tabular text-muted-foreground px-5 py-2.5 text-right text-xs">{relative(p.lastSeen)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
