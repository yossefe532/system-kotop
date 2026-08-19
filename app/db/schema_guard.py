import os

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from app.core.runtime import current_app_env, is_protected_env

ALEMBIC_HEAD_REVISION = "20260816_0005"


def _as_bool(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _schema_enforcement_enabled() -> bool:
    explicit = os.getenv("ENFORCE_SCHEMA_VERSION")
    if explicit is not None:
        return _as_bool(explicit)
    return is_protected_env(current_app_env())


def assert_schema_is_current(engine: Engine) -> None:
    if not _schema_enforcement_enabled():
        return

    expected = os.getenv("REQUIRED_ALEMBIC_REVISION", ALEMBIC_HEAD_REVISION).strip() or ALEMBIC_HEAD_REVISION
    inspector = inspect(engine)
    if not inspector.has_table("alembic_version"):
        raise RuntimeError(
            "Database schema is unmanaged. Run migrations first: `alembic upgrade head`."
        )

    with engine.connect() as conn:
        current = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1")).scalar()
    if not current:
        raise RuntimeError("alembic_version is empty. Run `alembic upgrade head` before startup.")
    if str(current).strip() != expected:
        raise RuntimeError(
            f"Database schema revision mismatch. Expected {expected}, got {current}. "
            "Run `alembic upgrade head` before startup."
        )
