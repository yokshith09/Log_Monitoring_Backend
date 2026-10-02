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

const HOURS = 24;
const now = () => Date.now();

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

function makeEntry(spec, timestamp) {
  return {
    timestamp: new Date(timestamp).toISOString(),
    severity: spec.severity,
    event: spec.event,
    component: spec.component,
    entryPoint: "http",
    requestId: uuid(),
    route: spec.route,
    statusCode: spec.status,
    responseTimeMs: between(spec.latency),
    environment: "production",
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

/** All log entries for the window, newest first. */
export function logEntries() {
  if (cache) return cache;

  const end = now();
  const start = end - HOURS * 3600_000;
  const entries = [];
  const totalWeight = BASELINE.reduce((sum, s) => sum + s.weight, 0);

  for (let minute = 0; minute < HOURS * 60; minute += 1) {
    const at = start + minute * 60_000;
    const hourOfDay = new Date(at).getHours();
    const volume = Math.max(1, Math.round(14 * trafficMultiplier(hourOfDay)));

    for (let i = 0; i < volume; i += 1) {
      let pick = rand() * totalWeight;
      const spec = BASELINE.find((s) => (pick -= s.weight) <= 0) ?? BASELINE[0];
      entries.push(makeEntry(spec, at + Math.floor(rand() * 60_000)));
    }
  }

  for (const incident of INCIDENTS) {
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
 * Resource metrics. On GCP these come from Cloud Monitoring; locally they are
 * the Node process's own counters. Shape is identical either way.
 */
export function resourceSeries() {
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
      cpuPercent: Math.min(98, Math.round((18 + load * 42 * spike + series() * 9) * 10) / 10),
      memoryMb: Math.round(180 + load * 120 * spike + series() * 25),
      instanceCount: Math.max(1, Math.round(load * 3 * spike)),
      dbConnections: Math.max(1, Math.round(2 + load * 9 * spike + series() * 2)),
      eventLoopLagMs: Math.round((1 + load * 6 * spike + series() * 3) * 10) / 10
    });
  }
  return points;
}

/**
 * Cost rows in the shape of the Cloud Billing BigQuery export
 * (service.description, sku.description, cost, usage). Sample until the export
 * is enabled — the cost view reads this contract, not this file.
 */
export function costRows() {
  const days = 30;
  const end = now();
  const services = [
    { service: "Cloud Run", sku: "CPU Allocation Time", base: 0.42, variance: 0.18 },
    { service: "Cloud Run", sku: "Memory Allocation Time", base: 0.21, variance: 0.08 },
    { service: "Cloud Run", sku: "Requests", base: 0.06, variance: 0.03 },
    { service: "Cloud SQL", sku: "DB custom instance core running", base: 1.12, variance: 0.05 },
    { service: "Cloud SQL", sku: "DB custom instance RAM running", base: 0.68, variance: 0.04 },
    { service: "Cloud SQL", sku: "Storage PD SSD", base: 0.17, variance: 0.01 },
    { service: "Cloud Logging", sku: "Log Volume", base: 0.14, variance: 0.11 },
    { service: "Artifact Registry", sku: "Container Storage", base: 0.03, variance: 0.01 },
    { service: "Cloud Build", sku: "Build Time", base: 0.05, variance: 0.05 },
    { service: "Pub/Sub", sku: "Message Delivery", base: 0.02, variance: 0.02 },
    { service: "BigQuery", sku: "Analysis", base: 0.04, variance: 0.03 }
  ];

  const costRand = mulberry32(777);
  const rows = [];

  for (let day = days - 1; day >= 0; day -= 1) {
    const date = new Date(end - day * 86_400_000).toISOString().slice(0, 10);
    for (const s of services) {
      // A deliberate Cloud Run cost anomaly three days ago, sized so the daily
      // total clears the 1.5x-of-mean rule rather than being diluted by it.
      const anomaly = day === 3 && s.service === "Cloud Run" ? 6.5 : 1;
      rows.push({
        date,
        service: s.service,
        sku: s.sku,
        cost: Math.round((s.base + costRand() * s.variance) * anomaly * 100) / 100,
        currency: "USD"
      });
    }
  }
  return rows;
}
