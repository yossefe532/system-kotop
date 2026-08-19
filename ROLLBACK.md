# Rollback Guide

## Principles
- Roll back application code before considering database restore.
- Avoid destructive schema downgrades in live production.
- Keep the previous backend and frontend image available for immediate redeploy.

## Application Rollback
1. Stop routing new traffic to the unhealthy release.
2. Redeploy the previous backend image or previous platform revision.
3. Verify `/health/ready`.
4. Redeploy the previous frontend artifact if the issue is user-facing.
5. Confirm login, sync replay, and one core sales flow.

## Migration Rollback
- Preferred path: do not downgrade schema automatically.
- Safe path: if the failed release used additive migrations, keep the newer schema and roll back only the app image.
- Emergency path: restore PostgreSQL from a verified backup and then redeploy the prior app version.

## Decision Matrix
- Backend-only bug: redeploy previous backend, keep frontend if compatible.
- Frontend-only bug: redeploy previous frontend only.
- Infra misconfiguration: restore environment variables and restart current healthy image.
- Data corruption: declare incident, stop writes, restore DB, then redeploy previous application version.

## Validation After Rollback
- `/health/live`
- `/health/ready`
- `/metrics`
- authentication
- one reservation flow
- one sale flow
- offline replay acknowledgment path
