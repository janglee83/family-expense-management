import uuid
from collections.abc import AsyncGenerator
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_VALID_JPEG_BYTES = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300030202020203"
    "02020303030304060404040404080606050609080a0a090809090a0c0f0c0a"
    "0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc9000b0800"
    "0100010001011100ffcc000600101005ffda0008010100003f00d2cf20ffd9"
)


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


async def _upload_receipt(client: AsyncClient, family_id: str) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", _VALID_JPEG_BYTES, "image/jpeg")},
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_valid_upload_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    body = await _upload_receipt(client, family_id)

    assert body["status"] == "processing"
    assert body["content_type"] == "image/jpeg"
    assert body["file_size_bytes"] == len(_VALID_JPEG_BYTES)


@pytest.mark.integration
async def test_oversized_upload_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    oversized_content = b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024 + 1)

    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", oversized_content, "image/jpeg")},
    )

    assert response.status_code == 422
    list_response = await client.get(f"/api/v1/families/{family_id}/receipts/")
    assert list_response.json() == []


@pytest.mark.integration
async def test_wrong_type_upload_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", b"%PDF-1.4 not really a jpeg", "image/jpeg")},
    )

    assert response.status_code == 422
    list_response = await client.get(f"/api/v1/families/{family_id}/receipts/")
    assert list_response.json() == []


@pytest.mark.integration
async def test_non_member_rejected_on_every_endpoint(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        await _register(other, _unique_email())

        upload_response = await other.post(
            f"/api/v1/families/{family_id}/receipts/",
            files={"file": ("receipt.jpg", _VALID_JPEG_BYTES, "image/jpeg")},
        )
        list_response = await other.get(f"/api/v1/families/{family_id}/receipts/")
        detail_response = await other.get(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}"
        )
        image_response = await other.get(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}/image"
        )
        delete_response = await other.delete(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}"
        )

    assert upload_response.status_code == 403
    assert list_response.status_code == 403
    assert detail_response.status_code == 403
    assert image_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_get_image_returns_the_uploaded_bytes(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    response = await client.get(f"/api/v1/families/{family_id}/receipts/{receipt['id']}/image")

    assert response.status_code == 200
    assert response.content == _VALID_JPEG_BYTES
    assert response.headers["content-type"] == "image/jpeg"


@pytest.mark.integration
async def test_delete_as_uploader_succeeds(client: AsyncClient) -> None:
    from app.core.storage import get_receipt_storage

    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)
    storage = get_receipt_storage()
    prefix = f"receipts/{family_id}/{receipt['id']}/"
    before = storage._client.list_objects_v2(Bucket=storage._bucket_name, Prefix=prefix)
    assert before.get("KeyCount", 0) >= 1

    response = await client.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 204
    get_response = await client.get(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")
    assert get_response.status_code == 404
    after = storage._client.list_objects_v2(Bucket=storage._bucket_name, Prefix=prefix)
    assert after.get("KeyCount", 0) == 0


@pytest.mark.integration
async def test_delete_as_non_uploader_member_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member:
        await _register(member, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})

        response = await member.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 403


@pytest.mark.integration
async def test_delete_as_owner_who_did_not_upload_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member:
        await _register(member, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        receipt = await _upload_receipt(member, family_id)

    response = await client.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 204


@pytest.mark.integration
async def test_list_and_get_receipt_detail_succeed(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    list_response = await client.get(f"/api/v1/families/{family_id}/receipts/")
    assert list_response.status_code == 200
    ids = {item["id"] for item in list_response.json()}
    assert receipt["id"] in ids

    detail_response = await client.get(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == receipt["id"]


@pytest.mark.integration
async def test_get_receipt_detail_returns_not_found_for_unknown_id(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.get(f"/api/v1/families/{family_id}/receipts/{uuid.uuid4()}")

    assert response.status_code == 404
    assert response.json()["error"]["code"] == "RECEIPT_NOT_FOUND"
