import uuid

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.split_expense import SplitMethod, SplitStatus


class SplitParticipantInput(BaseModel):
    participant_user_id: uuid.UUID
    amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    percentage: int | None = Field(default=None, ge=0, le=100)


class CreateSplitExpenseRequest(BaseModel):
    expense_id: uuid.UUID
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
    def _validate_split_payload(self) -> "CreateSplitExpenseRequest":
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


class SettleSplitExpenseItemRequest(BaseModel):
    is_settled: bool = True


class SplitExpenseItemResponse(BaseModel):
    id: uuid.UUID
    split_expense_id: uuid.UUID
    participant_user_id: uuid.UUID
    amount: int
    percentage: int | None
    is_settled: bool


class SplitExpenseResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    expense_id: uuid.UUID
    created_by_user_id: uuid.UUID
    method: SplitMethod
    status: SplitStatus
    total_amount: int
    settled_amount: int
    outstanding_amount: int
    items: list[SplitExpenseItemResponse]
