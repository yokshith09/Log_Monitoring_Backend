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

/** Resolves the requested range. Defaults to the last 6 hours. */
function range(url) {
  const hours = Number(url.searchParams.get("hours") ?? 6);
  const toMs = Date.now();
  const fromMs = toMs - hours * 3600_000;
  // Bucket size keeps roughly 60–90 points on screen whatever the range.
  const bucketMs = hours <= 1 ? 60_000 : hours <= 6 ? 5 * 60_000 : hours <= 24 ? 15 * 60_000 : 60 * 60_000;
  return { fromMs, toMs, bucketMs, hours };
}

/** Applies the log view's filters. Mirrors a Cloud Logging filter expression. */
function filterLogs(entries, url) {
  const severity = url.searchParams.get("severity");
  const component = url.searchParams.get("component");
  const event = url.searchParams.get("event");
  const q = url.searchParams.get("q")?.toLowerCase();
  const minLatency = Number(url.searchParams.get("minLatency") ?? 0);
  const requestId = url.searchParams.get("requestId");

  return entries.filter((e) => {
    if (severity && severity !== "ALL" && e.severity !== severity) return false;
    if (component && component !== "ALL" && e.component !== component) return false;
    if (event && event !== "ALL" && e.event !== event) return false;
    if (requestId && e.requestId !== requestId) return false;
    if (minLatency && e.responseTimeMs < minLatency) return false;
    if (q && !`${e.event} ${e.message} ${e.route} ${e.requestId}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

const routes = {
  "/api/overview": (url) => {
    const r = range(url);
    const entries = logEntries();
    return {
      range: r,
      ...overview(entries, r),
      severity: severityBreakdown(entries, r),
      topEvents: topEvents(entries, r),
      components: byComponent(entries, r),
      alerts: evaluateAlerts(entries, r).slice(0, 5)
    };
  },

  "/api/logs": (url) => {
    const r = range(url);
    const entries = logEntries();
    const windowed = entries.filter((e) => {
      const t = Date.parse(e.timestamp);
      return t >= r.fromMs && t <= r.toMs;
    });
    const filtered = filterLogs(windowed, url);
    const limit = Number(url.searchParams.get("limit") ?? 150);

    return {
      range: r,
      total: filtered.length,
      entries: filtered.slice(0, limit),
      timeline: overview(filtered, r).timeline,
      facets: {
        components: [...new Set(windowed.map((e) => e.component))].sort(),
        events: [...new Set(windowed.map((e) => e.event))].sort(),
        severities: ["INFO", "WARNING", "ERROR"]
      }
    };
  },

  "/api/performance": (url) => {
    const r = range(url);
    return { range: r, ...performance(logEntries(), r) };
  },

  "/api/resources": (url) => {
    const r = range(url);
    const series = resourceSeries().filter((p) => {
      const t = Date.parse(p.timestamp);
      return t >= r.fromMs && t <= r.toMs;
    });
    const latest = series.at(-1) ?? {};
    return {
      range: r,
      latest,
      series,
      peaks: {
        cpuPercent: Math.max(...series.map((p) => p.cpuPercent)),
        memoryMb: Math.max(...series.map((p) => p.memoryMb)),
        dbConnections: Math.max(...series.map((p) => p.dbConnections)),
        instanceCount: Math.max(...series.map((p) => p.instanceCount))
      }
    };
  },

  "/api/cost": () => {
    const rows = costRows();
    const cost = costSummary(rows);
    return {
      cost,
      recommendations: recommendations(cost, resourceSeries(), logEntries()),
      // Stated plainly so nobody mistakes sample figures for real spend.
      provenance: {
        source: "sample",
        note: "Schema-accurate sample in the Cloud Billing BigQuery export shape. Swaps to live data when the export is enabled; no code change required.",
        schema: "date · service.description · sku.description · cost · currency"
      }
    };
  },

  "/api/alerts": (url) => {
    const r = range(url);
    const alerts = evaluateAlerts(logEntries(), r);
    return {
      range: r,
      active: alerts.filter((a) => a.active),
      recent: alerts.filter((a) => !a.active),
      total: alerts.length
    };
  },

  "/api/meta": () => ({
    source: process.env.VANTAGE_SOURCE ?? "sample",
    generatedAt: new Date().toISOString(),
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

    // Serve the built SPA when it exists; fall back to index.html for client routes.
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
