# Project Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a runnable, tested, CI-checked full-stack skeleton (FastAPI backend + Vite/React frontend + Postgres + Redis) with working i18n (ja/vi) and an automated backend→frontend type-sharing mechanism, with zero domain logic yet.

**Architecture:** A plain-folder monorepo (`/backend`, `/frontend`, `/openapi`, `/docs`) wired together by a root `docker-compose.yml`. The backend exports its OpenAPI schema to a committed file; the frontend generates TypeScript types from that file. CI regenerates both the schema and the generated types on every push and fails if either has drifted from what's committed.

**Tech Stack:** Python 3.12 + FastAPI + SQLAlchemy 2.0 (async, `psycopg` v3 driver) + Alembic + structlog + Celery/Redis (infra only) managed with `uv`; Vite + React 18 + TypeScript + react-i18next managed with `pnpm`; PostgreSQL 16; GitHub Actions CI.

**Spec:** `docs/superpowers/specs/2026-08-23-project-foundation-design.md`

## Global Constraints

- Backend language/framework: Python + FastAPI. Package manager: `uv`.
- ORM/migrations: SQLAlchemy 2.0 (async) + Alembic. DB: PostgreSQL. Driver: `psycopg` v3 (`postgresql+psycopg://`), used for both sync (Alembic) and async (app) connections — one driver, no dual-driver split.
- Frontend: Vite + React + TypeScript. Package manager: `pnpm`. i18n: `react-i18next`.
- Repo layout: plain-folder monorepo, no Nx/Turborepo.
- Type sharing: backend exports OpenAPI schema to `openapi/openapi.json` (committed); frontend generates `frontend/src/api/schema.gen.ts` from it via `openapi-typescript` (also committed). CI fails on drift in either generated artifact.
- No hardcoded user-facing strings in the frontend — everything goes through `react-i18next` with keys in `frontend/src/i18n/locales/{ja,vi}/common.json`, both languages updated together.
- Non-goals for this phase (do not implement): authentication, any domain tables beyond the empty Alembic baseline, the `ocr-worker` service, Celery tasks, browser/e2e tests.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  pyproject.toml
  app/
    __init__.py
    core/
      __init__.py
      config.py
      logging.py
    db/
      __init__.py
      base.py
      session.py
    api/
      __init__.py
      v1/
        __init__.py
        router.py
        ping.py
      health.py
    main.py
  alembic.ini
  alembic/
    env.py
    script.py.mako
    versions/
      0001_baseline.py
  scripts/
    export_openapi.py
  tests/
    conftest.py
    test_config.py
    test_logging.py
    test_session.py
    test_api.py
    test_export_openapi.py
  Dockerfile
frontend/
  package.json
  tsconfig.json
  vite.config.ts
  index.html
  src/
    main.tsx
    App.tsx
    App.test.tsx
    setupTests.ts
    i18n/
      i18n.ts
      locales/
        ja/common.json
        vi/common.json
    components/
      LanguageSwitcher.tsx
    api/
      client.ts
      schema.gen.ts
  Dockerfile
openapi/
  openapi.json
docs/
  ARCHITECTURE.md
  PRODUCT_REQUIREMENTS.md
  I18N.md
docker-compose.yml
.env.example
.github/workflows/ci.yml
```

---

### Task 1: Backend scaffold & settings

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/__init__.py`, `backend/app/core/__init__.py`, `backend/app/core/config.py`
- Test: `backend/tests/conftest.py`, `backend/tests/test_config.py`

**Interfaces:**
- Produces: `app.core.config.Settings` (pydantic-settings model with fields `env: str`, `database_url: str`, `redis_url: str`, `cors_origins: list[str]`), `app.core.config.get_settings() -> Settings` (lru-cached factory).

- [ ] **Step 1: Create the backend package layout and `pyproject.toml`**

```bash
mkdir -p backend/app/core backend/app/db backend/app/api/v1 backend/tests backend/scripts backend/alembic/versions
touch backend/app/__init__.py backend/app/core/__init__.py backend/app/db/__init__.py backend/app/api/__init__.py backend/app/api/v1/__init__.py
```

Create `backend/pyproject.toml`:

```toml
[project]
name = "family-expense-backend"
version = "0.1.0"
requires-python = ">=3.12"
dependencies = [
  "fastapi>=0.115,<1.0",
  "uvicorn[standard]>=0.30,<1.0",
  "pydantic-settings>=2.4,<3.0",
  "sqlalchemy>=2.0,<3.0",
  "alembic>=1.13,<2.0",
  "psycopg[binary]>=3.2,<4.0",
  "structlog>=24.4,<25.0",
  "celery>=5.4,<6.0",
  "redis>=5.0,<6.0",
]

[project.optional-dependencies]
dev = [
  "ruff>=0.6,<1.0",
  "mypy>=1.11,<2.0",
  "pytest>=8.3,<9.0",
  "pytest-asyncio>=0.24,<1.0",
  "httpx>=0.27,<1.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["app"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.mypy]
python_version = "3.12"
strict = true
ignore_missing_imports = true

[tool.pytest.ini_options]
asyncio_mode = "auto"
pythonpath = ["."]
markers = ["integration: requires postgres/redis running (docker compose up -d postgres redis)"]
```

