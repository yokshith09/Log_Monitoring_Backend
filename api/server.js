import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { logEntries, resourceSeries, costRows, sourceInfo, memo } from "./source.js";
import { listConnections, resolveScope, applyScope } from "./connections.js";
import { providerList } from "./providers.js";
import { buildActions, sectionSummary } from "./actions.js";
import { buildIncidents, buildNotifications } from "./incidents.js";
import { analysisMode, detectAnomalies, logPatterns } from "./ai.js";
import {
  overview,
  severityBreakdown,
  topEvents,
  byComponent,
  performance,
  evaluateAlerts,
  costSummary,
  recommendations
} from "./analytics.js";
import {
  serviceHealth,
  healthMetrics,
  statusBreakdown,
  correlate,
  REMEDIATION
} from "./insights.js";

const port = Number(process.env.PORT ?? 8090);
const WEB_DIST = new URL("../web/dist/", import.meta.url);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
  ".ico": "image/x-icon"
};

const json = (res, body, status = 200) => {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(body));
};

/** The active connection scope: all, a provider, or one account. */
const scopeOf = (url) => resolveScope(url.searchParams.get("scope"));

/** Log records narrowed to the active scope. */
const scopedEntries = (url) => {
  const scope = url.searchParams.get("scope") ?? "all";
  return memo(`entries:${scope}`, () => applyScope(logEntries(), scope));
};

/** Cost rows narrowed to the active scope. */
const scopedCost = (url) => {
  const scope = url.searchParams.get("scope") ?? "all";
  return memo(`cost:${scope}`, () => applyScope(costRows(), scope));
};

function range(url) {
  // `minutes` wins when present: sub-hour windows expressed as fractional hours
  // round badly across the bucket boundaries.
  const minutesParam = url.searchParams.get("minutes");
  const hours = Number(url.searchParams.get("hours") ?? 6);
  const spanRequested = minutesParam ? Number(minutesParam) * 60_000 : hours * 3600_000;
  const toMs = Number(url.searchParams.get("to") ?? Date.now());
  const fromMs = Number(url.searchParams.get("from") ?? toMs - spanRequested);
  const span = toMs - fromMs;
  // Keeps roughly 60–90 points on screen whatever the range.
  // Target roughly 30-90 points on screen whatever the window.
  const bucketMs =
    span <= 60_000 ? 2_000            // 1m  -> 2s buckets
      : span <= 5 * 60_000 ? 10_000   // 5m  -> 10s
      : span <= 15 * 60_000 ? 30_000  // 15m -> 30s
      : span <= 3600_000 ? 60_000     // 1h  -> 1m
      : span <= 6 * 3600_000 ? 5 * 60_000
      : span <= 24 * 3600_000 ? 15 * 60_000
      : 60 * 60_000;
  return { fromMs, toMs, bucketMs, hours, spanMs: span };
}

/**
 * Freshness, per §8: operational telemetry is near-real-time, billing updates
 * on the export's own cadence. Conflating them misleads, so they are reported
 * separately and the UI states both.
 */
const freshness = () => ({
  operational: { lastEntry: new Date().toISOString(), cadence: "near real-time", lagSeconds: 0 },
  billing: {
    lastExport: new Date(Date.now() - 14 * 3600_000).toISOString(),
    cadence: "daily export",
    note: "Cloud Billing exports to BigQuery on its own schedule, not as a stream."
  }
});

