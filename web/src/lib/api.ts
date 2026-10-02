import { useEffect, useState } from "react";

export type Severity = "INFO" | "WARNING" | "ERROR";

export interface LogEntry {
  timestamp: string;
  severity: Severity;
  event: string;
  component: string;
  entryPoint: string;
  requestId: string;
  route: string;
  statusCode: number;
  responseTimeMs: number;
  environment: string;
  message: string;
}

export interface Alert {
  ruleId: string;
  title: string;
  severity: "critical" | "serious" | "warning";
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  peak: number;
  count: number;
  event?: string;
  description: string;
  active: boolean;
  windowMinutes: number;
  filter: Record<string, string | number>;
}

async function get<T>(path: string): Promise<T> {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
}

/**
 * Fetch hook with optional polling.
 *
 * Previous data is kept while a refetch is in flight, so a poll does not flash
 * the page back to skeletons — the single worst thing a live dashboard can do.
 * `loading` is therefore true only on the very first load.
 */
export function useApi<T>(path: string, deps: unknown[] = [], refreshMs = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const load = (isPoll: boolean) => {
      if (isPoll) setRefreshing(true);
      get<T>(path)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setError(null);
        })
        .catch((err) => !cancelled && setError(err.message))
        .finally(() => {
          if (cancelled) return;
          setLoading(false);
          setRefreshing(false);
        });
    };

    load(false);

    if (refreshMs > 0) {
      const id = setInterval(() => load(true), refreshMs);
      return () => {
        cancelled = true;
        clearInterval(id);
      };
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, refreshMs]);

  return { data, error, loading, refreshing };
}
