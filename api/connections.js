/**
 * Configured cloud connections.
 *
 * A connection is one account/project/subscription on one provider. Several
 * connections may belong to the same provider — the point of the model is that
 * a team monitoring three GCP projects and one Azure subscription sees them in
 * one place, and can scope any view to all, to a provider, or to one account.
 *
 * Secrets are intentionally absent here. In a deployment these live in a secret
 * manager and are referenced by `credentialRef`; nothing credential-bearing is
 * ever sent to the browser.
 */

export const CONNECTIONS = [
  {
    id: "gcp-prod",
    provider: "gcp",
    name: "StaySync Production",
    account: "staysync-prod",
    accountLabel: "Project",
    region: "asia-south1",
    environment: "production",
    status: "connected",
    credentialRef: "secret://vantage/gcp-prod",
    // Share of total telemetry this connection contributes in the sample source.
    weight: 0.62,
    services: ["Cloud Run", "Cloud SQL", "Pub/Sub", "Cloud Logging"],
    connectedAt: "2026-09-12T08:00:00.000Z"
  },
  {
    id: "gcp-staging",
    provider: "gcp",
    name: "StaySync Staging",
    account: "staysync-staging",
    accountLabel: "Project",
    region: "asia-south1",
    environment: "staging",
    status: "connected",
    credentialRef: "secret://vantage/gcp-staging",
    weight: 0.14,
    services: ["Cloud Run", "Cloud SQL"],
    connectedAt: "2026-09-12T08:10:00.000Z"
  },
  {
    id: "azure-prod",
    provider: "azure",
    name: "Checkout Services (EU)",
    account: "sub-7f2a-checkout",
    accountLabel: "Subscription",
    region: "westeurope",
    environment: "production",
    status: "connected",
    credentialRef: "secret://vantage/azure-prod",
    weight: 0.24,
    services: ["App Service", "Azure SQL", "Service Bus"],
    connectedAt: "2026-09-20T11:30:00.000Z"
  }
];

export const listConnections = () => CONNECTIONS.map(({ credentialRef, weight, ...rest }) => rest);

export const getConnection = (id) => CONNECTIONS.find((c) => c.id === id) ?? null;

/**
 * Resolves a scope string into the set of connection ids it covers.
 * Accepts "all", a provider id ("gcp"), or a connection id ("gcp-prod").
 */
export function resolveScope(scope) {
  if (!scope || scope === "all") {
    return { kind: "all", label: "All connections", ids: CONNECTIONS.map((c) => c.id) };
  }

  const connection = getConnection(scope);
  if (connection) {
    return { kind: "connection", label: connection.name, ids: [connection.id], connection };
  }

  const ofProvider = CONNECTIONS.filter((c) => c.provider === scope);
  if (ofProvider.length > 0) {
    return { kind: "provider", label: scope, ids: ofProvider.map((c) => c.id), provider: scope };
  }

  return { kind: "all", label: "All connections", ids: CONNECTIONS.map((c) => c.id) };
}

/** Narrows any record set carrying `connectionId` to the active scope. */
export const applyScope = (records, scope) => {
  const resolved = resolveScope(scope);
  if (resolved.kind === "all") return records;
  const allowed = new Set(resolved.ids);
  return records.filter((r) => allowed.has(r.connectionId));
};