`pythonpath = ["."]` ensures `backend/` itself is on `sys.path` during test collection, so `import scripts.export_openapi` (Task 6) resolves correctly regardless of pytest's import-mode package-root detection.

- [ ] **Step 2: Write `backend/tests/conftest.py` so tests don't need a real `.env`**

```python
import os


def pytest_configure() -> None:
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/family_expense_test",
    )
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
```

- [ ] **Step 3: Write the failing test for `Settings`**

Create `backend/tests/test_config.py`:

```python
import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_settings_loads_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.database_url == "postgresql+psycopg://u:p@localhost:5432/db"
    assert settings.redis_url == "redis://localhost:6379/0"
    assert settings.env == "development"
    assert settings.cors_origins == ["http://localhost:5173"]


def test_settings_raises_when_database_url_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)
```

- [ ] **Step 4: Run the test to confirm it fails**

```bash
cd backend && uv sync --extra dev && uv run pytest tests/test_config.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.config'`.

- [ ] **Step 5: Implement `app/core/config.py`**

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    env: str = "development"
    database_url: str
    redis_url: str
    cors_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 6: Run the test to confirm it passes**

```bash
uv run pytest tests/test_config.py -v
```
Expected: 2 passed.

- [ ] **Step 7: Commit**

```bash
git add backend/pyproject.toml backend/app backend/tests
git commit -m "feat(backend): add project scaffold and env-based settings"
```

---

### Task 2: Structured logging

**Files:**
- Create: `backend/app/core/logging.py`
- Test: `backend/tests/test_logging.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`
- Produces: `app.core.logging.configure_logging() -> None`, `app.core.logging.get_logger(name: str) -> structlog.typing.FilteringBoundLogger`

- [ ] **Step 1: Add the dependency and write the failing test**

`structlog` is already declared in `pyproject.toml` (Task 1). Create `backend/tests/test_logging.py`:

```python
import structlog

from app.core.logging import configure_logging, get_logger


def test_get_logger_returns_bound_logger_and_does_not_raise(
    capsys: object,
) -> None:
    configure_logging()
    logger = get_logger("test.logger")

    logger.info("hello", key="value")

    captured = capsys.readouterr()  # type: ignore[attr-defined]
    assert "hello" in captured.out


def test_configure_logging_is_idempotent() -> None:
    configure_logging()
    configure_logging()
    assert structlog.is_configured()
```

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_logging.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.logging'`.

- [ ] **Step 3: Implement `app/core/logging.py`**

```python
import logging

import structlog

from app.core.config import get_settings


def configure_logging() -> None:
    settings = get_settings()
    shared_processors = [
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
    ]
    renderer = (
        structlog.processors.JSONRenderer()
        if settings.env == "production"
        else structlog.dev.ConsoleRenderer()
    )

    structlog.configure(
        processors=[*shared_processors, renderer],
        wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str) -> structlog.typing.FilteringBoundLogger:
    return structlog.get_logger(name)
```

- [ ] **Step 4: Run to confirm it passes**

```bash
uv run pytest tests/test_logging.py -v
```
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/logging.py backend/tests/test_logging.py
git commit -m "feat(backend): add structured logging via structlog"
```

---

### Task 3: Database engine & session

**Files:**
- Create: `backend/app/db/base.py`, `backend/app/db/session.py`
- Test: `backend/tests/test_session.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`
- Produces: `app.db.base.Base` (declarative base), `app.db.session.get_engine() -> AsyncEngine`, `app.db.session.get_session_factory() -> async_sessionmaker[AsyncSession]`, `app.db.session.get_session() -> AsyncGenerator[AsyncSession, None]` (FastAPI dependency)

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_session.py`:

```python
from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.session import get_engine, get_session_factory


def test_get_engine_returns_async_engine_with_configured_url() -> None:
    engine = get_engine()

    assert isinstance(engine, AsyncEngine)
    assert engine.url.drivername == "postgresql+psycopg"


def test_get_engine_is_cached() -> None:
    assert get_engine() is get_engine()


def test_get_session_factory_is_bound_to_the_engine() -> None:
    factory = get_session_factory()

    assert factory.kw["bind"] is get_engine()
```

These do not require a live database — `create_async_engine` is lazy and only opens a connection on first use.

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_session.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.db.session'`.

- [ ] **Step 3: Implement `app/db/base.py`**

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 4: Implement `app/db/session.py`**

```python
from collections.abc import AsyncGenerator
from functools import lru_cache

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.core.config import get_settings


@lru_cache
def get_engine() -> AsyncEngine:
    settings = get_settings()
    return create_async_engine(settings.database_url, pool_pre_ping=True)


@lru_cache
def get_session_factory() -> async_sessionmaker[AsyncSession]:
    return async_sessionmaker(get_engine(), expire_on_commit=False)


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with get_session_factory()() as session:
        yield session
```

