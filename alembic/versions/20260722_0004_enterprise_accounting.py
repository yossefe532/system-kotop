"""add enterprise accounting ledger and reconciliation tables

Revision ID: 20260722_0004
Revises: 20260722_0003
Create Date: 2026-07-22 18:30:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260722_0004"
down_revision = "20260722_0003"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _column_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {column["name"] for column in inspector.get_columns(table_name)}


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _create_index_if_missing(inspector: sa.Inspector, table_name: str, index_name: str, columns: list[str], unique: bool = False) -> None:
    if index_name not in _index_names(inspector, table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def _add_column_if_missing(inspector: sa.Inspector, table_name: str, column: sa.Column) -> None:
    if column.name not in _column_names(inspector, table_name):
        op.add_column(table_name, column)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "ledger_accounts"):
        op.create_table(
            "ledger_accounts",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("code", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("account_type", sa.String(), nullable=False),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
            sa.Column("allow_manual_entries", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if not _table_exists(inspector, "journal_entries"):
        op.create_table(
            "journal_entries",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("entry_number", sa.String(), nullable=False),
            sa.Column("source_type", sa.String(), nullable=True),
            sa.Column("source_id", sa.Integer(), nullable=True),
            sa.Column("reference", sa.String(), nullable=True),
            sa.Column("description", sa.String(), nullable=False),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'posted'")),
            sa.Column("period_key", sa.String(), nullable=False),
            sa.Column("event_timestamp", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("posted_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("is_reversal", sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column("reversal_of_entry_id", sa.Integer(), nullable=True),
            sa.Column("metadata_json", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.ForeignKeyConstraint(["reversal_of_entry_id"], ["journal_entries.id"]),
            sa.UniqueConstraint("source_type", "source_id", name="uq_journal_entry_source"),
        )

    if not _table_exists(inspector, "journal_lines"):
        op.create_table(
            "journal_lines",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("journal_entry_id", sa.Integer(), nullable=False),
            sa.Column("account_id", sa.Integer(), nullable=False),
            sa.Column("line_type", sa.String(), nullable=False),
            sa.Column("amount", sa.Float(), nullable=False),
            sa.Column("memo", sa.String(), nullable=True),
            sa.ForeignKeyConstraint(["journal_entry_id"], ["journal_entries.id"]),
            sa.ForeignKeyConstraint(["account_id"], ["ledger_accounts.id"]),
        )

    if not _table_exists(inspector, "financial_audit_trail"):
        op.create_table(
            "financial_audit_trail",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("entity_type", sa.String(), nullable=False),
            sa.Column("entity_id", sa.Integer(), nullable=True),
            sa.Column("action", sa.String(), nullable=False),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("reason", sa.String(), nullable=True),
            sa.Column("previous_value", sa.Text(), nullable=True),
            sa.Column("new_value", sa.Text(), nullable=True),
            sa.Column("originating_transaction_type", sa.String(), nullable=True),
            sa.Column("originating_transaction_id", sa.Integer(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    if not _table_exists(inspector, "financial_periods"):
        op.create_table(
            "financial_periods",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("period_key", sa.String(), nullable=False),
            sa.Column("period_type", sa.String(), nullable=False),
            sa.Column("starts_at", sa.DateTime(), nullable=False),
            sa.Column("ends_at", sa.DateTime(), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'open'")),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
            sa.Column("closed_by", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.UniqueConstraint("period_key", "period_type", name="uq_financial_period_key_type"),
        )

    if not _table_exists(inspector, "cash_drawer_sessions"):
        op.create_table(
            "cash_drawer_sessions",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("opening_balance", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("expected_cash", sa.Float(), nullable=True),
            sa.Column("counted_cash", sa.Float(), nullable=True),
            sa.Column("variance_amount", sa.Float(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'open'")),
            sa.Column("supervisor_name", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("opened_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("closed_at", sa.DateTime(), nullable=True),
        )

    if not _table_exists(inspector, "reconciliation_runs"):
        op.create_table(
            "reconciliation_runs",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("reconciliation_type", sa.String(), nullable=False),
            sa.Column("period_key", sa.String(), nullable=False),
            sa.Column("starts_at", sa.DateTime(), nullable=False),
            sa.Column("ends_at", sa.DateTime(), nullable=False),
            sa.Column("expected_cash", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("counted_cash", sa.Float(), nullable=True),
            sa.Column("variance_amount", sa.Float(), nullable=False, server_default=sa.text("0")),
            sa.Column("exception_count", sa.Integer(), nullable=False, server_default=sa.text("0")),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'balanced'")),
            sa.Column("staff_name", sa.String(), nullable=False),
            sa.Column("supervisor_name", sa.String(), nullable=True),
            sa.Column("notes", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "safe_transactions"):
        _add_column_if_missing(inspector, "safe_transactions", sa.Column("source_type", sa.String(), nullable=True))
        _add_column_if_missing(inspector, "safe_transactions", sa.Column("source_id", sa.Integer(), nullable=True))
        _add_column_if_missing(inspector, "safe_transactions", sa.Column("journal_entry_id", sa.Integer(), nullable=True))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "inventory_sessions"):
        _add_column_if_missing(inspector, "inventory_sessions", sa.Column("expected_cash", sa.Float(), nullable=False, server_default=sa.text("0")))
        _add_column_if_missing(inspector, "inventory_sessions", sa.Column("variance_amount", sa.Float(), nullable=False, server_default=sa.text("0")))
        _add_column_if_missing(inspector, "inventory_sessions", sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'reconciled'")))
        _add_column_if_missing(inspector, "inventory_sessions", sa.Column("supervisor_name", sa.String(), nullable=True))
        _add_column_if_missing(inspector, "inventory_sessions", sa.Column("approval_notes", sa.Text(), nullable=True))

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "ledger_accounts"):
        _create_index_if_missing(inspector, "ledger_accounts", "ix_ledger_accounts_code", ["code"], unique=True)
        _create_index_if_missing(inspector, "ledger_accounts", "ix_ledger_accounts_account_type", ["account_type"])
    if _table_exists(inspector, "journal_entries"):
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_entry_number", ["entry_number"], unique=True)
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_source_type", ["source_type"])
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_source_id", ["source_id"])
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_period_key", ["period_key"])
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_status", ["status"])
        _create_index_if_missing(inspector, "journal_entries", "ix_journal_entries_event_timestamp", ["event_timestamp"])
    if _table_exists(inspector, "journal_lines"):
        _create_index_if_missing(inspector, "journal_lines", "ix_journal_lines_journal_entry_id", ["journal_entry_id"])
        _create_index_if_missing(inspector, "journal_lines", "ix_journal_lines_account_id", ["account_id"])
        _create_index_if_missing(inspector, "journal_lines", "ix_journal_lines_line_type", ["line_type"])
    if _table_exists(inspector, "financial_audit_trail"):
        _create_index_if_missing(inspector, "financial_audit_trail", "ix_financial_audit_trail_entity_type", ["entity_type"])
        _create_index_if_missing(inspector, "financial_audit_trail", "ix_financial_audit_trail_entity_id", ["entity_id"])
        _create_index_if_missing(inspector, "financial_audit_trail", "ix_financial_audit_trail_action", ["action"])
        _create_index_if_missing(inspector, "financial_audit_trail", "ix_financial_audit_trail_created_at", ["created_at"])
    if _table_exists(inspector, "financial_periods"):
        _create_index_if_missing(inspector, "financial_periods", "ix_financial_periods_period_key", ["period_key"])
        _create_index_if_missing(inspector, "financial_periods", "ix_financial_periods_period_type", ["period_type"])
        _create_index_if_missing(inspector, "financial_periods", "ix_financial_periods_status", ["status"])
    if _table_exists(inspector, "cash_drawer_sessions"):
        _create_index_if_missing(inspector, "cash_drawer_sessions", "ix_cash_drawer_sessions_staff_name", ["staff_name"])
        _create_index_if_missing(inspector, "cash_drawer_sessions", "ix_cash_drawer_sessions_status", ["status"])
        _create_index_if_missing(inspector, "cash_drawer_sessions", "ix_cash_drawer_sessions_opened_at", ["opened_at"])
        _create_index_if_missing(inspector, "cash_drawer_sessions", "ix_cash_drawer_sessions_closed_at", ["closed_at"])
    if _table_exists(inspector, "reconciliation_runs"):
        _create_index_if_missing(inspector, "reconciliation_runs", "ix_reconciliation_runs_reconciliation_type", ["reconciliation_type"])
        _create_index_if_missing(inspector, "reconciliation_runs", "ix_reconciliation_runs_period_key", ["period_key"])
        _create_index_if_missing(inspector, "reconciliation_runs", "ix_reconciliation_runs_status", ["status"])
        _create_index_if_missing(inspector, "reconciliation_runs", "ix_reconciliation_runs_created_at", ["created_at"])
    if _table_exists(inspector, "safe_transactions"):
        _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_source_type", ["source_type"])
        _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_source_id", ["source_id"])
        _create_index_if_missing(inspector, "safe_transactions", "ix_safe_transactions_journal_entry_id", ["journal_entry_id"])


def downgrade() -> None:
    # Intentionally non-destructive to preserve historical accounting integrity.
    pass
