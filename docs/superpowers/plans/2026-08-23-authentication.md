# Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Email/password registration, login, session maintenance (JWT access token + revocable opaque refresh token, both in httpOnly cookies), and logout — with per-email login rate limiting and a reusable `get_current_user` dependency for every later phase's protected routes.

**Architecture:** Two new domain tables (`users`, `refresh_tokens`) added via Alembic revision `0002`. Access tokens are stateless JWTs (HS256, 15 min); refresh tokens are opaque random strings whose SHA-256 hash is stored server-side, so they can be revoked (this is what makes logout actually invalidate a session, not just delete a cookie). Both tokens travel as httpOnly cookies — the frontend never touches a token directly. The frontend gains real routing (`react-router-dom`) for the first time, since Phase 1 had only a single page.

**Tech Stack:** `argon2-cffi` (password hashing), `pyjwt` (JWT), `email-validator` (Pydantic `EmailStr`), Redis (already provisioned) for rate limiting — backend. `react-router-dom` — frontend, new this phase.

**Spec:** `docs/superpowers/specs/2026-08-23-authentication-design.md`

## Global Constraints

- Password minimum length: 8 characters, no composition rules.
- Access token: JWT HS256, 15-minute lifetime, claims `{sub, iat, exp, type: "access"}`.
- Refresh token: opaque `secrets.token_urlsafe(32)` string, 7-day lifetime, stored only as a SHA-256 hash (`token_hash`) — the raw value is never persisted.
- Cookies: `access_token` path `/`; `refresh_token` path `/api/v1/auth` (NOT `/api/v1/auth/refresh` alone — that would silently break `/logout`'s ability to read it, since cookie path-matching requires the request path to be that path or a subpath of it). Both `httponly=True`, `samesite="lax"`, `secure=True` only when `settings.env == "production"`.
- `/refresh` rotates on every call (revokes the presented token, issues a new pair). `/logout` is idempotent — always 204, always clears cookies, whether or not a valid refresh token was presented.
- Rate limiting: 5 failed `/login` attempts per email per 15-minute window (Redis fixed-window counter, key `login_attempts:{lowercased_email}`) → `429` on the 6th.
- `password_hash` and raw/hashed refresh tokens never appear in any response body, log line, or error message. Login failures return a generic "invalid credentials" message — never reveal whether the email exists.
- CORS stays restricted to `settings.cors_origins` (never `*`) — required for `allow_credentials=True` to mean anything.
- No hardcoded user-facing strings in the frontend — new `auth.*` i18n keys in both `ja`/`vi`, following Phase 1's established discipline.
- Non-goals for this phase: family/role model, OAuth, email verification, password reset, "log out everywhere" UI.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  app/
    core/
      config.py         (modify: add jwt_secret_key, access_token_expire_minutes, refresh_token_expire_days)
      security.py        (new: password hashing, JWT, refresh-token helpers)
      redis.py            (new: get_redis() factory)
      rate_limit.py        (new: login attempt rate limiting)
    models/
      __init__.py
      user.py
      refresh_token.py
    schemas/
      __init__.py
      auth.py
    api/
      deps.py             (new: get_current_user)
      v1/
        auth.py            (new: register/login/refresh/logout/me)
        router.py           (modify: include auth router)
  alembic/
    env.py                 (modify: import app.models)
    versions/
      0002_add_users_and_refresh_tokens.py
  tests/
    conftest.py            (modify: add JWT_SECRET_KEY default)
    test_security.py
    test_auth_api.py
  pyproject.toml            (modify: new dependencies)
.env.example                (modify: JWT_SECRET_KEY etc.)
.github/workflows/ci.yml     (modify: JWT_SECRET_KEY in backend job env)
frontend/
  package.json               (modify: add react-router-dom)
  src/
    App.tsx                  (rewrite: router shell)
    AppRoutes.tsx              (new: route table, separated from the Router wrapper for testability)
    App.test.tsx               (rewrite: routing/auth-gating tests)
    api/
      client.ts                (modify: add credentials: "include")
      schema.gen.ts              (regenerated)
    auth/
      authApi.ts
      AuthContext.tsx
      useAuth.ts
      ProtectedRoute.tsx
      LoginForm.tsx
      LoginForm.test.tsx
      RegisterForm.tsx
      RegisterForm.test.tsx
    routes/
      HomePage.tsx             (Phase 1's App.tsx content, moved + logout button)
      LoginPage.tsx
      RegisterPage.tsx
    i18n/locales/ja/common.json  (modify: add auth.* keys)
    i18n/locales/vi/common.json  (modify: add auth.* keys)
docs/
  ARCHITECTURE.md            (modify: add Authentication section)
  PRODUCT_REQUIREMENTS.md    (modify: add Authentication section)
  I18N.md                    (modify: extend Current keys table)
```

---

### Task 1: Settings, password hashing, JWT helpers

**Files:**
- Modify: `backend/pyproject.toml`, `backend/app/core/config.py`, `backend/tests/conftest.py`, `.env.example`, `.github/workflows/ci.yml`
- Create: `backend/app/core/security.py`
- Test: `backend/tests/test_security.py`

**Interfaces:**
- Consumes: `app.core.config.get_settings`
- Produces: `app.core.security.hash_password(password: str) -> str`, `verify_password(password: str, password_hash: str) -> bool`, `create_access_token(user_id: str) -> str`, `decode_access_token(token: str) -> dict[str, Any]` (raises `jwt.InvalidTokenError` subclasses on failure), `generate_refresh_token() -> str`, `hash_token(raw_token: str) -> str`

- [ ] **Step 1: Add new dependencies to `backend/pyproject.toml`**

In the `[project]` `dependencies` list, add:
```toml
  "pyjwt>=2.9,<3.0",
  "argon2-cffi>=23.1,<24.0",
```

- [ ] **Step 2: Add `JWT_SECRET_KEY` to the test environment default**

Modify `backend/tests/conftest.py`, adding one more `setdefault` call:

```python
import os


def pytest_configure() -> None:
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/family_expense_test",
    )
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
```

- [ ] **Step 3: Write the failing tests**

Create `backend/tests/test_security.py`:

```python
import time

import jwt
import pytest

from app.core.security import (
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)


def test_hash_password_and_verify_roundtrip() -> None:
    password_hash = hash_password("correct-password")

    assert verify_password("correct-password", password_hash) is True


def test_verify_password_rejects_wrong_password() -> None:
    password_hash = hash_password("correct-password")

    assert verify_password("wrong-password", password_hash) is False


def test_create_and_decode_access_token_roundtrip() -> None:
    token = create_access_token("user-123")

    payload = decode_access_token(token)

    assert payload["sub"] == "user-123"
    assert payload["type"] == "access"


def test_decode_access_token_rejects_expired_token(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("ACCESS_TOKEN_EXPIRE_MINUTES", "0")
    get_settings.cache_clear()
    try:
        token = create_access_token("user-123")
        time.sleep(1.1)

        with pytest.raises(jwt.ExpiredSignatureError):
            decode_access_token(token)
    finally:
        get_settings.cache_clear()


def test_decode_access_token_rejects_tampered_token() -> None:
    token = create_access_token("user-123")
    tampered = token[:-1] + ("A" if token[-1] != "A" else "B")

    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token(tampered)


def test_generate_refresh_token_returns_unique_values() -> None:
    assert generate_refresh_token() != generate_refresh_token()


def test_hash_token_is_deterministic_and_not_reversible_looking() -> None:
    raw = generate_refresh_token()

    assert hash_token(raw) == hash_token(raw)
    assert hash_token(raw) != raw
```

- [ ] **Step 4: Run to confirm it fails**

```bash
cd backend && uv sync && uv run pytest tests/test_security.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.security'`.

- [ ] **Step 5: Add the three new Settings fields**

Modify `backend/app/core/config.py` — add to the `Settings` class body (after `cors_origins`):

```python
    jwt_secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
```

The full file should now read:

```python
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    env: str = "development"
    database_url: str
    redis_url: str
    cors_origins: list[str] = ["http://localhost:5173"]
    jwt_secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
```

- [ ] **Step 6: Implement `backend/app/core/security.py`**

```python
import hashlib
import secrets
import time
from typing import Any

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

from app.core.config import get_settings

_password_hasher = PasswordHasher()


def hash_password(password: str) -> str:
    return _password_hasher.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return _password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + settings.access_token_expire_minutes * 60,
        "type": "access",
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    payload = jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])
    if payload.get("type") != "access":
        raise jwt.InvalidTokenError("not an access token")
    return payload


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
```

- [ ] **Step 7: Run to confirm it passes**

```bash
uv run pytest tests/test_security.py -v
```
Expected: 7 passed.

- [ ] **Step 8: Run the full backend suite, ruff, and mypy to confirm no regressions**

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: all clean. (`test_config.py`'s existing tests should be unaffected — `JWT_SECRET_KEY` is now supplied by `conftest.py`'s default.)

- [ ] **Step 9: Update `.env.example`**

Add these three lines to the root `.env.example` (after `CORS_ORIGINS`):

```
JWT_SECRET_KEY=change-this-to-a-random-secret-in-real-deployments
ACCESS_TOKEN_EXPIRE_MINUTES=15
REFRESH_TOKEN_EXPIRE_DAYS=7
```

- [ ] **Step 10: Add `JWT_SECRET_KEY` to the CI backend job's env block**

In `.github/workflows/ci.yml`, find the `backend` job's `env:` block (it currently has `DATABASE_URL` and `REDIS_URL`) and add:

```yaml
      JWT_SECRET_KEY: test-secret-key-for-ci-only
```

- [ ] **Step 11: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app/core/config.py backend/app/core/security.py backend/tests/conftest.py backend/tests/test_security.py .env.example .github/workflows/ci.yml
git commit -m "feat(backend): add password hashing and JWT helpers"
```

Note: anyone with an existing local `.env` from Phase 1 will need to add `JWT_SECRET_KEY` to it manually (it's a newly-required setting) — mention this in the PR description.

---

### Task 2: User and RefreshToken models, migration

**Files:**
- Create: `backend/app/models/__init__.py`, `backend/app/models/user.py`, `backend/app/models/refresh_token.py`, `backend/alembic/versions/0002_add_users_and_refresh_tokens.py`
- Modify: `backend/alembic/env.py`

**Interfaces:**
- Consumes: `app.db.base.Base`
- Produces: `app.models.User` (table `users`), `app.models.RefreshToken` (table `refresh_tokens`)

- [ ] **Step 1: Create `backend/app/models/user.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
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

- [ ] **Step 2: Create `backend/app/models/refresh_token.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 3: Create `backend/app/models/__init__.py`**

```python
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = ["RefreshToken", "User"]
```

- [ ] **Step 4: Register models with Alembic's metadata**

Modify `backend/alembic/env.py` — add `import app.models  # noqa: F401` immediately after the existing `from app.db.base import Base` line, so the models are registered on `Base.metadata` before Alembic reads `target_metadata` (needed for `alembic revision --autogenerate` to see them in the future; this migration itself is hand-written, but this import must exist for autogenerate to work correctly later).

- [ ] **Step 5: Create the migration `backend/alembic/versions/0002_add_users_and_refresh_tokens.py`**

```python
"""add users and refresh_tokens

Revision ID: 0002
Revises: 0001
Create Date: 2026-08-23

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("display_name", sa.String(length=100), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_refresh_tokens_user_id", "refresh_tokens", ["user_id"])
    op.create_index(
        "ix_refresh_tokens_token_hash", "refresh_tokens", ["token_hash"], unique=True
    )


def downgrade() -> None:
    op.drop_index("ix_refresh_tokens_token_hash", table_name="refresh_tokens")
    op.drop_index("ix_refresh_tokens_user_id", table_name="refresh_tokens")
    op.drop_table("refresh_tokens")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_table("users")
```

- [ ] **Step 6: Verify the migration against a live database**

```bash
docker compose up -d postgres
cd backend
uv run alembic upgrade head
uv run alembic current
```
Expected: `0002 (head)`.

```bash
docker compose exec postgres psql -U postgres -d family_expense -c "\d users"
docker compose exec postgres psql -U postgres -d family_expense -c "\d refresh_tokens"
```
Expected: `users` shows columns `id, email, password_hash, display_name, is_active, created_at, updated_at` with a unique index on `email`; `refresh_tokens` shows `id, user_id, token_hash, expires_at, revoked_at, created_at` with a foreign key on `user_id` and a unique index on `token_hash`.

- [ ] **Step 7: Verify downgrade works, then return to head**

```bash
uv run alembic downgrade 0001
uv run alembic current
```
Expected: `0001 (head)`.

```bash
uv run alembic upgrade head
uv run alembic current
```
Expected: `0002 (head)`.

- [ ] **Step 8: Run the full backend suite, ruff, and mypy**

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: all clean.

- [ ] **Step 9: Commit**

```bash
git add backend/app/models backend/alembic
git commit -m "feat(backend): add User and RefreshToken models with migration"
```

---

### Task 3: Rate limiting, schemas, auth API endpoints

**Files:**
- Create: `backend/app/core/redis.py`, `backend/app/core/rate_limit.py`, `backend/app/schemas/__init__.py`, `backend/app/schemas/auth.py`, `backend/app/api/deps.py`, `backend/app/api/v1/auth.py`
- Modify: `backend/pyproject.toml`, `backend/app/api/v1/router.py`
- Test: `backend/tests/test_auth_api.py`

**Interfaces:**
- Consumes: `app.core.security.*` (Task 1), `app.models.User`/`RefreshToken` (Task 2), `app.db.session.get_session`, `app.core.config.get_settings`
- Produces: `app.api.deps.get_current_user` (FastAPI dependency, returns `User`), `app.api.v1.auth.router` (mounted under `/api/v1/auth`), `app.core.rate_limit.is_login_rate_limited(email: str) -> bool`, `record_failed_login(email: str) -> None`

- [ ] **Step 1: Add `email-validator` dependency**

In `backend/pyproject.toml`'s `[project]` `dependencies`, add:
```toml
  "email-validator>=2.2,<3.0",
```

- [ ] **Step 2: Create `backend/app/core/redis.py`**

```python
from functools import lru_cache

from redis.asyncio import Redis

from app.core.config import get_settings


@lru_cache
def get_redis() -> Redis:
    settings = get_settings()
    return Redis.from_url(settings.redis_url, decode_responses=True)
```

- [ ] **Step 3: Create `backend/app/core/rate_limit.py`**

```python
from app.core.redis import get_redis

LOGIN_ATTEMPT_LIMIT = 5
LOGIN_ATTEMPT_WINDOW_SECONDS = 15 * 60


def _rate_limit_key(email: str) -> str:
    return f"login_attempts:{email.lower()}"


async def is_login_rate_limited(email: str) -> bool:
    redis = get_redis()
    count = await redis.get(_rate_limit_key(email))
    return count is not None and int(count) >= LOGIN_ATTEMPT_LIMIT


async def record_failed_login(email: str) -> None:
    redis = get_redis()
    key = _rate_limit_key(email)
    count = await redis.incr(key)
    if count == 1:
        await redis.expire(key, LOGIN_ATTEMPT_WINDOW_SECONDS)
```

- [ ] **Step 4: Create `backend/app/schemas/__init__.py`** (empty file)

- [ ] **Step 5: Create `backend/app/schemas/auth.py`**

```python
import uuid

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str = Field(min_length=1, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str
```

- [ ] **Step 6: Create `backend/app/api/deps.py`**

```python
import uuid
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.user import User


async def get_current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    token = request.cookies.get("access_token")
    if token is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        )

    return user
```

- [ ] **Step 7: Create `backend/app/api/v1/auth.py`**

```python
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.rate_limit import is_login_rate_limited, record_failed_login
from app.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.db.session import get_session
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, UserResponse

router = APIRouter()

REFRESH_COOKIE_PATH = "/api/v1/auth"


def _set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    secure = settings.env == "production"
    response.set_cookie(
        "access_token",
        access_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        path="/",
        max_age=settings.access_token_expire_minutes * 60,
    )
    response.set_cookie(
        "refresh_token",
        refresh_token,
        httponly=True,
        samesite="lax",
        secure=secure,
        path=REFRESH_COOKIE_PATH,
        max_age=settings.refresh_token_expire_days * 24 * 60 * 60,
    )


def _clear_auth_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path=REFRESH_COOKIE_PATH)


async def _issue_tokens_for_user(session: AsyncSession, response: Response, user: User) -> None:
    settings = get_settings()
    access_token = create_access_token(str(user.id))
    raw_refresh_token = generate_refresh_token()
    session.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(raw_refresh_token),
            expires_at=datetime.now(timezone.utc)
            + timedelta(days=settings.refresh_token_expire_days),
        )
    )
    await session.commit()
    _set_auth_cookies(response, access_token, raw_refresh_token)


@router.post("/register", status_code=status.HTTP_201_CREATED, response_model=UserResponse)
async def register(
    payload: RegisterRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    email = payload.email.lower()
    existing = await session.scalar(select(User).where(User.email == email))
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Email already registered"
        )

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
    )
    session.add(user)
    await session.flush()
    await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/login", response_model=UserResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    email = payload.email.lower()

    if await is_login_rate_limited(email):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )

    user = await session.scalar(select(User).where(User.email == email))
    if user is None or not verify_password(payload.password, user.password_hash):
        await record_failed_login(email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password"
        )

    await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/refresh", response_model=UserResponse)
async def refresh(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> User:
    raw_refresh_token = request.cookies.get("refresh_token")
    if raw_refresh_token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token"
        )

    token_hash = hash_token(raw_refresh_token)
    token_row = await session.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == token_hash)
    )

    now = datetime.now(timezone.utc)
    if token_row is None or token_row.revoked_at is not None or token_row.expires_at < now:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    token_row.revoked_at = now
    user = await session.get(User, token_row.user_id)
    if user is None or not user.is_active:
        await session.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired refresh token"
        )

    await _issue_tokens_for_user(session, response, user)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    session: AsyncSession = Depends(get_session),
) -> None:
    raw_refresh_token = request.cookies.get("refresh_token")
    if raw_refresh_token is not None:
        token_hash = hash_token(raw_refresh_token)
        token_row = await session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == token_hash)
        )
        if token_row is not None and token_row.revoked_at is None:
            token_row.revoked_at = datetime.now(timezone.utc)
            await session.commit()

    _clear_auth_cookies(response)


@router.get("/me", response_model=UserResponse)
async def me(user: User = Depends(get_current_user)) -> User:
    return user
```

- [ ] **Step 8: Wire the auth router into `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import auth, ping

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
```

- [ ] **Step 9: Write the integration tests**

Create `backend/tests/test_auth_api.py`:

```python
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncClient:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _unique_email() -> str:
    return f"user-{uuid.uuid4()}@example.com"


async def _register(client: AsyncClient, email: str, password: str = "correct-password") -> None:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": password, "display_name": "Alice"},
    )
    assert response.status_code == 201


@pytest.mark.integration
async def test_register_creates_user_and_sets_cookies(client: AsyncClient) -> None:
    email = _unique_email()

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Alice"},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["email"] == email
    assert body["display_name"] == "Alice"
    assert "password" not in body
    assert "password_hash" not in body
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.integration
async def test_register_rejects_duplicate_email(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": "Bob"},
    )

    assert response.status_code == 409


@pytest.mark.integration
async def test_login_succeeds_with_correct_credentials(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "correct-password"}
    )

    assert response.status_code == 200
    assert "access_token" in response.cookies
    assert "refresh_token" in response.cookies


@pytest.mark.integration
async def test_login_rejects_wrong_password(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
    )

    assert response.status_code == 401


@pytest.mark.integration
async def test_login_rate_limited_after_repeated_failures(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    for _ in range(5):
        response = await client.post(
            "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
        )
        assert response.status_code == 401

    response = await client.post(
        "/api/v1/auth/login", json={"email": email, "password": "wrong-password"}
    )

    assert response.status_code == 429


@pytest.mark.integration
async def test_refresh_rotates_token_and_invalidates_old_one(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    first_refresh_token = client.cookies.get("refresh_token")
    response = await client.post("/api/v1/auth/refresh")
    assert response.status_code == 200

    second_refresh_token = client.cookies.get("refresh_token")
    assert second_refresh_token != first_refresh_token

    client.cookies.set("refresh_token", first_refresh_token)
    reused_response = await client.post("/api/v1/auth/refresh")
    assert reused_response.status_code == 401


@pytest.mark.integration
async def test_logout_revokes_refresh_token(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    logout_response = await client.post("/api/v1/auth/logout")
    assert logout_response.status_code == 204

    refresh_response = await client.post("/api/v1/auth/refresh")
    assert refresh_response.status_code == 401


@pytest.mark.integration
async def test_logout_is_idempotent_with_no_session(client: AsyncClient) -> None:
    response = await client.post("/api/v1/auth/logout")

    assert response.status_code == 204


@pytest.mark.integration
async def test_me_returns_current_user_when_authenticated(client: AsyncClient) -> None:
    email = _unique_email()
    await _register(client, email)

    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == email


@pytest.mark.integration
async def test_me_rejects_missing_cookie(client: AsyncClient) -> None:
    response = await client.get("/api/v1/auth/me")

    assert response.status_code == 401
```

- [ ] **Step 10: Run the integration tests against real Postgres + Redis**

```bash
docker compose up -d postgres redis
cd backend
uv run alembic upgrade head
uv run pytest tests/test_auth_api.py -v -m integration
```
Expected: 10 passed.

- [ ] **Step 11: Regenerate the OpenAPI schema and run the full suite**

```bash
uv run python scripts/export_openapi.py
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: `openapi/openapi.json` now contains `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/me` and a `UserResponse` schema; all checks clean.

- [ ] **Step 12: Commit**

```bash
git add backend/pyproject.toml backend/uv.lock backend/app/core/redis.py backend/app/core/rate_limit.py backend/app/schemas backend/app/api/deps.py backend/app/api/v1/auth.py backend/app/api/v1/router.py backend/tests/test_auth_api.py openapi/openapi.json
git commit -m "feat(backend): add auth API endpoints with rate-limited login"
```

---

### Task 4: Frontend routing + auth plumbing

**Files:**
- Create: `frontend/src/AppRoutes.tsx`, `frontend/src/auth/authApi.ts`, `frontend/src/auth/AuthContext.tsx`, `frontend/src/auth/useAuth.ts`, `frontend/src/auth/ProtectedRoute.tsx`, `frontend/src/routes/HomePage.tsx`, `frontend/src/routes/LoginPage.tsx`, `frontend/src/routes/RegisterPage.tsx`
- Modify: `frontend/package.json`, `frontend/src/App.tsx`, `frontend/src/App.test.tsx`, `frontend/src/api/client.ts`, `frontend/src/i18n/locales/ja/common.json`, `frontend/src/i18n/locales/vi/common.json`

**Interfaces:**
- Consumes: `backend`'s regenerated `openapi/openapi.json` (Task 3)
- Produces: `frontend/src/api/schema.gen.ts` (regenerated, now includes auth paths and `UserResponse`), `useAuth()` hook, `ProtectedRoute`, i18n keys under `auth.*`

- [ ] **Step 1: Add `react-router-dom`**

```bash
cd frontend
pnpm add react-router-dom
```

- [ ] **Step 2: Add `credentials: "include"` to the API client**

Modify `frontend/src/api/client.ts`:

```ts
import createClient from "openapi-fetch";
import type { paths } from "./schema.gen";

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "http://localhost:8000";

export const apiClient = createClient<paths>({ baseUrl: API_BASE_URL, credentials: "include" });
```

- [ ] **Step 3: Regenerate the frontend API types**

```bash
pnpm run generate:api-types
```
Expected: `src/api/schema.gen.ts` now includes `/api/v1/auth/register`, `/login`, `/refresh`, `/logout`, `/me`, and a `UserResponse` component schema.

- [ ] **Step 4: Add auth i18n keys**

Add an `"auth"` key to `frontend/src/i18n/locales/ja/common.json` (as a new top-level sibling of `"app"`, `"common"`, `"ping"`):

```json
  "auth": {
    "login": "ログイン",
    "register": "アカウント作成",
    "email": "メールアドレス",
    "password": "パスワード",
    "displayName": "表示名",
    "loginButton": "ログイン",
    "registerButton": "登録する",
    "logout": "ログアウト",
    "invalidCredentials": "メールアドレスまたはパスワードが正しくありません",
    "emailInUse": "このメールアドレスは既に登録されています",
    "rateLimited": "ログイン試行回数が多すぎます。しばらくしてから再度お試しください",
    "passwordTooShort": "パスワードは8文字以上で入力してください",
    "genericError": "エラーが発生しました。もう一度お試しください"
  }
```

Add the equivalent `"auth"` key to `frontend/src/i18n/locales/vi/common.json`:

```json
  "auth": {
    "login": "Đăng nhập",
    "register": "Đăng ký",
    "email": "Địa chỉ email",
    "password": "Mật khẩu",
    "displayName": "Tên hiển thị",
    "loginButton": "Đăng nhập",
    "registerButton": "Đăng ký",
    "logout": "Đăng xuất",
    "invalidCredentials": "Email hoặc mật khẩu không đúng",
    "emailInUse": "Email này đã được đăng ký",
    "rateLimited": "Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau",
    "passwordTooShort": "Mật khẩu phải có ít nhất 8 ký tự",
    "genericError": "Đã xảy ra lỗi. Vui lòng thử lại"
  }
```

(Both JSON files must remain valid — add a comma after the preceding key's closing brace as needed.)

- [ ] **Step 5: Create `frontend/src/auth/authApi.ts`**

```ts
import { apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type AuthUser = components["schemas"]["UserResponse"];

export async function registerUser(
  email: string,
  password: string,
  displayName: string,
): Promise<AuthUser> {
  const { data, error } = await apiClient.POST("/api/v1/auth/register", {
    body: { email, password, display_name: displayName },
  });
  if (error || !data) {
    throw new Error("register_failed");
  }
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthUser> {
  const { data, error, response } = await apiClient.POST("/api/v1/auth/login", {
    body: { email, password },
  });
  if (error || !data) {
    if (response.status === 429) {
      throw new Error("rate_limited");
    }
    throw new Error("invalid_credentials");
  }
  return data;
}

export async function logoutUser(): Promise<void> {
  await apiClient.POST("/api/v1/auth/logout");
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const { data, error } = await apiClient.GET("/api/v1/auth/me");
  if (error || !data) {
    return null;
  }
  return data;
}
```

- [ ] **Step 6: Create `frontend/src/auth/AuthContext.tsx`**

```tsx
import { createContext, useEffect, useState, type ReactNode } from "react";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  registerUser,
  type AuthUser,
} from "./authApi";

export interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchCurrentUser()
      .then(setUser)
      .finally(() => setIsLoading(false));
  }, []);

  async function login(email: string, password: string) {
    setUser(await loginUser(email, password));
  }

  async function register(email: string, password: string, displayName: string) {
    setUser(await registerUser(email, password, displayName));
  }

  async function logout() {
    await logoutUser();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
```

- [ ] **Step 7: Create `frontend/src/auth/useAuth.ts`**

```ts
import { useContext } from "react";
import { AuthContext } from "./AuthContext";

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
```

- [ ] **Step 8: Create `frontend/src/auth/ProtectedRoute.tsx`**

```tsx
import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 9: Create `frontend/src/routes/HomePage.tsx`** (moves Phase 1's `App.tsx` content, adds a logout control)

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiClient } from "../api/client";
import { LanguageSwitcher } from "../components/LanguageSwitcher";
import { useAuth } from "../auth/useAuth";

type PingStatus = "loading" | "success" | "failure";

export function HomePage() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [status, setStatus] = useState<PingStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    apiClient
      .GET("/api/v1/ping")
      .then(({ data, error }) => {
        if (cancelled) return;
        setStatus(data && !error ? "success" : "failure");
      })
      .catch(() => {
        if (!cancelled) setStatus("failure");
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
      {user && (
        <p>
          {user.display_name} ·{" "}
          <button onClick={() => void logout()}>{t("auth.logout")}</button>
        </p>
      )}
    </main>
  );
}
```

- [ ] **Step 10: Create minimal `frontend/src/routes/LoginPage.tsx` and `RegisterPage.tsx`** (filled in with real forms in Task 5)

```tsx
import { useTranslation } from "react-i18next";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.login")}</h1>
    </main>
  );
}
```

```tsx
import { useTranslation } from "react-i18next";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.register")}</h1>
    </main>
  );
}
```

- [ ] **Step 11: Create `frontend/src/AppRoutes.tsx`**

(Kept separate from the `<BrowserRouter>` wrapper so tests can render it inside a `<MemoryRouter>` with a controlled initial path.)

```tsx
import { Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { HomePage } from "./routes/HomePage";
import { LoginPage } from "./routes/LoginPage";
import { RegisterPage } from "./routes/RegisterPage";

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <HomePage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}
```

- [ ] **Step 12: Rewrite `frontend/src/App.tsx`**

```tsx
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./AppRoutes";

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
```

- [ ] **Step 13: Write the failing routing tests**

Replace `frontend/src/App.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n/i18n";
import { AppRoutes } from "./AppRoutes";
import { AuthProvider } from "./auth/AuthContext";

