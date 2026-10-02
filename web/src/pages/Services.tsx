import { FreshnessNote, GradeBadge, Panel, StatTile } from "@/components/primitives";
import { PageSkeleton } from "./Overview";
import { useApi } from "@/lib/api";
import { buildHash } from "@/lib/nav";
import { SERIES, fmtMs, fmtNum, fmtPct } from "@/lib/viz";

/**
 * §11 "errors by service" and §10.2 "most frequent error types/services".
 * Each row is a drill-down target into that service's logs — step 3 of the
 * §12 journey.
 */
export function Services({ hours }: { hours: number }) {
  const { data, loading } = useApi<any>(`/api/services?hours=${hours}`, [hours]);
  if (loading || !data) return <PageSkeleton />;

  const { services, freshness } = data;
  const totals = services.reduce(
    (acc: any, s: any) => ({
      requests: acc.requests + s.requests,
      errors: acc.errors + s.errors,
      warnings: acc.warnings + s.warnings
    }),
    { requests: 0, errors: 0, warnings: 0 }
  );
  const unhealthy = services.filter((s: any) => s.grade !== "healthy");

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Services" value={String(services.length)} caption="Emitting telemetry in this window" />
        <StatTile
          label="Needing attention"
          value={String(unhealthy.length)}
          tone={unhealthy.length ? "warning" : "good"}
          caption={unhealthy.length ? unhealthy.map((s: any) => s.name).join(", ") : "All healthy"}
        />
        <StatTile label="Total requests" value={fmtNum(totals.requests)} to="logs" />
        <StatTile
          label="Total errors"
          value={fmtNum(totals.errors)}
          tone={totals.errors ? "critical" : "good"}
          to="logs"
          params={{ severity: "ERROR" }}
        />
      </div>

      <FreshnessNote freshness={freshness} />

      {services.map((service: any, index: number) => (
        <Panel key={service.name}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="size-2.5 rounded-full"
                style={{ background: SERIES[index % SERIES.length] }}
              />
              <div>
                <h3 className="font-mono text-sm font-medium">{service.name}</h3>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  {service.routes.length} route{service.routes.length === 1 ? "" : "s"} ·{" "}
                  {service.requestsPerMinute}/min
                </p>
              </div>
              <GradeBadge grade={service.grade} />
            </div>

            <div className="flex flex-wrap gap-2">
              <a
                href={buildHash("logs", { service: service.name })}
                className="border-border/60 hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
              >
                View logs →
              </a>
              {service.errors > 0 && (
                <a
                  href={buildHash("logs", { service: service.name, severity: "ERROR" })}
                  className="border-border/60 hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
                  style={{ color: "var(--sev-error)" }}
                >
                  View errors →
                </a>
              )}
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4 lg:grid-cols-7">
            {[
              { label: "Requests", value: fmtNum(service.requests) },
              { label: "Error rate", value: fmtPct(service.errorRate), tone: service.errorRate > 0.02 ? "var(--sev-error)" : undefined },
              { label: "Availability", value: fmtPct(service.availability, 2), tone: service.availability < 0.99 ? "var(--sev-error)" : undefined },
              { label: "Apdex", value: service.apdex.toFixed(2), tone: service.apdex < 0.8 ? "var(--sev-warning)" : undefined },
              { label: "p50", value: fmtMs(service.p50) },
              { label: "p95", value: fmtMs(service.p95), tone: service.p95 > 500 ? "var(--sev-warning)" : undefined },
              { label: "p99", value: fmtMs(service.p99) }
            ].map((metric) => (
              <div key={metric.label}>
                <p className="text-muted-foreground text-[0.65rem] tracking-[0.08em] uppercase">{metric.label}</p>
                <p className="tabular mt-1 text-sm font-semibold" style={{ color: metric.tone }}>
                  {metric.value}
                </p>
              </div>
            ))}
          </div>

          <div className="border-border/60 mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 border-t pt-3 text-xs">
            <span className="text-muted-foreground">
              5xx <span className="text-foreground tabular font-medium">{fmtNum(service.serverErrors)}</span>
            </span>
            <span className="text-muted-foreground">
              4xx <span className="text-foreground tabular font-medium">{fmtNum(service.clientErrors)}</span>
            </span>
            <span className="text-muted-foreground">
              Warnings <span className="text-foreground tabular font-medium">{fmtNum(service.warnings)}</span>
            </span>
            {service.topFailure && (
              <a
                href={buildHash("logs", { service: service.name, event: service.topFailure })}
                className="text-muted-foreground hover:text-foreground ml-auto font-mono transition-colors"
              >
                top failure: {service.topFailure} ×{service.topFailureCount} →
              </a>
            )}
          </div>

          {service.routes.length > 0 && (
            <div className="mt-3">
              <p className="text-muted-foreground mb-1.5 text-[0.65rem] tracking-[0.08em] uppercase">Routes</p>
              <div className="flex flex-wrap gap-1.5">
                {service.routes.map((route: string) => (
                  <a
                    key={route}
                    href={buildHash("logs", { service: service.name, route })}
                    className="border-border/60 bg-secondary/40 hover:bg-secondary rounded px-1.5 py-0.5 font-mono text-[0.68rem] transition-colors"
                  >
                    {route}
                  </a>
                ))}
              </div>
            </div>
          )}
        </Panel>
      ))}
    </div>
  );
}
