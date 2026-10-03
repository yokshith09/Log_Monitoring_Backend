/**
 * The analysis layer — §10.6.
 *
 * Five jobs the brief names: incident summarization, root-cause analysis, log
 * pattern detection, anomaly detection, and actionable remediation.
 *
 * All five run deterministically on the telemetry, with no model in the loop.
 * That is the point: an on-call engineer needs the same answer twice, and a
 * rule that fires can be shown the evidence that fired it. `narrate()` is the
 * seam where a language model can rewrite the findings in prose when a key is
 * configured — it changes the WORDS, never the FINDINGS, so nothing here
 * depends on a model being available.
 *
 * Everything returns evidence alongside its conclusion. A conclusion a reader
 * cannot check is a guess with better typography.
 */

import { tsOf } from "./analytics.js";

/* ------------------------------------------------------- pattern detection */

/**
 * Collapses a log message to its template by masking the parts that vary.
 *
 * `order 8d3f-21 failed after 1423ms` and `order 9a1c-07 failed after 88ms`
 * are one pattern seen twice, not two events seen once. Without this the
 * "most frequent error" list is just a list of distinct ids.
 */
export function templateOf(message) {
  return String(message ?? "")
    .replace(/\b[0-9a-f]{8}-[0-9a-f-]{4,}\b/gi, "<id>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hash>")
    .replace(/\b\d+(\.\d+)?(ms|s|kb|mb|gb|%)\b/gi, "<measure>")
    .replace(/\b\d[\d,._]*\b/g, "<n>")
    .replace(/'[^']*'|"[^"]*"/g, "<str>")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Groups entries into message patterns, most frequent first.
 *
 * `minShare` filters out the long tail: a pattern seen once in ten thousand
 * records is noise, and listing it dilutes the ones that matter.
 */
export function logPatterns(entries, { limit = 10, severities = ["WARNING", "ERROR"], minCount = 2 } = {}) {
  const groups = new Map();

  for (const entry of entries) {
    if (severities && !severities.includes(entry.severity)) continue;
    const template = templateOf(entry.message);
    if (!template) continue;

    let group = groups.get(template);
    if (!group) {
      group = {
        pattern: template,
        count: 0,
        services: new Map(),
        routes: new Map(),
        statusCodes: new Map(),
        severities: { INFO: 0, WARNING: 0, ERROR: 0 },
        firstSeen: Infinity,
        lastSeen: -Infinity,
        example: entry.message,
        exampleRequestId: entry.requestId,
        latencies: []
      };
      groups.set(template, group);
    }

    const at = tsOf(entry);
    group.count += 1;
    group.severities[entry.severity] = (group.severities[entry.severity] ?? 0) + 1;
    group.services.set(entry.component, (group.services.get(entry.component) ?? 0) + 1);
    group.routes.set(entry.route, (group.routes.get(entry.route) ?? 0) + 1);
    group.statusCodes.set(entry.statusCode, (group.statusCodes.get(entry.statusCode) ?? 0) + 1);
    group.firstSeen = Math.min(group.firstSeen, at);
    group.lastSeen = Math.max(group.lastSeen, at);
    if (Number.isFinite(entry.responseTimeMs)) group.latencies.push(entry.responseTimeMs);
  }

  const total = entries.length || 1;

  return [...groups.values()]
    .filter((g) => g.count >= minCount)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((g) => ({
      pattern: g.pattern,
      count: g.count,
      share: g.count / total,
      severity: g.severities.ERROR > 0 ? "ERROR" : g.severities.WARNING > 0 ? "WARNING" : "INFO",
      topService: top(g.services),
      topRoute: top(g.routes),
      topStatus: Number(top(g.statusCodes)),
      // How concentrated the pattern is. 1.0 means one service owns all of it,
      // which is a very different investigation from a pattern spread evenly.
      concentration: g.count === 0 ? 0 : (g.services.get(top(g.services)) ?? 0) / g.count,
      services: [...g.services.keys()],
      firstSeen: g.firstSeen,
      lastSeen: g.lastSeen,
      medianLatency: median(g.latencies),
      example: g.example,
      exampleRequestId: g.exampleRequestId
    }));
}

const top = (map) => [...map.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/* -------------------------------------------------------- anomaly detection */

/**
 * Flags buckets that deviate from the series' own normal, using median and MAD
 * rather than mean and standard deviation.
 *
 * This matters: a single 10x spike drags a mean upward far enough to hide
 * itself, so a mean-based detector systematically misses exactly the event it
 * exists to catch. The median does not move.
 *
 * `threshold` is in modified z-scores; 3.5 is the conventional cut.
 */
export function anomalies(series, key, { threshold = 3.5, minValue = 0 } = {}) {
  const values = series.map((p) => p[key] ?? 0);
  if (values.length < 8) return [];

  const med = median(values);
  const deviations = values.map((v) => Math.abs(v - med));
  const mad = median(deviations);

  // All-identical series: MAD is 0 and every z-score is Infinity. Fall back to
  // the mean absolute deviation, and give up if that is zero too.
  const scale = mad > 0 ? mad * 1.4826 : mean(deviations) * 1.2533;
  if (!(scale > 0)) return [];

  const out = [];
  for (let i = 0; i < series.length; i += 1) {
    const value = values[i];
    if (value < minValue) continue;
    const z = (value - med) / scale;
    if (Math.abs(z) < threshold) continue;
    out.push({
      t: series[i].t,
      metric: key,
      value,
      baseline: med,
      z: Math.round(z * 10) / 10,
      direction: z > 0 ? "spike" : "drop",
      multiple: med > 0 ? Math.round((value / med) * 10) / 10 : null
    });
  }
  return out;
}

const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

/**
 * Every anomaly worth surfacing, across the metrics that carry meaning.
 *
 * A drop in request volume is deliberately included: an outage often shows up
 * as traffic disappearing rather than as errors appearing, and a detector
 * watching only error counts sleeps straight through it.
 */
export function detectAnomalies({ timeline, resources, range }) {
  const found = [
    ...anomalies(timeline, "ERROR", { minValue: 3 }).map((a) => ({ ...a, label: "Error volume" })),
    ...anomalies(timeline, "total").map((a) => ({ ...a, label: "Request volume" })),
    ...anomalies(timeline, "p95", { minValue: 100 }).map((a) => ({ ...a, label: "p95 latency" }))
  ];

  const inRange = (resources ?? []).filter((p) => {
    const t = Date.parse(p.timestamp);
    return t >= range.fromMs && t <= range.toMs;
  });
  const asSeries = inRange.map((p) => ({ t: Date.parse(p.timestamp), ...p }));
  found.push(
    ...anomalies(asSeries, "cpuPercent", { minValue: 40 }).map((a) => ({ ...a, label: "CPU" })),
    ...anomalies(asSeries, "dbConnections", { minValue: 5 }).map((a) => ({ ...a, label: "Database connections" }))
  );

  return cluster(found.filter((a) => a.direction === "spike" || a.label === "Request volume"))
    .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))
    .slice(0, 6)
    .map((a) => ({
      ...a,
      description:
        (a.direction === "spike"
          ? `${a.label} peaked at ${fmtValue(a.metric, a.value)}${a.multiple ? `, ${a.multiple}× its usual ${fmtValue(a.metric, a.baseline)}` : ""}`
          : `${a.label} fell to ${fmtValue(a.metric, a.value)} from a usual ${fmtValue(a.metric, a.baseline)}`) +
        (a.buckets > 1 ? `, sustained for ${a.durationMinutes}m` : "")
    }));
}

