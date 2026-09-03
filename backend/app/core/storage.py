from functools import lru_cache
from typing import Protocol

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings


class ReceiptStorage(Protocol):
    def save(self, key: str, content: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class MinioReceiptStorage:
    def __init__(
        self, endpoint_url: str, access_key: str, secret_key: str, bucket_name: str
    ) -> None:
        self._bucket_name = bucket_name
        self._client = boto3.client(
            "s3",
            endpoint_url=endpoint_url,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
        )
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket_name)
        except ClientError:
            self._client.create_bucket(Bucket=self._bucket_name)

    def save(self, key: str, content: bytes, content_type: str) -> None:
        self._client.put_object(
            Bucket=self._bucket_name, Key=key, Body=content, ContentType=content_type
        )

    def get(self, key: str) -> bytes:
        response = self._client.get_object(Bucket=self._bucket_name, Key=key)
        return response["Body"].read()  # type: ignore[no-any-return]

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self._bucket_name, Key=key)


@lru_cache
def get_receipt_storage() -> MinioReceiptStorage:
    settings = get_settings()
    return MinioReceiptStorage(
        endpoint_url=settings.minio_endpoint_url,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        bucket_name=settings.minio_bucket_name,
    )
