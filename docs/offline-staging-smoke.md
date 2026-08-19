# EduCore POS — Offline / Staging Smoke Checklist

Use this when the staging environment is reachable but you want a structured,
repeatable pre-Go-Live pass without relying on the automated script. Prefer the
automated `scripts/smoke_staging.mjs` for the core POS flow; use this list for the
items the script does not cover.

## Preconditions
- [ ] You have a staging deployment (same config shape as production).
- [ ] `STAGING_BASE_URL` / API credentials are available.
- [ ] You will mark any created records with a recognizable prefix (e.g. `smoke-`)
      so they can be cleaned up.

## Core flow (covered by `scripts/smoke_staging.mjs`)
- [ ] Auth: admin login returns a token.
- [ ] Student: create, read, update, list.
- [ ] Book: create with stock; stock is reflected.
- [ ] Sale: cash transaction succeeds and stock decrements.
- [ ] Reservation: create then cancel/refund restores stock.
- [ ] Wallet reconciliation endpoint responds (503 expected while ledger disabled).

## Manual / offline checks (not in the script)
- [ ] `GET /health/live` and `/health/ready` return 200.
- [ ] `/health/ready` reports `wallet_ledger_enabled: false`.
- [ ] Frontend loads with `VITE_ENABLE_DEMO_SEED=false` (no demo data visible).
- [ ] Login page rejects empty/weak credentials; lockout engages after failures.
- [ ] CORS only allows the configured staging origin.
- [ ] HTTPS is enforced (`FORCE_HTTPS=true`) and `FORWARDED_ALLOW_IPS` is not `*`.
- [ ] Metrics/health endpoints require their tokens if configured.
- [ ] Backup taken before the deployment exists and is retrievable.

## Cleanup
- [ ] Delete smoke-test students, books, and transactions created with the `smoke-`
      prefix (the script attempts best-effort cleanup; verify manually).
- [ ] Confirm no demo records remain visible in the UI.
