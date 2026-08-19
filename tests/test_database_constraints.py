from __future__ import annotations

import pytest
from sqlalchemy import event
from sqlalchemy.exc import IntegrityError

from models import Book, Student, Transaction


@pytest.fixture
def sqlite_foreign_keys(db_session):
    connection = db_session.connection()
    if connection.dialect.name != "sqlite":
        yield
        return

    raw_connection = connection.connection
    cursor = raw_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
    yield


def test_unique_isbn_constraint_is_enforced(db_session):
    first = Book(
        title="Chemistry",
        author="Teacher One",
        isbn_barcode="dup-isbn-1",
        cost_price=20.0,
        selling_price=30.0,
        total_stock=3,
        reserved_stock=0,
        is_arriving=False,
    )
    second = Book(
        title="Chemistry Copy",
        author="Teacher Two",
        isbn_barcode="dup-isbn-1",
        cost_price=21.0,
        selling_price=31.0,
        total_stock=4,
        reserved_stock=0,
        is_arriving=False,
    )

    db_session.add(first)
    db_session.commit()
    db_session.add(second)

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()


def test_transaction_student_foreign_key_is_enforced(db_session, sqlite_foreign_keys, seeded_book):
    transaction = Transaction(
        student_id=999999,
        total_amount=50.0,
        discount=0.0,
        staff_name="Cashier",
    )
    db_session.add(transaction)

    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()


def test_failed_commit_rolls_back_pending_rows(db_session):
    valid = Book(
        title="Biology",
        author="Teacher A",
        isbn_barcode="rollback-isbn-1",
        cost_price=15.0,
        selling_price=25.0,
        total_stock=5,
        reserved_stock=0,
        is_arriving=False,
    )
    invalid_duplicate = Book(
        title="Biology Duplicate",
        author="Teacher B",
        isbn_barcode="rollback-isbn-1",
        cost_price=18.0,
        selling_price=28.0,
        total_stock=6,
        reserved_stock=0,
        is_arriving=False,
    )

    db_session.add_all([valid, invalid_duplicate])
    with pytest.raises(IntegrityError):
        db_session.commit()

    db_session.rollback()
    persisted = db_session.query(Book).filter(Book.isbn_barcode == "rollback-isbn-1").all()
    assert persisted == []


def test_student_creation_persists_expected_indexed_fields(db_session):
    student = Student(
        name="Index Target",
        phone="01111111111",
        email="indexed@example.com",
        gender="female",
        grade="2nd Sec",
        system="General",
        specialty=None,
        balance=15.0,
    )
    db_session.add(student)
    db_session.commit()

    reloaded = db_session.query(Student).filter(Student.email == "indexed@example.com").first()
    assert reloaded is not None
    assert reloaded.name == "Index Target"
