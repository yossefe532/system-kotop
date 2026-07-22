import json
import logging
from typing import Any

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field
from starlette.responses import Response

from app.core.observability import log_event, observe_frontend_event, render_metrics

logger = logging.getLogger("pos_api.frontend")
router = APIRouter(tags=["observability"])


class FrontendTelemetryEvent(BaseModel):
    event: str
    level: str = "info"
    category: str = "frontend"
    queue_depth: int | None = None
    replay_duration_ms: float | None = None
    context: dict[str, Any] = Field(default_factory=dict)


@router.get("/metrics", include_in_schema=False)
def metrics_endpoint():
    payload, content_type = render_metrics()
    return Response(content=payload, media_type=content_type)


@router.post("/observability/frontend-events", status_code=status.HTTP_202_ACCEPTED, include_in_schema=False)
async def ingest_frontend_event(payload: FrontendTelemetryEvent, request: Request):
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
