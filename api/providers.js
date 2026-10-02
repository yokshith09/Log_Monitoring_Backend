/**
 * Cloud provider registry.
 *
 * Vantage is provider-agnostic: every provider maps its own telemetry into one
 * normalized record shape, and the rest of the platform — aggregation, alerting,
 * the whole UI — only ever sees that shape.
 *
 * THE NORMALIZED CONTRACT (what everything downstream consumes):
 *   timestamp      ISO-8601
 *   severity       INFO | WARNING | ERROR
 *   event          stable machine name for the thing that happened
 *   component      the service/workload that emitted it
 *   route          endpoint or operation
 *   statusCode     HTTP-equivalent status
 *   responseTimeMs latency
 *   requestId      correlation id
 *   environment    production | staging | ...
 *   message        human-readable summary
 *   connectionId   which configured account this came from   <- added for multi-cloud
 *   provider       gcp | azure | aws | ...                    <- added for multi-cloud
 *
 * TO ADD A PROVIDER: append an entry below. It declares how to reach the
 * provider, how its severities map onto ours, and which of its fields carry our
 * fields. Nothing else in the codebase needs to change.
 */

/** Severity vocabularies differ per cloud; all collapse to three levels. */
const GCP_SEVERITY = {
  DEFAULT: "INFO",
  DEBUG: "INFO",
  INFO: "INFO",
  NOTICE: "INFO",
  WARNING: "WARNING",
  ERROR: "ERROR",
  CRITICAL: "ERROR",
  ALERT: "ERROR",
  EMERGENCY: "ERROR"
};

/** Azure Monitor uses numeric levels, 0 most severe. */
const AZURE_SEVERITY = {
  0: "ERROR", // Critical
  1: "ERROR", // Error
  2: "WARNING", // Warning
  3: "INFO", // Informational
  4: "INFO" // Verbose
};

/** CloudWatch has no native severity field; it is derived from the payload. */
const AWS_SEVERITY = {
  FATAL: "ERROR",
  ERROR: "ERROR",
  WARN: "WARNING",
  WARNING: "WARNING",
  INFO: "INFO",
  DEBUG: "INFO",
  TRACE: "INFO"
};

