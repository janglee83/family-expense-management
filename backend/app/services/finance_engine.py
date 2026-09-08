from __future__ import annotations

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum
from math import ceil, floor, sqrt
from statistics import fmean
from typing import Literal


class LedgerTransactionType(StrEnum):
    EXPENSE = "expense"
    INCOME = "income"
    TRANSFER = "transfer"
    CREDIT_CARD_PURCHASE = "credit_card_purchase"
    CREDIT_CARD_PAYMENT = "credit_card_payment"
    GOAL_CONTRIBUTION = "goal_contribution"
    GOAL_WITHDRAWAL = "goal_withdrawal"


class SubscriptionBillingCycle(StrEnum):
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


@dataclass(frozen=True)
class LedgerTransaction:
    amount: int
    occurred_on: date
    transaction_type: LedgerTransactionType
    category: str | None = None


@dataclass(frozen=True)
class LedgerImpact:
    income_total: int
    expense_total: int
    transfer_total: int
    credit_card_liability_increase: int
    credit_card_liability_decrease: int
    net_cash_flow: int


@dataclass(frozen=True)
class CashFlowBucket:
    period_key: str
    income_total: int
    expense_total: int
    net_cash_flow: int


@dataclass(frozen=True)
class CashFlowSnapshot:
    current_net_worth: int
    previous_net_worth: int
    change_amount: int
    change_percentage: float | None


@dataclass(frozen=True)
class GoalProgress:
    target_amount: int
    current_amount: int
    remaining_amount: int
    progress_percentage: int
    target_date: date | None
    estimated_completion_date: date | None


@dataclass(frozen=True)
class SubscriptionPlan:
    name: str
    amount: int
    billing_cycle: SubscriptionBillingCycle
    next_billing_date: date


@dataclass(frozen=True)
class SubscriptionTotals:
    monthly_total: int
    yearly_total: int
    upcoming_renewals: list[SubscriptionPlan]


@dataclass(frozen=True)
class SpendingForecast:
    current_spending: int
    average_daily_spending: float
    projected_month_end_spending: int
    remaining_days: int
    budget_amount: int | None
    over_budget_amount: int


@dataclass(frozen=True)
class SpendingAnomaly:
    category: str
    current_amount: int
    baseline_average: float
    percent_above_average: float
    z_score: float | None
    confidence: float


@dataclass(frozen=True)
class DailySpendingLimit:
    variable_budget: int
    remaining_variable_budget: int
    remaining_days: int
    safe_daily_spending: int


def _require_non_negative(name: str, value: int) -> None:
    if value < 0:
        raise ValueError(f"{name} must be >= 0")


def _percent_change(current: int, previous: int) -> float | None:
    if previous == 0:
        if current == 0:
            return 0.0
        return None
    return ((current - previous) / previous) * 100.0


def calculate_ledger_impact(transactions: list[LedgerTransaction]) -> LedgerImpact:
    income_total = 0
    expense_total = 0
    transfer_total = 0
    credit_card_liability_increase = 0
    credit_card_liability_decrease = 0
    net_cash_flow = 0

    for transaction in transactions:
        _require_non_negative("transaction.amount", transaction.amount)

        if transaction.transaction_type == LedgerTransactionType.INCOME:
            income_total += transaction.amount
            net_cash_flow += transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.EXPENSE:
            expense_total += transaction.amount
            net_cash_flow -= transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.TRANSFER:
            transfer_total += transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.CREDIT_CARD_PURCHASE:
            expense_total += transaction.amount
            credit_card_liability_increase += transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.CREDIT_CARD_PAYMENT:
            credit_card_liability_decrease += transaction.amount
            net_cash_flow -= transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.GOAL_CONTRIBUTION:
            transfer_total += transaction.amount
            continue

        if transaction.transaction_type == LedgerTransactionType.GOAL_WITHDRAWAL:
            transfer_total += transaction.amount
            continue

    return LedgerImpact(
        income_total=income_total,
        expense_total=expense_total,
        transfer_total=transfer_total,
        credit_card_liability_increase=credit_card_liability_increase,
        credit_card_liability_decrease=credit_card_liability_decrease,
        net_cash_flow=net_cash_flow,
    )


def _period_key(entry_date: date, period: Literal["daily", "weekly", "monthly"]) -> str:
    if period == "daily":
        return entry_date.isoformat()
    if period == "weekly":
        year, week_number, _ = entry_date.isocalendar()
        return f"{year}-W{week_number:02d}"
    return f"{entry_date.year}-{entry_date.month:02d}"


