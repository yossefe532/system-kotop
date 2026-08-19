# EduCore POS — Production Go-Live Checklist

Review and satisfy every item before a production (`APP_ENV=production`) deployment.
Items marked **AUTO** are enforced by the application at startup; if they fail, the
service refuses to boot. Items marked **OPERATOR** must be verified manually.

## 1. Application environment (AUTO)
- [ ] `APP_ENV=production` is set explicitly (Render injects this in the service environment; verify it).
- [ ] `JWT_SECRET_KEY` is a long random value and is **not** `dev-only-change-me`.
- [ ] `CORS_ALLOWED_ORIGINS` is set to the real frontend origin(s).
- [ ] `INIT_ADMIN_USERNAME` and `INIT_ADMIN_PASSWORD` are set (non-empty). If either
      is missing in staging/production the app refuses to start.
- [ ] `ALLOW_BOOTSTRAP_ADMIN_FALLBACK=false` (required in staging/production; the app
      refuses to start if it is `true`).
- [ ] `TRUSTED_HOSTS` lists the real hostnames.
- [ ] `FORWARDED_ALLOW_IPS` is set to the trusted proxy CIDRs (never `*`).

## 2. Schema / migration (AUTO)
- [ ] The deploy command runs `python -m scripts.run_migrations` before starting the backend
      (wired in `Dockerfile.backend`: `python -m scripts.run_migrations && python -m scripts.start_backend`).
- [ ] `ENFORCE_SCHEMA_VERSION=true` (auto-enabled when protected).
- [ ] `REQUIRED_ALEMBIC_REVISION` matches the current head (`20260816_0005`). The
      example env files have been corrected; do not override it with a stale value.
- [ ] `GET /health/ready` returns 200 and reports `"schema": "ok"`.

## 3. Backup (OPERATOR)
- [ ] `python -m scripts.backup_postgres` was run successfully against the target DB
      before the deployment and the dump is stored off the database host.
- [ ] The backup filename and location are recorded in the deployment runbook.
- [ ] See `docs/production-recovery.md` for restore steps.

## 4. Frontend build (OPERATOR)
- [ ] Build uses `npm ci && npm run build`.
- [ ] `VITE_API_BASE_URL` points to the production API.
- [ ] `VITE_WALLET_LEDGER_ENABLED=false` (keep disabled — see §6).
- [ ] `VITE_ENABLE_DEMO_SEED=false` (never enable demo data in production).
- [ ] Demo seed is not bundled (confirm `VITE_ENABLE_DEMO_SEED` is unset/false).

## 5. Health verification (OPERATOR + AUTO)
- [ ] `GET /health/live` returns 200.
- [ ] `GET /health/ready` returns 200 with `database: ok`, `schema: ok`.
- [ ] `GET /health/ready` reports `"wallet_ledger_enabled": false`.
- [ ] Platform health check path is `/health/ready` (Render).

## 6. Wallet ledger Go-Live state (OPERATOR)
- [ ] `WALLET_LEDGER_ENABLED=false` on the backend.
- [ ] `VITE_WALLET_LEDGER_ENABLED=false` on the frontend.
- [ ] The ledger is intentionally disabled for launch. When it is later enabled,
      BOTH flags must be flipped together (see `docs/...` / audit). The backend logs a
      startup warning if only the backend flag is on.
- [ ] The offline replay endpoint will return HTTP 503 while the ledger is disabled;
      this is expected at launch.

## 7. Secrets (OPERATOR)
- [ ] No real secrets are committed; env examples use `replace-with-*` placeholders only.
- [ ] `METRICS_AUTH_TOKEN` / `HEALTHCHECK_AUTH_TOKEN` are set if metrics/health are
      protected.
- [ ] Rotate any credentials that were used in staging before production launch.

## 8. Pre-Go-Live smoke (OPERATOR)
- [ ] Run `node scripts/smoke_staging.mjs` against the STAGING environment and confirm
      all core steps pass. See `docs/offline-staging-smoke.md`.
- [ ] Confirm staging uses the same deploy configuration shape as production.