const fetchCurrentUserMock = vi.fn();

vi.mock("./auth/authApi", () => ({
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUserMock(...args),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
}));

function renderAt(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe("AppRoutes", () => {
  beforeEach(() => {
    fetchCurrentUserMock.mockReset();
  });

  it("redirects unauthenticated users from / to /login", async () => {
    fetchCurrentUserMock.mockResolvedValue(null);

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });

  it("renders the home page for authenticated users", async () => {
    fetchCurrentUserMock.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      email: "alice@example.com",
      display_name: "Alice",
    });

    renderAt("/");

    expect(await screen.findByRole("heading", { name: "家計簿" })).toBeInTheDocument();
  });

  it("renders the login page directly at /login", async () => {
    fetchCurrentUserMock.mockResolvedValue(null);

    renderAt("/login");

    expect(await screen.findByRole("heading", { name: "ログイン" })).toBeInTheDocument();
  });
});
```

- [ ] **Step 14: Run to confirm it fails, then passes**

```bash
pnpm run test
```
Expected before Steps 5-12 are in place: FAIL (missing modules). After: 3 passed.

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
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src
git commit -m "feat(frontend): add routing and auth context/session plumbing"
```

---

### Task 5: Login and register forms

**Files:**
- Create: `frontend/src/auth/LoginForm.tsx`, `frontend/src/auth/LoginForm.test.tsx`, `frontend/src/auth/RegisterForm.tsx`, `frontend/src/auth/RegisterForm.test.tsx`
- Modify: `frontend/src/routes/LoginPage.tsx`, `frontend/src/routes/RegisterPage.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Task 4)
- Produces: `LoginForm`, `RegisterForm` components

- [ ] **Step 1: Write the failing tests for `LoginForm`**

Create `frontend/src/auth/LoginForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { LoginForm } from "./LoginForm";
import { useAuth } from "./useAuth";

