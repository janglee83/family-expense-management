from __future__ import annotations

import uuid

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.split_expenses import (
    _resolve_split_amounts,
)
from app.models.split_expense import SplitMethod
from app.schemas.goals import CreateGoalRequest
from app.schemas.split_expenses import CreateSplitExpenseRequest, SplitParticipantInput
from app.schemas.subscriptions import CreateSubscriptionRequest


def test_create_goal_request_normalizes_name_and_icon() -> None:
    payload = CreateGoalRequest(
        name="  Trip Fund  ",
        icon="  Plane  ",
        target_amount=100_000,
    )

    assert payload.name == "Trip Fund"
    assert payload.icon == "plane"


def test_create_subscription_request_normalizes_name_and_merchant() -> None:
    payload = CreateSubscriptionRequest(
        name="  Netflix  ",
        merchant="  Netflix Japan  ",
        amount=1590,
        billing_cycle="monthly",
        next_billing_date="2026-09-15",
    )

    assert payload.name == "Netflix"
    assert payload.merchant == "Netflix Japan"


def test_split_request_rejects_duplicate_participants() -> None:
    user_id = uuid.uuid4()
    with pytest.raises(ValidationError, match="participant_user_id must be unique"):
        CreateSplitExpenseRequest(
            expense_id=uuid.uuid4(),
            method=SplitMethod.EQUAL,
            participants=[
                {"participant_user_id": str(user_id)},
                {"participant_user_id": str(user_id)},
            ],
        )


def test_split_request_rejects_invalid_percentage_total() -> None:
    with pytest.raises(ValidationError, match="percentage split must sum to 100"):
        CreateSplitExpenseRequest(
            expense_id=uuid.uuid4(),
            method=SplitMethod.PERCENTAGE,
            participants=[
                {"participant_user_id": str(uuid.uuid4()), "percentage": 60},
                {"participant_user_id": str(uuid.uuid4()), "percentage": 30},
            ],
        )


def test_resolve_split_amounts_rejects_custom_sum_mismatch() -> None:
    payload = CreateSplitExpenseRequest(
        expense_id=uuid.uuid4(),
        method=SplitMethod.CUSTOM,
        participants=[
            SplitParticipantInput(participant_user_id=uuid.uuid4(), amount=2000),
            SplitParticipantInput(participant_user_id=uuid.uuid4(), amount=3000),
        ],
    )

    with pytest.raises(HTTPException) as exc_info:
        _resolve_split_amounts(payload, total_amount=10_000)

    assert exc_info.value.status_code == 422
