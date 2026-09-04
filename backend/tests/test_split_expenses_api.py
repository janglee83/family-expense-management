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


async def _register(client: AsyncClient, email: str, display_name: str = "Alice") -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": display_name},
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


@pytest.mark.integration
async def test_create_and_settle_equal_split_expense(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        add_member_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        assert add_member_response.status_code == 201

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": owner["id"],
            "category_id": category_id,
            "amount": 8400,
            "is_shared": True,
            "description": "Dinner",
            "expense_date": date(2026, 9, 4).isoformat(),
        },
    )
    assert expense_response.status_code == 201
    expense_id = expense_response.json()["id"]

    split_response = await client.post(
        f"/api/v1/families/{family_id}/split-expenses/",
        json={
            "expense_id": expense_id,
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert split_response.status_code == 201
    split = split_response.json()
    assert split["total_amount"] == 8400
    assert split["outstanding_amount"] == 8400
    assert {item["amount"] for item in split["items"]} == {4200}

    owner_item = next(item for item in split["items"] if item["participant_user_id"] == owner["id"])
    settle_owner_response = await client.patch(
        f"/api/v1/families/{family_id}/split-expenses/{split['id']}/items/{owner_item['id']}/settle",
        json={"is_settled": True},
    )
    assert settle_owner_response.status_code == 200
    after_owner_settle = settle_owner_response.json()
    assert after_owner_settle["settled_amount"] == 4200
    assert after_owner_settle["status"] == "pending"

    member_item = next(item for item in split["items"] if item["participant_user_id"] == member["id"])
    settle_member_response = await client.patch(
        f"/api/v1/families/{family_id}/split-expenses/{split['id']}/items/{member_item['id']}/settle",
        json={"is_settled": True},
    )
    assert settle_member_response.status_code == 200
    after_full_settle = settle_member_response.json()
    assert after_full_settle["status"] == "settled"
    assert after_full_settle["outstanding_amount"] == 0


@pytest.mark.integration
async def test_create_custom_split_rejects_amount_mismatch(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        add_member_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        assert add_member_response.status_code == 201

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": owner["id"],
            "category_id": category_id,
            "amount": 10000,
            "is_shared": True,
            "description": "Trip",
            "expense_date": date(2026, 9, 5).isoformat(),
        },
    )
    assert expense_response.status_code == 201

    split_response = await client.post(
        f"/api/v1/families/{family_id}/split-expenses/",
        json={
            "expense_id": expense_response.json()["id"],
            "method": "custom",
            "participants": [
                {"participant_user_id": owner["id"], "amount": 3000},
                {"participant_user_id": member["id"], "amount": 3000},
            ],
        },
    )

    assert split_response.status_code == 422
    assert split_response.json()["error"]["code"] == "SPLIT_CUSTOM_AMOUNT_MISMATCH"
