from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, status
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import get_app_config
from app.core.feature_flags import is_wallet_ledger_enabled
from app.core.runtime import get_runtime_config
from app.core.security import get_security_config
from app.db.schema_guard import assert_schema_is_current
from app.api.deps import get_db
from database import engine
from models import SyncReplayRecord
from app.middleware.security import require_internal_token

router = APIRouter(tags=["health"])
STARTED_AT = datetime.now(timezone.utc)
security_config = get_security_config()


def _queue_health(db: Session) -> dict:
    replay_record_count = db.query(SyncReplayRecord).count()
    return {
        "replay_records": replay_record_count,
    }


@router.get("/health/live", include_in_schema=False)
def liveness():
    return {
        "status": "live",
        "started_at": STARTED_AT.isoformat(),
    }


@router.get("/health/ready", include_in_schema=False)
def readiness(db: Session = Depends(get_db), x_internal_token: str | None = Header(default=None)):
    if security_config.healthcheck_auth_token:
        require_internal_token(x_internal_token, security_config.healthcheck_auth_token, "Healthcheck access denied")
    db.execute(text("SELECT 1"))
    assert_schema_is_current(engine)
    runtime = get_runtime_config(get_app_config().auth.cors_allowed_origins)
    return {
        "status": "ready",
        "app_env": runtime.app_env,
        "release_version": runtime.release_version,
        "deployment_color": runtime.deployment_color,
        "database": "ok",
        "schema": "ok",
        "queue": _queue_health(db),
        "wallet_ledger_enabled": is_wallet_ledger_enabled(),
    }


@router.get("/health", include_in_schema=False)
def health_summary(db: Session = Depends(get_db), x_internal_token: str | None = Header(default=None)):
    if security_config.healthcheck_auth_token:
        require_internal_token(x_internal_token, security_config.healthcheck_auth_token, "Healthcheck access denied")
    response = readiness(db)
    response["status_code"] = status.HTTP_200_OK
    return response
