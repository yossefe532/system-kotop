import logging
from datetime import datetime
from fastapi import FastAPI, Depends, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from sqlalchemy.orm import Session

from database import SessionLocal, engine
from models import (
    AuditLog,
    User,
    CashDrawerSession,
    FinancialAuditTrail,
    FinancialPeriod,
    ReconciliationRun,
    SafeTransaction,
)
from schemas import (
    AuditLogCreate,
    AuditLogOut,
    EmergencyWithdrawalCreate,
    FinancialAuditTrailOut,
    ReconciliationRunCreate,
    ReconciliationRunOut,
    SafeTransactionOut,
    CashDrawerSessionCreate,
    CashDrawerSessionClose,
    CashDrawerSessionOut,
    FinancialPeriodClose,
    FinancialPeriodOut,
)
from auth.config import get_auth_config
from auth.dependencies import require_roles
from auth.router import router as auth_router
from auth.service import ensure_roles_and_admin
from app.api.deps import get_db
from app.api.health import router as health_router
from app.api.observability import router as observability_router
from app.api.routers.books import router as books_router
from app.api.routers.inventory import router as inventory_router
from app.api.routers.receipts import router as receipts_router
from app.api.routers.reports import router as reports_router
from app.api.routers.reports import financial_validation_report
from app.api.routers.reservations import router as reservations_router
from app.api.routers.students import router as students_router
from app.api.routers.transactions import router as transactions_router
from app.api.routers.wallet import router as wallet_router
from app.core.observability import configure_logging, log_event, observe_http_exception
from app.core.runtime import get_runtime_config, is_testing_env
from app.core.security import get_security_config
from app.db.schema_guard import assert_schema_is_current
from app.middleware.request_context import RequestContextMiddleware
from app.middleware.security import SecurityMiddleware
from app.services.accounting import (
    JournalLineInput,
    close_cash_drawer_session,
    create_journal_entry,
    ensure_accounting_seed_data,
    ensure_financial_period,
    open_cash_drawer_session,
    record_financial_audit,
    run_reconciliation,
)
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page

configure_logging()
logger = logging.getLogger("pos_api")
operations_logger = logging.getLogger("pos_api.operations")
auth_config = get_auth_config()
runtime_config = get_runtime_config(auth_config.cors_allowed_origins)
security_config = get_security_config()

assert_schema_is_current(engine)
if not is_testing_env():
    with SessionLocal() as bootstrap_db:
        ensure_roles_and_admin(bootstrap_db)
        ensure_accounting_seed_data(bootstrap_db)
        bootstrap_db.commit()

app = FastAPI(title="Educon POS API")
app.add_middleware(RequestContextMiddleware)
app.add_middleware(SecurityMiddleware, config=security_config)
app.add_middleware(GZipMiddleware, minimum_size=512)

if runtime_config.trusted_hosts:
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=runtime_config.trusted_hosts)

if runtime_config.require_https:
    app.add_middleware(HTTPSRedirectMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=auth_config.cors_allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=[
        "Authorization",
        "Content-Type",
        "X-Request-ID",
        "X-Client-Request-Source",
        "X-Sync-Operation",
        "X-Sync-Operation-Id",
        "X-Sync-Fingerprint",
        "X-Sync-Replay-Token",
    ],
    expose_headers=["X-Request-ID", "X-Sync-Replay-Status", "X-Sync-Operation-Id", "X-Sync-Replay-Token"],
)
app.include_router(health_router)
app.include_router(auth_router)
app.include_router(observability_router)
app.include_router(books_router)
app.include_router(students_router)
app.include_router(receipts_router)
app.include_router(inventory_router)
app.include_router(reports_router)
app.include_router(transactions_router)
app.include_router(reservations_router)
app.include_router(wallet_router)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    observe_http_exception(request.url.path, f"HTTP_{exc.status_code}")
    log_event(
        logger,
        logging.WARNING if exc.status_code < 500 else logging.ERROR,
        "http_exception",
        path=request.url.path,
        status_code=exc.status_code,
        detail=str(exc.detail),
        request_id=getattr(request.state, "request_id", "-"),
        user_id=getattr(request.state, "user_id", "-"),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "detail": exc.detail,
            "error": {
                "code": f"http_{exc.status_code}",
                "path": request.url.path,
            },
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    observe_http_exception(request.url.path, type(exc).__name__)
    log_event(
        logger,
        logging.ERROR,
        "unhandled_exception",
        path=request.url.path,
        error_type=type(exc).__name__,
        request_id=getattr(request.state, "request_id", "-"),
        user_id=getattr(request.state, "user_id", "-"),
    )
    logger.exception("unhandled_exception path=%s", request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={
            "detail": "Internal server error",
            "error": {
                "code": "internal_error",
                "path": request.url.path,
            },
        },
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(request: Request, exc: RequestValidationError):
    observe_http_exception(request.url.path, "request_validation_error")
    log_event(
        logger,
        logging.WARNING,
        "request_validation_error",
        path=request.url.path,
        request_id=getattr(request.state, "request_id", "-"),
        user_id=getattr(request.state, "user_id", "-"),
        error_count=len(exc.errors()),
    )
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation failed",
            "error": {
                "code": "request_validation_error",
                "path": request.url.path,
                "issues": exc.errors(),
            },
        },
    )


