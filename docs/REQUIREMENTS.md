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

**Not covered — removed by request.** The cost and recommendation views were
taken out of the UI for this round. `api/cost-data.js` retains the per-service,
per-SKU catalogue modelled on the BigQuery billing export's schema, and the
freshness model that distinguishes a daily billing export from near-real-time
logs is still in `api/server.js`. Restoring the views is wiring, not rebuilding.

This is the one deliberate gap, and it also removes §25 criteria 8 and 9.

### 10.6 AI / automation layer

**Met for the mandatory part.** Collection, classification, aggregation,
thresholding and alerting all run without manual intervention.

The optional layer — plain-language explanation of what a signal means and what
to do — is implemented as a **rule-based remediation catalogue**, not an LLM.
Each action states why it matters, the first step, and the verification
condition. Stating this plainly: there is no model in the loop. The clause marks
this layer optional and explicitly warns against autonomous mutation of cloud
resources; nothing here mutates anything.

---

## §11 Dashboard structure

| Area | Status |
|---|---|
| System overview | **Met** — project summary band, action queue, health grade, error rate, resource signals, recent alerts |
| Log analytics | **Met** |
| Performance | **Met** |
| Resource usage | **Met** |
| Cost | **Not covered** — removed by request (§10.5) |
| Recommendations | **Not covered** — removed by request (§10.5) |
| Alerts / incidents | **Met** — timestamp, condition, affected service, supporting context |

---

## §12 Primary user journey

| Step | Status |
|---|---|
| 1. Opens dashboard, sees overall health | **Met** — the summary band states project, grade, service health, open alerts and act-now count before any chart |
| 2. Error-rate spike visible | **Met** |
| 3. Drills into the affected service and filters logs | **Met** — every tile, row and chart element is a link that carries its filter |
| 4. Related latency or resource signals for the same period | **Met** |
| 5. An alert explains the threshold crossed | **Met** |
| 6. Resource/cost view shows coincidence | **Partial** — resource, yes; cost, removed |
| 7. Recommendation view | **Not covered** — removed |

---

## §25 Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Demo app runs on GCP, produces structured logs | **Blocked** — structured logs yes; GCP deployment blocked on billing |
| 2 | Logs visible in centralized Cloud Logging | **Blocked** — same |
| 3 | Product retrieves log data programmatically | **Partial** — the full query path exists against the seam; the Cloud Logging adapter is a stub |
| 4 | At least one live/near-live view plus historical trends | **Met** — 1m live through 24h historical |
| 5 | Known error scenarios detected and displayed | **Met** — 5xx spikes, payment failures, stock conflicts, credential stuffing, latency breaches |
| 6 | One alert threshold triggered deterministically in the demo | **Met** — the sample incident timeline fires the 5xx rule every run |
| 7 | Resource metrics visible | **Met** |
| 8 | Cost data with freshness labelling | **Not covered** — removed by request |
| 9 | One optimization suggestion demonstrated | **Not covered** — removed by request |
| 10 | Outputs understandable without reading raw telemetry | **Met** — this is what the action queue and the plain-language captions exist for |

**4 of 10 fully met, 2 partial, 2 blocked on deployment, 2 removed by request.**

---

## What would close the remaining gaps

1. **Deployment** (criteria 1, 2, and the rest of 3) — StaySync to Cloud Run,
   then the Cloud Logging adapter in `api/source.js`. Blocked on GCP billing;
   §26 anticipates this and names mentor-provided credits as the route.
2. **Cost views** (criteria 8, 9) — restore the two removed pages. The data
   model, the freshness distinction and the rule set are all still in the repo.
