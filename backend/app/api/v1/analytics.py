from __future__ import annotations

import uuid
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_family_membership
from app.core.api_errors import raise_api_error
from app.db.session import get_session
from app.models.account import Account, AccountType
from app.models.family_member import FamilyMember
from app.models.ledger_transaction import LedgerTransaction
from app.models.subscription import Subscription, SubscriptionStatus
from app.schemas.analytics import (
    AnalyticsWindowParams,
    CalendarAggregatesResponse,
    CalendarDayAggregate,
    CashFlowBucketResponse,
    CashFlowBucketsResponse,
    CashFlowPeriod,
    CashFlowSummaryResponse,
    NetWorthResponse,
)
from app.services.finance_engine import (
    LedgerTransaction as ServiceLedgerTransaction,
    LedgerTransactionType as ServiceLedgerTransactionType,
    SubscriptionBillingCycle as ServiceBillingCycle,
    SubscriptionPlan,
    build_cash_flow_buckets,
    build_subscription_totals,
    calculate_ledger_impact,
    calculate_net_worth,
)

router = APIRouter()


def _default_month_window(today: date) -> tuple[date, date]:
    return today.replace(day=1), today


def _resolve_window(start_date: date | None, end_date: date | None) -> tuple[date, date]:
    today = date.today()
    if start_date is None and end_date is None:
        return _default_month_window(today)

    resolved_end = end_date or today
    resolved_start = start_date or resolved_end.replace(day=1)

    try:
        window = AnalyticsWindowParams(start_date=resolved_start, end_date=resolved_end)
    except ValidationError:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="ANALYTICS_INVALID_DATE_RANGE",
            message="end_date must be greater than or equal to start_date",
        )

    return window.start_date, window.end_date


def _to_service_transaction(row: LedgerTransaction) -> ServiceLedgerTransaction:
    return ServiceLedgerTransaction(
        amount=row.amount,
        occurred_on=row.occurred_on,
        transaction_type=ServiceLedgerTransactionType(row.transaction_type.value),
    )


def _is_liability_account(account: Account) -> bool:
    return account.account_type in {AccountType.CREDIT_CARD, AccountType.LOAN}


async def _load_window_transactions(
    family_id: uuid.UUID,
    start_date: date,
    end_date: date,
    session: AsyncSession,
) -> list[LedgerTransaction]:
    result = await session.scalars(
        select(LedgerTransaction)
        .where(
            LedgerTransaction.family_id == family_id,
            LedgerTransaction.occurred_on >= start_date,
            LedgerTransaction.occurred_on <= end_date,
        )
        .order_by(LedgerTransaction.occurred_on, LedgerTransaction.created_at)
    )
    return list(result.all())


@router.get("/net-worth")
async def get_net_worth(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> NetWorthResponse:
    period_start, period_end = _resolve_window(start_date, end_date)

    account_rows = await session.scalars(
        select(Account).where(Account.family_id == family_id, Account.is_active.is_(True))
    )
    accounts = list(account_rows.all())

    assets_total = sum(item.current_balance for item in accounts if not _is_liability_account(item))
    liabilities_total = sum(item.current_balance for item in accounts if _is_liability_account(item))

    transaction_rows = await _load_window_transactions(family_id, period_start, period_end, session)
    impact = calculate_ledger_impact([_to_service_transaction(item) for item in transaction_rows])

    current_net_worth = assets_total - liabilities_total
    period_change_amount = impact.income_total - impact.expense_total
    previous_net_worth = current_net_worth - period_change_amount

    snapshot = calculate_net_worth(
        current_assets=[assets_total],
        current_liabilities=[liabilities_total],
        previous_assets=[max(previous_net_worth, 0)],
        previous_liabilities=[max(-previous_net_worth, 0)],
    )

    return NetWorthResponse(
        as_of=date.today(),
        current_net_worth=snapshot.current_net_worth,
        previous_net_worth=snapshot.previous_net_worth,
        change_amount=snapshot.change_amount,
        change_percentage=snapshot.change_percentage,
        assets_total=assets_total,
        liabilities_total=liabilities_total,
        period_start=period_start,
        period_end=period_end,
    )


@router.get("/cash-flow/buckets")
async def get_cash_flow_buckets(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
    period: Annotated[CashFlowPeriod, Query()] = CashFlowPeriod.MONTHLY,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> CashFlowBucketsResponse:
    resolved_start, resolved_end = _resolve_window(start_date, end_date)
    rows = await _load_window_transactions(family_id, resolved_start, resolved_end, session)

    buckets = build_cash_flow_buckets(
        [_to_service_transaction(item) for item in rows],
        period=period.value,
    )

    return CashFlowBucketsResponse(
        period=period,
        start_date=resolved_start,
        end_date=resolved_end,
        buckets=[
            CashFlowBucketResponse(
                period_key=item.period_key,
                income_total=item.income_total,
                expense_total=item.expense_total,
                net_cash_flow=item.net_cash_flow,
            )
            for item in buckets
        ],
    )


@router.get("/calendar")
async def get_calendar_aggregates(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> CalendarAggregatesResponse:
    resolved_start, resolved_end = _resolve_window(start_date, end_date)
    rows = await _load_window_transactions(family_id, resolved_start, resolved_end, session)

    daily_buckets = build_cash_flow_buckets(
        [_to_service_transaction(item) for item in rows],
        period=CashFlowPeriod.DAILY.value,
    )
    bucket_by_day = {item.period_key: item for item in daily_buckets}

    days: list[CalendarDayAggregate] = []
    cursor = resolved_start
    while cursor <= resolved_end:
        key = cursor.isoformat()
        bucket = bucket_by_day.get(key)
        if bucket is None:
            days.append(
                CalendarDayAggregate(
                    day=cursor,
                    income_total=0,
                    expense_total=0,
                    net_cash_flow=0,
                )
            )
        else:
            days.append(
                CalendarDayAggregate(
                    day=cursor,
                    income_total=bucket.income_total,
                    expense_total=bucket.expense_total,
                    net_cash_flow=bucket.net_cash_flow,
                )
            )
        cursor += timedelta(days=1)

    return CalendarAggregatesResponse(start_date=resolved_start, end_date=resolved_end, days=days)


@router.get("/cash-flow/summary")
async def get_cash_flow_summary(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> CashFlowSummaryResponse:
    resolved_start, resolved_end = _resolve_window(start_date, end_date)

    transaction_rows = await _load_window_transactions(family_id, resolved_start, resolved_end, session)
    impact = calculate_ledger_impact([_to_service_transaction(item) for item in transaction_rows])

    active_subscriptions = await session.scalars(
        select(Subscription).where(
            Subscription.family_id == family_id,
            Subscription.status == SubscriptionStatus.ACTIVE,
        )
    )
    subscription_totals = build_subscription_totals(
        [
            SubscriptionPlan(
                name=item.name,
                amount=item.amount,
                billing_cycle=ServiceBillingCycle(item.billing_cycle.value),
                next_billing_date=item.next_billing_date,
            )
            for item in active_subscriptions.all()
        ]
    )

    window_days = (resolved_end - resolved_start).days + 1
    fixed_expense_estimate = round((subscription_totals.monthly_total / 30) * window_days)
    variable_expense_estimate = max(impact.expense_total - fixed_expense_estimate, 0)

    return CashFlowSummaryResponse(
        period_start=resolved_start,
        period_end=resolved_end,
        income_total=impact.income_total,
        expense_total=impact.expense_total,
        fixed_expense_estimate=fixed_expense_estimate,
        variable_expense_estimate=variable_expense_estimate,
        net_cash_flow=impact.net_cash_flow,
    )
