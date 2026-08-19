import os
from dataclasses import dataclass

from app.core.runtime import is_protected_env, is_testing_env


def _as_int(name: str, default: int) -> int:
    raw = os.getenv(name, str(default)).strip()
    try:
        return int(raw)
    except ValueError:
        return default


def _as_bool(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class SecurityConfig:
    rate_limiting_enabled: bool
    max_request_body_bytes: int
    general_rate_limit_per_minute: int
    write_rate_limit_per_minute: int
    auth_rate_limit_per_minute: int
    telemetry_rate_limit_per_minute: int
    metrics_auth_token: str | None
    healthcheck_auth_token: str | None
    telemetry_ingest_token: str | None
    security_headers_enabled: bool
    referrer_policy: str
    permissions_policy: str
    hsts_max_age: int
    frontend_csp: str
    secure_cookie_domain: str | None
    secure_cookie_samesite: str
    allow_bootstrap_admin_fallback: bool


def get_security_config() -> SecurityConfig:
    protected = is_protected_env()
    return SecurityConfig(
        rate_limiting_enabled=not is_testing_env() and _as_bool("RATE_LIMITING_ENABLED", True),
        max_request_body_bytes=max(_as_int("MAX_REQUEST_BODY_BYTES", 1_048_576), 16_384),
        general_rate_limit_per_minute=max(_as_int("GENERAL_RATE_LIMIT_PER_MINUTE", 600), 30),
        write_rate_limit_per_minute=max(_as_int("WRITE_RATE_LIMIT_PER_MINUTE", 180), 10),
        auth_rate_limit_per_minute=max(_as_int("AUTH_RATE_LIMIT_PER_MINUTE", 20), 5),
        telemetry_rate_limit_per_minute=max(_as_int("TELEMETRY_RATE_LIMIT_PER_MINUTE", 120), 10),
        metrics_auth_token=os.getenv("METRICS_AUTH_TOKEN", "").strip() or None,
        healthcheck_auth_token=os.getenv("HEALTHCHECK_AUTH_TOKEN", "").strip() or None,
        telemetry_ingest_token=os.getenv("TELEMETRY_INGEST_TOKEN", "").strip() or None,
        security_headers_enabled=_as_bool("SECURITY_HEADERS_ENABLED", True),
        referrer_policy=os.getenv("SECURITY_REFERRER_POLICY", "strict-origin-when-cross-origin").strip()
        or "strict-origin-when-cross-origin",
        permissions_policy=os.getenv(
            "SECURITY_PERMISSIONS_POLICY",
            "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        ).strip()
        or "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
        hsts_max_age=max(_as_int("SECURITY_HSTS_MAX_AGE", 31_536_000), 0),
        frontend_csp=os.getenv(
            "FRONTEND_CONTENT_SECURITY_POLICY",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; font-src 'self' data:; connect-src 'self'; "
            "frame-ancestors 'self'; base-uri 'self'; object-src 'none';",
        ).strip(),
        secure_cookie_domain=os.getenv("SECURE_COOKIE_DOMAIN", "").strip() or None,
        secure_cookie_samesite=os.getenv("SECURE_COOKIE_SAMESITE", "strict").strip().lower() or "strict",
        allow_bootstrap_admin_fallback=_as_bool("ALLOW_BOOTSTRAP_ADMIN_FALLBACK", not protected),
    )
