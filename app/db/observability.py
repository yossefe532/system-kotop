import logging
import time

from sqlalchemy import event

from app.core.observability import adjust_db_pool, log_event, observe_db_query, observe_db_transaction

logger = logging.getLogger("pos_api.db")


def install_database_observability(engine, session_factory) -> None:
    if getattr(engine, "_educon_db_observability_installed", False):
        return
    engine._educon_db_observability_installed = True

    @event.listens_for(engine, "before_cursor_execute")
    def before_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        context._query_started_at = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after_cursor_execute(conn, cursor, statement, parameters, context, executemany):
        elapsed = time.perf_counter() - getattr(context, "_query_started_at", time.perf_counter())
        observe_db_query(statement, elapsed, "success")
        if elapsed >= 0.5:
            log_event(
                logger,
                logging.WARNING,
                "slow_query_detected",
                statement_preview=" ".join(str(statement).split())[:160],
                duration_ms=round(elapsed * 1000, 2),
            )

    @event.listens_for(engine, "handle_error")
    def handle_error(exception_context):
        observe_db_query(exception_context.statement, 0, "error")
        log_event(
            logger,
            logging.ERROR,
            "db_query_error",
            statement_preview=" ".join(str(exception_context.statement or "").split())[:160],
            error_type=type(exception_context.original_exception).__name__,
        )

    if hasattr(engine, "pool") and not getattr(engine.pool, "_educon_pool_observability_installed", False):
        engine.pool._educon_pool_observability_installed = True

        @event.listens_for(engine.pool, "checkout")
        def checkout(dbapi_connection, connection_record, connection_proxy):
            adjust_db_pool(1)

        @event.listens_for(engine.pool, "checkin")
        def checkin(dbapi_connection, connection_record):
            adjust_db_pool(-1)

    session_cls = session_factory.class_
    if getattr(session_cls, "_educon_session_observability_installed", False):
        return
    session_cls._educon_session_observability_installed = True

    @event.listens_for(session_cls, "after_commit")
    def after_commit(session):
        observe_db_transaction("commit")

    @event.listens_for(session_cls, "after_rollback")
    def after_rollback(session):
        observe_db_transaction("rollback")
