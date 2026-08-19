from __future__ import annotations

import json
import logging
import math
from datetime import datetime
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.feature_flags import is_wallet_ledger_enabled
from app.services.accounting import JournalLineInput, create_journal_entry, record_financial_audit
from models import Student, StudentWalletEntry

logger = logging.getLogger("pos_api.wallet")

VALID_ENTRY_TYPES = {
    "purchase_debt",
    "deposit_change",
    "purchase_wallet",
    "pickup_wallet",
    "refund_cancel_reservation",
    "refund_return_sale",
    "manual_adjustment",
    "correction",
    "migration_opening_balance",
}


def _direction_for(amount: float) -> str:
    if amount > 0:
        return "credit"
    if amount < 0:
        return "debit"
    return "neutral"


def _serialize_metadata(metadata: Optional[dict]) -> Optional[str]:
    if metadata is None:
        return None
    return json.dumps(metadata, ensure_ascii=False, sort_keys=True, default=str)


def _journal_lines_for(entry_type: str, amount: float) -> list[JournalLineInput]:
    """Exact accounting mappings from the approved Phase 1.1 architecture.

    Amounts are absolute magnitudes; the wallet `amount` sign selects direction
    only for manual/correction/migration entries.
    """
    abs_amt = abs(amount)
    if entry_type == "purchase_debt":
        return [
            JournalLineInput("1100", "debit", abs_amt, "Accounts receivable for underpaid sale"),
            JournalLineInput("4000", "credit", abs_amt, "Sales revenue recognized"),
        ]
    if entry_type == "deposit_change":
        return [
            JournalLineInput("1000", "debit", abs_amt, "Cash received into student wallet"),
            JournalLineInput("1300", "credit", abs_amt, "Student wallet liability funded"),
        ]
    if entry_type in ("purchase_wallet", "pickup_wallet"):
        return [
            JournalLineInput("1300", "debit", abs_amt, "Student wallet spent"),
            JournalLineInput("4000", "credit", abs_amt, "Sales revenue recognized"),
        ]
    if entry_type == "refund_cancel_reservation":
        return [
            JournalLineInput("4010", "debit", abs_amt, "Reservation deposit released"),
            JournalLineInput("1300", "credit", abs_amt, "Student wallet refunded"),
        ]
    if entry_type == "refund_return_sale":
        return [
            JournalLineInput("4020", "debit", abs_amt, "Sales return"),
            JournalLineInput("1300", "credit", abs_amt, "Student wallet refunded"),
        ]
    if entry_type in ("manual_adjustment", "correction"):
        if amount >= 0:
            return [
                JournalLineInput("5300", "debit", abs_amt, "Correction adjustment"),
                JournalLineInput("1300", "credit", abs_amt, "Student wallet adjusted"),
            ]
        return [
            JournalLineInput("1300", "debit", abs_amt, "Student wallet adjusted"),
            JournalLineInput("5300", "credit", abs_amt, "Correction adjustment"),
        ]
    if entry_type == "migration_opening_balance":
        if amount >= 0:
            return [
                JournalLineInput("5300", "debit", abs_amt, "Opening balance equity offset"),
                JournalLineInput("1300", "credit", abs_amt, "Student wallet opening balance"),
            ]
        return [
            JournalLineInput("1100", "debit", abs_amt, "Accounts receivable opening"),
            JournalLineInput("5300", "credit", abs_amt, "Opening balance equity offset"),
        ]
    raise ValueError(f"Unknown entry_type: {entry_type}")