def build_cash_flow_buckets(
    transactions: list[LedgerTransaction],
    *,
    period: Literal["daily", "weekly", "monthly"],
) -> list[CashFlowBucket]:
    grouped: dict[str, list[LedgerTransaction]] = {}
    for transaction in transactions:
        key = _period_key(transaction.occurred_on, period)
        grouped.setdefault(key, []).append(transaction)

    buckets: list[CashFlowBucket] = []
    for key in sorted(grouped.keys()):
        impact = calculate_ledger_impact(grouped[key])
        buckets.append(
            CashFlowBucket(
                period_key=key,
                income_total=impact.income_total,
                expense_total=impact.expense_total,
                net_cash_flow=impact.net_cash_flow,
            )
        )

    return buckets


def calculate_net_worth(
    *,
    current_assets: list[int],
    current_liabilities: list[int],
    previous_assets: list[int] | None = None,
    previous_liabilities: list[int] | None = None,
) -> CashFlowSnapshot:
    if previous_assets is None:
        previous_assets = []
    if previous_liabilities is None:
        previous_liabilities = []

    for amount in [*current_assets, *current_liabilities, *previous_assets, *previous_liabilities]:
        _require_non_negative("balance", amount)

    current_net_worth = sum(current_assets) - sum(current_liabilities)
    previous_net_worth = sum(previous_assets) - sum(previous_liabilities)
    change_amount = current_net_worth - previous_net_worth

    return CashFlowSnapshot(
        current_net_worth=current_net_worth,
        previous_net_worth=previous_net_worth,
        change_amount=change_amount,
        change_percentage=_percent_change(current_net_worth, previous_net_worth),
    )


