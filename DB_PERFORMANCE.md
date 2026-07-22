# Database Performance Optimization

## Implemented Changes

- Added production-safe indexes in `alembic/versions/20261210_0002_db_performance_indexes.py`
- Tuned PostgreSQL connection pool in `database.py`
- Added eager loading for `User.roles` in auth dependencies
- Eliminated transaction list N+1 loading by eager loading `Transaction.items`
- Reduced checkout round-trips by bulk loading and locking books and reservations
- Reduced report scans by consolidating finance safe-transaction aggregation
- Added stable secondary ordering and conservative page-size caps for heavy list endpoints

## Highest-Impact Bottlenecks Addressed

- N+1 transaction serialization
- Per-item checkout queries
- Missing indexes on foreign keys and sort columns
- Repeated financial aggregations over the same table
- Unbounded list endpoint limits on growing datasets
- Untuned PostgreSQL pooling defaults

## Index Strategy

- Single-column indexes:
  - `transactions.student_id`
  - `transactions.date`
  - `transaction_items.transaction_id`
  - `transaction_items.book_id`
  - `reservations.status`
  - `reservations.created_at`
  - `reservations.book_id`
  - `safe_transactions.type`
  - `safe_transactions.timestamp`
  - `supplies.book_id`
  - `supplies.timestamp`
  - `inventory_sessions.timestamp`
  - `receipt_archives.printed_at`
- Composite indexes:
  - `reservations(student_id, book_id, status)`
  - `reservations(status, created_at)`
  - `safe_transactions(type, timestamp)`

## Cursor Pagination Migration Plan

- Current APIs remain offset-compatible to preserve frontend behavior.
- First optimization layer uses:
  - indexed ordering
  - deterministic secondary sort by `id`
  - capped page sizes
- Recommended next phase:
  - add optional `cursor` parameter for time-ordered endpoints
  - keep `skip/limit` for backward compatibility
  - migrate frontend incrementally without contract breakage

## Reporting Strategy

- Finance report now reduces safe transaction scans into one aggregate query.
- Book report keeps the same contract but uses indexes better and deterministic ordering.
- Next phase for very large datasets:
  - short-lived cache for admin dashboards
  - daily summary tables or materialized views for finance and sales analytics

## Deployment Recommendations

- Run `alembic upgrade head` before app restart
- Tune env vars for PostgreSQL:
  - `DB_POOL_SIZE`
  - `DB_MAX_OVERFLOW`
  - `DB_POOL_RECYCLE`
  - `DB_POOL_TIMEOUT`
- Monitor:
  - slow queries
  - rollback count
  - pool usage
  - finance/report latency

## Safety Notes

- No existing API contract changed
- No business logic was rewritten
- No production data is deleted or rebuilt
- All optimizations are additive or query-shape improvements
