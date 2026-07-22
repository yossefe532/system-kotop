import contextvars
import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from typing import Any

from prometheus_client import CONTENT_TYPE_LATEST, Counter, Gauge, Histogram, generate_latest

request_id_var = contextvars.ContextVar("request_id", default="-")
user_id_var = contextvars.ContextVar("user_id", default="-")

_STANDARD_ATTRS = {
    "args",
    "asctime",
    "created",
    "exc_info",
    "exc_text",
    "filename",
    "funcName",
    "levelname",
    "levelno",
    "lineno",
    "module",
    "msecs",
    "message",
    "msg",
    "name",
    "pathname",
    "process",
    "processName",
    "relativeCreated",
    "stack_info",
    "thread",
    "threadName",
}


class JsonLogFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", request_id_var.get()),
            "user_id": getattr(record, "user_id", user_id_var.get()),
        }
        extras = {
            key: value
            for key, value in record.__dict__.items()
            if key not in _STANDARD_ATTRS and not key.startswith("_")
        }
        if extras:
            payload.update(extras)
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False, default=str)


def configure_logging() -> None:
    root_logger = logging.getLogger()
    if getattr(root_logger, "_educon_observability_configured", False):
        return

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    root_logger.setLevel(level)
    formatter = JsonLogFormatter()

    stream_handler = logging.StreamHandler(sys.stdout)
    stream_handler.setFormatter(formatter)
    root_logger.handlers = [stream_handler]

    log_file = os.getenv("LOG_FILE")
    if log_file:
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=int(os.getenv("LOG_MAX_BYTES", "10485760")),
            backupCount=int(os.getenv("LOG_BACKUP_COUNT", "5")),
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    root_logger._educon_observability_configured = True


HTTP_REQUESTS_TOTAL = Counter(
    "educon_http_requests_total",
    "HTTP requests processed by method, route, and status.",
    ["method", "path", "status_code"],
)
HTTP_REQUEST_LATENCY = Histogram(
    "educon_http_request_duration_seconds",
    "HTTP request latency in seconds.",
    ["method", "path"],
)
HTTP_EXCEPTIONS_TOTAL = Counter(
    "educon_http_exceptions_total",
    "Unhandled and handled exception counts.",
    ["path", "exception_type"],
)
DB_QUERY_LATENCY = Histogram(
    "educon_db_query_duration_seconds",
    "Database query execution time in seconds.",
    ["operation", "outcome"],
)
DB_SLOW_QUERIES_TOTAL = Counter(
    "educon_db_slow_queries_total",
    "Number of slow database queries.",
    ["operation"],
)
DB_POOL_IN_USE = Gauge(
    "educon_db_pool_in_use",
    "Approximate number of checked out database connections.",
)
DB_TRANSACTIONS_TOTAL = Counter(
    "educon_db_transactions_total",
    "Database transaction outcomes.",
    ["outcome"],
)
AUTH_EVENTS_TOTAL = Counter(
    "educon_auth_events_total",
    "Authentication and authorization events.",
    ["event"],
)
SYNC_EVENTS_TOTAL = Counter(
    "educon_sync_events_total",
    "Sync engine events from backend and frontend telemetry.",
    ["event", "outcome"],
)
FRONTEND_EVENTS_TOTAL = Counter(
    "educon_frontend_events_total",
    "Frontend telemetry events ingested by the backend.",
    ["event", "level"],
)
OFFLINE_QUEUE_DEPTH = Gauge(
    "educon_offline_queue_depth",
    "Current client-reported offline queue depth.",
)
OFFLINE_REPLAY_LATENCY = Histogram(
    "educon_offline_replay_duration_seconds",
    "Client-reported replay durations.",
    ["outcome"],
)


def set_request_context(request_id: str | None = None, user_id: str | None = None) -> None:
    if request_id is not None:
        request_id_var.set(str(request_id))
    if user_id is not None:
        user_id_var.set(str(user_id))


def clear_request_context() -> None:
    request_id_var.set("-")
    user_id_var.set("-")


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    logger.log(level, event, extra={"event": event, **fields})


def normalize_statement(statement: str | None) -> str:
    if not statement:
        return "unknown"
    collapsed = " ".join(str(statement).split())
    if not collapsed:
        return "unknown"
    head = collapsed.split(" ", 1)[0].upper()
    return head[:48]


def observe_http_request(method: str, path: str, status_code: int, duration_seconds: float) -> None:
    HTTP_REQUESTS_TOTAL.labels(method=method, path=path, status_code=str(status_code)).inc()
    HTTP_REQUEST_LATENCY.labels(method=method, path=path).observe(max(duration_seconds, 0))


def observe_http_exception(path: str, exception_type: str) -> None:
    HTTP_EXCEPTIONS_TOTAL.labels(path=path, exception_type=exception_type).inc()


def observe_db_query(statement: str | None, duration_seconds: float, outcome: str = "success") -> None:
    operation = normalize_statement(statement)
    DB_QUERY_LATENCY.labels(operation=operation, outcome=outcome).observe(max(duration_seconds, 0))
    threshold_seconds = float(os.getenv("DB_SLOW_QUERY_SECONDS", "0.5"))
    if duration_seconds >= threshold_seconds:
        DB_SLOW_QUERIES_TOTAL.labels(operation=operation).inc()


def adjust_db_pool(delta: int) -> None:
    if delta > 0:
        DB_POOL_IN_USE.inc(delta)
    elif delta < 0:
        DB_POOL_IN_USE.dec(abs(delta))


def observe_db_transaction(outcome: str) -> None:
    DB_TRANSACTIONS_TOTAL.labels(outcome=outcome).inc()


def observe_auth_event(event: str) -> None:
    AUTH_EVENTS_TOTAL.labels(event=event).inc()


def observe_sync_event(event: str, outcome: str = "success", queue_depth: int | None = None, duration_seconds: float | None = None) -> None:
    SYNC_EVENTS_TOTAL.labels(event=event, outcome=outcome).inc()
    if queue_depth is not None:
        OFFLINE_QUEUE_DEPTH.set(max(queue_depth, 0))
    if duration_seconds is not None:
        OFFLINE_REPLAY_LATENCY.labels(outcome=outcome).observe(max(duration_seconds, 0))


def observe_frontend_event(event: str, level: str = "info", queue_depth: int | None = None, replay_duration_seconds: float | None = None) -> None:
    FRONTEND_EVENTS_TOTAL.labels(event=event, level=level).inc()
    if queue_depth is not None:
        OFFLINE_QUEUE_DEPTH.set(max(queue_depth, 0))
    if replay_duration_seconds is not None:
        OFFLINE_REPLAY_LATENCY.labels(outcome=level).observe(max(replay_duration_seconds, 0))


def render_metrics() -> tuple[bytes, str]:
    return generate_latest(), CONTENT_TYPE_LATEST
