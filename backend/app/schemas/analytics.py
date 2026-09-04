from __future__ import annotations

from datetime import date
from enum import StrEnum

from pydantic import BaseModel, Field, model_validator


class CashFlowPeriod(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class AnalyticsWindowParams(BaseModel):
    start_date: date
    end_date: date

    @model_validator(mode="after")
    def _validate_range(self) -> "AnalyticsWindowParams":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be >= start_date")
        return self


class NetWorthResponse(BaseModel):
    as_of: date
    current_net_worth: int
    previous_net_worth: int
    change_amount: int
    change_percentage: float | None
    assets_total: int
    liabilities_total: int
    period_start: date
    period_end: date


class CashFlowBucketResponse(BaseModel):
    period_key: str
    income_total: int
    expense_total: int
    net_cash_flow: int


class CashFlowBucketsResponse(BaseModel):
    period: CashFlowPeriod
    start_date: date
    end_date: date
    buckets: list[CashFlowBucketResponse]


class CalendarDayAggregate(BaseModel):
    day: date
    income_total: int
    expense_total: int
    net_cash_flow: int


class CalendarAggregatesResponse(BaseModel):
    start_date: date
    end_date: date
    days: list[CalendarDayAggregate]


class CashFlowSummaryResponse(BaseModel):
    period_start: date
    period_end: date
    income_total: int
    expense_total: int
    fixed_expense_estimate: int = Field(ge=0)
    variable_expense_estimate: int = Field(ge=0)
    net_cash_flow: int
