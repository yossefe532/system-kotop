import logging

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from app.core.observability import observe_auth_event, set_request_context
from auth.security import AuthTokenError, decode_token
from models import User
from database import SessionLocal

bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger("auth")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_roles(user: User) -> set[str]:
    return {role.name for role in user.roles}


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    if not credentials or credentials.scheme.lower() != "bearer":
        observe_auth_event("missing_bearer_token")
        logger.warning("auth_missing_bearer path=%s", request.url.path)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    token = credentials.credentials
    try:
        payload = decode_token(token, expected_type="access")
    except AuthTokenError as exc:
        observe_auth_event("invalid_access_token")
        logger.warning("auth_invalid_token path=%s reason=%s", request.url.path, exc)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)) from exc

    user_id = int(payload.get("sub") or 0)
    token_version = int(payload.get("tv") or 0)
    user = db.query(User).options(selectinload(User.roles)).filter(User.id == user_id).first()
    if not user or not user.is_active:
        observe_auth_event("inactive_user_rejected")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User account is inactive")
    if user.token_version != token_version:
        observe_auth_event("session_version_mismatch")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    set_request_context(user_id=str(user.id))
    request.state.user_id = str(user.id)
    return user


def require_roles(*allowed_roles: str):
    allowed = {role.strip().lower() for role in allowed_roles if role and role.strip()}

    def dependency(user: User = Depends(get_current_user)) -> User:
        user_roles = {r.lower() for r in _user_roles(user)}
        if "admin" in user_roles:
            return user
        if allowed and user_roles.intersection(allowed):
            return user
        observe_auth_event("forbidden_role_access")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")

    return dependency
