# EduCore POS — Zero-Cost Production Deployment

Stack: **Cloudflare Pages** (frontend) + **Render Free** (FastAPI backend, no card) +
**Neon Free** (PostgreSQL, no card) + **GitHub Free** (repo/CI). Monthly hosting cost: **$0**, no card.

> Why Render: Hugging Face Spaces made Docker/Gradio compute paid (PRO $9/mo) in 2026; Runsite
> closed new signups ("Registration is currently unavailable"); and Koyeb's dashboard is currently
> down (showing a "joining Mistral" placeholder with no working UI). Render Free is the remaining
> host that is real Linux, needs **no credit card**, and runs `psycopg` against Neon unchanged. Its
> only downside is a cold start after 15 min idle, fixed by a free UptimeRobot ping. The app code,
> APIs, models, accounting, wallet logic, sync logic, and migrations are all unchanged — this is
> deployment/infrastructure work only.

---

## 1. Cloudflare Pages — Frontend

| Setting | Value |
| --- | --- |
| Framework preset | None / Vite |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Node.js version | `20` (or use the repo `.nvmrc` = `20`) |
| Root directory | `pos-frontend` |
| Custom domain | Not required (use `*.pages.dev`) |

### Build environment variables (Cloudflare Pages → Settings → Environment variables, "Production")
```
VITE_API_BASE_URL=https://<service>.onrender.com
VITE_WALLET_LEDGER_ENABLED=false
VITE_ENABLE_DEMO_SEED=false
```
`VITE_API_BASE_URL` must point at the Render backend URL created in Step 2.

### SPA routing
`pos-frontend/public/_redirects` contains `/* /index.html 200` so client-side routes resolve.

---

## 2. Render — FastAPI Backend (Free, no card)

Render runs the existing FastAPI app in a real Linux container (TCP + libpq work, so `psycopg`
reaches Neon unchanged).

| Setting | Value |
| --- | --- |
| Plan | Free Web Service (0.1 CPU / 512 MB RAM) — **no credit card** |
| Source | GitHub repo `Eduore` (auto-deploy on push) |
| Build | Docker (`Dockerfile.backend`) **or** Python (`pip install -r requirements.txt`) |
| Start command | `sh -c "python -m scripts.run_migrations && python -m scripts.start_backend"` |
| Port | `$PORT` (Render injects it; `scripts.start_backend` reads it) |
| Health check | HTTP `GET /health/ready` |
| Sleep | Spins down after ~15 min idle (30–50s cold start) — keep a pinger awake |

The container/process runs `alembic upgrade head` then launches `uvicorn main:app` via the existing
safe wrapper, binding `$PORT`. `psycopg[binary]` includes a prebuilt `libpq`, which works on real
Linux (unlike WASM). No `gunicorn` is introduced.

> Limitation: the Free Web Service is 512 MB RAM — keep `DB_POOL_SIZE=5`, `WEB_CONCURRENCY=1`. It
> spins down after ~15 min idle; add a free UptimeRobot ping on `/health/ready` to keep it warm.

---

## 3. Neon — PostgreSQL (Free, no card)

Neon is a serverless Postgres with a permanent free tier (no card). It separates storage from
compute and **suspends compute after 5 minutes idle, resuming in <1s** on the next query. The app
already uses `pool_pre_ping=True` and `pool_recycle=1800`, so suspended connections are detected
and recycled automatically — no code change needed.

1. Create a Neon project (Free, no card) at neon.com.
2. Go to **Connection Details** → choose **Direct** (not Pooled) → **Python**.
3. Copy the URI. It looks like:
   `postgresql://<user>:<password>@<host>/<db>?sslmode=require`
4. Use it as `DATABASE_URL` (do **not** commit it). Use the **Direct** endpoint so SQLAlchemy's
   sync connection pool talks straight to Postgres (the Pooled endpoint goes through PgBouncer,
   which is meant for serverless drivers, not sync `psycopg`).

Free-tier limits: 0.5 GB storage, 100 compute-hours/month (plenty when scale-to-zero is on).

---

## 4. Alembic / Migrations

Deployment sequence:

