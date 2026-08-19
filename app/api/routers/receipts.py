import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, load_only

from app.api.deps import get_db
from app.core.observability import log_event
from app.services.receipt_archive_service import deserialize_receipt_payload, serialize_receipt_payload
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from auth.dependencies import require_roles
from models import ReceiptArchive, User
from schemas import ReceiptArchiveCreate, ReceiptArchiveOut

router = APIRouter(prefix="/receipt-archive")
operations_logger = logging.getLogger("pos_api.operations")


@router.post("", response_model=ReceiptArchiveOut, status_code=status.HTTP_201_CREATED)
def archive_receipt(
    request: Request,
    payload: ReceiptArchiveCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "receipt_archive")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    try:
        serialized = serialize_receipt_payload(payload.payload)
    except Exception:
        fail_sync_replay(replay_state, "Invalid payload", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid payload")
    entry = ReceiptArchive(
        transaction_code=payload.transaction_code,
        receipt_type=payload.receipt_type,
        staff_name=payload.staff_name,
        payload=serialized,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    log_event(
        operations_logger,
        logging.INFO,
        "receipt_archived",
        receipt_id=entry.id,
        transaction_code=payload.transaction_code,
        receipt_type=payload.receipt_type,
    )
    response_payload = ReceiptArchiveOut(
        id=entry.id,
        transaction_code=entry.transaction_code,
        receipt_type=entry.receipt_type,
        staff_name=entry.staff_name,
        payload=payload.payload,
        printed_at=entry.printed_at,
    )
    return complete_sync_replay(replay_state, response_payload, status.HTTP_201_CREATED)


@router.get("", response_model=list[ReceiptArchiveOut])
def list_receipt_archive(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    items = (
        db.query(ReceiptArchive)
        .options(load_only(ReceiptArchive.id, ReceiptArchive.transaction_code, ReceiptArchive.receipt_type, ReceiptArchive.staff_name, ReceiptArchive.payload, ReceiptArchive.printed_at))
        .order_by(ReceiptArchive.printed_at.desc(), ReceiptArchive.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    result: list[ReceiptArchiveOut] = []
    for entry in items:
        payload = deserialize_receipt_payload(entry.payload)
        result.append(
            ReceiptArchiveOut(
                id=entry.id,
                transaction_code=entry.transaction_code,
                receipt_type=entry.receipt_type,
                staff_name=entry.staff_name,
                payload=payload,
                printed_at=entry.printed_at,
            )
        )
    return result