from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

logger = logging.getLogger("pos_api.wallet")

from app.api.deps import get_db
from app.core.feature_flags import is_wallet_ledger_enabled
from app.services.student_wallet import create_wallet_entry, generate_opening_balance_entries
from app.services.student_wallet_reconciliation import reconcile_wallet
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from auth.dependencies import require_roles
from models import Student, StudentWalletEntry, User
from schemas import (
    WalletBalanceOut,
    WalletEntryCreate,
    WalletEntryOut,
    WalletMigrationRequest,
    WalletMigrationResult,
    WalletReconciliationOut,
)

router = APIRouter(prefix="/students")


def _require_ledger_enabled() -> None:
    if not is_wallet_ledger_enabled():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Student wallet ledger is disabled",
        )


if is_wallet_ledger_enabled():
    logger.warning(
        "WALLET_LEDGER_ENABLED=true: the frontend build MUST also set "
        "VITE_WALLET_LEDGER_ENABLED=true, otherwise offline wallet replay "
        "will receive HTTP 503 from this endpoint."
    )


@router.post("/{student_id}/wallet/entries", response_model=WalletEntryOut, status_code=status.HTTP_201_CREATED)
def create_student_wallet_entry(
    student_id: int,
    payload: WalletEntryCreate,
    request: Request,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("cashier", "manager", "admin")),
):
    _require_ledger_enabled()
    actor = payload.actor or user.username
    device_id = payload.device_id or request.headers.get("x-device-id")
    try:
        entry = create_wallet_entry(
            db,
            student_id=student_id,
            entry_type=payload.entry_type,
            amount=payload.amount,
            source_type=payload.source_type,
            source_id=payload.source_id,
            operation_id=payload.operation_id,
            actor=actor,
            device_id=device_id,
            reason=payload.reason,
            metadata=payload.metadata,
        )
        db.commit()
        db.refresh(entry)
        return entry
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        logger.exception("wallet_entry_creation_failed student=%s", student_id)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Wallet entry creation failed")


@router.get("/{student_id}/wallet/entries", response_model=list[WalletEntryOut])
def list_student_wallet_entries(
    student_id: int,
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    _require_ledger_enabled()
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(StudentWalletEntry)
        .filter(StudentWalletEntry.student_id == student_id)
        .order_by(StudentWalletEntry.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{student_id}/wallet/balance", response_model=WalletBalanceOut)
def get_student_wallet_balance(
    student_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    _require_ledger_enabled()
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return {"student_id": student.id, "balance": float(student.balance)}


@router.post("/wallet/migration/opening-balances", response_model=WalletMigrationResult)
def run_wallet_opening_balance_migration(
    payload: WalletMigrationRequest,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("admin")),
):
    _require_ledger_enabled()
    actor = payload.actor or user.username
    return generate_opening_balance_entries(
        db,
        migration_run_id=payload.migration_run_id,
        actor=actor,
        reason=payload.reason,
        dry_run=payload.dry_run,
    )


@router.get("/wallet/reconciliation", response_model=list[WalletReconciliationOut])
def wallet_reconciliation(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    _require_ledger_enabled()
    return reconcile_wallet(db)
