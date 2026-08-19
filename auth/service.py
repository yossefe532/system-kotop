import logging
from datetime import datetime, timedelta

from sqlalchemy.orm import Session

from app.core.observability import observe_auth_event
from auth.config import get_auth_config
from auth.security import (
    AuthTokenError,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    hash_token,
    now_utc,
    verify_password,
)
from app.core.security import get_security_config
from models import RefreshToken, Role, User

logger = logging.getLogger("auth")
auth_config = get_auth_config()
security_config = get_security_config()
ROLE_NAMES = ["admin", "manager", "cashier", "viewer"]


def _role_names(user: User) -> list[str]:
    return sorted({role.name for role in user.roles})


def _to_user_me(user: User) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "full_name": user.full_name,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "roles": _role_names(user),
    }


def _coerce_utc_comparable(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.replace(tzinfo=None)


def ensure_roles_and_admin(db: Session) -> None:
    roles_by_name = {r.name: r for r in db.query(Role).all()}
    touched = False
    for role_name in ROLE_NAMES:
        if role_name not in roles_by_name:
            role = Role(name=role_name)
            db.add(role)
            roles_by_name[role_name] = role
            touched = True
    if touched:
        db.commit()

    init_username = auth_config.init_admin_username
    init_password = auth_config.init_admin_password
    if not init_username or not init_password:
        has_users = db.query(User.id).first() is not None
        if not has_users and security_config.allow_bootstrap_admin_fallback:
            init_username = "admin"
            init_password = "admin12345"
            logger.warning("bootstrap_admin_fallback_enabled username=admin")
            observe_auth_event("bootstrap_admin_fallback_enabled")

    if init_username and init_password:
        admin_user = db.query(User).filter(User.username == init_username).first()
        admin_role = db.query(Role).filter(Role.name == "admin").first()
        if not admin_user:
            admin_user = User(
                username=init_username,
                full_name=auth_config.init_admin_full_name,
                hashed_password=hash_password(init_password),
                is_active=True,
            )
            admin_user.roles.append(admin_role)
            db.add(admin_user)
            db.commit()
            logger.info("bootstrap_admin_created username=%s", init_username)
            observe_auth_event("bootstrap_admin_created")
        elif admin_role and admin_role not in admin_user.roles:
            admin_user.roles.append(admin_role)
            db.commit()


def authenticate_user(db: Session, username: str, password: str, client_ip: str | None) -> User | None:
    user = db.query(User).filter(User.username == username).first()
    if not user:
        logger.warning("login_failed user=%s reason=user_not_found ip=%s", username, client_ip)
        observe_auth_event("login_failed_user_not_found")
        return None

    current_time = _coerce_utc_comparable(now_utc())
    if user.locked_until and _coerce_utc_comparable(user.locked_until) > current_time:
        logger.warning("login_blocked user=%s reason=locked ip=%s", username, client_ip)
        observe_auth_event("login_blocked_locked")
        return None

    if not user.is_active:
        logger.warning("login_failed user=%s reason=inactive ip=%s", username, client_ip)
        observe_auth_event("login_failed_inactive")
        return None

    if not verify_password(password, user.hashed_password):
        user.failed_login_attempts += 1
        if user.failed_login_attempts >= auth_config.max_failed_attempts:
            user.locked_until = now_utc() + timedelta(minutes=auth_config.lock_minutes)
            user.failed_login_attempts = 0
        db.commit()
        logger.warning("login_failed user=%s reason=bad_password ip=%s", username, client_ip)
        observe_auth_event("login_failed_bad_password")
        return None

    user.failed_login_attempts = 0
    user.locked_until = None
    db.commit()
    logger.info("login_success user=%s ip=%s", username, client_ip)
    observe_auth_event("login_success")
    return user


def issue_token_pair(db: Session, user: User, client_ip: str | None, user_agent: str | None) -> dict:
    roles = _role_names(user)
    access_token, access_expires_at = create_access_token(user.id, user.username, roles, user.token_version)
    refresh_token, refresh_expires_at = create_refresh_token(user.id, user.token_version)

    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=refresh_expires_at,
            issued_ip=client_ip,
            user_agent=user_agent,
        )
    )
    db.commit()
    observe_auth_event("token_pair_issued")
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "access_expires_at": access_expires_at,
        "refresh_expires_at": refresh_expires_at,
        "user": _to_user_me(user),
    }


def rotate_refresh_token(db: Session, refresh_token: str, client_ip: str | None, user_agent: str | None) -> dict:
    payload = decode_token(refresh_token, expected_type="refresh")
    user_id = int(payload.get("sub") or 0)
    token_version = int(payload.get("tv") or 0)

    token_entry = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_token(refresh_token), RefreshToken.revoked_at.is_(None))
        .first()
    )
    if not token_entry:
        observe_auth_event("refresh_rejected_revoked")
        raise AuthTokenError("Refresh token is revoked")
    current_time = _coerce_utc_comparable(now_utc())
    if _coerce_utc_comparable(token_entry.expires_at) <= current_time:
        observe_auth_event("refresh_rejected_expired")
        raise AuthTokenError("Refresh token expired")

    user = db.query(User).filter(User.id == user_id).first()
    if not user or not user.is_active:
        observe_auth_event("refresh_rejected_user_missing")
        raise AuthTokenError("User not available")
    if user.token_version != token_version:
        observe_auth_event("refresh_rejected_version_mismatch")
        raise AuthTokenError("Session version mismatch")

    token_entry.revoked_at = now_utc()
    db.commit()
    observe_auth_event("refresh_rotated")
    return issue_token_pair(db, user, client_ip, user_agent)


def revoke_refresh(db: Session, refresh_token: str) -> bool:
    entry = (
        db.query(RefreshToken)
        .filter(RefreshToken.token_hash == hash_token(refresh_token), RefreshToken.revoked_at.is_(None))
        .first()
    )
    if not entry:
        observe_auth_event("logout_refresh_not_found")
        return False
    entry.revoked_at = now_utc()
    db.commit()
    observe_auth_event("logout_refresh_revoked")
    return True
