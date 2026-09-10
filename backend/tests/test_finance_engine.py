from __future__ import annotations

from datetime import date

import pytest

from app.services.finance_engine import (
    DebtSettlement,
    LedgerTransaction,
    LedgerTransactionType,
    SubscriptionBillingCycle,
    SubscriptionPlan,
    build_cash_flow_buckets,
    build_goal_progress,
    build_subscription_totals,
    calculate_daily_spending_limit,
    calculate_ledger_impact,
    calculate_net_worth,
    compute_debt_settlements,
    detect_spending_anomalies,
    forecast_month_end_spending,
    resolve_equal_split_amounts,
    resolve_percentage_split_amounts,
)


def test_calculate_ledger_impact_keeps_credit_card_payment_out_of_expense() -> None:
    impact = calculate_ledger_impact(
        [
            LedgerTransaction(
                amount=5_000,
                occurred_on=date(2026, 9, 4),
                transaction_type=LedgerTransactionType.CREDIT_CARD_PURCHASE,
            ),
            LedgerTransaction(
                amount=5_000,
                occurred_on=date(2026, 9, 27),
                transaction_type=LedgerTransactionType.CREDIT_CARD_PAYMENT,
            ),
        ]
    )

    assert impact.expense_total == 5_000
    assert impact.credit_card_liability_increase == 5_000
    assert impact.credit_card_liability_decrease == 5_000
    assert impact.net_cash_flow == -5_000


def test_calculate_ledger_impact_keeps_transfers_out_of_expenses() -> None:
    impact = calculate_ledger_impact(
        [
            LedgerTransaction(
                amount=20_000,
                occurred_on=date(2026, 9, 4),
                transaction_type=LedgerTransactionType.TRANSFER,
            )
        ]
    )

    assert impact.expense_total == 0
    assert impact.transfer_total == 20_000
    assert impact.net_cash_flow == 0


def test_build_cash_flow_buckets_groups_by_month() -> None:
    buckets = build_cash_flow_buckets(
        [
            LedgerTransaction(10_000, date(2026, 9, 2), LedgerTransactionType.INCOME),
            LedgerTransaction(2_500, date(2026, 9, 3), LedgerTransactionType.EXPENSE),
            LedgerTransaction(5_000, date(2026, 10, 1), LedgerTransactionType.EXPENSE),
        ],
        period="monthly",
    )

    assert len(buckets) == 2
    assert buckets[0].period_key == "2026-09"
    assert buckets[0].net_cash_flow == 7_500
    assert buckets[1].period_key == "2026-10"
    assert buckets[1].net_cash_flow == -5_000


def test_calculate_net_worth_computes_change() -> None:
    snapshot = calculate_net_worth(
        current_assets=[120_000, 30_000],
        current_liabilities=[20_000],
        previous_assets=[90_000],
        previous_liabilities=[10_000],
    )

    assert snapshot.current_net_worth == 130_000
    assert snapshot.previous_net_worth == 80_000
    assert snapshot.change_amount == 50_000
    assert round(snapshot.change_percentage or 0, 2) == 62.5


def test_calculate_net_worth_with_zero_previous_returns_none_percentage() -> None:
    snapshot = calculate_net_worth(
        current_assets=[10_000],
        current_liabilities=[],
        previous_assets=[],
        previous_liabilities=[],
    )

    assert snapshot.change_percentage is None


def test_build_goal_progress_estimates_completion_with_leap_year_boundary() -> None:
    progress = build_goal_progress(
        target_amount=150_000,
        current_amount=72_000,
        target_date=date(2026, 12, 31),
        monthly_contribution=26_000,
        as_of=date(2028, 1, 31),
    )

    assert progress.remaining_amount == 78_000
    assert progress.progress_percentage == 48
    assert progress.estimated_completion_date == date(2028, 4, 30)


def test_build_goal_progress_marks_complete_when_current_reaches_target() -> None:
    progress = build_goal_progress(
        target_amount=100_000,
        current_amount=120_000,
        target_date=None,
        monthly_contribution=5_000,
        as_of=date(2026, 9, 4),
    )

    assert progress.remaining_amount == 0
    assert progress.progress_percentage == 100
    assert progress.estimated_completion_date == date(2026, 9, 4)


def test_build_subscription_totals_and_upcoming_renewals() -> None:
    # Cloud Backup renews 54 days out — well past UPCOMING_RENEWAL_WINDOW_DAYS
    # (30) — so it must count toward the totals but not appear as "upcoming".
    totals = build_subscription_totals(
        [
            SubscriptionPlan("Netflix", 1_590, SubscriptionBillingCycle.MONTHLY, date(2026, 9, 15)),
            SubscriptionPlan("Spotify", 980, SubscriptionBillingCycle.MONTHLY, date(2026, 9, 18)),
            SubscriptionPlan("Cloud Backup", 12_000, SubscriptionBillingCycle.YEARLY, date(2026, 11, 1)),
        ],
        as_of=date(2026, 9, 8),
    )

    assert totals.monthly_total == 3_570
    assert totals.yearly_total == 42_840
    assert [item.name for item in totals.upcoming_renewals] == ["Netflix", "Spotify"]


