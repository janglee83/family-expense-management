import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    icon: str | None = Field(default=None, min_length=1, max_length=32)

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


class RenameCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID | None
    name: str
    icon: str | None


class CreateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0, le=2_147_483_647)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date
    trip_id: uuid.UUID | None = None
    trip_itinerary_item_id: uuid.UUID | None = None


class UpdateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0, le=2_147_483_647)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date
    trip_id: uuid.UUID | None = None
    trip_itinerary_item_id: uuid.UUID | None = None


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    payer_user_id: uuid.UUID
    created_by_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int
    is_shared: bool
    description: str | None
    expense_date: date
    trip_id: uuid.UUID | None
    trip_itinerary_item_id: uuid.UUID | None
