import uuid

import pytest

from app.core.config import get_settings
from app.core.storage import MinioReceiptStorage


@pytest.fixture
def storage() -> MinioReceiptStorage:
    settings = get_settings()
    return MinioReceiptStorage(
        endpoint_url=settings.minio_endpoint_url,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket_name=settings.minio_bucket_name,
    )


@pytest.mark.integration
def test_save_and_get_round_trip(storage: MinioReceiptStorage) -> None:
    key = f"test/{uuid.uuid4()}.txt"

    storage.save(key, b"hello world", "text/plain")
    result = storage.get(key)

    assert result == b"hello world"


@pytest.mark.integration
def test_delete_removes_the_object(storage: MinioReceiptStorage) -> None:
    key = f"test/{uuid.uuid4()}.txt"
    storage.save(key, b"to be deleted", "text/plain")

    storage.delete(key)

    with pytest.raises(Exception):  # noqa: B017
        storage.get(key)
