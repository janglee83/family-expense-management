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


@pytest.mark.integration
async def test_create_trip_and_compute_status(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Đà Lạt Trip",
            "destination": "Đà Lạt",
            "start_date": date(2020, 1, 1).isoformat(),
            "end_date": date(2020, 1, 5).isoformat(),
            "budget_amount": 5000000,
        },
    )
    assert create_response.status_code == 201
    trip = create_response.json()
    assert trip["status"] == "completed"
    assert trip["planned_total"] == 0
    assert trip["actual_total"] == 0
    assert trip["participant_user_ids"] == []

    list_response = await client.get(f"/api/v1/families/{family_id}/trips/")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


@pytest.mark.integration
async def test_create_trip_rejects_invalid_date_range(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Bad Trip",
            "start_date": date(2026, 3, 12).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_update_trip_requires_creator_or_owner_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email(), "Alice")
    family_id = await _create_family(client)

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Original",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 3).isoformat(),
        },
    )
    trip_id = create_response.json()["id"]

    # A second user who is NOT a family member gets 404/membership-denied, not 403 —
    # covered implicitly by get_family_membership; here we instead invite a real member
    # with the 'member' role and confirm THEY cannot edit someone else's trip.
    bob_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await _register(bob_client, _unique_email(), "Bob")
    bob_me = await bob_client.get("/api/v1/auth/me")

    invite_response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": bob_me.json()["email"]}
    )
    assert invite_response.status_code == 201

    update_response = await bob_client.patch(
        f"/api/v1/families/{family_id}/trips/{trip_id}",
        json={"name": "Hijacked"},
    )
    assert update_response.status_code == 403
    await bob_client.aclose()


@pytest.mark.integration
async def test_delete_trip_unlinks_but_does_not_delete_expenses(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]

    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 1000,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_id,
        },
    )
    assert expense_response.status_code == 201
    expense_id = expense_response.json()["id"]

    delete_response = await client.delete(f"/api/v1/families/{family_id}/trips/{trip_id}")
    assert delete_response.status_code == 204

    get_expense_response = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert get_expense_response.status_code == 200
    assert get_expense_response.json()["trip_id"] is None


@pytest.mark.integration
async def test_add_and_remove_trip_participant(client: AsyncClient) -> None:
    await _register(client, _unique_email(), "Alice")
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]
    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]

    add_response = await client.post(f"/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}")
    assert add_response.status_code == 201
    assert user_id in add_response.json()["participant_user_ids"]

    remove_response = await client.delete(
        f"/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}"
    )
    assert remove_response.status_code == 200
    assert user_id not in remove_response.json()["participant_user_ids"]


@pytest.mark.integration
async def test_create_and_update_itinerary_item(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 3, 1).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={
            "title": "Nhận phòng khách sạn",
            "item_date": date(2026, 3, 2).isoformat(),
            "item_time": "14:00:00",
            "planned_amount": 2500000,
        },
    )
    assert create_response.status_code == 201
    item = create_response.json()
    assert item["actual_amount"] == 0
    assert item["linked_expense_ids"] == []

    update_response = await client.patch(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items/{item['id']}",
        json={"planned_amount": 3000000},
    )
    assert update_response.status_code == 200
    assert update_response.json()["planned_amount"] == 3000000

    trip_after = await client.get(f"/api/v1/families/{family_id}/trips/{trip_id}")
    assert trip_after.json()["planned_total"] == 3000000


@pytest.mark.integration
async def test_create_itinerary_item_rejects_date_outside_trip_range(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 3, 1).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Too early", "item_date": date(2026, 2, 28).isoformat()},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_delete_itinerary_item_unlinks_but_does_not_delete_expense(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    item_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Item", "item_date": date(2026, 1, 2).isoformat()},
    )
    item_id = item_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_id,
            "trip_itinerary_item_id": item_id,
        },
    )
    assert expense_response.status_code == 201
    expense_id = expense_response.json()["id"]

    delete_response = await client.delete(f"/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}")
    assert delete_response.status_code == 204

    expense_after = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert expense_after.json()["trip_itinerary_item_id"] is None
    assert expense_after.json()["trip_id"] == trip_id


@pytest.mark.integration
async def test_create_expense_rejects_item_without_trip(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]
    item_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Item", "item_date": date(2026, 1, 2).isoformat()},
    )
    item_id = item_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_itinerary_item_id": item_id,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EXPENSE_TRIP_ITEM_REQUIRES_TRIP"


@pytest.mark.integration
async def test_create_expense_rejects_item_from_different_trip(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_a = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/",
            json={
                "name": "Trip A",
                "start_date": date(2026, 1, 1).isoformat(),
                "end_date": date(2026, 1, 5).isoformat(),
            },
        )
    ).json()
    trip_b = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/",
            json={
                "name": "Trip B",
                "start_date": date(2026, 2, 1).isoformat(),
                "end_date": date(2026, 2, 5).isoformat(),
            },
        )
    ).json()
    item_b = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/{trip_b['id']}/items",
            json={"title": "Item in B", "item_date": date(2026, 2, 2).isoformat()},
        )
    ).json()

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_a["id"],
            "trip_itinerary_item_id": item_b["id"],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EXPENSE_TRIP_ITEM_INVALID_FOR_TRIP"
