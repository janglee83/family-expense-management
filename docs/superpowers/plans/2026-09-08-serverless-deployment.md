# Serverless Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Docker Compose always-on stack with a scale-to-zero serverless deployment — AWS Lambda (via Lambda Web Adapter) behind API Gateway, Neon.tech (serverless Postgres), Upstash Redis (serverless), S3 for receipts, and S3+CloudFront for the frontend — bringing ongoing infra cost to roughly $0-3/month at the current low-traffic scale.

**Architecture:** The existing FastAPI app runs on Lambda unmodified (Lambda Web Adapter translates API Gateway events to real HTTP requests against the app's own Uvicorn server). Celery/Redis-as-broker is removed entirely — receipt processing (currently a no-op status flip, since real OCR was abandoned in an earlier phase) happens synchronously in the request handler. Redis itself is kept, but only for login rate-limiting, backed by Upstash instead of an always-on container.

**Tech Stack:** AWS Lambda (container image, ARM/Graviton), API Gateway (HTTP API), Neon.tech (Postgres), Upstash Redis, S3, CloudFront, Terraform, GitHub Actions (OIDC-authenticated deploy).

**Spec:** `docs/superpowers/specs/2026-09-08-serverless-deployment-design.md`

**Note on workflow:** this plan is executed directly on `main`, not an isolated worktree/branch — an explicit, deliberate exception to this project's usual per-phase branch convention, per direct instruction.

## Global Constraints

- No background/async job framework is added to replace Celery — the removed task did no real work (OCR was abandoned), so nothing needs a serverless-async replacement in this phase.
- `DATABASE_URL` must use Neon's **pooled** connection string (`-pooler` hostname), not the direct one — Lambda's per-invocation connection pattern can exhaust Postgres's connection limit otherwise.
- `REDIS_URL` must use Upstash's `rediss://` (TLS) endpoint.
- The Lambda execution role is scoped to exactly: CloudWatch Logs write access, and read/write/delete on the receipts S3 bucket only — no broader permissions.
- The frontend S3 bucket has no public access of any kind — only CloudFront (via Origin Access Control) may read it.
- Terraform manages the Lambda function's `image_uri` only at creation; ongoing deploys update it via `aws lambda update-function-code` in CI, not `terraform apply` — the Terraform resource must `lifecycle { ignore_changes = [image_uri] }` to avoid fighting CI's out-of-band updates.
- CI authenticates to AWS via OIDC-federated short-lived credentials, never static access keys.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  app/
    worker.py                  (delete)
    api/v1/
      receipts.py                (modify: drop Celery, synchronous status update)
      router.py                    (modify: re-enable the receipts router)
    core/
      config.py                      (modify: MinIO/S3 credentials + endpoint become optional, add aws_region)
      storage.py                       (modify: support real S3 with implicit IAM creds, tolerant bucket-ensure)
  tests/
    test_worker.py                      (delete)
    test_receipts_api.py                  (modify: update status assertion, drop the enqueue test)
    test_storage.py                        (modify: add coverage for the new optional-credentials/tolerant-ensure behavior)
  pyproject.toml                            (modify: remove celery dependency)
  Dockerfile.lambda                          (new)
docker-compose.yml                            (modify: remove the worker service)
infra/
  compute.tf                                    (delete)
  network.tf                                      (delete)
  storage.tf                                        (modify: frontend bucket becomes private)
  variables.tf                                        (modify: add Lambda/Neon/Upstash-related variables)
  lambda.tf                                             (new)
  cdn.tf                                                  (new)
.github/workflows/
  deploy.yml                                                (new)
docs/
  ARCHITECTURE.md                                              (modify)
```

---

### Task 1: Remove Celery, process receipts synchronously

**Files:**
- Delete: `backend/app/worker.py`, `backend/tests/test_worker.py`
- Modify: `backend/app/api/v1/receipts.py`, `backend/app/api/v1/router.py`, `backend/tests/test_receipts_api.py`, `backend/pyproject.toml`, `docker-compose.yml`

**Interfaces:**
- Consumes: `app.models.receipt.Receipt`, `ReceiptStatus` (unchanged), `app.core.storage.get_receipt_storage`, `app.db.transaction.locked_write`, `app.core.api_errors.raise_api_error` (all pre-existing, unchanged by this task)
- Produces: `upload_receipt` now sets a receipt's status straight to `PROCESSING` in the same transaction that creates it — no later task or module reads `app.worker` again after this task

- [ ] **Step 1: Update the failing tests first**

In `backend/tests/test_receipts_api.py`, change line 61 from:

```python
    assert body["status"] == "upload"
```

to:

```python
    assert body["status"] == "processing"
```

Delete the entire `test_valid_upload_enqueues_the_processing_task` test (currently lines 66-74 — the whole function, from `@pytest.mark.integration` above it through the `mock_delay.assert_called_once_with(body["id"])` line). Also remove the now-unused `from unittest.mock import patch` import from the top of the file if nothing else in the file uses `patch` (check first — if another test in this file still uses it, leave the import).

Delete `backend/tests/test_worker.py` entirely (`rm backend/tests/test_worker.py`) — `app/worker.py` is being deleted in this task, so there is nothing left for this test file to test.

- [ ] **Step 2: Run to confirm the remaining receipts tests fail**

```bash
docker compose up -d postgres redis minio
cd backend
docker compose run --rm backend uv run pytest tests/test_receipts_api.py -v -m integration
```
Expected: `test_valid_upload_succeeds` FAILS (still asserts `"upload"` in the actual response until Step 3 lands) — actually it will currently show the OLD behavior since receipts.py hasn't changed yet; confirm the test file itself parses and runs (no collection errors), and that this specific assertion is the one failing.

- [ ] **Step 3: Rewrite `backend/app/api/v1/receipts.py`**

Full new file content:

```python
import re
import uuid
from typing import Annotated

import magic
from fastapi import APIRouter, Depends, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.permissions import require_owner_admin_or_creator
from app.core.storage import get_receipt_storage
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.family_member import FamilyMember
from app.models.receipt import Receipt, ReceiptStatus
from app.models.user import User
from app.schemas.receipt import ReceiptResponse

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def _validate_receipt_content(content: bytes) -> str:
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="RECEIPT_FILE_TOO_LARGE",
            message="File exceeds the 10MB size limit",
        )
    content_type: str = magic.from_buffer(content, mime=True)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="RECEIPT_FILE_TYPE_UNSUPPORTED",
            message="Unsupported file type; only JPEG, PNG, and HEIC are allowed",
        )
    return content_type