```
Neon PostgreSQL
      ↓
alembic upgrade head   (python -m scripts.run_migrations, runs at service start)
      ↓
FastAPI startup
```

- Required head: **`20260816_0005`** (do not modify migration history).
- `alembic heads` must report `20260816_0005`.
- Migration runs automatically when the service starts (start command above).

---

## 5. Environment variables (backend / Render)

Set these in the Render service's environment (do not commit real values):

| Variable | Example / note |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | Neon Direct URI with `?sslmode=require` (secret) |
| `JWT_SECRET_KEY` | generate a long random value (secret) |
| `CORS_ALLOWED_ORIGINS` | `https://<project>.pages.dev` (exact, no `*`) |
| `TRUSTED_HOSTS` | `<service>.onrender.com,<project>.pages.dev` (no `*`) |
| `INIT_ADMIN_USERNAME` | real admin username (secret) |
| `INIT_ADMIN_PASSWORD` | real admin password (secret) |
| `ALLOW_BOOTSTRAP_ADMIN_FALLBACK` | `false` |
| `WALLET_LEDGER_ENABLED` | `false` |
| `VITE_WALLET_LEDGER_ENABLED` | `false` (build-time only; set on Cloudflare) |
| `VITE_ENABLE_DEMO_SEED` | `false` (build-time only; set on Cloudflare) |
| `ENFORCE_SCHEMA_VERSION` | `true` |
| `REQUIRED_ALEMBIC_REVISION` | `20260816_0005` |
| `DB_POOL_SIZE` | `5` |
| `DB_MAX_OVERFLOW` | `10` |
| `DB_POOL_RECYCLE` | `1800` |
| `DB_POOL_TIMEOUT` | `30` |
| `WEB_CONCURRENCY` | `1` |
| `FORCE_HTTPS` | `true` |
| `FORWARDED_ALLOW_IPS` | leave default behind the Render proxy |

See `.env.production.example` for the full template (placeholders only, no secrets).

---

## 6. CORS & Trusted Hosts

- Backend CORS is driven by `CORS_ALLOWED_ORIGINS`. Set it to exactly
  `https://<project>.pages.dev`. Never use `*` in production.
- `TRUSTED_HOSTS` must list the Render hostname and the Cloudflare Pages hostname. Never use `*`.

---

## 7. Health Check

Render keeps the service alive while it is not spun down; the app also serves `/health/ready`.
The response contains only non-sensitive fields (`app_env`, `release_version`,
`deployment_color`, `database`, `schema`, `queue`, `wallet_ledger_enabled`) — no secrets.
Expect `wallet_ledger_enabled: false`.

---

## 8. Backup Strategy (Neon Free)

Neon Free keeps your data (storage is separate from compute) and offers a 6-hour point-in-time
restore window, plus instant database branching. For an extra safety copy:

- Command: `python -m scripts.backup_postgres` (runs `pg_dump` into a timestamped file in
  `backups/`). Run it from a local machine / CI that can reach Neon.
- The operator periodically downloads the dump to a local computer or other free external storage.
- Naming convention: `backups/postgres-backup-<YYYYMMDDTHHMMSSZ>.dump`.
- Restore: `pg_restore --clean --if-exists -d "$DATABASE_URL" <dump>` (see
  `docs/production-recovery.md`).
- Verification: after restore, restart the service and confirm `GET /health/ready` reports
  `database: ok` and `schema: ok`.

(Supabase Free is an alternative DB if you prefer; the same `DATABASE_URL` flow applies, but note
Supabase Free pauses the project after ~1 week of inactivity.)

---

## 9. Free-Tier Limitations (owner must understand)

**Render Free**
- 512 MB RAM / 0.1 CPU web service; sleeps after ~15 min idle (30–50s cold start)
- Free plan: 750 instance-hours/month; a pinger keeps it awake during use
- No custom domain on Free (uses `*.onrender.com`) — custom domains need a paid plan
- No credit card required

**Neon Free**
- 0.5 GB storage, 100 compute-hours/month
- Compute suspends after 5 min idle, resumes in <1s (app handles it via pool_pre_ping)
- No long-term backups beyond the 6-hour PITR window on Free

**Cloudflare Pages Free**
- Free builds and static asset hosting; no custom domain required

