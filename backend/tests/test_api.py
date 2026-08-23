import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:  # type: ignore[misc]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


async def test_ping_returns_ok(client: AsyncClient) -> None:
    response = await client.get("/api/v1/ping")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "message": "pong"}


@pytest.mark.integration
async def test_health_checks_database_connectivity(client: AsyncClient) -> None:
    response = await client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
