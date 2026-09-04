"""add undo actions

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-04

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "undo_actions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("undo_token", sa.String(length=64), nullable=False, unique=True),
        sa.Column("payload_json", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "length(entity_type) > 0",
            name="ck_undo_actions_entity_type_non_empty",
        ),
        sa.CheckConstraint(
            "length(undo_token) > 0",
            name="ck_undo_actions_token_non_empty",
        ),
    )
    op.create_index("ix_undo_actions_family_id", "undo_actions", ["family_id"])
    op.create_index(
        "ix_undo_actions_family_entity",
        "undo_actions",
        ["family_id", "entity_type", "entity_id"],
    )
    op.create_index("ix_undo_actions_expires_at", "undo_actions", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_undo_actions_expires_at", table_name="undo_actions")
    op.drop_index("ix_undo_actions_family_entity", table_name="undo_actions")
    op.drop_index("ix_undo_actions_family_id", table_name="undo_actions")
    op.drop_table("undo_actions")
