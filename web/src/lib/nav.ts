import { useCallback, useEffect, useState } from "react";

/**
 * Hash routing with carried filter state.
 *
 * Drill-down is the whole point of §12's journey: see a spike, click into the
 * affected service, land on the logs already filtered to it. That means the
 * destination needs the context, so state lives in the URL rather than in a
 * component — which also makes any view linkable and shareable.
 */

export type PageId =
  | "overview"
  | "services"
  | "logs"
  | "performance"
  | "resources"
  | "alerts" /* legacy hash, still routes */
  | "incidents"
  | "insights"
  | "cost"
  | "connections";

export interface Route {
  page: PageId;
  params: Record<string, string>;
}

function parse(): Route {
  const raw = location.hash.slice(1) || "overview";
  const [page, query = ""] = raw.split("?");
  return {
    page: (page || "overview") as PageId,
    params: Object.fromEntries(new URLSearchParams(query))
  };
}

export function buildHash(page: PageId, params: Record<string, string> = {}) {
  const clean = Object.entries(params).filter(([, v]) => v && v !== "ALL");
  const query = new URLSearchParams(clean as [string, string][]).toString();
  return `#${page}${query ? `?${query}` : ""}`;
}

export function useRoute() {
  const [route, setRoute] = useState<Route>(parse);

  useEffect(() => {
    const onHash = () => setRoute(parse());
    addEventListener("hashchange", onHash);
    return () => removeEventListener("hashchange", onHash);
  }, []);

  const go = useCallback((page: PageId, params: Record<string, string> = {}) => {
    location.hash = buildHash(page, params);
  }, []);

  return { ...route, go };
}

/**
 * One flat list, ordered by how often a page is opened. An earlier version
 * grouped these under headings; the headings cost a row of chrome and told the
 * reader nothing the page names did not already say.
 */
export const NAV: { id: PageId; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Health, errors and open incidents at a glance" },
  { id: "incidents", label: "Incidents", hint: "Thresholds crossed, grouped by cause, with the fix" },
  { id: "insights", label: "Insights", hint: "Repeating log patterns and statistical anomalies" },
  { id: "services", label: "Services", hint: "Health broken down per workload" },
  { id: "logs", label: "Logs", hint: "Search and filter every log entry" },
  { id: "performance", label: "Performance", hint: "Latency percentiles, routes and throughput" },
  { id: "resources", label: "Resources", hint: "CPU, memory, instances and connections" },
  { id: "cost", label: "Cost", hint: "Spend by service, trends, and where to save" },
  { id: "connections", label: "Setup", hint: "The cloud project feeding this dashboard" }
];

/**
 * Time windows. `query` is passed straight to the API.
 *
 * `refreshMs` is per-window on purpose: a 1-minute view is useless unless it
 * actually moves, while a 24-hour view re-polling every 5s is pure waste.
 */
export const WINDOWS = [
  { id: "1m", label: "1m", query: "minutes=1", refreshMs: 5_000, title: "Last 1 minute, refreshed every 5s" },
  { id: "5m", label: "5m", query: "minutes=5", refreshMs: 10_000, title: "Last 5 minutes, refreshed every 10s" },
  { id: "15m", label: "15m", query: "minutes=15", refreshMs: 20_000, title: "Last 15 minutes" },
  { id: "1h", label: "1h", query: "hours=1", refreshMs: 30_000, title: "Last hour" },
  { id: "6h", label: "6h", query: "hours=6", refreshMs: 60_000, title: "Last 6 hours" },
  { id: "24h", label: "24h", query: "hours=24", refreshMs: 120_000, title: "Last 24 hours" }
];

export const DEFAULT_WINDOW = WINDOWS[4];