- [ ] **Step 5: Run to confirm it passes**

```bash
uv run pytest tests/test_session.py -v
```
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add backend/app/db
git commit -m "feat(backend): add async SQLAlchemy engine and session factory"
```

---

### Task 4: Alembic migration harness

**Files:**
- Create: `backend/alembic.ini`, `backend/alembic/env.py`, `backend/alembic/script.py.mako`, `backend/alembic/versions/0001_baseline.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`, `app.db.base.Base`
- Produces: a runnable `alembic upgrade head` that creates the `alembic_version` table only (no domain tables yet).

- [ ] **Step 1: Create `backend/alembic.ini`**

```ini
[alembic]
script_location = alembic
prepend_sys_path = .

[loggers]
keys = root,sqlalchemy,alembic

[handlers]
keys = console

[formatters]
keys = generic

[logger_root]
level = WARNING
handlers = console
qualname =

[logger_sqlalchemy]
level = WARNING
handlers =
qualname = sqlalchemy.engine

[logger_alembic]
level = INFO
handlers =
qualname = alembic

[handler_console]
class = StreamHandler
args = (sys.stderr,)
level = NOTSET
formatter = generic

[formatter_generic]
format = %(levelname)-5.5s [%(name)s] %(message)s
```

- [ ] **Step 2: Create `backend/alembic/env.py`**

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

config.set_main_option("sqlalchemy.url", get_settings().database_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
```

- [ ] **Step 3: Create `backend/alembic/script.py.mako`**

```mako
"""${message}

Revision ID: ${up_revision}
Revises: ${down_revision | comma,n}
Create Date: ${create_date}

"""
from alembic import op
import sqlalchemy as sa
${imports if imports else ""}

revision = ${repr(up_revision)}
down_revision = ${repr(down_revision)}
branch_labels = ${repr(branch_labels)}
depends_on = ${repr(depends_on)}


def upgrade() -> None:
    ${upgrades if upgrades else "pass"}


def downgrade() -> None:
    ${downgrades if downgrades else "pass"}
```

- [ ] **Step 4: Create the empty baseline revision `backend/alembic/versions/0001_baseline.py`**

```python
"""baseline

Revision ID: 0001
Revises:
Create Date: 2026-08-23

"""
from alembic import op
import sqlalchemy as sa

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
```

- [ ] **Step 5: Verify migrations run against a real database**

```bash
docker compose up -d postgres
cd backend
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/family_expense uv run alembic upgrade head
DATABASE_URL=postgresql+psycopg://postgres:postgres@localhost:5432/family_expense uv run alembic current
```
Expected: second command prints `0001 (head)`, and connecting to the `family_expense` DB shows an `alembic_version` table with no other tables.

(`docker compose` isn't available until Task 7 creates `docker-compose.yml` — if running tasks in order, come back to this verification step after Task 7, or run a one-off `docker run -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=family_expense -p 5432:5432 -d postgres:16-alpine` instead.)

- [ ] **Step 6: Commit**

```bash
git add backend/alembic.ini backend/alembic
git commit -m "feat(backend): add Alembic migration harness with empty baseline"
```

---

### Task 5: FastAPI app, health & ping endpoints, Dockerfile

**Files:**
- Create: `backend/app/main.py`, `backend/app/api/health.py`, `backend/app/api/v1/ping.py`, `backend/app/api/v1/router.py`, `backend/Dockerfile`
- Test: `backend/tests/test_api.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`, `app.core.logging.configure_logging`, `app.db.session.get_session_factory`
- Produces: `app.main.app` (the FastAPI instance, importable by `scripts/export_openapi.py` and by Docker/uvicorn), routes `GET /health` and `GET /api/v1/ping`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_api.py`:

```python
import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
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
```

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_api.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.main'`.

- [ ] **Step 3: Implement `app/api/health.py`**

```python
from fastapi import APIRouter
from sqlalchemy import text

from app.db.session import get_session_factory

router = APIRouter()


@router.get("/health")
async def health_check() -> dict[str, str]:
    session_factory = get_session_factory()
    async with session_factory() as session:
        await session.execute(text("SELECT 1"))
    return {"status": "ok"}
```

- [ ] **Step 4: Implement `app/api/v1/ping.py`**

```python
from fastapi import APIRouter

router = APIRouter()


@router.get("/ping")
async def ping() -> dict[str, str]:
    return {"status": "ok", "message": "pong"}
```

- [ ] **Step 5: Implement `app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import ping

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
```

- [ ] **Step 6: Implement `app/main.py`**

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import health
from app.api.v1.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging


def create_app() -> FastAPI:
    configure_logging()
    settings = get_settings()
    fastapi_app = FastAPI(title="Family Expense Management API")

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    fastapi_app.include_router(health.router)
    fastapi_app.include_router(api_router, prefix="/api/v1")

    return fastapi_app


app = create_app()
```

- [ ] **Step 7: Run to confirm the unit test passes (skip the integration one for now)**

```bash
uv run pytest tests/test_api.py -v -m "not integration"
```
Expected: 1 passed, 1 deselected.

- [ ] **Step 8: Run the integration test against a real database**

```bash
docker run -d --rm --name fem-pg -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=family_expense_test -p 5432:5432 postgres:16-alpine
sleep 3
uv run pytest tests/test_api.py -v -m integration
docker stop fem-pg
```
Expected: 1 passed.

- [ ] **Step 9: Write `backend/Dockerfile`**

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv sync --no-install-project

COPY . .
RUN uv sync

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

- [ ] **Step 10: Commit**

```bash
git add backend/app/main.py backend/app/api backend/tests/test_api.py backend/Dockerfile
git commit -m "feat(backend): add FastAPI app with health and ping endpoints"
```

---

### Task 6: OpenAPI export script

**Files:**
- Create: `backend/scripts/export_openapi.py`, `backend/scripts/__init__.py`
- Test: `backend/tests/test_export_openapi.py`

**Interfaces:**
- Consumes: `app.main.app`
- Produces: `export_openapi_schema() -> dict`, writes `openapi/openapi.json` at the repo root when run as a script.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_export_openapi.py`:

```python
from scripts.export_openapi import export_openapi_schema


def test_export_openapi_schema_includes_expected_paths() -> None:
    schema = export_openapi_schema()

    assert "/health" in schema["paths"]
    assert "/api/v1/ping" in schema["paths"]
```

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_export_openapi.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'scripts'`.

- [ ] **Step 3: Implement `backend/scripts/export_openapi.py`**

```python
import json
from pathlib import Path

from app.main import app

OUTPUT_PATH = Path(__file__).resolve().parents[2] / "openapi" / "openapi.json"


def export_openapi_schema() -> dict:
    return app.openapi()


def main() -> None:
    schema = export_openapi_schema()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(schema, indent=2, sort_keys=True) + "\n")