def _sanitize_filename(filename: str) -> str:
    safe = re.sub(r"[^A-Za-z0-9._-]", "_", filename)
    return safe[:100] or "receipt"


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ReceiptResponse)
async def upload_receipt(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile,
) -> Receipt:
    # Cheap guard against oversized uploads before we buffer the body into memory.
    # This does not protect against an unbounded read before authentication runs
    # (Starlette parses the multipart body, including this file, before dependency
    # injection such as get_current_user/get_family_membership executes) — closing
    # that gap needs a request-level body-size cap (ASGI middleware or reverse-proxy
    # client_max_body_size), which is a deployment-hardening item for a later phase
    # since this repo has no reverse proxy yet.
    if file.size is not None and file.size > MAX_FILE_SIZE_BYTES:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="RECEIPT_FILE_TOO_LARGE",
            message="File exceeds the 10MB size limit",
        )
    content = await file.read()
    content_type = _validate_receipt_content(content)

    receipt_id = uuid.uuid4()
    filename = _sanitize_filename(file.filename or "receipt")
    storage_key = f"receipts/{family_id}/{receipt_id}/{filename}"

    storage = await run_in_threadpool(get_receipt_storage)
    await run_in_threadpool(storage.save, storage_key, content, content_type)

    receipt = Receipt(
        id=receipt_id,
        family_id=family_id,
        uploaded_by_user_id=user.id,
        storage_key=storage_key,
        content_type=content_type,
        file_size_bytes=len(content),
        status=ReceiptStatus.PROCESSING.value,
    )
    async with locked_write(session, tables=("receipts",)):
        session.add(receipt)
    return receipt


@router.get("/", response_model=list[ReceiptResponse])
async def list_receipts(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Receipt]:
    result = await session.scalars(
        select(Receipt).where(Receipt.family_id == family_id).order_by(Receipt.created_at.desc())
    )
    return list(result.all())


