# Backend Consolidation Guide

## Authoritative Backend
- Canonical runtime entrypoint: `main.py`.
- Stable import alias: `app/bootstrap.py` (`from main import app`).
- Canonical database/model/schema sources:
  - `database.py`
  - `models.py`
  - `schemas.py`

## Legacy Paths (Isolated)
- `backend/app.py` is a compatibility shim importing `main.app`.
- `backend/database.py`, `backend/models.py`, and `backend/schemas.py` are compatibility shims importing canonical modules.
- The legacy Cloudflare worker (`src/worker.py` + root `wrangler.toml`) and the old JS worker (`backend/src/index.js`, `backend/wrangler.toml`, `backend/Dockerfile`) have been removed.
- Any Cloudflare route still serving `src/worker.py` must be deleted in the Cloudflare dashboard; the worker returns `410 Gone` unless `ENABLE_LEGACY_WORKER=true`, so it is inert until removed.

## Incremental Modular Structure
- `app/core/config.py` centralizes top-level app configuration access.
- `app/db/session.py` re-exports canonical DB lifecycle.
- `app/models/__init__.py` and `app/schemas/__init__.py` re-export canonical contracts.
- `app/repositories/*` and `app/services/*` provide incremental migration targets.

## Migration Policy
1. Keep all endpoint behavior in `main.py` unchanged while extracting logic incrementally.
2. Move data-access into repositories one route group at a time.
3. Move orchestration/business rules into services per domain.
4. Keep old modules as import shims until all external references are migrated.
5. Remove legacy shims only after deployment/runtime references are verified clean.

## Deployment Safety
- Do not deploy `backend/*` as an independent backend implementation.
- Use production startup:
  - `uvicorn main:app` (current)
  - or `uvicorn app.bootstrap:app` (stable alias)
- If Cloudflare Python Worker route is still present, set:
  - `ENABLE_LEGACY_WORKER=false` in production by default.
