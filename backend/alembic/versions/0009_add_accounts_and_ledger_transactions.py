"""add accounts and ledger transactions

Revision ID: 0009
Revises: 0008
Create Date: 2026-09-04

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


account_type_enum = postgresql.ENUM(
    "bank",
    "cash",
    "investment",
    "credit_card",
    "loan",
    name="account_type_enum",
    create_type=False,
)

ledger_transaction_type_enum = postgresql.ENUM(
    "expense",
    "income",
    "transfer",
    "credit_card_purchase",
    "credit_card_payment",
    "goal_contribution",
    "goal_withdrawal",
    name="ledger_transaction_type_enum",
    create_type=False,
)

currency_code_enum = postgresql.ENUM("vnd", "jpy", name="currency_code_enum", create_type=False)


def upgrade() -> None:
    bind = op.get_bind()
    account_type_enum.create(bind, checkfirst=True)
    ledger_transaction_type_enum.create(bind, checkfirst=True)

    op.create_table(
        "accounts",
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
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("account_type", account_type_enum, nullable=False),
        sa.Column("currency_code", currency_code_enum, nullable=False, server_default="jpy"),
        sa.Column("current_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("credit_limit", sa.Integer(), nullable=True),
        sa.Column("statement_closing_day", sa.Integer(), nullable=True),
        sa.Column("payment_due_day", sa.Integer(), nullable=True),
        sa.Column("minimum_payment", sa.Integer(), nullable=True),
        sa.Column("statement_balance", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "credit_limit IS NULL OR credit_limit > 0",
            name="ck_accounts_credit_limit_positive",
        ),
        sa.CheckConstraint(
            "minimum_payment IS NULL OR minimum_payment >= 0",
            name="ck_accounts_minimum_payment_non_negative",
        ),
        sa.CheckConstraint(
            "statement_balance >= 0",
            name="ck_accounts_statement_balance_non_negative",
        ),
        sa.CheckConstraint(
            "statement_closing_day IS NULL OR (statement_closing_day BETWEEN 1 AND 31)",
            name="ck_accounts_statement_closing_day_range",
        ),
        sa.CheckConstraint(
            "payment_due_day IS NULL OR (payment_due_day BETWEEN 1 AND 31)",
            name="ck_accounts_payment_due_day_range",
        ),
        sa.CheckConstraint(
            "(account_type = 'credit_card' AND credit_limit IS NOT NULL "
            "AND statement_closing_day IS NOT NULL AND payment_due_day IS NOT NULL) "
            "OR (account_type <> 'credit_card' AND credit_limit IS NULL "
            "AND statement_closing_day IS NULL AND payment_due_day IS NULL "
            "AND minimum_payment IS NULL AND statement_balance = 0)",
            name="ck_accounts_credit_card_fields_consistent",
        ),
    )
    op.create_index("ix_accounts_family_id", "accounts", ["family_id"])

    op.create_table(
        "ledger_transactions",
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
        sa.Column("transaction_type", ledger_transaction_type_enum, nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("occurred_on", sa.Date(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=True),
        sa.Column("source_account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id"), nullable=True),
        sa.Column(
            "destination_account_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("accounts.id"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "amount > 0",
            name="ck_ledger_transactions_amount_positive",
        ),
        sa.CheckConstraint(
            "source_account_id IS NULL OR destination_account_id IS NULL"
            " OR source_account_id <> destination_account_id",
            name="ck_ledger_transactions_distinct_accounts",
        ),
    )
    op.create_index("ix_ledger_transactions_family_id", "ledger_transactions", ["family_id"])
    op.create_index(
        "ix_ledger_transactions_occurred_on",
        "ledger_transactions",
        ["occurred_on"],
    )

    op.alter_column("accounts", "current_balance", server_default=None)
    op.alter_column("accounts", "is_active", server_default=None)
    op.alter_column("accounts", "statement_balance", server_default=None)
    op.alter_column("accounts", "currency_code", server_default=None)


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_index("ix_ledger_transactions_occurred_on", table_name="ledger_transactions")
    op.drop_index("ix_ledger_transactions_family_id", table_name="ledger_transactions")
    op.drop_table("ledger_transactions")

    op.drop_index("ix_accounts_family_id", table_name="accounts")
    op.drop_table("accounts")

    ledger_transaction_type_enum.drop(bind, checkfirst=True)
    account_type_enum.drop(bind, checkfirst=True)
