import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware

from app.core.observability import (
    clear_request_context,
    log_event,
    observe_http_exception,
    observe_http_request,
    set_request_context,
)

logger = logging.getLogger("pos_api.request")


class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        request.state.request_id = request_id
        set_request_context(request_id=request_id)
        start = time.perf_counter()
        source = request.headers.get("x-client-request-source")
        sync_operation = request.headers.get("x-sync-operation")

        log_event(
            logger,
            logging.INFO,
            "request_started",
            method=request.method,
            path=request.url.path,
            client_ip=request.client.host if request.client else None,
            source=source,
            sync_operation=sync_operation,
        )

        try:
            response = await call_next(request)
        except Exception as exc:
            duration = time.perf_counter() - start
            observe_http_exception(request.url.path, type(exc).__name__)
            log_event(
                logger,
                logging.ERROR,
                "request_failed",
                method=request.method,
                path=request.url.path,
                latency_ms=round(duration * 1000, 2),
                error_type=type(exc).__name__,
                source=source,
                sync_operation=sync_operation,
            )
            clear_request_context()
            raise

        duration = time.perf_counter() - start
        route_path = getattr(request.scope.get("route"), "path", request.url.path)
        observe_http_request(request.method, route_path, response.status_code, duration)
        response.headers["X-Request-ID"] = request_id
        log_event(
            logger,
            logging.INFO,
            "request_completed",
            method=request.method,
            path=route_path,
            status_code=response.status_code,
            latency_ms=round(duration * 1000, 2),
            source=source,
            sync_operation=sync_operation,
        )
        clear_request_context()
        return response