/**
 * Collapses a run of consecutive anomalous buckets into one event.
 *
 * A seven-minute latency episode produces seven anomalous buckets. Listing
 * seven anomalies for one event is the same mistake as listing every alert
 * episode separately: the reader sees a wall and stops reading. One event,
 * peak value, bucket count.
 */
function cluster(found) {
  const byMetric = new Map();
  for (const a of found) {
    if (!byMetric.has(a.metric)) byMetric.set(a.metric, []);
    byMetric.get(a.metric).push(a);
  }

  const out = [];
  for (const group of byMetric.values()) {
    group.sort((a, b) => a.t - b.t);
    // Buckets within 3x the gap between the two closest points count as one run.
    const gaps = group.slice(1).map((a, i) => a.t - group[i].t).filter((g) => g > 0);
    const tolerance = (gaps.length ? Math.min(...gaps) : 60_000) * 3;

    let run = null;
    for (const a of group) {
      if (run && a.t - run.lastT <= tolerance) {
        run.buckets += 1;
        run.lastT = a.t;
        if (Math.abs(a.z) > Math.abs(run.z)) Object.assign(run, { z: a.z, value: a.value, multiple: a.multiple });
      } else {
        if (run) out.push(run);
        run = { ...a, buckets: 1, lastT: a.t, firstT: a.t };
      }
    }
    if (run) out.push(run);
  }

  return out.map((a) => ({
    ...a,
    durationMinutes: Math.max(1, Math.round((a.lastT - a.firstT) / 60_000))
  }));
}

