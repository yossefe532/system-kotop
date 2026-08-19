import logging

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session, load_only, selectinload

from app.core.observability import log_event
from app.services.accounting import (
    JournalLineInput,
    create_journal_entry,
    record_financial_audit,
)
from app.services.sync_replay import (
    begin_sync_replay,
    complete_sync_replay,
    conflict_status_code,
    fail_sync_replay,
)
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from models import Book, Reservation, SafeTransaction, Student, Transaction, TransactionItem
from schemas import TransactionCreate

operations_logger = logging.getLogger("pos_api.operations")


def create_transaction(
    db: Session,
    request: Request,
    payload: TransactionCreate,
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "transaction_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.discount < 0:
        fail_sync_replay(replay_state, "Invalid discount", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid discount")
    if not payload.items:
        fail_sync_replay(replay_state, "No items provided", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No items provided")

    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        fail_sync_replay(replay_state, "Student not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")

    subtotal = 0.0
    reservation_discount = 0.0
    items = []
    ordered_items = sorted(payload.items, key=lambda item: (item.book_id, item.reservation_id or 0))
    book_ids = sorted({item.book_id for item in ordered_items})
    reservation_ids = sorted({item.reservation_id for item in ordered_items if item.reservation_id is not None})

    try:
        books = (
            db.query(Book)
            .filter(Book.id.in_(book_ids))
            .order_by(Book.id.asc())
            .with_for_update()
            .all()
        )
        books_by_id = {book.id: book for book in books}

        reservations_by_id = {}
        if reservation_ids:
            reservations = (
                db.query(Reservation)
                .filter(Reservation.id.in_(reservation_ids))
                .order_by(Reservation.id.asc())
                .with_for_update()
                .all()
            )
            reservations_by_id = {reservation.id: reservation for reservation in reservations}

        if len(books_by_id) != len(book_ids):
            missing_book_id = next(book_id for book_id in book_ids if book_id not in books_by_id)
            fail_sync_replay(replay_state, f"Book {missing_book_id} not found", status.HTTP_404_NOT_FOUND)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Book {missing_book_id} not found")

        if reservation_ids and len(reservations_by_id) != len(reservation_ids):
            fail_sync_replay(replay_state, "Reservation not found", status.HTTP_404_NOT_FOUND)
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")

        for item in ordered_items:
            if item.quantity <= 0:
                fail_sync_replay(replay_state, "Invalid quantity", status.HTTP_400_BAD_REQUEST)
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid quantity")
            book = books_by_id[item.book_id]
            reservation = None
            if item.reservation_id is not None:
                reservation = reservations_by_id[item.reservation_id]
                if reservation.status != "pending":
                    fail_sync_replay(
                        replay_state,
                        "Reservation is not pending",
                        conflict_status_code(replay_state.enabled),
                        outcome="conflict",
                    )
                    raise HTTPException(
                        status_code=conflict_status_code(replay_state.enabled),
                        detail="Reservation is not pending",
                    )
                if reservation.student_id != payload.student_id:
                    fail_sync_replay(
                        replay_state,
                        "Reservation student mismatch",
                        conflict_status_code(replay_state.enabled),
                        outcome="conflict",
                    )
                    raise HTTPException(
                        status_code=conflict_status_code(replay_state.enabled),
                        detail="Reservation student mismatch",
                    )
                if reservation.book_id != book.id:
                    fail_sync_replay(
                        replay_state,
                        "Reservation book mismatch",
                        conflict_status_code(replay_state.enabled),
                        outcome="conflict",
                    )
                    raise HTTPException(
                        status_code=conflict_status_code(replay_state.enabled),
                        detail="Reservation book mismatch",
                    )
            reserved_units = int(reservation.quantity) if reservation else 0
            available_units = (book.total_stock - book.reserved_stock + reserved_units) if reservation else (book.total_stock - book.reserved_stock)
            if available_units < item.quantity:
                fail_sync_replay(
                    replay_state,
                    f"Insufficient stock for book {book.id}",
                    conflict_status_code(replay_state.enabled),
                    outcome="conflict",
                )
                raise HTTPException(
                    status_code=conflict_status_code(replay_state.enabled),
                    detail=f"Insufficient stock for book {book.id}",
                )

            line_total = book.selling_price * item.quantity
            subtotal += line_total
            book.total_stock -= item.quantity
            if reservation:
                consume_qty = min(int(reservation.quantity), item.quantity)
                book.reserved_stock = max(0, book.reserved_stock - consume_qty)
                if item.quantity >= int(reservation.quantity):
                    reservation.status = "completed"
                    reservation_discount += reservation.deposit_amount
                else:
                    reservation.quantity = int(reservation.quantity) - item.quantity

            items.append(
                TransactionItem(
                    book_id=book.id,
                    quantity=item.quantity,
                    price_at_sale=book.selling_price,
                    cost_at_sale=book.cost_price,
                )
            )

        total_discount = payload.discount + reservation_discount
        total_amount = subtotal - total_discount
        if total_amount < 0:
            total_amount = 0.0

        transaction = Transaction(
            student_id=payload.student_id,
            total_amount=total_amount,
            discount=total_discount,
            staff_name=payload.staff_name,
        )
        transaction.items = items
        db.add(transaction)
        db.flush()
        if subtotal > 0 or reservation_discount > 0:
            total_cost_amount = round(sum((item.quantity or 0) * (item.cost_at_sale or 0.0) for item in items), 2)
            journal_entry = create_journal_entry(
                db,
                source_type="transaction",
                source_id=transaction.id,
                description="Sale transaction",
                reason="POS sale",
                staff_name=payload.staff_name,
                reference=f"transaction:{transaction.id}",
                metadata={
                    "student_id": payload.student_id,
                    "discount": total_discount,
                    "item_count": len(items),
                },
                lines=[
                    *(
                        [JournalLineInput("1000", "debit", total_amount, "Cash received from sale")]
                        if total_amount > 0
                        else []
                    ),
                    *(
                        [JournalLineInput("4010", "debit", reservation_discount, "Reservation deposit applied to sale")]
                        if reservation_discount > 0
                        else []
                    ),
                    JournalLineInput("4000", "credit", total_amount + reservation_discount, "Recognized sales revenue"),
                    *(
                        [
                            JournalLineInput("5000", "debit", total_cost_amount, "Cost of goods sold"),
                            JournalLineInput("1200", "credit", total_cost_amount, "Inventory reduction"),
                        ]
                        if total_cost_amount > 0
                        else []
                    ),
                ],
            )
            if total_amount > 0:
                db.add(
                    SafeTransaction(
                        amount=total_amount,
                        type="sale",
                        reason="Sale transaction",
                        staff_name=payload.staff_name,
                        source_type="transaction",
                        source_id=transaction.id,
                        journal_entry_id=journal_entry.id,
                    )
                )
            record_financial_audit(
                db,
                entity_type="transaction",
                entity_id=transaction.id,
                action="posted",
                staff_name=payload.staff_name,
                new_value={
                    "student_id": payload.student_id,
                    "total_amount": total_amount,
                    "discount": total_discount,
                    "item_count": len(items),
                },
                reason="POS sale committed",
                originating_transaction_type="transaction",
                originating_transaction_id=transaction.id,
            )
        db.commit()
        transaction = (
            db.query(Transaction)
            .options(
                selectinload(Transaction.items).load_only(
                    TransactionItem.id,
                    TransactionItem.transaction_id,
                    TransactionItem.book_id,
                    TransactionItem.quantity,
                    TransactionItem.price_at_sale,
                    TransactionItem.cost_at_sale,
                )
            )
            .filter(Transaction.id == transaction.id)
            .first()
        )
        log_event(
            operations_logger,
            logging.INFO,
            "transaction_committed",
            transaction_id=transaction.id,
            student_id=payload.student_id,
            item_count=len(ordered_items),
            total_amount=total_amount,
        )
        return complete_sync_replay(replay_state, transaction, status.HTTP_201_CREATED)
    except HTTPException:
        db.rollback()
        log_event(
            operations_logger,
            logging.WARNING,
            "transaction_rolled_back",
            student_id=payload.student_id,
            item_count=len(ordered_items),
            reason="http_exception",
        )
        raise
    except Exception:
        db.rollback()
        fail_sync_replay(replay_state, "Transaction failed", status.HTTP_500_INTERNAL_SERVER_ERROR)
        log_event(
            operations_logger,
            logging.ERROR,
            "transaction_rolled_back",
            student_id=payload.student_id,
            item_count=len(ordered_items),
            reason="unexpected_exception",
        )
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Transaction failed")


def list_safe_transactions(
    db: Session,
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(SafeTransaction)
        .options(load_only(SafeTransaction.id, SafeTransaction.amount, SafeTransaction.type, SafeTransaction.reason, SafeTransaction.staff_name, SafeTransaction.timestamp))
        .order_by(SafeTransaction.timestamp.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_transactions(
    db: Session,
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(Transaction)
        .options(
            load_only(Transaction.id, Transaction.student_id, Transaction.total_amount, Transaction.discount, Transaction.staff_name, Transaction.date),
            selectinload(Transaction.items).load_only(
                TransactionItem.id,
                TransactionItem.transaction_id,
                TransactionItem.book_id,
                TransactionItem.quantity,
                TransactionItem.price_at_sale,
                TransactionItem.cost_at_sale,
            ),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )