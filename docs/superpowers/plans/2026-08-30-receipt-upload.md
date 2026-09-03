# Receipt Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Family-scoped receipt image upload, durable storage (MinIO), and an async processing pipeline (Celery/Redis) that proves the state-machine mechanics work end to end — no real OCR yet, that's Phase 6.

**Architecture:** A new `receipts` domain following the exact `get_family_membership`-first authorization pattern Phases 3-4 established. Uploaded images are validated by real content-sniffing, stored in MinIO behind a small storage interface, and tracked via a `receipts` row whose `status` a Celery task (running in a new, generic `worker` service) advances from `UPLOAD` to `PROCESSING` — a deliberate stub Phase 6 replaces with real OpenCV/PaddleOCR logic.

**Tech Stack:** FastAPI + SQLAlchemy 2.0 + Alembic (existing), Celery + Redis (already a dependency, unused until now), MinIO (new, S3-compatible object storage via `boto3`), `python-magic` (real file-content sniffing) — on the existing Vite + React + TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-08-30-receipt-upload-design.md`

## Global Constraints

- No FK from `receipts` to `expenses` — the two stay fully independent in this phase.
- `receipts.status` is a plain string column (a `ReceiptStatus` StrEnum at the app layer, matching `FamilyRole`'s precedent) — no Postgres ENUM, so later phases can add new states with no migration. This phase only ever writes `UPLOAD`, `PROCESSING`, or `FAILED`.
- `uploaded_by_user_id` has no `ondelete="CASCADE"` (financial-record-preservation precedent from `expenses.payer_user_id`); `family_id` does cascade.
- File validation is against real content (via `python-magic`), never the client-supplied filename/MIME alone: JPEG, PNG, or HEIC/HEIF, ≤ 10MB. A failing upload returns 422 and creates no `receipts` row and no MinIO object.
- Any family member can upload and view; only the uploader or an OWNER/ADMIN can delete (reusing `require_owner_admin_or_creator` from Phase 4).
- The image-serving endpoint is a backend proxy that re-checks family membership on every request — never a public/presigned URL.
- The Celery task uses a synchronous SQLAlchemy session (same `psycopg` v3 driver Alembic already uses sync-side) — no async/Celery integration.
- No hardcoded user-facing strings in the frontend — new `receipt.*` i18n keys in both `ja`/`vi`.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  app/
    models/
      receipt.py             (Receipt model, ReceiptStatus StrEnum)
      __init__.py              (modify: export Receipt, ReceiptStatus)
    schemas/
      receipt.py                (ReceiptResponse)
    core/
      config.py                  (modify: add minio_* settings)
      storage.py                   (ReceiptStorage protocol + MinioReceiptStorage)
    api/
      v1/
        receipts.py                 (upload/list/detail/image/delete endpoints)
        router.py                     (modify: include receipts router)
    worker.py                        (Celery app + process_receipt task)
  alembic/versions/0005_add_receipts.py
  tests/
    conftest.py                      (modify: add MINIO_* env fallbacks)
    test_storage.py
    test_worker.py
    test_receipts_api.py
  Dockerfile                          (modify: install libmagic1)
  pyproject.toml                        (modify: add boto3, python-magic)
docker-compose.yml                       (modify: add minio + worker services)
.env.example                              (modify: add MINIO_* vars)
.github/workflows/ci.yml                    (modify: add minio service)
frontend/
  src/
    receipts/
      receiptApi.ts
      ReceiptUploadForm.tsx
      ReceiptUploadForm.test.tsx
      ReceiptList.tsx
      ReceiptList.test.tsx
    api/client.ts                        (modify: export API_BASE_URL)
    AppRoutes.tsx                         (modify: add /families/:familyId/receipts route)
    families/FamilyDetail.tsx              (modify: add a link)
    i18n/locales/{ja,vi}/common.json         (modify: add receipt.* keys)
docs/
  ARCHITECTURE.md                            (modify)
  PRODUCT_REQUIREMENTS.md                    (modify)
  I18N.md                                    (modify)
```

---

### Task 1: Receipt model, migration, and infra scaffolding

**Files:**
- Create: `backend/app/models/receipt.py`, `backend/alembic/versions/0005_add_receipts.py`
- Modify: `backend/app/models/__init__.py`, `backend/app/core/config.py`, `backend/pyproject.toml`, `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `backend/tests/conftest.py`, `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `app.db.base.Base`, `app.core.config.Settings` (existing)
- Produces: `app.models.Receipt` (table `receipts`), `app.models.ReceiptStatus` (values `UPLOAD="upload"`, `PROCESSING="processing"`, `FAILED="failed"`, plus reserved-for-later `OCR_COMPLETED`/`PARSED`/`NEEDS_REVIEW`/`CONFIRMED`), `Settings.minio_endpoint_url`/`minio_access_key`/`minio_secret_key`/`minio_bucket_name`

- [ ] **Step 1: Create `backend/app/models/receipt.py`**

```python
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ReceiptStatus(StrEnum):
    UPLOAD = "upload"
    PROCESSING = "processing"
    FAILED = "failed"
    OCR_COMPLETED = "ocr_completed"
    PARSED = "parsed"
    NEEDS_REVIEW = "needs_review"
    CONFIRMED = "confirmed"


class Receipt(Base):
    __tablename__ = "receipts"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    uploaded_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    content_type: Mapped[str] = mapped_column(String(50), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
```

- [ ] **Step 2: Update `backend/app/models/__init__.py`**

```python
from app.models.category import Category
from app.models.expense import Expense
from app.models.family import Family
from app.models.family_member import FamilyMember, FamilyRole
from app.models.receipt import Receipt, ReceiptStatus
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = [
    "Category",
    "Expense",
    "Family",
    "FamilyMember",
    "FamilyRole",
    "Receipt",
    "ReceiptStatus",
    "RefreshToken",
    "User",
]
```

- [ ] **Step 3: Create the migration `backend/alembic/versions/0005_add_receipts.py`**

```python
"""add receipts

Revision ID: 0005
Revises: 0004
Create Date: 2026-08-30

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column("storage_key", sa.String(length=500), nullable=False),
        sa.Column("content_type", sa.String(length=50), nullable=False),
        sa.Column("file_size_bytes", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("error_message", sa.String(length=1000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_receipts_family_id", "receipts", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_receipts_family_id", table_name="receipts")
    op.drop_table("receipts")
```

- [ ] **Step 4: Add MinIO settings to `backend/app/core/config.py`**

Add these fields to the `Settings` class, alongside the existing `database_url`/`redis_url` fields (no new validators needed):

```python
    minio_endpoint_url: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "receipts"
```

- [ ] **Step 5: Add new dependencies to `backend/pyproject.toml`**

Add to the `dependencies` list (after the existing `redis` entry):

```toml
  "boto3>=1.34,<2.0",
  "python-magic>=0.4,<1.0",
```

- [ ] **Step 6: Install `libmagic1` in `backend/Dockerfile`**

`python-magic` is a thin wrapper around the system `libmagic` library — it needs the shared library installed at the OS level. Add this line right after the `ENV` block, before `RUN pip install --no-cache-dir uv`:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*
```

- [ ] **Step 7: Add MinIO and a generic `worker` service to `docker-compose.yml`**

Add a `minio` service (after `redis`, before `backend`):

```yaml
  minio:
    image: bitnami/minio:2024
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
      MINIO_DEFAULT_BUCKETS: receipts
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio_data:/bitnami/minio/data
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:9000/minio/health/live || exit 1"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Add `minio` to the existing `backend` service's `depends_on` (it now also talks to MinIO):

```yaml
      minio:
        condition: service_healthy
```

Add a new `worker` service (after `backend`, before `frontend`) — it shares the `backend` image but runs Celery instead of uvicorn:

```yaml
  worker:
    build:
      context: ./backend
    env_file:
      - .env
    volumes:
      - ./backend:/app
      - /app/.venv
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      minio:
        condition: service_healthy
    command: uv run celery -A app.worker worker --loglevel=info
```

Add `minio_data:` to the top-level `volumes:` block, alongside `postgres_data:`.

**Do not bring up the `worker` service yet in this task's verification** — `app/worker.py` doesn't exist until Task 3, so `docker compose up worker` would fail with `ModuleNotFoundError: No module named 'app.worker'`. That's expected here; Task 3 verifies the worker service actually starts.

- [ ] **Step 8: Add MinIO variables to `.env.example`**

```
MINIO_ENDPOINT_URL=http://minio:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET_NAME=receipts
```

Copy `.env.example` to `.env` if you haven't already (`.env` is gitignored and required for `docker compose` to run — `cp .env.example .env`).

- [ ] **Step 9: Add MinIO fallbacks to `backend/tests/conftest.py`**

Add alongside the existing `setdefault` calls:

```python
    os.environ.setdefault("MINIO_ENDPOINT_URL", "http://localhost:9000")
    os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
    os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
    os.environ.setdefault("MINIO_BUCKET_NAME", "receipts-test")
```

- [ ] **Step 10: Add MinIO to `.github/workflows/ci.yml`'s backend job**

Add a `minio` entry to the `services:` block (alongside `postgres`/`redis`):

```yaml
      minio:
        image: bitnami/minio:2024
        env:
          MINIO_ROOT_USER: minioadmin
          MINIO_ROOT_PASSWORD: minioadmin
          MINIO_DEFAULT_BUCKETS: receipts-test
        ports: ["9000:9000"]
        options: >-
          --health-cmd "curl -f http://localhost:9000/minio/health/live || exit 1"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
```

Add these to the job's existing top-level `env:` block:

```yaml
      MINIO_ENDPOINT_URL: http://localhost:9000
      MINIO_ACCESS_KEY: minioadmin
      MINIO_SECRET_KEY: minioadmin
      MINIO_BUCKET_NAME: receipts-test
```

- [ ] **Step 11: Verify against real Postgres and MinIO**

```bash
cp .env.example .env   # if not already done
docker compose up -d postgres redis minio
docker compose ps
```
Expected: all three show `healthy`. If `minio`'s healthcheck doesn't go healthy, run `docker compose logs minio` — `bitnami/minio` images generally bundle `curl`, but if this particular tag doesn't, swap the healthcheck's `curl` for `wget -q --spider` (same URL) and retry.

```bash
cd backend
docker compose run --rm backend sh -c "uv sync --extra dev && uv run alembic upgrade head"
docker compose run --rm backend uv run alembic current
```
Expected: `0005 (head)`.

```bash
docker compose exec postgres psql -U postgres -d family_expense -c "\d receipts"
```
Expected: all 9 columns, FK on `family_id` (CASCADE) and `uploaded_by_user_id` (no cascade), index on `family_id`.

- [ ] **Step 12: Run the full backend suite, ruff, and mypy**

