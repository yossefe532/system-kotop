import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session, load_only

from app.api.deps import get_db
from app.core.observability import log_event
from app.services.accounting import JournalLineInput, create_journal_entry, record_financial_audit
from app.services.report_service import calculate_safe_balance
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from auth.dependencies import require_roles
from models import Book, InventorySession, SafeTransaction, Supply, User
from schemas import InventorySessionCreate, InventorySessionOut, SupplyCreate, SupplyOut

router = APIRouter()
operations_logger = logging.getLogger("pos_api.operations")


@router.post("/supplies", response_model=SupplyOut, status_code=status.HTTP_201_CREATED)
def create_supply(
    request: Request,
    payload: SupplyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "supply_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.quantity <= 0:
        fail_sync_replay(replay_state, "Invalid quantity", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid quantity")
    if payload.unit_cost < 0:
        fail_sync_replay(replay_state, "Invalid unit cost", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid unit cost")
    if payload.paid_amount < 0:
        fail_sync_replay(replay_state, "Invalid paid amount", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid paid amount")

    book = db.query(Book).filter(Book.id == payload.book_id).with_for_update().first()
    if not book:
        fail_sync_replay(replay_state, "Book not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")

    total_cost = float(payload.unit_cost) * int(payload.quantity)
    if payload.paid_amount > total_cost:
        fail_sync_replay(replay_state, "Paid amount exceeds total cost", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid amount exceeds total cost")

    supply = Supply(
        book_id=payload.book_id,
        quantity=payload.quantity,
        unit_cost=payload.unit_cost,
        total_cost=total_cost,
        paid_amount=payload.paid_amount,
        supplier_name=payload.supplier_name,
        staff_name=payload.staff_name,
    )
    book.total_stock += payload.quantity
    db.add(supply)
    db.flush()
    journal_lines = [
        JournalLineInput("1200", "debit", total_cost, "Inventory received from supplier"),
    ]
    if payload.paid_amount > 0:
        journal_lines.extend(
            [
                JournalLineInput("1000", "credit", payload.paid_amount, "Cash paid to supplier"),
                JournalLineInput("2000", "credit", round(total_cost - payload.paid_amount, 2), "Supplier payable recognized"),
            ]
        )
    else:
        journal_lines.append(JournalLineInput("2000", "credit", total_cost, "Supplier payable recognized"))
    journal_entry = create_journal_entry(
        db,
        source_type="supply",
        source_id=supply.id,
        description="Inventory supply intake",
        reason="Supply created",
        staff_name=payload.staff_name,
        reference=f"supply:{supply.id}",
        metadata={
            "book_id": payload.book_id,
            "quantity": payload.quantity,
            "supplier_name": payload.supplier_name,
        },
        lines=journal_lines,
    )
    if payload.paid_amount > 0:
        db.add(
            SafeTransaction(
                amount=payload.paid_amount,
                type="supply",
                reason="Supply payment",
                staff_name=payload.staff_name,
                source_type="supply",
                source_id=supply.id,
                journal_entry_id=journal_entry.id,
            )
        )
    record_financial_audit(
        db,
        entity_type="supply",
        entity_id=supply.id,
        action="created",
        staff_name=payload.staff_name,
        new_value={
            "book_id": payload.book_id,
            "quantity": payload.quantity,
            "total_cost": total_cost,
            "paid_amount": payload.paid_amount,
            "supplier_name": payload.supplier_name,
        },
        reason="Supply created",
        originating_transaction_type="supply",
        originating_transaction_id=supply.id,
    )
    db.commit()
    log_event(
        operations_logger,
        logging.INFO,
        "supply_created",
        supply_id=supply.id,
        book_id=payload.book_id,
        quantity=payload.quantity,
        paid_amount=payload.paid_amount,
    )
    return complete_sync_replay(replay_state, supply, status.HTTP_201_CREATED)


@router.get("/supplies", response_model=list[SupplyOut])
def list_supplies(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(Supply)
        .options(load_only(Supply.id, Supply.book_id, Supply.quantity, Supply.unit_cost, Supply.total_cost, Supply.paid_amount, Supply.supplier_name, Supply.staff_name, Supply.timestamp))
        .order_by(Supply.timestamp.desc(), Supply.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/inventory-sessions", response_model=list[InventorySessionOut])
def list_inventory_sessions(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(InventorySession)
        .options(load_only(InventorySession.id, InventorySession.staff_name, InventorySession.total_cash_found, InventorySession.timestamp))
        .order_by(InventorySession.timestamp.desc(), InventorySession.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.post("/inventory-sessions", response_model=InventorySessionOut, status_code=status.HTTP_201_CREATED)
def create_inventory_session(
    request: Request,
    payload: InventorySessionCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "inventory_session_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.total_cash_found < 0:
        fail_sync_replay(replay_state, "Invalid cash amount", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cash amount")
    current_balance = calculate_safe_balance(db)
    variance_amount = round(payload.total_cash_found - current_balance, 2)
    session = InventorySession(
        **payload.model_dump(),
        expected_cash=current_balance,
        variance_amount=variance_amount,
        status="reconciled" if variance_amount == 0 else "variance_pending",
    )
    db.add(session)
    if current_balance > 0:
        db.flush()
        journal_entry = create_journal_entry(
            db,
            source_type="inventory_session",
            source_id=session.id,
            description="Daily closing withdrawal",
            reason="Inventory session closing",
            staff_name=payload.staff_name,
            reference=f"inventory-session:{session.id}",
            metadata={
                "expected_cash": current_balance,
                "counted_cash": payload.total_cash_found,
                "variance_amount": variance_amount,
            },
            lines=[
                JournalLineInput("5300", "debit", current_balance, "Daily close clearing entry"),
                JournalLineInput("1000", "credit", current_balance, "Cash removed during closing"),
            ],
        )
        db.add(
            SafeTransaction(
                amount=current_balance,
                type="withdrawal",
                reason="Inventory audit reset",
                staff_name=payload.staff_name,
                source_type="inventory_session",
                source_id=session.id,
                journal_entry_id=journal_entry.id,
            )
        )
    record_financial_audit(
        db,
        entity_type="inventory_session",
        entity_id=session.id,
        action="created",
        staff_name=payload.staff_name,
        new_value={
            "expected_cash": current_balance,
            "counted_cash": payload.total_cash_found,
            "variance_amount": variance_amount,
            "status": session.status,
        },
        reason="Inventory session created",
        originating_transaction_type="inventory_session",
        originating_transaction_id=session.id,
    )
    db.commit()
    log_event(
        operations_logger,
        logging.INFO,
        "inventory_session_created",
        inventory_session_id=session.id,
        total_cash_found=session.total_cash_found,
        expected_safe_balance=current_balance,
    )
    return complete_sync_replay(replay_state, session, status.HTTP_201_CREATED)