@app.post("/safe/emergency-withdrawals", response_model=SafeTransactionOut, status_code=status.HTTP_201_CREATED)
def emergency_withdrawal(
    request: Request,
    payload: EmergencyWithdrawalCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "emergency_withdrawal")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.amount <= 0:
        fail_sync_replay(replay_state, "Invalid withdrawal amount", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid withdrawal amount")
    transaction = SafeTransaction(
        amount=payload.amount,
        type="emergency",
        reason=payload.reason,
        staff_name=payload.staff_name,
        source_type="emergency_withdrawal",
    )
    db.add(transaction)
    db.flush()
    journal_entry = create_journal_entry(
        db,
        source_type="emergency_withdrawal",
        source_id=transaction.id,
        description="Emergency cash withdrawal",
        reason=payload.reason or "Emergency withdrawal",
        staff_name=payload.staff_name,
        reference=f"safe:{transaction.id}",
        metadata={"amount": payload.amount},
        lines=[
            JournalLineInput("5300", "debit", payload.amount, "Emergency or correction withdrawal"),
            JournalLineInput("1000", "credit", payload.amount, "Cash removed from drawer"),
        ],
    )
    transaction.journal_entry = journal_entry
    record_financial_audit(
        db,
        entity_type="safe_transaction",
        entity_id=transaction.id,
        action="created",
        staff_name=payload.staff_name,
        new_value={"amount": payload.amount, "type": "emergency", "reason": payload.reason},
        reason="Emergency withdrawal created",
        originating_transaction_type="emergency_withdrawal",
        originating_transaction_id=transaction.id,
    )
    transaction_id = transaction.id
    db.commit()
    transaction = db.query(SafeTransaction).filter(SafeTransaction.id == transaction_id).first()
    log_event(
        operations_logger,
        logging.WARNING,
        "emergency_withdrawal_recorded",
        transaction_id=transaction.id,
        amount=payload.amount,
        staff_name=payload.staff_name,
    )
    return complete_sync_replay(replay_state, transaction, status.HTTP_201_CREATED)


@app.post("/audit-logs", response_model=AuditLogOut, status_code=status.HTTP_201_CREATED)
def create_audit_log(
    payload: AuditLogCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    log = AuditLog(**payload.model_dump())
    db.add(log)
    db.commit()
    db.refresh(log)
    log_event(
        operations_logger,
        logging.INFO,
        "audit_log_created",
        audit_log_id=log.id,
        action_type=log.action,
    )
    return log


@app.get("/financial-audit-trail", response_model=list[FinancialAuditTrailOut])
def list_financial_audit_trail(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(FinancialAuditTrail)
        .order_by(FinancialAuditTrail.created_at.desc(), FinancialAuditTrail.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.get("/cash-drawer/sessions", response_model=list[CashDrawerSessionOut])
def list_cash_drawer_sessions(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(CashDrawerSession)
        .order_by(CashDrawerSession.opened_at.desc(), CashDrawerSession.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.post("/cash-drawer/sessions", response_model=CashDrawerSessionOut, status_code=status.HTTP_201_CREATED)
def create_cash_drawer_session(
    payload: CashDrawerSessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    session = open_cash_drawer_session(
        db,
        staff_name=payload.staff_name,
        opening_balance=payload.opening_balance,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(session)
    return session


@app.post("/cash-drawer/sessions/{session_id}/close", response_model=CashDrawerSessionOut)
def close_cash_drawer(
    session_id: int,
    payload: CashDrawerSessionClose,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    session = db.query(CashDrawerSession).filter(CashDrawerSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Cash drawer session not found")
    close_cash_drawer_session(
        db,
        session=session,
        counted_cash=payload.counted_cash,
        supervisor_name=payload.supervisor_name,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(session)
    return session


@app.get("/reconciliations", response_model=list[ReconciliationRunOut])
def list_reconciliations(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(ReconciliationRun)
        .order_by(ReconciliationRun.created_at.desc(), ReconciliationRun.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.post("/reconciliations", response_model=ReconciliationRunOut, status_code=status.HTTP_201_CREATED)
def create_reconciliation_run(
    payload: ReconciliationRunCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    run = run_reconciliation(
        db,
        reconciliation_type=payload.reconciliation_type,
        period_key=payload.period_key,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        counted_cash=payload.counted_cash,
        staff_name=payload.staff_name,
        supervisor_name=payload.supervisor_name,
        notes=payload.notes,
    )
    db.commit()
    db.refresh(run)
    return run


@app.get("/financial-periods", response_model=list[FinancialPeriodOut])
def list_financial_periods(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    ensure_financial_period(db)
    db.commit()
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(FinancialPeriod)
        .order_by(FinancialPeriod.period_key.desc(), FinancialPeriod.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@app.post("/financial-periods/{period_key}/close", response_model=FinancialPeriodOut)
def close_financial_period(
    period_key: str,
    payload: FinancialPeriodClose,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    period = (
        db.query(FinancialPeriod)
        .filter(FinancialPeriod.period_key == period_key, FinancialPeriod.period_type == "monthly")
        .first()
    )
    if not period:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Financial period not found")
    if period.status != "open":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Financial period is already closed")
    validation = financial_validation_report(db, _=None)
    if not validation.balanced_journal_entries:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Cannot close a period with unbalanced journal entries")
    period.status = "closed"
    period.closed_at = datetime.utcnow()
    period.closed_by = payload.closed_by
    period.notes = payload.notes
    record_financial_audit(
        db,
        entity_type="financial_period",
        entity_id=period.id,
        action="closed",
        staff_name=payload.closed_by,
        previous_value={"status": "open"},
        new_value={"status": "closed", "notes": payload.notes},
        reason="Financial period closed",
        originating_transaction_type="financial_period",
        originating_transaction_id=period.id,
    )
    db.commit()
    db.refresh(period)
    return period


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
