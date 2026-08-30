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
    return response.json()[0]["id"]  # type: ignore[no-any-return]


def _expense_payload(payer_user_id: str, category_id: str, amount: int = 1000) -> dict[str, Any]:
    return {
        "payer_user_id": payer_user_id,
        "category_id": category_id,
        "amount": amount,
        "is_shared": False,
        "description": "Test expense",
        "expense_date": date.today().isoformat(),
    }


@pytest.mark.integration
async def test_create_expense_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1500),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount"] == 1500
    assert body["payer_user_id"] == owner["id"]
    assert body["created_by_user_id"] == owner["id"]
    assert body["is_shared"] is False


@pytest.mark.integration
async def test_create_expense_rejects_payer_not_in_family(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(str(uuid.uuid4()), category_id),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_create_expense_rejects_another_familys_custom_category(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    family_b_id = await _create_family(client, "Family B")
    other_category_response = await client.post(
        f"/api/v1/families/{family_b_id}/categories/", json={"name": "B's Custom"}
    )
    other_category_id = other_category_response.json()["id"]

    response = await client.post(
        f"/api/v1/families/{family_a_id}/expenses/",
        json=_expense_payload(owner["id"], other_category_id),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_create_expense_rejects_non_positive_amount(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=0),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_create_expense_rejects_amount_above_int4_max(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=2_147_483_648),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_list_expenses_scoped_to_family(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    family_b_id = await _create_family(client, "Family B")
    category_a_id = await _get_global_category_id(client, family_a_id)
    category_b_id = await _get_global_category_id(client, family_b_id)

    await client.post(
        f"/api/v1/families/{family_a_id}/expenses/",
        json=_expense_payload(owner["id"], category_a_id),
    )
    await client.post(
        f"/api/v1/families/{family_b_id}/expenses/",
        json=_expense_payload(owner["id"], category_b_id),
    )

    response = await client.get(f"/api/v1/families/{family_a_id}/expenses/")

    assert response.status_code == 200
    expenses = response.json()
    assert len(expenses) == 1
    assert expenses[0]["family_id"] == family_a_id


@pytest.mark.integration
async def test_list_expenses_rejects_non_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as other_client:
        await _register(other_client, _unique_email())
        response = await other_client.get(f"/api/v1/families/{family_id}/expenses/")

    assert response.status_code == 403


@pytest.mark.integration
async def test_edit_expense_as_creator_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1000),
    )
    expense_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/v1/families/{family_id}/expenses/{expense_id}",
        json=_expense_payload(owner["id"], category_id, amount=2000),
    )

    assert response.status_code == 200
    assert response.json()["amount"] == 2000


@pytest.mark.integration
async def test_edit_expense_as_owner_who_did_not_create_it_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        create_response = await member_client.post(
            f"/api/v1/families/{family_id}/expenses/",
            json=_expense_payload(member_user["id"], category_id, amount=500),
        )
    expense_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/v1/families/{family_id}/expenses/{expense_id}",
        json=_expense_payload(member_user["id"], category_id, amount=750),
    )

    assert response.status_code == 200
    assert response.json()["amount"] == 750


@pytest.mark.integration
async def test_edit_expense_as_member_who_did_not_create_it_rejected(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1000),
    )
    expense_id = create_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )

        response = await member_client.patch(
            f"/api/v1/families/{family_id}/expenses/{expense_id}",
            json=_expense_payload(owner["id"], category_id, amount=9999),
        )

    assert response.status_code == 403


@pytest.mark.integration
async def test_edit_expense_as_admin_who_did_not_create_it_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    creator_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as creator_client:
        creator_user = await _register(creator_client, creator_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": creator_email}
        )
        create_response = await creator_client.post(
            f"/api/v1/families/{family_id}/expenses/",
            json=_expense_payload(creator_user["id"], category_id, amount=500),
        )
    expense_id = create_response.json()["id"]

    admin_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        await _register(admin_client, admin_email)
        add_member_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": admin_email}
        )
        admin_user_id = add_member_response.json()["user_id"]
        role_response = await client.patch(
            f"/api/v1/families/{family_id}/members/{admin_user_id}", json={"role": "admin"}
        )
        assert role_response.status_code == 200

        response = await admin_client.patch(
            f"/api/v1/families/{family_id}/expenses/{expense_id}",
            json=_expense_payload(creator_user["id"], category_id, amount=900),
        )

    assert response.status_code == 200
    assert response.json()["amount"] == 900


@pytest.mark.integration
async def test_delete_expense_as_creator_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id),
    )
    expense_id = create_response.json()["id"]

    response = await client.delete(f"/api/v1/families/{family_id}/expenses/{expense_id}")

    assert response.status_code == 204
    get_response = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert get_response.status_code == 404


@pytest.mark.integration
async def test_delete_expense_as_member_who_did_not_create_it_rejected(
    client: AsyncClient,
) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1000),
    )
    expense_id = create_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )

        response = await member_client.delete(
            f"/api/v1/families/{family_id}/expenses/{expense_id}"
        )

    assert response.status_code == 403
