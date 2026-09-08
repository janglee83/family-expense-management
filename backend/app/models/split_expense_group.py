import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.split_expense import SplitMethod, SplitStatus


def _enum_values(enum_cls: type[SplitMethod] | type[SplitStatus]) -> list[str]:
    return [item.value for item in enum_cls.__members__.values()]


class SplitExpenseGroup(Base):
    __tablename__ = "split_expense_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    method: Mapped[SplitMethod] = mapped_column(
        Enum(SplitMethod, name="split_method_enum", values_callable=_enum_values),
        nullable=False,
    )
    status: Mapped[SplitStatus] = mapped_column(
        Enum(SplitStatus, name="split_status_enum", values_callable=_enum_values),
        nullable=False,
        default=SplitStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SplitExpenseGroupItem(Base):
    __tablename__ = "split_expense_group_items"
    __table_args__ = (
        UniqueConstraint("expense_id", name="uq_split_expense_group_items_expense_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    split_expense_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expense_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("expenses.id", ondelete="CASCADE"),
        nullable=False,
    )


class SplitExpenseGroupParticipant(Base):
    __tablename__ = "split_expense_group_participants"
    __table_args__ = (
        CheckConstraint(
            "amount > 0", name="ck_split_expense_group_participants_amount_positive"
        ),
        CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_split_expense_group_participants_percentage_range",
        ),
        UniqueConstraint(
            "split_expense_group_id",
            "participant_user_id",
            name="uq_split_expense_group_participants_group_participant",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    split_expense_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
