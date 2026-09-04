"""add monthly income enabled toggle

Revision ID: 0008
Revises: 0007
Create Date: 2026-09-04

"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "families",
        sa.Column("monthly_income_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.execute(
        """
        UPDATE families
        SET monthly_income_enabled = CASE
            WHEN monthly_income IS NULL THEN FALSE
            ELSE TRUE
        END
        """
    )
    op.alter_column("families", "monthly_income_enabled", server_default=None)

    op.drop_constraint("ck_families_solo_monthly_income_required", "families", type_="check")
    op.create_check_constraint(
        "ck_families_monthly_income_enabled_consistent",
        "families",
        "(NOT monthly_income_enabled AND monthly_income IS NULL) OR (monthly_income_enabled AND monthly_income IS NOT NULL)",
    )


def downgrade() -> None:
    op.drop_constraint("ck_families_monthly_income_enabled_consistent", "families", type_="check")
    op.create_check_constraint(
        "ck_families_solo_monthly_income_required",
        "families",
        "(family_type <> 'solo') OR monthly_income IS NOT NULL",
    )
    op.drop_column("families", "monthly_income_enabled")