```bash
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run ruff check . && uv run mypy ."
```
Expected: all clean (existing tests unaffected by this task; the new `Receipt`/`ReceiptStatus` symbols aren't imported anywhere yet, so nothing new to fail).

- [ ] **Step 13: Commit**

```bash
git add backend/app/models backend/alembic backend/app/core/config.py backend/pyproject.toml backend/Dockerfile backend/tests/conftest.py docker-compose.yml .env.example .github/workflows/ci.yml
git commit -m "feat(backend): add Receipt model, migration, and MinIO/worker infra scaffolding"
```

(`.env` itself is gitignored — don't add it.)

---

### Task 2: Storage abstraction and schema

**Files:**
- Create: `backend/app/core/storage.py`, `backend/app/schemas/receipt.py`, `backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings` (Task 1's new MinIO fields)
- Produces: `app.core.storage.MinioReceiptStorage` (methods `save(key: str, content: bytes, content_type: str) -> None`, `get(key: str) -> bytes`, `delete(key: str) -> None`), `app.core.storage.get_receipt_storage() -> MinioReceiptStorage`, `app.schemas.receipt.ReceiptResponse`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_storage.py`:

```python
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

    with pytest.raises(Exception):
        storage.get(key)
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd backend
docker compose up -d postgres redis minio
docker compose run --rm backend uv run pytest tests/test_storage.py -v -m integration
```
Expected: FAIL — `app.core.storage` doesn't exist yet.

- [ ] **Step 3: Create `backend/app/core/storage.py`**

```python
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
```

- [ ] **Step 4: Create `backend/app/schemas/receipt.py`**

```python
import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID
    content_type: str
    file_size_bytes: int
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime
```

Note: `storage_key` is deliberately excluded from the response — it's an internal MinIO object key, not something the frontend needs.

- [ ] **Step 5: Run to confirm it passes**

```bash
docker compose run --rm backend uv run pytest tests/test_storage.py -v -m integration
```
Expected: 2 passed.

- [ ] **Step 6: Run the full backend suite, ruff, and mypy**

```bash
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run ruff check . && uv run mypy ."
```
Expected: all clean. If mypy flags anything else about untyped `boto3`/`botocore` symbols beyond what's already handled above, add a matching `# type: ignore[no-any-return]` at the specific return site — `ignore_missing_imports = true` already treats their untyped internals as `Any`, so no other changes should be needed.

- [ ] **Step 7: Commit**

```bash
git add backend/app/core/storage.py backend/app/schemas/receipt.py backend/tests/test_storage.py
git commit -m "feat(backend): add MinIO-backed receipt storage and response schema"
```

---

### Task 3: Celery worker

**Files:**
- Create: `backend/app/worker.py`, `backend/tests/test_worker.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`, `app.models.Receipt`, `app.models.ReceiptStatus`
- Produces: `app.worker.celery_app` (the Celery application), `app.worker.process_receipt` (a Celery task, called as `process_receipt.delay(receipt_id: str)` in production, or `process_receipt.run(receipt_id: str)` directly in tests to bypass the broker)

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_worker.py`:

```python
import uuid

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

    from unittest.mock import patch

    with patch.object(Session, "commit", flaky_commit):
        with pytest.raises(RuntimeError, match="simulated failure"):
            process_receipt.run(str(receipt_id))

    with _SyncSession() as session:
        receipt = session.get(Receipt, receipt_id)
        assert receipt is not None
        assert receipt.status == ReceiptStatus.FAILED.value
        assert receipt.error_message == "simulated failure"
```

(The `from unittest.mock import patch` is placed inline above the `with` block deliberately — move it to the top of the file with the other imports if you prefer; either is fine, just be consistent.)

- [ ] **Step 2: Run to confirm it fails**

```bash
docker compose up -d postgres redis minio
cd backend
docker compose run --rm backend uv run alembic upgrade head
docker compose run --rm backend uv run pytest tests/test_worker.py -v -m integration
```
Expected: FAIL — `app.worker` doesn't exist yet.

- [ ] **Step 3: Create `backend/app/worker.py`**

```python
import uuid

from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.models.receipt import Receipt, ReceiptStatus

_settings = get_settings()

celery_app = Celery("family_expense", broker=_settings.redis_url, backend=_settings.redis_url)
celery_app.conf.task_ignore_result = True

_sync_engine = create_engine(_settings.database_url)
SyncSessionLocal = sessionmaker(bind=_sync_engine)


@celery_app.task(bind=True, autoretry_for=(Exception,), retry_backoff=True, max_retries=3)
def process_receipt(self: object, receipt_id: str) -> None:
    with SyncSessionLocal() as session:
        receipt = session.get(Receipt, uuid.UUID(receipt_id))
        if receipt is None:
            return
        try:
            receipt.status = ReceiptStatus.PROCESSING.value
            session.commit()
        except Exception as exc:
            session.rollback()
            receipt.status = ReceiptStatus.FAILED.value
            receipt.error_message = str(exc)
            session.commit()
            raise
```

- [ ] **Step 4: Run to confirm it passes**

```bash
docker compose run --rm backend uv run pytest tests/test_worker.py -v -m integration
```
Expected: 2 passed.

- [ ] **Step 5: Verify the actual `worker` docker-compose service starts**

```bash
docker compose up -d worker
docker compose ps worker
docker compose logs worker
```
Expected: `worker` shows `Up`/running, and its logs show Celery's startup banner with `process_receipt` listed among the registered tasks — no `ModuleNotFoundError`.

```bash
docker compose down
```

- [ ] **Step 6: Run the full backend suite, ruff, and mypy**

```bash
docker compose up -d postgres redis minio
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run ruff check . && uv run mypy ."
docker compose run --rm backend uv run pytest -m integration -q
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/worker.py backend/tests/test_worker.py
git commit -m "feat(backend): add Celery worker with a stub receipt-processing task"
```

---

### Task 4: Receipt endpoints

**Files:**
- Create: `backend/app/api/v1/receipts.py`, `backend/tests/test_receipts_api.py`
- Modify: `backend/app/api/v1/router.py`

**Interfaces:**
- Consumes: `app.api.deps.get_current_user`, `app.api.deps.get_family_membership`, `app.core.permissions.require_owner_admin_or_creator`, `app.core.storage.get_receipt_storage`, `app.models.Receipt`, `app.models.ReceiptStatus`, `app.schemas.receipt.ReceiptResponse`, `app.worker.process_receipt`
- Produces: `app.api.v1.receipts.router`, mounted under `/api/v1/families/{family_id}/receipts`, with `POST /`, `GET /`, `GET /{receipt_id}`, `GET /{receipt_id}/image`, `DELETE /{receipt_id}`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_receipts_api.py`:

```python
import io
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app

_VALID_JPEG_BYTES = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300030202020203"
    "02020303030304060404040404080606050609080a0a090809090a0c0f0c0a"
    "0b0e0b09090d110d0e0f101011100a0c12131210130f101010ffc9000b0800"
    "0100010001011100ffcc000600101005ffda0008010100003f00d2cf20ffd9"
)


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _unique_email() -> str:
    return f"user-{uuid.uuid4()}@example.com"


async def _register(client: AsyncClient, email: str) -> dict:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Alice"},
    )
    assert response.status_code == 201
    return response.json()


async def _create_family(client: AsyncClient, name: str = "Test Family") -> str:
    response = await client.post("/api/v1/families/", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]


async def _upload_receipt(client: AsyncClient, family_id: str) -> dict:
    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", _VALID_JPEG_BYTES, "image/jpeg")},
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.integration
async def test_valid_upload_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    body = await _upload_receipt(client, family_id)

    assert body["status"] == "upload"
    assert body["content_type"] == "image/jpeg"
    assert body["file_size_bytes"] == len(_VALID_JPEG_BYTES)


@pytest.mark.integration
async def test_oversized_upload_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    oversized_content = b"\xff\xd8\xff" + b"0" * (10 * 1024 * 1024 + 1)

    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", oversized_content, "image/jpeg")},
    )

    assert response.status_code == 422
    list_response = await client.get(f"/api/v1/families/{family_id}/receipts/")
    assert list_response.json() == []


@pytest.mark.integration
async def test_wrong_type_upload_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/receipts/",
        files={"file": ("receipt.jpg", b"%PDF-1.4 not really a jpeg", "image/jpeg")},
    )

    assert response.status_code == 422
    list_response = await client.get(f"/api/v1/families/{family_id}/receipts/")
    assert list_response.json() == []


@pytest.mark.integration
async def test_non_member_rejected_on_every_endpoint(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as other:
        await _register(other, _unique_email())

        upload_response = await other.post(
            f"/api/v1/families/{family_id}/receipts/",
            files={"file": ("receipt.jpg", _VALID_JPEG_BYTES, "image/jpeg")},
        )
        list_response = await other.get(f"/api/v1/families/{family_id}/receipts/")
        detail_response = await other.get(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}"
        )
        image_response = await other.get(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}/image"
        )
        delete_response = await other.delete(
            f"/api/v1/families/{family_id}/receipts/{receipt['id']}"
        )

    assert upload_response.status_code == 403
    assert list_response.status_code == 403
    assert detail_response.status_code == 403
    assert image_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_get_image_returns_the_uploaded_bytes(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    response = await client.get(f"/api/v1/families/{family_id}/receipts/{receipt['id']}/image")

    assert response.status_code == 200
    assert response.content == _VALID_JPEG_BYTES
    assert response.headers["content-type"] == "image/jpeg"


@pytest.mark.integration
async def test_delete_as_uploader_succeeds(client: AsyncClient) -> None:
    from app.core.storage import get_receipt_storage

    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)
    storage = get_receipt_storage()
    prefix = f"receipts/{family_id}/{receipt['id']}/"
    before = storage._client.list_objects_v2(Bucket=storage._bucket_name, Prefix=prefix)
    assert before.get("KeyCount", 0) >= 1

    response = await client.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 204
    get_response = await client.get(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")
    assert get_response.status_code == 404
    after = storage._client.list_objects_v2(Bucket=storage._bucket_name, Prefix=prefix)
    assert after.get("KeyCount", 0) == 0


@pytest.mark.integration
async def test_delete_as_non_uploader_member_rejected(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    receipt = await _upload_receipt(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member:
        await _register(member, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})

        response = await member.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 403


@pytest.mark.integration
async def test_delete_as_owner_who_did_not_upload_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member:
        await _register(member, member_email)
        await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        receipt = await _upload_receipt(member, family_id)

    response = await client.delete(f"/api/v1/families/{family_id}/receipts/{receipt['id']}")

    assert response.status_code == 204
```

Note: `test_delete_as_uploader_succeeds` reaches into `storage._client`/`storage._bucket_name` (private attributes of `MinioReceiptStorage`) deliberately — `ReceiptStorage`'s public interface has no "list" method, and this is the one place a test needs to verify an internal implementation detail (the object was actually removed from MinIO, not just the DB row), matching the spec's explicit testing-plan requirement. The inline `from app.core.storage import get_receipt_storage` can move to the top of the file with the other imports if you prefer.

The embedded `_VALID_JPEG_BYTES` is a genuine minimal 1x1-pixel JPEG (valid JFIF headers through to the `ffd9` end marker) — real content-sniffing (via `python-magic`) needs actual JPEG bytes, not a fake string, to correctly identify it as `image/jpeg`.

- [ ] **Step 2: Run to confirm it fails**

```bash
docker compose up -d postgres redis minio
cd backend
docker compose run --rm backend uv run alembic upgrade head
docker compose run --rm backend uv run pytest tests/test_receipts_api.py -v -m integration
```
Expected: FAIL — no `/api/v1/families/{family_id}/receipts/` route exists yet.

- [ ] **Step 3: Implement `backend/app/api/v1/receipts.py`**

```python
import uuid
from typing import Annotated

import magic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.permissions import require_owner_admin_or_creator
from app.core.storage import get_receipt_storage
from app.db.session import get_session
from app.models.family_member import FamilyMember
from app.models.receipt import Receipt, ReceiptStatus
from app.models.user import User
from app.schemas.receipt import ReceiptResponse
from app.worker import process_receipt

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def _validate_receipt_content(content: bytes) -> str:
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File exceeds the 10MB size limit",
        )
    content_type: str = magic.from_buffer(content, mime=True)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported file type; only JPEG, PNG, and HEIC are allowed",
        )
    return content_type  # type: ignore[no-any-return]


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ReceiptResponse)
async def upload_receipt(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile,
) -> Receipt:
    content = await file.read()
    content_type = _validate_receipt_content(content)

    receipt_id = uuid.uuid4()
    filename = (file.filename or "receipt").replace("/", "_")
    storage_key = f"receipts/{family_id}/{receipt_id}/{filename}"

    storage = get_receipt_storage()
    await run_in_threadpool(storage.save, storage_key, content, content_type)

    receipt = Receipt(
        id=receipt_id,
        family_id=family_id,
        uploaded_by_user_id=user.id,
        storage_key=storage_key,
        content_type=content_type,
        file_size_bytes=len(content),
        status=ReceiptStatus.UPLOAD.value,
    )
    session.add(receipt)
    await session.commit()

    process_receipt.delay(str(receipt.id))
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
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
    storage = get_receipt_storage()
    content = await run_in_threadpool(storage.get, receipt.storage_key)
    return Response(content=content, media_type=receipt.content_type)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    receipt = await _get_receipt_or_404(family_id, receipt_id, session)
    require_owner_admin_or_creator(membership, receipt.uploaded_by_user_id)
    storage = get_receipt_storage()
    await run_in_threadpool(storage.delete, receipt.storage_key)
    await session.delete(receipt)
    await session.commit()
```

- [ ] **Step 4: Wire the router into `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import auth, categories, expenses, families, ping, receipts

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(families.router, prefix="/families", tags=["families"])
api_router.include_router(
    categories.router, prefix="/families/{family_id}/categories", tags=["categories"]
)
api_router.include_router(
    expenses.router, prefix="/families/{family_id}/expenses", tags=["expenses"]
)
api_router.include_router(
    receipts.router, prefix="/families/{family_id}/receipts", tags=["receipts"]
)
```

- [ ] **Step 5: Run the integration tests against real Postgres + MinIO**

```bash
docker compose run --rm backend uv run pytest tests/test_receipts_api.py -v -m integration
```
Expected: 9 passed. (`process_receipt.delay(...)` publishes to Redis but no worker needs to be running for these tests — the row's status stays `upload` regardless, which is exactly what `test_valid_upload_succeeds` asserts.)

- [ ] **Step 6: Regenerate the OpenAPI schema and run the full suite**

```bash
docker compose run --rm backend uv run python scripts/export_openapi.py
docker compose run --rm backend sh -c "uv run pytest -m 'not integration' -q && uv run ruff check . && uv run mypy ."
docker compose run --rm backend uv run pytest -m integration -q
```
Expected: `openapi/openapi.json` now contains the five receipt endpoints and `ReceiptResponse`; all checks clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/receipts.py backend/app/api/v1/router.py backend/tests/test_receipts_api.py openapi/openapi.json
git commit -m "feat(backend): add receipt upload/list/detail/image/delete endpoints"
```

---

### Task 5: Frontend receipt upload and list

**Files:**
- Create: `frontend/src/receipts/receiptApi.ts`, `frontend/src/receipts/ReceiptUploadForm.tsx`, `frontend/src/receipts/ReceiptUploadForm.test.tsx`, `frontend/src/receipts/ReceiptList.tsx`, `frontend/src/receipts/ReceiptList.test.tsx`
- Modify: `frontend/src/api/client.ts`, `frontend/src/AppRoutes.tsx`, `frontend/src/families/FamilyDetail.tsx`, `frontend/src/i18n/locales/ja/common.json`, `frontend/src/i18n/locales/vi/common.json`

**Interfaces:**
- Consumes: the regenerated `openapi/openapi.json` (Task 4), `getFamilyDetail` (Phase 3's `familyApi.ts`), `useAuth()` (Phase 2)
- Produces: `frontend/src/api/schema.gen.ts` (regenerated), `receiptApi.ts`'s exported functions, the `/families/:familyId/receipts` route

- [ ] **Step 1: Regenerate the frontend API types**

```bash
cd frontend
pnpm run generate:api-types
```
Expected: `src/api/schema.gen.ts` now includes the receipt paths/schemas.

- [ ] **Step 2: Export `API_BASE_URL` from `frontend/src/api/client.ts`**

```typescript
import createClient from "openapi-fetch";
import type { paths } from "./schema.gen";

export const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL, credentials: "include" });
```

- [ ] **Step 3: Add the i18n keys**

Add to `frontend/src/i18n/locales/ja/common.json` (new top-level `"receipt"` key):

```json
  "receipt": {
    "myReceipts": "レシート一覧",
    "noReceipts": "まだレシートがありません",
    "upload": "アップロード",
    "uploading": "アップロード中...",
    "delete": "削除",
    "confirmDelete": "このレシートを削除してもよろしいですか?",
    "statusUploaded": "アップロード済み",
    "statusProcessing": "処理中",
    "statusFailed": "失敗",
    "invalidFileType": "JPEG、PNG、HEIC形式のみアップロードできます",
    "fileTooLarge": "ファイルサイズは10MB以下にしてください",
    "uploadFailed": "エラーが発生しました。もう一度お試しください"
  }
```

Add the equivalent to `frontend/src/i18n/locales/vi/common.json`:

```json
  "receipt": {
    "myReceipts": "Danh sách hóa đơn",
    "noReceipts": "Chưa có hóa đơn nào",
    "upload": "Tải lên",
    "uploading": "Đang tải lên...",
    "delete": "Xóa",
    "confirmDelete": "Bạn có chắc muốn xóa hóa đơn này?",
    "statusUploaded": "Đã tải lên",
    "statusProcessing": "Đang xử lý",
    "statusFailed": "Thất bại",
    "invalidFileType": "Chỉ chấp nhận định dạng JPEG, PNG, HEIC",
    "fileTooLarge": "Kích thước tệp phải nhỏ hơn 10MB",
    "uploadFailed": "Đã xảy ra lỗi. Vui lòng thử lại"
  }
```

(Both files must remain valid JSON — add a comma after the preceding key's closing brace.)

- [ ] **Step 4: Create `frontend/src/receipts/receiptApi.ts`**

```typescript
import { API_BASE_URL, apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type Receipt = components["schemas"]["ReceiptResponse"];

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = ["image/jpeg", "image/png", "image/heic", "image/heif"];

export function validateReceiptFile(file: File): "fileTooLarge" | "invalidFileType" | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return "fileTooLarge";
  }
  if (!ALLOWED_FILE_TYPES.includes(file.type)) {
    return "invalidFileType";
  }
  return null;
}

export async function uploadReceipt(familyId: string, file: File): Promise<Receipt> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE_URL}/api/v1/families/${familyId}/receipts/`, {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!response.ok) {
    if (response.status === 422) {
      throw new Error("invalid_file");
    }
    throw new Error("upload_receipt_failed");
  }
  return (await response.json()) as Receipt;
}

export async function listReceipts(familyId: string): Promise<Receipt[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/receipts/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_receipts_failed");
  }
  return data;
}

export async function deleteReceipt(familyId: string, receiptId: string): Promise<void> {
  const { error } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/receipts/{receipt_id}",
    { params: { path: { family_id: familyId, receipt_id: receiptId } } },
  );
  if (error) {
    throw new Error("delete_receipt_failed");
  }
}

export function getReceiptImageUrl(familyId: string, receiptId: string): string {
  return `${API_BASE_URL}/api/v1/families/${familyId}/receipts/${receiptId}/image`;
}
```

