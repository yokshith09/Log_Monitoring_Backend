/**
 * The API contract.
 *
 * Previously every page called `useApi<any>`, so the backend shape and the
 * frontend's expectations could drift apart silently — a rename on the server
 * produced `undefined` in the UI with no error anywhere. These interfaces are
 * the agreed shape of each endpoint; `api/server.js` must match them.
 *
 * The API is plain JavaScript, so this is a hand-maintained contract rather
 * than a generated one. Keep it in step when an endpoint changes.
 */

export type Severity = "INFO" | "WARNING" | "ERROR";
export type Grade = "healthy" | "watch" | "degraded" | "critical" | "nodata" | "sparse";
export type Priority = "critical" | "high" | "medium" | "low";

export interface LogEntry {
  timestamp: string;
  severity: Severity;
  event: string;
  component: string;
  entryPoint: string;
  requestId: string;
  route: string;
  statusCode: number;
  responseTimeMs: number;
  environment: string;
  message: string;
  connectionId: string;
  provider: string;
}

export interface Range {
  fromMs: number;
  toMs: number;
  bucketMs: number;
  hours: number;
  spanMs: number;
}

export interface Freshness {
  operational: { lastEntry: string; cadence: string; lagSeconds: number };
  billing: { lastExport: string; cadence: string; note: string };
}

export interface HealthMetrics {
  requests: number;
  requestsPerMinute: number;
  errors: number;
  warnings: number;
  clientErrors: number;
  serverErrors: number;
  clientErrorRate: number;
  serverErrorRate: number;
  errorRate: number;
  availability: number;
  apdex: number;
  p50: number;
  p95: number;
  p99: number;
  slowRequests: number;
  uniqueRoutes: number;
  uniqueServices: number;
  grade: Grade;
}

export interface ServiceHealth {
  name: string;
  requests: number;
  requestsPerMinute: number;
  errors: number;
  warnings: number;
  serverErrors: number;
  clientErrors: number;
  errorRate: number;
  availability: number;
  p50: number;
  p95: number;
  p99: number;
  apdex: number;
  topFailure: string | null;
  topFailureCount: number;
  routes: string[];
  sparkline: number[];
  grade: Grade;
}

/** One thing that needs a person, with the first step to take. */
export interface Action {
  id: string;
  kind: "alert" | "service" | "system";
  priority: Priority;
  active: boolean;
  title: string;
  detail: string;
  why: string;
  firstStep: string;
  verify: string | null;
  affected: string[];
  count: number;
  lastSeen: number;
  link: { page: string; params: Record<string, string> };
}

export interface SectionSummary {
  count: number;
  worst: Priority | null;
  text: string;
}

export interface Alert {
  ruleId: string;
  title: string;
  severity: "critical" | "serious" | "warning";
  firstSeen: number;
  lastSeen: number;
  occurrences: number;
  peak: number;
  count: number;
  description: string;
  active: boolean;
  windowMinutes: number;
  filter: Record<string, string | number>;
  remediation?: {
    likelyCause: string;
    actions: string[];
    verify: string;
  } | null;
  correlation?: {
    requests: number;
    errorRate: number;
    p95: number;
    peakCpu: number | null;
    peakConnections: number | null;
    affectedServices: string[];
    topEvents: { event: string; count: number }[];
  };
}

export interface TimelinePoint {
  t: number;
  total: number;
  INFO: number;
  WARNING: number;
  ERROR: number;
  errorRate: number;
  p95: number;
}

export interface OverviewResponse {
  range: Range;
  scope: { kind: string; label: string; ids: string[] };
  source: { id: string; label: string; live: boolean };
  freshness: Freshness;
  health: HealthMetrics;
  deltas: { requests: number; errorRate: number; p95: number };
  sparkline: number[];
  timeline: TimelinePoint[];
  severity: { severity: Severity; count: number }[];
  status: { family: string; label: string; count: number; share: number }[];
  topEvents: { event: string; component: string; severity: Severity; count: number }[];
  services: ServiceHealth[];
  alerts: Alert[];
  activeAlertCount: number;
  incidents: Incident[];
  anomalies: Anomaly[];
  notifications: Notification[];
  patterns: LogPattern[];
  analysis: AnalysisMode;
  actions: Action[];
  actionCounts: { critical: number; high: number; total: number };
  summaries: { reliability: SectionSummary; services: SectionSummary };
  performance: { route: string; p95: number; count: number; errorRate: number }[];
  resourceLatest: {
    cpuPercent?: number;
    memoryMb?: number;
    instanceCount?: number;
    dbConnections?: number;
    eventLoopLagMs?: number;
  };
  byConnection: (Connection & { requests: number; errors: number; warnings: number })[];
}

