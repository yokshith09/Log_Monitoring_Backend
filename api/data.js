/**
 * Sample telemetry in StaySync's exact log contract.
 *
 * Every record here has the same shape Cloud Run writes into Cloud Logging as
 * `jsonPayload`, and the same shape StaySync writes to stdout today:
 *
 *   { timestamp, severity, event, component, entryPoint, requestId,
 *     route, statusCode, responseTimeMs, environment, message }
 *
 * This module is the ONLY place sample data exists. Everything downstream —
 * aggregation, alerting, the UI — consumes the contract, not this file, so
 * swapping in the live collector is a one-module change.
 */

import { CONNECTIONS } from "./connections.js";

const HOURS = 24;
const now = () => Date.now();

/** Picks which connection a record belongs to, by configured weight. */
function pickConnection(random) {
  let roll = random();
  for (const connection of CONNECTIONS) {
    roll -= connection.weight;
    if (roll <= 0) return connection;
  }
  return CONNECTIONS[0];
}

/** StaySync's real event catalogue, with the weight each carries in normal traffic. */
const BASELINE = [
  { event: "product_catalog_listed", component: "catalog", route: "/api/products", status: 200, severity: "INFO", weight: 38, latency: [8, 90] },
  { event: "product_categories_listed", component: "catalog", route: "/api/categories", status: 200, severity: "INFO", weight: 10, latency: [5, 40] },
  { event: "auth_profile_viewed", component: "auth", route: "/api/auth/me", status: 200, severity: "INFO", weight: 12, latency: [4, 30] },
  { event: "order_history_retrieved", component: "orders", route: "/api/orders/my", status: 200, severity: "INFO", weight: 8, latency: [12, 70] },
  { event: "order_created", component: "orders", route: "/api/orders", status: 201, severity: "INFO", weight: 9, latency: [30, 180] },
  { event: "payment_approved", component: "payments", route: "/api/payments", status: 201, severity: "INFO", weight: 7, latency: [40, 220] },
  { event: "auth_login_success", component: "auth", route: "/api/auth/login", status: 200, severity: "INFO", weight: 5, latency: [60, 190] },
  { event: "order_viewed", component: "orders", route: "/api/orders/:id", status: 200, severity: "INFO", weight: 4, latency: [10, 60] },
  { event: "orders_listed", component: "operations", route: "/api/orders", status: 200, severity: "INFO", weight: 3, latency: [20, 110] },
  { event: "order_fulfilled", component: "operations", route: "/api/orders/:id/fulfil", status: 200, severity: "INFO", weight: 2, latency: [25, 95] },
  { event: "health_checked", component: "platform", route: "/health", status: 200, severity: "INFO", weight: 6, latency: [2, 25] },
  { event: "auth_login_failed", component: "auth", route: "/api/auth/login", status: 401, severity: "WARNING", weight: 3, latency: [55, 170] },
  { event: "order_stock_conflict", component: "orders", route: "/api/orders", status: 409, severity: "WARNING", weight: 2, latency: [15, 80] },
  { event: "order_invalid", component: "orders", route: "/api/orders", status: 422, severity: "WARNING", weight: 2, latency: [3, 20] },
  { event: "auth_unauthorized_access", component: "operations", route: "/api/orders", status: 403, severity: "WARNING", weight: 2, latency: [3, 18] },
  { event: "route_not_found", component: "platform", route: "/api/unknown", status: 404, severity: "WARNING", weight: 1, latency: [1, 10] },
  { event: "payment_provider_rejected", component: "payments", route: "/api/payments", status: 502, severity: "ERROR", weight: 1, latency: [120, 400] }
];

/**
 * Deliberate incidents, so trends, correlations and alerts have something real
 * to bite on. Each mirrors a scenario the Scenario Lab can actually trigger.
 */
