"""add goals subscriptions and split expenses

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-04

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

currency_code_enum = postgresql.ENUM("vnd", "jpy", name="currency_code_enum", create_type=False)
goal_entry_type_enum = postgresql.ENUM(
    "contribution", "withdrawal", name="goal_entry_type_enum", create_type=False
)
subscription_billing_cycle_enum = postgresql.ENUM(
    "weekly",
    "monthly",
    "yearly",
    name="subscription_billing_cycle_enum",
    create_type=False,
)
subscription_status_enum = postgresql.ENUM(
    "active", "paused", "cancelled", name="subscription_status_enum", create_type=False
)
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
    bind = op.get_bind()
    goal_entry_type_enum.create(bind, checkfirst=True)
    subscription_billing_cycle_enum.create(bind, checkfirst=True)
    subscription_status_enum.create(bind, checkfirst=True)
    split_method_enum.create(bind, checkfirst=True)
    split_status_enum.create(bind, checkfirst=True)

    op.create_table(
        "goals",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("icon", sa.String(length=32), nullable=True),
        sa.Column("target_amount", sa.Integer(), nullable=False),
        sa.Column("current_amount", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column(
            "linked_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id"),
            nullable=True,
        ),
        sa.Column("monthly_contribution", sa.Integer(), nullable=True),
        sa.Column("is_paused", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("target_amount > 0", name="ck_goals_target_amount_positive"),
        sa.CheckConstraint("current_amount >= 0", name="ck_goals_current_amount_non_negative"),
        sa.CheckConstraint(
            "monthly_contribution IS NULL OR monthly_contribution > 0",
            name="ck_goals_monthly_contribution_positive",
        ),
    )
    op.create_index("ix_goals_family_id", "goals", ["family_id"])

    op.create_table(
        "goal_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "goal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("entry_type", goal_entry_type_enum, nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(POSITIVE_AMOUNT_CHECK, name="ck_goal_entries_amount_positive"),
    )
    op.create_index("ix_goal_entries_family_id", "goal_entries", ["family_id"])
    op.create_index("ix_goal_entries_goal_id", "goal_entries", ["goal_id"])

    op.create_table(
        "subscriptions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("merchant", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency_code", currency_code_enum, nullable=False, server_default="jpy"),
        sa.Column("billing_cycle", subscription_billing_cycle_enum, nullable=False),
        sa.Column("next_billing_date", sa.Date(), nullable=False),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column("status", subscription_status_enum, nullable=False, server_default="active"),
        sa.Column("cancellation_url", sa.String(length=500), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(POSITIVE_AMOUNT_CHECK, name="ck_subscriptions_amount_positive"),
        sa.CheckConstraint(
            "cancellation_url IS NULL OR length(cancellation_url) > 0",
            name="ck_subscriptions_cancellation_url_non_empty",
        ),
    )
    op.create_index("ix_subscriptions_family_id", "subscriptions", ["family_id"])

    op.create_table(
        "split_expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "expense_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
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
        sa.UniqueConstraint("expense_id", name="uq_split_expenses_expense_id"),
    )
    op.create_index("ix_split_expenses_family_id", "split_expenses", ["family_id"])
    op.create_index("ix_split_expenses_expense_id", "split_expenses", ["expense_id"])

    op.create_table(
        "split_expense_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expenses.id", ondelete="CASCADE"),
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
        sa.CheckConstraint(POSITIVE_AMOUNT_CHECK, name="ck_split_expense_items_amount_positive"),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_split_expense_items_percentage_range",
        ),
        sa.UniqueConstraint(
            "split_expense_id",
            "participant_user_id",
            name="uq_split_expense_items_split_participant",
        ),
    )
    op.create_index("ix_split_expense_items_split_expense_id", "split_expense_items", ["split_expense_id"])

    op.alter_column("goals", "current_amount", server_default=None)
    op.alter_column("goals", "is_paused", server_default=None)
    op.alter_column("subscriptions", "currency_code", server_default=None)
    op.alter_column("subscriptions", "status", server_default=None)
    op.alter_column("split_expenses", "status", server_default=None)
    op.alter_column("split_expense_items", "is_settled", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_split_expense_items_split_expense_id", table_name="split_expense_items")
    op.drop_table("split_expense_items")

    op.drop_index("ix_split_expenses_expense_id", table_name="split_expenses")
    op.drop_index("ix_split_expenses_family_id", table_name="split_expenses")
    op.drop_table("split_expenses")

    op.drop_index("ix_subscriptions_family_id", table_name="subscriptions")
    op.drop_table("subscriptions")

    op.drop_index("ix_goal_entries_goal_id", table_name="goal_entries")
    op.drop_index("ix_goal_entries_family_id", table_name="goal_entries")
    op.drop_table("goal_entries")

    op.drop_index("ix_goals_family_id", table_name="goals")
    op.drop_table("goals")

    split_status_enum.drop(bind, checkfirst=True)
    split_method_enum.drop(bind, checkfirst=True)
    subscription_status_enum.drop(bind, checkfirst=True)
    subscription_billing_cycle_enum.drop(bind, checkfirst=True)
    goal_entry_type_enum.drop(bind, checkfirst=True)
