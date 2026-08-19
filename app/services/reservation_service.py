import logging

from fastapi import HTTPException, Request, status
from sqlalchemy.orm import Session, load_only

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
from models import Book, Reservation, SafeTransaction, Student
from schemas import ReservationCreate, ReservationUpdate

operations_logger = logging.getLogger("pos_api.operations")


def list_reservations(
    db: Session,
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
):
    skip, limit = _clamp_page(skip, limit)
    return (
        db.query(Reservation)
        .options(load_only(Reservation.id, Reservation.student_id, Reservation.book_id, Reservation.quantity, Reservation.deposit_amount, Reservation.status, Reservation.staff_name, Reservation.created_at))
        .order_by(Reservation.deposit_amount.desc(), Reservation.created_at.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def create_reservation(
    db: Session,
    request: Request,
    payload: ReservationCreate,
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "reservation_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.deposit_amount < 0:
        fail_sync_replay(replay_state, "Invalid deposit amount", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid deposit amount")
    if payload.quantity <= 0:
        fail_sync_replay(replay_state, "Invalid quantity", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid quantity")
    student = db.query(Student).filter(Student.id == payload.student_id).first()
    if not student:
        fail_sync_replay(replay_state, "Student not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    book = db.query(Book).filter(Book.id == payload.book_id).with_for_update().first()
    if not book:
        fail_sync_replay(replay_state, "Book not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    existing = (
        db.query(Reservation)
        .filter(
            Reservation.student_id == payload.student_id,
            Reservation.book_id == payload.book_id,
            Reservation.status == "pending",
        )
        .first()
    )
    if existing:
        fail_sync_replay(
            replay_state,
            "Reservation already exists",
            conflict_status_code(replay_state.enabled),
            outcome="conflict",
        )
        raise HTTPException(
            status_code=conflict_status_code(replay_state.enabled),
            detail="Reservation already exists",
        )
    if not book.is_arriving and book.available_stock < payload.quantity:
        fail_sync_replay(
            replay_state,
            "No available stock to reserve",
            conflict_status_code(replay_state.enabled),
            outcome="conflict",
        )
        raise HTTPException(
            status_code=conflict_status_code(replay_state.enabled),
            detail="No available stock to reserve",
        )

    reservation = Reservation(**payload.model_dump())
    reservation.status = "pending"
    book.reserved_stock += payload.quantity
    db.add(reservation)
    db.flush()
    if payload.deposit_amount > 0:
        journal_entry = create_journal_entry(
            db,
            source_type="reservation",
            source_id=reservation.id,
            description="Reservation deposit",
            reason="Reservation deposit received",
            staff_name=payload.staff_name,
            reference=f"reservation:{reservation.id}",
            metadata={
                "student_id": payload.student_id,
                "book_id": payload.book_id,
                "quantity": payload.quantity,
            },
            lines=[
                JournalLineInput("1000", "debit", payload.deposit_amount, "Cash received for reservation deposit"),
                JournalLineInput("4010", "credit", payload.deposit_amount, "Reservation deposit liability"),
            ],
        )
        db.add(
            SafeTransaction(
                amount=payload.deposit_amount,
                type="sale",
                reason="Reservation deposit",
                staff_name=payload.staff_name,
                source_type="reservation",
                source_id=reservation.id,
                journal_entry_id=journal_entry.id,
            )
        )
    record_financial_audit(
        db,
        entity_type="reservation",
        entity_id=reservation.id,
        action="created",
        staff_name=payload.staff_name,
        new_value={
            "student_id": payload.student_id,
            "book_id": payload.book_id,
            "quantity": payload.quantity,
            "deposit_amount": payload.deposit_amount,
            "status": reservation.status,
        },
        reason="Reservation created",
        originating_transaction_type="reservation",
        originating_transaction_id=reservation.id,
    )
    db.commit()
    log_event(
        operations_logger,
        logging.INFO,
        "reservation_created",
        reservation_id=reservation.id,
        student_id=payload.student_id,
        book_id=payload.book_id,
        quantity=payload.quantity,
    )
    return complete_sync_replay(replay_state, reservation, status.HTTP_201_CREATED)


def update_reservation(
    db: Session,
    reservation_id: int,
    payload: ReservationUpdate,
):
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    if reservation.status == "completed" and payload.status == "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot revert a completed reservation")
    if reservation.status == "pending" and payload.status == "completed":
        book = db.query(Book).filter(Book.id == reservation.book_id).with_for_update().first()
        if book:
            book.reserved_stock = max(0, book.reserved_stock - int(reservation.quantity))
    if reservation.status == "pending" and payload.status == "cancelled":
        book = db.query(Book).filter(Book.id == reservation.book_id).with_for_update().first()
        if book:
            book.reserved_stock = max(0, book.reserved_stock - int(reservation.quantity))
    reservation.status = payload.status
    db.commit()
    db.refresh(reservation)
    log_event(
        operations_logger,
        logging.INFO,
        "reservation_updated",
        reservation_id=reservation.id,
        status=reservation.status,
    )
    return reservation


def cancel_reservation(
    db: Session,
    request: Request,
    reservation_id: int,
):
    replay_state = begin_sync_replay(request, {"reservation_id": reservation_id}, "reservation_cancel")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    reservation = db.query(Reservation).filter(Reservation.id == reservation_id).first()
    if not reservation:
        fail_sync_replay(replay_state, "Reservation not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reservation not found")
    if reservation.status == "completed":
        fail_sync_replay(
            replay_state,
            "Cannot cancel a completed reservation",
            conflict_status_code(replay_state.enabled),
            outcome="conflict",
        )
        raise HTTPException(
            status_code=conflict_status_code(replay_state.enabled),
            detail="Cannot cancel a completed reservation",
        )
    book = db.query(Book).filter(Book.id == reservation.book_id).with_for_update().first()
    if book:
        book.reserved_stock = max(0, book.reserved_stock - int(reservation.quantity))
    reservation.status = "cancelled"
    if reservation.deposit_amount > 0:
        journal_entry = create_journal_entry(
            db,
            source_type="reservation_cancel",
            source_id=reservation.id,
            description="Reservation deposit refund",
            reason="Cancelled reservation",
            staff_name=reservation.staff_name,
            reference=f"reservation:{reservation.id}:cancel",
            metadata={
                "reservation_id": reservation.id,
                "student_id": reservation.student_id,
                "book_id": reservation.book_id,
            },
            lines=[
                JournalLineInput("4010", "debit", reservation.deposit_amount, "Reverse reservation deposit liability"),
                JournalLineInput("1000", "credit", reservation.deposit_amount, "Cash refunded to customer"),
            ],
        )
        db.add(
            SafeTransaction(
                amount=reservation.deposit_amount,
                type="withdrawal",
                reason="Reservation deposit refund",
                staff_name=reservation.staff_name,
                source_type="reservation_cancel",
                source_id=reservation.id,
                journal_entry_id=journal_entry.id,
            )
        )
    record_financial_audit(
        db,
        entity_type="reservation",
        entity_id=reservation.id,
        action="cancelled",
        staff_name=reservation.staff_name,
        previous_value={"status": "pending", "deposit_amount": reservation.deposit_amount},
        new_value={"status": "cancelled"},
        reason="Reservation cancelled",
        originating_transaction_type="reservation_cancel",
        originating_transaction_id=reservation.id,
    )
    db.commit()
    log_event(
        operations_logger,
        logging.INFO,
        "reservation_cancelled",
        reservation_id=reservation.id,
        book_id=reservation.book_id,
        student_id=reservation.student_id,
    )
    return complete_sync_replay(replay_state, None, status.HTTP_204_NO_CONTENT)