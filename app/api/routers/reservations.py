from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.services.reservation_service import cancel_reservation as cancel_reservation_action
from app.services.reservation_service import create_reservation as create_reservation_action
from app.services.reservation_service import list_reservations as list_reservations_action
from app.services.reservation_service import update_reservation as update_reservation_action
from app.utils.pagination import PAGE_DEFAULT_LIMIT
from auth.dependencies import require_roles
from models import User
from schemas import ReservationCreate, ReservationOut, ReservationUpdate

router = APIRouter(prefix="/reservations")


@router.get("", response_model=list[ReservationOut])
def list_reservations(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return list_reservations_action(db, skip, limit)


@router.post("", response_model=ReservationOut, status_code=status.HTTP_201_CREATED)
def create_reservation(
    request: Request,
    payload: ReservationCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return create_reservation_action(db, request, payload)


@router.put("/{reservation_id}", response_model=ReservationOut)
def update_reservation(
    reservation_id: int,
    payload: ReservationUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return update_reservation_action(db, reservation_id, payload)


@router.delete("/{reservation_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_reservation(
    request: Request,
    reservation_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    return cancel_reservation_action(db, request, reservation_id)