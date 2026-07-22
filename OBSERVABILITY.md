# Observability Architecture

## Implemented Foundations

- Structured JSON logging via `app/core/observability.py`
- Request correlation IDs and latency middleware via `app/middleware/request_context.py`
- Prometheus metrics endpoint at `/metrics`
- SQLAlchemy query, pool, and transaction instrumentation via `app/db/observability.py`
- Frontend telemetry ingestion endpoint at `/observability/frontend-events`
- Frontend API/auth/sync/reconnect diagnostics via `pos-frontend/src/services/observabilityClient.js`

## Collected Signals

- Backend request count, latency, and exception rates
- Database query timings and slow query counts
- Database commit and rollback counts
- Approximate DB connection pool usage
- Auth success/failure/refresh lifecycle counters
- Frontend API failures, auth expiry, replay failures, queue depth, and reconnect events

## Production Stack Recommendation

- Prometheus: scrape `/metrics`
- Grafana: dashboards and alert routing
- Sentry: backend and frontend exception aggregation
- OpenTelemetry: future distributed traces and export to Tempo/Jaeger

## Suggested Alerts

- High 5xx error rate
- p95 latency above threshold
- Replay failures increasing
- Queue depth above threshold
- DB slow query spikes
- DB pool exhaustion
- Login attack spikes and lockout bursts

## Deployment Notes

- Expose `/metrics` only to internal monitoring networks or reverse-proxy allowlists
- Set `LOG_LEVEL=INFO` in production and `DEBUG` only temporarily
- Set `LOG_FILE` if file rotation is required on self-hosted nodes
- Add Sentry/OTel exporters later without changing current API contracts
