import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import Boolean, CheckConstraint, DateTime, Enum, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [item.value for item in enum_cls.__members__.values()]


class FamilyType(StrEnum):
    SOLO = "solo"
    SHARED = "shared"


class CurrencyCode(StrEnum):
    VND = "vnd"
    JPY = "jpy"


class Family(Base):
    __tablename__ = "families"
    __table_args__ = (
        CheckConstraint(
            "monthly_income IS NULL OR monthly_income > 0",
            name="ck_families_monthly_income_positive",
        ),
        CheckConstraint(
            "savings_goal_amount IS NULL OR savings_goal_amount > 0",
            name="ck_families_savings_goal_positive",
        ),
        CheckConstraint(
            "(NOT monthly_income_enabled AND monthly_income IS NULL) "
            "OR (monthly_income_enabled AND monthly_income IS NOT NULL)",
            name="ck_families_monthly_income_enabled_consistent",
        ),
        CheckConstraint(
            "(family_type <> 'solo') OR savings_goal_amount IS NOT NULL",
            name="ck_families_solo_savings_goal_required",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    family_type: Mapped[FamilyType] = mapped_column(
        Enum(FamilyType, name="family_type_enum", values_callable=_enum_values),
        nullable=False,
        default=FamilyType.SHARED,
    )
    currency_code: Mapped[CurrencyCode] = mapped_column(
        Enum(CurrencyCode, name="currency_code_enum", values_callable=_enum_values),
        nullable=False,
        default=CurrencyCode.JPY,
    )
    monthly_income_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    monthly_income: Mapped[int | None] = mapped_column(Integer, nullable=True)
    savings_goal_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
