"""add production performance indexes

Revision ID: 20261210_0002
Revises: 20261210_0001
Create Date: 2026-05-10 16:05:00
"""

from __future__ import annotations

from collections.abc import Iterable

from alembic import op
import sqlalchemy as sa


revision = "20261210_0002"
down_revision = "20261210_0001"
branch_labels = None
depends_on = None


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _create_index_if_missing(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
    columns: Iterable[str],
    unique: bool = False,
) -> None:
    if index_name not in _index_names(inspector, table_name):
        op.create_index(index_name, table_name, list(columns), unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    _create_index_if_missing(inspector, "transactions", "ix_transactions_student_id", ["student_id"])
    _create_index_if_missing(inspector, "transactions", "ix_transactions_date", ["date"])

    _create_index_if_missing(inspector, "transaction_items", "ix_transaction_items_transaction_id", ["transaction_id"])
    _create_index_if_missing(inspector, "transaction_items", "ix_transaction_items_book_id", ["book_id"])

    _create_index_if_missing(inspector, "reservations", "ix_reservations_status", ["status"])
    _create_index_if_missing(inspector, "reservations", "ix_reservations_created_at", ["created_at"])
    _create_index_if_missing(inspector, "reservations", "ix_reservations_book_id", ["book_id"])
    _create_index_if_missing(inspector, "reservations", "ix_reservations_student_book_status", ["student_id", "book_id", "status"])
    _create_index_if_missing(inspector, "reservations", "ix_reservations_status_created_at", ["status", "created_at"])

    _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_type", ["type"])
    _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_timestamp", ["timestamp"])
    _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_type_timestamp", ["type", "timestamp"])

    _create_index_if_missing(inspector, "supplies", "ix_supplies_book_id", ["book_id"])
    _create_index_if_missing(inspector, "supplies", "ix_supplies_timestamp", ["timestamp"])

    _create_index_if_missing(inspector, "inventory_sessions", "ix_inventory_sessions_timestamp", ["timestamp"])
    _create_index_if_missing(inspector, "receipt_archives", "ix_receipt_archives_printed_at", ["printed_at"])


def downgrade() -> None:
    for table_name, index_name in [
        ("receipt_archives", "ix_receipt_archives_printed_at"),
        ("inventory_sessions", "ix_inventory_sessions_timestamp"),
        ("supplies", "ix_supplies_timestamp"),
        ("supplies", "ix_supplies_book_id"),
        ("safe_transactions", "ix_safe_transactions_type_timestamp"),
        ("safe_transactions", "ix_safe_transactions_timestamp"),
        ("safe_transactions", "ix_safe_transactions_type"),
        ("reservations", "ix_reservations_status_created_at"),
        ("reservations", "ix_reservations_student_book_status"),
        ("reservations", "ix_reservations_book_id"),
        ("reservations", "ix_reservations_created_at"),
        ("reservations", "ix_reservations_status"),
        ("transaction_items", "ix_transaction_items_book_id"),
        ("transaction_items", "ix_transaction_items_transaction_id"),
        ("transactions", "ix_transactions_date"),
        ("transactions", "ix_transactions_student_id"),
    ]:
        op.drop_index(index_name, table_name=table_name)
