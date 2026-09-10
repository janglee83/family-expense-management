"""add split expense group settlements

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-10

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "split_expense_group_settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "from_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column(
            "to_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("is_settled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "amount > 0", name="ck_split_expense_group_settlements_amount_positive"
        ),
        sa.CheckConstraint(
            "from_user_id <> to_user_id",
            name="ck_split_expense_group_settlements_distinct_users",
        ),
    )
    op.create_index(
        "ix_split_expense_group_settlements_split_expense_group_id",
        "split_expense_group_settlements",
        ["split_expense_group_id"],
    )

    op.alter_column("split_expense_group_settlements", "is_settled", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_split_expense_group_settlements_split_expense_group_id",
        table_name="split_expense_group_settlements",
    )
    op.drop_table("split_expense_group_settlements")
