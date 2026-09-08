from functools import lru_cache
from typing import Any, Protocol

import boto3
from botocore.exceptions import ClientError

from app.core.config import get_settings


class ReceiptStorage(Protocol):
    def save(self, key: str, content: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...


class MinioReceiptStorage:
    def __init__(
        self,
        bucket_name: str,
        access_key: str | None = None,
        secret_key: str | None = None,
        endpoint_url: str | None = None,
        region_name: str | None = None,
    ) -> None:
        self._bucket_name = bucket_name
        client_kwargs: dict[str, Any] = {}
        if endpoint_url is not None:
            client_kwargs["endpoint_url"] = endpoint_url
        if region_name is not None:
            client_kwargs["region_name"] = region_name
        if access_key is not None and secret_key is not None:
            client_kwargs["aws_access_key_id"] = access_key
            client_kwargs["aws_secret_access_key"] = secret_key
        self._client = boto3.client("s3", **client_kwargs)
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        try:
            self._client.head_bucket(Bucket=self._bucket_name)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")
            if error_code in {"404", "NoSuchBucket"}:
                self._client.create_bucket(Bucket=self._bucket_name)
            # Any other error (e.g. 403 Forbidden, because a least-privilege
            # IAM role like Lambda's in production may not even be allowed to
            # check bucket existence, only read/write specific keys within
            # it) is treated as "the bucket exists and is managed elsewhere"
            # — bucket auto-creation is a dev/MinIO convenience only.

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
        bucket_name=settings.minio_bucket_name,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        endpoint_url=settings.minio_endpoint_url,
        region_name=settings.aws_region,
    )
