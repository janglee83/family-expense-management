import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.models.family import CurrencyCode, FamilyType
from app.models.family_member import FamilyRole


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    family_type: FamilyType = FamilyType.SHARED
    currency_code: CurrencyCode = CurrencyCode.JPY
    monthly_income_enabled: bool = False
    monthly_income: int | None = Field(default=None, gt=0, le=2_147_483_647)
    savings_goal_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    member_emails: list[EmailStr] = Field(default_factory=list, max_length=20)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @model_validator(mode="after")
    def _validate_family_type_rules(self) -> "CreateFamilyRequest":
        if self.family_type == FamilyType.SOLO and self.member_emails:
            raise ValueError("solo family cannot include additional members")
        if self.family_type == FamilyType.SOLO and self.savings_goal_amount is None:
            raise ValueError("solo family requires savings_goal_amount")
        if self.monthly_income_enabled and self.monthly_income is None:
            raise ValueError("monthly_income is required when monthly_income_enabled is true")
        if not self.monthly_income_enabled and self.monthly_income is not None:
            raise ValueError("monthly_income must be null when monthly_income_enabled is false")
        return self


class RenameFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)


class AddMemberRequest(BaseModel):
    email: EmailStr

    @field_validator("email")
    @classmethod
    def _normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().lower()


class ChangeRoleRequest(BaseModel):
    role: Literal[FamilyRole.ADMIN, FamilyRole.MEMBER]


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: FamilyRole
    family_type: FamilyType
    currency_code: CurrencyCode
    monthly_income_enabled: bool
    monthly_income: int | None
    savings_goal_amount: int | None


class FamilyMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    display_name: str
    role: FamilyRole


class FamilyDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    family_type: FamilyType
    currency_code: CurrencyCode
    monthly_income_enabled: bool
    monthly_income: int | None
    savings_goal_amount: int | None
    members: list[FamilyMemberResponse]
