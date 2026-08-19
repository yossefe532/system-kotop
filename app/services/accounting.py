from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import inspect
from sqlalchemy.orm import Session

from models import (
    CashDrawerSession,
    FinancialAuditTrail,
    FinancialPeriod,
    InventorySession,
    JournalEntry,
    JournalLine,
    LedgerAccount,
    ReconciliationRun,
)


ACCOUNT_DEFINITIONS = [
    ("1000", "Cash On Hand", "asset", False),
    ("1100", "Accounts Receivable", "asset", False),
    ("1200", "Inventory", "asset", False),
    ("1300", "Student Wallet", "liability", False),
    ("2000", "Accounts Payable", "liability", False),
    ("4000", "Sales Revenue", "revenue", False),
    ("4010", "Reservation Deposits", "liability", False),
    ("4020", "Sales Returns", "contra_revenue", False),
    ("5000", "Cost Of Goods Sold", "expense", False),
    ("5100", "Inventory Adjustment", "expense", False),
    ("5200", "Cash Over Short", "expense", False),
    ("5300", "Correction Adjustment", "equity", True),
]


@dataclass(frozen=True)
class JournalLineInput:
    account_code: str
    line_type: str
    amount: float
    memo: str | None = None


def serialize_payload(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, default=str)


def ensure_accounting_seed_data(db: Session) -> None:
    if LedgerAccount.__table__.name not in inspect(db.connection()).get_table_names():
        return
    existing_codes = {row.code for row in db.query(LedgerAccount.code).all()}
    accounts_to_insert: list[LedgerAccount] = []
    for code, name, account_type, allow_manual in ACCOUNT_DEFINITIONS:
        if code in existing_codes:
            continue
        accounts_to_insert.append(
            LedgerAccount(
                code=code,
                name=name,
                account_type=account_type,
                is_active=True,
                allow_manual_entries=allow_manual,
                created_at=datetime.utcnow(),
            )
        )
    if accounts_to_insert:
        db.add_all(accounts_to_insert)
    db.flush()


def get_period_key(value: datetime | None = None) -> str:
    current = value or datetime.utcnow()
    return current.strftime("%Y-%m")


def ensure_financial_period(db: Session, event_timestamp: datetime | None = None) -> FinancialPeriod:
    current = event_timestamp or datetime.utcnow()
    period_key = get_period_key(current)
    period = (
        db.query(FinancialPeriod)
        .filter(FinancialPeriod.period_key == period_key, FinancialPeriod.period_type == "monthly")
        .first()
    )
    if period:
        return period
    starts_at = current.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    if current.month == 12:
        ends_at = starts_at.replace(year=current.year + 1, month=1)
    else:
        ends_at = starts_at.replace(month=current.month + 1)
    period = FinancialPeriod(
        period_key=period_key,
        period_type="monthly",
        starts_at=starts_at,
        ends_at=ends_at,
        status="open",
    )
    db.add(period)
    db.flush()
    return period


def ensure_period_is_open(db: Session, event_timestamp: datetime | None = None) -> FinancialPeriod:
    period = ensure_financial_period(db, event_timestamp)
    if period.status != "open":
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Financial period {period.period_key} is closed",
        )
    return period


def _resolve_accounts(db: Session, codes: list[str]) -> dict[str, LedgerAccount]:
    accounts = db.query(LedgerAccount).filter(LedgerAccount.code.in_(codes)).all()
    mapped = {account.code: account for account in accounts}
    missing = [code for code in codes if code not in mapped]
    if missing:
        raise RuntimeError(f"Missing ledger accounts: {', '.join(missing)}")
    return mapped


def _next_entry_number(db: Session, event_timestamp: datetime) -> str:
    prefix = event_timestamp.strftime("JE%Y%m%d")
    count = db.query(JournalEntry).filter(JournalEntry.entry_number.like(f"{prefix}%")).count() + 1
    return f"{prefix}-{count:05d}"