vi.mock("./useAuth");

describe("LoginForm", () => {
  const loginMock = vi.fn();

  beforeEach(() => {
    loginMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: loginMock,
      register: vi.fn(),
      logout: vi.fn(),
    });
  });

  it("calls login with the entered credentials on submit", async () => {
    loginMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "correct-password");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(loginMock).toHaveBeenCalledWith("alice@example.com", "correct-password");
  });

  it("shows a translated error when login fails with invalid credentials", async () => {
    loginMock.mockRejectedValue(new Error("invalid_credentials"));
    const user = userEvent.setup();
    render(<LoginForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "ログイン" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "メールアドレスまたはパスワードが正しくありません",
    );
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd frontend && pnpm run test -- LoginForm
```
Expected: FAIL — `Cannot find module './LoginForm'`.

- [ ] **Step 3: Implement `frontend/src/auth/LoginForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

export function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "rate_limited"
          ? t("auth.rateLimited")
          : t("auth.invalidCredentials"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("auth.email")}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        {t("auth.password")}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("auth.loginButton")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

```bash
pnpm run test -- LoginForm
```
Expected: 2 passed.

- [ ] **Step 5: Write the failing tests for `RegisterForm`**

Create `frontend/src/auth/RegisterForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { RegisterForm } from "./RegisterForm";
import { useAuth } from "./useAuth";

vi.mock("./useAuth");

describe("RegisterForm", () => {
  const registerMock = vi.fn();

  beforeEach(() => {
    registerMock.mockReset();
    vi.mocked(useAuth).mockReturnValue({
      user: null,
      isLoading: false,
      login: vi.fn(),
      register: registerMock,
      logout: vi.fn(),
    });
  });

  it("shows a validation error for a too-short password without calling the API", async () => {
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("表示名"), "Alice");
    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "short");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "パスワードは8文字以上で入力してください",
    );
    expect(registerMock).not.toHaveBeenCalled();
  });

  it("calls register with the entered values when password is long enough", async () => {
    registerMock.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<RegisterForm />, { wrapper: MemoryRouter });

    await user.type(screen.getByLabelText("表示名"), "Alice");
    await user.type(screen.getByLabelText("メールアドレス"), "alice@example.com");
    await user.type(screen.getByLabelText("パスワード"), "correct-password");
    await user.click(screen.getByRole("button", { name: "登録する" }));

    expect(registerMock).toHaveBeenCalledWith(
      "alice@example.com",
      "correct-password",
      "Alice",
    );
  });
});
```

- [ ] **Step 6: Run to confirm it fails**

```bash
pnpm run test -- RegisterForm
```
Expected: FAIL — `Cannot find module './RegisterForm'`.

- [ ] **Step 7: Implement `frontend/src/auth/RegisterForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";

const MIN_PASSWORD_LENGTH = 8;

export function RegisterForm() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t("auth.passwordTooShort"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "register_failed"
          ? t("auth.emailInUse")
          : t("auth.genericError"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("auth.displayName")}
        <input
          type="text"
          value={displayName}
          onChange={(event) => setDisplayName(event.target.value)}
          required
        />
      </label>
      <label>
        {t("auth.email")}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        {t("auth.password")}
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("auth.registerButton")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 8: Run to confirm it passes**

```bash
pnpm run test -- RegisterForm
```
Expected: 2 passed.

- [ ] **Step 9: Wire the forms into their pages**

Update `frontend/src/routes/LoginPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { LoginForm } from "../auth/LoginForm";

export function LoginPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.login")}</h1>
      <LoginForm />
    </main>
  );
}
```

Update `frontend/src/routes/RegisterPage.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { RegisterForm } from "../auth/RegisterForm";

