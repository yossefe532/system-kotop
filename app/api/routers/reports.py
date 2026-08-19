from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.report_service import (
    build_books_report,
    build_finance_report,
    build_financial_validation,
    build_general_ledger_report,
    build_income_summary,
    build_trial_balance_report,
)
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from auth.dependencies import require_roles
from models import User
from schemas import (
    BookStatsOut,
    FinanceReportOut,
    FinancialSummaryOut,
    FinancialValidationOut,
    JournalEntryOut,
    TrialBalanceLineOut,
)

router = APIRouter(prefix="/reports")


@router.get("/finance", response_model=FinanceReportOut)
def finance_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    return build_finance_report(db)


@router.get("/trial-balance", response_model=list[TrialBalanceLineOut])
def trial_balance_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    return build_trial_balance_report(db)


@router.get("/general-ledger", response_model=list[JournalEntryOut])
def general_ledger_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    return build_general_ledger_report(db)


@router.get("/income-summary", response_model=FinancialSummaryOut)
def income_summary_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    return build_income_summary(db)


@router.get("/financial-validation", response_model=FinancialValidationOut)
def financial_validation_report(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    return build_financial_validation(db)


@router.get("/books", response_model=list[BookStatsOut])
def books_report(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return build_books_report(db, skip, limit)