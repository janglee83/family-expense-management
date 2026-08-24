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


async def _add_member(client: AsyncClient, family_id: str, email: str) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": email}
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_add_member_by_email_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)

    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": member_email}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == member_user["id"]
    assert body["role"] == "member"


@pytest.mark.integration
async def test_add_member_404_for_unregistered_email(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": _unique_email()}
    )

    assert response.status_code == 404


@pytest.mark.integration
async def test_add_member_409_when_already_a_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)

    await _add_member(client, family_id, member_email)
    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": member_email}
    )

    assert response.status_code == 409


@pytest.mark.integration
async def test_member_cannot_add_or_rename_or_delete(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await _add_member(client, family_id, member_email)

        rename_response = await member_client.patch(
            f"/api/v1/families/{family_id}", json={"name": "Hijacked"}
        )
        delete_response = await member_client.delete(f"/api/v1/families/{family_id}")
        add_response = await member_client.post(
            f"/api/v1/families/{family_id}/members", json={"email": _unique_email()}
        )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403
    assert add_response.status_code == 403


@pytest.mark.integration
async def test_owner_removes_member_and_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    admin_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        member_user = await _register(member_client, member_email)
        admin_user = await _register(admin_client, admin_email)

    await _add_member(client, family_id, member_email)
    await _add_member(client, family_id, admin_email)
    promote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{admin_user['id']}", json={"role": "admin"}
    )
    assert promote_response.status_code == 200
    assert promote_response.json()["role"] == "admin"

    remove_member_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{member_user['id']}"
    )
    remove_admin_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{admin_user['id']}"
    )

    assert remove_member_response.status_code == 204
    assert remove_admin_response.status_code == 204


@pytest.mark.integration
async def test_admin_can_remove_member_but_not_another_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    admin1_email = _unique_email()
    admin2_email = _unique_email()
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin1_client:
        admin1_user = await _register(admin1_client, admin1_email)
        await _add_member(client, family_id, admin1_email)
        await client.patch(
            f"/api/v1/families/{family_id}/members/{admin1_user['id']}", json={"role": "admin"}
        )

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as admin2_client:
            admin2_user = await _register(admin2_client, admin2_email)
            await _add_member(client, family_id, admin2_email)
            await client.patch(
                f"/api/v1/families/{family_id}/members/{admin2_user['id']}",
                json={"role": "admin"},
            )

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as member_client:
                member_user = await _register(member_client, member_email)
            await _add_member(client, family_id, member_email)

            remove_member_response = await admin1_client.delete(
                f"/api/v1/families/{family_id}/members/{member_user['id']}"
            )
            remove_admin_response = await admin1_client.delete(
                f"/api/v1/families/{family_id}/members/{admin2_user['id']}"
            )

    assert remove_member_response.status_code == 204
    assert remove_admin_response.status_code == 403


@pytest.mark.integration
async def test_admin_and_member_can_leave_but_owner_cannot(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    admin_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        admin_user = await _register(admin_client, admin_email)
        await _add_member(client, family_id, admin_email)
        await client.patch(
            f"/api/v1/families/{family_id}/members/{admin_user['id']}", json={"role": "admin"}
        )

        leave_response = await admin_client.delete(
            f"/api/v1/families/{family_id}/members/{admin_user['id']}"
        )

    assert leave_response.status_code == 204

    owner_id_response = await client.get(f"/api/v1/families/{family_id}")
    owner_user_id = owner_id_response.json()["members"][0]["user_id"]
    owner_leave_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{owner_user_id}"
    )

    assert owner_leave_response.status_code == 403


@pytest.mark.integration
async def test_owner_can_promote_and_demote(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)

    await _add_member(client, family_id, member_email)

    promote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "admin"}
    )
    demote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "member"}
    )

    assert promote_response.status_code == 200
    assert promote_response.json()["role"] == "admin"
    assert demote_response.status_code == 200
    assert demote_response.json()["role"] == "member"


@pytest.mark.integration
async def test_change_role_rejects_owner_literal_and_owner_target(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    detail = await client.get(f"/api/v1/families/{family_id}")
    owner_user_id = detail.json()["members"][0]["user_id"]

    reject_owner_target_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{owner_user_id}", json={"role": "admin"}
    )

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
    await _add_member(client, family_id, member_email)

    reject_owner_literal_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "owner"}
    )

    assert reject_owner_target_response.status_code == 400
    assert reject_owner_literal_response.status_code == 422


@pytest.mark.integration
async def test_member_cannot_change_roles(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
        await _add_member(client, family_id, member_email)

        response = await member_client.patch(
            f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "admin"}
        )

    assert response.status_code == 403