export function RegisterPage() {
  const { t } = useTranslation();

  return (
    <main>
      <h1>{t("auth.register")}</h1>
      <RegisterForm />
    </main>
  );
}
```

- [ ] **Step 10: Run the full frontend check suite**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean (the `App.test.tsx` routing tests from Task 4 should still pass — `LoginPage`/`RegisterPage` still render an `h1` with the same translated heading text, now alongside the form).

- [ ] **Step 11: Commit**

```bash
git add frontend/src/auth frontend/src/routes
git commit -m "feat(frontend): add login and register forms"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`

- [ ] **Step 1: Extend `docs/ARCHITECTURE.md`**

Add a new `## Authentication` section (after the existing "Type sharing" section):

```markdown
## Authentication

Email/password only for now (no OAuth, no email verification). Sessions
use two token types, both delivered as httpOnly cookies so the frontend
never handles a token directly:

- **Access token**: a stateless JWT (HS256, 15-minute lifetime). Verified
  per-request with no database round-trip.
- **Refresh token**: an opaque random string; only its SHA-256 hash is
  stored (`refresh_tokens.token_hash`), so it can be revoked. `/refresh`
  rotates it on every use (old token is revoked, a new one issued);
  `/logout` revokes it directly. This is what makes logout actually
  invalidate a session server-side, not just delete a cookie.

Login is rate-limited per email (5 failed attempts / 15 minutes) via a
Redis fixed-window counter — the same Redis instance already provisioned
for Celery.

`app/api/deps.py`'s `get_current_user` is the dependency every future
protected route (family, expense, receipt endpoints) will depend on.
```