- [ ] **Step 5: Write the failing tests for `ReceiptUploadForm`**

Create `frontend/src/receipts/ReceiptUploadForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ReceiptUploadForm } from "./ReceiptUploadForm";
import { uploadReceipt } from "./receiptApi";

vi.mock("./receiptApi", async () => {
  const actual = await vi.importActual<typeof import("./receiptApi")>("./receiptApi");
  return { ...actual, uploadReceipt: vi.fn() };
});

describe("ReceiptUploadForm", () => {
  const onUploaded = vi.fn();

  beforeEach(() => {
    onUploaded.mockReset();
    vi.mocked(uploadReceipt).mockReset();
  });

  it("rejects an oversized file client-side without calling the API", async () => {
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const oversizedFile = new File([new Uint8Array(11 * 1024 * 1024)], "big.jpg", {
      type: "image/jpeg",
    });

    await user.upload(screen.getByLabelText("アップロード"), oversizedFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "ファイルサイズは10MB以下にしてください",
    );
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it("rejects a wrong-type file client-side without calling the API", async () => {
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const pdfFile = new File(["not an image"], "doc.pdf", { type: "application/pdf" });

    await user.upload(screen.getByLabelText("アップロード"), pdfFile);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "JPEG、PNG、HEIC形式のみアップロードできます",
    );
    expect(uploadReceipt).not.toHaveBeenCalled();
  });

  it("uploads a valid file and calls onUploaded with the result", async () => {
    vi.mocked(uploadReceipt).mockResolvedValue({
      id: "rec-1",
      family_id: "fam-1",
      uploaded_by_user_id: "u1",
      content_type: "image/jpeg",
      file_size_bytes: 1024,
      status: "upload",
      error_message: null,
      created_at: "2026-08-30T00:00:00Z",
      updated_at: "2026-08-30T00:00:00Z",
    });
    const user = userEvent.setup();
    render(<ReceiptUploadForm familyId="fam-1" onUploaded={onUploaded} />);
    const validFile = new File(["fake jpeg content"], "receipt.jpg", { type: "image/jpeg" });

    await user.upload(screen.getByLabelText("アップロード"), validFile);
    await user.click(screen.getByRole("button", { name: "アップロード" }));

    expect(uploadReceipt).toHaveBeenCalledWith("fam-1", validFile);
    expect(onUploaded).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run to confirm it fails**

```bash
pnpm run test -- ReceiptUploadForm
```
Expected: FAIL — `ReceiptUploadForm` doesn't exist yet.

- [ ] **Step 7: Create `frontend/src/receipts/ReceiptUploadForm.tsx`**

```tsx
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { uploadReceipt, validateReceiptFile, type Receipt } from "./receiptApi";

