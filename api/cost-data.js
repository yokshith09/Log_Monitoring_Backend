import { CONNECTIONS } from "./connections.js";

/**
 * Cost rows per connection, in each provider's own billing-export shape.
 *
 * GCP exports service.description / sku.description via BigQuery; Azure Cost
 * Management uses meterCategory / meterName. Both normalize to the same
 * { date, service, sku, cost, currency } row, which is all the cost view reads —
 * so a third provider is a table entry, not a rewrite.
 */

const CATALOG = {
  gcp: [
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
  ],
  azure: [
    { service: "App Service", sku: "P1v3 App Service Hours", base: 0.74, variance: 0.12 },
    { service: "App Service", sku: "Data Transfer Out", base: 0.08, variance: 0.04 },
    { service: "Azure SQL", sku: "vCore General Purpose", base: 0.96, variance: 0.06 },
    { service: "Azure SQL", sku: "Storage - Premium SSD", base: 0.19, variance: 0.02 },
    { service: "Azure Monitor", sku: "Log Analytics Data Ingestion", base: 0.21, variance: 0.14 },
    { service: "Service Bus", sku: "Standard Operations", base: 0.04, variance: 0.02 },
    { service: "Container Registry", sku: "Standard Registry Storage", base: 0.03, variance: 0.01 }
  ],
  aws: [
    { service: "ECS Fargate", sku: "vCPU Hours", base: 0.5, variance: 0.15 },
    { service: "RDS", sku: "db.t4g.medium Hours", base: 0.9, variance: 0.05 },
    { service: "CloudWatch", sku: "Log Ingestion", base: 0.16, variance: 0.1 }
  ]
};

function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function costRows({ days = 30 } = {}) {
  const end = Date.now();
  const random = mulberry32(777);
  const rows = [];

  for (const connection of CONNECTIONS) {
    const catalog = CATALOG[connection.provider] ?? [];
    // Non-production accounts cost materially less; flat sample data would hide
    // the single most common real finding — that staging is over-provisioned.
    const scale = connection.environment === "production" ? 1 : 0.35;

    for (let day = days - 1; day >= 0; day -= 1) {
      const date = new Date(end - day * 86_400_000).toISOString().slice(0, 10);

      for (const item of catalog) {
        // A deliberate compute anomaly three days ago on the primary production
        // account, sized to clear the 1.5x-of-mean rule rather than be diluted.
        const anomalous =
          day === 3 && connection.id === "gcp-prod" && item.service === "Cloud Run";

        rows.push({
          date,
          connectionId: connection.id,
          provider: connection.provider,
          account: connection.account,
          service: item.service,
          sku: item.sku,
          cost: Math.round((item.base + random() * item.variance) * scale * (anomalous ? 6.5 : 1) * 100) / 100,
          currency: "USD"
        });
      }
    }
  }

  return rows;
}