def create_journal_entry(
    db: Session,
    *,
    source_type: str,
    source_id: int,
    description: str,
    staff_name: str,
    lines: list[JournalLineInput],
    reason: str | None = None,
    reference: str | None = None,
    event_timestamp: datetime | None = None,
    metadata: dict[str, Any] | None = None,
    is_reversal: bool = False,
    reversal_of_entry_id: int | None = None,
) -> JournalEntry:
    ensure_accounting_seed_data(db)
    timestamp = event_timestamp or datetime.utcnow()
    period = ensure_period_is_open(db, timestamp)
    existing = (
        db.query(JournalEntry)
        .filter(JournalEntry.source_type == source_type, JournalEntry.source_id == source_id)
        .first()
    )
    if existing:
        return existing

    debit_total = round(sum(line.amount for line in lines if line.line_type == "debit"), 2)
    credit_total = round(sum(line.amount for line in lines if line.line_type == "credit"), 2)
    if debit_total != credit_total:
        raise RuntimeError("Journal entry is not balanced")
    if debit_total < 0:
        raise RuntimeError("Journal entry amounts cannot be negative")

    account_map = _resolve_accounts(db, [line.account_code for line in lines])
    entry = JournalEntry(
        entry_number=_next_entry_number(db, timestamp),
        source_type=source_type,
        source_id=source_id,
        reference=reference,
        description=description,
        reason=reason,
        staff_name=staff_name,
        status="posted",
        period_key=period.period_key,
        event_timestamp=timestamp,
        posted_at=datetime.utcnow(),
        is_reversal=is_reversal,
        reversal_of_entry_id=reversal_of_entry_id,
        metadata_json=serialize_payload(metadata or {}),
    )
    db.add(entry)
    db.flush()

    for line in lines:
        db.add(
            JournalLine(
                journal_entry_id=entry.id,
                account_id=account_map[line.account_code].id,
                line_type=line.line_type,
                amount=round(line.amount, 2),
                memo=line.memo,
            )
        )
    db.flush()
    return entry


def record_financial_audit(
    db: Session,
    *,
    entity_type: str,
    entity_id: int | None,
    action: str,
    staff_name: str,
    previous_value: dict[str, Any] | None = None,
    new_value: dict[str, Any] | None = None,
    reason: str | None = None,
    originating_transaction_type: str | None = None,
    originating_transaction_id: int | None = None,
) -> FinancialAuditTrail:
    audit = FinancialAuditTrail(
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        staff_name=staff_name,
        reason=reason,
        previous_value=serialize_payload(previous_value) if previous_value is not None else None,
        new_value=serialize_payload(new_value) if new_value is not None else None,
        originating_transaction_type=originating_transaction_type,
        originating_transaction_id=originating_transaction_id,
    )
    db.add(audit)
    db.flush()
    return audit


def compute_trial_balance(db: Session) -> list[dict[str, Any]]:
    ensure_accounting_seed_data(db)
    accounts = db.query(LedgerAccount).order_by(LedgerAccount.code.asc()).all()
    lines = db.query(JournalLine, JournalEntry).join(JournalEntry, JournalEntry.id == JournalLine.journal_entry_id).all()
    balances: dict[int, dict[str, float]] = {}
    for journal_line, _ in lines:
        account_balance = balances.setdefault(journal_line.account_id, {"debits": 0.0, "credits": 0.0})
        if journal_line.line_type == "debit":
            account_balance["debits"] += float(journal_line.amount or 0.0)
        else:
            account_balance["credits"] += float(journal_line.amount or 0.0)
    result = []
    for account in accounts:
        totals = balances.get(account.id, {"debits": 0.0, "credits": 0.0})
        result.append(
            {
                "account_code": account.code,
                "account_name": account.name,
                "account_type": account.account_type,
                "debits": round(totals["debits"], 2),
                "credits": round(totals["credits"], 2),
                "net_balance": round(totals["debits"] - totals["credits"], 2),
            }
        )
    return result