async def _get_receipt_or_404(
    family_id: uuid.UUID, receipt_id: uuid.UUID, session: AsyncSession
) -> Receipt:
    receipt = await session.scalar(
        select(Receipt).where(Receipt.id == receipt_id, Receipt.family_id == family_id)
    )
    if receipt is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="RECEIPT_NOT_FOUND",
            message="Receipt not found",
        )
    return receipt


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Receipt:
    return await _get_receipt_or_404(family_id, receipt_id, session)


@router.get("/{receipt_id}/image")
async def get_receipt_image(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    receipt = await _get_receipt_or_404(family_id, receipt_id, session)
    storage = await run_in_threadpool(get_receipt_storage)
    content = await run_in_threadpool(storage.get, receipt.storage_key)
    return Response(content=content, media_type=receipt.content_type)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    storage = await run_in_threadpool(get_receipt_storage)
    async with locked_write(session, tables=("receipts",)):
        receipt = await _get_receipt_or_404(family_id, receipt_id, session)
        require_owner_admin_or_creator(membership, receipt.uploaded_by_user_id)
        await run_in_threadpool(storage.delete, receipt.storage_key)
        await session.delete(receipt)
```

(The only real changes from the current file: the `from app.worker import process_receipt` import and the `try/except` enqueue block after creating the receipt are gone; `status=ReceiptStatus.UPLOAD.value` becomes `status=ReceiptStatus.PROCESSING.value`; the now-unused `from app.core.logging import get_logger` import and `logger = get_logger(__name__)` line are removed since nothing in this file logs anything anymore.)

- [ ] **Step 4: Delete `backend/app/worker.py`**

```bash
rm backend/app/worker.py
```

- [ ] **Step 5: Re-enable the receipts router in `backend/app/api/v1/router.py`**

Uncomment both the `receipts` entry in the `from app.api.v1 import (...)` block and the `api_router.include_router(receipts.router, ...)` call, restoring them to plain (non-commented) code in their current positions — no other changes to this file.

- [ ] **Step 6: Remove `celery` from `backend/pyproject.toml`**

Delete the `"celery>=5.4,<6.0",` line from the `dependencies` list. Leave `"redis>=5.0,<6.0",` — it's still needed for rate-limiting.

- [ ] **Step 7: Remove the `worker` service from `docker-compose.yml`**

Delete the entire `worker:` service block (the one running `uv run celery -A app.worker worker --loglevel=info`) — nothing else in the file changes.

- [ ] **Step 8: Run to confirm the tests pass**

```bash
docker compose run --rm backend sh -c "uv sync --extra dev >/dev/null 2>&1 && uv run pytest tests/test_receipts_api.py -v -m integration"
```
Expected: all receipts tests pass, including `test_valid_upload_succeeds` now asserting `"processing"`.

- [ ] **Step 9: Run the full backend suite, ruff, and mypy**

```bash
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run pytest -m integration -q && uv run ruff check . && uv run mypy ."
```
Expected: all clean. `test_worker.py` and any collection of `app/worker.py` are gone, so there should be no leftover references anywhere (search for stray `from app.worker` or `process_receipt` mentions if anything unexpectedly fails: `grep -rn "app.worker\|process_receipt" backend/`).

- [ ] **Step 10: Commit**

```bash
git add backend/app/api/v1/receipts.py backend/app/api/v1/router.py backend/tests/test_receipts_api.py backend/pyproject.toml docker-compose.yml
git rm backend/app/worker.py backend/tests/test_worker.py
git commit -m "feat(backend): remove Celery, process receipts synchronously"
```

---

### Task 2: Production-ready S3 support in storage.py

**Files:**
- Modify: `backend/app/core/config.py`, `backend/app/core/storage.py`, `backend/tests/test_storage.py`

**Interfaces:**
- Consumes: nothing new
- Produces: `MinioReceiptStorage.__init__(bucket_name, access_key=None, secret_key=None, endpoint_url=None, region_name=None)` — all credential/endpoint args now optional; `get_receipt_storage()`'s call site updated to match; `Settings.minio_endpoint_url`/`minio_access_key`/`minio_secret_key` become optional (`str | None = None`), a new `Settings.aws_region: str = "ap-northeast-1"` is added

- [ ] **Step 1: Write the failing tests**

Add to `backend/tests/test_storage.py` (alongside the existing `test_save_and_get_round_trip` / `test_delete_removes_the_object` tests):

```python
from unittest.mock import MagicMock, patch

from botocore.exceptions import ClientError


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
```

Add `from app.core.storage import MinioReceiptStorage` to the top of the file if it isn't already imported (it likely already is, since the existing tests use it via the `storage` fixture — check the fixture's own import and add a direct import alongside it if these new tests construct `MinioReceiptStorage` themselves rather than through the fixture, which they do here since they need to control/mock its constructor args directly).

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
docker compose run --rm backend uv run pytest tests/test_storage.py -v
```
Expected: the 4 new tests FAIL — `MinioReceiptStorage.__init__` doesn't yet accept optional credentials, and `_ensure_bucket` doesn't yet distinguish error codes.

- [ ] **Step 3: Add `aws_region` and make MinIO/S3 settings optional in `backend/app/core/config.py`**

Change these three lines:

```python
    minio_endpoint_url: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "receipts"
```

to:

```python
    minio_endpoint_url: str | None = None
    minio_access_key: str | None = None
    minio_secret_key: str | None = None
    minio_bucket_name: str = "receipts"
    aws_region: str = "ap-northeast-1"
```

No other change to this file.

- [ ] **Step 4: Rewrite `backend/app/core/storage.py`**

```python
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
```

- [ ] **Step 5: Run to confirm the new tests pass**

```bash
docker compose run --rm backend uv run pytest tests/test_storage.py -v
```
Expected: all pass, including the 2 pre-existing real-MinIO integration tests (unaffected — dev's `.env` still sets `MINIO_ENDPOINT_URL`/`MINIO_ACCESS_KEY`/`MINIO_SECRET_KEY` explicitly, so `get_receipt_storage()` still passes them through exactly as before).

- [ ] **Step 6: Run the full backend suite, ruff, and mypy**

```bash
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run pytest -m integration -q && uv run ruff check . && uv run mypy ."
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/config.py backend/app/core/storage.py backend/tests/test_storage.py
git commit -m "feat(backend): support real S3 with implicit IAM credentials and tolerant bucket-ensure"
```

---

### Task 3: Lambda Dockerfile with the Lambda Web Adapter

**Files:**
- Create: `backend/Dockerfile.lambda`

**Interfaces:**
- Consumes: the existing `app.main:app` FastAPI application (unchanged)
- Produces: a container image runnable both as a plain HTTP server (for local verification) and as an AWS Lambda function (via the bundled adapter extension)

- [ ] **Step 1: Create `backend/Dockerfile.lambda`**

```dockerfile
FROM public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 AS lambda-adapter

FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=lambda-adapter /lambda-adapter /opt/extensions/lambda-adapter

RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml uv.lock ./
RUN uv sync --no-install-project --frozen

COPY . .
RUN uv sync

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8080"]
```

Port `8080` matches the Lambda Web Adapter's documented zero-config default — no `PORT` environment variable needs to be set. The adapter is copied in as a Lambda **extension** (`/opt/extensions/`); when this image runs as a real Lambda function, AWS automatically starts the extension, which listens for Lambda invocation events, translates each into a real HTTP request against the app's own Uvicorn server on `localhost:8080`, and translates the response back. When this same image runs as a plain container (e.g. `docker run -p 8080:8080 ...`), the extension has nothing to do — Uvicorn just serves normally.

- [ ] **Step 2: Verify the image builds**

```bash
cd backend
docker build -f Dockerfile.lambda -t family-expense-backend-lambda .
```
Expected: builds successfully. This will take a few minutes the first time (installing the full dependency set).

- [ ] **Step 3: Verify the app actually starts and responds inside this image**

```bash
docker run --rm -d -p 8080:8080 --name lambda-smoke-test \
  -e DATABASE_URL="postgresql+psycopg://postgres:postgres@host.docker.internal:5432/family_expense" \
  -e REDIS_URL="redis://host.docker.internal:6379/0" \
  -e JWT_SECRET_KEY="test-secret-key-for-smoke-test-only" \
  family-expense-backend-lambda
sleep 3
curl -sf http://localhost:8080/health
docker logs lambda-smoke-test
docker stop lambda-smoke-test
```
Expected: `curl` returns a `200` with the health-check response, and `docker logs` shows Uvicorn's normal startup output with no import errors. (This proves the app itself starts correctly inside the Lambda-targeted image — it does not exercise the Lambda Adapter's actual event-translation logic, which needs a real Lambda/API Gateway invocation or the AWS Lambda Runtime Interface Emulator to test; that full round-trip is verified for real once Task 4-6 actually deploy it.)

Bring up `postgres`/`redis` first if they aren't already running (`docker compose up -d postgres redis`) so `host.docker.internal` resolves to something real for this smoke test.

- [ ] **Step 4: Commit**

```bash
git add backend/Dockerfile.lambda
git commit -m "feat(infra): add Lambda-targeted Dockerfile using the Lambda Web Adapter"
```

---

### Task 4: Terraform — Lambda, API Gateway, ECR, IAM

**Files:**
- Delete: `infra/compute.tf`, `infra/network.tf`
- Modify: `infra/variables.tf`
- Create: `infra/lambda.tf`

**Interfaces:**
- Consumes: `aws_s3_bucket.receipts` (already defined in `infra/storage.tf`, unchanged by this task)
- Produces: `aws_lambda_function.backend`, `aws_apigatewayv2_api.backend` (Terraform resource names later tasks/docs can reference), output `api_url`

- [ ] **Step 1: Delete the EC2-oriented files**

```bash
rm infra/compute.tf infra/network.tf
```

These defined the EC2 instance, its key pair, its IAM role, and the security group for SSH/HTTP/HTTPS/8000 — none of that applies once there's no EC2 instance to reach.

- [ ] **Step 2: Add new variables to `infra/variables.tf`**

Add these alongside the existing `aws_region`/`project_name`/`domain_name` variables (remove the now-unused `instance_type` variable, since there's no EC2 instance to size):

```hcl
variable "database_url" {
  description = "Neon pooled Postgres connection string"
  type        = string
  sensitive   = true
}

variable "redis_url" {
  description = "Upstash Redis TLS connection string (rediss://...)"
  type        = string
  sensitive   = true
}

variable "jwt_secret_key" {
  description = "JWT signing secret for the backend"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "The deployed frontend's URL, used for CORS — set after the first apply once the CloudFront domain is known"
  type        = string
  default     = ""
}
```

- [ ] **Step 3: Create `infra/lambda.tf`**

```hcl
resource "aws_ecr_repository" "backend" {
  name                 = "${var.project_name}-backend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_basic_execution" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "lambda_s3_access" {
  name        = "${var.project_name}-lambda-s3-access"
  description = "Allow the backend Lambda to read/write/delete objects in the receipts bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:PutObject",
          "s3:GetObject",
          "s3:DeleteObject"
        ]
        Effect   = "Allow"
        Resource = "${aws_s3_bucket.receipts.arn}/*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_s3_attach" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = aws_iam_policy.lambda_s3_access.arn
}

resource "aws_lambda_function" "backend" {
  function_name = "${var.project_name}-backend"
  role          = aws_iam_role.lambda_execution.arn
  package_type  = "Image"
  image_uri     = "${aws_ecr_repository.backend.repository_url}:latest"
  timeout       = 30
  memory_size   = 512
  architectures = ["arm64"]

  environment {
    variables = {
      ENV               = "production"
      DATABASE_URL      = var.database_url
      REDIS_URL         = var.redis_url
      JWT_SECRET_KEY    = var.jwt_secret_key
      CORS_ORIGINS      = jsonencode([var.frontend_url])
      MINIO_BUCKET_NAME = aws_s3_bucket.receipts.bucket
    }
  }

  # Terraform only sets the image at creation time (it must point at an
  # already-existing ECR image — see the bootstrap note below). Every deploy
  # after that updates the running function's image via
  # `aws lambda update-function-code` in CI, not `terraform apply` — without
  # this, a later `terraform apply` would try to reset the image back to
  # whatever this resource's state currently records, fighting CI's deploys.
  lifecycle {
    ignore_changes = [image_uri]
  }

  depends_on = [aws_iam_role_policy_attachment.lambda_basic_execution]
}

resource "aws_apigatewayv2_api" "backend" {
  name          = "${var.project_name}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "backend" {
  api_id                 = aws_apigatewayv2_api.backend.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.backend.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "default" {
  api_id    = aws_apigatewayv2_api.backend.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.backend.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.backend.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "apigw" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.backend.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.backend.execution_arn}/*/*"
}

output "api_url" {
  value = aws_apigatewayv2_api.backend.api_endpoint
}

output "ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}
```

**Note on `AWS_REGION`:** it's deliberately absent from the `environment.variables` block above — `AWS_REGION` is a Lambda-reserved environment variable name (along with `AWS_ACCESS_KEY_ID`, `AWS_LAMBDA_FUNCTION_NAME`, and several others); Terraform would fail at `apply` time with an `InvalidParameterValueException` if it were set explicitly here. The Lambda runtime injects the function's real deployed region into `AWS_REGION` automatically, so `Settings.aws_region` (Task 2) picks it up with zero extra configuration — its `"ap-northeast-1"` default only matters for local dev, where nothing else sets that env var.

**Bootstrap ordering note, carried over from the spec:** `aws_lambda_function` with `package_type = "Image"` requires the referenced ECR image tag to already exist at `terraform apply` time. The very first `terraform apply` for this file will fail at the `aws_lambda_function.backend` resource unless an image has already been pushed to `:latest` on the `aws_ecr_repository.backend` repository. The practical sequence for a from-scratch environment: (1) `terraform apply -target=aws_ecr_repository.backend` to create just the repository, (2) build and push the Task 3 image to it manually or via a one-off CI run, (3) `terraform apply` (no target) to create everything else including the Lambda function. Every deploy after that first one is a normal CI-driven `update-function-code` against the already-existing function — this bootstrap sequence is a one-time cost, not a recurring one.

- [ ] **Step 2: Validate the Terraform syntax**

```bash
cd infra
terraform init
terraform validate
```
Expected: `Success! The configuration is valid.` (This does not require real AWS credentials — `validate` only checks syntax/internal consistency, it doesn't contact AWS.)

- [ ] **Step 3: Commit**

```bash
git add infra/lambda.tf infra/variables.tf
git rm infra/compute.tf infra/network.tf
git commit -m "feat(infra): replace EC2 with Lambda, API Gateway, ECR, and scoped IAM"
```

---

### Task 5: Terraform — private frontend bucket + CloudFront

**Files:**
- Modify: `infra/storage.tf`
- Create: `infra/cdn.tf`

**Interfaces:**
- Consumes: `aws_s3_bucket.frontend` (already defined in `infra/storage.tf`)
- Produces: `aws_cloudfront_distribution.frontend`, output `frontend_url`

- [ ] **Step 1: Modify `infra/storage.tf`'s frontend bucket section**

Remove the `aws_s3_bucket_website_configuration.frontend` resource and the `aws_s3_bucket_policy.frontend_policy` resource entirely (the public-read policy is being replaced by a CloudFront-only policy defined in the new `cdn.tf`). Change `aws_s3_bucket_public_access_block.frontend` from:

```hcl
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}
```

to:

```hcl
resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
```

Leave `aws_s3_bucket.frontend` itself, `aws_s3_bucket.receipts`, and everything under the "Receipts Storage Bucket" heading unchanged.

- [ ] **Step 2: Create `infra/cdn.tf`**

```hcl
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${var.project_name}-frontend-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "frontend" {
  enabled             = true
  default_root_object = "index.html"

  origin {
    domain_name              = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id                = "frontend-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    allowed_methods  = ["GET", "HEAD"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = "frontend-s3"

    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies {
        forward = "none"
      }
    }
  }

  # Client-side routing (React Router): unknown paths should still serve
  # index.html rather than a raw S3 403/404, letting the SPA's own router
  # handle the path.
  custom_error_response {
    error_code         = 403
    response_code      = 200
    response_page_path = "/index.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 200
    response_page_path = "/index.html"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}

resource "aws_s3_bucket_policy" "frontend_cloudfront" {
  bucket = aws_s3_bucket.frontend.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontServicePrincipal"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = aws_cloudfront_distribution.frontend.arn
          }
        }
      }
    ]
  })
}

output "frontend_url" {
  value = "https://${aws_cloudfront_distribution.frontend.domain_name}"
}
```

Note this uses CloudFront's default `*.cloudfront.net` certificate (`cloudfront_default_certificate = true`) — real HTTPS, no cost, but not a custom domain. Adding a custom domain is an explicit non-goal of this phase (see the spec).

- [ ] **Step 3: Validate the Terraform syntax**

```bash
cd infra
terraform validate
```
Expected: `Success! The configuration is valid.`

- [ ] **Step 4: Commit**

```bash
git add infra/storage.tf infra/cdn.tf
git commit -m "feat(infra): serve the frontend through CloudFront with a private S3 origin"
```

---

### Task 6: CI/CD deploy workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

**Interfaces:**
- Consumes: `backend/Dockerfile.lambda` (Task 3), the Lambda function and ECR repository (Task 4), the CloudFront distribution and S3 buckets (Task 5), `backend/scripts/safe_migrate.py` (pre-existing)
- Produces: nothing other services depend on — this is the terminal deploy step

- [ ] **Step 1: Create `.github/workflows/deploy.yml`**

```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch: {}

permissions:
  id-token: write
  contents: read

jobs:
  deploy-backend:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - uses: aws-actions/amazon-ecr-login@v2
        id: ecr-login

      - name: Set up QEMU for arm64 builds
        uses: docker/setup-qemu-action@v3
        with:
          platforms: arm64

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3

      - name: Build and push the backend image
        run: |
          docker buildx build --platform linux/arm64 \
            -f Dockerfile.lambda \
            -t ${{ steps.ecr-login.outputs.registry }}/${{ secrets.ECR_REPOSITORY }}:${{ github.sha }} \
            -t ${{ steps.ecr-login.outputs.registry }}/${{ secrets.ECR_REPOSITORY }}:latest \
            --push .

      - name: Update Lambda function code
        run: |
          aws lambda update-function-code \
            --function-name ${{ secrets.LAMBDA_FUNCTION_NAME }} \
            --image-uri ${{ steps.ecr-login.outputs.registry }}/${{ secrets.ECR_REPOSITORY }}:${{ github.sha }}

      - uses: astral-sh/setup-uv@v3
        with:
          python-version: '3.12'

      - run: uv sync --extra dev

      - name: Run database migration against Neon
        env:
          DATABASE_URL: ${{ secrets.NEON_DATABASE_URL }}
          REDIS_URL: ${{ secrets.UPSTASH_REDIS_URL }}
          JWT_SECRET_KEY: ${{ secrets.JWT_SECRET_KEY }}
        run: uv run python scripts/safe_migrate.py

  deploy-frontend:
    runs-on: ubuntu-latest
    needs: deploy-backend
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
          cache-dependency-path: frontend/pnpm-lock.yaml

      - run: pnpm install --frozen-lockfile

      - name: Build frontend
        env:
          VITE_API_BASE_URL: ${{ secrets.API_GATEWAY_URL }}
        run: pnpm run build

      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Sync build output to S3
        run: aws s3 sync dist/ s3://${{ secrets.FRONTEND_BUCKET_NAME }} --delete

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

Notes on why each non-obvious piece is there:
- `permissions: id-token: write` at the workflow level, combined with `aws-actions/configure-aws-credentials`'s `role-to-assume`, is OIDC federation — GitHub issues a short-lived token this action exchanges for temporary AWS credentials scoped to `AWS_DEPLOY_ROLE_ARN`. No long-lived AWS access key/secret pair is ever stored as a GitHub secret.
- The `docker/setup-qemu-action` + `--platform linux/arm64` combination is required because GitHub's standard `ubuntu-latest` runners are x86_64 — without QEMU emulation, `docker buildx build --platform linux/arm64` would fail (or silently produce an x86_64 image mislabeled as arm64) on that runner.
- `safe_migrate.py` needs `pg_dump` on the runner's `PATH` for its pre-migration backup step — `ubuntu-latest` ships PostgreSQL client tools by default, so this should work with no extra install step; if the migration step fails specifically on a `pg_dump: command not found` error, add `- run: sudo apt-get update && sudo apt-get install -y postgresql-client` before it.
- The following repository secrets need to exist before this workflow can run (this task does not create them — that's a manual one-time setup step against the real AWS/Neon/Upstash accounts, not something Terraform or CI can bootstrap for itself): `AWS_DEPLOY_ROLE_ARN`, `AWS_REGION`, `ECR_REPOSITORY`, `LAMBDA_FUNCTION_NAME`, `NEON_DATABASE_URL`, `UPSTASH_REDIS_URL`, `JWT_SECRET_KEY`, `API_GATEWAY_URL`, `FRONTEND_BUCKET_NAME`, `CLOUDFRONT_DISTRIBUTION_ID`.

- [ ] **Step 2: Validate the workflow YAML parses**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/deploy.yml'))" && echo "valid YAML"
```
Expected: `valid YAML`. (This only checks the file is syntactically valid YAML — it cannot verify the workflow actually runs correctly without the real secrets and AWS/Neon/Upstash accounts in place; that verification happens once someone with access to those accounts pushes to `main` for real.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "feat(ci): add the deploy workflow (backend image + migration, frontend to S3/CloudFront)"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`

- [ ] **Step 1: Extend `docs/ARCHITECTURE.md`**

Add a new `## Deployment` section (at the end of the file, after whatever the current last section is):

```markdown
## Deployment

The app deploys serverlessly on AWS rather than as an always-on server,
because real traffic at this scale (a small number of family members) is
low and sporadic — paying for compute that sits idle most of the day would
dominate the cost for no benefit.

- **Backend**: runs on AWS Lambda as a container image (ARM/Graviton),
  behind API Gateway (HTTP API). The Lambda Web Adapter
  (`backend/Dockerfile.lambda`) lets the existing FastAPI/Uvicorn app run
  unmodified — it translates API Gateway events into real HTTP requests
  against the app's own local Uvicorn server and back.
- **Database**: Neon.tech (serverless Postgres) via its pooled connection
  string — Lambda's per-invocation connection pattern needs pooling to
  avoid exhausting Postgres's connection limit.
- **Rate-limit store**: Upstash Redis (serverless, TLS) — Redis is kept
  only for login rate-limiting; the Celery/Redis-as-broker pattern was
  removed entirely (see below).
- **Receipt storage**: S3, accessed via implicit IAM credentials from the
  Lambda execution role (no explicit access key/secret in production —
  `app/core/storage.py`'s `MinioReceiptStorage` only passes explicit
  credentials when they're configured, which is a dev/MinIO-only case).
- **Frontend**: a static build served through CloudFront, with a private
  S3 origin restricted to CloudFront via Origin Access Control — never a
  public S3 bucket.
- **No background job processing**: the receipt-upload flow used to
  enqueue a Celery task (`process_receipt`) that, since real OCR was
  abandoned in an earlier phase, did nothing but flip a status flag. That
  task and the entire Celery/worker service are gone — the status update
  now happens synchronously in the same request/transaction that creates
  the receipt row. If a future phase reintroduces genuinely heavy
  background work, that phase should design its own serverless-async
  pipeline (e.g. SQS + a dedicated Lambda) at that time.
- **Infrastructure as code**: `infra/` (Terraform) provisions the ECR
  repository, Lambda function, API Gateway, IAM roles/policies, S3
  buckets, and CloudFront distribution. The Lambda function's container
  image is deployed by CI (`aws lambda update-function-code`), not by
  `terraform apply` — Terraform only sets the image at first creation and
  is told to ignore later changes to it, so CI and Terraform don't fight
  over the same field.
- **CI/CD**: `.github/workflows/deploy.yml`, triggered on push to `main`,
  authenticates to AWS via OIDC (no static credentials), builds and pushes
  the backend image, updates the Lambda function, runs
  `scripts/safe_migrate.py` against Neon, then builds and syncs the
  frontend to S3 and invalidates the CloudFront cache.

At the current low-traffic scale, this architecture costs roughly
$0-3/month — every component either has a permanent free tier at this
volume (Lambda, Neon, Upstash) or scales its cost with actual usage
rather than charging for idle time (API Gateway, S3, CloudFront).
```

- [ ] **Step 2: Commit**

```bash
git add docs/ARCHITECTURE.md
git commit -m "docs: document the serverless deployment architecture"
```

---

## After all tasks: verification

- [ ] Run the full backend check suite from a clean state:

```bash
docker compose down -v
docker compose up -d --build postgres redis minio
cd backend && docker compose run --rm backend sh -c "uv sync --extra dev && uv run alembic upgrade head && uv run pytest && uv run ruff check . && uv run mypy ." && cd ..
```
- [ ] Run the frontend check suite: `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && cd ..`
- [ ] `cd infra && terraform validate && cd ..`
- [ ] Confirm `git status` is clean and every commit is on `main` (per this plan's explicit no-worktree exception).
- [ ] The actual first deploy to real AWS (the bootstrap sequence noted in Task 4, then a real `deploy.yml` run) requires manual, one-time setup this plan cannot automate: an AWS account, the GitHub OIDC deploy role, Neon and Upstash accounts and their connection strings, and populating the GitHub repository secrets listed in Task 6 — flag this to the user as the remaining manual step once the code/infra side is done.
