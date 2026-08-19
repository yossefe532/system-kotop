"""Baseline safe consolidation migration

Revision ID: 20261210_0001
Revises:
Create Date: 2026-12-10 00:01:00
"""

from __future__ import annotations

from typing import Iterable

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "20261210_0001"
down_revision = None
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {col["name"] for col in inspector.get_columns(table_name)}


def _has_column(inspector: sa.Inspector, table_name: str, column_name: str) -> bool:
    return column_name in _column_names(inspector, table_name)


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    names = set()
    for idx in inspector.get_indexes(table_name):
        names.add(idx["name"])
    return names


def _create_index_if_missing(inspector: sa.Inspector, table_name: str, index_name: str, columns: Iterable[str], unique: bool = False) -> None:
    if index_name not in _index_names(inspector, table_name):
        op.create_index(index_name, table_name, list(columns), unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "books"):
        op.create_table(
            "books",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("title", sa.String(), nullable=False),
            sa.Column("author", sa.String(), nullable=False),
            sa.Column("isbn_barcode", sa.String(), nullable=True),
            sa.Column("cost_price", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("selling_price", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("estimated_cost_price", sa.Float(), nullable=True),
            sa.Column("estimated_selling_price", sa.Float(), nullable=True),
            sa.Column("total_stock", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("reserved_stock", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("is_arriving", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        )
    else:
        if not _has_column(inspector, "books", "cost_price"):
            op.add_column("books", sa.Column("cost_price", sa.Float(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "books", "selling_price"):
            op.add_column("books", sa.Column("selling_price", sa.Float(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "books", "estimated_cost_price"):
            op.add_column("books", sa.Column("estimated_cost_price", sa.Float(), nullable=True))
        if not _has_column(inspector, "books", "estimated_selling_price"):
            op.add_column("books", sa.Column("estimated_selling_price", sa.Float(), nullable=True))
        if not _has_column(inspector, "books", "total_stock"):
            op.add_column("books", sa.Column("total_stock", sa.Integer(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "books", "reserved_stock"):
            op.add_column("books", sa.Column("reserved_stock", sa.Integer(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "books", "is_arriving"):
            op.add_column("books", sa.Column("is_arriving", sa.Boolean(), nullable=False, server_default=sa.text("false")))

        # Migrate old legacy columns when present.
        if _has_column(inspector, "books", "price") and _has_column(inspector, "books", "selling_price"):
            op.execute(sa.text("UPDATE books SET selling_price = COALESCE(selling_price, price, 0)"))
        if _has_column(inspector, "books", "stock") and _has_column(inspector, "books", "total_stock"):
            op.execute(sa.text("UPDATE books SET total_stock = COALESCE(total_stock, stock, 0)"))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "books"):
        _create_index_if_missing(inspector, "books", "ix_books_id", ["id"])
        _create_index_if_missing(inspector, "books", "ix_books_title", ["title"])
        _create_index_if_missing(inspector, "books", "ix_books_author", ["author"])
        _create_index_if_missing(inspector, "books", "ix_books_isbn_barcode", ["isbn_barcode"], unique=True)

    if not _table_exists(inspector, "students"):
        op.create_table(
            "students",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("phone", sa.String(), nullable=True),
            sa.Column("email", sa.String(), nullable=True),
            sa.Column("gender", sa.String(), nullable=True),
            sa.Column("grade", sa.String(), nullable=True),
            sa.Column("system", sa.String(), nullable=True),
            sa.Column("specialty", sa.String(), nullable=True),
            sa.Column("balance", sa.Float(), nullable=False, server_default=sa.text("0")),
        )
    else:
        if not _has_column(inspector, "students", "gender"):
            op.add_column("students", sa.Column("gender", sa.String(), nullable=True))
        if not _has_column(inspector, "students", "grade"):
            op.add_column("students", sa.Column("grade", sa.String(), nullable=True))
        if not _has_column(inspector, "students", "system"):
            op.add_column("students", sa.Column("system", sa.String(), nullable=True))
        if not _has_column(inspector, "students", "specialty"):
            op.add_column("students", sa.Column("specialty", sa.String(), nullable=True))
        if not _has_column(inspector, "students", "balance"):
            op.add_column("students", sa.Column("balance", sa.Float(), nullable=False, server_default=sa.text("0")))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "students"):
        _create_index_if_missing(inspector, "students", "ix_students_id", ["id"])
        _create_index_if_missing(inspector, "students", "ix_students_name", ["name"])
        _create_index_if_missing(inspector, "students", "ix_students_email", ["email"])

    if not _table_exists(inspector, "transactions"):
        op.create_table(
            "transactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("total_amount", sa.Float(), nullable=False),
            sa.Column("discount", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("staff_name", sa.String(), nullable=False, server_default=sa.text("'system'")),
            sa.Column("date", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    else:
        if not _has_column(inspector, "transactions", "staff_name"):
            op.add_column("transactions", sa.Column("staff_name", sa.String(), nullable=False, server_default=sa.text("'system'")))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "transactions"):
        _create_index_if_missing(inspector, "transactions", "ix_transactions_id", ["id"])

    if not _table_exists(inspector, "transaction_items"):
        op.create_table(
            "transaction_items",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("transaction_id", sa.Integer(), sa.ForeignKey("transactions.id"), nullable=False),
            sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("price_at_sale", sa.Float(), nullable=False),
            sa.Column("cost_at_sale", sa.Float(), nullable=False, server_default=sa.text("0")),
        )
    else:
        if not _has_column(inspector, "transaction_items", "cost_at_sale"):
            op.add_column("transaction_items", sa.Column("cost_at_sale", sa.Float(), nullable=False, server_default=sa.text("0")))

    if _table_exists(inspector, "transaction_items") and _table_exists(inspector, "books"):
        op.execute(
            sa.text(
                """
                UPDATE transaction_items
                SET cost_at_sale = (
                    SELECT books.cost_price
                    FROM books
                    WHERE books.id = transaction_items.book_id
                )
                WHERE COALESCE(cost_at_sale, 0) = 0
                """
            )
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "transaction_items"):
        _create_index_if_missing(inspector, "transaction_items", "ix_transaction_items_id", ["id"])

    if not _table_exists(inspector, "reservations"):
        op.create_table(
            "reservations",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")),
            sa.Column("deposit_amount", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'pending'")),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    else:
        if not _has_column(inspector, "reservations", "quantity"):
            op.add_column("reservations", sa.Column("quantity", sa.Integer(), nullable=False, server_default=sa.text("1")))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "reservations"):
        _create_index_if_missing(inspector, "reservations", "ix_reservations_id", ["id"])

    if not _table_exists(inspector, "safe_transactions"):
        op.create_table(
            "safe_transactions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("type", sa.String(), nullable=False),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "safe_transactions"):
        _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_id", ["id"])

    if not _table_exists(inspector, "audit_logs"):
        op.create_table(
            "audit_logs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("details", sa.String(), nullable=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "audit_logs"):
        _create_index_if_missing(inspector, "audit_logs", "ix_audit_logs_id", ["id"])

    if not _table_exists(inspector, "inventory_sessions"):
        op.create_table(
            "inventory_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("total_cash_found", sa.Float(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "inventory_sessions"):
        _create_index_if_missing(inspector, "inventory_sessions", "ix_inventory_sessions_id", ["id"])

    if not _table_exists(inspector, "supplies"):
        op.create_table(
            "supplies",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("book_id", sa.Integer(), sa.ForeignKey("books.id"), nullable=False),
            sa.Column("quantity", sa.Integer(), nullable=False),
            sa.Column("unit_cost", sa.Float(), nullable=False),
            sa.Column("total_cost", sa.Float(), nullable=False),
            sa.Column("paid_amount", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("supplier_name", sa.String(), nullable=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("timestamp", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "supplies"):
        _create_index_if_missing(inspector, "supplies", "ix_supplies_id", ["id"])

    if not _table_exists(inspector, "receipt_archives"):
        op.create_table(
            "receipt_archives",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("transaction_code", sa.String(), nullable=True),
            sa.Column("receipt_type", sa.String(), nullable=False),
            sa.Column("staff_name", sa.String(), nullable=True),
            sa.Column("payload", sa.Text(), nullable=False),
            sa.Column("printed_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "receipt_archives"):
        _create_index_if_missing(inspector, "receipt_archives", "ix_receipt_archives_id", ["id"])
        _create_index_if_missing(inspector, "receipt_archives", "ix_receipt_archives_transaction_code", ["transaction_code"])

    if not _table_exists(inspector, "users"):
        op.create_table(
            "users",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("username", sa.String(), nullable=False),
            sa.Column("full_name", sa.String(), nullable=False),
            sa.Column("hashed_password", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("locked_until", sa.DateTime(), nullable=True),
            sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
    else:
        if not _has_column(inspector, "users", "failed_login_attempts"):
            op.add_column("users", sa.Column("failed_login_attempts", sa.Integer(), nullable=False, server_default=sa.text("0")))
        if not _has_column(inspector, "users", "locked_until"):
            op.add_column("users", sa.Column("locked_until", sa.DateTime(), nullable=True))
        if not _has_column(inspector, "users", "token_version"):
            op.add_column("users", sa.Column("token_version", sa.Integer(), nullable=False, server_default=sa.text("0")))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "users"):
        _create_index_if_missing(inspector, "users", "ix_users_id", ["id"])
        _create_index_if_missing(inspector, "users", "ix_users_username", ["username"], unique=True)

    if not _table_exists(inspector, "roles"):
        op.create_table(
            "roles",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "roles"):
        _create_index_if_missing(inspector, "roles", "ix_roles_id", ["id"])
        _create_index_if_missing(inspector, "roles", "ix_roles_name", ["name"], unique=True)
        for role_name in ("admin", "manager", "cashier", "viewer"):
            op.execute(
                sa.text(
                    "INSERT INTO roles(name) SELECT :name WHERE NOT EXISTS (SELECT 1 FROM roles WHERE name = :name)"
                ).bindparams(name=role_name)
            )

    if not _table_exists(inspector, "user_roles"):
        op.create_table(
            "user_roles",
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), primary_key=True),
            sa.Column("role_id", sa.Integer(), sa.ForeignKey("roles.id"), primary_key=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if not _table_exists(inspector, "refresh_tokens"):
        op.create_table(
            "refresh_tokens",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("token_hash", sa.String(), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("revoked_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("issued_ip", sa.String(), nullable=True),
            sa.Column("user_agent", sa.String(), nullable=True),
        )
    inspector = sa.inspect(bind)
    if _table_exists(inspector, "refresh_tokens"):
        _create_index_if_missing(inspector, "refresh_tokens", "ix_refresh_tokens_id", ["id"])
        _create_index_if_missing(inspector, "refresh_tokens", "ix_refresh_tokens_user_id", ["user_id"])
        _create_index_if_missing(inspector, "refresh_tokens", "ix_refresh_tokens_token_hash", ["token_hash"], unique=True)
        _create_index_if_missing(inspector, "refresh_tokens", "ix_refresh_tokens_expires_at", ["expires_at"])
        _create_index_if_missing(inspector, "refresh_tokens", "ix_refresh_tokens_revoked_at", ["revoked_at"])


def downgrade() -> None:
    # Intentionally non-destructive to protect production data integrity.
    # Use point-in-time restore + application rollback for emergency reversions.
    pass

