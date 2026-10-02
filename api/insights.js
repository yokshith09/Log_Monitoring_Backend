/**
 * Service-level rollups, derived health metrics, and remediation guidance.
 *
 * Split from analytics.js to keep that file focused on raw aggregation. Like
 * analytics.js, everything here takes log records in the Cloud Logging
 * jsonPayload contract and is source-agnostic.
 */

const APDEX_TARGET_MS = 200;

const pct = (part, whole) => (whole === 0 ? 0 : part / whole);

function percentile(values, p) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/**
 * Apdex: an industry-standard satisfaction score. Requests under the target are
 * satisfying, under 4x the target are tolerable, beyond that are frustrating.
 * One number that answers "are users having a good time" better than a mean.
 */
export function apdex(latencies, targetMs = APDEX_TARGET_MS) {
  if (latencies.length === 0) return 1;
  const satisfied = latencies.filter((ms) => ms <= targetMs).length;
  const tolerating = latencies.filter((ms) => ms > targetMs && ms <= targetMs * 4).length;
  return (satisfied + tolerating / 2) / latencies.length;
}

/** Health grade from the signals a developer actually acts on. */
export function grade({ errorRate, p95, availability }) {
  if (errorRate > 0.05 || availability < 0.99) return "critical";
  if (errorRate > 0.02 || p95 > 500 || availability < 0.995) return "degraded";
  if (errorRate > 0.005 || p95 > 300) return "watch";
  return "healthy";
}

/**
 * Per-service rollup — §11 "errors by service" and §10.2 "most frequent error
 * types/services". Each row is a drill-down target: the UI links it straight
 * into the log view filtered to that service.
 */
export function serviceHealth(entries, { fromMs, toMs, bucketMs }) {
  const window = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= fromMs && t <= toMs;
  });

  const names = [...new Set(window.map((e) => e.component))].sort();
  const spanMinutes = Math.max(1, (toMs - fromMs) / 60_000);

  return names.map((name) => {
    const rows = window.filter((e) => e.component === name);
    const latencies = rows.map((e) => e.responseTimeMs);
    const errors = rows.filter((e) => e.severity === "ERROR").length;
    const warnings = rows.filter((e) => e.severity === "WARNING").length;
    const serverErrors = rows.filter((e) => e.statusCode >= 500).length;
    const clientErrors = rows.filter((e) => e.statusCode >= 400 && e.statusCode < 500).length;

    const errorRate = pct(errors, rows.length);
    const availability = 1 - pct(serverErrors, rows.length);
    const p95 = percentile(latencies, 95);

    // Which failure dominates this service — the first thing to look at.
    const failureCounts = new Map();
    for (const row of rows.filter((e) => e.severity !== "INFO")) {
      failureCounts.set(row.event, (failureCounts.get(row.event) ?? 0) + 1);
    }
    const [topFailure, topFailureCount] = [...failureCounts.entries()].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];

    const buckets = new Map();
    for (let at = Math.floor(fromMs / bucketMs) * bucketMs; at <= toMs; at += bucketMs) buckets.set(at, 0);
    for (const row of rows) {
      const at = Math.floor(Date.parse(row.timestamp) / bucketMs) * bucketMs;
      if (buckets.has(at)) buckets.set(at, buckets.get(at) + 1);
    }

    return {
      name,
      requests: rows.length,
      requestsPerMinute: Math.round((rows.length / spanMinutes) * 10) / 10,
      errors,
      warnings,
      serverErrors,
      clientErrors,
      errorRate,
      availability,
      p50: percentile(latencies, 50),
      p95,
      p99: percentile(latencies, 99),
      apdex: apdex(latencies),
      topFailure,
      topFailureCount,
      routes: [...new Set(rows.map((e) => e.route))].sort(),
      sparkline: [...buckets.values()],
      grade: grade({ errorRate, p95, availability })
    };
  }).sort((a, b) => b.requests - a.requests);
}

/** Headline numbers for the overview, beyond raw counts. */
export function healthMetrics(entries, { fromMs, toMs }) {
  const window = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= fromMs && t <= toMs;
  });

  const latencies = window.map((e) => e.responseTimeMs);
  const serverErrors = window.filter((e) => e.statusCode >= 500).length;
  const clientErrors = window.filter((e) => e.statusCode >= 400 && e.statusCode < 500).length;
  const errors = window.filter((e) => e.severity === "ERROR").length;
  const spanMinutes = Math.max(1, (toMs - fromMs) / 60_000);

  const errorRate = pct(errors, window.length);
  const availability = 1 - pct(serverErrors, window.length);
  const p95 = percentile(latencies, 95);

  return {
    requests: window.length,
    requestsPerMinute: Math.round((window.length / spanMinutes) * 10) / 10,
    errors,
    warnings: window.filter((e) => e.severity === "WARNING").length,
    // 4xx and 5xx mean very different things: one is callers misbehaving,
    // the other is us. Collapsing them into "errors" hides which.
    clientErrors,
    serverErrors,
    clientErrorRate: pct(clientErrors, window.length),
    serverErrorRate: pct(serverErrors, window.length),
    errorRate,
    availability,
    apdex: apdex(latencies),
    p50: percentile(latencies, 50),
    p95,
    p99: percentile(latencies, 99),
    slowRequests: window.filter((e) => e.responseTimeMs > 500).length,
    uniqueRoutes: new Set(window.map((e) => e.route)).size,
    uniqueServices: new Set(window.map((e) => e.component)).size,
    grade: grade({ errorRate, p95, availability })
  };
}