def create_wallet_entry(
    db: Session,
    *,
    student_id: int,
    entry_type: str,
    amount: float,
    source_type: str,
    source_id: Optional[int] = None,
    operation_id: str,
    actor: str,
    device_id: Optional[str] = None,
    reason: Optional[str] = None,
    metadata: Optional[dict] = None,
    balance_before_override: Optional[float] = None,
    apply_to_student_balance: bool = True,
) -> StudentWalletEntry:
    """Create one immutable wallet ledger entry plus its accounting journal.

    All database writes (wallet entry, balance update, journal, audit) are
    performed within the caller's transaction. This function never commits,
    so a journal failure propagated to the caller's rollback leaves no partial
    wallet state.
    """
    if entry_type not in VALID_ENTRY_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid wallet entry_type: {entry_type}",
        )
    if not operation_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="operation_id is required for wallet entries",
        )
    if not math.isfinite(amount):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Wallet amount must be a finite number",
        )

    existing = (
        db.query(StudentWalletEntry)
        .filter(StudentWalletEntry.operation_id == operation_id)
        .first()
    )
    if existing is not None:
        payload_matches = (
            existing.student_id == student_id
            and existing.entry_type == entry_type
            and round(float(existing.amount), 2) == round(float(amount), 2)
            and existing.source_type == source_type
            and existing.source_id == source_id
        )
        if payload_matches:
            return existing
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="operation_id already used for a different wallet entry",
        )

    student = db.query(Student).filter(Student.id == student_id).with_for_update().first()
    if student is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Student not found",
        )

    balance_before = float(student.balance) if balance_before_override is None else float(balance_before_override)
    balance_after = balance_before + float(amount)

    entry = StudentWalletEntry(
        student_id=student_id,
        entry_type=entry_type,
        amount=float(amount),
        direction=_direction_for(amount),
        source_type=source_type,
        source_id=source_id,
        operation_id=operation_id,
        balance_before=balance_before,
        balance_after=balance_after,
        created_at=datetime.utcnow(),
        created_by=actor,
        device_id=device_id,
        reversal_of_entry_id=None,
        metadata_json=_serialize_metadata(metadata),
    )
    db.add(entry)
    db.flush()

    if apply_to_student_balance:
        student.balance = balance_after
        db.flush()

    journal = create_journal_entry(
        db,
        source_type="student_wallet",
        source_id=entry.id,
        description=f"Student wallet {entry_type}",
        reason=reason or f"Wallet {entry_type}",
        staff_name=actor,
        reference=f"wallet:{entry.id}",
        metadata={
            "student_id": student_id,
            "entry_type": entry_type,
            "operation_id": operation_id,
        },
        lines=_journal_lines_for(entry_type, float(amount)),
    )

    record_financial_audit(
        db,
        entity_type="student_wallet",
        entity_id=entry.id,
        action="wallet_entry_created",
        staff_name=actor,
        previous_value={"balance": balance_before},
        new_value={"balance": balance_after, "amount": float(amount), "entry_type": entry_type},
        reason=reason or f"Wallet {entry_type}",
        originating_transaction_type=source_type,
        originating_transaction_id=source_id,
    )

    return entry


def _ledger_sum(db: Session, student_id: int) -> float:
    result = (
        db.query(func.coalesce(func.sum(StudentWalletEntry.amount), 0.0))
        .filter(StudentWalletEntry.student_id == student_id)
        .scalar()
    )
    return float(result or 0.0)


def generate_opening_balance_entries(
    db: Session,
    *,
    migration_run_id: str,
    actor: str,
    reason: Optional[str] = None,
    dry_run: bool = False,
) -> dict:
    """Seed one `migration_opening_balance` entry per student.

    Deterministic, idempotent and safe to run in dry-run mode. The legacy
    `students.balance` is preserved; the opening entry is computed so that the
    ledger sum equals the cached balance (balance_before = current ledger sum,
    amount = legacy - current ledger sum, balance_after = legacy).
    """
    if not migration_run_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="migration_run_id is required",
        )

    students = db.query(Student).order_by(Student.id.asc()).all()
    previews: list[dict] = []
    created_count = 0
    skipped_count = 0

    try:
        for student in students:
            op_id = f"migration_opening_balance:{migration_run_id}:{student.id}"
            legacy = float(student.balance)
            current_sum = _ledger_sum(db, student.id)
            existing = (
                db.query(StudentWalletEntry)
                .filter(StudentWalletEntry.operation_id == op_id)
                .first()
            )
            if existing is not None:
                skipped_count += 1
                previews.append(
                    {
                        "student_id": student.id,
                        "operation_id": op_id,
                        "entry_type": existing.entry_type,
                        "amount": float(existing.amount),
                        "balance_before": float(existing.balance_before),
                        "balance_after": float(existing.balance_after),
                        "status": "skipped",
                    }
                )
                continue

            amount = round(legacy - current_sum, 2)
            preview = {
                "student_id": student.id,
                "operation_id": op_id,
                "entry_type": "migration_opening_balance",
                "amount": amount,
                "balance_before": round(current_sum, 2),
                "balance_after": round(legacy, 2),
                "status": "created" if not dry_run else "dry_run",
            }
            previews.append(preview)

            if not dry_run:
                create_wallet_entry(
                    db,
                    student_id=student.id,
                    entry_type="migration_opening_balance",
                    amount=amount,
                    source_type="migration",
                    source_id=student.id,
                    operation_id=op_id,
                    actor=actor,
                    reason=reason or f"Opening balance migration {migration_run_id}",
                    metadata={"legacy_balance": legacy, "migration_run_id": migration_run_id},
                    balance_before_override=current_sum,
                    apply_to_student_balance=False,
                )
                created_count += 1

        if dry_run:
            db.rollback()
        else:
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("wallet_opening_balance_migration_failed run=%s", migration_run_id)
        raise

    return {
        "migration_run_id": migration_run_id,
        "dry_run": dry_run,
        "processed_count": created_count,
        "skipped_count": skipped_count,
        "entries": previews,
    }
