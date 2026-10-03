# Requirements coverage — Use Case 2

Clause-by-clause against the product document, for the dashboard only.
**Deployment is out of scope for this review** (GCP billing is blocked; see the
note at the end).

Honest accounting: a row says *Met*, *Partial* or *Not covered*. Nothing is
marked met because the code exists — only because the behaviour is in the running
dashboard.

---

## §10 Product capabilities

### 10.1 Centralized log monitoring

| Clause | Status | Where |
|---|---|---|
| Collect application logs in Cloud Logging | **Partial** | The log contract is StaySync's real stdout shape, which Cloud Run parses into `jsonPayload` unchanged. The collector itself is a stub behind `api/source.js`; nothing downstream changes when it is wired. |
| View logs in one centralized interface | **Met** | Logs view |
| Filter by severity, service, endpoint, time window, structured fields | **Met** | Six filters plus free-text search; filters carry in the URL so a drill-down lands pre-narrowed |
| Real-time / near-real-time views | **Met** | 1-minute window on a 5-second poll, 2-second buckets; freshness is stated on every view |
| Preserve raw log access alongside summaries | **Met** | Any row opens the full raw `jsonPayload` |

### 10.2 Log analysis & insights

| Clause | Status |
|---|---|
| Total volume and breakdown by severity | **Met** |
| Error rate and error count trends | **Met** — with per-bucket sparklines on the headline tiles |
| Most frequent error types / services | **Met** — top events, plus a per-service failure concentration |
| Slowest endpoints or services | **Met** — Performance view, p50/p95/p99 per route |
| Repeated failure patterns | **Met** — a dedicated rule; episodes are collapsed per rule |
| Application health indicators | **Met** — a single grade from error rate, latency and availability, with the three inputs shown beside it |

### 10.3 Alerts

**Met.** Error rate above threshold, sudden 5xx increase, and latency above a
limit are all implemented as rules, alongside payment-failure and
credential-stuffing patterns. Alerts group into episodes with first-seen,
last-seen, peak and occurrence count, and each carries likely cause, remediation
steps and a verification condition.

§20's alert-fatigue risk is addressed directly: the action queue shows one entry
per rule, not per episode, and ranks by what needs a person now rather than by
severity alone.

### 10.4 Resource monitoring

**Met for the dashboard layer.** CPU, memory, instance count and database
connections render on the same time axis as the log views, so an error spike and
a resource spike can be compared over the same window — which is the clause's
actual requirement. The metrics are sample data on the same seam as logs.

### 10.5 Cost monitoring & optimization

**Met, on sample billing data.** The Cost view shows daily spend, cost by service
and by SKU, projected monthly, cost per thousand requests, and days flagged by the
1.5x anomaly rule. Recommendations are ranked by estimated saving, each with the
evidence behind it and a plain-language action; nothing acts on a resource.

Provenance is stated at the top of the view, and the freshness model distinguishes
the daily billing export from near-real-time logs throughout. `api/cost-data.js`
is modelled on the BigQuery billing export's schema, so enabling the live export is
a source change, not a rewrite.

### 10.6 AI / automation layer

**Met.** The mandatory half — collect, classify, aggregate, threshold and alert
without manual intervention — runs end to end.

The optional analysis layer the clause describes is implemented in full, in
`api/ai.js` and `api/incidents.js`:

| Clause wording | Implementation |
|---|---|
| "summarize an incident" | One paragraph per incident: what, to what, how long, how big, most likely cause |
| "group semantically similar errors" | Template-based pattern detection, masking ids, numbers and quoted strings |
| "explain likely relationships among signals" | Ranked root-cause hypotheses, each carrying its evidence and a derived confidence |
| "translate a recommendation into a plain-language action" | Per-rule remediation steps with a verification condition |
| (beyond the clause) | Anomaly detection by modified z-score against the window's own median |

