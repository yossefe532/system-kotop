import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from app.api.deps import get_db
from app.core.feature_flags import is_wallet_ledger_enabled
from app.services.student_wallet import create_wallet_entry
from app.services.sync_replay import begin_sync_replay, complete_sync_replay, fail_sync_replay
from app.utils.pagination import PAGE_DEFAULT_LIMIT, _clamp_page
from auth.dependencies import require_roles
from models import Student, User
from schemas import StudentCreate, StudentOut, StudentUpdate

router = APIRouter(prefix="/students")



@router.get("", response_model=list[StudentOut])
def list_students(
    skip: int = 0,
    limit: int = PAGE_DEFAULT_LIMIT,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("viewer", "cashier", "manager", "admin")),
):
    skip, limit = _clamp_page(skip, limit)
    return db.query(Student).order_by(Student.id).offset(skip).limit(limit).all()


@router.get("/{student_id}", response_model=StudentOut)
def get_student(
    student_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("viewer", "cashier", "manager", "admin")),
):
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    return student


@router.post("", response_model=StudentOut, status_code=status.HTTP_201_CREATED)
def create_student(
    request: Request,
    payload: StudentCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("cashier", "manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(), "student_create")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    student = Student(**payload.model_dump())
    db.add(student)
    db.commit()
    db.refresh(student)
    return complete_sync_replay(replay_state, student, status.HTTP_201_CREATED)


@router.put("/{student_id}", response_model=StudentOut)
def update_student(
    request: Request,
    student_id: int,
    payload: StudentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("cashier", "manager", "admin")),
):
    replay_state = begin_sync_replay(request, payload.model_dump(exclude_unset=True), "student_update")
    if replay_state.duplicate_response is not None:
        return replay_state.duplicate_response
    student = db.query(Student).filter(Student.id == student_id).first()
    if not student:
        fail_sync_replay(replay_state, "Student not found", status.HTTP_404_NOT_FOUND)
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Student not found")
    update_data = payload.model_dump(exclude_unset=True)
    grade = update_data.get("grade", student.grade)
    specialty = update_data.get("specialty", student.specialty)
    if grade == "3rd Sec" and not specialty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Specialty is required for 3rd Sec students")
    if grade in {"1st Sec", "2nd Sec"} and specialty:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Specialty is only allowed for 3rd Sec students")

    pending_balance_entry = None
    if "balance" in update_data and is_wallet_ledger_enabled():
        desired = float(update_data["balance"])
        current = float(student.balance)
        delta = round(desired - current, 2)
        if delta != 0:
            op_id = (
                f"student_update_balance:{student.id}:{replay_state.operation_id}"
                if replay_state.operation_id
                else f"student_update_balance:{student.id}:{uuid.uuid4()}"
            )
            pending_balance_entry = (delta, op_id)
            update_data.pop("balance")
        else:
            update_data.pop("balance")

    for key, value in update_data.items():
        setattr(student, key, value)

    if pending_balance_entry is not None:
        delta, op_id = pending_balance_entry
        try:
            create_wallet_entry(
                db,
                student_id=student.id,
                entry_type="manual_adjustment",
                amount=delta,
                source_type="student_update",
                source_id=student.id,
                operation_id=op_id,
                actor=user.username,
                reason="Manual balance adjustment via student update",
            )
        except HTTPException:
            db.rollback()
            fail_sync_replay(replay_state, "Wallet ledger update failed", status.HTTP_400_BAD_REQUEST)
            raise
        except Exception:
            db.rollback()
            fail_sync_replay(replay_state, "Wallet ledger update failed", status.HTTP_500_INTERNAL_SERVER_ERROR)
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Wallet ledger update failed")

    db.commit()
    db.refresh(student)
    return complete_sync_replay(replay_state, student, status.HTTP_200_OK)


@router.delete("/{student_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_student(
    student_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("admin")),
):
    raise HTTPException(status_code=status.HTTP_405_METHOD_NOT_ALLOWED, detail="Deleting students is disabled to protect production data")