def _add_months(anchor: date, months: int) -> date:
    target_month = anchor.month - 1 + months
    year = anchor.year + (target_month // 12)
    month = (target_month % 12) + 1
    month_days = calendar.monthrange(year, month)[1]
    day = min(anchor.day, month_days)
    return date(year, month, day)


def build_goal_progress(
    *,
    target_amount: int,
    current_amount: int,
    target_date: date | None,
    monthly_contribution: int | None,
    as_of: date,
) -> GoalProgress:
    _require_non_negative("target_amount", target_amount)
    _require_non_negative("current_amount", current_amount)

    if target_amount == 0:
        progress_percentage = 100
        remaining_amount = 0
    else:
        remaining_amount = max(target_amount - current_amount, 0)
        progress_ratio = min(max(current_amount / target_amount, 0.0), 1.0)
        progress_percentage = round(progress_ratio * 100)

    estimated_completion_date: date | None = None
    if remaining_amount == 0:
        estimated_completion_date = as_of
    elif monthly_contribution is not None and monthly_contribution > 0:
        months_needed = ceil(remaining_amount / monthly_contribution)
        estimated_completion_date = _add_months(as_of, months_needed)

    return GoalProgress(
        target_amount=target_amount,
        current_amount=current_amount,
        remaining_amount=remaining_amount,
        progress_percentage=progress_percentage,
        target_date=target_date,
        estimated_completion_date=estimated_completion_date,
    )


# A subscription counts as an "upcoming renewal" only within this many days of
# `as_of` — otherwise every active subscription would always show up as
# "upcoming" regardless of how far away its actual renewal date is.
UPCOMING_RENEWAL_WINDOW_DAYS = 30


def build_subscription_totals(
    subscriptions: list[SubscriptionPlan], *, as_of: date
) -> SubscriptionTotals:
    monthly_total = 0
    yearly_total = 0

    for subscription in subscriptions:
        _require_non_negative("subscription.amount", subscription.amount)

        if subscription.billing_cycle == SubscriptionBillingCycle.MONTHLY:
            monthly_total += subscription.amount
            yearly_total += subscription.amount * 12
            continue

        if subscription.billing_cycle == SubscriptionBillingCycle.YEARLY:
            monthly_total += round(subscription.amount / 12)
            yearly_total += subscription.amount
            continue

        monthly_total += round((subscription.amount * 52) / 12)
        yearly_total += subscription.amount * 52

    window_end = as_of + timedelta(days=UPCOMING_RENEWAL_WINDOW_DAYS)
    upcoming_renewals = sorted(
        (item for item in subscriptions if as_of <= item.next_billing_date <= window_end),
        key=lambda item: item.next_billing_date,
    )
    return SubscriptionTotals(
        monthly_total=monthly_total,
        yearly_total=yearly_total,
        upcoming_renewals=upcoming_renewals,
    )


def resolve_equal_split_amounts(total_amount: int, participant_count: int) -> list[int]:
    base_amount = total_amount // participant_count
    remainder = total_amount % participant_count
    return [base_amount + (1 if index < remainder else 0) for index in range(participant_count)]


def resolve_percentage_split_amounts(total_amount: int, percentages: list[int]) -> list[int]:
    raw_amounts = [(total_amount * percentage) / 100 for percentage in percentages]
    floored = [int(amount) for amount in raw_amounts]
    delta = total_amount - sum(floored)
    for index in range(delta):
        floored[index % len(floored)] += 1
    return floored


def forecast_month_end_spending(
    *,
    current_spending: int,
    period_start: date,
    period_end: date,
    as_of: date,
    budget_amount: int | None,
) -> SpendingForecast:
    _require_non_negative("current_spending", current_spending)
    if budget_amount is not None:
        _require_non_negative("budget_amount", budget_amount)

    if period_end < period_start:
        raise ValueError("period_end must be >= period_start")

    clamped_as_of = min(max(as_of, period_start), period_end)
    days_elapsed = (clamped_as_of - period_start).days + 1
    remaining_days = max((period_end - clamped_as_of).days, 0)

    average_daily_spending = current_spending / days_elapsed
    projected_month_end_spending = round(
        current_spending + (average_daily_spending * remaining_days)
    )

    over_budget_amount = 0
    if budget_amount is not None:
        over_budget_amount = max(projected_month_end_spending - budget_amount, 0)

    return SpendingForecast(
        current_spending=current_spending,
        average_daily_spending=average_daily_spending,
        projected_month_end_spending=projected_month_end_spending,
        remaining_days=remaining_days,
        budget_amount=budget_amount,
        over_budget_amount=over_budget_amount,
    )


def _stddev(values: list[int]) -> float:
    if len(values) < 2:
        return 0.0
    avg = fmean(values)
    variance = sum((value - avg) ** 2 for value in values) / len(values)
    return sqrt(variance)


def detect_spending_anomalies(
    *,
    current_totals_by_category: dict[str, int],
    historical_totals_by_month: list[dict[str, int]],
    min_history_months: int = 3,
    z_threshold: float = 2.0,
    min_relative_increase: float = 0.25,
) -> list[SpendingAnomaly]:
    if min_history_months < 1:
        raise ValueError("min_history_months must be >= 1")
    if z_threshold <= 0:
        raise ValueError("z_threshold must be > 0")

    findings: list[SpendingAnomaly] = []

    for category, current_value in current_totals_by_category.items():
        _require_non_negative("current_value", current_value)

        history = [month_data.get(category, 0) for month_data in historical_totals_by_month]
        if len(history) < min_history_months:
            continue

        history_average = fmean(history)
        if history_average <= 0:
            continue

        increase_ratio = (current_value - history_average) / history_average
        if increase_ratio < min_relative_increase:
            continue

        standard_deviation = _stddev(history)
        if standard_deviation == 0:
            z_score: float | None = None
            confidence = min(1.0, 0.55 + (increase_ratio / 2))
        else:
            z_score = (current_value - history_average) / standard_deviation
            if z_score < z_threshold:
                continue
            confidence = min(1.0, 0.5 + ((z_score - z_threshold) / (z_threshold * 2)))

        findings.append(
            SpendingAnomaly(
                category=category,
                current_amount=current_value,
                baseline_average=history_average,
                percent_above_average=increase_ratio * 100,
                z_score=z_score,
                confidence=confidence,
            )
        )

    return sorted(findings, key=lambda item: item.confidence, reverse=True)


def calculate_daily_spending_limit(
    *,
    income_amount: int,
    fixed_expenses_amount: int,
    savings_target_amount: int,
    current_variable_spending: int,
    remaining_days: int,
    upcoming_recurring_expenses: int = 0,
    credit_card_obligations: int = 0,
    variable_budget: int | None = None,
) -> DailySpendingLimit:
    _require_non_negative("income_amount", income_amount)
    _require_non_negative("fixed_expenses_amount", fixed_expenses_amount)
    _require_non_negative("savings_target_amount", savings_target_amount)
    _require_non_negative("current_variable_spending", current_variable_spending)
    _require_non_negative("upcoming_recurring_expenses", upcoming_recurring_expenses)
    _require_non_negative("credit_card_obligations", credit_card_obligations)

    resolved_variable_budget = variable_budget
    if resolved_variable_budget is None:
        resolved_variable_budget = (
            income_amount - fixed_expenses_amount - savings_target_amount
        )
    _require_non_negative("variable_budget", resolved_variable_budget)

    remaining_variable_budget = (
        resolved_variable_budget
        - current_variable_spending
        - upcoming_recurring_expenses
        - credit_card_obligations
    )

    if remaining_days <= 0:
        safe_daily_spending = 0
    else:
        safe_daily_spending = floor(remaining_variable_budget / remaining_days)

    return DailySpendingLimit(
        variable_budget=resolved_variable_budget,
        remaining_variable_budget=remaining_variable_budget,
        remaining_days=max(remaining_days, 0),
        safe_daily_spending=safe_daily_spending,
    )
