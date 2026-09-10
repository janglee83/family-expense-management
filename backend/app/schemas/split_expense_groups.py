import uuid
from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.split_expense import SplitMethod, SplitStatus
from app.schemas.split_expenses import SplitParticipantInput


class SplitExpenseGroupExpenseSummary(BaseModel):
    id: uuid.UUID
    description: str | None
    category_id: uuid.UUID
    amount: int
    expense_date: date
    payer_user_id: uuid.UUID


class SplitExpenseGroupPreviewResponse(BaseModel):
    total_amount: int
    expenses: list[SplitExpenseGroupExpenseSummary]


class CreateSplitExpenseGroupRequest(BaseModel):
    period_start: date
    period_end: date
    method: SplitMethod
    participants: list[SplitParticipantInput] = Field(min_length=2, max_length=50)

    @field_validator("participants")
    @classmethod
    def _validate_no_duplicate_participants(
        cls, values: list[SplitParticipantInput]
    ) -> list[SplitParticipantInput]:
        ids = [item.participant_user_id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("participant_user_id must be unique")
        return values

    @model_validator(mode="after")
    def _validate_period(self) -> "CreateSplitExpenseGroupRequest":
        if self.period_end < self.period_start:
            raise ValueError("period_end must be >= period_start")
        return self

    @model_validator(mode="after")
    def _validate_split_payload(self) -> "CreateSplitExpenseGroupRequest":
        if self.method == SplitMethod.EQUAL:
            return self

        if self.method == SplitMethod.CUSTOM:
            if any(item.amount is None for item in self.participants):
                raise ValueError("amount is required for custom split")
            return self

        if any(item.percentage is None for item in self.participants):
            raise ValueError("percentage is required for percentage split")
        total_percentage = sum(item.percentage or 0 for item in self.participants)
        if total_percentage != 100:
            raise ValueError("percentage split must sum to 100")
        return self


class SplitExpenseGroupParticipantResponse(BaseModel):
    id: uuid.UUID
    split_expense_group_id: uuid.UUID
    participant_user_id: uuid.UUID
    amount: int
    percentage: int | None
    is_settled: bool


class SplitExpenseGroupSettlementResponse(BaseModel):
    id: uuid.UUID
    split_expense_group_id: uuid.UUID
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: int
    is_settled: bool
    settled_at: datetime | None


class SplitExpenseGroupSettlementPreviewItem(BaseModel):
    from_user_id: uuid.UUID
    to_user_id: uuid.UUID
    amount: int


class SplitExpenseGroupSettlementPreviewResponse(BaseModel):
    settlements: list[SplitExpenseGroupSettlementPreviewItem]


class SettleSplitExpenseGroupSettlementRequest(BaseModel):
    is_settled: bool = True


class SplitExpenseGroupResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    period_start: date
    period_end: date
    created_by_user_id: uuid.UUID
    method: SplitMethod
    status: SplitStatus
    total_amount: int
    settled_amount: int
    outstanding_amount: int
    expenses: list[SplitExpenseGroupExpenseSummary]
    participants: list[SplitExpenseGroupParticipantResponse]
    settlements: list[SplitExpenseGroupSettlementResponse]
