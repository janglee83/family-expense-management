import uuid
from collections.abc import AsyncGenerator

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


async def _register(client: AsyncClient, email: str, password: str = "correct-password") -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": "Alice"},
    )
    assert response.status_code == 201


@pytest.mark.integration
async def test_register_creates_user_and_sets_cookies(client: AsyncClient) -> None:
    email = _unique_email()

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Alice"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == email
    assert body["display_name"] == "Alice"
    assert "password" not in body
    assert "password_hash" not in body
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.integration
async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Bob"},
    )

    assert response.status_code == 409


@pytest.mark.integration
async def test_login_succeeds_with_correct_credentials(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "correct-password"}
    )

    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.integration
async def test_login_rejects_wrong_password(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
    )

    assert response.status_code == 401


@pytest.mark.integration
async def test_login_rate_limited_after_repeated_failures(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
        )
        assert response.status_code == 401

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
    )

    assert response.status_code == 429


@pytest.mark.integration
async def test_refresh_rotates_token_and_invalidates_old_one(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    first_refresh_token = client.cookies.get("refresh_token")
    assert first_refresh_token is not None
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200

    second_refresh_token = client.cookies.get("refresh_token")
    assert second_refresh_token != first_refresh_token

    client.cookies.set("refresh_token", first_refresh_token)
    reused_response = await client.post("/api/v1/auth/refresh")
    assert reused_response.status_code == 401


@pytest.mark.integration
async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    logout_response = await client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 204

    refresh_response = await client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


@pytest.mark.integration
async def test_logout_is_idempotent_with_no_session(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 204


@pytest.mark.integration
async def test_me_returns_current_user_when_authenticated(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == email


@pytest.mark.integration
async def test_me_rejects_missing_cookie(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401
