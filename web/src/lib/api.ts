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

/** Small fetch hook — refetches whenever the query string changes. */
export function useApi<T>(path: string, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    get<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setError(null);
        }
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading };
}
