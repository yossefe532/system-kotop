import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.core.observability import log_event
from app.api.deps import get_db
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from app.utils.stock import validate_book_stock
from auth.dependencies import require_roles
from models import Book, User
from schemas import BookCreate, BookOut, BookUpdate

router = APIRouter(prefix="/books")
operations_logger = logging.getLogger("pos_api.operations")


@router.get("", response_model=list[BookOut])
def list_books(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("viewer", "cashier", "manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return db.query(Book).order_by(Book.id).offset(skip).limit(limit).all()


@router.get("/{book_id}", response_model=BookOut)
def get_book(
    book_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("viewer", "cashier", "manager", "admin")),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    return book


@router.post("", response_model=BookOut, status_code=status.HTTP_201_CREATED)
def create_book(
    request: Request,
    payload: BookCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "book_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    if payload.cost_price < 0 or payload.selling_price < 0:
        fail_sync_replay(replay_state, "Invalid price values", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid price values")
    if payload.estimated_cost_price is not None and payload.estimated_cost_price < 0:
        fail_sync_replay(replay_state, "Invalid estimated cost price", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid estimated cost price")
    if payload.estimated_selling_price is not None and payload.estimated_selling_price < 0:
        fail_sync_replay(replay_state, "Invalid estimated selling price", status.HTTP_400_BAD_REQUEST)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid estimated selling price")
    validate_book_stock(payload.total_stock, payload.reserved_stock, payload.is_arriving)
    book = Book(**payload.model_dump())
    db.add(book)
    db.commit()
    db.refresh(book)
    log_event(
        operations_logger,
        logging.INFO,
        "book_created",
        book_id=book.id,
        barcode=book.isbn_barcode,
        stock=book.total_stock,
    )
    return complete_sync_replay(replay_state, book, status.HTTP_201_CREATED)


@router.put("/{book_id}", response_model=BookOut)
def update_book(
    request: Request,
    book_id: int,
    payload: BookUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(exclude_unset=True), "book_update")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        fail_sync_replay(replay_state, "Book not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Book not found")
    update_data = payload.model_dump(exclude_unset=True)
    if "cost_price" in update_data and update_data["cost_price"] is not None and update_data["cost_price"] < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cost price")
    if "selling_price" in update_data and update_data["selling_price"] is not None and update_data["selling_price"] < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid selling price")
    if "estimated_cost_price" in update_data and update_data["estimated_cost_price"] is not None and update_data["estimated_cost_price"] < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid estimated cost price")
    if "estimated_selling_price" in update_data and update_data["estimated_selling_price"] is not None and update_data["estimated_selling_price"] < 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid estimated selling price")

    total_stock = update_data.get("total_stock", book.total_stock)
    reserved_stock = update_data.get("reserved_stock", book.reserved_stock)
    is_arriving = update_data.get("is_arriving", book.is_arriving)
    validate_book_stock(total_stock, reserved_stock, is_arriving)
    for key, value in update_data.items():
        setattr(book, key, value)
    db.commit()
    db.refresh(book)
    log_event(
        operations_logger,
        logging.INFO,
        "book_updated",
        book_id=book.id,
        fields=sorted(update_data.keys()),
    )
    return complete_sync_replay(replay_state, book, status.HTTP_200_OK)


@router.delete("/{book_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_book(
    book_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED, detail="Deleting books is disabled to protect production data")