const INCIDENTS = [
  {
    name: "Checkout 5xx surge (ongoing)",
    startHoursAgo: 0.5,
    ongoing: true,
    burst: { event: "order_create_failed", component: "orders", route: "/api/orders", status: 500, severity: "ERROR", latency: [120, 700] },
    perMinute: 1
  },
  {
    name: "Payment provider outage",
    startHoursAgo: 4.5,
    durationMinutes: 35,
    burst: { event: "payment_provider_rejected", component: "payments", route: "/api/payments", status: 502, severity: "ERROR", latency: [200, 900] },
    perMinute: 9
  },
  {
    name: "Latency degradation",
    startHoursAgo: 9,
    durationMinutes: 50,
    burst: { event: "payment_slow", component: "payments", route: "/api/payments", status: 201, severity: "WARNING", latency: [700, 2400] },
    perMinute: 5
  },
  {
    name: "Credential stuffing attempt",
    startHoursAgo: 2,
    durationMinutes: 12,
    burst: { event: "auth_rate_limited", component: "auth", route: "/api/auth/login", status: 429, severity: "WARNING", latency: [2, 12] },
    perMinute: 14
  },
  {
    name: "Database unreachable",
    startHoursAgo: 15,
    durationMinutes: 18,
    burst: { event: "database_timeout", component: "catalog", route: "/api/products", status: 503, severity: "ERROR", latency: [1500, 3000] },
    perMinute: 7
  },
  {
    name: "Flash sale stock contention",
    startHoursAgo: 6.5,
    durationMinutes: 25,
    burst: { event: "order_stock_conflict", component: "orders", route: "/api/orders", status: 409, severity: "WARNING", latency: [20, 140] },
    perMinute: 11
  }
];