/** Status-code family split — §10.3 names "a sudden increase in 5xx" explicitly. */
export function statusBreakdown(entries, { fromMs, toMs }) {
  const window = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= fromMs && t <= toMs;
  });

  const families = [
    { family: "2xx", label: "Success", test: (c) => c >= 200 && c < 300 },
    { family: "4xx", label: "Client error", test: (c) => c >= 400 && c < 500 },
    { family: "5xx", label: "Server error", test: (c) => c >= 500 }
  ];

  return families.map((f) => {
    const rows = window.filter((e) => f.test(e.statusCode));
    const codes = new Map();
    for (const row of rows) codes.set(row.statusCode, (codes.get(row.statusCode) ?? 0) + 1);
    return {
      ...f,
      test: undefined,
      count: rows.length,
      share: pct(rows.length, window.length),
      codes: [...codes.entries()].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count)
    };
  });
}

/**
 * Remediation guidance per alert rule — §10.6's "translate a signal into a
 * plain-language action". Advisory only: nothing here acts on its own, which
 * §10.6 and §15 both require.
 */
export const REMEDIATION = {
  "error-rate": {
    likelyCause: "A dependency is failing or a bad revision is serving traffic.",
    actions: [
      "Open the log view filtered to ERROR and read the top event — one failure usually dominates.",
      "Check whether the spike starts at a deploy boundary in the Cloud Run revision list.",
      "If it aligns with a deploy, roll back: gcloud run services update-traffic staysync-api --to-revisions=PREVIOUS=100"
    ],
    verify: "Error rate returns below 5% over a 5-minute window."
  },
  "payment-failures": {
    likelyCause: "The payment provider is rejecting, or the integration is misconfigured.",
    actions: [
      "Confirm the failures are provider rejections rather than our own 5xx: filter the logs to payment_provider_rejected.",
      "Check whether orders are correctly left PENDING — a rejected payment must never confirm an order.",
      "If the provider is down, the outbox means nothing is lost; customers can retry."
    ],
    verify: "payment_approved resumes and no order is stuck in PENDING beyond the retry window."
  },
  latency: {
    likelyCause: "Database contention, a cold start, or an unindexed query.",
    actions: [
      "Compare the latency spike against CPU and DB connections for the same window on the Resources view.",
      "If DB connections are saturated, raise the pool ceiling or the instance tier.",
      "If it coincides with scale-from-zero, set --min-instances=1 to remove cold starts."
    ],
    verify: "p95 returns below 500ms and stays there across a full traffic peak."
  },
  "brute-force": {
    likelyCause: "Credential stuffing against the sign-in endpoint.",
    actions: [
      "Confirm the lockout engaged: auth_rate_limited means the throttle refused before touching the database.",
      "Check whether attempts concentrate on one address or many — many suggests a list-based attack.",
      "Consider Cloud Armor rate limiting at the edge if the volume reaches the service at all."
    ],
    verify: "auth_rate_limited falls to zero and auth_login_failed returns to baseline."
  },
  "stock-contention": {
    likelyCause: "Demand exceeds stock on a popular item — often correct behaviour, not a fault.",
    actions: [
      "Confirm nothing oversold: created orders must never exceed the stock that was available.",
      "If this is a flash sale, it is the row lock doing its job and needs no fix.",
      "If it is persistent, restock or withdraw the product from the catalogue."
    ],
    verify: "Stock conflicts fall away once inventory is replenished."
  },
  "dependency-down": {
    likelyCause: "Cloud SQL is unreachable: connection limit, instance restart, or a socket misconfiguration.",
    actions: [
      "Check the instance state: gcloud sql instances describe staysync-sql --format='value(state)'",
      "Confirm the Cloud Run service still has --add-cloudsql-instances and the cloudsql.client role.",
      "Inspect connection count on the Resources view — exhaustion looks identical to an outage from the app side."
    ],
    verify: "/health reports healthy and reads the correct storage engine."
  },
  "repeated-failure": {
    likelyCause: "One code path failing consistently rather than intermittently.",
    actions: [
      "Group by event name in the log view — a single dominant event points straight at the code path.",
      "Pull one requestId and read its full entry for the exact route and status.",
      "If it is a validation failure, the caller may be malformed rather than the service broken."
    ],
    verify: "The dominant event drops out of the top failures list."
  }
};

/**
 * Correlation for a time window — §12 step 4: "related latency or resource
 * signals for the same time period". Answers "what else was happening".
 */
export function correlate(entries, resources, { fromMs, toMs }) {
  const window = entries.filter((e) => {
    const t = Date.parse(e.timestamp);
    return t >= fromMs && t <= toMs;
  });
  const res = resources.filter((p) => {
    const t = Date.parse(p.timestamp);
    return t >= fromMs && t <= toMs;
  });

  const latencies = window.map((e) => e.responseTimeMs);
  const cpu = res.map((p) => p.cpuPercent);
  const connections = res.map((p) => p.dbConnections);

  return {
    requests: window.length,
    errorRate: pct(window.filter((e) => e.severity === "ERROR").length, window.length),
    p95: percentile(latencies, 95),
    peakCpu: cpu.length ? Math.max(...cpu) : null,
    peakConnections: connections.length ? Math.max(...connections) : null,
    affectedServices: [...new Set(window.filter((e) => e.severity !== "INFO").map((e) => e.component))],
    topEvents: [...window.filter((e) => e.severity !== "INFO").reduce((map, e) => {
      map.set(e.event, (map.get(e.event) ?? 0) + 1);
      return map;
    }, new Map())]
      .map(([event, count]) => ({ event, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 4)
  };
}
