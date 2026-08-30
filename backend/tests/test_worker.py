import uuid
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.main import app
from app.models.receipt import Receipt, ReceiptStatus
from app.worker import process_receipt

_settings = get_settings()
_sync_engine = create_engine(_settings.database_url)
_SyncSession = sessionmaker(bind=_sync_engine)


def _unique_email() -> str:
    return f"user-{uuid.uuid4()}@example.com"


async def _register_and_create_family() -> tuple[str, str]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        register_response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": _unique_email(),
                "password": "correct-password",
                "display_name": "Alice",
            },
        )
        user_id: str = register_response.json()["id"]
        family_response = await client.post("/api/v1/families/", json={"name": "Test Family"})
        family_id: str = family_response.json()["id"]
    return user_id, family_id


def _insert_receipt_row(family_id: str, user_id: str) -> uuid.UUID:
    receipt_id = uuid.uuid4()
    with _SyncSession() as session:
        receipt = Receipt(
            id=receipt_id,
            family_id=uuid.UUID(family_id),
            uploaded_by_user_id=uuid.UUID(user_id),
            storage_key="receipts/test/test.jpg",
            content_type="image/jpeg",
            file_size_bytes=1024,
            status=ReceiptStatus.UPLOAD.value,
        )
        session.add(receipt)
        session.commit()
    return receipt_id


@pytest.mark.integration
async def test_process_receipt_sets_status_to_processing() -> None:
    user_id, family_id = await _register_and_create_family()
    receipt_id = _insert_receipt_row(family_id, user_id)

    process_receipt.run(str(receipt_id))

    with _SyncSession() as session:
        receipt = session.get(Receipt, receipt_id)
        assert receipt is not None
        assert receipt.status == ReceiptStatus.PROCESSING.value


@pytest.mark.integration
async def test_process_receipt_sets_status_to_failed_on_error() -> None:
    user_id, family_id = await _register_and_create_family()
    receipt_id = _insert_receipt_row(family_id, user_id)

    original_commit = Session.commit
    calls = {"count": 0}

    def flaky_commit(self: Session) -> None:
        calls["count"] += 1
        if calls["count"] == 1:
            raise RuntimeError("simulated failure")
        original_commit(self)

    with patch.object(Session, "commit", flaky_commit):
        with pytest.raises(RuntimeError, match="simulated failure"):
            process_receipt.run(str(receipt_id))

    with _SyncSession() as session:
        receipt = session.get(Receipt, receipt_id)
        assert receipt is not None
        assert receipt.status == ReceiptStatus.FAILED.value
        assert receipt.error_message == "simulated failure"