if __name__ == "__main__":
    main()
```

Add an empty `backend/scripts/__init__.py` so `scripts` is importable as a package from tests:

```bash
touch backend/scripts/__init__.py
```

- [ ] **Step 4: Run to confirm it passes**

```bash
uv run pytest tests/test_export_openapi.py -v
```
Expected: 1 passed.

- [ ] **Step 5: Generate the committed schema file**

```bash
mkdir -p ../openapi
uv run python scripts/export_openapi.py
cat ../openapi/openapi.json | head -5
```
Expected: valid JSON starting with `{`.

- [ ] **Step 6: Commit**

```bash
git add backend/scripts openapi/openapi.json
git commit -m "feat(backend): add OpenAPI schema export script"
```

---

### Task 7: Root docker-compose.yml and .env.example

**Files:**
- Create: `docker-compose.yml`, `.env.example`

**Interfaces:**
- Produces: local dev environment (`postgres`, `redis`, `backend`, `frontend` services).

- [ ] **Step 1: Create `.env.example`**

```
ENV=development
DATABASE_URL=postgresql+psycopg://postgres:postgres@postgres:5432/family_expense
REDIS_URL=redis://redis:6379/0
CORS_ORIGINS=["http://localhost:5173"]
VITE_API_BASE_URL=http://localhost:8000
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: family_expense
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
    env_file:
      - .env
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
    env_file:
      - .env
    ports:
      - "5173:5173"
    volumes:
      - ./frontend:/app
      - /app/node_modules
    depends_on:
      - backend

volumes:
  postgres_data:
```

- [ ] **Step 3: Verify the compose file is valid**

```bash
cp .env.example .env
docker compose config --quiet
```
Expected: no output, exit code 0.

- [ ] **Step 4: Bring up the data services and re-run Task 4's migration verification**

```bash
docker compose up -d postgres redis
cd backend && uv run alembic upgrade head && uv run alembic current
```
Expected: `0001 (head)`.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(infra): add docker-compose for postgres, redis, backend, frontend"
```

Note: `.env` itself is gitignored (Task 0 `.gitignore` already excludes it) — only `.env.example` is committed.

---

### Task 8: Frontend scaffold

**Files:**
- Create: `frontend/package.json`, `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/setupTests.ts`, `frontend/Dockerfile`

**Interfaces:**
- Produces: a running Vite dev server serving a minimal `App` component; `pnpm run lint|typecheck|test|build` all pass.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "family-expense-frontend",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --max-warnings 0",
    "test": "vitest run",
    "generate:api-types": "openapi-typescript ../openapi/openapi.json -o src/api/schema.gen.ts"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "i18next": "^23.15.1",
    "react-i18next": "^15.0.2",
    "i18next-browser-languagedetector": "^8.0.0",
    "openapi-fetch": "^0.13.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.5",
    "@types/react-dom": "^18.3.0",
    "@typescript-eslint/eslint-plugin": "^8.5.0",
    "@typescript-eslint/parser": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.1",
    "eslint": "^9.10.0",
    "eslint-config-prettier": "^9.1.0",
    "eslint-plugin-react-hooks": "^4.6.2",
    "eslint-plugin-react-refresh": "^0.4.11",
    "jsdom": "^25.0.0",
    "openapi-typescript": "^7.4.0",
    "prettier": "^3.3.3",
    "typescript": "^5.5.4",
    "vite": "^5.4.6",
    "vitest": "^2.1.1"
  }
}
```

- [ ] **Step 2: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `frontend/vite.config.ts`**

```ts
/// <reference types="vitest" />
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  envDir: path.resolve(__dirname, ".."),
  server: {
    host: true,
    port: 5173,
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/setupTests.ts",
  },
});
```

- [ ] **Step 4: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="ja">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Family Expense Management</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 5: Create a minimal `frontend/src/App.tsx` (extended in Tasks 9 and 11)**

```tsx
export default function App() {
  return <main>Family Expense Management</main>;
}
```

- [ ] **Step 6: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 7: Create `frontend/src/setupTests.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 8: Write the smoke test `frontend/src/App.test.tsx`**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import App from "./App";

