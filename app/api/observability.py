import json
import logging
from typing import Any

from fastapi import APIRouter, Header, Request, status
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.core.observability import log_event, observe_frontend_event, render_metrics
from app.core.security import get_security_config
from app.middleware.security import require_internal_token

logger = logging.getLogger("pos_api.frontend")
router = APIRouter(tags=["observability"])
security_config = get_security_config()


class FrontendTelemetryEvent(BaseModel):
    event: str = Field(min_length=2, max_length=100)
    level: str = Field(default="info", min_length=3, max_length=16)
    category: str = Field(default="frontend", min_length=2, max_length=32)
    queue_depth: int | None = Field(default=None, ge=0, le=100_000)
    replay_duration_ms: float | None = Field(default=None, ge=0, le=600_000)
    context: dict[str, Any] = Field(default_factory=dict, max_length=25)


@router.get("/metrics", include_in_schema=False)
def metrics_endpoint(x_internal_token: str | None = Header(default=None)):
    require_internal_token(x_internal_token, security_config.metrics_auth_token, "Metrics access denied")
    payload, content_type = render_metrics()
    return Response(content=payload, media_type=content_type)


@router.post("/observability/frontend-events", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def ingest_frontend_event(
    payload: FrontendTelemetryEvent,
    request: Request,
    x_telemetry_token: str | None = Header(default=None),
):
    if security_config.telemetry_ingest_token:
        require_internal_token(x_telemetry_token, security_config.telemetry_ingest_token, "Telemetry ingest denied")
    observe_frontend_event(
        payload.event,
        level=payload.level,
        queue_depth=payload.queue_depth,
        replay_duration_seconds=(payload.replay_duration_ms or 0) / 1000 if payload.replay_duration_ms else None,
    )
    log_event(
        logger,
        logging.INFO if payload.level != "error" else logging.ERROR,
        "frontend_telemetry_event",
        event_name=payload.event,
        category=payload.category,
        client_ip=request.client.host if request.client else None,
        user_agent=request.headers.get("user-agent"),
        telemetry=json.dumps(payload.context, ensure_ascii=False)[:1000],
        queue_depth=payload.queue_depth,
        replay_duration_ms=payload.replay_duration_ms,
    )
    return {"accepted": True}
