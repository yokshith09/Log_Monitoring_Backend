/**
 * Aggregation and alert evaluation.
 *
 * Everything here operates on arrays of log records in the telemetry contract —
 * the same shape Cloud Logging returns as `jsonPayload`. Nothing in this file
 * knows or cares where the records came from, so it runs unchanged against the
 * live Cloud Logging adapter.
 */

const MINUTE = 60_000;

/** Numeric timestamp, falling back for records that lack the fast field. */
export const tsOf = (e) => e.t ?? (e.t = Date.parse(e.timestamp));

/** Ascending-by-time copy, memoized per array identity for binary search. */
const sortedCache = new WeakMap();
function sortedAsc(entries) {
  let sorted = sortedCache.get(entries);
  if (!sorted) {
    sorted = [...entries].sort((a, b) => tsOf(a) - tsOf(b));
    sortedCache.set(entries, sorted);
  }
  return sorted;
}

/** First index whose timestamp is >= target. */
function lowerBound(sorted, target) {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tsOf(sorted[mid]) < target) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * Records inside [fromMs, toMs].
 *
 * Binary search over a sorted copy rather than a full scan: the alert engine
 * slides thousands of windows per request, and a linear filter there made the
 * overview take seconds.
 */
const inWindow = (entries, fromMs, toMs) => {
  const sorted = sortedAsc(entries);
  const start = lowerBound(sorted, fromMs);
  const end = lowerBound(sorted, toMs + 1);
  return sorted.slice(start, end);
};

/** Groups timestamps into fixed buckets so charts have a stable x-axis. */
function bucketise(entries, fromMs, toMs, bucketMs) {
  const buckets = new Map();
  for (let at = Math.floor(fromMs / bucketMs) * bucketMs; at <= toMs; at += bucketMs) {
    buckets.set(at, []);
  }
  for (const entry of entries) {
    const at = Math.floor(tsOf(entry) / bucketMs) * bucketMs;
    if (buckets.has(at)) buckets.get(at).push(entry);
  }
  return [...buckets.entries()].sort(([a], [b]) => a - b);
}

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index];
}

const countBy = (entries, key) => {
  const counts = new Map();
  for (const entry of entries) counts.set(entry[key], (counts.get(entry[key]) ?? 0) + 1);
  return counts;
};

const errorRate = (entries) =>
  entries.length === 0 ? 0 : entries.filter((e) => e.severity === "ERROR").length / entries.length;

/* -------------------------------------------------------------- summaries */

export function overview(entries, { fromMs, toMs, bucketMs }) {
  const window = inWindow(entries, fromMs, toMs);
  const halfway = fromMs + (toMs - fromMs) / 2;
  const recent = window.filter((e) => Date.parse(e.timestamp) >= halfway);
  const earlier = window.filter((e) => Date.parse(e.timestamp) < halfway);

  const latencies = window.map((e) => e.responseTimeMs);
  const recentLatencies = recent.map((e) => e.responseTimeMs);
  const earlierLatencies = earlier.map((e) => e.responseTimeMs);

  const buckets = bucketise(window, fromMs, toMs, bucketMs);

  return {
    totals: {
      requests: window.length,
      errors: window.filter((e) => e.severity === "ERROR").length,
      warnings: window.filter((e) => e.severity === "WARNING").length,
      errorRate: errorRate(window),
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99)
    },
    // Deltas drive the stat-tile trend arrows: second half of the window
    // against the first.
    deltas: {
      requests: recent.length - earlier.length,
      errorRate: errorRate(recent) - errorRate(earlier),
      p95: percentile(recentLatencies, 95) - percentile(earlierLatencies, 95)
    },
    timeline: buckets.map(([at, group]) => ({
      t: at,
      total: group.length,
      INFO: group.filter((e) => e.severity === "INFO").length,
      WARNING: group.filter((e) => e.severity === "WARNING").length,
      ERROR: group.filter((e) => e.severity === "ERROR").length,
      errorRate: errorRate(group),
      p95: percentile(group.map((e) => e.responseTimeMs), 95)
    })),
    sparkline: buckets.map(([, group]) => group.length)
  };
}

export function severityBreakdown(entries, { fromMs, toMs }) {
  const window = inWindow(entries, fromMs, toMs);
  return ["INFO", "WARNING", "ERROR"].map((severity) => ({
    severity,
    count: window.filter((e) => e.severity === severity).length
  }));
}