def open_cash_drawer_session(db: Session, *, staff_name: str, opening_balance: float, notes: str | None = None) -> CashDrawerSession:
    if opening_balance < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Opening balance cannot be negative")
    existing = (
        db.query(CashDrawerSession)
        .filter(CashDrawerSession.staff_name == staff_name, CashDrawerSession.status == "open")
        .first()
    )
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cash drawer is already open for this staff member")
    session = CashDrawerSession(
        staff_name=staff_name,
        opening_balance=opening_balance,
        status="open",
        notes=notes,
    )
    db.add(session)
    db.flush()
    record_financial_audit(
        db,
        entity_type="cash_drawer_session",
        entity_id=session.id,
        action="opened",
        staff_name=staff_name,
        new_value={"opening_balance": opening_balance, "notes": notes},
        reason="Cash drawer opening",
    )
    return session


def close_cash_drawer_session(
    db: Session,
    *,
    session: CashDrawerSession,
    counted_cash: float,
    supervisor_name: str | None,
    notes: str | None = None,
) -> CashDrawerSession:
    if session.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cash drawer session is not open")
    expected_cash = round(session.opening_balance + compute_cash_balance(db), 2)
    variance = round(counted_cash - expected_cash, 2)
    session.expected_cash = expected_cash
    session.counted_cash = counted_cash
    session.variance_amount = variance
    session.supervisor_name = supervisor_name
    session.notes = notes
    session.status = "closed" if variance == 0 else "variance_pending"
    session.closed_at = datetime.utcnow()
    db.flush()
    record_financial_audit(
        db,
        entity_type="cash_drawer_session",
        entity_id=session.id,
        action="closed",
        staff_name=session.staff_name,
        previous_value={"status": "open"},
        new_value={
            "status": session.status,
            "expected_cash": expected_cash,
            "counted_cash": counted_cash,
            "variance_amount": variance,
            "supervisor_name": supervisor_name,
            "notes": notes,
        },
        reason="Cash drawer closing",
    )
    return session


def compute_cash_balance(db: Session) -> float:
    trial_balance = compute_trial_balance(db)
    cash_account = next((entry for entry in trial_balance if entry["account_code"] == "1000"), None)
    return round(float(cash_account["net_balance"]) if cash_account else 0.0, 2)


def run_reconciliation(
    db: Session,
    *,
    reconciliation_type: str,
    period_key: str,
    starts_at: datetime,
    ends_at: datetime,
    staff_name: str,
    counted_cash: float | None = None,
    supervisor_name: str | None = None,
    notes: str | None = None,
) -> ReconciliationRun:
    expected_cash = compute_cash_balance(db)
    variance_amount = round((counted_cash if counted_cash is not None else expected_cash) - expected_cash, 2)
    journal_count = (
        db.query(JournalEntry)
        .filter(JournalEntry.event_timestamp >= starts_at, JournalEntry.event_timestamp < ends_at)
        .count()
    )
    safe_count = db.query(InventorySession).filter(InventorySession.timestamp >= starts_at, InventorySession.timestamp < ends_at).count()
    exception_count = 0 if journal_count >= safe_count else safe_count - journal_count
    status = "balanced" if variance_amount == 0 and exception_count == 0 else "exceptions"
    run = ReconciliationRun(
        reconciliation_type=reconciliation_type,
        period_key=period_key,
        starts_at=starts_at,
        ends_at=ends_at,
        expected_cash=expected_cash,
        counted_cash=counted_cash,
        variance_amount=variance_amount,
        exception_count=exception_count,
        status=status,
        staff_name=staff_name,
        supervisor_name=supervisor_name,
        notes=notes,
    )
    db.add(run)
    db.flush()
    record_financial_audit(
        db,
        entity_type="reconciliation_run",
        entity_id=run.id,
        action="created",
        staff_name=staff_name,
        new_value={
            "reconciliation_type": reconciliation_type,
            "period_key": period_key,
            "expected_cash": expected_cash,
            "counted_cash": counted_cash,
            "variance_amount": variance_amount,
            "exception_count": exception_count,
            "status": status,
        },
        reason="Financial reconciliation",
    )
    return run
