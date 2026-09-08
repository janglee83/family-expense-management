"""add split expense groups

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-08

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

split_method_enum = postgresql.ENUM(
    "equal", "custom", "percentage", name="split_method_enum", create_type=False
)
split_status_enum = postgresql.ENUM(
    "pending", "settled", name="split_status_enum", create_type=False
)
FAMILY_FK = "families.id"
USER_FK = "users.id"
POSITIVE_AMOUNT_CHECK = "amount > 0"


def upgrade() -> None:
    op.create_table(
        "split_expense_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("method", split_method_enum, nullable=False),
        sa.Column("status", split_status_enum, nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_split_expense_groups_family_id", "split_expense_groups", ["family_id"])

    op.create_table(
        "split_expense_group_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "expense_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("expense_id", name="uq_split_expense_group_items_expense_id"),
    )
    op.create_index(
        "ix_split_expense_group_items_split_expense_group_id",
        "split_expense_group_items",
        ["split_expense_group_id"],
    )

    op.create_table(
        "split_expense_group_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participant_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Integer(), nullable=True),
        sa.Column("is_settled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            POSITIVE_AMOUNT_CHECK, name="ck_split_expense_group_participants_amount_positive"
        ),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_split_expense_group_participants_percentage_range",
        ),
        sa.UniqueConstraint(
            "split_expense_group_id",
            "participant_user_id",
            name="uq_split_expense_group_participants_group_participant",
        ),
    )
    op.create_index(
        "ix_split_expense_group_participants_split_expense_group_id",
        "split_expense_group_participants",
        ["split_expense_group_id"],
    )

    op.alter_column("split_expense_groups", "status", server_default=None)
    op.alter_column("split_expense_group_participants", "is_settled", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_split_expense_group_participants_split_expense_group_id",
        table_name="split_expense_group_participants",
    )
    op.drop_table("split_expense_group_participants")

    op.drop_index(
        "ix_split_expense_group_items_split_expense_group_id",
        table_name="split_expense_group_items",
    )
    op.drop_table("split_expense_group_items")

    op.drop_index("ix_split_expense_groups_family_id", table_name="split_expense_groups")
    op.drop_table("split_expense_groups")
