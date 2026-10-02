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
  | "alerts"
  | "cost"
  | "recommendations"
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
 * Navigation is grouped by the question each page answers, rather than being a
 * flat list of nine items. Operate = what is happening now; Optimise = what it
 * costs and what to change; Setup = what is connected.
 */
export const NAV_GROUPS: { group: string; items: { id: PageId; label: string; hint: string }[] }[] = [
  {
    group: "Operate",
    items: [
      { id: "overview", label: "Overview", hint: "Health, errors and alerts at a glance" },
      { id: "services", label: "Services", hint: "Health broken down per workload" },
      { id: "logs", label: "Logs", hint: "Search and filter every log entry" },
      { id: "performance", label: "Performance", hint: "Latency percentiles and throughput" },
      { id: "resources", label: "Resources", hint: "CPU, memory, instances and connections" },
      { id: "alerts", label: "Alerts", hint: "Thresholds crossed, with suggested fixes" }
    ]
  },
  {
    group: "Optimise",
    items: [
      { id: "cost", label: "Cost", hint: "Spend by service and account, and anomalies" },
      { id: "recommendations", label: "Recommendations", hint: "Advisory savings with evidence" }
    ]
  },
  {
    group: "Setup",
    items: [{ id: "connections", label: "Connections", hint: "Cloud accounts feeding this dashboard" }]
  }
];

export const NAV = NAV_GROUPS.flatMap((g) => g.items);

export const RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" }
];
