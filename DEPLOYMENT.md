# Deployment Architecture

## Overview
- Backend: FastAPI container running behind a reverse proxy or platform load balancer.
- Frontend: static Vite build served by Nginx.
- Database: managed PostgreSQL with Alembic migrations executed before app rollout.
- Monitoring: Prometheus scraping `/metrics`, centralized logs, and frontend telemetry ingestion.

## Why This Design
- Separate backend and frontend deploy units reduce blast radius.
- Running migrations before startup prevents multi-instance schema races.
- Health endpoints enable safe load balancer checks and zero-downtime rollout verification.
- Containers make the runtime repeatable across local, staging, and production.

## Runtime Components
- Backend image: [Dockerfile.backend](file:///e:/شغل/شغل/project/Dockerfile.backend)
- Frontend image: [Dockerfile.frontend](file:///e:/شغل/شغل/project/Dockerfile.frontend)
- Local stack: [docker-compose.yml](file:///e:/شغل/شغل/project/docker-compose.yml)
- Health endpoints: [health.py](file:///e:/شغل/شغل/project/app/api/health.py)

## Deployment Flow
1. Build backend and frontend artifacts.
2. Run `python -m scripts.run_migrations`.
3. Start new backend instances.
4. Wait for `/health/ready` to pass.
5. Shift traffic to new backend instances.
6. Deploy frontend against the validated backend release.
7. Verify `/health/ready`, `/metrics`, login, and a smoke transaction flow.

## Environment Strategy
- `local`: developer workstations and Docker Compose.
- `development`: shared dev environment with lower safety thresholds.
- `staging`: production-like validation environment.
- `production`: protected environment with strict config validation.

## Required Protected-Environment Variables
- `APP_ENV`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `CORS_ALLOWED_ORIGINS`
- `TRUSTED_HOSTS`

## Zero-Downtime Strategy
- Preferred: rolling update for backend with readiness gates.
- Alternative: blue/green for platform stacks that support weighted cutover.
- Migration rule: run additive schema migrations before shifting traffic.
- Rollback rule: revert application version first; use DB restore only for severe data incidents.

## Platform Notes
- Railway: use [railway.json](file:///e:/شغل/شغل/project/railway.json) plus release command from [Procfile](file:///e:/شغل/شغل/project/Procfile).
- Render: use [render.yaml](file:///e:/شغل/شغل/project/render.yaml) with `preDeployCommand` and `healthCheckPath`.
- Self-hosted: place backend behind an HTTPS reverse proxy and restrict `/metrics`.
