# Testing Infrastructure

## Implemented Layers

- Backend pytest integration suite with isolated SQLite test database
- Database constraint and rollback tests for persistence safety
- Frontend Vitest + jsdom + Testing Library setup
- Sync/auth unit and integration-oriented frontend tests
- Playwright E2E scaffold for browser journeys
- GitHub Actions CI for backend, frontend, and Playwright execution

## Folder Structure

- `tests/`
  - `conftest.py`
  - `test_auth.py`
  - `test_database_constraints.py`
  - `test_reservations.py`
  - `test_transactions.py`
  - `test_finance_inventory.py`
  - `test_sync_replay.py`
- `pos-frontend/src/`
  - `authSession.test.js`
  - `LoginPage.test.jsx`
  - existing sync tests
- `pos-frontend/src/test/setup.js`
- `e2e/`
  - `app-shell.spec.js`
- `.github/workflows/ci.yml`

## Why Each Layer Exists

- Backend integration tests verify API contracts, auth, and transactional business rules.
- Database tests verify constraints, foreign keys, and rollback integrity below the API layer.
- Frontend tests verify auth/session behavior, UI interactions, and sync-side deterministic logic.
- E2E scaffolding verifies real browser startup and user-journey expansion paths.
- CI prevents regressions from landing unnoticed.

## Current Priority Coverage

- Auth login, refresh, logout, and RBAC
- Database uniqueness, foreign-key enforcement, and rollback safety
- Reservation create/duplicate/cancel flow
- Transaction inventory and rollback behavior
- Supply and inventory session finance effects
- Frontend login and auth retry behavior
- Sync replay duplicate/conflict/failure handling

## Next Recommended Expansion

- Add explicit Alembic migration smoke tests and schema-guard assertions
- Add report endpoint assertions with seeded multi-book data
- Add receipt archive and observability endpoint tests
- Add IndexedDB bootstrap/migration tests
- Add reconnect manager and replay manager unit tests
- Add route protection and checkout page integration tests
- Add full offline replay E2E with mocked backend
- Add load-testing scripts for auth, checkout, reports, and sync
