# Backup And Disaster Recovery

## Backup Strategy
- Use managed PostgreSQL automated snapshots plus point-in-time recovery where available.
- Run scheduled logical backups with [backup_postgres.py](file:///e:/شغل/شغل/project/scripts/backup_postgres.py).
- Store backups in encrypted remote object storage.
- Retain daily backups for 14 days, weekly backups for 8 weeks, and monthly backups for 12 months.

## Backup Verification
- Restore the latest backup into an isolated staging database every week.
- Run `alembic current` and backend smoke tests against the restored database.
- Record backup timestamp, restore timestamp, and verification result.

## Restore Procedure
1. Announce maintenance and stop application writes.
2. Provision a clean PostgreSQL instance.
3. Set `DATABASE_URL` to the target instance.
4. Run `python -m scripts.restore_postgres <backup-file>`.
5. Run `python -m scripts.run_migrations`.
6. Start backend and verify `/health/ready`.
7. Re-enable traffic after smoke validation.

## Disaster Recovery Targets
- Target RPO: 15 minutes or better with managed PITR.
- Target RTO: 60 minutes for full service restoration.

## Failure Scenarios
- Single-node app failure: rely on rolling replacement and health probes.
- Bad deploy: use [ROLLBACK.md](file:///e:/شغل/شغل/project/ROLLBACK.md).
- Database corruption: restore from last verified backup and replay only trusted external events.
- Secrets leak: rotate all affected secrets, revoke old credentials, redeploy, and audit access logs.
