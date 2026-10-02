import { Panel, StatTile } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import { fmtUsd } from "@/lib/viz";

/**
 * §11 lists Recommendations as its own dashboard area rather than a cost
 * sub-panel. §15 requires each one to carry its evidence and estimated impact,
 * and §10.6 requires that none of them act on their own.
 */
export function Recommendations({ scope }: { scope: string }) {
  const { data, loading } = useApi<any>(`/api/recommendations?scope=${scope}`, [scope]);
  if (loading || !data) return <PageSkeleton />;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Open recommendations" value={String(data.recommendations.length)} />
        <StatTile
          label="Estimated saving"
          value={fmtUsd(data.totalEstimatedSaving)}
          tone="good"
          caption="If every suggestion is adopted"
        />
        <StatTile
          label="Acting automatically"
          value="None"
          caption="Advisory only — you remain the decision-maker"
        />
      </div>

      <div
        className="flex items-start gap-3 rounded-md border px-4 py-3 text-xs"
        style={{
          borderColor: "color-mix(in oklab, var(--sev-warning) 35%, transparent)",
          background: "color-mix(in oklab, var(--sev-warning) 8%, transparent)"
        }}
      >
        <span aria-hidden style={{ color: "var(--sev-warning)" }}>
          &#9888;
        </span>
        <p className="text-muted-foreground">
          <span className="text-foreground font-medium">Cost inputs are sample data.</span> The rules, evidence and
          reasoning are real; the dollar figures become real when the Cloud Billing export is enabled.
        </p>
      </div>

      <ul className="space-y-3">
        {data.recommendations.map((rec: any) => (
          <li key={rec.id}>
            <Panel>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{rec.title}</p>
                  <p className="text-muted-foreground mt-1 text-xs">{rec.reason}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-base font-semibold" style={{ color: "var(--status-good)" }}>
                    ~{fmtUsd(rec.impact)}
                  </p>
                  <p className="text-muted-foreground text-[0.65rem] tracking-wide uppercase">
                    est. saving &middot; {rec.confidence} confidence
                  </p>
                </div>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-muted-foreground mb-1.5 text-[0.65rem] tracking-[0.08em] uppercase">Evidence</p>
                  <ul className="space-y-1">
                    {rec.evidence.map((line: string) => (
                      <li key={line} className="text-muted-foreground font-mono text-[0.7rem]">
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <p className="text-muted-foreground mb-1.5 text-[0.65rem] tracking-[0.08em] uppercase">
                    Suggested action
                  </p>
                  <p className="text-xs">{rec.action}</p>
                </div>
              </div>
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
