import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname } from "node:path";
import { logEntries, resourceSeries, costRows } from "./data.js";
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

function range(url) {
  const hours = Number(url.searchParams.get("hours") ?? 6);
  const toMs = Number(url.searchParams.get("to") ?? Date.now());
  const fromMs = Number(url.searchParams.get("from") ?? toMs - hours * 3600_000);
  const span = toMs - fromMs;
  // Keeps roughly 60–90 points on screen whatever the range.
  const bucketMs =
    span <= 3600_000 ? 60_000 : span <= 6 * 3600_000 ? 5 * 60_000 : span <= 24 * 3600_000 ? 15 * 60_000 : 60 * 60_000;
  return { fromMs, toMs, bucketMs, hours };
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
    const entries = logEntries();
    const agg = overview(entries, r);
    const alerts = evaluateAlerts(entries, r);

    return {
      range: r,
      freshness: freshness(),
      health: healthMetrics(entries, r),
      deltas: agg.deltas,
      sparkline: agg.sparkline,
      timeline: agg.timeline,
      severity: severityBreakdown(entries, r),
      status: statusBreakdown(entries, r),
      topEvents: topEvents(entries, { ...r, limit: 6 }),
      services: serviceHealth(entries, r),
      components: byComponent(entries, r),
      alerts: alerts.slice(0, 4),
      activeAlertCount: alerts.filter((a) => a.active).length,
      performance: performance(entries, r).slowestRoutes.slice(0, 5),
      resourceLatest: resourceSeries().at(-1) ?? {}
    };
  },

  "/api/services": (url) => {
    const r = range(url);
    return { range: r, freshness: freshness(), services: serviceHealth(logEntries(), r) };
  },

  "/api/logs": (url) => {
    const r = range(url);
    const entries = logEntries();
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
    const entries = logEntries();
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
    const rows = costRows();
    const cost = costSummary(rows);
    const health = healthMetrics(logEntries(), r);

    // Unit economics: spend per 1000 requests is the number that tells you
    // whether cost is growing because usage grew or because something regressed.
    const costPerThousand =
      health.requests > 0 ? (cost.dailyMean / Math.max(1, health.requests)) * 1000 : 0;

    return {
      freshness: freshness(),
      cost: { ...cost, costPerThousandRequests: Math.round(costPerThousand * 10000) / 10000 },
      recommendations: recommendations(cost, resourceSeries(), logEntries()),
      provenance: {
        source: "sample",
        note: "Schema-accurate sample in the Cloud Billing BigQuery export shape. Swaps to live data when the export is enabled; no code change required.",
        schema: "date · service.description · sku.description · cost · currency"
      }
    };
  },

  "/api/recommendations": () => {
    const cost = costSummary(costRows());
    return {
      freshness: freshness(),
      recommendations: recommendations(cost, resourceSeries(), logEntries()),
      totalEstimatedSaving:
        Math.round(recommendations(cost, resourceSeries(), logEntries()).reduce((s, r) => s + r.impact, 0) * 100) / 100,
      provenance: { source: "sample", note: "Cost inputs are sample data; the rules and evidence are real." }
    };
  },

  "/api/alerts": (url) => {
    const r = range(url);
    const entries = logEntries();
    const resources = resourceSeries();
    const alerts = evaluateAlerts(entries, r).map((alert) => ({
      ...alert,
      remediation: REMEDIATION[alert.ruleId] ?? null,
      // What else was happening in the same window — §12 step 4.
      correlation: correlate(entries, resources, { fromMs: alert.firstSeen, toMs: alert.lastSeen })
    }));

    return {
      range: r,
      freshness: freshness(),
      active: alerts.filter((a) => a.active),
      recent: alerts.filter((a) => !a.active),
      total: alerts.length,
      bySeverity: ["critical", "serious", "warning"].map((s) => ({
        severity: s,
        count: alerts.filter((a) => a.severity === s).length
      }))
    };
  },

  "/api/meta": () => ({
    source: process.env.VANTAGE_SOURCE ?? "sample",
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
