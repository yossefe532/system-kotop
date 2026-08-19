# EduCore POS — Backup & Restore (Production Recovery)

## Backup

The repository ships `scripts/backup_postgres.py` (invoked as
`python -m scripts.backup_postgres`). It performs a `pg_dump` of `DATABASE_URL` into a
timestamped file under `backups/` and exits non-zero on failure.

Run immediately before any production deployment and after any manual data change:

```bash
python -m scripts.backup_postgres
```

Note (Neon Free — the primary DB): Neon Free keeps data on separate storage and offers a
6-hour point-in-time restore window, but for a durable off-host copy keep running this manual
dump and download it to local/external storage. The same applies if you use Supabase Free
(no automatic backups). Record the filename in the runbook.

Notes:
- The script is **manual** — it is intentionally not wired into the deploy pipeline.
- Store the resulting dump off the database host (object storage / separate volume).
- Record the filename in the deployment runbook.

## Restore

`backup_postgres.py` performs only the dump step. Restoration is a manual operator
action using the PostgreSQL client tools:

1. Stop or drain the API traffic (scale the web service to 0 or enable maintenance).
2. Confirm the target database connection and that you have a valid dump file.
3. Restore with `pg_restore` (for custom-format dumps) or `psql` (for plain SQL dumps):

   ```bash
   # Plain SQL dump:
   psql "$DATABASE_URL" -f backups/<timestamp>.sql

   # Custom format dump:
   pg_restore --clean --if-exists -d "$DATABASE_URL" backups/<timestamp>.dump
   ```

4. Re-run schema consistency by restarting the backend; the startup schema guard
   (`assert_schema_is_current`) will verify the alembic version matches
   `REQUIRED_ALEMBIC_REVISION`.
5. Run `GET /health/ready`; confirm `database: ok` and `schema: ok` before re-enabling
   traffic.
6. If the restore changed the alembic version, ensure `REQUIRED_ALEMBIC_REVISION`
   matches the restored state before restarting.

## Guardrails
- Never restore a production dump into a shared/dev database.
- After restoring to a clone for inspection, keep `WALLET_LEDGER_ENABLED=false` and
  `VITE_ENABLE_DEMO_SEED=false` so no production-like data is exposed through the UI.
- Do not run the demo seed against restored production data.
