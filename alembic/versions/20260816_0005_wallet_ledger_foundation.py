"""add student wallet ledger foundation (merge of accounting + perf branches)

Revision ID: 20260816_0005
Revises: 20260722_0004, 20261210_0002
Create Date: 2026-08-16 00:00:00
"""

from __future__ import annotations

from datetime import datetime

from alembic import op
import sqlalchemy as sa


revision = "20260816_0005"
down_revision = ("20260722_0004", "20261210_0002")
branch_labels = None
depends_on = None

VALID_ENTRY_TYPES = (
    "purchase_debt",
    "deposit_change",
    "purchase_wallet",
    "pickup_wallet",
    "refund_cancel_reservation",
    "refund_return_sale",
    "manual_adjustment",
    "correction",
    "migration_opening_balance",
)


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _create_index_if_missing(inspector: sa.Inspector, table_name: str, index_name: str, columns: list[str], unique: bool = False) -> None:
    if index_name not in _index_names(inspector, table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ---- Student wallet ledger table ----
    if not _table_exists(inspector, "student_wallet_entries"):
        op.create_table(
            "student_wallet_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("student_id", sa.Integer(), nullable=False),
            sa.Column("entry_type", sa.String(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("direction", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(), nullable=True),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("operation_id", sa.String(), nullable=False),
            sa.Column("balance_before", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("balance_after", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("created_by", sa.String(), nullable=True),
            sa.Column("device_id", sa.String(), nullable=True),
            sa.Column("reversal_of_entry_id", sa.Integer(), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.ForeignKeyConstraint(["student_id"], ["students.id"]),
            sa.ForeignKeyConstraint(["reversal_of_entry_id"], ["student_wallet_entries.id"]),
            sa.CheckConstraint(
                "entry_type IN (" + ", ".join(f"'{t}'" for t in VALID_ENTRY_TYPES) + ")",
                name="ck_student_wallet_entries_entry_type",
            ),
            sa.UniqueConstraint("operation_id", name="uq_student_wallet_entries_operation_id"),
        )

    # ---- 1300 Student Wallet liability account (idempotent seed) ----
    if _table_exists(inspector, "ledger_accounts"):
        conn = op.get_bind()
        existing_code = conn.execute(
            sa.text("SELECT code FROM ledger_accounts WHERE code = '1300'")
        ).fetchone()
        if not existing_code:
            conn.execute(
                sa.text(
                    "INSERT INTO ledger_accounts (code, name, account_type, is_active, allow_manual_entries, created_at) "
                    "VALUES ('1300', 'Student Wallet', 'liability', :active, :manual, :now)"
                ),
                {"active": True, "manual": False, "now": datetime.utcnow()},
            )

    # ---- Indexes ----
    if _table_exists(inspector, "student_wallet_entries"):
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_student_id", ["student_id"])
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_entry_type", ["entry_type"])
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_source_type", ["source_type"])
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_source_id", ["source_id"])
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_created_at", ["created_at"])
        _create_index_if_missing(inspector, "student_wallet_entries", "ix_student_wallet_entries_device_id", ["device_id"])


def downgrade() -> None:
    # Intentionally non-destructive to preserve historical wallet ledger integrity.
    pass
