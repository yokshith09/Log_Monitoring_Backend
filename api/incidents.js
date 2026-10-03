/**
 * Incidents — §14's alert model, grouped the way an on-call person thinks.
 *
 * A threshold rule re-evaluates every step of the window, so one bad afternoon
 * produces dozens of breach records. Showing those raw is the alert fatigue
 * §20 names as a risk: the reader scrolls past forty rows that are all the same
 * problem and stops reading the list.
 *
 * So: one INCIDENT per rule, holding every EPISODE of it. The incident carries
 * the summary, the cause analysis and the fix; the episodes stay available
 * underneath as evidence of how often and for how long.
 */

import { correlate, REMEDIATION } from "./insights.js";
import { logPatterns, rootCause, summarizeIncident } from "./ai.js";

const SEVERITY_RANK = { critical: 0, serious: 1, warning: 2 };

/**
 * Folds alert episodes into incidents.
 *
 * `alerts` are the raw breach records from evaluateAlerts — each one a
 * contiguous stretch during which a rule was breaching.
 */
export function buildIncidents(alerts, { entries, resources }) {
  const byRule = new Map();

  for (const alert of alerts) {
    let incident = byRule.get(alert.ruleId);
    if (!incident) {
      incident = {
        id: alert.ruleId,
        ruleId: alert.ruleId,
        title: alert.title,
        severity: alert.severity,
        windowMinutes: alert.windowMinutes,
        filter: alert.filter,
        episodes: [],
        firstSeen: alert.firstSeen,
        lastSeen: alert.lastSeen,
        count: 0,
        peak: 0,
        active: false
      };
      byRule.set(alert.ruleId, incident);
    }

    incident.episodes.push({
      firstSeen: alert.firstSeen,
      lastSeen: alert.lastSeen,
      durationMinutes: Math.max(1, Math.round((alert.lastSeen - alert.firstSeen) / 60_000)),
      peak: alert.peak,
      count: alert.count,
      active: Boolean(alert.active),
      description: alert.description
    });

    incident.firstSeen = Math.min(incident.firstSeen, alert.firstSeen);
    incident.lastSeen = Math.max(incident.lastSeen, alert.lastSeen);
    incident.count += alert.count;
    incident.peak = Math.max(incident.peak, alert.peak);
    incident.active = incident.active || Boolean(alert.active);
    // The worst severity any episode reached is the incident's severity.
    if (SEVERITY_RANK[alert.severity] < SEVERITY_RANK[incident.severity]) incident.severity = alert.severity;
  }

  return [...byRule.values()]
    .map((incident) => {
      incident.episodes.sort((a, b) => b.lastSeen - a.lastSeen);
      const latest = incident.episodes[0];

      const correlation = correlate(entries, resources, {
        fromMs: incident.firstSeen,
        toMs: incident.lastSeen
      });

      const window = entries.filter((e) => {
        const t = e.t ?? Date.parse(e.timestamp);
        return t >= incident.firstSeen && t <= incident.lastSeen;
      });
      const patterns = logPatterns(window, { limit: 4, minCount: 2 });
      const causes = rootCause({ ...incident, episodes: incident.episodes.length }, { entries, resources, patterns });

      const enriched = {
        ...incident,
        episodeCount: incident.episodes.length,
        // Time actually spent breaching, not the span from first to last.
        // Three 10-minute episodes across an afternoon is 30 minutes of
        // breaching, not 290 — and reporting the span makes a recurring blip
        // read as a five-hour outage.
        durationMinutes: incident.episodes.reduce((sum, e) => sum + e.durationMinutes, 0),
        spanMinutes: Math.max(1, Math.round((incident.lastSeen - incident.firstSeen) / 60_000)),
        description: latest.description,
        remediation: REMEDIATION[incident.ruleId] ?? null,
        correlation,
        patterns,
        causes
      };

      enriched.summary = summarizeIncident(
        { ...enriched, episodes: enriched.episodeCount, describePeak: latest.description },
        { causes, correlation }
      );
      return enriched;
    })
    .sort((a, b) => {
      // Firing now outranks everything; then severity; then recency.
      if (a.active !== b.active) return a.active ? -1 : 1;
      const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
      if (bySeverity !== 0) return bySeverity;
      return b.lastSeen - a.lastSeen;
    });
}

/* ------------------------------------------------------------ notifications */

/**
 * The notification feed.
 *
 * What a person needs to be told about without going looking: an incident that
 * is breaching, an anomaly nothing has a rule for yet, and a service that has
 * quietly degraded without tripping anything.
 *
 * Each notification carries a STABLE id, so the browser can tell a genuinely
 * new notification from one it has already shown. Without that, every poll
 * would re-announce the same five things.
 */
export function buildNotifications({ incidents, anomalies, services, health }) {
  const notifications = [];

  for (const incident of incidents) {
    if (!incident.active) continue;
    notifications.push({
      // Keyed on the RULE alone, not on a timestamp. The window slides with
      // every poll, so both firstSeen and lastSeen drift — keying on either
      // re-announces the same live incident every few seconds, which is the
      // notification equivalent of a stuck doorbell. One rule breaching is one
      // thing to be told about, once, until it stops.
      id: `incident:${incident.ruleId}`,
      kind: "incident",
      severity: incident.severity === "critical" ? "critical" : incident.severity === "serious" ? "warning" : "info",
      title: incident.title,
      body: incident.description,
      at: incident.lastSeen,
      link: { page: "alerts", params: {} }
    });
  }

  for (const anomaly of anomalies.slice(0, 3)) {
    notifications.push({
      id: `anomaly:${anomaly.metric}:${anomaly.t}`,
      kind: "anomaly",
      severity: Math.abs(anomaly.z) > 6 ? "warning" : "info",
      title: `${anomaly.label} ${anomaly.direction === "spike" ? "spike" : "drop"}`,
      body: anomaly.description,
      at: anomaly.t,
      link: { page: "overview", params: {} }
    });
  }

  for (const service of services) {
    if (service.grade !== "critical" && service.grade !== "degraded") continue;
    notifications.push({
      id: `service:${service.name}:${service.grade}`,
      kind: "service",
      severity: service.grade === "critical" ? "critical" : "warning",
      title: `${service.name} is ${service.grade}`,
      body: `${service.errors} of ${service.requests} requests failed, p95 ${Math.round(service.p95)}ms`,
      at: Date.now(),
      link: { page: "logs", params: { service: service.name } }
    });
  }

  if (health.grade === "nodata") {
    notifications.push({
      id: "health:nodata",
      kind: "system",
      severity: "warning",
      title: "No telemetry in this window",
      body: "Nothing arrived from the connected project. Either traffic stopped or collection did.",
      at: Date.now(),
      link: { page: "connections", params: {} }
    });
  }

  const RANK = { critical: 0, warning: 1, info: 2 };
  return notifications.sort((a, b) => RANK[a.severity] - RANK[b.severity] || b.at - a.at).slice(0, 20);
}
