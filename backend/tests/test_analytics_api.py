import uuid
from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _unique_email() -> str:
    return f"user-{uuid.uuid4()}@example.com"


async def _register(client: AsyncClient, email: str) -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Alice"},
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


async def _create_family(client: AsyncClient, name: str = "Test Family") -> str:
    response = await client.post("/api/v1/families/", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]  # type: ignore[no-any-return]


async def _create_account(
    client: AsyncClient,
    family_id: str,
    *,
    name: str,
    account_type: str,
    opening_balance: int,
    credit_limit: int | None = None,
    statement_closing_day: int | None = None,
    payment_due_day: int | None = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "name": name,
        "account_type": account_type,
        "currency_code": "jpy",
        "opening_balance": opening_balance,
    }
    if credit_limit is not None:
        payload["credit_limit"] = credit_limit
    if statement_closing_day is not None:
        payload["statement_closing_day"] = statement_closing_day
    if payment_due_day is not None:
        payload["payment_due_day"] = payment_due_day

    response = await client.post(f"/api/v1/families/{family_id}/accounts/", json=payload)
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    assert response.status_code == 200
    return response.json()[0]["id"]  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_analytics_endpoints_return_coherent_read_models(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    bank = await _create_account(
        client,
        family_id,
        name="Main Bank",
        account_type="bank",
        opening_balance=120000,
    )
    card = await _create_account(
        client,
        family_id,
        name="Visa",
        account_type="credit_card",
        opening_balance=12000,
        credit_limit=50000,
        statement_closing_day=20,
        payment_due_day=27,
    )

    income_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "income",
            "amount": 30000,
            "occurred_on": date(2026, 9, 4).isoformat(),
            "destination_account_id": bank["id"],
            "description": "Salary",
        },
    )
    assert income_response.status_code == 201

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "expense",
            "amount": 5000,
            "occurred_on": date(2026, 9, 6).isoformat(),
            "source_account_id": bank["id"],
            "category_id": category_id,
            "description": "Groceries",
        },
    )
    assert expense_response.status_code == 201

    card_purchase_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "credit_card_purchase",
            "amount": 2000,
            "occurred_on": date(2026, 9, 10).isoformat(),
            "source_account_id": card["id"],
            "category_id": category_id,
            "description": "Transport",
        },
    )
    assert card_purchase_response.status_code == 201

    create_subscription = await client.post(
        f"/api/v1/families/{family_id}/subscriptions/",
        json={
            "name": "Netflix",
            "merchant": "Netflix",
            "amount": 1500,
            "currency_code": "jpy",
            "billing_cycle": "monthly",
            "next_billing_date": date(2026, 9, 15).isoformat(),
            "status": "active",
        },
    )
    assert create_subscription.status_code == 201

    net_worth_response = await client.get(
        f"/api/v1/families/{family_id}/analytics/net-worth",
        params={"start_date": "2026-09-01", "end_date": "2026-09-30"},
    )
    assert net_worth_response.status_code == 200
    net_worth = net_worth_response.json()
    assert net_worth["assets_total"] >= 0
    assert net_worth["liabilities_total"] >= 0
    assert net_worth["change_amount"] == 23000

    bucket_response = await client.get(
        f"/api/v1/families/{family_id}/analytics/cash-flow/buckets",
        params={"period": "monthly", "start_date": "2026-09-01", "end_date": "2026-09-30"},
    )
    assert bucket_response.status_code == 200
    buckets = bucket_response.json()["buckets"]
    assert len(buckets) == 1
    assert buckets[0]["income_total"] == 30000
    assert buckets[0]["expense_total"] == 7000

    calendar_response = await client.get(
        f"/api/v1/families/{family_id}/analytics/calendar",
        params={"start_date": "2026-09-04", "end_date": "2026-09-10"},
    )
    assert calendar_response.status_code == 200
    days = calendar_response.json()["days"]
    assert len(days) == 7

    summary_response = await client.get(
        f"/api/v1/families/{family_id}/analytics/cash-flow/summary",
        params={"start_date": "2026-09-01", "end_date": "2026-09-30"},
    )
    assert summary_response.status_code == 200
    summary = summary_response.json()
    assert summary["income_total"] == 30000
    assert summary["expense_total"] == 7000
    assert summary["fixed_expense_estimate"] >= 0
    assert summary["variable_expense_estimate"] >= 0
