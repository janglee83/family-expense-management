"""add family currency and savings goal enums

Revision ID: 0007
Revises: 0006
Create Date: 2026-09-04

"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


family_type_enum = sa.Enum("solo", "shared", name="family_type_enum")
currency_code_enum = sa.Enum("vnd", "jpy", name="currency_code_enum")


def upgrade() -> None:
    bind = op.get_bind()

    family_type_enum.create(bind, checkfirst=True)
    op.alter_column(
        "families",
        "family_type",
        existing_type=sa.String(length=20),
        type_=family_type_enum,
        postgresql_using="family_type::family_type_enum",
        nullable=False,
    )

    currency_code_enum.create(bind, checkfirst=True)
    op.add_column(
        "families",
        sa.Column(
            "currency_code",
            currency_code_enum,
            nullable=False,
            server_default="jpy",
        ),
    )
    op.add_column("families", sa.Column("savings_goal_amount", sa.Integer(), nullable=True))

    op.execute(
        """
        UPDATE families
        SET savings_goal_amount = COALESCE(monthly_income, 1)
        WHERE family_type = 'solo' AND savings_goal_amount IS NULL
        """
    )

    op.create_check_constraint(
        "ck_families_savings_goal_positive",
        "families",
        "savings_goal_amount IS NULL OR savings_goal_amount > 0",
    )
    op.create_check_constraint(
        "ck_families_solo_monthly_income_required",
        "families",
        "(family_type <> 'solo') OR monthly_income IS NOT NULL",
    )
    op.create_check_constraint(
        "ck_families_solo_savings_goal_required",
        "families",
        "(family_type <> 'solo') OR savings_goal_amount IS NOT NULL",
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_constraint("ck_families_solo_savings_goal_required", "families", type_="check")
    op.drop_constraint("ck_families_solo_monthly_income_required", "families", type_="check")
    op.drop_constraint("ck_families_savings_goal_positive", "families", type_="check")

    op.drop_column("families", "savings_goal_amount")
    op.drop_column("families", "currency_code")
    currency_code_enum.drop(bind, checkfirst=True)

    op.alter_column(
        "families",
        "family_type",
        existing_type=family_type_enum,
        type_=sa.String(length=20),
        postgresql_using="family_type::text",
        nullable=False,
    )
    family_type_enum.drop(bind, checkfirst=True)