describe("App", () => {
  it("renders without crashing", () => {
    render(<App />);

    expect(screen.getByText("Family Expense Management")).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Install dependencies and run all checks**

```bash
cd frontend
pnpm install
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: typecheck passes with no errors, 1 test passes, build succeeds.

- [ ] **Step 10: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9 --activate

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile || pnpm install

COPY . .

EXPOSE 5173

CMD ["pnpm", "run", "dev", "--", "--host"]
```

- [ ] **Step 11: Commit**

```bash
git add frontend
git commit -m "feat(frontend): add Vite + React + TypeScript scaffold"
```

---

### Task 9: Frontend i18n (Vietnamese + Japanese)

**Files:**
- Create: `frontend/src/i18n/i18n.ts`, `frontend/src/i18n/locales/ja/common.json`, `frontend/src/i18n/locales/vi/common.json`, `frontend/src/components/LanguageSwitcher.tsx`
- Modify: `frontend/src/main.tsx`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: nothing new
- Produces: `SUPPORTED_LANGUAGES`, `SupportedLanguage` (exported from `src/i18n/i18n.ts`), `LanguageSwitcher` component; translation keys `app.title`, `common.loading`, `common.language`, `ping.success`, `ping.failure`.

- [ ] **Step 1: Create the locale files**

`frontend/src/i18n/locales/ja/common.json`:

```json
{
  "app": { "title": "家計簿" },
  "common": { "loading": "読み込み中...", "language": "言語" },
  "ping": {
    "success": "サーバーに接続しました",
    "failure": "サーバーに接続できませんでした"
  }
}
```

`frontend/src/i18n/locales/vi/common.json`:

```json
{
  "app": { "title": "Quản lý chi tiêu gia đình" },
  "common": { "loading": "Đang tải...", "language": "Ngôn ngữ" },
  "ping": {
    "success": "Đã kết nối với máy chủ",
    "failure": "Không thể kết nối với máy chủ"
  }
}
```

- [ ] **Step 2: Create `frontend/src/i18n/i18n.ts`**

```ts
import i18n from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";

import commonJa from "./locales/ja/common.json";
import commonVi from "./locales/vi/common.json";

export const SUPPORTED_LANGUAGES = ["ja", "vi"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      ja: { common: commonJa },
      vi: { common: commonVi },
    },
    fallbackLng: "ja",
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: "common",
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "family_expense_language",
    },
    interpolation: { escapeValue: false },
  });

export default i18n;
```

- [ ] **Step 3: Wire i18n into `frontend/src/main.tsx`**

Add `import "./i18n/i18n";` as the first import in `frontend/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./i18n/i18n";
import App from "./App";

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Create `frontend/src/components/LanguageSwitcher.tsx`**

```tsx
import { useTranslation } from "react-i18next";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/i18n";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  ja: "日本語",
  vi: "Tiếng Việt",
};

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();

  return (
    <label>
      {t("common.language")}:{" "}
      <select
        value={i18n.language}
        onChange={(event) => {
          void i18n.changeLanguage(event.target.value as SupportedLanguage);
        }}
      >
        {SUPPORTED_LANGUAGES.map((lang) => (
          <option key={lang} value={lang}>
            {LANGUAGE_LABELS[lang]}
          </option>
        ))}
      </select>
    </label>
  );
}
```

- [ ] **Step 5: Write the failing test for translated rendering and switching**

Replace `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import userEvent from "@testing-library/user-event";
import "./i18n/i18n";
import App from "./App";

describe("App", () => {
  it("renders the title in the default (Japanese) language", () => {
    render(<App />);

    expect(screen.getByText("家計簿")).toBeInTheDocument();
  });

  it("switches to Vietnamese when selected", async () => {
    render(<App />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox"), "vi");

    expect(await screen.findByText("Quản lý chi tiêu gia đình")).toBeInTheDocument();
  });
});
```

Add the `@testing-library/user-event` dev dependency:

```bash
cd frontend && pnpm add -D @testing-library/user-event
```

- [ ] **Step 6: Update `frontend/src/App.tsx` to use translations and the switcher**

```tsx
import { useTranslation } from "react-i18next";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

export default function App() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <LanguageSwitcher />
    </main>
  );
}
```

- [ ] **Step 7: Run the tests**

```bash
pnpm run test
```
Expected: 2 passed.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/i18n frontend/src/components frontend/src/main.tsx frontend/src/App.tsx frontend/src/App.test.tsx frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(frontend): add react-i18next with ja/vi locales and language switcher"
```

---

### Task 10: Frontend API type codegen wiring

**Files:**
- Create: `frontend/src/api/client.ts`, `frontend/src/api/schema.gen.ts` (generated)

**Interfaces:**
- Consumes: `openapi/openapi.json` (produced in Task 6)
- Produces: `apiClient` (typed `openapi-fetch` client, exported from `frontend/src/api/client.ts`), `paths` type (generated in `schema.gen.ts`)

- [ ] **Step 1: Generate the TypeScript types from the committed OpenAPI schema**

```bash
cd frontend
pnpm run generate:api-types
head -20 src/api/schema.gen.ts
```
Expected: a generated `paths` interface including `"/health"` and `"/api/v1/ping"`.

- [ ] **Step 2: Create `frontend/src/api/client.ts`**

```ts
import createClient from "openapi-fetch";
import type { paths } from "./schema.gen";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL });
```

- [ ] **Step 3: Verify the generated file and client type-check together**

```bash
pnpm run typecheck
```
Expected: passes with no errors.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/api
git commit -m "feat(frontend): wire OpenAPI-generated types and typed API client"
```

---

### Task 11: Home page wiring (ping call + translated status)

**Files:**
- Modify: `frontend/src/App.tsx`, `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `apiClient` from `frontend/src/api/client.ts`
- Produces: a visible ping status (`common.loading` → `ping.success`/`ping.failure`) on the home page.

- [ ] **Step 1: Write the failing tests (mocking the API client)**

Update `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n/i18n";
import App from "./App";

const getMock = vi.fn();

vi.mock("./api/client", () => ({
  apiClient: { GET: (...args: unknown[]) => getMock(...args) },
}));

describe("App", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("renders the title in the default (Japanese) language", async () => {
    getMock.mockResolvedValue({ data: { status: "ok", message: "pong" }, error: undefined });
    render(<App />);

    expect(screen.getByText("家計簿")).toBeInTheDocument();
    expect(await screen.findByText("サーバーに接続しました")).toBeInTheDocument();
  });

  it("switches to Vietnamese when selected", async () => {
    getMock.mockResolvedValue({ data: { status: "ok", message: "pong" }, error: undefined });
    render(<App />);
    const user = userEvent.setup();

    await user.selectOptions(screen.getByRole("combobox"), "vi");

    expect(await screen.findByText("Quản lý chi tiêu gia đình")).toBeInTheDocument();
  });

  it("shows a failure message when the ping call errors", async () => {
    getMock.mockResolvedValue({ data: undefined, error: { detail: "boom" } });
    render(<App />);

    expect(await screen.findByText("サーバーに接続できませんでした")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm the new/changed tests fail**

```bash
pnpm run test
```
Expected: FAIL — status text never appears (App doesn't call the API yet).

- [ ] **Step 3: Update `frontend/src/App.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "./api/client";
import { LanguageSwitcher } from "./components/LanguageSwitcher";

type PingStatus = "loading" | "success" | "failure";

export default function App() {
  const { t } = useTranslation();
  const [status, setStatus] = useState<PingStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    apiClient.GET("/api/v1/ping").then(({ data, error }) => {
      if (cancelled) return;
      setStatus(data && !error ? "success" : "failure");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main>
      <h1>{t("app.title")}</h1>
      <LanguageSwitcher />
      <p>
        {status === "loading" && t("common.loading")}
        {status === "success" && t("ping.success")}
        {status === "failure" && t("ping.failure")}
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Run to confirm the tests pass**

```bash
pnpm run test
```
Expected: 3 passed.

- [ ] **Step 5: Manual end-to-end check**

```bash
cd .. && docker compose up -d
```
Open `http://localhost:5173` — expect to see "家計簿", the language switcher, and "サーバーに接続しました" after the ping resolves; switching to Vietnamese re-renders all three in Vietnamese.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/App.test.tsx
git commit -m "feat(frontend): call backend ping endpoint and show translated status"
```

---

### Task 12: GitHub Actions CI

**Files:**
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: `backend/pyproject.toml`, `backend/scripts/export_openapi.py`, `frontend/package.json`, `frontend/src/api/schema.gen.ts`, `openapi/openapi.json`

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  backend:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: family_expense_test
        ports: ["5432:5432"]
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
      redis:
        image: redis:7-alpine
        ports: ["6379:6379"]
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 5
    env:
      DATABASE_URL: postgresql+psycopg://postgres:postgres@localhost:5432/family_expense_test
      REDIS_URL: redis://localhost:6379/0
    defaults:
      run:
        working-directory: backend
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v3
      - run: uv sync --extra dev
      - run: uv run ruff check .
      - run: uv run mypy app
      - run: uv run alembic upgrade head
      - run: uv run pytest
      - run: uv run python scripts/export_openapi.py
      - name: Check OpenAPI schema is committed and up to date
        run: git diff --exit-code -- ../openapi/openapi.json
      - uses: actions/upload-artifact@v4
        with:
          name: openapi-schema
          path: openapi/openapi.json

  frontend:
    runs-on: ubuntu-latest
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
      - run: pnpm run lint
      - run: pnpm run typecheck
      - run: pnpm run generate:api-types
      - name: Check generated API types are committed and up to date
        run: git diff --exit-code -- src/api/schema.gen.ts
      - run: pnpm run test
      - run: pnpm run build
```

- [ ] **Step 2: Verify the workflow YAML is well-formed**

```bash
python3 -c "import yaml, sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"
```
Expected: prints `ok`. (If `pyyaml` isn't available locally, this gets verified for real on the first push anyway — proceed either way.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for backend and frontend"
```

---

### Task 13: Documentation

**Files:**
- Modify: `README.md`
- Create: `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`

- [ ] **Step 1: Rewrite `README.md`**

```markdown
# Family Expense Management

A multi-language (Vietnamese / Japanese) family expense management system:
receipt OCR, personal/shared expense classification, and settlement
calculation.

## Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, Celery/Redis
- Frontend: Vite, React, TypeScript, react-i18next
- See `docs/ARCHITECTURE.md` for the full rationale.

## Local development

```bash
cp .env.example .env
docker compose up -d
```

- Backend: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:5173

## Backend

```bash
cd backend
uv sync --extra dev
uv run pytest                  # unit tests only need `uv sync`
uv run pytest -m integration   # requires: docker compose up -d postgres redis
uv run alembic upgrade head
uv run python scripts/export_openapi.py   # regenerate openapi/openapi.json
```

## Frontend

```bash
cd frontend
pnpm install
pnpm run dev
pnpm run test
pnpm run generate:api-types    # regenerate src/api/schema.gen.ts from openapi/openapi.json
```

## Documentation

- `docs/ARCHITECTURE.md` — system architecture and stack decisions
- `docs/PRODUCT_REQUIREMENTS.md` — product/domain requirements
- `docs/I18N.md` — i18n architecture and JA/VI terminology glossary
```

- [ ] **Step 2: Create `docs/ARCHITECTURE.md`**

```markdown
# Architecture

## Overview

A modular monolith: one FastAPI backend owns auth, family, expense, and
settlement domains; a separate `ocr-worker` (introduced in Phase 6) handles
OCR/AI workloads, since those have very different resource and scaling
characteristics from normal API traffic. A Vite/React SPA is the only
frontend client for now.

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Backend | Python + FastAPI | OCR stack (OpenCV/PaddleOCR/Ollama) is Python-native; sharing a language with the future OCR worker simplifies ops. |
| DB | PostgreSQL | Rich constraint/transaction support needed for financial invariants (`sum(allocations) == source amount`). |
| ORM | SQLAlchemy 2.0 (async) + Alembic | Explicit control over schema and constraints; versioned migrations. |
| DB driver | `psycopg` v3 | Single driver for both sync (Alembic) and async (app) connections. |
| Background jobs | Redis + Celery | Standard, well-documented retry/failure handling; fits the receipt processing state machine (UPLOAD → PROCESSING → ... → CONFIRMED). |
| Frontend | Vite + React + TypeScript | No SSR/SEO need (authenticated app); fast dev server. |
| Frontend i18n | react-i18next | Namespaced JSON translation files map directly onto the stable, semantic key architecture required for JA/VI. |
| Repo layout | Plain-folder monorepo | Backend is Python, frontend is separate anyway — a JS-focused monorepo tool (Nx/Turborepo) buys little here. |

## Type sharing between backend and frontend

1. `backend/scripts/export_openapi.py` writes the FastAPI app's OpenAPI
   schema to `openapi/openapi.json` (committed, single source of truth).
2. `frontend`'s `pnpm run generate:api-types` runs `openapi-typescript`
   against that file, emitting `frontend/src/api/schema.gen.ts` (also
   committed).
3. CI regenerates both files on every push and fails if either differs
   from what's committed — a backend response-shape change without a
   matching frontend type regen is a CI failure, not a runtime bug found
   later.

## Repository layout

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations
frontend/   Vite + React + TypeScript SPA
openapi/    Generated, committed OpenAPI schema (source of truth for types)
docs/       Architecture, product requirements, i18n glossary
```

## Local environment

`docker-compose.yml` runs `postgres`, `redis`, `backend`, `frontend` for
local development. Configuration is environment-variable driven
(`.env`, copied from `.env.example`); the backend fails fast at startup if
a required variable is missing.
```

- [ ] **Step 3: Create `docs/PRODUCT_REQUIREMENTS.md`**

```markdown
# Product Requirements

Condensed from the full product specification. This is the working
reference for domain decisions in later phases (auth, family, expense,
OCR, settlement) — update it as those phases land.

## Core workflow

Buy → photograph receipt → OCR extracts items/prices/quantities/tax →
system suggests category and PERSONAL/SHARED → user reviews and corrects →
system records payer → shared expenses are allocated among members →
balances are calculated → settlement is generated.

## Family model

A family has members with roles (`OWNER`, `ADMIN`, `MEMBER`). All access is
family-scoped — a member never sees another family's data.

## Expense model

Each receipt has line items; each item is either `PERSONAL` or `SHARED`.
**Payer and responsibility are separate concepts**: whoever pays for a
receipt is not automatically responsible for its full cost — shared items
are allocated across members regardless of who paid.

## Shared allocation

Supported allocation strategies: equal split, selected members, percentage,
exact amount, personal (no split). All money is integer-valued (no floats)
and every allocation must reconcile exactly:
`sum(all allocations) === source amount`, with a documented deterministic
rounding rule (e.g. ¥100 / 3 → ¥34/¥33/¥33).

## Settlement

`net_balance = paid_for_shared - responsibility_for_shared`. Positive means
the member should receive money; negative means they owe money. Personal
expenses never affect settlement. The settlement algorithm should minimize
the number of transfers needed.

## Receipt OCR pipeline

Image → OpenCV preprocessing → receipt detection/perspective correction →
OCR → bounding boxes → normalization → structure detection → item/price/
quantity/tax extraction → subtotal/total validation → category/PERSONAL-
SHARED suggestion → human review. Must run as background processing
(state machine: `UPLOAD → PROCESSING → OCR_COMPLETED → PARSED →
NEEDS_REVIEW → CONFIRMED → FAILED`), never blocking the upload request.
Raw OCR output, parsed values, and user-confirmed values are kept as three
distinct, never-overwritten layers.

## Zero-cost AI constraint

No paid AI/OCR API (OpenAI, Anthropic, Google Vision, AWS Textract, etc.)
in the primary implementation. Preferred stack: OpenCV + PaddleOCR + Ollama
(local LLM), behind interfaces that would allow a paid provider to be
swapped in later without changing calling code.

## Internationalization

Vietnamese and Japanese are supported from the start, not retrofitted.
Every user-facing string goes through a translation key (see
`docs/I18N.md`); both languages are updated together for every
user-facing change.

## Security

Family-scoped authorization, file/MIME/size validation for uploaded
receipt images, secure storage, standard web app protections (SQLi, rate
limiting, safe error messages).

## Non-goals for the current phase

Everything above is the target end state. The `project-foundation` phase
implements none of this domain logic — it only builds the infrastructure
(backend/frontend skeleton, DB connection, i18n plumbing, CI) these later
phases will build on.
```

- [ ] **Step 4: Create `docs/I18N.md`**

```markdown
# Internationalization (i18n)

## Rules

- Never hardcode a user-facing string in a component. Always go through
  `useTranslation()` / `t("namespace.key")`.
- Translation keys are stable and semantic (`receipt.save`, not `button1`).
- Both `frontend/src/i18n/locales/ja/common.json` and
  `.../locales/vi/common.json` are updated together for every user-facing
  change — never ship one language incomplete.
- Translations are natural, not literal word-for-word — a native speaker
  should not be able to tell they were translated.
- Financial terminology stays consistent across every screen (see glossary
  below) — never introduce a synonym for a term already in the glossary.

## Terminology glossary

| English | 日本語 | Tiếng Việt |
|---|---|---|
| Family | 家族 | Gia đình |
| Shared expense | 共同支出 | Chi tiêu chung |
| Personal expense | 個人支出 | Chi tiêu cá nhân |
| Payer | 支払者 | Người thanh toán |
| Settlement | 精算 | Quyết toán |
| Total | 合計 | Tổng cộng |
| Subtotal | 小計 | Tạm tính |
| Consumption tax | 消費税 | Thuế tiêu dùng |

Extend this table whenever a new domain term is introduced — do not
translate it ad hoc at the point of use.

## Current keys (as of project-foundation)

| Key | 日本語 | Tiếng Việt |
|---|---|---|
| `app.title` | 家計簿 | Quản lý chi tiêu gia đình |
| `common.loading` | 読み込み中... | Đang tải... |
| `common.language` | 言語 | Ngôn ngữ |
| `ping.success` | サーバーに接続しました | Đã kết nối với máy chủ |
| `ping.failure` | サーバーに接続できませんでした | Không thể kết nối với máy chủ |
```

- [ ] **Step 5: Commit**

```bash
git add README.md docs/ARCHITECTURE.md docs/PRODUCT_REQUIREMENTS.md docs/I18N.md
git commit -m "docs: add architecture, product requirements, and i18n glossary"
```

---

## After all tasks: branch-level verification

- [ ] Run the full check suite one more time from a clean state:

```bash
docker compose down -v
docker compose up -d
cd backend && uv run alembic upgrade head && uv run pytest && cd ..
cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && cd ..
```

- [ ] Confirm `git status` is clean and all commits are on `feature/project-foundation`.
- [ ] Proceed to `superpowers:finishing-a-development-branch` to push, open the PR, and merge per the mandatory git workflow.
