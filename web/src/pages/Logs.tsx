import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FreshnessNote, Legend, Panel, SectionHead, SeverityBadge, StatusPill } from "@/components/primitives";
import { SeverityStack } from "@/components/charts";
import { PageSkeleton } from "./Overview";
import { useApi, type LogEntry } from "@/lib/api";
import { buildHash } from "@/lib/nav";
import { SEVERITY_COLOR, fmtMs, fmtNum } from "@/lib/viz";

const ALL = "ALL";

export function Logs({ hours, params }: { hours: number; params: Record<string, string> }) {
  // Filters initialise from the URL, so a drill-down from Overview or Services
  // lands here already narrowed — §12 step 3.
  const [severity, setSeverity] = useState(params.severity ?? ALL);
  const [service, setService] = useState(params.service ?? ALL);
  const [event, setEvent] = useState(params.event ?? ALL);
  const [route, setRoute] = useState(params.route ?? ALL);
  const [statusClass, setStatusClass] = useState(params.statusClass ?? ALL);
  const [q, setQ] = useState(params.q ?? "");
  const [selected, setSelected] = useState<LogEntry | null>(null);

  // Re-sync when the hash changes beneath us (e.g. a second drill-down).
  useEffect(() => {
    setSeverity(params.severity ?? ALL);
    setService(params.service ?? ALL);
    setEvent(params.event ?? ALL);
    setRoute(params.route ?? ALL);
    setStatusClass(params.statusClass ?? ALL);
    setQ(params.q ?? "");
  }, [params.severity, params.service, params.event, params.route, params.statusClass, params.q]);

  const query = new URLSearchParams({ hours: String(hours), severity, service, event, route, statusClass, q });
  const { data, loading } = useApi<any>(`/api/logs?${query}`, [hours, severity, service, event, route, statusClass, q]);

  if (loading && !data) return <PageSkeleton />;
  if (!data) return null;

  const active = [
    severity !== ALL && { key: "severity", label: `severity: ${severity}`, clear: () => setSeverity(ALL) },
    service !== ALL && { key: "service", label: `service: ${service}`, clear: () => setService(ALL) },
    event !== ALL && { key: "event", label: `event: ${event}`, clear: () => setEvent(ALL) },
    route !== ALL && { key: "route", label: `route: ${route}`, clear: () => setRoute(ALL) },
    statusClass !== ALL && { key: "status", label: `status: ${statusClass}`, clear: () => setStatusClass(ALL) },
    q && { key: "q", label: `search: ${q}`, clear: () => setQ("") }
  ].filter(Boolean) as { key: string; label: string; clear: () => void }[];

  const clearAll = () => {
    setSeverity(ALL);
    setService(ALL);
    setEvent(ALL);
    setRoute(ALL);
    setStatusClass(ALL);
    setQ("");
    location.hash = buildHash("logs");
  };

  const dropdowns = [
    { value: severity, set: setSeverity, options: data.facets.severities, placeholder: "Severity", width: "w-[140px]" },
    { value: service, set: setService, options: data.facets.services, placeholder: "Service", width: "w-[160px]" },
    { value: statusClass, set: setStatusClass, options: data.facets.statusClasses, placeholder: "Status", width: "w-[130px]" },
    { value: route, set: setRoute, options: data.facets.routes, placeholder: "Route", width: "w-[190px]" },
    { value: event, set: setEvent, options: data.facets.events, placeholder: "Event", width: "w-[200px]" }
  ];

  return (
    <div className="space-y-5">
      {/* Filters in one row above the charts, per the interaction spec. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search event, message, route or request id…"
            className="bg-card border-border/60 h-9 max-w-xs"
          />
          {dropdowns.map((d) => (
            <Select key={d.placeholder} value={d.value} onValueChange={(v) => d.set(v ?? ALL)}>
              <SelectTrigger className={`bg-card border-border/60 h-9 ${d.width}`}>
                <SelectValue placeholder={d.placeholder} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All {d.placeholder.toLowerCase()}s</SelectItem>
                {d.options.map((o: string) => (
                  <SelectItem key={o} value={o}>
                    {o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ))}
          <span className="text-muted-foreground tabular ml-auto text-xs">
            {fmtNum(data.total)} matching · showing {fmtNum(data.shown)}
          </span>
        </div>

        {active.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {active.map((filter) => (
              <button
                key={filter.key}
                onClick={filter.clear}
                className="border-border/60 bg-secondary/60 hover:bg-secondary flex items-center gap-1.5 rounded-md border px-2 py-0.5 font-mono text-[0.7rem] transition-colors"
              >
                {filter.label}
                <span aria-hidden className="text-muted-foreground">×</span>
              </button>
            ))}
            <button onClick={clearAll} className="text-muted-foreground hover:text-foreground text-xs underline">
              Clear all
            </button>
          </div>
        )}

        <FreshnessNote freshness={data.freshness} />
      </div>

      <Panel>
        <SectionHead
          title="Matching volume"
          hint="These filters apply to the chart and the table below"
          right={
            <Legend
              items={(["INFO", "WARNING", "ERROR"] as const).map((s) => ({ label: s, color: SEVERITY_COLOR[s] }))}
            />
          }
        />
        <SeverityStack data={data.timeline} height={150} />
      </Panel>

      <Panel className="py-0">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border/60 text-muted-foreground border-b text-[0.68rem] tracking-[0.08em] uppercase">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="py-3 font-medium">Severity</th>
                <th className="py-3 font-medium">Event</th>
                <th className="py-3 font-medium">Service</th>
                <th className="py-3 font-medium">Route</th>
                <th className="py-3 text-right font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Latency</th>
              </tr>
            </thead>
            <tbody>
              {data.entries.map((entry: LogEntry) => (
                <tr
                  key={entry.requestId + entry.timestamp}
                  onClick={() => setSelected(entry)}
                  className="border-border/40 hover:bg-secondary/50 cursor-pointer border-b transition-colors"
                >
                  <td className="tabular text-muted-foreground px-5 py-2.5 whitespace-nowrap">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-2.5">
                    <SeverityBadge severity={entry.severity} />
                  </td>
                  <td className="py-2.5 font-mono text-xs">{entry.event}</td>
                  <td className="text-muted-foreground py-2.5 text-xs">{entry.component}</td>
                  <td className="text-muted-foreground py-2.5 font-mono text-xs">{entry.route}</td>
                  <td className="py-2.5 text-right">
                    <StatusPill code={entry.statusCode} />
                  </td>
                  <td
                    className="tabular px-5 py-2.5 text-right text-xs"
                    style={{ color: entry.responseTimeMs > 500 ? "var(--sev-warning)" : undefined }}
                  >
                    {fmtMs(entry.responseTimeMs)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.entries.length === 0 && (
            <p className="text-muted-foreground py-12 text-center text-sm">No entries match these filters.</p>
          )}
        </div>
      </Panel>

      {selected && <LogDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Raw log access preserved alongside the summaries, per §10.1. */
function LogDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-4 sm:items-center" onClick={onClose}>
      <div
        className="bg-popover border-border/70 max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-lg border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-popover border-border/60 sticky top-0 flex items-center justify-between border-b px-5 py-3">
          <div className="flex items-center gap-3">
            <SeverityBadge severity={entry.severity} />
            <span className="font-mono text-sm">{entry.event}</span>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-sm">
            Close
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-sm">{entry.message}</p>

          <div className="flex flex-wrap gap-2">
            <a
              href={buildHash("logs", { requestId: entry.requestId })}
              className="border-border/60 hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              Trace this request →
            </a>
            <a
              href={buildHash("logs", { service: entry.component })}
              className="border-border/60 hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              All {entry.component} logs →
            </a>
            <a
              href={buildHash("logs", { event: entry.event })}
              className="border-border/60 hover:bg-secondary rounded-md border px-2.5 py-1 text-xs transition-colors"
            >
              All {entry.event} →
            </a>
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
            {[
              ["Timestamp", new Date(entry.timestamp).toISOString()],
              ["Request ID", entry.requestId],
              ["Service", entry.component],
              ["Route", entry.route],
              ["Status", String(entry.statusCode)],
              ["Latency", fmtMs(entry.responseTimeMs)],
              ["Entry point", entry.entryPoint],
              ["Environment", entry.environment]
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted-foreground tracking-wide uppercase">{label}</dt>
                <dd className="mt-0.5 font-mono break-all">{value}</dd>
              </div>
            ))}
          </dl>

          <div>
            <p className="text-muted-foreground mb-1.5 text-[0.68rem] tracking-[0.08em] uppercase">
              Raw jsonPayload
            </p>
            <pre className="bg-background border-border/60 overflow-x-auto rounded border p-3 font-mono text-[0.7rem] leading-relaxed">
              {JSON.stringify(entry, null, 2)}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