// Deterministic PRNG, so the dashboard shows the same picture on every reload.
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261002);
const between = ([lo, hi]) => Math.round(lo + rand() * (hi - lo));
const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (rand() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const MESSAGES = {
  payment_provider_rejected: "Simulated provider rejected the payment",
  payment_slow: "Payment approved above the demo latency threshold",
  auth_rate_limited: "Sign-in refused: too many failed attempts for this account",
  database_timeout: "Simulated database timeout while listing products",
  order_stock_conflict: "Concurrent stock contention prevented this order"
};

function makeEntry(spec, timestamp, connection = pickConnection(rand)) {
  return {
    timestamp: new Date(timestamp).toISOString(),
    // Numeric copy so windowing never re-parses the ISO string. The
    // alert engine slides thousands of windows; Date.parse there was
    // ~30M calls per request.
    t: timestamp,
    connectionId: connection.id,
    provider: connection.provider,
    severity: spec.severity,
    event: spec.event,
    component: spec.component,
    entryPoint: "http",
    requestId: uuid(),
    route: spec.route,
    statusCode: spec.status,
    responseTimeMs: between(spec.latency),
    environment: connection.environment,
    message: MESSAGES[spec.event] ?? `${spec.event.replace(/_/g, " ")}`
  };
}

/** Traffic follows a daily curve, so the charts look like a real service. */
function trafficMultiplier(hourOfDay) {
  const peak = 14;
  const distance = Math.min(Math.abs(hourOfDay - peak), 24 - Math.abs(hourOfDay - peak));
  return 0.35 + 0.65 * Math.cos((distance / 12) * Math.PI * 0.5) ** 2;
}

let cache = null;
/** Minute boundary up to which baseline traffic has been generated. */
let generatedThrough = 0;

const TOTAL_WEIGHT = BASELINE.reduce((sum, s) => sum + s.weight, 0);

const ONGOING = INCIDENTS.filter((i) => i.ongoing);
/** When each ongoing incident started, fixed at module load so it is stable. */
const ONGOING_FROM = new Map(ONGOING.map((i) => [i, now() - i.startHoursAgo * 3600_000]));

/** One minute of traffic at `at`: baseline, plus any ongoing incident's burst. */
function baselineMinute(at) {
  const volume = Math.max(1, Math.round(14 * trafficMultiplier(new Date(at).getHours())));
  const out = [];
  for (let i = 0; i < volume; i += 1) {
    let pick = rand() * TOTAL_WEIGHT;
    const spec = BASELINE.find((s) => (pick -= s.weight) <= 0) ?? BASELINE[0];
    out.push(makeEntry(spec, at + Math.floor(rand() * 60_000)));
  }

  for (const incident of ONGOING) {
    if (at < ONGOING_FROM.get(incident)) continue;
    const count = Math.max(1, Math.round(incident.perMinute * (0.6 + rand() * 0.8)));
    for (let i = 0; i < count; i += 1) out.push(makeEntry(incident.burst, at + Math.floor(rand() * 60_000)));
  }
  return out;
}

/**
 * All log entries for the window, newest first.
 *
 * The 24h corpus is generated once, then extended a minute at a time as real
 * time passes. Without that the newest record ages with the process and the
 * short windows — 1m especially — go permanently empty a minute after start,
 * which is exactly the view that is supposed to move.
 */
export function logEntries() {
  if (cache) return extend();

  const end = now();
  const start = end - HOURS * 3600_000;
  const entries = [];

  for (let minute = 0; minute < HOURS * 60; minute += 1) {
    entries.push(...baselineMinute(start + minute * 60_000));
  }
  generatedThrough = start + HOURS * 60 * 60_000;

  for (const incident of INCIDENTS) {
    if (incident.ongoing) continue;
    const from = end - incident.startHoursAgo * 3600_000;
    for (let minute = 0; minute < incident.durationMinutes; minute += 1) {
      const count = Math.max(1, Math.round(incident.perMinute * (0.6 + rand() * 0.8)));
      for (let i = 0; i < count; i += 1) {
        entries.push(makeEntry(incident.burst, from + minute * 60_000 + Math.floor(rand() * 60_000)));
      }
    }
  }

  cache = entries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  return cache;
}

/**
 * Appends whole minutes elapsed since the last call, and drops anything that
 * has fallen out of the 24h window.
 *
 * Returns a NEW array whenever something changed: analytics memoises its sorted
 * copy in a WeakMap keyed on this array, so mutating it in place would serve a
 * stale sort.
 */
function extend() {
  const end = now();
  if (end - generatedThrough < 60_000) return cache;

  const fresh = [];
  while (generatedThrough + 60_000 <= end) {
    fresh.push(...baselineMinute(generatedThrough));
    generatedThrough += 60_000;
  }

  const cutoff = end - HOURS * 3600_000;
  fresh.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  cache = [...fresh, ...cache].filter((e) => (e.t ?? Date.parse(e.timestamp)) >= cutoff);
  return cache;
}

/**
 * Resource metrics. On GCP these come from Cloud Monitoring; locally they are
 * the Node process's own counters. Shape is identical either way.
 */
export function resourceSeries(connectionId = null) {
  const end = now();
  const points = [];
  const series = mulberry32(99);

  for (let minute = HOURS * 60; minute >= 0; minute -= 5) {
    const at = end - minute * 60_000;
    const hourOfDay = new Date(at).getHours();
    const load = trafficMultiplier(hourOfDay);
    const incidentNear = INCIDENTS.some((inc) => {
      const from = end - inc.startHoursAgo * 3600_000;
      return at >= from && at <= from + inc.durationMinutes * 60_000;
    });
    const spike = incidentNear ? 1.6 : 1;

    points.push({
      timestamp: new Date(at).toISOString(),
      connectionId: connectionId ?? CONNECTIONS[0].id,
      cpuPercent: Math.min(98, Math.round((18 + load * 42 * spike + series() * 9) * 10) / 10),
      memoryMb: Math.round(180 + load * 120 * spike + series() * 25),
      instanceCount: Math.max(1, Math.round(load * 3 * spike)),
      dbConnections: Math.max(1, Math.round(2 + load * 9 * spike + series() * 2)),
      eventLoopLagMs: Math.round((1 + load * 6 * spike + series() * 3) * 10) / 10
    });
  }
  return points;
}
