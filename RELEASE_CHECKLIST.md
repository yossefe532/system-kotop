# Release Checklist

## Validation
- Backend tests pass.
- Frontend tests pass.
- E2E tests pass.
- Docker builds pass.
- Migration step reviewed for backward compatibility.

## Security
- No secrets in code or CI logs.
- JWT secret rotated according to policy.
- CORS and trusted hosts reviewed for target environment.
- HTTPS and proxy configuration verified.

## Deployment
- Staging approved.
- Production approval recorded.
- Rollback target identified.
- Healthcheck URLs configured in deployment pipeline.

## Observability
- Metrics scraping active.
- Alerts for 5xx, latency, replay failures, queue depth, and DB saturation enabled.
- Log retention and cleanup policy confirmed.
