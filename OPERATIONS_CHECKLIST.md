# Operations Checklist

## Pre-Deployment
- Confirm staging is green.
- Confirm latest backup exists and restore test is recent.
- Confirm secrets are present in the target environment.
- Confirm `APP_ENV`, `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ALLOWED_ORIGINS`, and `TRUSTED_HOSTS`.
- Confirm Docker images or platform revisions are built from the intended commit.

## Deployment
- Run migrations once.
- Deploy backend.
- Wait for `/health/ready`.
- Verify `/metrics` is reachable only from monitoring paths.
- Deploy frontend.
- Confirm login, inventory, reservations, sales, and offline replay smoke checks.

## Post-Deployment
- Watch 5xx rate, latency, DB pool usage, queue depth, and replay failures for 30 minutes.
- Confirm no schema mismatch or auth startup warnings in logs.
- Confirm deployment version and color tags are visible in health output.

## Incident Response
- If health fails, stop rollout.
- If backend is degraded, roll back backend first.
- If user flow is degraded but backend is healthy, roll back frontend.
- If data integrity is at risk, stop writes and enter recovery procedure.
