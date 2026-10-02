import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Legend, Panel, SectionHead, SeverityBadge, StatusPill } from "@/components/primitives";
import { SeverityStack } from "@/components/charts";
import { PageSkeleton } from "./Overview";
import { useApi, type LogEntry } from "@/lib/api";
import { SEVERITY_COLOR, fmtMs, fmtNum } from "@/lib/viz";

export function Logs({ hours }: { hours: number }) {
  const [severity, setSeverity] = useState("ALL");
  const [component, setComponent] = useState("ALL");
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<LogEntry | null>(null);

  const query = new URLSearchParams({ hours: String(hours), severity, component, q });
  const { data, loading } = useApi<any>(`/api/logs?${query}`, [hours, severity, component, q]);

  if (loading && !data) return <PageSkeleton />;
  if (!data) return null;

  return (
    <div className="space-y-5">
      {/* Filters sit in one row above the charts, per the interaction spec. */}
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search event, message, route or request id…"
          className="bg-card border-border/60 h-9 max-w-xs"
        />
        <Select value={severity} onValueChange={(v) => setSeverity(v ?? "ALL")}>
          <SelectTrigger className="bg-card border-border/60 h-9 w-[150px]">
            <SelectValue placeholder="Severity" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All severities</SelectItem>
            {data.facets.severities.map((s: string) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={component} onValueChange={(v) => setComponent(v ?? "ALL")}>
          <SelectTrigger className="bg-card border-border/60 h-9 w-[170px]">
            <SelectValue placeholder="Component" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All components</SelectItem>
            {data.facets.components.map((c: string) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <span className="text-muted-foreground tabular ml-auto text-xs">
          {fmtNum(data.total)} matching {data.total === 1 ? "entry" : "entries"}
        </span>
      </div>

      <Panel>
        <SectionHead
          title="Matching volume"
          hint="The filter above applies to this chart and the table below"
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
        <SeverityStack data={data.timeline} height={160} />
      </Panel>

      <Panel className="py-0">
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-border/60 text-muted-foreground border-b text-[0.68rem] tracking-[0.08em] uppercase">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="py-3 font-medium">Severity</th>
                <th className="py-3 font-medium">Event</th>
                <th className="py-3 font-medium">Component</th>
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
                  <td className="tabular px-5 py-2.5 text-right text-xs">{fmtMs(entry.responseTimeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.entries.length === 0 && (
            <p className="text-muted-foreground py-12 text-center text-sm">
              No entries match these filters.
            </p>
          )}
        </div>
      </Panel>

      {selected && <LogDetail entry={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

/** Raw log access is preserved alongside the summaries, per §10.1. */
function LogDetail({ entry, onClose }: { entry: LogEntry; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="bg-popover border-border/70 w-full max-w-2xl rounded-lg border shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-border/60 flex items-center justify-between border-b px-5 py-3">
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
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs sm:grid-cols-3">
            {[
              ["Timestamp", new Date(entry.timestamp).toISOString()],
              ["Request ID", entry.requestId],
              ["Component", entry.component],
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
