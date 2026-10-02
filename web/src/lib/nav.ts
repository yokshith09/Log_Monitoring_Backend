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
  | "cost"
  | "recommendations"
  | "alerts";

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

export const NAV: { id: PageId; label: string; hint: string }[] = [
  { id: "overview", label: "Overview", hint: "Health, errors, alerts at a glance" },
  { id: "services", label: "Services", hint: "Per-service health and failures" },
  { id: "logs", label: "Logs", hint: "Search and filter every entry" },
  { id: "performance", label: "Performance", hint: "Latency and throughput" },
  { id: "resources", label: "Resources", hint: "CPU, memory, connections" },
  { id: "cost", label: "Cost", hint: "Spend and anomalies" },
  { id: "recommendations", label: "Recommendations", hint: "Advisory optimisations" },
  { id: "alerts", label: "Alerts", hint: "Threshold breaches and fixes" }
];

export const RANGES = [
  { hours: 1, label: "1h" },
  { hours: 6, label: "6h" },
  { hours: 24, label: "24h" }
];
