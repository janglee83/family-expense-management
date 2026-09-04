import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator

from app.models.goal import GoalEntryType


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class CreateGoalRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    target_amount: int = Field(gt=0, le=2_147_483_647)
    current_amount: int = Field(default=0, ge=0, le=2_147_483_647)
    target_date: date | None = None
    linked_account_id: uuid.UUID | None = None
    monthly_contribution: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @field_validator("icon")
    @classmethod
    def _normalize_icon(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None


class UpdateGoalRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    icon: str | None = Field(default=None, min_length=1, max_length=32)
    target_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    target_date: date | None = None
    linked_account_id: uuid.UUID | None = None
    monthly_contribution: int | None = Field(default=None, gt=0, le=2_147_483_647)
    is_paused: bool | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)

    @field_validator("icon")
    @classmethod
    def _normalize_icon(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().lower()
        return normalized or None


class GoalEntryRequest(BaseModel):
    entry_type: GoalEntryType
    amount: int = Field(gt=0, le=2_147_483_647)
    occurred_on: date
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def _normalize_note(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None


class GoalEntryResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    goal_id: uuid.UUID
    created_by_user_id: uuid.UUID
    entry_type: GoalEntryType
    amount: int
    occurred_on: date
    note: str | None


class GoalResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    icon: str | None
    target_amount: int
    current_amount: int
    target_date: date | None
    linked_account_id: uuid.UUID | None
    monthly_contribution: int | None
    is_paused: bool
    progress_percentage: int
    remaining_amount: int
    estimated_completion_date: date | None