/** Mirrors a Cloud Logging filter expression. §10.1 names severity, service, endpoint and time window. */
function filterLogs(entries, url) {
  const severity = url.searchParams.get("severity");
  const service = url.searchParams.get("service") ?? url.searchParams.get("component");
  const event = url.searchParams.get("event");
  const route = url.searchParams.get("route");
  const statusClass = url.searchParams.get("statusClass");
  const q = url.searchParams.get("q")?.toLowerCase();
  const minLatency = Number(url.searchParams.get("minLatency") ?? 0);
  const requestId = url.searchParams.get("requestId");

  const all = (v) => !v || v === "ALL";

  return entries.filter((e) => {
    if (!all(severity) && e.severity !== severity) return false;
    if (!all(service) && e.component !== service) return false;
    if (!all(event) && e.event !== event) return false;
    if (!all(route) && e.route !== route) return false;
    if (!all(statusClass)) {
      const family = e.statusCode >= 500 ? "5xx" : e.statusCode >= 400 ? "4xx" : "2xx";
      if (family !== statusClass) return false;
    }
    if (requestId && e.requestId !== requestId) return false;
    if (minLatency && e.responseTimeMs < minLatency) return false;
    if (q && !`${e.event} ${e.message} ${e.route} ${e.requestId} ${e.component}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const routes = {
  "/api/overview": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const agg = overview(entries, r);
    const resources = resourceSeries();
    const rawAlerts = evaluateAlerts(entries, r);
    const alerts = rawAlerts.map((a) => ({
      ...a,
      correlation: correlate(entries, resources, { fromMs: a.firstSeen, toMs: a.lastSeen })
    }));
    const serviceRows = serviceHealth(entries, r);
    const healthRow = healthMetrics(entries, r);
    const actions = buildActions({ alerts, services: serviceRows, health: healthRow });
    const incidentRows = buildIncidents(rawAlerts, { entries, resources });
    const anomalyRows = detectAnomalies({ timeline: agg.timeline, resources, range: r });

    return {
      range: r,
      scope: scopeOf(url),
      source: sourceInfo(),
      freshness: freshness(),
      health: healthRow,
      deltas: agg.deltas,
      sparkline: agg.sparkline,
      timeline: agg.timeline,
      severity: severityBreakdown(entries, r),
      status: statusBreakdown(entries, r),
      topEvents: topEvents(entries, { ...r, limit: 6 }),
      services: serviceRows,
      components: byComponent(entries, r),
      alerts: alerts.slice(0, 4),
      activeAlertCount: alerts.filter((a) => a.active).length,
      incidents: incidentRows.slice(0, 5),
      anomalies: anomalyRows,
      notifications: buildNotifications({
        incidents: incidentRows,
        anomalies: anomalyRows,
        services: serviceRows,
        health: healthRow
      }),
      patterns: logPatterns(
        entries.filter((e) => {
          const t = e.t ?? Date.parse(e.timestamp);
          return t >= r.fromMs && t <= r.toMs;
        }),
        { limit: 5 }
      ),
      analysis: analysisMode(),
      // Action-first: what needs a person, ranked.
      actions,
      actionCounts: {
        critical: actions.filter((a) => a.priority === "critical" && a.active).length,
        high: actions.filter((a) => a.priority === "high" && a.active).length,
        total: actions.filter((a) => a.active).length
      },
      // Each major section carries its own rollup, so a reader never has to
      // scan a whole panel to learn whether it needs them.
      summaries: {
        reliability: sectionSummary(actions, ["alert", "system"]),
        services: sectionSummary(actions, ["service"])
      },
      performance: performance(entries, r).slowestRoutes.slice(0, 6),
      resourceLatest: resourceSeries().at(-1) ?? {},
      byConnection: listConnections().map((c) => {
        const rows = entries.filter((e) => e.connectionId === c.id);
        return {
          ...c,
          requests: rows.length,
          errors: rows.filter((e) => e.severity === "ERROR").length,
          warnings: rows.filter((e) => e.severity === "WARNING").length
        };
      }).filter((c) => c.requests > 0)
    };
  },

  "/api/services": (url) => {
    const r = range(url);
    return { range: r, freshness: freshness(), services: serviceHealth(scopedEntries(url), r) };
  },

  "/api/logs": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const windowed = entries.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= r.fromMs && t <= r.toMs;
    });
    const filtered = filterLogs(windowed, url);
    const limit = Number(url.searchParams.get("limit") ?? 200);

    return {
      range: r,
      freshness: freshness(),
      total: filtered.length,
      shown: Math.min(limit, filtered.length),
      entries: filtered.slice(0, limit),
      timeline: overview(filtered, r).timeline,
      facets: {
        services: [...new Set(windowed.map((e) => e.component))].sort(),
        events: [...new Set(windowed.map((e) => e.event))].sort(),
        routes: [...new Set(windowed.map((e) => e.route))].sort(),
        severities: ["INFO", "WARNING", "ERROR"],
        statusClasses: ["2xx", "4xx", "5xx"]
      }
    };
  },

  "/api/performance": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    return { range: r, freshness: freshness(), health: healthMetrics(entries, r), ...performance(entries, r) };
  },

  "/api/resources": (url) => {
    const r = range(url);
    const series = resourceSeries().filter((p) => {
      const t = Date.parse(p.timestamp);
      return t >= r.fromMs && t <= r.toMs;
    });
    const latest = series.at(-1) ?? {};
    const mean = (key) =>
      series.length ? Math.round((series.reduce((s, p) => s + p[key], 0) / series.length) * 10) / 10 : 0;

    return {
      range: r,
      freshness: freshness(),
      latest,
      series,
      peaks: {
        cpuPercent: Math.max(...series.map((p) => p.cpuPercent), 0),
        memoryMb: Math.max(...series.map((p) => p.memoryMb), 0),
        dbConnections: Math.max(...series.map((p) => p.dbConnections), 0),
        instanceCount: Math.max(...series.map((p) => p.instanceCount), 0)
      },
      means: {
        cpuPercent: mean("cpuPercent"),
        memoryMb: mean("memoryMb"),
        dbConnections: mean("dbConnections"),
        eventLoopLagMs: mean("eventLoopLagMs")
      }
    };
  },

  "/api/cost": (url) => {
    const r = range(url);
    const rows = scopedCost(url);
    const cost = costSummary(rows);
    const health = healthMetrics(scopedEntries(url), r);

    // Unit economics: spend per 1000 requests is the number that tells you
    // whether cost is growing because usage grew or because something regressed.
    const costPerThousand =
      health.requests > 0 ? (cost.dailyMean / Math.max(1, health.requests)) * 1000 : 0;

    return {
      freshness: freshness(),
      cost: { ...cost, costPerThousandRequests: Math.round(costPerThousand * 10000) / 10000 },
      recommendations: recommendations(cost, resourceSeries(), scopedEntries(url)),
      provenance: {
        source: "sample",
        note: "Schema-accurate sample in the Cloud Billing BigQuery export shape. Swaps to live data when the export is enabled; no code change required.",
        schema: "date · service.description · sku.description · cost · currency"
      }
    };
  },

  "/api/recommendations": (url) => {
    const cost = costSummary(scopedCost(url));
    const recs = recommendations(cost, resourceSeries(), scopedEntries(url));
    return {
      freshness: freshness(),
      recommendations: recs,
      totalEstimatedSaving: Math.round(recs.reduce((sum, rec) => sum + rec.impact, 0) * 100) / 100,
      provenance: { source: "sample", note: "Cost inputs are sample data; the rules and evidence are real." }
    };
  },

  "/api/alerts": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const resources = resourceSeries();
    // Grouped into incidents, not listed as raw breach records. One bad
    // afternoon is one incident with eight episodes, not eight alerts.
    const incidents = buildIncidents(evaluateAlerts(entries, r), { entries, resources });

    return {
      range: r,
      freshness: freshness(),
      analysis: analysisMode(),
      active: incidents.filter((i) => i.active),
      recent: incidents.filter((i) => !i.active),
      total: incidents.length,
      episodeTotal: incidents.reduce((sum, i) => sum + i.episodeCount, 0),
      bySeverity: ["critical", "serious", "warning"].map((s) => ({
        severity: s,
        count: incidents.filter((i) => i.severity === s).length
      }))
    };
  },

  /** Notifications only — cheap enough to poll on its own cadence. */
  "/api/notifications": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const resources = resourceSeries();
    const agg = overview(entries, r);
    const incidents = buildIncidents(evaluateAlerts(entries, r), { entries, resources });
    const anomalyRows = detectAnomalies({ timeline: agg.timeline, resources, range: r });

    return {
      range: r,
      notifications: buildNotifications({
        incidents,
        anomalies: anomalyRows,
        services: serviceHealth(entries, r),
        health: healthMetrics(entries, r)
      })
    };
  },

  /** Pattern detection and anomaly detection, as their own view. */
  "/api/insights": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const resources = resourceSeries();
    const windowed = entries.filter((e) => {
      const t = e.t ?? Date.parse(e.timestamp);
      return t >= r.fromMs && t <= r.toMs;
    });

    return {
      range: r,
      freshness: freshness(),
      analysis: analysisMode(),
      patterns: logPatterns(windowed, { limit: 12 }),
      allPatterns: logPatterns(windowed, { limit: 12, severities: null, minCount: 5 }),
      anomalies: detectAnomalies({ timeline: overview(entries, r).timeline, resources, range: r })
    };
  },

  "/api/actions": (url) => {
    const r = range(url);
    const entries = scopedEntries(url);
    const resources = resourceSeries();
    const alerts = evaluateAlerts(entries, r).map((a) => ({
      ...a,
      correlation: correlate(entries, resources, { fromMs: a.firstSeen, toMs: a.lastSeen })
    }));
    const actions = buildActions({
      alerts,
      services: serviceHealth(entries, r),
      health: healthMetrics(entries, r)
    });
    return { range: r, actions, total: actions.filter((a) => a.active).length };
  },

  "/api/connections": () => ({
    connections: listConnections(),
    providers: providerList().map((p) => ({
      id: p.id,
      name: p.name,
      shortName: p.shortName,
      accountLabel: p.accountLabel,
      accountHint: p.accountHint,
      status: p.status,
      capabilities: p.capabilities,
      services: p.services,
      credentials: p.credentials,
      requiredRoles: p.requiredRoles,
      queryLanguage: p.queryLanguage,
      exampleQuery: p.exampleQuery
    }))
  }),

  "/api/meta": () => ({
    source: sourceInfo(),
    generatedAt: new Date().toISOString(),
    freshness: freshness(),
    contract: [
      "timestamp", "severity", "event", "component", "entryPoint",
      "requestId", "route", "statusCode", "responseTimeMs", "environment", "message"
    ]
  })
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);

    const handler = routes[url.pathname];
    if (handler) return json(res, handler(url));

    if (url.pathname.startsWith("/api/")) {
      return json(res, { error: { code: "NOT_FOUND", message: "Unknown endpoint" } }, 404);
    }

    const requested = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = requested.includes("..") ? "index.html" : requested;
    try {
      const body = await readFile(new URL(safe, WEB_DIST));
      res.writeHead(200, { "content-type": MIME[extname(safe)] ?? "application/octet-stream" });
      return res.end(body);
    } catch {
      try {
        const shell = await readFile(new URL("index.html", WEB_DIST));
        res.writeHead(200, { "content-type": MIME[".html"] });
        return res.end(shell);
      } catch {
        res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        return res.end("Build the web app first: cd web && npm run build");
      }
    }
  } catch (err) {
    console.error("Vantage API error:", err);
    if (!res.headersSent) json(res, { error: { code: "SERVER_ERROR", message: err.message } }, 500);
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Vantage API on http://localhost:${port} (source: ${process.env.VANTAGE_SOURCE ?? "sample"})`);
});
