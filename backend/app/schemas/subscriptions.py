import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator

from app.models.family import CurrencyCode
from app.models.subscription import SubscriptionBillingCycle, SubscriptionStatus


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class CreateSubscriptionRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    merchant: str = Field(min_length=1, max_length=200)
    amount: int = Field(gt=0, le=2_147_483_647)
    currency_code: CurrencyCode = CurrencyCode.JPY
    billing_cycle: SubscriptionBillingCycle
    next_billing_date: date
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE
    cancellation_url: HttpUrl | None = None

    @field_validator("name", "merchant")
    @classmethod
    def _validate_text_fields(cls, value: str) -> str:
        return _normalize_non_empty_name(value)


class UpdateSubscriptionRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    merchant: str | None = Field(default=None, min_length=1, max_length=200)
    amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    billing_cycle: SubscriptionBillingCycle | None = None
    next_billing_date: date | None = None
    category_id: uuid.UUID | None = None
    account_id: uuid.UUID | None = None
    status: SubscriptionStatus | None = None
    cancellation_url: HttpUrl | None = None

    @field_validator("name", "merchant")
    @classmethod
    def _validate_text_fields(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    merchant: str
    amount: int
    currency_code: CurrencyCode
    billing_cycle: SubscriptionBillingCycle
    next_billing_date: date
    category_id: uuid.UUID | None
    account_id: uuid.UUID | None
    status: SubscriptionStatus
    cancellation_url: str | None


class SubscriptionSummaryResponse(BaseModel):
    monthly_total: int
    yearly_total: int
    upcoming_subscription_ids: list[uuid.UUID]
