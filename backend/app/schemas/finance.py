import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.models.account import AccountType
from app.models.family import CurrencyCode
from app.models.ledger_transaction import LedgerTransactionType

_BOTH_ACCOUNTS_REQUIRED = "source_account_id and destination_account_id are required"
_DIFFERENT_ACCOUNTS_REQUIRED = "source_account_id and destination_account_id must be different"


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


class CreateAccountRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    account_type: AccountType
    currency_code: CurrencyCode = CurrencyCode.JPY
    opening_balance: int = Field(default=0, ge=-2_147_483_648, le=2_147_483_647)
    credit_limit: int | None = Field(default=None, gt=0, le=2_147_483_647)
    statement_closing_day: int | None = Field(default=None, ge=1, le=31)
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    minimum_payment: int | None = Field(default=None, ge=0, le=2_147_483_647)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @model_validator(mode="after")
    def _validate_credit_card_fields(self) -> "CreateAccountRequest":
        if self.account_type == AccountType.CREDIT_CARD:
            if self.credit_limit is None:
                raise ValueError("credit_limit is required for credit card accounts")
            if self.statement_closing_day is None:
                raise ValueError("statement_closing_day is required for credit card accounts")
            if self.payment_due_day is None:
                raise ValueError("payment_due_day is required for credit card accounts")
            if self.opening_balance < 0:
                raise ValueError("opening_balance must be >= 0 for credit card accounts")
            return self

        if self.credit_limit is not None:
            raise ValueError("credit_limit is allowed only for credit card accounts")
        if self.statement_closing_day is not None:
            raise ValueError("statement_closing_day is allowed only for credit card accounts")
        if self.payment_due_day is not None:
            raise ValueError("payment_due_day is allowed only for credit card accounts")
        if self.minimum_payment is not None:
            raise ValueError("minimum_payment is allowed only for credit card accounts")

        return self


class UpdateAccountRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None
    credit_limit: int | None = Field(default=None, gt=0, le=2_147_483_647)
    statement_closing_day: int | None = Field(default=None, ge=1, le=31)
    payment_due_day: int | None = Field(default=None, ge=1, le=31)
    minimum_payment: int | None = Field(default=None, ge=0, le=2_147_483_647)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)


class AccountResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    account_type: AccountType
    currency_code: CurrencyCode
    current_balance: int
    is_active: bool
    credit_limit: int | None
    statement_closing_day: int | None
    payment_due_day: int | None
    minimum_payment: int | None
    statement_balance: int
    available_credit: int | None


class CreateLedgerTransactionRequest(BaseModel):
    transaction_type: LedgerTransactionType
    amount: int = Field(gt=0, le=2_147_483_647)
    occurred_on: date
    description: str | None = Field(default=None, max_length=500)
    category_id: uuid.UUID | None = None
    source_account_id: uuid.UUID | None = None
    destination_account_id: uuid.UUID | None = None

    @field_validator("description")
    @classmethod
    def _normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        return normalized or None

    @model_validator(mode="after")
    def _validate_transaction_shape(self) -> "CreateLedgerTransactionRequest":
        transaction_type = self.transaction_type

        if transaction_type == LedgerTransactionType.INCOME:
            self._ensure_destination_for_income()
            return self

        if transaction_type in {
            LedgerTransactionType.EXPENSE,
            LedgerTransactionType.CREDIT_CARD_PURCHASE,
        }:
            self._ensure_source_and_category_for_spending()
            return self

        if transaction_type in {
            LedgerTransactionType.TRANSFER,
            LedgerTransactionType.CREDIT_CARD_PAYMENT,
            LedgerTransactionType.GOAL_CONTRIBUTION,
            LedgerTransactionType.GOAL_WITHDRAWAL,
        }:
            self._ensure_both_accounts()
            self._ensure_distinct_accounts()
            return self

        return self

    def _ensure_destination_for_income(self) -> None:
        if self.destination_account_id is None:
            raise ValueError("destination_account_id is required for income")

    def _ensure_source_and_category_for_spending(self) -> None:
        if self.source_account_id is None:
            raise ValueError("source_account_id is required for spending")
        if self.category_id is None:
            raise ValueError("category_id is required for spending")

    def _ensure_both_accounts(self) -> None:
        if self.source_account_id is None or self.destination_account_id is None:
            raise ValueError(_BOTH_ACCOUNTS_REQUIRED)

    def _ensure_distinct_accounts(self) -> None:
        if self.source_account_id == self.destination_account_id:
            raise ValueError(_DIFFERENT_ACCOUNTS_REQUIRED)


class LedgerTransactionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    transaction_type: LedgerTransactionType
    amount: int
    occurred_on: date
    description: str | None
    category_id: uuid.UUID | None
    source_account_id: uuid.UUID | None
    destination_account_id: uuid.UUID | None
