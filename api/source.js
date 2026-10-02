/**
 * The telemetry source seam.
 *
 * server.js imports ONLY this module — never a concrete source. Swapping the
 * sample generator for live Cloud Logging is a change here and nowhere else.
 *
 * Previously server.js imported data.js directly, which quietly welded the
 * sample generator into the production path. This is that seam, made real.
 */

import { logEntries as sampleLogs, resourceSeries as sampleResources } from "./data.js";
import { costRows as sampleCost } from "./cost-data.js";

const MODE = process.env.VANTAGE_SOURCE ?? "sample";

/**
 * Short-lived memo.
 *
 * The aggregations re-scan every record on every request. At ~15k records and
 * several panels per page that is the dominant cost, and the inputs only change
 * when the window moves. A 2s TTL keeps a fast poll cheap while staying well
 * inside "near real-time".
 */
const cache = new Map();
const TTL_MS = 2000;

export function memo(key, compute) {
  const hit = cache.get(key);
  const now = Date.now();
  if (hit && now - hit.at < TTL_MS) return hit.value;

  const value = compute();
  cache.set(key, { value, at: now });

  // Bounded so a long-running process cannot grow this without limit.
  if (cache.size > 200) {
    for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
  }
  return value;
}

const SOURCES = {
  sample: {
    id: "sample",
    label: "Sample telemetry",
    logs: sampleLogs,
    resources: sampleResources,
    cost: sampleCost,
    live: false
  }
  // gcp: { id: "gcp", label: "Cloud Logging", logs: fetchFromCloudLogging, ... }
};

const active = SOURCES[MODE] ?? SOURCES.sample;

export const sourceInfo = () => ({ id: active.id, label: active.label, live: active.live });

export const logEntries = () => active.logs();
export const resourceSeries = (connectionId) => active.resources(connectionId);
export const costRows = () => active.cost();