interface ReceiptUploadFormProps {
  familyId: string;
  onUploaded: (receipt: Receipt) => void;
}

export function ReceiptUploadForm({ familyId, onUploaded }: ReceiptUploadFormProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setError(null);
    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        setError(t(`receipt.${validationError}`));
        setSelectedFile(null);
        return;
      }
    }
    setSelectedFile(file);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;

    setError(null);
    setIsUploading(true);
    try {
      const receipt = await uploadReceipt(familyId, selectedFile);
      onUploaded(receipt);
      setSelectedFile(null);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "invalid_file"
          ? t("receipt.invalidFileType")
          : t("receipt.uploadFailed"),
      );
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("receipt.upload")}
        <input
          type="file"
          accept="image/jpeg,image/png,image/heic,image/heif"
          onChange={handleFileChange}
        />
      </label>
      <button type="submit" disabled={!selectedFile || isUploading}>
        {isUploading ? t("receipt.uploading") : t("receipt.upload")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 8: Run to confirm it passes**

```bash
pnpm run test -- ReceiptUploadForm
```
Expected: 3 passed.

- [ ] **Step 9: Write the failing tests for `ReceiptList`**

Create `frontend/src/receipts/ReceiptList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ReceiptList } from "./ReceiptList";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import { deleteReceipt, listReceipts } from "./receiptApi";

vi.mock("./receiptApi", async () => {
  const actual = await vi.importActual<typeof import("./receiptApi")>("./receiptApi");
  return { ...actual, listReceipts: vi.fn(), deleteReceipt: vi.fn() };
});
vi.mock("../families/familyApi", () => ({ getFamilyDetail: vi.fn() }));
vi.mock("../auth/useAuth", () => ({ useAuth: vi.fn() }));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/families/fam-1/receipts"]}>
      <Routes>
        <Route path="/families/:familyId/receipts" element={<ReceiptList />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ReceiptList", () => {
  beforeEach(() => {
    vi.mocked(listReceipts).mockReset();
    vi.mocked(deleteReceipt).mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(useAuth).mockReset();
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
        { user_id: "u2", email: "b@example.com", display_name: "Bob", role: "member" },
      ],
    });
  });

  it("shows the empty state when there are no receipts", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([]);

    renderAt();

    expect(await screen.findByText("まだレシートがありません")).toBeInTheDocument();
  });

  it("renders each receipt's status and hides delete for a non-uploader member", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([
      {
        id: "rec-1",
        family_id: "fam-1",
        uploaded_by_user_id: "u1",
        content_type: "image/jpeg",
        file_size_bytes: 1024,
        status: "processing",
        error_message: null,
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
      },
    ]);

    renderAt();

    expect(await screen.findByText("処理中")).toBeInTheDocument();
    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });

  it("shows delete for the uploader", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    vi.mocked(listReceipts).mockResolvedValue([
      {
        id: "rec-1",
        family_id: "fam-1",
        uploaded_by_user_id: "u1",
        content_type: "image/jpeg",
        file_size_bytes: 1024,
        status: "upload",
        error_message: null,
        created_at: "2026-08-30T00:00:00Z",
        updated_at: "2026-08-30T00:00:00Z",
      },
    ]);

    renderAt();

    expect(await screen.findByText("削除")).toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Run to confirm it fails**

```bash
pnpm run test -- ReceiptList
```
Expected: FAIL — `ReceiptList` doesn't exist yet.

- [ ] **Step 11: Create `frontend/src/receipts/ReceiptList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import { deleteReceipt, getReceiptImageUrl, listReceipts, type Receipt } from "./receiptApi";
import { ReceiptUploadForm } from "./ReceiptUploadForm";

function statusLabelKey(status: string): string {
  switch (status) {
    case "upload":
      return "receipt.statusUploaded";
    case "failed":
      return "receipt.statusFailed";
    default:
      return "receipt.statusProcessing";
  }
}

export function ReceiptList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;

    Promise.all([listReceipts(familyId), getFamilyDetail(familyId)])
      .then(([receiptResult, familyDetail]) => {
        if (cancelled) return;
        setReceipts(receiptResult);
        setMyRole(familyDetail.members.find((member) => member.user_id === user?.id)?.role);
      })
      .catch(() => {
        if (!cancelled) {
          setReceipts([]);
          setError(t("receipt.uploadFailed"));
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId, user?.id, t]);

  const canManage = myRole === "owner" || myRole === "admin";

  async function handleDelete(receiptId: string) {
    if (!familyId || !window.confirm(t("receipt.confirmDelete"))) return;
    setError(null);
    try {
      await deleteReceipt(familyId, receiptId);
      setReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    } catch {
      setError(t("receipt.uploadFailed"));
    }
  }

  if (isLoading || !familyId) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("receipt.myReceipts")}</h1>
      <ReceiptUploadForm
        familyId={familyId}
        onUploaded={(receipt) => setReceipts((current) => [receipt, ...current])}
      />
      {receipts.length === 0 ? (
        <p>{t("receipt.noReceipts")}</p>
      ) : (
        <ul>
          {receipts.map((receipt) => {
            const canDeleteThis = canManage || receipt.uploaded_by_user_id === user?.id;
            return (
              <li key={receipt.id}>
                <a
                  href={getReceiptImageUrl(familyId, receipt.id)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img src={getReceiptImageUrl(familyId, receipt.id)} alt="" width={80} />
                </a>
                {t(statusLabelKey(receipt.status))}
                {canDeleteThis && (
                  <button onClick={() => void handleDelete(receipt.id)}>
                    {t("receipt.delete")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 12: Run to confirm it passes**

```bash
pnpm run test -- ReceiptList
```
Expected: 3 passed.

- [ ] **Step 13: Add the route to `frontend/src/AppRoutes.tsx`**

Add the import: `import { ReceiptList } from "./receipts/ReceiptList";`

Add the route (alongside the existing `/families/:familyId/expenses` route):

```tsx
<Route
  path="/families/:familyId/receipts"
  element={
    <ProtectedRoute>
      <ReceiptList />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 14: Add a link from `frontend/src/families/FamilyDetail.tsx`**

Add, next to the existing "My Expenses" link:

```tsx
<p>
  <Link to={`/families/${familyId}/receipts`}>{t("receipt.myReceipts")}</Link>
</p>
```

- [ ] **Step 15: Run the full frontend check suite**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean.

- [ ] **Step 16: Commit**

```bash
git add frontend/src/receipts frontend/src/api/client.ts frontend/src/AppRoutes.tsx frontend/src/families/FamilyDetail.tsx frontend/src/i18n frontend/src/api/schema.gen.ts
git commit -m "feat(frontend): add receipt upload form and list"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`

- [ ] **Step 1: Extend `docs/ARCHITECTURE.md`**

Update the `## Overview` paragraph's `ocr-worker` mention to reflect what actually landed this phase — change:

> a separate `ocr-worker` (introduced in Phase 6) handles OCR/AI workloads

to:

> a separate `worker` process (this phase adds it as a generic Celery/Redis consumer; Phase 6 specializes it into the real `ocr-worker`) handles background/OCR workloads

Add a new `## Receipt Upload` section (after the existing `## Expense Domain` section):

```markdown
## Receipt Upload

Receipts are family-scoped the same way expenses are — every endpoint
depends on `get_family_membership` first. Uploaded images are validated
by real content-sniffing (`python-magic`, not the client-supplied
filename/MIME), stored in MinIO behind a small `ReceiptStorage`
interface, and served back through a backend proxy endpoint (never a
public/presigned URL) so family-membership authorization applies to
every view, not just the upload.

A `receipts` row tracks `status` as a plain string (a `ReceiptStatus`
StrEnum at the app layer, matching `FamilyRole`'s precedent) so later
phases can add new states without a migration. This phase's Celery task
(`process_receipt`, run by the new generic `worker` service) is a
deliberate stub: it only advances `UPLOAD` → `PROCESSING`, proving the
queue/worker infrastructure works end to end. Phase 6 replaces the task
body with real OpenCV/PaddleOCR/Ollama extraction and advances the state
machine further (toward `OCR_COMPLETED`/`FAILED`).

`receipts` has no FK to `expenses` in this phase — the two stay fully
independent until a later phase has parsed OCR data to reconcile against
manual expense entries.
```

- [ ] **Step 2: Extend `docs/PRODUCT_REQUIREMENTS.md`**

Add a short clarifying paragraph at the end of the existing `## Receipt OCR pipeline` section (append, don't replace):

```markdown

This phase (5) implements only the upload/storage/state-machine
mechanics described above (`UPLOAD` → `PROCESSING`) — the OpenCV →
PaddleOCR → structure-detection pipeline itself is Phase 6's job.
```

- [ ] **Step 3: Extend `docs/I18N.md`'s "Current keys" table**

Add these rows after the existing `category.*` rows:

```markdown
| `receipt.myReceipts` | レシート一覧 | Danh sách hóa đơn |
| `receipt.noReceipts` | まだレシートがありません | Chưa có hóa đơn nào |
| `receipt.upload` | アップロード | Tải lên |
| `receipt.uploading` | アップロード中... | Đang tải lên... |
| `receipt.delete` | 削除 | Xóa |
| `receipt.confirmDelete` | このレシートを削除してもよろしいですか? | Bạn có chắc muốn xóa hóa đơn này? |
| `receipt.statusUploaded` | アップロード済み | Đã tải lên |
| `receipt.statusProcessing` | 処理中 | Đang xử lý |
| `receipt.statusFailed` | 失敗 | Thất bại |
| `receipt.invalidFileType` | JPEG、PNG、HEIC形式のみアップロードできます | Chỉ chấp nhận định dạng JPEG, PNG, HEIC |
| `receipt.fileTooLarge` | ファイルサイズは10MB以下にしてください | Kích thước tệp phải nhỏ hơn 10MB |
| `receipt.uploadFailed` | エラーが発生しました。もう一度お試しください | Đã xảy ra lỗi. Vui lòng thử lại |
```

Add this to the "Terminology glossary" table:

```markdown
| Receipt | レシート | Hóa đơn |
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/PRODUCT_REQUIREMENTS.md docs/I18N.md
git commit -m "docs: document receipt upload architecture and i18n keys"
```

---

## After all tasks: branch-level verification

- [ ] Run the full check suite from a clean state:

```bash
docker compose down -v
docker compose up -d --build
cd backend && uv run alembic upgrade head && uv run pytest && cd ..
cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && cd ..
```

- [ ] Manually verify end-to-end: log in, go to a family's receipts page,
  upload a real JPEG photo, confirm it appears with status "Uploaded"
  and (after a manual refresh) "Processing"; try uploading a PDF or an
  oversized file and confirm a clear rejection message; as a plain
  MEMBER viewing another member's receipt, confirm no delete button
  renders for it (but does for your own); confirm the receipt's image
  actually displays.
- [ ] Confirm `git status` is clean and all commits are on
  `feature/receipt-upload`.
- [ ] Proceed to `superpowers:finishing-a-development-branch`.