- [ ] **Step 2: Extend `docs/PRODUCT_REQUIREMENTS.md`**

Add a new `## Authentication` section (after "## Family model"):

```markdown
## Authentication

Email + password registration and login. No OAuth, no email verification,
and no password reset yet — all explicitly deferred. A logged-in session
is maintained via httpOnly cookies; logging out revokes the session
server-side. Login attempts are rate-limited per email to blunt
brute-force guessing. Family-scoped authorization (Section "Family model"
above) builds on top of the authenticated user established here, in the
next phase.
```

- [ ] **Step 3: Extend `docs/I18N.md`'s "Current keys" table**

Add these rows after the existing five:

```markdown
| `auth.login` | ログイン | Đăng nhập |
| `auth.register` | アカウント作成 | Đăng ký |
| `auth.email` | メールアドレス | Địa chỉ email |
| `auth.password` | パスワード | Mật khẩu |
| `auth.displayName` | 表示名 | Tên hiển thị |
| `auth.loginButton` | ログイン | Đăng nhập |
| `auth.registerButton` | 登録する | Đăng ký |
| `auth.logout` | ログアウト | Đăng xuất |
| `auth.invalidCredentials` | メールアドレスまたはパスワードが正しくありません | Email hoặc mật khẩu không đúng |
| `auth.emailInUse` | このメールアドレスは既に登録されています | Email này đã được đăng ký |
| `auth.rateLimited` | ログイン試行回数が多すぎます。しばらくしてから再度お試しください | Bạn đã đăng nhập sai quá nhiều lần. Vui lòng thử lại sau |
| `auth.passwordTooShort` | パスワードは8文字以上で入力してください | Mật khẩu phải có ít nhất 8 ký tự |
| `auth.genericError` | エラーが発生しました。もう一度お試しください | Đã xảy ra lỗi. Vui lòng thử lại |
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/PRODUCT_REQUIREMENTS.md docs/I18N.md
git commit -m "docs: document authentication architecture and i18n keys"
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

- [ ] Manually verify end-to-end: register a user via the running frontend
  at `http://localhost:5173/register`, confirm redirect to the home page
  showing the display name and logout button; log out; confirm redirect
  behavior back to `/login` on next visit to `/`; log back in.
- [ ] Confirm `git status` is clean and all commits are on
  `feature/authentication`.
- [ ] Proceed to `superpowers:finishing-a-development-branch`.
