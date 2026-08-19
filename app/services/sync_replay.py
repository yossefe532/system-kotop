import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.exc import IntegrityError

from app.core.observability import log_event, observe_sync_event
from database import SessionLocal
from models import SyncReplayRecord

logger = logging.getLogger("pos_api.sync")

SYNC_OPERATION_ID_HEADER = "x-sync-operation-id"
SYNC_FINGERPRINT_HEADER = "x-sync-fingerprint"
SYNC_REPLAY_TOKEN_HEADER = "x-sync-replay-token"
SYNC_OPERATION_TYPE_HEADER = "x-sync-operation"


@dataclass
class SyncReplayState:
    enabled: bool
    operation_id: str | None = None
    fingerprint: str | None = None
    replay_token: str | None = None
    operation_type: str | None = None
    duplicate_response: JSONResponse | None = None


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _stable_json(payload: Any) -> str:
    return json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)


def build_request_fingerprint(payload: Any) -> str:
    return sha256(_stable_json(payload).encode("utf-8")).hexdigest()


def is_sync_replay_request(request: Request) -> bool:
    return bool(request.headers.get(SYNC_OPERATION_ID_HEADER) or request.headers.get(SYNC_OPERATION_TYPE_HEADER))


def conflict_status_code(sync_enabled: bool, default_status_code: int = status.HTTP_400_BAD_REQUEST) -> int:
    return status.HTTP_409_CONFLICT if sync_enabled else default_status_code


def _build_duplicate_response(record: SyncReplayRecord) -> JSONResponse:
    try:
        content = json.loads(record.response_body or "null")
    except json.JSONDecodeError:
        content = {"detail": "Replay acknowledged"}
    response = JSONResponse(
        status_code=record.response_status or status.HTTP_200_OK,
        content=content,
    )
    response.headers["X-Sync-Replay-Status"] = "duplicate"
    response.headers["X-Sync-Operation-Id"] = record.operation_id
    response.headers["X-Sync-Replay-Token"] = record.replay_token or ""
    return response


def begin_sync_replay(
    request: Request,
    payload: Any,
    default_operation_type: str,
) -> SyncReplayState:
    operation_id = request.headers.get(SYNC_OPERATION_ID_HEADER)
    if not operation_id:
        return SyncReplayState(enabled=False)

    fingerprint = request.headers.get(SYNC_FINGERPRINT_HEADER) or build_request_fingerprint(payload)
    replay_token = request.headers.get(SYNC_REPLAY_TOKEN_HEADER)
    operation_type = request.headers.get(SYNC_OPERATION_TYPE_HEADER) or default_operation_type
    now = _utcnow()

    with SessionLocal() as db:
        record = (
            db.query(SyncReplayRecord)
            .filter(SyncReplayRecord.operation_id == operation_id)
            .first()
        )
        if record:
            record.last_seen_at = now
            record.updated_at = now
            if record.fingerprint != fingerprint:
                record.status = "conflict"
                record.error_detail = "Fingerprint mismatch for duplicate operation id"
                db.commit()
                observe_sync_event("sync_duplicate_rejected", outcome="conflict")
                log_event(
                    logger,
                    logging.ERROR,
                    "sync_duplicate_rejected",
                    operation_id=operation_id,
                    request_path=request.url.path,
                )
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Replay conflict detected for this offline operation",
                )
            if record.status == "succeeded":
                db.commit()
                observe_sync_event("sync_duplicate_detected", outcome="duplicate")
                log_event(
                    logger,
                    logging.WARNING,
                    "sync_duplicate_detected",
                    operation_id=operation_id,
                    request_path=request.url.path,
                )
                return SyncReplayState(
                    enabled=True,
                    operation_id=operation_id,
                    fingerprint=fingerprint,
                    replay_token=replay_token,
                    operation_type=operation_type,
                    duplicate_response=_build_duplicate_response(record),
                )
            if record.status == "processing" and record.replay_token and replay_token and record.replay_token != replay_token:
                db.commit()
                observe_sync_event("sync_replay_locked", outcome="retry")
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="This offline operation is already being replayed",
                )
            record.replay_token = replay_token
            record.operation_type = operation_type
            record.request_method = request.method
            record.request_path = request.url.path
            record.status = "processing"
            record.error_detail = None
            db.commit()
            observe_sync_event("sync_replay_resumed", outcome="success")
            return SyncReplayState(
                enabled=True,
                operation_id=operation_id,
                fingerprint=fingerprint,
                replay_token=replay_token,
                operation_type=operation_type,
            )

        record = SyncReplayRecord(
            operation_id=operation_id,
            operation_type=operation_type,
            request_method=request.method,
            request_path=request.url.path,
            fingerprint=fingerprint,
            replay_token=replay_token,
            status="processing",
            created_at=now,
            updated_at=now,
            last_seen_at=now,
        )
        db.add(record)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            return begin_sync_replay(request, payload, default_operation_type)
        observe_sync_event("sync_replay_started", outcome="success")
        return SyncReplayState(
            enabled=True,
            operation_id=operation_id,
            fingerprint=fingerprint,
            replay_token=replay_token,
            operation_type=operation_type,
        )


def complete_sync_replay(
    replay_state: SyncReplayState,
    response_payload: Any,
    response_status: int,
) -> JSONResponse | Any:
    if not replay_state.enabled or not replay_state.operation_id:
        return response_payload

    serialized_body = jsonable_encoder(response_payload)
    now = _utcnow()
    with SessionLocal() as db:
        record = (
            db.query(SyncReplayRecord)
            .filter(SyncReplayRecord.operation_id == replay_state.operation_id)
            .first()
        )
        if record:
            record.status = "succeeded"
            record.response_status = response_status
            record.response_body = _stable_json(serialized_body)
            record.error_detail = None
            record.completed_at = now
            record.last_seen_at = now
            record.updated_at = now
            db.commit()

    observe_sync_event("sync_replay_acknowledged", outcome="success")
    response = JSONResponse(status_code=response_status, content=serialized_body)
    response.headers["X-Sync-Replay-Status"] = "acknowledged"
    response.headers["X-Sync-Operation-Id"] = replay_state.operation_id
    response.headers["X-Sync-Replay-Token"] = replay_state.replay_token or ""
    return response


def fail_sync_replay(
    replay_state: SyncReplayState,
    detail: str,
    response_status: int,
    outcome: str = "failed",
) -> None:
    if not replay_state.enabled or not replay_state.operation_id:
        return

    now = _utcnow()
    with SessionLocal() as db:
        record = (
            db.query(SyncReplayRecord)
            .filter(SyncReplayRecord.operation_id == replay_state.operation_id)
            .first()
        )
        if record:
            record.status = outcome
            record.response_status = response_status
            record.error_detail = detail[:1000]
            record.updated_at = now
            record.last_seen_at = now
            db.commit()

    observe_sync_event(
        "sync_replay_failed" if outcome == "failed" else "sync_replay_conflict",
        outcome="error" if outcome == "failed" else "conflict",
    )
    log_event(
        logger,
        logging.ERROR if outcome == "failed" else logging.WARNING,
        "sync_replay_failed" if outcome == "failed" else "sync_replay_conflict",
        operation_id=replay_state.operation_id,
        operation_type=replay_state.operation_type,
        response_status=response_status,
        detail=detail[:300],
    )
