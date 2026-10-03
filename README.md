# Vantage

**Cloud Application Log Monitoring, Resource Usage & Cost Optimization Platform**
— Cognizant Hackathon Use Case 2.

The product layer above cloud telemetry. It answers: is the application healthy,
what is failing, what is slow, did a failure coincide with a resource spike —
and, before any of that, **what should someone do about it right now**.

Its demo source application is [StaySync](https://github.com/yokshith09/StaySync),
which emits structured logs in the Cloud Logging `jsonPayload` contract.

```bash
npm run api                # API on :8090
npm --prefix web run dev   # UI on :5173, proxies /api
npm start                  # build the UI and serve everything from :8090
```

## The dashboard leads with actions, not charts

The top of the Overview is a ranked action queue, above every chart. Each action
carries what is wrong, **why it matters**, **the first step to take**, and **how
you will know it worked** — so the page is readable by a developer who has not
seen the underlying telemetry (§25, final criterion).

Priority is deliberately not severity. A critical alert that has already
resolved ranks below a warning still firing, because only one of them needs
someone now. Alerts are collapsed to **one action per rule**, not per episode —
listing the same rule four times is the alert fatigue §20 warns about.

## Views

| View | Shows |
|---|---|
| Overview | Project summary, action queue, health grade, error rate, p95/p99, severity split, service watchlist, open incidents |
| Incidents | Thresholds crossed, grouped per rule, with summary, ranked causes and the fix |
| Insights | Repeating log patterns and statistical anomalies |
| Services | Per-workload health, grades, failure concentration |
| Logs | Filterable log table with drill-down to the raw `jsonPayload` |
| Performance | Latency percentiles, every route, throughput vs failures |
| Resources | CPU, memory, DB connections, instance count |
| Cost | Daily spend, cost by service and SKU, anomalies, ranked saving actions |
| Setup | The connected cloud project, what is monitored, and what access it needs |

## Incidents, not alerts

A threshold rule re-evaluates continuously, so one bad afternoon produces dozens of
breach records for a single problem. Those are folded into **one incident per rule**,
with the individual breaches kept inside as episodes. Opening an incident answers
three questions in order: what happened, why it probably happened, and what to do.

Two numbers that are easy to confuse are reported separately: **breaching for** is
the time actually spent over the threshold; **across** is the span from the first
breach to the last. Three ten-minute episodes across an afternoon is 30 minutes of
breaching, not five hours.

## Notifications

A bell in the header carries everything open: incidents breaching now, anomalies no
rule covers yet, and services that degraded without tripping anything. Anything new
since the last poll also raises a toast.

Notification ids are **stable for as long as the condition lasts**, keyed on the rule
rather than a timestamp. The window slides with every poll, so a timestamp-keyed id
re-announces the same live incident every few seconds.

## The analysis layer

Five jobs, all deterministic, all showing their evidence:

| | What it does |
|---|---|
| **Pattern detection** | Collapses messages to a template by masking ids, numbers and quoted strings, so one failure seen 300 times is one row rather than 300 |
| **Anomaly detection** | Modified z-score against the window's own median and MAD. A mean-based detector is dragged upward by the spike it exists to catch; a median is not. Consecutive anomalous buckets collapse into one event |
| **Root-cause analysis** | Ranked hypotheses, each with the evidence behind it and a confidence derived from that evidence. Stated as correlation, because that is what it is |
| **Incident summarization** | One paragraph: what, to what, how long, how big, most likely cause |
| **Remediation** | Per-rule steps with a verification condition, so "fixed" is checkable |

There is **no model in the loop**, and the UI says so. An on-call engineer needs the
same answer twice, and a finding that fired must be able to show what fired it.
`narrate()` in `api/ai.js` is the seam where a language model can reword findings when
a key is configured — it changes the words, never the findings.

## Time windows

| Window | Bucket | Refresh |
|---|---|---|
| 1m | 2s | 5s |
| 5m | 10s | 10s |
| 15m | 30s | 20s |
| 1h | 60s | 30s |
| 6h | 5m | 60s |
| 24h | 15m | 120s |

A 1-minute view is useless unless it moves; a 24-hour view re-polling every five
seconds is pure waste. Refresh cadence therefore follows the window, and a poll
swaps data in place rather than flashing the page back to skeletons.

**No traffic is not health.** An empty window grades as `no data`, in neutral
grey — never "healthy, 100% availability", which would make "nothing went wrong"
indistinguishable from "we saw nothing at all".

## Architecture

```
api/
  source.js      the telemetry seam — server.js imports ONLY this
  data.js        sample generator (StaySync's exact log contract)
  analytics.js   windowing, bucketing, percentiles, threshold rules
  insights.js    health grades, apdex, correlation, remediation catalogue
  ai.js          patterns, anomalies, root cause, incident summaries
  incidents.js   episode grouping and the notification feed
  actions.js     the ranked action queue
  providers.js   provider registry (severity vocabulary, field names, credentials)
  connections.js the connected accounts
  server.js      HTTP surface
web/src/
  lib/contracts.ts   the typed API contract — no `any` crosses the boundary
  components/        charts, primitives, action queue, summary band
  pages/             one module per view
```

The frontend reaches the backend only over HTTP, through `lib/api.ts`, against
the types in `lib/contracts.ts`. No module is imported across the boundary.

### Performance

Aggregations are windowed by **binary search over a memoised sorted array**,
with `Date.parse` done once per record at ingest rather than per comparison.
That took the 24h overview from 7.2s to ~0.3s on identical output. A 2s memo on
top keeps a 5-second poll close to free.

## Providers

| Provider | Logs | Metrics | Cost | Status |
|---|---|---|---|---|
| Google Cloud | Cloud Logging | Cloud Monitoring | Billing export to BigQuery | Connected |
| Microsoft Azure | Azure Monitor Logs | Azure Monitor Metrics | Cost Management | Hidden — registry entry retained |
| AWS | CloudWatch Logs | CloudWatch Metrics | Cost Explorer | Hidden — registry entry retained |

Every provider maps its own telemetry into one normalized record, and nothing
downstream — aggregation, alerting, the UI — sees anything else. **Adding a
provider is an entry in `api/providers.js`** declaring its severity vocabulary,
field names and credential shape. No other file changes.

Azure and AWS are currently hidden from the UI so the product shows exactly the
one project that is connected. The registry entries remain, so unhiding them is
a status flag, not a rebuild.

## Data sources

Everything goes through `api/source.js`, so the UI, aggregations and alert engine
do not change when the backing source does.

| Source | Status |
|---|---|
| Sample (current) | Records in StaySync's exact log contract, extended minute by minute in real time |
| Cloud Logging | To wire — adapter stub |
| Cloud Monitoring | To wire — adapter stub |
| BigQuery billing export | To wire — schema already modelled in `api/cost-data.js` |

## Requirements coverage

See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for the clause-by-clause
account, including what is **not** covered.

## Colour

The palette is not a taste call. Series colours were validated against each
mode's own surface with the dataviz palette checker — not eyeballed, and not
auto-flipped between themes:

```
dark  (#12221d) lightness PASS · chroma PASS · CVD PASS (worst adjacent ΔE 8.4) · contrast PASS
light (#ffffff) lightness PASS · chroma PASS · CVD PASS · contrast WARN on three slots
```

The light-mode WARN is not dismissable: those series **must** carry visible
direct labels or a table view, which the ranked-bar, legend and watchlist
components do.

- **Series colours are categorical** — fixed order, never cycled, never repainted
  when a filter changes the series count.
- **Severity is a status encoding**, reserved and never reused as a series colour.
  It always ships a text label, so meaning never rests on colour alone.
- **INFO is deliberately neutral grey** — it is the bulk of traffic and must recede.

Do not add a seventh series colour or reorder the existing six without re-running
the checker. The ordering is the colour-blindness safety mechanism.

Both themes are verified visually before any UI change ships; theme-dependent
contrast failure is an established bug class here.
