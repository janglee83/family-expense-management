"""add categories and expenses

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-25

"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

GLOBAL_CATEGORY_SLUGS = [
    "groceries",
    "dining",
    "transport",
    "utilities",
    "entertainment",
    "other",
]


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_categories_family_id", "categories", ["family_id"])

    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payer_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "category_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("categories.id"),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_family_id", "expenses", ["family_id"])

    categories_table = sa.table(
        "categories",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("family_id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
    )
    op.bulk_insert(
        categories_table,
        [{"id": uuid.uuid4(), "family_id": None, "name": slug} for slug in GLOBAL_CATEGORY_SLUGS],
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_family_id", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("ix_categories_family_id", table_name="categories")
    op.drop_table("categories")
