from collections.abc import AsyncGenerator

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def test_ping_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/ping")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "pong"}


async def test_not_found_error_uses_standard_envelope(client: AsyncClient) -> None:
    response = await client.get("/api/v1/does-not-exist")

    assert response.status_code == 404
    assert response.json() == {
        "error": {
            "code": "HTTP_404",
            "message": "Not Found",
        }
    }


async def test_request_validation_error_uses_standard_envelope(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/login", json={"email": "invalid"})

    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "REQUEST_VALIDATION_ERROR"
    assert body["error"]["message"] == "Request validation failed"
    assert isinstance(body["error"]["details"], list)


@pytest.mark.integration
async def test_health_checks_database_connectivity(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