def test_forecast_month_end_spending_matches_deterministic_formula() -> None:
    forecast = forecast_month_end_spending(
        current_spending=182_450,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        as_of=date(2026, 9, 24),
        budget_amount=220_000,
    )

    assert forecast.remaining_days == 6
    assert round(forecast.average_daily_spending, 2) == 7602.08
    assert forecast.projected_month_end_spending == 228_062
    assert forecast.over_budget_amount == 8_062


def test_forecast_clamps_as_of_after_period_end() -> None:
    forecast = forecast_month_end_spending(
        current_spending=30_000,
        period_start=date(2026, 9, 1),
        period_end=date(2026, 9, 30),
        as_of=date(2026, 10, 5),
        budget_amount=None,
    )

    assert forecast.remaining_days == 0
    assert forecast.projected_month_end_spending == 30_000


def test_detect_spending_anomalies_flags_significant_spike() -> None:
    findings = detect_spending_anomalies(
        current_totals_by_category={"food": 78_400},
        historical_totals_by_month=[
            {"food": 41_000},
            {"food": 46_000},
            {"food": 50_000},
            {"food": 44_000},
        ],
    )

    assert len(findings) == 1
    assert findings[0].category == "food"
    assert findings[0].percent_above_average > 50


def test_detect_spending_anomalies_ignores_minor_changes() -> None:
    findings = detect_spending_anomalies(
        current_totals_by_category={"transport": 18_000},
        historical_totals_by_month=[
            {"transport": 17_000},
            {"transport": 18_100},
            {"transport": 17_500},
            {"transport": 17_800},
        ],
    )

    assert findings == []


def test_calculate_daily_spending_limit_matches_product_example() -> None:
    limit = calculate_daily_spending_limit(
        income_amount=300_000,
        fixed_expenses_amount=120_000,
        savings_target_amount=50_000,
        variable_budget=130_000,
        current_variable_spending=68_000,
        upcoming_recurring_expenses=0,
        credit_card_obligations=0,
        remaining_days=18,
    )

    assert limit.remaining_variable_budget == 62_000
    assert limit.safe_daily_spending == 3_444


def test_calculate_daily_spending_limit_handles_no_income_month() -> None:
    limit = calculate_daily_spending_limit(
        income_amount=0,
        fixed_expenses_amount=0,
        savings_target_amount=0,
        variable_budget=0,
        current_variable_spending=0,
        upcoming_recurring_expenses=0,
        credit_card_obligations=0,
        remaining_days=20,
    )

    assert limit.variable_budget == 0
    assert limit.safe_daily_spending == 0


def test_calculate_daily_spending_limit_raises_for_negative_input() -> None:
    with pytest.raises(ValueError):
        calculate_daily_spending_limit(
            income_amount=-1,
            fixed_expenses_amount=0,
            savings_target_amount=0,
            current_variable_spending=0,
            remaining_days=10,
        )


def test_resolve_equal_split_amounts_distributes_remainder_to_first_participants() -> None:
    amounts = resolve_equal_split_amounts(total_amount=100, participant_count=3)
    assert amounts == [34, 33, 33]
    assert sum(amounts) == 100


def test_resolve_percentage_split_amounts_sums_exactly_to_total() -> None:
    amounts = resolve_percentage_split_amounts(total_amount=999, percentages=[50, 30, 20])
    assert sum(amounts) == 999
    assert amounts[0] >= amounts[1] >= amounts[2]


def test_compute_debt_settlements_single_payment_covers_the_shortfall() -> None:
    # A paid 100, B paid 20, C paid 60; equal fair share is 60 each.
    # Net balance: A +40, B -40, C 0. One transaction settles it.
    settlements = compute_debt_settlements({"A": 40, "B": -40, "C": 0})

    assert settlements == [DebtSettlement(from_id="B", to_id="A", amount=40)]


def test_compute_debt_settlements_matches_largest_creditor_and_debtor_first() -> None:
    # Creditors: A +50, B +30. Debtors: C -70, D -10.
    # Greedy: C pays A 50 (A cleared), C pays B 20 (C cleared, B has 10 left),
    # D pays B 10 (both cleared).
    settlements = compute_debt_settlements({"A": 50, "B": 30, "C": -70, "D": -10})

    assert settlements == [
        DebtSettlement(from_id="C", to_id="A", amount=50),
        DebtSettlement(from_id="C", to_id="B", amount=20),
        DebtSettlement(from_id="D", to_id="B", amount=10),
    ]


def test_compute_debt_settlements_returns_empty_when_everyone_is_already_even() -> None:
    settlements = compute_debt_settlements({"A": 0, "B": 0, "C": 0})

    assert settlements == []


def test_compute_debt_settlements_single_payer_owes_nothing_to_themselves() -> None:
    # A paid everything (300), fair share is 100 each among A, B, C.
    settlements = compute_debt_settlements({"A": 200, "B": -100, "C": -100})

    assert sorted(settlements, key=lambda item: item.from_id) == [
        DebtSettlement(from_id="B", to_id="A", amount=100),
        DebtSettlement(from_id="C", to_id="A", amount=100),
    ]


def test_compute_debt_settlements_ignores_ids_with_zero_balance() -> None:
    settlements = compute_debt_settlements({"A": 10, "B": -10, "C": 0})

    assert all(item.from_id != "C" and item.to_id != "C" for item in settlements)
