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
    family_id: str = response.json()["id"]
    return family_id


async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    return response.json()[0]["id"]  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_fresh_family_sees_only_seeded_global_categories(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.get(f"/api/v1/families/{family_id}/categories/")

    assert response.status_code == 200
    categories = response.json()
    assert len(categories) == 6
    assert all(category["family_id"] is None for category in categories)
    assert {category["name"] for category in categories} == {
        "groceries",
        "dining",
        "transport",
        "utilities",
        "entertainment",
        "other",
    }


@pytest.mark.integration
async def test_member_can_create_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Kids' School Supplies"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Kids' School Supplies"
    assert body["family_id"] == family_id


@pytest.mark.integration
async def test_member_cannot_rename_or_delete_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Custom"}
    )
    category_id = create_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )

        rename_response = await member_client.patch(
            f"/api/v1/families/{family_id}/categories/{category_id}", json={"name": "Hijacked"}
        )
        delete_response = await member_client.delete(
            f"/api/v1/families/{family_id}/categories/{category_id}"
        )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_owner_can_rename_and_delete_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Custom"}
    )
    category_id = create_response.json()["id"]

    rename_response = await client.patch(
        f"/api/v1/families/{family_id}/categories/{category_id}", json={"name": "Renamed"}
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["name"] == "Renamed"

    delete_response = await client.delete(f"/api/v1/families/{family_id}/categories/{category_id}")
    assert delete_response.status_code == 204


@pytest.mark.integration
async def test_owner_cannot_rename_or_delete_a_global_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    list_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    global_category_id = list_response.json()[0]["id"]

    rename_response = await client.patch(
        f"/api/v1/families/{family_id}/categories/{global_category_id}", json={"name": "Hijacked"}
    )
    delete_response = await client.delete(
        f"/api/v1/families/{family_id}/categories/{global_category_id}"
    )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_owner_cannot_mutate_another_familys_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    create_response = await client.post(
        f"/api/v1/families/{family_a_id}/categories/", json={"name": "A's Custom"}
    )
    category_id = create_response.json()["id"]

    family_b_id = await _create_family(client, "Family B")

    rename_response = await client.patch(
        f"/api/v1/families/{family_b_id}/categories/{category_id}", json={"name": "Hijacked"}
    )

    assert rename_response.status_code == 403


@pytest.mark.integration
async def test_cannot_delete_a_category_referenced_by_an_expense(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_category_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "In Use"}
    )
    category_id = create_category_response.json()["id"]

    await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": owner["id"],
            "category_id": category_id,
            "amount": 1000,
            "is_shared": False,
            "description": None,
            "expense_date": date.today().isoformat(),
        },
    )

    response = await client.delete(f"/api/v1/families/{family_id}/categories/{category_id}")

    assert response.status_code == 409
