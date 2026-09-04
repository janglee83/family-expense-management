import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.family import CurrencyCode


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_cls.__members__.values()]


class AccountType(StrEnum):
    BANK = "bank"
    CASH = "cash"
    INVESTMENT = "investment"
    CREDIT_CARD = "credit_card"
    LOAN = "loan"


class Account(Base):
    __tablename__ = "accounts"
    __table_args__ = (
        CheckConstraint(
            "credit_limit IS NULL OR credit_limit > 0",
            name="ck_accounts_credit_limit_positive",
        ),
        CheckConstraint(
            "minimum_payment IS NULL OR minimum_payment >= 0",
            name="ck_accounts_minimum_payment_non_negative",
        ),
        CheckConstraint(
            "statement_balance >= 0",
            name="ck_accounts_statement_balance_non_negative",
        ),
        CheckConstraint(
            "statement_closing_day IS NULL OR (statement_closing_day BETWEEN 1 AND 31)",
            name="ck_accounts_statement_closing_day_range",
        ),
        CheckConstraint(
            "payment_due_day IS NULL OR (payment_due_day BETWEEN 1 AND 31)",
            name="ck_accounts_payment_due_day_range",
        ),
        CheckConstraint(
            "(account_type = 'credit_card' AND credit_limit IS NOT NULL "
            "AND statement_closing_day IS NOT NULL AND payment_due_day IS NOT NULL) "
            "OR (account_type <> 'credit_card' AND credit_limit IS NULL "
            "AND statement_closing_day IS NULL AND payment_due_day IS NULL "
            "AND minimum_payment IS NULL AND statement_balance = 0)",
            name="ck_accounts_credit_card_fields_consistent",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    account_type: Mapped[AccountType] = mapped_column(
        Enum(AccountType, name="account_type_enum", values_callable=_enum_values),
        nullable=False,
    )
    currency_code: Mapped[CurrencyCode] = mapped_column(
        Enum(CurrencyCode, name="currency_code_enum", values_callable=_enum_values),
        nullable=False,
        default=CurrencyCode.JPY,
    )
    current_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    credit_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)
    statement_closing_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    payment_due_day: Mapped[int | None] = mapped_column(Integer, nullable=True)
    minimum_payment: Mapped[int | None] = mapped_column(Integer, nullable=True)
    statement_balance: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
