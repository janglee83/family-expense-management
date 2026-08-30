import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RenameCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID | None
    name: str


class CreateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date


class UpdateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date


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
