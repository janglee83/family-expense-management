import uuid
from collections.abc import AsyncGenerator
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


@pytest.mark.integration
async def test_create_bank_account_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/accounts/",
        json={
            "name": "Main Bank",
            "account_type": "bank",
            "currency_code": "jpy",
            "opening_balance": 120000,
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Main Bank"
    assert body["account_type"] == "bank"
    assert body["current_balance"] == 120000
    assert body["available_credit"] is None


@pytest.mark.integration
async def test_create_credit_card_requires_credit_fields(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/accounts/",
        json={
            "name": "Visa",
            "account_type": "credit_card",
            "currency_code": "jpy",
            "opening_balance": 0,
        },
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_list_accounts_scoped_to_family(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    family_b_id = await _create_family(client, "Family B")

    create_a_response = await client.post(
        f"/api/v1/families/{family_a_id}/accounts/",
        json={"name": "A Bank", "account_type": "bank", "currency_code": "jpy", "opening_balance": 1000},
    )
    assert create_a_response.status_code == 201

    create_b_response = await client.post(
        f"/api/v1/families/{family_b_id}/accounts/",
        json={"name": "B Bank", "account_type": "bank", "currency_code": "jpy", "opening_balance": 2000},
    )
    assert create_b_response.status_code == 201

    list_response = await client.get(f"/api/v1/families/{family_a_id}/accounts/")

    assert list_response.status_code == 200
    accounts = list_response.json()
    assert len(accounts) == 1
    assert accounts[0]["family_id"] == family_a_id
    assert accounts[0]["name"] == "A Bank"


@pytest.mark.integration
async def test_update_account_as_non_creator_member_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    account_response = await client.post(
        f"/api/v1/families/{family_id}/accounts/",
        json={"name": "Owner Bank", "account_type": "bank", "currency_code": "jpy", "opening_balance": 10000},
    )
    assert account_response.status_code == 201
    account_id = account_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        await _register(member_client, member_email)
        add_member_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        assert add_member_response.status_code == 201

        update_response = await member_client.patch(
            f"/api/v1/families/{family_id}/accounts/{account_id}",
            json={"name": "Tamper Name"},
        )

    assert update_response.status_code == 403
