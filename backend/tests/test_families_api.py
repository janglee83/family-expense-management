import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.db.session import get_session_factory
from app.main import app
from app.models.family_member import FamilyMember


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
    family_id: str = response.json()["id"]
    return family_id


@pytest.mark.integration
async def test_create_family_creates_owner_membership(client: AsyncClient) -> None:
    await _register(client, _unique_email())

    response = await client.post("/api/v1/families/", json={"name": "My Family"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "My Family"
    assert body["role"] == "owner"


@pytest.mark.integration
async def test_list_my_families_returns_role(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    await _create_family(client, "Family One")

    response = await client.get("/api/v1/families/")

    assert response.status_code == 200
    families = response.json()
    assert len(families) == 1
    assert families[0]["name"] == "Family One"
    assert families[0]["role"] == "owner"


@pytest.mark.integration
async def test_get_family_detail_includes_members(client: AsyncClient) -> None:
    user = await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.get(f"/api/v1/families/{family_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["members"] == [
        {
            "user_id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "role": "owner",
        }
    ]


@pytest.mark.integration
async def test_get_family_detail_rejects_non_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as other_client:
        await _register(other_client, _unique_email())
        response = await other_client.get(f"/api/v1/families/{family_id}")

    assert response.status_code == 403


@pytest.mark.integration
async def test_get_family_detail_404_for_nonexistent_family(client: AsyncClient) -> None:
    await _register(client, _unique_email())

    response = await client.get(f"/api/v1/families/{uuid.uuid4()}")

    assert response.status_code == 404


@pytest.mark.integration
async def test_rename_family_as_owner_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client, "Old Name")

    response = await client.patch(f"/api/v1/families/{family_id}", json={"name": "New Name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


@pytest.mark.integration
async def test_delete_family_as_owner_cascades_membership(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    delete_response = await client.delete(f"/api/v1/families/{family_id}")
    assert delete_response.status_code == 204

    get_response = await client.get(f"/api/v1/families/{family_id}")
    assert get_response.status_code == 404

    session_factory = get_session_factory()
    async with session_factory() as session:
        remaining = await session.scalar(
            select(FamilyMember).where(FamilyMember.family_id == uuid.UUID(family_id))
        )
    assert remaining is None
