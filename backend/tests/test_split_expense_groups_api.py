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


async def _create_expense(
    client: AsyncClient,
    family_id: str,
    payer_user_id: str,
    category_id: str,
    amount: int,
    is_shared: bool,
    expense_date: date,
    description: str = "",
) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": payer_user_id,
            "category_id": category_id,
            "amount": amount,
            "is_shared": is_shared,
            "description": description,
            "expense_date": expense_date.isoformat(),
        },
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_preview_excludes_personal_expenses_and_sums_shared_ones(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    await _create_expense(client, family_id, owner["id"], category_id, 3000, True, date(2026, 9, 5))
    await _create_expense(client, family_id, owner["id"], category_id, 2000, True, date(2026, 9, 20))
    await _create_expense(client, family_id, owner["id"], category_id, 9999, False, date(2026, 9, 10))

    response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/preview",
        params={"period_start": "2026-09-01", "period_end": "2026-09-30"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_amount"] == 5000
    assert len(body["expenses"]) == 2


@pytest.mark.integration
async def test_create_equal_split_group_and_settle_each_participant(client: AsyncClient) -> None:
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

    await _create_expense(client, family_id, owner["id"], category_id, 3000, True, date(2026, 9, 5))
    await _create_expense(client, family_id, owner["id"], category_id, 2400, True, date(2026, 9, 20))

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert create_response.status_code == 201
    group = create_response.json()
    assert group["total_amount"] == 5400
    assert len(group["expenses"]) == 2
    assert {item["amount"] for item in group["participants"]} == {2700}

    owner_participant = next(
        item for item in group["participants"] if item["participant_user_id"] == owner["id"]
    )
    settle_response = await client.patch(
        f"/api/v1/families/{family_id}/split-expense-groups/{group['id']}/participants/{owner_participant['id']}/settle",
        json={"is_settled": True},
    )
    assert settle_response.status_code == 200
    assert settle_response.json()["settled_amount"] == 2700
    assert settle_response.json()["status"] == "pending"


@pytest.mark.integration
async def test_create_custom_split_group_rejects_amount_mismatch(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 5000, True, date(2026, 9, 5))

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "custom",
            "participants": [
                {"participant_user_id": owner["id"], "amount": 2000},
                {"participant_user_id": member["id"], "amount": 2000},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_CUSTOM_AMOUNT_MISMATCH"


@pytest.mark.integration
async def test_create_percentage_split_group_computes_amounts_summing_to_total(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 999, True, date(2026, 9, 5))

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "percentage",
            "participants": [
                {"participant_user_id": owner["id"], "percentage": 70},
                {"participant_user_id": member["id"], "percentage": 30},
            ],
        },
    )
    assert response.status_code == 201
    group = response.json()
    assert sum(item["amount"] for item in group["participants"]) == 999
    owner_participant = next(
        item for item in group["participants"] if item["participant_user_id"] == owner["id"]
    )
    assert owner_participant["amount"] > 0
    assert owner_participant["percentage"] == 70


@pytest.mark.integration
async def test_create_rejects_when_no_eligible_expenses(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_GROUP_NO_ELIGIBLE_EXPENSES"


@pytest.mark.integration
async def test_expense_already_individually_split_is_excluded_from_group(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    expense = await _create_expense(
        client, family_id, owner["id"], category_id, 4000, True, date(2026, 9, 8)
    )

    split_response = await client.post(
        f"/api/v1/families/{family_id}/split-expenses/",
        json={
            "expense_id": expense["id"],
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert split_response.status_code == 201

    preview_response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/preview",
        params={"period_start": "2026-09-01", "period_end": "2026-09-30"},
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["total_amount"] == 0


@pytest.mark.integration
async def test_list_and_get_group_detail(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    await _create_expense(
        client, family_id, owner["id"], category_id, 2000, True, date(2026, 10, 3)
    )

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert create_response.status_code == 201
    group_id = create_response.json()["id"]

    list_response = await client.get(f"/api/v1/families/{family_id}/split-expense-groups/")
    assert list_response.status_code == 200
    assert any(item["id"] == group_id for item in list_response.json())

    detail_response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/{group_id}"
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == group_id
    assert detail_response.json()["total_amount"] == 2000


@pytest.mark.integration
async def test_settling_all_participants_flips_group_status_to_settled(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(
        client, family_id, owner["id"], category_id, 1000, True, date(2026, 9, 5)
    )

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert create_response.status_code == 201
    group = create_response.json()
    assert group["status"] == "pending"
    assert len(group["participants"]) == 2

    for participant in group["participants"]:
        settle_response = await client.patch(
            f"/api/v1/families/{family_id}/split-expense-groups/"
            f"{group['id']}/participants/{participant['id']}/settle",
            json={"is_settled": True},
        )
        assert settle_response.status_code == 200

    detail_response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/{group['id']}"
    )
    assert detail_response.status_code == 200
    assert detail_response.json()["status"] == "settled"
    assert detail_response.json()["outstanding_amount"] == 0
    assert detail_response.json()["settled_amount"] == 1000


@pytest.mark.integration
async def test_create_rejects_non_family_member_participant(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    await _create_expense(
        client, family_id, owner["id"], category_id, 1000, True, date(2026, 9, 5)
    )

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": str(uuid.uuid4())},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_PARTICIPANT_NOT_IN_FAMILY"


@pytest.mark.integration
async def test_expense_already_in_another_group_is_excluded_from_a_second_groups_preview(
    client: AsyncClient,
) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(
        client, family_id, owner["id"], category_id, 1000, True, date(2026, 9, 5)
    )

    first_group_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert first_group_response.status_code == 201
    assert first_group_response.json()["total_amount"] == 1000

    preview_response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/preview",
        params={"period_start": "2026-09-01", "period_end": "2026-09-30"},
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["total_amount"] == 0
    assert preview_response.json()["expenses"] == []


@pytest.mark.integration
async def test_create_rejects_zero_percentage_participant(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(
        client, family_id, owner["id"], category_id, 1000, True, date(2026, 9, 5)
    )

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "percentage",
            "participants": [
                {"participant_user_id": owner["id"], "percentage": 100},
                {"participant_user_id": member["id"], "percentage": 0},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_PERCENTAGE_AMOUNT_MISMATCH"


@pytest.mark.integration
async def test_create_rejects_equal_split_total_smaller_than_participant_count(
    client: AsyncClient,
) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 1, True, date(2026, 9, 5))

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_PERCENTAGE_AMOUNT_MISMATCH"
