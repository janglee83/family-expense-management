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


@pytest.mark.integration
async def test_create_goal_and_apply_entries(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    create_goal_response = await client.post(
        f"/api/v1/families/{family_id}/goals/",
        json={
            "name": "Japan Trip",
            "icon": "plane",
            "target_amount": 150000,
            "current_amount": 72000,
            "target_date": date(2026, 12, 31).isoformat(),
            "monthly_contribution": 12000,
        },
    )
    assert create_goal_response.status_code == 201
    goal = create_goal_response.json()
    assert goal["remaining_amount"] == 78000

    contribution_response = await client.post(
        f"/api/v1/families/{family_id}/goals/{goal['id']}/entries",
        json={
            "entry_type": "contribution",
            "amount": 8000,
            "occurred_on": date(2026, 9, 4).isoformat(),
            "note": "Top-up",
        },
    )
    assert contribution_response.status_code == 201

    goal_list_response = await client.get(f"/api/v1/families/{family_id}/goals/")
    assert goal_list_response.status_code == 200
    updated_goal = goal_list_response.json()[0]
    assert updated_goal["current_amount"] == 80000

    withdrawal_response = await client.post(
        f"/api/v1/families/{family_id}/goals/{goal['id']}/entries",
        json={
            "entry_type": "withdrawal",
            "amount": 5000,
            "occurred_on": date(2026, 9, 6).isoformat(),
            "note": "Emergency",
        },
    )
    assert withdrawal_response.status_code == 201

    goal_detail_response = await client.get(f"/api/v1/families/{family_id}/goals/")
    assert goal_detail_response.status_code == 200
    adjusted_goal = goal_detail_response.json()[0]
    assert adjusted_goal["current_amount"] == 75000


@pytest.mark.integration
async def test_goal_withdrawal_rejects_overdraw(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    create_goal_response = await client.post(
        f"/api/v1/families/{family_id}/goals/",
        json={
            "name": "Emergency Fund",
            "target_amount": 100000,
            "current_amount": 10000,
            "target_date": date(2027, 1, 1).isoformat(),
        },
    )
    assert create_goal_response.status_code == 201
    goal_id = create_goal_response.json()["id"]

    withdrawal_response = await client.post(
        f"/api/v1/families/{family_id}/goals/{goal_id}/entries",
        json={
            "entry_type": "withdrawal",
            "amount": 15000,
            "occurred_on": date(2026, 9, 7).isoformat(),
        },
    )

    assert withdrawal_response.status_code == 422
    assert withdrawal_response.json()["error"]["code"] == "GOAL_WITHDRAWAL_EXCEEDS_BALANCE"
