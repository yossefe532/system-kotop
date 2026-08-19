from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import Student, StudentWalletEntry

logger = logging.getLogger("pos_api.wallet")


def reconcile_wallet(db: Session) -> list[dict[str, Any]]:
    """Compare the immutable wallet ledger sum against the cached balance.

    This wave reports mismatches only. It does NOT auto-correct balances.
    Automatic repair is deferred to a later controlled task.
    """
    results: list[dict[str, Any]] = []
    students = db.query(Student).order_by(Student.id.asc()).all()
    for student in students:
        derived = (
            db.query(func.coalesce(func.sum(StudentWalletEntry.amount), 0.0))
            .filter(StudentWalletEntry.student_id == student.id)
            .scalar()
        )
        derived_balance = round(float(derived or 0.0), 2)
        cached_balance = round(float(student.balance), 2)
        matches = derived_balance == cached_balance
        if not matches:
            logger.warning(
                "wallet_reconciliation_mismatch student=%s derived=%.2f cached=%.2f",
                student.id,
                derived_balance,
                cached_balance,
            )
        results.append(
            {
                "student_id": student.id,
                "derived_balance": derived_balance,
                "cached_balance": cached_balance,
                "matches": matches,
            }
        )
    return results
