import uuid
from collections.abc import AsyncGenerator
from datetime import date, timedelta
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
async def test_subscription_summary_aggregates_active_items(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    today = date.today()

    create_netflix_response = await client.post(
        f"/api/v1/families/{family_id}/subscriptions/",
        json={
            "name": "Netflix",
            "merchant": "Netflix",
            "amount": 1590,
            "currency_code": "jpy",
            "billing_cycle": "monthly",
            "next_billing_date": (today + timedelta(days=7)).isoformat(),
            "status": "active",
        },
    )
    assert create_netflix_response.status_code == 201

    create_spotify_response = await client.post(
        f"/api/v1/families/{family_id}/subscriptions/",
        json={
            "name": "Spotify",
            "merchant": "Spotify",
            "amount": 980,
            "currency_code": "jpy",
            "billing_cycle": "monthly",
            "next_billing_date": (today + timedelta(days=10)).isoformat(),
            "status": "active",
        },
    )
    assert create_spotify_response.status_code == 201

    create_paused_response = await client.post(
        f"/api/v1/families/{family_id}/subscriptions/",
        json={
            "name": "Game Pass",
            "merchant": "Xbox",
            "amount": 850,
            "currency_code": "jpy",
            "billing_cycle": "monthly",
            "next_billing_date": (today + timedelta(days=14)).isoformat(),
            "status": "paused",
        },
    )
    assert create_paused_response.status_code == 201

    # Renews well outside the 30-day "upcoming" window (see
    # UPCOMING_RENEWAL_WINDOW_DAYS) — active, so it counts toward the totals,
    # but must NOT show up in upcoming_subscription_ids.
    create_far_future_response = await client.post(
        f"/api/v1/families/{family_id}/subscriptions/",
        json={
            "name": "Annual Domain Renewal",
            "merchant": "Registrar",
            "amount": 3000,
            "currency_code": "jpy",
            "billing_cycle": "yearly",
            "next_billing_date": (today + timedelta(days=180)).isoformat(),
            "status": "active",
        },
    )
    assert create_far_future_response.status_code == 201

    summary_response = await client.get(f"/api/v1/families/{family_id}/subscriptions/summary")
    assert summary_response.status_code == 200

    summary = summary_response.json()
    assert summary["monthly_total"] == 2570 + 250  # Netflix + Spotify + Annual Domain Renewal / 12
    assert summary["yearly_total"] == 30840 + 3000
    assert len(summary["upcoming_subscription_ids"]) == 2
