/**
 * The action queue.
 *
 * A monitoring dashboard that only reports state leaves the reader to work out
 * what to do. This turns the signals into a ranked list of things that need a
 * person, each one carrying: what is wrong, why it matters, and the first step
 * to take.
 *
 * Priority is deliberately not just severity — a critical alert that is already
 * resolved ranks below a warning that is still firing, because only one of them
 * needs someone now.
 */

import { REMEDIATION } from "./insights.js";

const PRIORITY = { critical: 0, high: 1, medium: 2, low: 3 };

/**
 * Minimum requests before a RATE is allowed to raise an action.
 *
 * In a 1-minute window a single failed request is "100% error rate, 0%
 * availability". That is arithmetically true and operationally meaningless, and
 * presenting it as an act-now item is how a dashboard trains people to ignore
 * it. The alert rules already use this floor; the action queue needs the same
 * one. Counts (how many 5xx) stay honest at any sample size — only rates are
 * gated.
 */
const MIN_SAMPLE = 20;

/** Severity of an alert rule mapped onto action priority. */
const alertPriority = (alert) => {
  if (!alert.active) return alert.severity === "critical" ? "medium" : "low";
  return alert.severity === "critical" ? "critical" : alert.severity === "serious" ? "high" : "medium";
};

/**
 * Builds the ranked action list from alerts and service health.
 * Returns an empty list when nothing needs attention — which is a real and
 * valuable answer, not an empty state to apologise for.
 */
export function buildActions({ alerts, services, health }) {
  const actions = [];

  // 1. Alerts — the primary source. Each carries its remediation.
  //    One action per RULE, not per episode. A rule that fired four separate
  //    times is one thing to fix, and listing it four times is the alert
  //    fatigue the brief (§20) warns about. The episode kept is the one that
  //    needs a person soonest: still firing beats resolved, then most recent.
  const byRule = new Map();
  for (const alert of alerts) {
    const existing = byRule.get(alert.ruleId);
    const moreUrgent =
      !existing ||
      (alert.active && !existing.alert.active) ||
      (alert.active === existing.alert.active && alert.lastSeen > existing.alert.lastSeen);
    if (moreUrgent) byRule.set(alert.ruleId, { alert, episodes: (existing?.episodes ?? 0) + 1 });
    else existing.episodes += 1;
  }

  for (const { alert, episodes } of byRule.values()) {
    const remediation = REMEDIATION[alert.ruleId];
    actions.push({
      id: `alert-${alert.ruleId}`,
      kind: "alert",
      priority: alertPriority(alert),
      active: alert.active,
      title: alert.title,
      detail:
        episodes > 1
          ? `${alert.description} (${episodes} separate episodes in this window)`
          : alert.description,
      why: remediation?.likelyCause ?? "A monitored threshold was crossed.",
      firstStep: remediation?.actions?.[0] ?? "Open the matching logs and read the dominant event.",
      verify: remediation?.verify ?? null,
      affected: alert.correlation?.affectedServices ?? [],
      count: alert.count,
      episodes,
      lastSeen: alert.lastSeen,
      link: { page: "alerts", params: {} }
    });
  }

  // 2. Services whose grade is poor but which have not tripped an alert.
  //    These are the slow burns that thresholds miss.
  //    Only an ACTIVE alert covers a service. A resolved alert that once named
  //    it must not suppress a service that is degraded right now — that is how
  //    a 60% error rate ends up with "nothing needs attention" beside it.
  const alertedServices = new Set(actions.filter((a) => a.active).flatMap((a) => a.affected));
  for (const service of services) {
    if (service.grade === "healthy" || service.grade === "watch" || service.grade === "nodata" || service.grade === "sparse") continue;
    if (service.requests < MIN_SAMPLE) continue;
    if (alertedServices.has(service.name)) continue;

    actions.push({
      id: `service-${service.name}`,
      kind: "service",
      priority: service.grade === "critical" ? "high" : "medium",
      active: true,
      title: `${service.name} is ${service.grade}`,
      detail: `${service.errors} of ${service.requests} requests failed (${(service.errorRate * 100).toFixed(1)}%), p95 ${Math.round(service.p95)}ms`,
      why: service.topFailure
        ? `Its most frequent failure is ${service.topFailure} (${service.topFailureCount} times).`
        : "Its error rate or latency is outside the healthy range.",
      firstStep: `Open the logs filtered to ${service.name} and check whether one event dominates.`,
      verify: "Error rate back under 2% and p95 under 500ms.",
      affected: [service.name],
      count: service.errors,
      lastSeen: Date.now(),
      link: { page: "logs", params: { service: service.name } }
    });
  }

  // 3. Whole-system conditions that no single service owns.
  if (health.serverErrorRate > 0.01 && health.requests >= MIN_SAMPLE) {
    actions.push({
      id: "system-5xx",
      kind: "system",
      priority: health.serverErrorRate > 0.05 ? "critical" : "high",
      active: true,
      title: "Server errors above tolerance",
      detail: `${health.serverErrors} 5xx of ${health.requests} requests — ${(health.serverErrorRate * 100).toFixed(2)}%`,
      why: "A 5xx is our failure, not the caller's. Every one is a request a user did not get served.",
      firstStep: "Filter the logs to the 5xx status family and identify which route produces most of them.",
      verify: "5xx rate back under 1% of traffic.",
      affected: [],
      count: health.serverErrors,
      lastSeen: Date.now(),
      link: { page: "logs", params: { statusClass: "5xx" } }
    });
  }

  return actions
    .sort((a, b) => {
      const byPriority = PRIORITY[a.priority] - PRIORITY[b.priority];
      if (byPriority !== 0) return byPriority;
      return b.lastSeen - a.lastSeen;
    })
    .slice(0, 12);
}

/** One-line rollup used by section headers. */
export function sectionSummary(actions, kinds) {
  const relevant = actions.filter((a) => kinds.includes(a.kind) && a.active);
  if (relevant.length === 0) return { count: 0, worst: null, text: "Nothing needs attention here" };

  const worst = relevant[0];
  return {
    count: relevant.length,
    worst: worst.priority,
    text:
      relevant.length === 1
        ? worst.title
        : `${worst.title}, and ${relevant.length - 1} more need${relevant.length - 1 === 1 ? "s" : ""} attention`
  };
}
