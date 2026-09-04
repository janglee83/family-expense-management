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
    assert response.status_code == 200
    return response.json()[0]["id"]  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_export_and_import_preview_expenses(client: AsyncClient) -> None:
    user = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    create_expense = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user["id"],
            "category_id": category_id,
            "amount": 4200,
            "is_shared": True,
            "description": "Dinner",
            "expense_date": date(2026, 9, 4).isoformat(),
        },
    )
    assert create_expense.status_code == 201

    export_json = await client.get(f"/api/v1/families/{family_id}/exports/expenses")
    assert export_json.status_code == 200
    assert len(export_json.json()["items"]) == 1

    export_csv = await client.get(f"/api/v1/families/{family_id}/exports/expenses.csv")
    assert export_csv.status_code == 200
    assert "text/csv" in export_csv.headers["content-type"]

    csv_body = (
        "payer_user_id,category_id,amount,is_shared,description,expense_date\n"
        f"{user['id']},{category_id},4200,true,Dinner,2026-09-04\n"
    )
    preview = await client.post(
        f"/api/v1/families/{family_id}/imports/expenses/preview",
        files={"file": ("import.csv", csv_body, "text/csv")},
    )

    assert preview.status_code == 200
    body = preview.json()
    assert body["valid_rows"] == 1
    assert body["duplicate_rows"] == 1


@pytest.mark.integration
async def test_delete_expense_with_undo_and_restore(client: AsyncClient) -> None:
    user = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    created = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user["id"],
            "category_id": category_id,
            "amount": 8800,
            "is_shared": False,
            "description": "Shoes",
            "expense_date": date(2026, 9, 5).isoformat(),
        },
    )
    assert created.status_code == 201
    expense_id = created.json()["id"]

    delete_response = await client.post(
        f"/api/v1/families/{family_id}/undo/expenses/{expense_id}"
    )
    assert delete_response.status_code == 200
    undo_token = delete_response.json()["undo_token"]

    list_after_delete = await client.get(f"/api/v1/families/{family_id}/expenses/")
    assert list_after_delete.status_code == 200
    assert list_after_delete.json() == []

    restore_response = await client.post(
        f"/api/v1/families/{family_id}/undo/{undo_token}/restore"
    )
    assert restore_response.status_code == 200
    assert restore_response.json()["restored_expense_id"] == expense_id

    restored_expense = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert restored_expense.status_code == 200
