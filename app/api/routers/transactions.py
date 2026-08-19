from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.transaction_service import create_transaction as create_transaction_action
from app.services.transaction_service import list_safe_transactions as list_safe_transactions_action
from app.services.transaction_service import list_transactions as list_transactions_action
from app.utils.pagination import PAGE_DEFAULT_LIMIT
from auth.dependencies import require_roles
from models import User
from schemas import SafeTransactionOut, TransactionCreate, TransactionOut

router = APIRouter()


@router.post("/transactions", response_model=TransactionOut, status_code=status.HTTP_201_CREATED)
def create_transaction(
    request: Request,
    payload: TransactionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return create_transaction_action(db, request, payload)


@router.get("/safe/transactions", response_model=list[SafeTransactionOut])
def list_safe_transactions(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    return list_safe_transactions_action(db, skip, limit)


@router.get("/transactions", response_model=list[TransactionOut])
def list_transactions(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return list_transactions_action(db, skip, limit)