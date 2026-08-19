"""add sync replay records for idempotent offline sync

Revision ID: 20260722_0003
Revises: 20261210_0002
Create Date: 2026-07-22 12:00:00
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260722_0003"
down_revision = "20261210_0002"
branch_labels = None
depends_on = None


def _table_exists(inspector: sa.Inspector, table_name: str) -> bool:
    return table_name in inspector.get_table_names()


def _index_names(inspector: sa.Inspector, table_name: str) -> set[str]:
    return {idx["name"] for idx in inspector.get_indexes(table_name)}


def _create_index_if_missing(
    inspector: sa.Inspector,
    table_name: str,
    index_name: str,
    columns: list[str],
    unique: bool = False,
) -> None:
    if index_name not in _index_names(inspector, table_name):
        op.create_index(index_name, table_name, columns, unique=unique)


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not _table_exists(inspector, "sync_replay_records"):
        op.create_table(
            "sync_replay_records",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("operation_id", sa.String(), nullable=False),
            sa.Column("operation_type", sa.String(), nullable=True),
            sa.Column("request_method", sa.String(), nullable=False),
            sa.Column("request_path", sa.String(), nullable=False),
            sa.Column("fingerprint", sa.String(), nullable=False),
            sa.Column("replay_token", sa.String(), nullable=True),
            sa.Column("status", sa.String(), nullable=False, server_default=sa.text("'processing'")),
            sa.Column("response_status", sa.Integer(), nullable=True),
            sa.Column("response_body", sa.Text(), nullable=True),
            sa.Column("error_detail", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("last_seen_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )

    inspector = sa.inspect(bind)
    if _table_exists(inspector, "sync_replay_records"):
        _create_index_if_missing(inspector, "sync_replay_records", "ix_sync_replay_records_id", ["id"])
        _create_index_if_missing(
            inspector,
            "sync_replay_records",
            "ix_sync_replay_records_operation_id",
            ["operation_id"],
            unique=True,
        )
        _create_index_if_missing(
            inspector,
            "sync_replay_records",
            "ix_sync_replay_records_operation_type",
            ["operation_type"],
        )
        _create_index_if_missing(
            inspector,
            "sync_replay_records",
            "ix_sync_replay_records_replay_token",
            ["replay_token"],
        )
        _create_index_if_missing(
            inspector,
            "sync_replay_records",
            "ix_sync_replay_records_status",
            ["status"],
        )


def downgrade() -> None:
    # Intentionally non-destructive to preserve replay history.
    pass