const fmtValue = (metric, v) =>
  metric === "p95" ? `${Math.round(v)}ms` : metric === "cpuPercent" ? `${Math.round(v)}%` : String(Math.round(v));

/* ------------------------------------------------------ root-cause analysis */

/**
 * Ranked hypotheses for why an incident happened, each with the evidence that
 * supports it and a confidence derived from that evidence — never asserted.
 *
 * This is correlation, and it says so. The product's job is to put the right
 * three things in front of a person in the right order, not to pretend it has
 * established causation from log lines.
 */
export function rootCause(incident, { entries, resources, patterns }) {
  const from = incident.firstSeen;
  const to = incident.lastSeen;
  const window = entries.filter((e) => {
    const t = tsOf(e);
    return t >= from && t <= to;
  });
  if (window.length === 0) return [];

  const hypotheses = [];

  // 1. One log pattern dominating the failures is the strongest single signal.
  const windowPatterns = patterns ?? logPatterns(window, { limit: 3, minCount: 2 });
  const dominant = windowPatterns[0];
  if (dominant && dominant.count >= 3) {
    const errors = window.filter((e) => e.severity === "ERROR").length || 1;
    const share = dominant.count / errors;
    hypotheses.push({
      id: "dominant-pattern",
      claim: `${dominant.topService} is failing with one repeated error, not a scatter of unrelated ones`,
      evidence: `${dominant.count} of ${errors} errors in the window share the message "${truncate(dominant.pattern, 90)}"`,
      confidence: share > 0.7 ? "high" : share > 0.4 ? "medium" : "low",
      weight: share,
      link: { page: "logs", params: { service: dominant.topService } }
    });
  }

  // 2. An upstream status family points outward rather than at our code.
  const upstream = window.filter((e) => e.statusCode === 502 || e.statusCode === 503 || e.statusCode === 504);
  if (upstream.length >= 3) {
    hypotheses.push({
      id: "upstream",
      claim: "A dependency we call is failing, not our own request handling",
      evidence: `${upstream.length} responses in the 502/503/504 family — these are gateway and upstream failures, which our process returns when something it depends on did not answer`,
      confidence: upstream.length / window.length > 0.3 ? "high" : "medium",
      weight: upstream.length / window.length,
      link: { page: "logs", params: { statusClass: "5xx" } }
    });
  }

  // 3. A resource ceiling reached in the same window.
  const resWindow = (resources ?? []).filter((p) => {
    const t = Date.parse(p.timestamp);
    return t >= from && t <= to;
  });
  const peakCpu = Math.max(0, ...resWindow.map((p) => p.cpuPercent ?? 0));
  const peakDb = Math.max(0, ...resWindow.map((p) => p.dbConnections ?? 0));
  if (peakCpu >= 80) {
    hypotheses.push({
      id: "cpu-ceiling",
      claim: "The service was CPU-bound while this was happening",
      evidence: `CPU peaked at ${Math.round(peakCpu)}% during the incident window. Above roughly 80% the scheduler starts adding queueing delay to every request.`,
      confidence: peakCpu >= 90 ? "high" : "medium",
      weight: peakCpu / 100,
      link: { page: "resources", params: {} }
    });
  }
  if (peakDb >= 15) {
    hypotheses.push({
      id: "db-pool",
      claim: "The database connection pool was near its limit",
      evidence: `${peakDb} concurrent connections during the window. Requests queue once the pool is exhausted, which surfaces as latency first and timeouts second.`,
      confidence: "medium",
      weight: Math.min(1, peakDb / 30),
      link: { page: "resources", params: {} }
    });
  }

  // 4. Concentration in one route is a different investigation from a spread.
  const byRoute = new Map();
  for (const e of window) {
    if (e.statusCode < 400) continue;
    byRoute.set(e.route, (byRoute.get(e.route) ?? 0) + 1);
  }
  const [hotRoute, hotCount] = [...byRoute.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
  const failures = [...byRoute.values()].reduce((a, b) => a + b, 0);
  if (hotRoute && failures > 0 && hotCount / failures > 0.6 && byRoute.size > 1) {
    hypotheses.push({
      id: "single-route",
      claim: `The failure is confined to ${hotRoute}`,
      evidence: `${hotCount} of ${failures} failing requests hit this one route, so this is a code path problem rather than a whole-service outage`,
      confidence: "high",
      weight: hotCount / failures,
      link: { page: "logs", params: { route: hotRoute } }
    });
  }

  // 5. A deploy-shaped onset: errors starting abruptly from near zero.
  const beforeWindow = entries.filter((e) => {
    const t = tsOf(e);
    return t >= from - 15 * 60_000 && t < from;
  });
  const beforeErrors = beforeWindow.filter((e) => e.severity === "ERROR").length;
  const duringErrors = window.filter((e) => e.severity === "ERROR").length;
  if (beforeWindow.length > 20 && beforeErrors <= 1 && duringErrors >= 5) {
    hypotheses.push({
      id: "abrupt-onset",
      claim: "Something changed at the start of this window rather than degrading gradually",
      evidence: `${beforeErrors} errors in the 15 minutes before, ${duringErrors} during. An abrupt onset from a clean baseline usually means a deploy, a config change, or a dependency that went down at once.`,
      confidence: "medium",
      weight: 0.6,
      link: { page: "logs", params: {} }
    });
  }

  return hypotheses.sort((a, b) => b.weight - a.weight).slice(0, 4);
}

const truncate = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/* ---------------------------------------------------- incident summarization */

/**
 * One paragraph a person can read in five seconds: what happened, to what, for
 * how long, how big, and what it most likely was.
 */
export function summarizeIncident(incident, { causes, correlation }) {
  const minutes = incident.durationMinutes ?? Math.max(1, Math.round((incident.lastSeen - incident.firstSeen) / 60_000));
  const services = correlation?.affectedServices ?? [];
  const scope =
    services.length === 0
      ? "the application"
      : services.length === 1
        ? services[0]
        : `${services.slice(0, -1).join(", ")} and ${services.at(-1)}`;

  const started = new Date(incident.firstSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const episodeNote =
    incident.episodes > 1
      ? ` It crossed the threshold ${incident.episodes} separate times across ${incident.spanMinutes} minutes, so this is recurring rather than one continuous failure.`
      : "";
  const stateNote = incident.active
    ? "It is still breaching."
    : `It stopped breaching ${relativeMinutes(Date.now() - incident.lastSeen)} ago.`;

  const causeNote = causes?.[0]
    ? ` Most likely: ${lowerFirst(causes[0].claim)} (${causes[0].confidence} confidence).`
    : "";

  return (
    `${incident.title} hit ${scope}, breaching for ${minutes} minute${minutes === 1 ? "" : "s"} from ${started}. ` +
    `Peak: ${lowerFirst(incident.describePeak ?? "threshold crossed")}, across ${incident.count.toLocaleString()} matching entries. ` +
    `${stateNote}${episodeNote}${causeNote}`
  );
}

const lowerFirst = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const relativeMinutes = (ms) => {
  const m = Math.round(ms / 60_000);
  return m < 60 ? `${m}m` : `${Math.round(m / 60)}h`;
};

/* ------------------------------------------------------------- the LLM seam */

/**
 * Optional prose pass.
 *
 * Returns the findings unchanged when no model is configured, which is the
 * default. When a model IS configured it may rewrite the wording — it is never
 * given the authority to add, drop or reorder a finding, because a narrative
 * layer that can invent a cause is worse than no narrative layer.
 */
export function narrate(findings) {
  if (!process.env.ANTHROPIC_API_KEY) return { ...findings, narrated: false };
  // ponytail: wiring point only — no network call until a key exists to test
  // against. The contract above is the part that matters.
  return { ...findings, narrated: false };
}

export const analysisMode = () => ({
  engine: "deterministic",
  model: null,
  note: "Patterns, anomalies and causes are computed from the telemetry, not generated. The same window always produces the same findings, and every finding carries the evidence it was derived from."
});