export interface Connection {
  id: string;
  provider: string;
  name: string;
  account: string;
  accountLabel: string;
  region: string;
  environment: string;
  status: string;
  services: string[];
  connectedAt: string;
}

export interface LogsResponse {
  range: Range;
  freshness: Freshness;
  total: number;
  shown: number;
  entries: LogEntry[];
  timeline: TimelinePoint[];
  facets: {
    services: string[];
    events: string[];
    routes: string[];
    severities: Severity[];
    statusClasses: string[];
  };
}

export interface ServicesResponse {
  range: Range;
  freshness: Freshness;
  services: ServiceHealth[];
}

export interface AlertsResponse {
  range: Range;
  freshness: Freshness;
  active: Alert[];
  recent: Alert[];
  total: number;
  bySeverity: { severity: string; count: number }[];
}

export interface PerformanceResponse {
  range: Range;
  freshness: Freshness;
  health: HealthMetrics;
  latency: { t: number; p50: number; p95: number; p99: number }[];
  slowestRoutes: { route: string; count: number; p95: number; avg: number; errorRate: number }[];
  throughput: { t: number; requests: number; failures: number }[];
}

export interface ResourcesResponse {
  range: Range;
  freshness: Freshness;
  latest: Record<string, number>;
  series: {
    timestamp: string;
    cpuPercent: number;
    memoryMb: number;
    instanceCount: number;
    dbConnections: number;
    eventLoopLagMs: number;
  }[];
  peaks: Record<string, number>;
  means: Record<string, number>;
}

/* ------------------------------------------------------- analysis layer */

export interface LogPattern {
  pattern: string;
  count: number;
  share: number;
  severity: Severity;
  topService: string | null;
  topRoute: string | null;
  topStatus: number;
  concentration: number;
  services: string[];
  firstSeen: number;
  lastSeen: number;
  medianLatency: number;
  example: string;
  exampleRequestId: string;
}

export interface Anomaly {
  t: number;
  metric: string;
  label: string;
  value: number;
  baseline: number;
  z: number;
  direction: "spike" | "drop";
  multiple: number | null;
  buckets: number;
  durationMinutes: number;
  description: string;
}

export interface Cause {
  id: string;
  claim: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
  weight: number;
  link: { page: string; params: Record<string, string> };
}

export interface Episode {
  firstSeen: number;
  lastSeen: number;
  durationMinutes: number;
  peak: number;
  count: number;
  active: boolean;
  description: string;
}

export interface Incident {
  id: string;
  ruleId: string;
  title: string;
  severity: "critical" | "serious" | "warning";
  windowMinutes: number;
  episodes: Episode[];
  episodeCount: number;
  /** Minutes actually spent breaching — the sum of the episodes. */
  durationMinutes: number;
  /** Minutes from the first breach to the last, gaps included. */
  spanMinutes: number;
  firstSeen: number;
  lastSeen: number;
  count: number;
  peak: number;
  active: boolean;
  description: string;
  summary: string;
  causes: Cause[];
  patterns: LogPattern[];
  remediation: { likelyCause: string; actions: string[]; verify: string | null } | null;
  correlation: {
    requests: number;
    errorRate: number;
    p95: number;
    peakCpu: number | null;
    peakConnections: number | null;
    affectedServices: string[];
    topEvents: { event: string; count: number }[];
  };
}

export interface Notification {
  id: string;
  kind: "incident" | "anomaly" | "service" | "system";
  severity: "critical" | "warning" | "info";
  title: string;
  body: string;
  at: number;
  link: { page: string; params: Record<string, string> };
}

export interface AnalysisMode {
  engine: string;
  model: string | null;
  note: string;
}

export interface IncidentsResponse {
  range: Range;
  freshness: Freshness;
  analysis: AnalysisMode;
  active: Incident[];
  recent: Incident[];
  total: number;
  episodeTotal: number;
  bySeverity: { severity: string; count: number }[];
}

export interface InsightsResponse {
  range: Range;
  freshness: Freshness;
  analysis: AnalysisMode;
  patterns: LogPattern[];
  allPatterns: LogPattern[];
  anomalies: Anomaly[];
}

export interface NotificationsResponse {
  range: Range;
  notifications: Notification[];
}

export interface CostRecommendation {
  id: string;
  title: string;
  reason: string;
  impact: number;
  confidence: string;
  evidence: string[];
  action: string;
}

export interface CostResponse {
  freshness: Freshness;
  cost: {
    days: number;
    total: number;
    dailyMean: number;
    projectedMonthly: number;
    costPerThousandRequests: number;
    trend: { date: string; cost: number }[];
    byService: { service: string; cost: number }[];
    bySku: { sku: string; cost: number }[];
    anomalies: { date: string; cost: number; multiple: number }[];
  };
  recommendations: CostRecommendation[];
  provenance: { source: string; note: string; schema: string };
}
