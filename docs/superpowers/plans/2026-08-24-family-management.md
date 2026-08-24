# Family Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Families and multi-family membership with a three-role permission model (OWNER/ADMIN/MEMBER), the endpoints to create/rename/delete a family and add/remove/promote members, and a reusable `get_family_membership` dependency every later phase's family-scoped routes will build on.

**Architecture:** Two new tables (`families`, `family_members`) added via Alembic revision `0003`. `family_members.role` is a plain string column (`FamilyRole` StrEnum at the application layer) rather than a Postgres ENUM, so adding a role later doesn't need a migration. Every family-scoped endpoint resolves membership via `get_family_membership` (404 if the family doesn't exist, 403 if the caller isn't a member) before any business logic runs, then layers small role-check helper functions (`require_owner`, `require_owner_or_admin`) on top — mirroring how Phase 2's `get_current_user` is the universal entry point for authenticated routes.

**Tech Stack:** No new dependencies — this phase is pure application logic on top of Phase 1/2's FastAPI + SQLAlchemy 2.0 + Alembic backend and Vite + React + TypeScript + react-router-dom frontend.

**Spec:** `docs/superpowers/specs/2026-08-24-family-management-design.md`

## Global Constraints

- Roles: exactly one OWNER per family (the creator, set at creation, no ownership transfer this phase), any number of ADMINs, any number of MEMBERs.
- Permission matrix (binding, from the spec): OWNER can rename/delete/add-member/remove-anyone-but-self/promote-demote. ADMIN can rename/add-member/remove-MEMBER-only/self-leave. MEMBER can view/self-leave only. OWNER cannot leave (must delete instead). ADMIN cannot remove or demote another ADMIN or the OWNER.
- Adding a member requires an existing registered user looked up by email — no invite tokens this phase. 404 if no such user, 409 if already a member.
- The role-change endpoint (`PATCH .../members/{user_id}`) only accepts `role ∈ {"admin", "member"}` in the request body (422 if `"owner"` is submitted) and separately rejects (400) if the resolved target's current role is `"owner"`.
- `get_family_membership` must be the first thing every family-scoped endpoint depends on — no endpoint trusts a `family_id` path parameter without verifying membership first.
- No hardcoded user-facing strings in the frontend — new `family.*`/`role.*` i18n keys in both `ja`/`vi`.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  app/
    models/
      family.py
      family_member.py       (also defines the FamilyRole StrEnum)
      __init__.py             (modify: export new models)
    schemas/
      family.py
    core/
      permissions.py
    api/
      deps.py                 (modify: add get_family_membership)
      v1/
        families.py
        router.py              (modify: include families router)
  alembic/versions/0003_add_families_and_family_members.py
  tests/
    test_permissions.py
    test_families_api.py
frontend/
  src/
    families/
      familyApi.ts
      FamilyList.tsx
      FamilyList.test.tsx
      CreateFamilyForm.tsx
      FamilyDetail.tsx
      FamilyDetail.test.tsx
      AddMemberForm.tsx
    AppRoutes.tsx               (modify: add /families, /families/:familyId routes)
    routes/HomePage.tsx          (modify: add a link to /families)
    i18n/locales/ja/common.json  (modify: add family.*/role.* keys)
    i18n/locales/vi/common.json  (modify: add family.*/role.* keys)
docs/
  ARCHITECTURE.md              (modify)
  PRODUCT_REQUIREMENTS.md      (modify)
  I18N.md                      (modify)
```

---

### Task 1: Family and FamilyMember models, migration

**Files:**
- Create: `backend/app/models/family.py`, `backend/app/models/family_member.py`, `backend/alembic/versions/0003_add_families_and_family_members.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Consumes: `app.db.base.Base`
- Produces: `app.models.Family` (table `families`), `app.models.FamilyMember` (table `family_members`), `app.models.FamilyRole` (StrEnum: `OWNER = "owner"`, `ADMIN = "admin"`, `MEMBER = "member"`)

- [ ] **Step 1: Create `backend/app/models/family.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Family(Base):
    __tablename__ = "families"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
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

- [ ] **Step 2: Create `backend/app/models/family_member.py`**

```python
import uuid
from datetime import datetime
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class FamilyRole(StrEnum):
    OWNER = "owner"
    ADMIN = "admin"
    MEMBER = "member"


