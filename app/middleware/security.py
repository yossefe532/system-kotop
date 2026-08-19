from __future__ import annotations

import asyncio
import time
from collections import deque

from fastapi import HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.core.security import SecurityConfig


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, deque[float]] = {}
        self._lock = asyncio.Lock()

    async def allow(self, key: str, limit: int, window_seconds: int = 60) -> bool:
        now = time.time()
        async with self._lock:
            bucket = self._buckets.setdefault(key, deque())
            cutoff = now - window_seconds
            while bucket and bucket[0] <= cutoff:
                bucket.popleft()
            if len(bucket) >= limit:
                return False
            bucket.append(now)
            return True


rate_limiter = InMemoryRateLimiter()


def _client_ip(request) -> str:
    if request.client and request.client.host:
        return request.client.host
    return "unknown"


def _limit_for_request(request, config: SecurityConfig) -> int:
    path = request.url.path
    if path.startswith("/auth/"):
        return config.auth_rate_limit_per_minute
    if path.startswith("/observability/frontend-events"):
        return config.telemetry_rate_limit_per_minute
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        return config.write_rate_limit_per_minute
    return config.general_rate_limit_per_minute


class SecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, config: SecurityConfig):
        super().__init__(app)
        self.config = config

    async def dispatch(self, request, call_next):
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > self.config.max_request_body_bytes:
                    return JSONResponse(
                        status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        content={"detail": "Request body too large"},
                    )
            except ValueError:
                pass

        if self.config.rate_limiting_enabled:
            auth_identity = request.headers.get("authorization", "")[:32]
            key = f"{_client_ip(request)}:{request.method}:{request.url.path}:{auth_identity}"
            limit = _limit_for_request(request, self.config)
            allowed = await rate_limiter.allow(key, limit)
            if not allowed:
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={"detail": "Too many requests"},
                    headers={"Retry-After": "60"},
                )

        response = await call_next(request)
        if self.config.security_headers_enabled:
            response.headers["X-Content-Type-Options"] = "nosniff"
            response.headers["X-Frame-Options"] = "DENY"
            response.headers["Referrer-Policy"] = self.config.referrer_policy
            response.headers["Permissions-Policy"] = self.config.permissions_policy
            response.headers["Cache-Control"] = response.headers.get("Cache-Control", "no-store")
            if self.config.hsts_max_age > 0:
                response.headers["Strict-Transport-Security"] = (
                    f"max-age={self.config.hsts_max_age}; includeSubDomains"
                )
        return response


def require_internal_token(provided_token: str | None, expected_token: str | None, detail: str) -> None:
    if expected_token and provided_token == expected_token:
        return
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)
