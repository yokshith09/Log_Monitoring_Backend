# Vantage

**GCP Application Log Monitoring, Resource Usage & Cost Optimization Platform**

The product layer above GCP telemetry. It answers: is the application healthy,
what is failing, what is slow, did a failure coincide with a resource spike, and
where can we spend less.

Its demo source application is [StaySync](https://github.com/yokshith09/StaySync),
which emits structured logs in the Cloud Logging `jsonPayload` contract.

```bash
npm run api            # API on :8090
npm --prefix web run dev   # UI on :5173, proxies /api
npm start              # build the UI and serve everything from :8090
```

## Views

| View | Shows |
|---|---|
| Overview | Health, error rate, p95/p99, severity split, top failures, recent alerts |
| Logs | Filterable log table with drill-down to the raw `jsonPayload` |
| Performance | Latency percentiles, slowest routes, throughput vs failures |
| Resources | CPU, memory, DB connections, instance count |
| Cost | Daily spend, cost by service and SKU, anomalies, advisory recommendations |
| Alerts | Threshold breaches grouped into incidents, with evidence |

## Data sources

Everything goes through a source interface, so the UI, aggregations and alert
engine do not change when the backing source does.

| Source | Status |
|---|---|
| Sample (current) | Records in StaySync's exact log contract |
| Cloud Logging | To wire — adapter stub |
| Cloud Monitoring | To wire — adapter stub |
| BigQuery billing export | To wire — the cost view already reads the export's schema |

Cost figures are **sample data** and labelled as such in the UI. They swap to live
data when the billing export is enabled, with no code change.

## Colour

The palette is not a taste call. Series colours were validated against this
dashboard's surface (`#12221d`) with the dataviz palette checker:

```
lightness band PASS · chroma floor PASS · CVD separation PASS (worst adjacent ΔE 8.4)
normal-vision floor PASS (worst 19.3) · contrast PASS
```

- **Series colours are categorical** — fixed order, never cycled, never repainted
  when a filter changes the series count.
- **Severity is a status encoding**, reserved and never reused as a series colour.
  It always ships a text label, so meaning never rests on colour alone.
- **INFO is deliberately neutral grey** — it is the bulk of traffic and must recede.

Do not add a seventh series colour or reorder the existing six without re-running
the checker. The ordering is the colour-blindness safety mechanism.