class FamilyMember(Base):
    __tablename__ = "family_members"
    __table_args__ = (
        UniqueConstraint("family_id", "user_id", name="uq_family_members_family_user"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 3: Update `backend/app/models/__init__.py`**

```python
from app.models.family import Family
from app.models.family_member import FamilyMember, FamilyRole
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = ["Family", "FamilyMember", "FamilyRole", "RefreshToken", "User"]
```

- [ ] **Step 4: Create the migration `backend/alembic/versions/0003_add_families_and_family_members.py`**

```python
"""add families and family_members

Revision ID: 0003
Revises: 0002
Create Date: 2026-08-24

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "families",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )

    op.create_table(
        "family_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(length=20), nullable=False),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.UniqueConstraint("family_id", "user_id", name="uq_family_members_family_user"),
    )
    op.create_index("ix_family_members_family_id", "family_members", ["family_id"])
    op.create_index("ix_family_members_user_id", "family_members", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_family_members_user_id", table_name="family_members")
    op.drop_index("ix_family_members_family_id", table_name="family_members")
    op.drop_table("family_members")
    op.drop_table("families")
```

If `uv run ruff check .` flags import ordering on this file, fix it for real (the working order for this exact import shape, confirmed in Phase 2's equivalent migration, is: `import sqlalchemy as sa` first, then `from alembic import op`, then `from sqlalchemy.dialects import postgresql` — straight import before alphabetized from-imports).

- [ ] **Step 5: Verify the migration against a live database**

```bash
docker compose up -d postgres
cd backend
uv run alembic upgrade head
uv run alembic current
```
Expected: `0003 (head)`.

```bash
docker compose exec postgres psql -U postgres -d family_expense -c "\d families"
docker compose exec postgres psql -U postgres -d family_expense -c "\d family_members"
```
Expected: `families` shows `id, name, created_at, updated_at`; `family_members` shows `id, family_id, user_id, role, joined_at` with a unique constraint on `(family_id, user_id)`, a foreign key on each of `family_id`/`user_id`, and both columns indexed.

- [ ] **Step 6: Verify downgrade, then return to head**

```bash
uv run alembic downgrade 0002
uv run alembic current
```
Expected: `0002 (head)`.

```bash
uv run alembic upgrade head
uv run alembic current
```
Expected: `0003 (head)`.

- [ ] **Step 7: Run the full backend suite, ruff, and mypy**

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: all clean.

- [ ] **Step 8: Commit**

```bash
git add backend/app/models backend/alembic
git commit -m "feat(backend): add Family and FamilyMember models with migration"
```

---

### Task 2: Schemas, family-scoped auth dependency, permission helpers

**Files:**
- Create: `backend/app/schemas/family.py`, `backend/app/core/permissions.py`, `backend/tests/test_permissions.py`
- Modify: `backend/app/api/deps.py`

**Interfaces:**
- Consumes: `app.models.Family`, `app.models.FamilyMember`, `app.models.FamilyRole` (Task 1), `app.api.deps.get_current_user` (Phase 2)
- Produces: `app.api.deps.get_family_membership(family_id, user, session) -> FamilyMember`, `app.core.permissions.require_owner(membership)`, `app.core.permissions.require_owner_or_admin(membership)`, schemas `CreateFamilyRequest`, `RenameFamilyRequest`, `AddMemberRequest`, `ChangeRoleRequest`, `FamilyResponse`, `FamilyMemberResponse`, `FamilyDetailResponse`

- [ ] **Step 1: Create `backend/app/schemas/family.py`**

```python
import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class RenameFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class AddMemberRequest(BaseModel):
    email: EmailStr


class ChangeRoleRequest(BaseModel):
    role: Literal["admin", "member"]


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str


class FamilyMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    display_name: str
    role: str


class FamilyDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    members: list[FamilyMemberResponse]
```

- [ ] **Step 2: Create `backend/app/core/permissions.py`**

```python
from fastapi import HTTPException, status

from app.models.family_member import FamilyMember, FamilyRole


def require_role(membership: FamilyMember, allowed_roles: set[str]) -> None:
    if membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


def require_owner(membership: FamilyMember) -> None:
    require_role(membership, {FamilyRole.OWNER})


def require_owner_or_admin(membership: FamilyMember) -> None:
    require_role(membership, {FamilyRole.OWNER, FamilyRole.ADMIN})
```

- [ ] **Step 3: Write the failing tests for the permission helpers**

Create `backend/tests/test_permissions.py`:

```python
import pytest
from fastapi import HTTPException

from app.core.permissions import require_owner, require_owner_or_admin
from app.models.family_member import FamilyMember, FamilyRole


def _membership(role: str) -> FamilyMember:
    return FamilyMember(role=role)


def test_require_owner_allows_owner() -> None:
    require_owner(_membership(FamilyRole.OWNER))


def test_require_owner_rejects_admin() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner(_membership(FamilyRole.ADMIN))
    assert exc_info.value.status_code == 403


def test_require_owner_or_admin_allows_admin() -> None:
    require_owner_or_admin(_membership(FamilyRole.ADMIN))


def test_require_owner_or_admin_rejects_member() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner_or_admin(_membership(FamilyRole.MEMBER))
    assert exc_info.value.status_code == 403
```

- [ ] **Step 4: Run to confirm it fails**

```bash
cd backend && uv run pytest tests/test_permissions.py -v
```
Expected: FAIL — `ModuleNotFoundError: No module named 'app.core.permissions'`.

- [ ] **Step 5: Run to confirm it passes** (after Step 2's implementation)

```bash
uv run pytest tests/test_permissions.py -v
```
Expected: 4 passed.

- [ ] **Step 6: Add `get_family_membership` to `backend/app/api/deps.py`**

Add these imports to the top of the existing file (alongside the current ones) and the new function at the end:

```python
from app.models.family import Family
from app.models.family_member import FamilyMember
```

```python
async def get_family_membership(
    family_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMember:
    membership = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user.id
        )
    )
    if membership is not None:
        return membership

    family_exists = await session.scalar(select(Family.id).where(Family.id == family_id))
    if family_exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this family"
    )
```

You'll also need to add `from sqlalchemy import select` to the imports if it isn't already there (check the existing file first — `get_current_user` doesn't currently query by an arbitrary filter, only `session.get`, so `select` is likely a new import here).

- [ ] **Step 7: Run the full backend suite, ruff, and mypy**

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: all clean. (`get_family_membership` has no dedicated test yet — it gets exercised for real in Tasks 3-4's integration tests, the same way Phase 2's `get_current_user` was only exercised via `test_auth_api.py`, not a standalone unit test.)

- [ ] **Step 8: Commit**

```bash
git add backend/app/schemas/family.py backend/app/core/permissions.py backend/app/api/deps.py backend/tests/test_permissions.py
git commit -m "feat(backend): add family schemas, permission helpers, and family membership dependency"
```

---

### Task 3: Family CRUD endpoints (create, list, detail, rename, delete)

**Files:**
- Create: `backend/app/api/v1/families.py`, `backend/tests/test_families_api.py`
- Modify: `backend/app/api/v1/router.py`

**Interfaces:**
- Consumes: `app.api.deps.get_current_user`, `app.api.deps.get_family_membership`, `app.core.permissions.require_owner`, `app.core.permissions.require_owner_or_admin`, `app.models.Family`, `app.models.FamilyMember`, `app.models.FamilyRole`, schemas from Task 2
- Produces: `app.api.v1.families.router` (mounted under `/api/v1/families`) with `POST /`, `GET /`, `GET /{family_id}`, `PATCH /{family_id}`, `DELETE /{family_id}`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_families_api.py`:

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


@pytest.mark.integration
async def test_create_family_creates_owner_membership(client: AsyncClient) -> None:
    await _register(client, _unique_email())

    response = await client.post("/api/v1/families/", json={"name": "My Family"})

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "My Family"
    assert body["role"] == "owner"


@pytest.mark.integration
async def test_list_my_families_returns_role(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    await _create_family(client, "Family One")

    response = await client.get("/api/v1/families/")

    assert response.status_code == 200
    families = response.json()
    assert len(families) == 1
    assert families[0]["name"] == "Family One"
    assert families[0]["role"] == "owner"


@pytest.mark.integration
async def test_get_family_detail_includes_members(client: AsyncClient) -> None:
    user = await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.get(f"/api/v1/families/{family_id}")

    assert response.status_code == 200
    body = response.json()
    assert body["members"] == [
        {
            "user_id": user["id"],
            "email": user["email"],
            "display_name": user["display_name"],
            "role": "owner",
        }
    ]


@pytest.mark.integration
async def test_get_family_detail_rejects_non_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as other_client:
        await _register(other_client, _unique_email())
        response = await other_client.get(f"/api/v1/families/{family_id}")

    assert response.status_code == 403


@pytest.mark.integration
async def test_get_family_detail_404_for_nonexistent_family(client: AsyncClient) -> None:
    await _register(client, _unique_email())

    response = await client.get(f"/api/v1/families/{uuid.uuid4()}")

    assert response.status_code == 404


@pytest.mark.integration
async def test_rename_family_as_owner_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client, "Old Name")

    response = await client.patch(f"/api/v1/families/{family_id}", json={"name": "New Name"})

    assert response.status_code == 200
    assert response.json()["name"] == "New Name"


@pytest.mark.integration
async def test_delete_family_as_owner_cascades_membership(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    delete_response = await client.delete(f"/api/v1/families/{family_id}")
    assert delete_response.status_code == 204

    get_response = await client.get(f"/api/v1/families/{family_id}")
    assert get_response.status_code == 404
```

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_families_api.py -v -m integration
```
Expected: FAIL — 404s everywhere, `/api/v1/families/` doesn't exist yet.

- [ ] **Step 3: Implement `backend/app/api/v1/families.py`**

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.permissions import require_owner, require_owner_or_admin
from app.db.session import get_session
from app.models.family import Family
from app.models.family_member import FamilyMember, FamilyRole
from app.models.user import User
from app.schemas.family import (
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
    RenameFamilyRequest,
)

router = APIRouter()


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=FamilyResponse)
async def create_family(
    payload: CreateFamilyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    family = Family(name=payload.name)
    session.add(family)
    await session.flush()

    membership = FamilyMember(family_id=family.id, user_id=user.id, role=FamilyRole.OWNER)
    session.add(membership)
    await session.commit()

    return FamilyResponse(id=family.id, name=family.name, role=membership.role)


@router.get("/", response_model=list[FamilyResponse])
async def list_my_families(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[FamilyResponse]:
    rows = await session.execute(
        select(Family, FamilyMember.role)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .where(FamilyMember.user_id == user.id)
    )
    return [
        FamilyResponse(id=family.id, name=family.name, role=role) for family, role in rows.all()
    ]


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family_detail(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyDetailResponse:
    family = await session.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    rows = await session.execute(
        select(FamilyMember, User)
        .join(User, User.id == FamilyMember.user_id)
        .where(FamilyMember.family_id == family_id)
    )
    members = [
        FamilyMemberResponse(
            user_id=user_row.id,
            email=user_row.email,
            display_name=user_row.display_name,
            role=member_row.role,
        )
        for member_row, user_row in rows.all()
    ]
    return FamilyDetailResponse(id=family.id, name=family.name, members=members)


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: uuid.UUID,
    payload: RenameFamilyRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    require_owner_or_admin(membership)

    family = await session.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    family.name = payload.name
    await session.commit()
    return FamilyResponse(id=family.id, name=family.name, role=membership.role)


@router.delete("/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    require_owner(membership)

    family = await session.get(Family, family_id)
    if family is not None:
        await session.delete(family)
        await session.commit()
```

- [ ] **Step 4: Wire the router into `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import auth, families, ping

api_router = APIRouter()
api_router.include_router(ping.router, tags=["ping"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(families.router, prefix="/families", tags=["families"])
```

- [ ] **Step 5: Run the integration tests against real Postgres**

```bash
docker compose up -d postgres redis
uv run alembic upgrade head
uv run pytest tests/test_families_api.py -v -m integration
```
Expected: 7 passed.

- [ ] **Step 6: Regenerate the OpenAPI schema and run the full suite**

```bash
uv run python scripts/export_openapi.py
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: `openapi/openapi.json` now contains `/api/v1/families/`, `/api/v1/families/{family_id}` and `FamilyResponse`/`FamilyDetailResponse`/`FamilyMemberResponse` schemas; all checks clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/api/v1/families.py backend/app/api/v1/router.py backend/tests/test_families_api.py openapi/openapi.json
git commit -m "feat(backend): add family create/list/detail/rename/delete endpoints"
```

---

### Task 4: Membership endpoints (add, remove/leave, change role) and the full permission matrix

**Files:**
- Modify: `backend/app/api/v1/families.py`, `backend/tests/test_families_api.py`

**Interfaces:**
- Consumes: everything from Task 3, plus `AddMemberRequest`/`ChangeRoleRequest` schemas (Task 2)
- Produces: `POST /{family_id}/members`, `DELETE /{family_id}/members/{user_id}`, `PATCH /{family_id}/members/{user_id}` added to the existing `families.py` router

- [ ] **Step 1: Write the failing tests**

Add these test functions to the end of `backend/tests/test_families_api.py` (no new imports needed — everything used below is already imported at the top of the file from Task 3):

```python
async def _add_member(client: AsyncClient, family_id: str, email: str) -> dict:
    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": email}
    )
    assert response.status_code == 201
    return response.json()


@pytest.mark.integration
async def test_add_member_by_email_succeeds(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)

    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": member_email}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["user_id"] == member_user["id"]
    assert body["role"] == "member"


@pytest.mark.integration
async def test_add_member_404_for_unregistered_email(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": _unique_email()}
    )

    assert response.status_code == 404


@pytest.mark.integration
async def test_add_member_409_when_already_a_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)

    await _add_member(client, family_id, member_email)
    response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": member_email}
    )

    assert response.status_code == 409


@pytest.mark.integration
async def test_member_cannot_add_or_rename_or_delete(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await _add_member(client, family_id, member_email)

        rename_response = await member_client.patch(
            f"/api/v1/families/{family_id}", json={"name": "Hijacked"}
        )
        delete_response = await member_client.delete(f"/api/v1/families/{family_id}")
        add_response = await member_client.post(
            f"/api/v1/families/{family_id}/members", json={"email": _unique_email()}
        )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403
    assert add_response.status_code == 403


@pytest.mark.integration
async def test_owner_removes_member_and_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    member_email = _unique_email()
    admin_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client, AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        member_user = await _register(member_client, member_email)
        admin_user = await _register(admin_client, admin_email)

    await _add_member(client, family_id, member_email)
    await _add_member(client, family_id, admin_email)
    promote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{admin_user['id']}", json={"role": "admin"}
    )
    assert promote_response.status_code == 200
    assert promote_response.json()["role"] == "admin"

    remove_member_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{member_user['id']}"
    )
    remove_admin_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{admin_user['id']}"
    )

    assert remove_member_response.status_code == 204
    assert remove_admin_response.status_code == 204


@pytest.mark.integration
async def test_admin_can_remove_member_but_not_another_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    admin1_email = _unique_email()
    admin2_email = _unique_email()
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin1_client:
        admin1_user = await _register(admin1_client, admin1_email)
        await _add_member(client, family_id, admin1_email)
        await client.patch(
            f"/api/v1/families/{family_id}/members/{admin1_user['id']}", json={"role": "admin"}
        )

        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as admin2_client:
            admin2_user = await _register(admin2_client, admin2_email)
            await _add_member(client, family_id, admin2_email)
            await client.patch(
                f"/api/v1/families/{family_id}/members/{admin2_user['id']}",
                json={"role": "admin"},
            )

            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ) as member_client:
                member_user = await _register(member_client, member_email)
            await _add_member(client, family_id, member_email)

            remove_member_response = await admin1_client.delete(
                f"/api/v1/families/{family_id}/members/{member_user['id']}"
            )
            remove_admin_response = await admin1_client.delete(
                f"/api/v1/families/{family_id}/members/{admin2_user['id']}"
            )

    assert remove_member_response.status_code == 204
    assert remove_admin_response.status_code == 403


@pytest.mark.integration
async def test_admin_and_member_can_leave_but_owner_cannot(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    admin_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as admin_client:
        admin_user = await _register(admin_client, admin_email)
        await _add_member(client, family_id, admin_email)
        await client.patch(
            f"/api/v1/families/{family_id}/members/{admin_user['id']}", json={"role": "admin"}
        )

        leave_response = await admin_client.delete(
            f"/api/v1/families/{family_id}/members/{admin_user['id']}"
        )

    assert leave_response.status_code == 204

    owner_id_response = await client.get(f"/api/v1/families/{family_id}")
    owner_user_id = owner_id_response.json()["members"][0]["user_id"]
    owner_leave_response = await client.delete(
        f"/api/v1/families/{family_id}/members/{owner_user_id}"
    )

    assert owner_leave_response.status_code == 403


@pytest.mark.integration
async def test_owner_can_promote_and_demote(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)

    await _add_member(client, family_id, member_email)

    promote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "admin"}
    )
    demote_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "member"}
    )

    assert promote_response.status_code == 200
    assert promote_response.json()["role"] == "admin"
    assert demote_response.status_code == 200
    assert demote_response.json()["role"] == "member"


@pytest.mark.integration
async def test_change_role_rejects_owner_literal_and_owner_target(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    detail = await client.get(f"/api/v1/families/{family_id}")
    owner_user_id = detail.json()["members"][0]["user_id"]

    reject_owner_target_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{owner_user_id}", json={"role": "admin"}
    )

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
    await _add_member(client, family_id, member_email)

    reject_owner_literal_response = await client.patch(
        f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "owner"}
    )

    assert reject_owner_target_response.status_code == 400
    assert reject_owner_literal_response.status_code == 422


@pytest.mark.integration
async def test_member_cannot_change_roles(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    member_email = _unique_email()

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
        await _add_member(client, family_id, member_email)

        response = await member_client.patch(
            f"/api/v1/families/{family_id}/members/{member_user['id']}", json={"role": "admin"}
        )

    assert response.status_code == 403
```

- [ ] **Step 2: Run to confirm the new tests fail**

```bash
uv run pytest tests/test_families_api.py -v -m integration
```
Expected: the 7 Task-3 tests still pass; the new membership tests fail (404 — the member endpoints don't exist yet).

- [ ] **Step 3: Add the membership endpoints to `backend/app/api/v1/families.py`**

`FamilyMember` and `FamilyRole` are already imported from Task 3. Update the
existing `from app.schemas.family import (...)` line to include the two new
schemas:

```python
from app.schemas.family import (
    AddMemberRequest,
    ChangeRoleRequest,
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
    RenameFamilyRequest,
)
```

Append these three endpoints to the end of the file:

```python
@router.post(
    "/{family_id}/members", status_code=status.HTTP_201_CREATED, response_model=FamilyMemberResponse
)
async def add_member(
    family_id: uuid.UUID,
    payload: AddMemberRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    require_owner_or_admin(membership)

    email = payload.email.lower()
    target_user = await session.scalar(select(User).where(User.email == email))
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No registered user with that email"
        )

    existing = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == target_user.id
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this family",
        )

    new_member = FamilyMember(
        family_id=family_id, user_id=target_user.id, role=FamilyRole.MEMBER
    )
    session.add(new_member)
    await session.commit()

    return FamilyMemberResponse(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=new_member.role,
    )


@router.delete("/{family_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    target = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    is_self_removal = user_id == membership.user_id

    if is_self_removal:
        if membership.role == FamilyRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The owner cannot leave the family; delete it instead",
            )
    else:
        if target.role == FamilyRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove the owner"
            )
        if target.role == FamilyRole.ADMIN:
            require_owner(membership)
        else:
            require_owner_or_admin(membership)

    await session.delete(target)
    await session.commit()


@router.patch("/{family_id}/members/{user_id}", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChangeRoleRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    require_owner(membership)

    target = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    if target.role == FamilyRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change the owner's role"
        )

    target.role = payload.role
    await session.commit()

    target_user = await session.get(User, user_id)
    assert target_user is not None
    return FamilyMemberResponse(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=target.role,
    )
```

- [ ] **Step 4: Run the integration tests against real Postgres**

```bash
docker compose up -d postgres redis
uv run pytest tests/test_families_api.py -v -m integration
```
Expected: all tests in the file pass (7 from Task 3 + the new membership tests).

- [ ] **Step 5: Regenerate the OpenAPI schema and run the full suite**

```bash
uv run python scripts/export_openapi.py
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: `openapi/openapi.json` now also contains the three member endpoints; all checks clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/families.py backend/tests/test_families_api.py openapi/openapi.json
git commit -m "feat(backend): add family membership endpoints with full permission matrix"
```

---

### Task 5: Frontend routing, family list, create form, minimal family detail

**Files:**
- Create: `frontend/src/families/familyApi.ts`, `frontend/src/families/FamilyList.tsx`, `frontend/src/families/FamilyList.test.tsx`, `frontend/src/families/CreateFamilyForm.tsx`, `frontend/src/families/FamilyDetail.tsx`
- Modify: `frontend/src/AppRoutes.tsx`, `frontend/src/routes/HomePage.tsx`, `frontend/src/i18n/locales/ja/common.json`, `frontend/src/i18n/locales/vi/common.json`

**Interfaces:**
- Consumes: the regenerated `openapi/openapi.json` (Tasks 3-4)
- Produces: `frontend/src/api/schema.gen.ts` (regenerated, includes family paths/schemas), `familyApi.ts`'s exported functions, routes `/families` and `/families/:familyId`

**Note:** `FamilyDetail.tsx` here is intentionally minimal (read-only: family name + member list, no actions) — Task 6 fills in rename/delete/add/remove/promote. This mirrors how Phase 2's `LoginPage`/`RegisterPage` started as placeholders before their forms landed.

- [ ] **Step 1: Regenerate the frontend API types**

```bash
cd frontend
pnpm run generate:api-types
```
Expected: `src/api/schema.gen.ts` now includes `/api/v1/families/`, `/api/v1/families/{family_id}`, `/api/v1/families/{family_id}/members`, `/api/v1/families/{family_id}/members/{user_id}`, and `FamilyResponse`/`FamilyDetailResponse`/`FamilyMemberResponse` schemas.

- [ ] **Step 2: Add the i18n keys**

Add to `frontend/src/i18n/locales/ja/common.json` (new top-level `"family"` and `"role"` keys, siblings of the existing `"app"`, `"common"`, `"ping"`, `"auth"`):

```json
  "family": {
    "myFamilies": "自分の家族",
    "noFamilies": "まだ家族がありません",
    "create": "作成",
    "name": "家族名",
    "rename": "名前を変更",
    "delete": "削除",
    "addMember": "メンバーを追加",
    "memberEmail": "メールアドレス",
    "memberNotFound": "登録されているユーザーが見つかりません",
    "memberAlreadyExists": "すでにメンバーです",
    "removeMember": "削除",
    "leaveFamily": "退出する",
    "confirmDelete": "この家族を削除してもよろしいですか?",
    "confirmLeave": "この家族から退出してもよろしいですか?",
    "actionFailed": "エラーが発生しました。もう一度お試しください"
  },
  "role": {
    "owner": "オーナー",
    "admin": "管理者",
    "member": "メンバー"
  }
```

Add the equivalent to `frontend/src/i18n/locales/vi/common.json`:

```json
  "family": {
    "myFamilies": "Gia đình của tôi",
    "noFamilies": "Bạn chưa có gia đình nào",
    "create": "Tạo",
    "name": "Tên gia đình",
    "rename": "Đổi tên",
    "delete": "Xóa",
    "addMember": "Thêm thành viên",
    "memberEmail": "Địa chỉ email",
    "memberNotFound": "Không tìm thấy người dùng đã đăng ký",
    "memberAlreadyExists": "Đã là thành viên",
    "removeMember": "Xóa",
    "leaveFamily": "Rời khỏi",
    "confirmDelete": "Bạn có chắc muốn xóa gia đình này?",
    "confirmLeave": "Bạn có chắc muốn rời khỏi gia đình này?",
    "actionFailed": "Đã xảy ra lỗi. Vui lòng thử lại"
  },
  "role": {
    "owner": "Chủ sở hữu",
    "admin": "Quản trị viên",
    "member": "Thành viên"
  }
```

(Both files must remain valid JSON — add a comma after the preceding key's closing brace.)

- [ ] **Step 3: Create `frontend/src/families/familyApi.ts`**

```ts
import { apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type Family = components["schemas"]["FamilyResponse"];
export type FamilyDetail = components["schemas"]["FamilyDetailResponse"];
export type FamilyMemberInfo = components["schemas"]["FamilyMemberResponse"];

export async function listMyFamilies(): Promise<Family[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/");
  if (error || !data) {
    throw new Error("list_families_failed");
  }
  return data;
}

export async function createFamily(name: string): Promise<Family> {
  const { data, error } = await apiClient.POST("/api/v1/families/", {
    body: { name },
  });
  if (error || !data) {
    throw new Error("create_family_failed");
  }
  return data;
}

export async function getFamilyDetail(familyId: string): Promise<FamilyDetail> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    if (response.status === 403) {
      throw new Error("not_a_member");
    }
    throw new Error("family_not_found");
  }
  return data;
}

export async function renameFamily(familyId: string, name: string): Promise<Family> {
  const { data, error } = await apiClient.PATCH("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
    body: { name },
  });
  if (error || !data) {
    throw new Error("rename_family_failed");
  }
  return data;
}

export async function deleteFamily(familyId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}", {
    params: { path: { family_id: familyId } },
  });
  if (error) {
    throw new Error("delete_family_failed");
  }
}

export async function addMember(familyId: string, email: string): Promise<FamilyMemberInfo> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/members",
    {
      params: { path: { family_id: familyId } },
      body: { email },
    },
  );
  if (error || !data) {
    if (response.status === 404) {
      throw new Error("member_not_found");
    }
    if (response.status === 409) {
      throw new Error("member_already_exists");
    }
    throw new Error("add_member_failed");
  }
  return data;
}

export async function removeMember(familyId: string, userId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}/members/{user_id}", {
    params: { path: { family_id: familyId, user_id: userId } },
  });
  if (error) {
    throw new Error("remove_member_failed");
  }
}

export async function changeMemberRole(
  familyId: string,
  userId: string,
  role: "admin" | "member",
): Promise<FamilyMemberInfo> {
  const { data, error } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/members/{user_id}",
    {
      params: { path: { family_id: familyId, user_id: userId } },
      body: { role },
    },
  );
  if (error || !data) {
    throw new Error("change_role_failed");
  }
  return data;
}
```

- [ ] **Step 4: Write the failing test for `FamilyList`**

Create `frontend/src/families/FamilyList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyList } from "./FamilyList";

const listMyFamiliesMock = vi.fn();
const createFamilyMock = vi.fn();

vi.mock("./familyApi", () => ({
  listMyFamilies: (...args: unknown[]) => listMyFamiliesMock(...args),
  createFamily: (...args: unknown[]) => createFamilyMock(...args),
}));

describe("FamilyList", () => {
  beforeEach(() => {
    listMyFamiliesMock.mockReset();
    createFamilyMock.mockReset();
  });

  it("renders the user's families", async () => {
    listMyFamiliesMock.mockResolvedValue([
      { id: "11111111-1111-1111-1111-111111111111", name: "My Family", role: "owner" },
    ]);

    render(<FamilyList />, { wrapper: MemoryRouter });

    expect(await screen.findByText("My Family")).toBeInTheDocument();
  });

  it("shows the empty state when there are no families", async () => {
    listMyFamiliesMock.mockResolvedValue([]);

    render(<FamilyList />, { wrapper: MemoryRouter });

    expect(await screen.findByText("まだ家族がありません")).toBeInTheDocument();
  });

  it("adds the newly created family to the list on submit", async () => {
    listMyFamiliesMock.mockResolvedValue([]);
    createFamilyMock.mockResolvedValue({
      id: "22222222-2222-2222-2222-222222222222",
      name: "New Family",
      role: "owner",
    });
    const user = userEvent.setup();

    render(<FamilyList />, { wrapper: MemoryRouter });
    await screen.findByText("まだ家族がありません");

    await user.type(screen.getByLabelText("家族名"), "New Family");
    await user.click(screen.getByRole("button", { name: "作成" }));

    expect(await screen.findByText("New Family")).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to confirm it fails**

```bash
pnpm run test -- FamilyList
```
Expected: FAIL — modules don't exist yet.

- [ ] **Step 6: Create `frontend/src/families/CreateFamilyForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { createFamily, type Family } from "./familyApi";

export function CreateFamilyForm({ onCreated }: { onCreated: (family: Family) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const family = await createFamily(name);
      onCreated(family);
      setName("");
    } catch {
      setError(t("family.actionFailed"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("family.name")}
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("family.create")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 7: Create `frontend/src/families/FamilyList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { listMyFamilies, type Family } from "./familyApi";
import { CreateFamilyForm } from "./CreateFamilyForm";

export function FamilyList() {
  const { t } = useTranslation();
  const [families, setFamilies] = useState<Family[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    listMyFamilies()
      .then((result) => {
        if (!cancelled) setFamilies(result);
      })
      .catch(() => {
        if (!cancelled) setFamilies([]);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function handleCreated(family: Family) {
    setFamilies((current) => [...current, family]);
  }

  return (
    <main>
      <h1>{t("family.myFamilies")}</h1>
      {isLoading ? (
        <p>{t("common.loading")}</p>
      ) : families.length === 0 ? (
        <p>{t("family.noFamilies")}</p>
      ) : (
        <ul>
          {families.map((family) => (
            <li key={family.id}>
              <Link to={`/families/${family.id}`}>{family.name}</Link> (
              {t(`role.${family.role}`)})
            </li>
          ))}
        </ul>
      )}
      <CreateFamilyForm onCreated={handleCreated} />
    </main>
  );
}
```

- [ ] **Step 8: Run to confirm it passes**

```bash
pnpm run test -- FamilyList
```
Expected: 3 passed.

- [ ] **Step 9: Create a minimal `frontend/src/families/FamilyDetail.tsx`** (read-only; Task 6 adds all actions)

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { getFamilyDetail, type FamilyDetail as FamilyDetailType } from "./familyApi";

export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const [detail, setDetail] = useState<FamilyDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    getFamilyDetail(familyId)
      .then((result) => {
        if (!cancelled) setDetail(result);
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }
  if (!detail) {
    return <p role="alert">{t("family.actionFailed")}</p>;
  }

  return (
    <main>
      <h1>{detail.name}</h1>
      <ul>
        {detail.members.map((member) => (
          <li key={member.user_id}>
            {member.display_name} ({t(`role.${member.role}`)})
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 10: Add the routes to `frontend/src/AppRoutes.tsx`**

Add the imports and two new `<Route>` entries (both inside `ProtectedRoute`, alongside the existing `/` route):

```tsx
import { FamilyList } from "./families/FamilyList";
import { FamilyDetail } from "./families/FamilyDetail";
```

```tsx
<Route
  path="/families"
  element={
    <ProtectedRoute>
      <FamilyList />
    </ProtectedRoute>
  }
/>
<Route
  path="/families/:familyId"
  element={
    <ProtectedRoute>
      <FamilyDetail />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 11: Add a link from `frontend/src/routes/HomePage.tsx`**

Add, near the existing logout button:

```tsx
import { Link } from "react-router-dom";
```

```tsx
<p>
  <Link to="/families">{t("family.myFamilies")}</Link>
</p>
```

- [ ] **Step 12: Run the full frontend check suite**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/families frontend/src/AppRoutes.tsx frontend/src/routes/HomePage.tsx frontend/src/i18n frontend/src/api/schema.gen.ts
git commit -m "feat(frontend): add family list, create form, and routing"
```

---

### Task 6: Full family detail — rename, delete, add/remove members, promote/demote

**Files:**
- Modify: `frontend/src/families/FamilyDetail.tsx`
- Create: `frontend/src/families/FamilyDetail.test.tsx`, `frontend/src/families/AddMemberForm.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Phase 2), all of `familyApi.ts` (Task 5)
- Produces: the complete `/families/:familyId` page

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/families/FamilyDetail.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyDetail } from "./FamilyDetail";
import { useAuth } from "../auth/useAuth";

const getFamilyDetailMock = vi.fn();
const removeMemberMock = vi.fn();
const addMemberMock = vi.fn();

vi.mock("./familyApi", () => ({
  getFamilyDetail: (...args: unknown[]) => getFamilyDetailMock(...args),
  removeMember: (...args: unknown[]) => removeMemberMock(...args),
  addMember: (...args: unknown[]) => addMemberMock(...args),
  renameFamily: vi.fn(),
  deleteFamily: vi.fn(),
  changeMemberRole: vi.fn(),
}));
vi.mock("../auth/useAuth");

const OWNER_ID = "11111111-1111-1111-1111-111111111111";
const MEMBER_ID = "22222222-2222-2222-2222-222222222222";

function renderAtFamily(userId: string) {
  vi.mocked(useAuth).mockReturnValue({
    user: { id: userId, email: "user@example.com", display_name: "User" },
    isLoading: false,
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
  });

  return render(
    <MemoryRouter initialEntries={["/families/fam-1"]}>
      <Routes>
        <Route path="/families/:familyId" element={<FamilyDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FamilyDetail", () => {
  beforeEach(() => {
    getFamilyDetailMock.mockReset();
    removeMemberMock.mockReset();
    addMemberMock.mockReset();
    getFamilyDetailMock.mockResolvedValue({
      id: "fam-1",
      name: "My Family",
      members: [
        {
          user_id: OWNER_ID,
          email: "owner@example.com",
          display_name: "Owner Person",
          role: "owner",
        },
        {
          user_id: MEMBER_ID,
          email: "member@example.com",
          display_name: "Member Person",
          role: "member",
        },
      ],
    });
  });

  it("shows a remove button for a member when viewed by the owner", async () => {
    renderAtFamily(OWNER_ID);

    await screen.findByText("Member Person");

    expect(
      screen.getAllByRole("button", { name: "削除" }).length,
    ).toBeGreaterThan(0);
  });

  it("shows a leave button instead of remove for the current member themselves", async () => {
    renderAtFamily(MEMBER_ID);

    await screen.findByText("Member Person");

    expect(screen.getByRole("button", { name: "退出する" })).toBeInTheDocument();
  });

  it("does not show a remove/leave button for the owner row", async () => {
    renderAtFamily(OWNER_ID);

    await screen.findByText("Owner Person");

    expect(screen.queryByRole("button", { name: "退出する" })).not.toBeInTheDocument();
  });

  it("calls addMember when the owner submits the add-member form", async () => {
    addMemberMock.mockResolvedValue({
      user_id: "33333333-3333-3333-3333-333333333333",
      email: "new@example.com",
      display_name: "New Person",
      role: "member",
    });
    const user = userEvent.setup();
    renderAtFamily(OWNER_ID);
    await screen.findByText("Member Person");

    await user.type(screen.getByLabelText("メールアドレス"), "new@example.com");
    await user.click(screen.getByRole("button", { name: "メンバーを追加" }));

    expect(addMemberMock).toHaveBeenCalledWith("fam-1", "new@example.com");
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
pnpm run test -- FamilyDetail
```
Expected: FAIL — no remove/leave/add-member UI exists yet.

- [ ] **Step 3: Create `frontend/src/families/AddMemberForm.tsx`**

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { addMember, type FamilyMemberInfo } from "./familyApi";

export function AddMemberForm({
  familyId,
  onAdded,
}: {
  familyId: string;
  onAdded: (member: FamilyMemberInfo) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const member = await addMember(familyId, email);
      onAdded(member);
      setEmail("");
    } catch (err) {
      setError(
        err instanceof Error && err.message === "member_not_found"
          ? t("family.memberNotFound")
          : err instanceof Error && err.message === "member_already_exists"
            ? t("family.memberAlreadyExists")
            : t("family.actionFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("family.memberEmail")}
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {t("family.addMember")}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Rewrite `frontend/src/families/FamilyDetail.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  changeMemberRole,
  deleteFamily,
  getFamilyDetail,
  removeMember,
  renameFamily,
  type FamilyDetail as FamilyDetailType,
} from "./familyApi";
import { AddMemberForm } from "./AddMemberForm";

export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<FamilyDetailType | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;
    getFamilyDetail(familyId)
      .then((result) => {
        if (!cancelled) {
          setDetail(result);
          setNameInput(result.name);
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }
  if (!detail || !familyId) {
    return <p role="alert">{t("family.actionFailed")}</p>;
  }

  const myMembership = detail.members.find((member) => member.user_id === user?.id);
  const myRole = myMembership?.role;
  const canManage = myRole === "owner" || myRole === "admin";
  const isOwner = myRole === "owner";

  async function handleRename() {
    try {
      const updated = await renameFamily(familyId, nameInput);
      setDetail((current) => (current ? { ...current, name: updated.name } : current));
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleDelete() {
    if (!window.confirm(t("family.confirmDelete"))) return;
    try {
      await deleteFamily(familyId);
      navigate("/families");
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleRemoveOrLeave(userId: string, isSelf: boolean) {
    if (isSelf && !window.confirm(t("family.confirmLeave"))) return;
    try {
      await removeMember(familyId, userId);
      if (isSelf) {
        navigate("/families");
        return;
      }
      setDetail((current) =>
        current
          ? {
              ...current,
              members: current.members.filter((member) => member.user_id !== userId),
            }
          : current,
      );
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  async function handleRoleChange(userId: string, role: "admin" | "member") {
    try {
      const updated = await changeMemberRole(familyId, userId, role);
      setDetail((current) =>
        current
          ? {
              ...current,
              members: current.members.map((member) =>
                member.user_id === userId ? updated : member,
              ),
            }
          : current,
      );
    } catch {
      setError(t("family.actionFailed"));
    }
  }

  return (
    <main>
      {canManage ? (
        <p>
          <input value={nameInput} onChange={(event) => setNameInput(event.target.value)} />
          <button onClick={() => void handleRename()}>{t("family.rename")}</button>
        </p>
      ) : (
        <h1>{detail.name}</h1>
      )}
      {isOwner && <button onClick={() => void handleDelete()}>{t("family.delete")}</button>}
      <ul>
        {detail.members.map((member) => {
          const isSelf = member.user_id === user?.id;
          const canRemove = isSelf
            ? member.role !== "owner"
            : isOwner
              ? member.role !== "owner"
              : canManage && member.role === "member";
          return (
            <li key={member.user_id}>
              {member.display_name} ({t(`role.${member.role}`)})
              {isOwner && member.role !== "owner" && (
                <select
                  value={member.role}
                  onChange={(event) =>
                    void handleRoleChange(
                      member.user_id,
                      event.target.value as "admin" | "member",
                    )
                  }
                >
                  <option value="member">{t("role.member")}</option>
                  <option value="admin">{t("role.admin")}</option>
                </select>
              )}
              {canRemove && (
                <button onClick={() => void handleRemoveOrLeave(member.user_id, isSelf)}>
                  {isSelf ? t("family.leaveFamily") : t("family.removeMember")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {canManage && (
        <AddMemberForm
          familyId={familyId}
          onAdded={(member) =>
            setDetail((current) =>
              current ? { ...current, members: [...current.members, member] } : current,
            )
          }
        />
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Run to confirm it passes**

```bash
pnpm run test -- FamilyDetail
```
Expected: 4 passed.

- [ ] **Step 6: Run the full frontend check suite, including Task 5's `FamilyList` tests**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/families
git commit -m "feat(frontend): add rename, delete, member management, and role changes to family detail"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`

- [ ] **Step 1: Extend `docs/ARCHITECTURE.md`**

Add a new `## Family Management` section (after the existing `## Authentication` section):

```markdown
## Family Management

A user can belong to multiple families. Each membership carries exactly
one role — OWNER (the creator; no ownership transfer in this phase),
ADMIN, or MEMBER — stored as a plain string (`FamilyRole` StrEnum at the
application layer) rather than a Postgres ENUM, so adding a role later
needs no migration.

`app/api/deps.py`'s `get_family_membership` is the family-scoped
counterpart to `get_current_user`: every family route depends on it first
(404 if the family doesn't exist, 403 if the caller isn't a member), then
layers `require_owner`/`require_owner_or_admin` (`app/core/permissions.py`)
on top for actions restricted by role. Later phases scoping data to a
family (expenses, receipts, settlements) should depend on
`get_family_membership` the same way, rather than re-implementing
membership checks.

Adding a member requires they already have an account (looked up by
email) — there are no invite tokens for not-yet-registered users in this
phase.
```

- [ ] **Step 2: Extend `docs/PRODUCT_REQUIREMENTS.md`**

Add a new `## Family Management` section (after the existing `## Authentication` section):

```markdown
## Family Management

A family has members, each with a role: OWNER (creator, full control
including delete), ADMIN (can rename the family, add members, remove
MEMBERs), or MEMBER (view-only, can leave voluntarily). A user can belong
to multiple families. Only the OWNER can delete a family, remove an
ADMIN, or change another member's role; an ADMIN cannot act on another
ADMIN or the OWNER. The OWNER cannot leave their own family — they delete
it instead. Adding a member requires they already have a registered
account; there is no invite-link flow yet. Ownership transfer and audit
logging of membership changes are both deferred to a later phase.
```

- [ ] **Step 3: Extend `docs/I18N.md`'s "Current keys" table**

Add these rows after the existing `auth.*` rows:

```markdown
| `family.myFamilies` | 自分の家族 | Gia đình của tôi |
| `family.noFamilies` | まだ家族がありません | Bạn chưa có gia đình nào |
| `family.create` | 作成 | Tạo |
| `family.name` | 家族名 | Tên gia đình |
| `family.rename` | 名前を変更 | Đổi tên |
| `family.delete` | 削除 | Xóa |
| `family.addMember` | メンバーを追加 | Thêm thành viên |
| `family.memberEmail` | メールアドレス | Địa chỉ email |
| `family.memberNotFound` | 登録されているユーザーが見つかりません | Không tìm thấy người dùng đã đăng ký |
| `family.memberAlreadyExists` | すでにメンバーです | Đã là thành viên |
| `family.removeMember` | 削除 | Xóa |
| `family.leaveFamily` | 退出する | Rời khỏi |
| `family.confirmDelete` | この家族を削除してもよろしいですか? | Bạn có chắc muốn xóa gia đình này? |
| `family.confirmLeave` | この家族から退出してもよろしいですか? | Bạn có chắc muốn rời khỏi gia đình này? |
| `family.actionFailed` | エラーが発生しました。もう一度お試しください | Đã xảy ra lỗi. Vui lòng thử lại |
| `role.owner` | オーナー | Chủ sở hữu |
| `role.admin` | 管理者 | Quản trị viên |
| `role.member` | メンバー | Thành viên |
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/PRODUCT_REQUIREMENTS.md docs/I18N.md
git commit -m "docs: document family management architecture and i18n keys"
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

- [ ] Manually verify end-to-end: log in, go to `/families`, create a family,
  add a second (already-registered) user by email, promote them to ADMIN,
  confirm the permission-gated buttons change accordingly when viewing as
  that second user, then delete the family as the OWNER and confirm it
  disappears from both users' family lists.
- [ ] Confirm `git status` is clean and all commits are on
  `feature/family-management`.
- [ ] Proceed to `superpowers:finishing-a-development-branch`.
