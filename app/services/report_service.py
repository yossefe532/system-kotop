import logging

from sqlalchemy import case, func
from sqlalchemy.orm import Session, selectinload

from app.core.observability import log_event
from app.services.accounting import compute_cash_balance, compute_trial_balance, ensure_financial_period
from models import Book, CashDrawerSession, JournalEntry, JournalLine, Reservation, SafeTransaction, Supply, TransactionItem
from schemas import (
    BookStatsOut,
    FinanceReportOut,
    FinancialSummaryOut,
    FinancialValidationOut,
    JournalEntryOut,
    JournalLineOut,
    TrialBalanceLineOut,
)

operations_logger = logging.getLogger("pos_api.operations")


def calculate_safe_balance(db: Session) -> float:
    return compute_cash_balance(db)


def build_finance_report(db: Session) -> FinanceReportOut:
    safe_totals = (
        db.query(
            func.coalesce(
                func.sum(
                    case(
                        (SafeTransaction.type == "sale", SafeTransaction.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("revenue"),
            func.coalesce(
                func.sum(
                    case(
                        (SafeTransaction.type.in_(["withdrawal", "emergency", "supply"]), SafeTransaction.amount),
                        else_=0.0,
                    )
                ),
                0.0,
            ).label("withdrawals"),
        )
        .one()
    )
    revenue = float(safe_totals.revenue or 0.0)
    withdrawals = float(safe_totals.withdrawals or 0.0)
    cogs = float(db.query(func.coalesce(func.sum(TransactionItem.quantity * TransactionItem.cost_at_sale), 0.0)).scalar() or 0.0)
    gross_profit = revenue - cogs
    safe_balance = revenue - withdrawals
    supplier_due = float(db.query(func.coalesce(func.sum(Supply.total_cost - Supply.paid_amount), 0.0)).scalar() or 0.0)
    log_event(
        operations_logger,
        logging.INFO,
        "finance_report_generated",
        revenue=revenue,
        cogs=cogs,
        supplier_due=supplier_due,
    )
    return FinanceReportOut(
        revenue=revenue,
        cogs=cogs,
        gross_profit=gross_profit,
        withdrawals=withdrawals,
        safe_balance=safe_balance,
        supplier_due=supplier_due,
    )


def build_trial_balance_report(db: Session) -> list[TrialBalanceLineOut]:
    return [TrialBalanceLineOut(**line) for line in compute_trial_balance(db)]


def build_general_ledger_report(db: Session) -> list[JournalEntryOut]:
    entries = db.query(JournalEntry).options(selectinload(JournalEntry.lines).selectinload(JournalLine.account)).order_by(JournalEntry.event_timestamp.desc(), JournalEntry.id.desc()).all()
    result = []
    for entry in entries:
        result.append(
            JournalEntryOut(
                id=entry.id,
                entry_number=entry.entry_number,
                source_type=entry.source_type,
                source_id=entry.source_id,
                description=entry.description,
                reason=entry.reason,
                staff_name=entry.staff_name,
                status=entry.status,
                period_key=entry.period_key,
                event_timestamp=entry.event_timestamp,
                posted_at=entry.posted_at,
                is_reversal=entry.is_reversal,
                lines=[
                    JournalLineOut(
                        account_code=line.account.code,
                        account_name=line.account.name,
                        line_type=line.line_type,
                        amount=float(line.amount),
                        memo=line.memo,
                    )
                    for line in entry.lines
                ],
            )
        )
    return result


def build_income_summary(db: Session) -> FinancialSummaryOut:
    trial_balance = compute_trial_balance(db)
    revenue = abs(sum(line["net_balance"] for line in trial_balance if line["account_code"] == "4000"))
    sales_returns = sum(line["net_balance"] for line in trial_balance if line["account_code"] == "4020")
    cogs = sum(line["debits"] for line in trial_balance if line["account_code"] == "5000")
    gross_profit = revenue - sales_returns - cogs
    accounts_payable = abs(sum(line["net_balance"] for line in trial_balance if line["account_code"] == "2000"))
    return FinancialSummaryOut(
        period_key=ensure_financial_period(db).period_key,
        revenue=round(revenue, 2),
        sales_returns=round(sales_returns, 2),
        cogs=round(cogs, 2),
        gross_profit=round(gross_profit, 2),
        cash_balance=compute_cash_balance(db),
        accounts_payable=round(accounts_payable, 2),
    )


def build_financial_validation(db: Session) -> FinancialValidationOut:
    entries = db.query(JournalEntry).options(selectinload(JournalEntry.lines)).all()
    unbalanced = []
    for entry in entries:
        debit_total = round(sum(float(line.amount) for line in entry.lines if line.line_type == "debit"), 2)
        credit_total = round(sum(float(line.amount) for line in entry.lines if line.line_type == "credit"), 2)
        if debit_total != credit_total:
            unbalanced.append(entry.id)
    orphan_safe_transaction_ids = [
        row.id for row in db.query(SafeTransaction).filter(SafeTransaction.journal_entry_id.is_(None), SafeTransaction.source_type.isnot(None)).all()
    ]
    open_cash_drawer_count = db.query(CashDrawerSession).filter(CashDrawerSession.status == "open").count()
    return FinancialValidationOut(
        balanced_journal_entries=len(unbalanced) == 0,
        unbalanced_entry_ids=unbalanced,
        orphan_safe_transaction_ids=orphan_safe_transaction_ids,
        open_cash_drawer_count=open_cash_drawer_count,
        current_cash_balance=compute_cash_balance(db),
    )


def build_books_report(db: Session, skip: int, limit: int) -> list[BookStatsOut]:
    sold = (
        db.query(TransactionItem.book_id, func.coalesce(func.sum(TransactionItem.quantity), 0).label("sold_qty"))
        .group_by(TransactionItem.book_id)
        .subquery()
    )
    reserved = (
        db.query(Reservation.book_id, func.coalesce(func.sum(Reservation.quantity), 0).label("pending_reserved_qty"))
        .filter(Reservation.status == "pending")
        .group_by(Reservation.book_id)
        .subquery()
    )
    rows = (
        db.query(
            Book.id.label("book_id"),
            func.coalesce(sold.c.sold_qty, 0).label("sold_qty"),
            func.coalesce(reserved.c.pending_reserved_qty, 0).label("pending_reserved_qty"),
        )
        .outerjoin(sold, sold.c.book_id == Book.id)
        .outerjoin(reserved, reserved.c.book_id == Book.id)
        .order_by(Book.id.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    log_event(
        operations_logger,
        logging.INFO,
        "books_report_generated",
        row_count=len(rows),
    )
    return [BookStatsOut(book_id=r.book_id, sold_qty=int(r.sold_qty), pending_reserved_qty=int(r.pending_reserved_qty)) for r in rows]
