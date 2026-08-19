from __future__ import annotations

import os
import sys
from pathlib import Path
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key")
os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("SCHEMA_GUARD_DISABLED", "1")
os.environ.setdefault("INIT_ADMIN_USERNAME", "admin")
os.environ.setdefault("INIT_ADMIN_PASSWORD", "admin12345")
os.environ.setdefault("INIT_ADMIN_FULL_NAME", "Test Admin")

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

import main  # noqa: E402
from app.api import deps as api_deps  # noqa: E402
from auth.service import ensure_roles_and_admin  # noqa: E402
from app.services.accounting import ensure_accounting_seed_data  # noqa: E402
from database import Base  # noqa: E402
from models import Book, Student, User  # noqa: E402


TEST_DATABASE_URL = "sqlite://"
engine = create_engine(
    TEST_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db() -> Generator:
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


main.app.dependency_overrides[api_deps.get_db] = override_get_db
Base.metadata.drop_all(bind=engine)
Base.metadata.create_all(bind=engine)
with TestingSessionLocal() as bootstrap_db:
    ensure_roles_and_admin(bootstrap_db)
    ensure_accounting_seed_data(bootstrap_db)
    bootstrap_db.commit()


@pytest.fixture(autouse=True)
def reset_database() -> Generator[None, None, None]:
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with TestingSessionLocal() as db:
        ensure_roles_and_admin(db)
        ensure_accounting_seed_data(db)
        db.commit()
    yield


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture
def db_session():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture
def admin_headers(client: TestClient) -> dict[str, str]:
    response = client.post("/auth/login", json={"username": "admin", "password": "admin12345"})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def admin_token_pair(client: TestClient) -> dict:
    response = client.post("/auth/login", json={"username": "admin", "password": "admin12345"})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.fixture
def manager_headers(client: TestClient, db_session) -> dict[str, str]:
    user = User(username="manager", full_name="Manager User", hashed_password="", is_active=True)
    db_session.add(user)
    db_session.flush()
    from auth.security import hash_password
    from models import Role

    user.hashed_password = hash_password("manager123")
    manager_role = db_session.query(Role).filter(Role.name == "manager").first()
    user.roles.append(manager_role)
    db_session.commit()
    response = client.post("/auth/login", json={"username": "manager", "password": "manager123"})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def cashier_headers(client: TestClient, db_session) -> dict[str, str]:
    user = User(username="cashier", full_name="Cashier User", hashed_password="", is_active=True)
    db_session.add(user)
    db_session.flush()
    from auth.security import hash_password
    from models import Role

    user.hashed_password = hash_password("cashier123")
    role = db_session.query(Role).filter(Role.name == "cashier").first()
    user.roles.append(role)
    db_session.commit()
    response = client.post("/auth/login", json={"username": "cashier", "password": "cashier123"})
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def seeded_book(db_session):
    book = Book(
        title="Physics",
        author="Teacher",
        isbn_barcode="book-001",
        cost_price=50.0,
        selling_price=100.0,
        total_stock=20,
        reserved_stock=0,
        is_arriving=False,
    )
    db_session.add(book)
    db_session.commit()
    db_session.refresh(book)
    return book


@pytest.fixture
def seeded_student(db_session):
    student = Student(
        name="Youssef",
        phone="01000000000",
        email="youssef@example.com",
        gender="male",
        grade="3rd Sec",
        system="General",
        specialty="Math",
        balance=0.0,
    )
    db_session.add(student)
    db_session.commit()
    db_session.refresh(student)
    return student