export const PROVIDERS = {
  gcp: {
    id: "gcp",
    name: "Google Cloud",
    shortName: "GCP",
    // The unit a connection scopes to. Each cloud names this differently and
    // the UI uses the provider's own word rather than a generic one.
    accountLabel: "Project",
    accountHint: "Project ID, e.g. staysync-prod",
    status: "available",
    capabilities: { logs: true, metrics: true, cost: true, recommendations: true },
    services: {
      logs: "Cloud Logging",
      metrics: "Cloud Monitoring",
      cost: "Cloud Billing export to BigQuery",
      recommendations: "Recommender / Active Assist"
    },
    credentials: [
      { key: "projectId", label: "Project ID", required: true },
      { key: "serviceAccountKey", label: "Service account JSON key", required: true, secret: true },
      { key: "billingDataset", label: "BigQuery billing dataset", required: false }
    ],
    requiredRoles: ["roles/logging.viewer", "roles/monitoring.viewer", "roles/bigquery.dataViewer"],
    severityMap: GCP_SEVERITY,
    // Where our normalized fields live in this provider's payload.
    fieldMap: {
      timestamp: "timestamp",
      severity: "severity",
      component: "resource.labels.service_name",
      route: "jsonPayload.route",
      statusCode: "httpRequest.status",
      responseTimeMs: "jsonPayload.responseTimeMs",
      requestId: "jsonPayload.requestId",
      event: "jsonPayload.event",
      message: "jsonPayload.message"
    },
    queryLanguage: "Logging query language",
    exampleQuery: 'resource.type="cloud_run_revision" AND jsonPayload.event="payment_provider_rejected"'
  },

  azure: {
    id: "azure",
    name: "Microsoft Azure",
    shortName: "Azure",
    accountLabel: "Subscription",
    accountHint: "Subscription ID and resource group",
    status: "available",
    capabilities: { logs: true, metrics: true, cost: true, recommendations: true },
    services: {
      logs: "Azure Monitor Logs (Log Analytics)",
      metrics: "Azure Monitor Metrics",
      cost: "Cost Management + Billing",
      recommendations: "Azure Advisor"
    },
    credentials: [
      { key: "subscriptionId", label: "Subscription ID", required: true },
      { key: "tenantId", label: "Tenant ID", required: true },
      { key: "clientId", label: "Application (client) ID", required: true },
      { key: "clientSecret", label: "Client secret", required: true, secret: true },
      { key: "workspaceId", label: "Log Analytics workspace ID", required: true }
    ],
    requiredRoles: ["Monitoring Reader", "Cost Management Reader"],
    severityMap: AZURE_SEVERITY,
    fieldMap: {
      timestamp: "TimeGenerated",
      severity: "Level",
      component: "AppRoleName",
      route: "Url",
      statusCode: "ResultCode",
      responseTimeMs: "DurationMs",
      requestId: "OperationId",
      event: "Name",
      message: "Message"
    },
    queryLanguage: "KQL",
    exampleQuery: 'AppRequests | where ResultCode >= 500 | summarize count() by AppRoleName'
  },

  aws: {
    id: "aws",
    name: "Amazon Web Services",
    shortName: "AWS",
    accountLabel: "Account",
    accountHint: "Account ID and region",
    // Declared but not yet wired — the UI shows it as coming soon rather than
    // pretending it works.
    status: "planned",
    capabilities: { logs: true, metrics: true, cost: true, recommendations: false },
    services: {
      logs: "CloudWatch Logs",
      metrics: "CloudWatch Metrics",
      cost: "Cost Explorer / CUR",
      recommendations: "Trusted Advisor"
    },
    credentials: [
      { key: "accountId", label: "Account ID", required: true },
      { key: "region", label: "Default region", required: true },
      { key: "roleArn", label: "Cross-account role ARN", required: true },
      { key: "externalId", label: "External ID", required: false, secret: true }
    ],
    requiredRoles: ["CloudWatchLogsReadOnlyAccess", "CloudWatchReadOnlyAccess", "ce:GetCostAndUsage"],
    severityMap: AWS_SEVERITY,
    fieldMap: {
      timestamp: "timestamp",
      severity: "level",
      component: "logStream",
      route: "path",
      statusCode: "status",
      responseTimeMs: "durationMs",
      requestId: "requestId",
      event: "event",
      message: "message"
    },
    queryLanguage: "CloudWatch Logs Insights",
    exampleQuery: "fields @timestamp, event | filter status >= 500 | stats count() by component"
  }
};

export const providerList = () => Object.values(PROVIDERS);

export const getProvider = (id) => PROVIDERS[id] ?? null;

/** Reads a dotted path out of a provider's raw payload. */
const dig = (object, path) => path.split(".").reduce((value, key) => value?.[key], object);

/**
 * Maps one raw provider record into the normalized contract.
 *
 * This is the single seam every provider passes through. Today the sample
 * source already emits normalized records, so this runs when a live adapter is
 * wired; the mapping tables above are what make that a configuration change
 * rather than a rewrite.
 */
export function normalize(raw, { providerId, connectionId }) {
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`Unknown provider: ${providerId}`);

  const { fieldMap, severityMap } = provider;
  const rawSeverity = dig(raw, fieldMap.severity);

  return {
    timestamp: new Date(dig(raw, fieldMap.timestamp)).toISOString(),
    severity: severityMap[rawSeverity] ?? "INFO",
    event: dig(raw, fieldMap.event) ?? "unknown_event",
    component: dig(raw, fieldMap.component) ?? "unknown",
    route: dig(raw, fieldMap.route) ?? "/",
    statusCode: Number(dig(raw, fieldMap.statusCode) ?? 200),
    responseTimeMs: Number(dig(raw, fieldMap.responseTimeMs) ?? 0),
    requestId: dig(raw, fieldMap.requestId) ?? null,
    message: dig(raw, fieldMap.message) ?? "",
    environment: raw.environment ?? "production",
    entryPoint: raw.entryPoint ?? "http",
    connectionId,
    provider: providerId
  };
}
