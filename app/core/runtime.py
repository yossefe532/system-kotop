import os
from dataclasses import dataclass


VALID_APP_ENVS = {"local", "development", "staging", "production", "test"}
PROTECTED_APP_ENVS = {"staging", "production"}


def parse_csv_env(value: str | None) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def current_app_env() -> str:
    env = os.getenv("APP_ENV", "development").strip().lower() or "development"
    if env not in VALID_APP_ENVS:
        raise RuntimeError(
            f"Unsupported APP_ENV '{env}'. Expected one of: {', '.join(sorted(VALID_APP_ENVS))}."
        )
    return env


def is_protected_env(app_env: str | None = None) -> bool:
    env = app_env or current_app_env()
    return bool(os.getenv("RAILWAY_ENVIRONMENT")) or env in PROTECTED_APP_ENVS


def is_testing_env(app_env: str | None = None) -> bool:
    env = app_env or current_app_env()
    return env == "test"


@dataclass(frozen=True)
class RuntimeConfig:
    app_env: str
    release_version: str
    deployment_color: str
    metrics_enabled: bool
    trusted_hosts: list[str]
    cors_allowed_origins: list[str]
    log_level: str
    require_https: bool


def get_runtime_config(cors_allowed_origins: list[str] | None = None) -> RuntimeConfig:
    app_env = current_app_env()
    protected = is_protected_env(app_env)
    trusted_hosts = parse_csv_env(os.getenv("TRUSTED_HOSTS"))
    release_version = os.getenv("RELEASE_VERSION", "").strip() or os.getenv("RAILWAY_GIT_COMMIT_SHA", "").strip() or "dev"
    deployment_color = os.getenv("DEPLOYMENT_COLOR", "").strip().lower() or "primary"
    log_level = os.getenv("LOG_LEVEL", "INFO").strip().upper() or "INFO"
    metrics_enabled = os.getenv("METRICS_ENABLED", "true").strip().lower() not in {"0", "false", "no", "off"}
    require_https = protected or os.getenv("FORCE_HTTPS", "").strip().lower() in {"1", "true", "yes", "on"}
    resolved_cors = cors_allowed_origins or []

    if protected and not trusted_hosts:
        raise RuntimeError("TRUSTED_HOSTS is required in staging and production.")
    if protected and not resolved_cors:
        raise RuntimeError("CORS_ALLOWED_ORIGINS must be explicitly configured in staging and production.")

    return RuntimeConfig(
        app_env=app_env,
        release_version=release_version,
        deployment_color=deployment_color,
        metrics_enabled=metrics_enabled,
        trusted_hosts=trusted_hosts,
        cors_allowed_origins=resolved_cors,
        log_level=log_level,
        require_https=require_https,
    )
