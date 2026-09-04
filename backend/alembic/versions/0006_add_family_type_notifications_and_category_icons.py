"""add family type, notifications, and category icons

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-03

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("family_type", sa.String(length=20), nullable=True))
    op.add_column("families", sa.Column("monthly_income", sa.Integer(), nullable=True))
    op.execute("UPDATE families SET family_type = 'shared' WHERE family_type IS NULL")
    op.alter_column("families", "family_type", nullable=False)
    op.create_check_constraint(
        "ck_families_monthly_income_positive",
        "families",
        "monthly_income IS NULL OR monthly_income > 0",
    )

    op.add_column("categories", sa.Column("icon", sa.String(length=32), nullable=True))
    op.execute(
        """
        UPDATE categories
        SET icon = CASE name
            WHEN 'groceries' THEN 'basket'
            WHEN 'dining' THEN 'utensils'
            WHEN 'transport' THEN 'car'
            WHEN 'utilities' THEN 'bolt'
            WHEN 'entertainment' THEN 'sparkles'
            ELSE 'tag'
        END
        WHERE family_id IS NULL
        """
    )

    op.create_table(
        "notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "actor_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("message", sa.String(length=500), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_family_id", "notifications", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_notifications_family_id", table_name="notifications")
    op.drop_index("ix_notifications_user_id", table_name="notifications")
    op.drop_table("notifications")

    op.drop_column("categories", "icon")

    op.drop_constraint("ck_families_monthly_income_positive", "families", type_="check")
    op.drop_column("families", "monthly_income")
    op.drop_column("families", "family_type")
