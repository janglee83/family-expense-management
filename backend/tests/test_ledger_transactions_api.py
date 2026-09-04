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


async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    assert response.status_code == 200
    return response.json()[0]["id"]  # type: ignore[no-any-return]


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


@pytest.mark.integration
async def test_credit_card_purchase_then_payment_updates_balances_correctly(
    client: AsyncClient,
) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    bank = await _create_account(
        client,
        family_id,
        name="Main Bank",
        account_type="bank",
        opening_balance=10000,
    )
    card = await _create_account(
        client,
        family_id,
        name="Visa",
        account_type="credit_card",
        opening_balance=0,
        credit_limit=50000,
        statement_closing_day=20,
        payment_due_day=27,
    )

    purchase_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "credit_card_purchase",
            "amount": 5000,
            "occurred_on": date(2026, 9, 4).isoformat(),
            "category_id": category_id,
            "source_account_id": card["id"],
            "description": "Card purchase",
        },
    )
    assert purchase_response.status_code == 201

    bank_after_purchase = await client.get(f"/api/v1/families/{family_id}/accounts/{bank['id']}")
    card_after_purchase = await client.get(f"/api/v1/families/{family_id}/accounts/{card['id']}")
    assert bank_after_purchase.status_code == 200
    assert card_after_purchase.status_code == 200
    assert bank_after_purchase.json()["current_balance"] == 10000
    assert card_after_purchase.json()["current_balance"] == 5000
    assert card_after_purchase.json()["statement_balance"] == 5000

    payment_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "credit_card_payment",
            "amount": 5000,
            "occurred_on": date(2026, 9, 27).isoformat(),
            "source_account_id": bank["id"],
            "destination_account_id": card["id"],
            "description": "Card payment",
        },
    )
    assert payment_response.status_code == 201

    bank_after_payment = await client.get(f"/api/v1/families/{family_id}/accounts/{bank['id']}")
    card_after_payment = await client.get(f"/api/v1/families/{family_id}/accounts/{card['id']}")
    assert bank_after_payment.status_code == 200
    assert card_after_payment.status_code == 200
    assert bank_after_payment.json()["current_balance"] == 5000
    assert card_after_payment.json()["current_balance"] == 0
    assert card_after_payment.json()["statement_balance"] == 0

    ledger_response = await client.get(f"/api/v1/families/{family_id}/ledger-transactions/")
    assert ledger_response.status_code == 200
    rows = ledger_response.json()
    assert len(rows) == 2
    assert rows[0]["transaction_type"] == "credit_card_payment"
    assert rows[1]["transaction_type"] == "credit_card_purchase"


@pytest.mark.integration
async def test_credit_card_payment_rejects_overpayment(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    bank = await _create_account(
        client,
        family_id,
        name="Main Bank",
        account_type="bank",
        opening_balance=12000,
    )
    card = await _create_account(
        client,
        family_id,
        name="Visa",
        account_type="credit_card",
        opening_balance=2000,
        credit_limit=50000,
        statement_closing_day=20,
        payment_due_day=27,
    )

    response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "credit_card_payment",
            "amount": 5000,
            "occurred_on": date(2026, 9, 27).isoformat(),
            "source_account_id": bank["id"],
            "destination_account_id": card["id"],
        },
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "LEDGER_CREDIT_CARD_OVERPAYMENT"


@pytest.mark.integration
async def test_transfer_moves_balances_without_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    bank = await _create_account(
        client,
        family_id,
        name="Main Bank",
        account_type="bank",
        opening_balance=10000,
    )
    cash = await _create_account(
        client,
        family_id,
        name="Wallet",
        account_type="cash",
        opening_balance=1000,
    )

    transfer_response = await client.post(
        f"/api/v1/families/{family_id}/ledger-transactions/",
        json={
            "transaction_type": "transfer",
            "amount": 3000,
            "occurred_on": date(2026, 9, 6).isoformat(),
            "source_account_id": bank["id"],
            "destination_account_id": cash["id"],
        },
    )
    assert transfer_response.status_code == 201

    bank_after_transfer = await client.get(f"/api/v1/families/{family_id}/accounts/{bank['id']}")
    cash_after_transfer = await client.get(f"/api/v1/families/{family_id}/accounts/{cash['id']}")
    assert bank_after_transfer.status_code == 200
    assert cash_after_transfer.status_code == 200
    assert bank_after_transfer.json()["current_balance"] == 7000
    assert cash_after_transfer.json()["current_balance"] == 4000