export function topEvents(entries, { fromMs, toMs, severities = ["WARNING", "ERROR"], limit = 8 }) {
  const window = inWindow(entries, fromMs, toMs).filter((e) => severities.includes(e.severity));
  const grouped = new Map();

  for (const entry of window) {
    const existing = grouped.get(entry.event) ?? {
      event: entry.event,
      component: entry.component,
      severity: entry.severity,
      statusCode: entry.statusCode,
      count: 0,
      lastSeen: entry.timestamp
    };
    existing.count += 1;
    if (entry.timestamp > existing.lastSeen) existing.lastSeen = entry.timestamp;
    grouped.set(entry.event, existing);
  }

  return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export function byComponent(entries, { fromMs, toMs, bucketMs }) {
  const window = inWindow(entries, fromMs, toMs);
  const components = [...countBy(window, "component").keys()].sort();
  const buckets = bucketise(window, fromMs, toMs, bucketMs);

  return {
    components,
    series: buckets.map(([at, group]) => {
      const row = { t: at };
      for (const component of components) {
        row[component] = group.filter((e) => e.component === component).length;
      }
      return row;
    })
  };
}

export function performance(entries, { fromMs, toMs, bucketMs }) {
  const window = inWindow(entries, fromMs, toMs);
  const buckets = bucketise(window, fromMs, toMs, bucketMs);

  const routes = new Map();
  for (const entry of window) {
    const existing = routes.get(entry.route) ?? { route: entry.route, samples: [], errors: 0, count: 0 };
    existing.samples.push(entry.responseTimeMs);
    existing.count += 1;
    if (entry.severity === "ERROR") existing.errors += 1;
    routes.set(entry.route, existing);
  }

  return {
    latency: buckets.map(([at, group]) => {
      const values = group.map((e) => e.responseTimeMs);
      return {
        t: at,
        p50: percentile(values, 50),
        p95: percentile(values, 95),
        p99: percentile(values, 99)
      };
    }),
    slowestRoutes: [...routes.values()]
      .map((r) => ({
        route: r.route,
        count: r.count,
        p95: percentile(r.samples, 95),
        avg: Math.round(r.samples.reduce((a, b) => a + b, 0) / r.samples.length),
        errorRate: r.count === 0 ? 0 : r.errors / r.count
      }))
      // Every route in the window. The overview counts them all, so capping
      // here made the dashboard claim 11 routes and show 8.
      .sort((a, b) => b.p95 - a.p95),
    // Volume against failures over time: the correlation §10.2 asks for.
    throughput: buckets.map(([at, group]) => ({
      t: at,
      requests: group.length,
      failures: group.filter((e) => e.statusCode >= 400).length
    }))
  };
}

/* ----------------------------------------------------------------- alerts */

/**
 * Threshold rules per §14. Each returns an alert with the evidence attached:
 * the condition, the count, the window, and a log filter that reproduces it.
 * §15 requires evidence on every recommendation; the same standard applies here.
 */
export const ALERT_RULES = [
  {
    id: "error-rate",
    title: "Elevated error rate",
    severity: "critical",
    windowMinutes: 5,
    describe: (v) => `Error rate ${(v * 100).toFixed(1)}% exceeds the 5% threshold`,
    evaluate: (window) => {
      const rate = errorRate(window);
      return rate > 0.05 && window.length >= 10 ? { value: rate, count: window.filter((e) => e.severity === "ERROR").length } : null;
    },
    filter: { severity: "ERROR" }
  },
  {
    id: "payment-failures",
    title: "Payment provider failures",
    severity: "critical",
    windowMinutes: 5,
    describe: (v) => `${v} payment rejections in 5 minutes exceeds the threshold of 3`,
    evaluate: (window) => {
      const count = window.filter((e) => e.event === "payment_provider_rejected").length;
      return count >= 3 ? { value: count, count } : null;
    },
    filter: { event: "payment_provider_rejected" }
  },
  {
    id: "latency",
    title: "Latency above threshold",
    severity: "serious",
    windowMinutes: 5,
    describe: (v) => `p95 latency ${v}ms exceeds the 500ms threshold`,
    evaluate: (window) => {
      if (window.length < 10) return null;
      const p95 = percentile(window.map((e) => e.responseTimeMs), 95);
      return p95 > 500 ? { value: p95, count: window.filter((e) => e.responseTimeMs > 500).length } : null;
    },
    filter: { minLatency: 500 }
  },
  {
    id: "brute-force",
    title: "Credential stuffing detected",
    severity: "serious",
    windowMinutes: 10,
    describe: (v) => `${v} rate-limited sign-ins in 10 minutes`,
    evaluate: (window) => {
      const count = window.filter((e) => e.event === "auth_rate_limited").length;
      return count >= 5 ? { value: count, count } : null;
    },
    filter: { event: "auth_rate_limited" }
  },
  {
    id: "stock-contention",
    title: "Stock contention",
    severity: "warning",
    windowMinutes: 5,
    describe: (v) => `${v} orders rejected for insufficient stock`,
    evaluate: (window) => {
      const count = window.filter((e) => e.event === "order_stock_conflict").length;
      return count >= 5 ? { value: count, count } : null;
    },
    filter: { event: "order_stock_conflict" }
  },
  {
    id: "dependency-down",
    title: "Dependency unreachable",
    severity: "critical",
    windowMinutes: 5,
    describe: (v) => `${v} database timeouts — the catalogue cannot reach its database`,
    evaluate: (window) => {
      const count = window.filter((e) => e.event === "database_timeout" || e.event === "health_degraded").length;
      return count >= 3 ? { value: count, count } : null;
    },
    filter: { event: "database_timeout" }
  },
  {
    id: "repeated-failure",
    title: "Repeated failure pattern",
    severity: "warning",
    windowMinutes: 5,
    describe: (v) => `The same failure repeated ${v} times`,
    evaluate: (window) => {
      const failures = window.filter((e) => e.severity !== "INFO");
      const counts = countBy(failures, "event");
      const [event, count] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [];
      return count >= 10 ? { value: count, count, event } : null;
    },
    filter: {}
  }
];

/**
 * Slides each rule's window across the period and collapses consecutive
 * breaches into one incident, so a 35-minute outage is one alert rather than
 * seven. §20 names alert fatigue as a risk; this is the mitigation.
 */
export function evaluateAlerts(entries, { fromMs, toMs }) {
  const alerts = [];
  const step = 5 * MINUTE;

  for (const rule of ALERT_RULES) {
    const windowMs = rule.windowMinutes * MINUTE;
    let open = null;

    for (let at = fromMs; at <= toMs; at += step) {
      const window = inWindow(entries, at, at + windowMs);
      const breach = rule.evaluate(window);

      if (breach) {
        if (open) {
          open.lastSeen = at + windowMs;
          open.occurrences += 1;
          open.peak = Math.max(open.peak, breach.value);
          open.count += breach.count;
        } else {
          open = {
            ruleId: rule.id,
            title: rule.title,
            severity: rule.severity,
            firstSeen: at,
            lastSeen: at + windowMs,
            occurrences: 1,
            peak: breach.value,
            count: breach.count,
            event: breach.event,
            filter: rule.filter,
            windowMinutes: rule.windowMinutes
          };
        }
      } else if (open) {
        alerts.push({ ...open, description: rule.describe(open.peak) });
        open = null;
      }
    }

    if (open) alerts.push({ ...open, description: rule.describe(open.peak), active: true });
  }

  return alerts
    .map((a) => ({ ...a, active: a.active ?? a.lastSeen >= toMs - 10 * MINUTE }))
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

/* ------------------------------------------------------------------- cost */

export function costSummary(rows, { days = 30 } = {}) {
  const byDate = new Map();
  const byService = new Map();
  const bySku = new Map();

  for (const row of rows) {
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.cost);
    byService.set(row.service, (byService.get(row.service) ?? 0) + row.cost);
    const skuKey = `${row.service} · ${row.sku}`;
    bySku.set(skuKey, (bySku.get(skuKey) ?? 0) + row.cost);
  }

  const trend = [...byDate.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([date, cost]) => ({
    date,
    cost: Math.round(cost * 100) / 100
  }));

  const total = trend.reduce((sum, d) => sum + d.cost, 0);
  const mean = total / Math.max(1, trend.length);

  // §14 cost anomaly: a day more than 1.5x the period mean.
  const anomalies = trend.filter((d) => d.cost > mean * 1.5);

  return {
    total: Math.round(total * 100) / 100,
    dailyMean: Math.round(mean * 100) / 100,
    projectedMonthly: Math.round(mean * 30 * 100) / 100,
    trend,
    byService: [...byService.entries()]
      .map(([service, cost]) => ({ service, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost),
    bySku: [...bySku.entries()]
      .map(([sku, cost]) => ({ sku, cost: Math.round(cost * 100) / 100 }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    anomalies,
    days
  };
}

/**
 * Advisory optimisation rules per §15.
 *
 * Every recommendation carries its evidence and an estimated impact, and none
 * of them act — §10.6 and §15 both require the user stays the decision-maker.
 */
export function recommendations(cost, resources, entries) {
  const out = [];
  const peakCpu = Math.max(...resources.map((r) => r.cpuPercent));
  const meanCpu = resources.reduce((s, r) => s + r.cpuPercent, 0) / resources.length;
  const peakInstances = Math.max(...resources.map((r) => r.instanceCount));
  const meanConnections = resources.reduce((s, r) => s + r.dbConnections, 0) / resources.length;

  const cloudSql = cost.byService.find((s) => s.service === "Cloud SQL");
  const logging = cost.byService.find((s) => s.service === "Cloud Logging");

  if (meanCpu < 35 && cloudSql) {
    out.push({
      id: "rightsize-sql",
      title: "Right-size the Cloud SQL instance",
      impact: Math.round(cloudSql.cost * 0.4 * 100) / 100,
      confidence: "medium",
      reason: `Mean CPU across the period is ${meanCpu.toFixed(1)}% and peaks at ${peakCpu.toFixed(1)}%. The instance is provisioned well above observed demand.`,
      evidence: [
        `Mean CPU ${meanCpu.toFixed(1)}% · peak ${peakCpu.toFixed(1)}%`,
        `Mean DB connections ${meanConnections.toFixed(1)}`,
        `Cloud SQL is $${cloudSql.cost.toFixed(2)} of $${cost.total.toFixed(2)} (${((cloudSql.cost / cost.total) * 100).toFixed(0)}%)`
      ],
      action: "Drop one machine tier and observe for a week before dropping further."
    });
  }

  if (cost.anomalies.length > 0) {
    const worst = cost.anomalies.sort((a, b) => b.cost - a.cost)[0];
    out.push({
      id: "cost-anomaly",
      title: "Investigate an unexplained spend spike",
      impact: Math.round((worst.cost - cost.dailyMean) * 100) / 100,
      confidence: "high",
      reason: `Spend on ${worst.date} was $${worst.cost.toFixed(2)} against a period mean of $${cost.dailyMean.toFixed(2)} — ${(worst.cost / cost.dailyMean).toFixed(1)}x normal.`,
      evidence: [
        `${worst.date}: $${worst.cost.toFixed(2)}`,
        `Period mean: $${cost.dailyMean.toFixed(2)}`,
        `${cost.anomalies.length} day(s) above 1.5x the mean`
      ],
      action: "Correlate the date against deploys and traffic in the log view before changing anything."
    });
  }

  if (peakInstances <= 3) {
    out.push({
      id: "min-instances",
      title: "Confirm minimum instances are set to zero",
      impact: 2.4,
      confidence: "medium",
      reason: `Peak concurrency reached ${peakInstances} instance(s). Idle instances bill continuously; Cloud Run bills nothing at zero.`,
      evidence: [`Peak instance count ${peakInstances}`, `Mean CPU ${meanCpu.toFixed(1)}%`],
      action: "Keep --min-instances=0 on the API. The worker needs 1 for its outbox poller."
    });
  }

  const infoShare = entries.filter((e) => e.severity === "INFO").length / Math.max(1, entries.length);
  if (logging && infoShare > 0.8) {
    out.push({
      id: "log-volume",
      title: "Trim low-value log volume",
      impact: Math.round(logging.cost * 0.3 * 100) / 100,
      confidence: "low",
      reason: `${(infoShare * 100).toFixed(0)}% of entries are INFO. Logging bills on ingested volume, and routine success lines dominate it.`,
      evidence: [
        `INFO share ${(infoShare * 100).toFixed(0)}%`,
        `Cloud Logging is $${logging.cost.toFixed(2)} over the period`
      ],
      action: "Add an exclusion filter for health checks, keeping all WARNING and ERROR. Verify nothing you alert on is excluded."
    });
  }

  return out.sort((a, b) => b.impact - a.impact);
}