**There is no model in the loop, and the UI says so.** This is a deliberate
choice, not a shortfall: an on-call engineer needs the same answer twice, and a
finding must be able to show the evidence that produced it. `narrate()` is the
seam where a language model can reword findings when a key is configured; it can
change the wording, never the findings. The clause marks this layer optional and
warns against autonomous mutation of cloud resources — nothing here mutates
anything.

---

## §11 Dashboard structure

| Area | Status |
|---|---|
| System overview | **Met** — project summary band, action queue, health grade, error rate, resource signals, recent alerts |
| Log analytics | **Met** |
| Performance | **Met** |
| Resource usage | **Met** |
| Cost | **Met** — spend by service and SKU, trend, anomalies, unit economics |
| Recommendations | **Met** — ranked by estimated saving, with evidence and a plain action |
| Alerts / incidents | **Met** — grouped per rule, with timestamps, condition, affected services, episodes, cause analysis and remediation |

---

## §12 Primary user journey

| Step | Status |
|---|---|
| 1. Opens dashboard, sees overall health | **Met** — the summary band states project, grade, service health, open alerts and act-now count before any chart |
| 2. Error-rate spike visible | **Met** |
| 3. Drills into the affected service and filters logs | **Met** — every tile, row and chart element is a link that carries its filter |
| 4. Related latency or resource signals for the same period | **Met** |
| 5. An alert explains the threshold crossed | **Met** |
| 6. Resource/cost view shows coincidence | **Met** — resource conditions appear inside the incident; cost has its own view |
| 7. Recommendation view | **Met** |

---

## §25 Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Demo app runs on GCP, produces structured logs | **Blocked** — structured logs yes; GCP deployment blocked on billing |
| 2 | Logs visible in centralized Cloud Logging | **Blocked** — same |
| 3 | Product retrieves log data programmatically | **Partial** — the full query path exists against the seam; the Cloud Logging adapter is a stub |
| 4 | At least one live/near-live view plus historical trends | **Met** — 1m live through 24h historical |
| 5 | Known error scenarios detected and displayed | **Met** — 5xx spikes, payment failures, stock conflicts, credential stuffing, latency breaches |
| 6 | One alert threshold triggered deterministically in the demo | **Met** — the sample source carries an ongoing incident, so the error-rate rule is breaching at any moment the dashboard is opened. Previously every sample incident was historical and nothing was ever firing at demo time |
| 7 | Resource metrics visible | **Met** |
| 8 | Cost data with freshness labelling | **Met on sample data** — schema-accurate, provenance stated in the UI; live when the export is enabled |
| 9 | One optimization suggestion demonstrated | **Met** — ranked, each with evidence and estimated impact |
| 10 | Outputs understandable without reading raw telemetry | **Met** — this is what the action queue and the plain-language captions exist for |

**7 of 10 fully met, 1 partial, 2 blocked on deployment.**

The two blocked criteria and the partial one all depend on the same thing: GCP
deployment plus the Cloud Logging adapter. Nothing else is outstanding.

---

## What would close the remaining gaps

**Deployment** (criteria 1, 2, and the rest of 3) — StaySync to Cloud Run, then the
Cloud Logging adapter behind `api/source.js`. Blocked on GCP billing; §26 anticipates
exactly this and names mentor-provided credits as the route.

Nothing else in the product is outstanding against the document.

## §20 Risks: alert fatigue

The document names alert fatigue as a specific risk, so it is worth stating what was
done about it rather than leaving it implicit:

- Alerts group into **one incident per rule**, not one row per breach.
- Actions group the same way, with the episode count preserved.
- Consecutive anomalous buckets collapse into **one anomaly event**, not seven.
- Notification ids are stable while a condition lasts, so nothing re-announces itself.
- Rate-derived findings are **suppressed below 20 requests** — one failure in eight is
  not a 12.5% error rate worth paging anyone over.
- Priority is a deadline ("Fix now", "Fix today"), not a severity word, so the queue
  sorts by when something has to be dealt with rather than by how alarming it sounds.