This is a **zero-cost startup environment**, not unlimited enterprise hosting.

---

## 10. GitHub

- Repo hosted on GitHub Free.
- **Cloudflare Pages**: connect the repo; builds/deploys on push.
- **Render**: connect the repo; the web service auto-deploys on push.
- Optional free CI: `.github/workflows/ci.yml` runs `pytest` + `npm run lint/test/build`.
- No paid Actions are required.

---

## 11. Step-by-Step Deployment

### Step 1 — Create Neon project
Create a Neon project (Free, no card). Go to Connection Details → Direct → Python and copy the URI
(with `?sslmode=require`). This is your `DATABASE_URL`.

### Step 2 — Create Render account + Web Service
Sign up at render.com (no card). New **Web Service** → connect the `EduCore` GitHub repo. Either:
- use the existing `render.yaml` (recommended), or
- set build = Docker (`Dockerfile.backend`) / Python (`pip install -r requirements.txt`),
  start command = `sh -c "python -m scripts.run_migrations && python -m scripts.start_backend"`,
  health check path = `/health/ready`.
Render injects `$PORT`. Note the assigned `https://<service>.onrender.com` URL.

### Step 3 — Set backend env vars
In the service environment, set all variables from section 5 with real secret values
(`DATABASE_URL`, `JWT_SECRET_KEY`, `INIT_ADMIN_USERNAME`, `INIT_ADMIN_PASSWORD`). Never commit them.
The service builds, runs migrations, and starts. Confirm the deploy log shows a successful
`alembic` upgrade and `uvicorn` listening on `$PORT`.

### Step 4 — Verify `/health/ready`
`GET https://<service>.onrender.com/health/ready` → `200` with `database: ok`, `schema: ok`,
`wallet_ledger_enabled: false`.

### Step 5 — Create Cloudflare Pages project
Create a Cloudflare Pages project connected to the GitHub repo. Root `pos-frontend`, build
`npm run build`, output `dist`, Node `20`.

### Step 6 — Set `VITE_API_BASE_URL`
In Cloudflare Pages environment variables (Production), set
`VITE_API_BASE_URL=https://<service>.onrender.com`, `VITE_WALLET_LEDGER_ENABLED=false`,
`VITE_ENABLE_DEMO_SEED=false`.

### Step 7 — Build/deploy frontend
Trigger a deploy. Confirm the `*.pages.dev` URL loads and SPA routes work.

### Step 8 — Run staging smoke test
Run `node scripts/smoke_staging.mjs` against the Render URL (set `STAGING_BASE_URL` and admin
credentials). Confirm core flow passes and smoke records are cleaned up.

### Step 9 — Create production admin
The backend auto-creates the admin from `INIT_ADMIN_USERNAME`/`INIT_ADMIN_PASSWORD` on first
startup (required in protected env). Log in and change the password immediately.

### Step 10 — Run first live transaction
Perform a real cash sale through the UI. Verify stock decrements, accounting entries post, and
`/health/ready` remains healthy.

---

## 12. Exact URLs

```
Frontend:  https://<project>.pages.dev
Backend:   https://<service>.onrender.com
Health:    https://<service>.onrender.com/health/ready
```

No custom domain is used, keeping the deployment at $0/month with no card.

---

## 13. Remaining Manual Operator Actions

- Generate a strong `JWT_SECRET_KEY` and set it on the service.
- Paste the real Neon `DATABASE_URL` (Direct, with `?sslmode=require`) on the service.
- Set real `INIT_ADMIN_USERNAME`/`INIT_ADMIN_PASSWORD`; change the password after first login.
- Set `VITE_API_BASE_URL` on Cloudflare to the real Render URL.
- Add a free uptime pinger (e.g. UptimeRobot) → `https://<service>.onrender.com/health/ready`
  so the Free Web Service does not spin down.
- Schedule periodic manual `python -m scripts.backup_postgres` runs and download the dumps.

---

## 14. Cost Confirmation

Frontend (Cloudflare Pages Free) + Backend (Render Free, no card) + Database (Neon Free, no card) +
Repo/CI (GitHub Free), no custom domain, no paid add-ons.
**Monthly hosting cost = $0, no credit card required.**
