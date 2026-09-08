import uuid
from unittest.mock import MagicMock, patch

import pytest
from botocore.exceptions import ClientError

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


def test_ensure_bucket_creates_when_bucket_is_missing() -> None:
    mock_client = MagicMock()
    mock_client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "404", "Message": "Not Found"}}, "HeadBucket"
    )

    with patch("app.core.storage.boto3.client", return_value=mock_client):
        MinioReceiptStorage(bucket_name="test-bucket")

    mock_client.create_bucket.assert_called_once_with(Bucket="test-bucket")


def test_ensure_bucket_does_not_create_on_permission_denied() -> None:
    mock_client = MagicMock()
    mock_client.head_bucket.side_effect = ClientError(
        {"Error": {"Code": "403", "Message": "Forbidden"}}, "HeadBucket"
    )

    with patch("app.core.storage.boto3.client", return_value=mock_client):
        MinioReceiptStorage(bucket_name="test-bucket")

    mock_client.create_bucket.assert_not_called()


def test_client_omits_explicit_credentials_when_not_provided() -> None:
    with patch("app.core.storage.boto3.client") as mock_boto_client:
        mock_boto_client.return_value.head_bucket.return_value = {}
        MinioReceiptStorage(bucket_name="test-bucket")

    _, kwargs = mock_boto_client.call_args
    assert "aws_access_key_id" not in kwargs
    assert "aws_secret_access_key" not in kwargs
    assert "endpoint_url" not in kwargs


def test_client_includes_explicit_credentials_when_provided() -> None:
    with patch("app.core.storage.boto3.client") as mock_boto_client:
        mock_boto_client.return_value.head_bucket.return_value = {}
        MinioReceiptStorage(
            bucket_name="test-bucket",
            access_key="key",
            secret_key="secret",
            endpoint_url="http://minio:9000",
        )

    _, kwargs = mock_boto_client.call_args
    assert kwargs["aws_access_key_id"] == "key"
    assert kwargs["aws_secret_access_key"] == "secret"
    assert kwargs["endpoint_url"] == "http://minio:9000"
