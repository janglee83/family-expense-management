import uuid
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.db.session import get_session_factory
from app.main import app
from app.models.notification import Notification


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
    response = await client.post(
        "/api/v1/families/",
        json={"name": name, "family_type": "shared", "member_emails": []},
    )
    assert response.status_code == 201
    return response.json()["id"]  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_member_receives_notification_when_added(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)

        add_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        assert add_response.status_code == 201

        list_response = await member_client.get("/api/v1/notifications/")
        assert list_response.status_code == 200
        notifications = list_response.json()
        assert len(notifications) >= 1
        assert "added you" in notifications[0]["message"]


@pytest.mark.integration
async def test_mark_notification_read_and_read_all(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})

        list_response = await member_client.get("/api/v1/notifications/")
        notifications = list_response.json()
        notification_id = notifications[0]["id"]

        mark_response = await member_client.patch(f"/api/v1/notifications/{notification_id}/read")
        assert mark_response.status_code == 200
        assert mark_response.json()["read_at"] is not None

        mark_all_response = await member_client.post("/api/v1/notifications/read-all")
        assert mark_all_response.status_code == 204


@pytest.mark.integration
async def test_notifications_older_than_one_month_are_auto_deleted(client: AsyncClient) -> None:
    user = await _register(client, _unique_email())
    session_factory = get_session_factory()

    async with session_factory() as session:
        session.add(
            Notification(
                user_id=uuid.UUID(user["id"]),
                message="Old notification",
                created_at=datetime.now(UTC) - timedelta(days=40),
            )
        )
        await session.commit()

    list_response = await client.get("/api/v1/notifications/?limit=100")
    assert list_response.status_code == 200
    notifications = list_response.json()
    assert notifications == []


@pytest.mark.integration
async def test_unread_only_filter_excludes_read_notifications(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})

        list_response = await member_client.get("/api/v1/notifications/?limit=100")
        assert list_response.status_code == 200
        notification_id = list_response.json()[0]["id"]

        mark_response = await member_client.patch(f"/api/v1/notifications/{notification_id}/read")
        assert mark_response.status_code == 200

        unread_response = await member_client.get(
            "/api/v1/notifications/?limit=100&unread_only=true"
        )
        assert unread_response.status_code == 200
        unread_ids = {item["id"] for item in unread_response.json()}
        assert notification_id not in unread_ids


@pytest.mark.integration
async def test_mark_notification_read_returns_not_found_for_unknown_id(
    client: AsyncClient,
) -> None:
    await _register(client, _unique_email())

    response = await client.patch(f"/api/v1/notifications/{uuid.uuid4()}/read")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "NOTIFICATION_NOT_FOUND"
