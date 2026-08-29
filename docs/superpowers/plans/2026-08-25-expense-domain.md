# Expense Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Family-scoped expense and category CRUD — manual entry only, integer yen, personal/shared classification, payer distinct from the person logging the entry — with a hybrid global/custom category model, laying the data foundation Phases 5-11 (receipts, OCR, allocation, settlement) build on.

**Architecture:** Two new tables (`categories`, `expenses`), following the exact `get_family_membership`-first authorization pattern Phase 3 established. Categories are either global (`family_id IS NULL`, seeded, immutable) or family-owned custom ones (OWNER/ADMIN-managed). Expenses use a new permission helper, `require_owner_admin_or_creator`, since "who can edit this" now depends on who created the specific row, not just the caller's family role.

**Tech Stack:** No new dependencies — pure application logic on Phase 1-3's FastAPI + SQLAlchemy 2.0 + Alembic backend and Vite + React + TypeScript frontend.

**Spec:** `docs/superpowers/specs/2026-08-25-expense-domain-design.md`

## Global Constraints

- `categories.family_id` is NULLABLE: NULL = global/seeded (immutable, shared by every family), non-NULL = custom (belongs to exactly one family).
- `expenses.amount` is a positive integer (yen) — no floats, DB `CHECK (amount > 0)` plus schema-level `Field(gt=0)` validation (422, not just a DB error).
- Global categories are seeded via migration with stable slugs (`groceries`, `dining`, `transport`, `utilities`, `entertainment`, `other`) as their `name` column — NOT translated strings. Display text is `t("category.<slug>")` for globals; a custom category's `name` is displayed literally (it's free-text the family typed in, not a translation key).
- Permission matrix (binding, from the spec): view expenses/categories — any member. Create an expense or a custom category — any member. Edit/delete an expense — its creator, or an OWNER/ADMIN. Rename/delete a custom category — OWNER/ADMIN only. Rename/delete a global category, or a category belonging to a different family — 403 for everyone, regardless of role.
- `payer_user_id` and the category referenced by an expense must both be valid *for that specific family* (payer is a member of it; category is global or belongs to it) — validated at the API layer, 422 on violation, not silently accepted or left to a DB error.
- Every category/expense endpoint depends on `get_family_membership` first — no endpoint trusts a `family_id` path parameter without verifying membership.
- No hardcoded user-facing strings in the frontend — new `expense.*`/`category.*` i18n keys (plus one new shared `common.cancel`) in both `ja`/`vi`.
- Every task ends with the repo in a committed, working state — `git status` clean, tests passing.

---

## File Structure

```
backend/
  app/
    models/
      category.py
      expense.py
      __init__.py             (modify: export new models)
    schemas/
      expense.py               (all category + expense schemas)
    core/
      permissions.py            (modify: add require_owner_admin_or_creator)
    api/
      v1/
        categories.py
        expenses.py
        router.py                (modify: include both routers)
  alembic/versions/0004_add_categories_and_expenses.py
  tests/
    test_permissions.py          (modify: add new helper's tests)
    test_categories_api.py
    test_expenses_api.py
frontend/
  src/
    expenses/
      expenseApi.ts
      ExpenseList.tsx
      ExpenseList.test.tsx
      ExpenseForm.tsx
      ExpenseForm.test.tsx
    AppRoutes.tsx                 (modify: add /families/:familyId/expenses route)
    families/FamilyDetail.tsx      (modify: add a link to the expenses page)
    i18n/locales/ja/common.json    (modify: add expense.*/category.*/common.cancel keys)
    i18n/locales/vi/common.json    (modify: same)
docs/
  ARCHITECTURE.md                (modify)
  PRODUCT_REQUIREMENTS.md        (modify)
  I18N.md                        (modify)
```

---

### Task 1: Category and Expense models, migration, seed data

**Files:**
- Create: `backend/app/models/category.py`, `backend/app/models/expense.py`, `backend/alembic/versions/0004_add_categories_and_expenses.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Consumes: `app.db.base.Base`
- Produces: `app.models.Category` (table `categories`), `app.models.Expense` (table `expenses`)

- [ ] **Step 1: Create `backend/app/models/category.py`**

```python
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Create `backend/app/models/expense.py`**

```python
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Expense(Base):
    __tablename__ = "expenses"
    __table_args__ = (CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),)

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payer_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    is_shared: Mapped[bool] = mapped_column(Boolean, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500), nullable=True)
    expense_date: Mapped[date] = mapped_column(Date, nullable=False)
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

Note: `payer_user_id`/`created_by_user_id`/`category_id` deliberately have NO `ondelete="CASCADE"` — financial records should not silently vanish if a referenced user or category is ever deleted (no user-deletion feature exists yet, and category deletion is blocked by the same FK when expenses reference it — see Task 3/4).

- [ ] **Step 3: Update `backend/app/models/__init__.py`**

```python
from app.models.category import Category
from app.models.expense import Expense
from app.models.family import Family
from app.models.family_member import FamilyMember, FamilyRole
from app.models.refresh_token import RefreshToken
from app.models.user import User

__all__ = [
    "Category",
    "Expense",
    "Family",
    "FamilyMember",
    "FamilyRole",
    "RefreshToken",
    "User",
]
```

- [ ] **Step 4: Create the migration `backend/alembic/versions/0004_add_categories_and_expenses.py`**

```python
"""add categories and expenses

Revision ID: 0004
Revises: 0003
Create Date: 2026-08-25

"""
import uuid

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

GLOBAL_CATEGORY_SLUGS = [
    "groceries",
    "dining",
    "transport",
    "utilities",
    "entertainment",
    "other",
]


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_categories_family_id", "categories", ["family_id"])

    op.create_table(
        "expenses",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("families.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "payer_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "category_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("categories.id"), nullable=False
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("is_shared", sa.Boolean(), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("amount > 0", name="ck_expenses_amount_positive"),
    )
    op.create_index("ix_expenses_family_id", "expenses", ["family_id"])

    categories_table = sa.table(
        "categories",
        sa.column("id", postgresql.UUID(as_uuid=True)),
        sa.column("family_id", postgresql.UUID(as_uuid=True)),
        sa.column("name", sa.String),
    )
    op.bulk_insert(
        categories_table,
        [{"id": uuid.uuid4(), "family_id": None, "name": slug} for slug in GLOBAL_CATEGORY_SLUGS],
    )


def downgrade() -> None:
    op.drop_index("ix_expenses_family_id", table_name="expenses")
    op.drop_table("expenses")
    op.drop_index("ix_categories_family_id", table_name="categories")
    op.drop_table("categories")
```

If `uv run ruff check .` flags import ordering, fix for real (the working order confirmed in Phases 2-3's equivalent migrations: stdlib imports first, then straight third-party imports, then alphabetized from-imports).

- [ ] **Step 5: Verify the migration against a live database**

```bash
docker compose up -d postgres
cd backend
uv run alembic upgrade head
uv run alembic current
```
Expected: `0004 (head)`.

```bash
docker compose exec postgres psql -U postgres -d family_expense -c "\d categories"
docker compose exec postgres psql -U postgres -d family_expense -c "\d expenses"
docker compose exec postgres psql -U postgres -d family_expense -c "SELECT name, family_id FROM categories ORDER BY name;"
```
Expected: `categories` shows `id, family_id, name, created_at`, FK on `family_id`, index on `family_id`. `expenses` shows all 10 columns, a `CHECK` constraint on `amount`, FKs on `family_id`/`payer_user_id`/`created_by_user_id`/`category_id`, index on `family_id`. The `SELECT` shows exactly 6 rows, one per slug in `GLOBAL_CATEGORY_SLUGS`, all with `family_id` NULL.

- [ ] **Step 6: Verify downgrade, then return to head**

```bash
uv run alembic downgrade 0003
uv run alembic current
```
Expected: plain `0003` (not "(head)" — `0004`'s migration file still exists in the repo, so `0003` is no longer the branch head regardless of which revision the database is stamped at; this is expected, not a bug).

```bash
uv run alembic upgrade head
uv run alembic current
```
Expected: `0004 (head)`, and re-running the `SELECT` from Step 5 again shows exactly 6 seeded rows (not 12 — confirm the seed only ran once, from this upgrade, not duplicated by the round-trip).

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
git commit -m "feat(backend): add Category and Expense models with migration and seed data"
```

---

### Task 2: Schemas and the creator-or-manager permission helper

**Files:**
- Create: `backend/app/schemas/expense.py`
- Modify: `backend/app/core/permissions.py`, `backend/tests/test_permissions.py`

**Interfaces:**
- Consumes: `app.models.Category`, `app.models.Expense`, `app.models.FamilyMember`, `app.models.FamilyRole` (Task 1), `app.core.permissions.require_owner_or_admin` (Phase 3)
- Produces: `app.core.permissions.require_owner_admin_or_creator(membership, creator_user_id)`, schemas `CreateCategoryRequest`, `RenameCategoryRequest`, `CategoryResponse`, `CreateExpenseRequest`, `UpdateExpenseRequest`, `ExpenseResponse`

- [ ] **Step 1: Create `backend/app/schemas/expense.py`**

```python
import uuid
from datetime import date

from pydantic import BaseModel, ConfigDict, Field


class CreateCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class RenameCategoryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class CategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID | None
    name: str


class CreateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date


class UpdateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date


class ExpenseResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    payer_user_id: uuid.UUID
    created_by_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int
    is_shared: bool
    description: str | None
    expense_date: date
```

- [ ] **Step 2: Write the failing tests for the new permission helper**

Add to `backend/tests/test_permissions.py` (the file already has `require_owner`/`require_owner_or_admin` tests from Phase 3 — add these alongside them, and add `import uuid` to the top of the file if it isn't already there):

```python
def test_require_owner_admin_or_creator_allows_the_creator() -> None:
    creator_id = uuid.uuid4()
    require_owner_admin_or_creator(_membership(FamilyRole.MEMBER), creator_id, creator_id)


def test_require_owner_admin_or_creator_allows_owner_for_someone_elses_resource() -> None:
    require_owner_admin_or_creator(_membership(FamilyRole.OWNER), uuid.uuid4(), uuid.uuid4())


def test_require_owner_admin_or_creator_rejects_member_for_someone_elses_resource() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner_admin_or_creator(_membership(FamilyRole.MEMBER), uuid.uuid4(), uuid.uuid4())
    assert exc_info.value.status_code == 403
```

You'll need to update the `_membership` helper (already defined in this file from Phase 3) to also accept a `user_id`, since `require_owner_admin_or_creator` needs to compare the membership's own `user_id` against the resource's creator. Change it from:

```python
def _membership(role: str) -> FamilyMember:
    return FamilyMember(role=role)
```

to:

```python
def _membership(role: str, user_id: uuid.UUID | None = None) -> FamilyMember:
    return FamilyMember(role=role, user_id=user_id or uuid.uuid4())
```

and update the three new tests above to pass the SAME `user_id` to both `_membership(...)` and the creator argument when testing the "is the creator" case:

```python
def test_require_owner_admin_or_creator_allows_the_creator() -> None:
    creator_id = uuid.uuid4()
    require_owner_admin_or_creator(_membership(FamilyRole.MEMBER, creator_id), creator_id, uuid.uuid4())
```

(The extra `uuid.uuid4()` third argument above is a stand-in for a family_id or similar if your final signature needs one — it doesn't; re-read the Step 3 implementation below and match your test calls to its actual two-argument signature: `require_owner_admin_or_creator(membership, creator_user_id)`. Fix the test calls above to only pass two arguments, matching that signature exactly — the extra argument shown was a mistake in this description, not the real signature.)

- [ ] **Step 3: Run to confirm the new tests fail**

```bash
cd backend && uv run pytest tests/test_permissions.py -v
```
Expected: the 4 existing Phase-3 tests still pass; the 3 new tests fail with `NameError`/`ImportError` (`require_owner_admin_or_creator` doesn't exist yet).

- [ ] **Step 4: Add `require_owner_admin_or_creator` to `backend/app/core/permissions.py`**

Add `import uuid` to the top of the file (alongside the existing imports), and append:

```python
def require_owner_admin_or_creator(
    membership: FamilyMember, creator_user_id: uuid.UUID
) -> None:
    if membership.user_id == creator_user_id:
        return
    require_owner_or_admin(membership)
```

- [ ] **Step 5: Run to confirm it passes**

```bash
uv run pytest tests/test_permissions.py -v
```
Expected: 7 passed.

- [ ] **Step 6: Run the full backend suite, ruff, and mypy**

```bash
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/expense.py backend/app/core/permissions.py backend/tests/test_permissions.py
git commit -m "feat(backend): add expense/category schemas and creator-or-manager permission helper"
```

---

### Task 3: Category endpoints

**Files:**
- Create: `backend/app/api/v1/categories.py`, `backend/tests/test_categories_api.py`
- Modify: `backend/app/api/v1/router.py`

**Interfaces:**
- Consumes: `app.api.deps.get_family_membership`, `app.core.permissions.require_owner_or_admin`, `app.models.Category`, schemas from Task 2
- Produces: `app.api.v1.categories.router`, mounted under `/api/v1/families/{family_id}/categories`, with `GET /`, `POST /`, `PATCH /{category_id}`, `DELETE /{category_id}`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_categories_api.py`:

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
async def test_fresh_family_sees_only_seeded_global_categories(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.get(f"/api/v1/families/{family_id}/categories/")

    assert response.status_code == 200
    categories = response.json()
    assert len(categories) == 6
    assert all(category["family_id"] is None for category in categories)
    assert {category["name"] for category in categories} == {
        "groceries",
        "dining",
        "transport",
        "utilities",
        "entertainment",
        "other",
    }


@pytest.mark.integration
async def test_member_can_create_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Kids' School Supplies"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Kids' School Supplies"
    assert body["family_id"] == family_id


@pytest.mark.integration
async def test_member_cannot_rename_or_delete_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Custom"}
    )
    category_id = create_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )

        rename_response = await member_client.patch(
            f"/api/v1/families/{family_id}/categories/{category_id}", json={"name": "Hijacked"}
        )
        delete_response = await member_client.delete(
            f"/api/v1/families/{family_id}/categories/{category_id}"
        )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_owner_can_rename_and_delete_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "Custom"}
    )
    category_id = create_response.json()["id"]

    rename_response = await client.patch(
        f"/api/v1/families/{family_id}/categories/{category_id}", json={"name": "Renamed"}
    )
    assert rename_response.status_code == 200
    assert rename_response.json()["name"] == "Renamed"

    delete_response = await client.delete(f"/api/v1/families/{family_id}/categories/{category_id}")
    assert delete_response.status_code == 204


@pytest.mark.integration
async def test_owner_cannot_rename_or_delete_a_global_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    list_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    global_category_id = list_response.json()[0]["id"]

    rename_response = await client.patch(
        f"/api/v1/families/{family_id}/categories/{global_category_id}", json={"name": "Hijacked"}
    )
    delete_response = await client.delete(
        f"/api/v1/families/{family_id}/categories/{global_category_id}"
    )

    assert rename_response.status_code == 403
    assert delete_response.status_code == 403


@pytest.mark.integration
async def test_owner_cannot_mutate_another_familys_custom_category(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    create_response = await client.post(
        f"/api/v1/families/{family_a_id}/categories/", json={"name": "A's Custom"}
    )
    category_id = create_response.json()["id"]

    family_b_id = await _create_family(client, "Family B")

    rename_response = await client.patch(
        f"/api/v1/families/{family_b_id}/categories/{category_id}", json={"name": "Hijacked"}
    )

    assert rename_response.status_code == 403
```

- [ ] **Step 2: Run to confirm it fails**

```bash
docker compose up -d postgres redis
cd backend
uv run alembic upgrade head
uv run pytest tests/test_categories_api.py -v -m integration
```
Expected: FAIL — 404s, `/api/v1/families/{family_id}/categories/` doesn't exist yet.

- [ ] **Step 3: Implement `backend/app/api/v1/categories.py`**

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_family_membership
from app.core.permissions import require_owner_or_admin
from app.db.session import get_session
from app.models.category import Category
from app.models.family_member import FamilyMember
from app.schemas.expense import CategoryResponse, CreateCategoryRequest, RenameCategoryRequest

router = APIRouter()


@router.get("/", response_model=list[CategoryResponse])
async def list_categories(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Category]:
    result = await session.scalars(
        select(Category)
        .where((Category.family_id.is_(None)) | (Category.family_id == family_id))
        .order_by(Category.created_at)
    )
    return list(result.all())


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=CategoryResponse)
async def create_category(
    family_id: uuid.UUID,
    payload: CreateCategoryRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Category:
    category = Category(family_id=family_id, name=payload.name)
    session.add(category)
    await session.commit()
    return category


async def _get_mutable_category(
    family_id: uuid.UUID, category_id: uuid.UUID, session: AsyncSession
) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    if category.family_id != family_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This category cannot be modified by this family",
        )
    return category


@router.patch("/{category_id}", response_model=CategoryResponse)
async def rename_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID,
    payload: RenameCategoryRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Category:
    require_owner_or_admin(membership)
    category = await _get_mutable_category(family_id, category_id, session)
    category.name = payload.name
    await session.commit()
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    require_owner_or_admin(membership)
    category = await _get_mutable_category(family_id, category_id, session)
    await session.delete(category)
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete a category that has expenses",
        )
```

Note: `category.family_id != family_id` correctly rejects both cases in one comparison — a global category (`family_id=None`) is never equal to a real UUID, and a different family's custom category is never equal to *this* family's id either.

- [ ] **Step 4: Wire the router into `backend/app/api/v1/router.py`**

```python
from fastapi import APIRouter

from app.api.v1 import auth, categories, expenses, families, ping

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
```

(This imports `expenses` before that module exists — Task 4 creates it. If you're running Task 3 in isolation and Task 4 hasn't landed yet, this import will fail; that's expected and resolves once Task 4's file exists. If executing tasks in order, `expenses.py` won't exist yet when you reach this step — create a minimal placeholder `backend/app/api/v1/expenses.py` with just `from fastapi import APIRouter` and `router = APIRouter()` for now, and Task 4 will replace its contents.)

- [ ] **Step 5: Create the placeholder `backend/app/api/v1/expenses.py`** (Task 4 replaces this)

```python
from fastapi import APIRouter

router = APIRouter()
```

- [ ] **Step 6: Run the integration tests against real Postgres**

```bash
uv run pytest tests/test_categories_api.py -v -m integration
```
Expected: 6 passed.

- [ ] **Step 7: Regenerate the OpenAPI schema and run the full suite**

```bash
uv run python scripts/export_openapi.py
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: `openapi/openapi.json` now contains `/api/v1/families/{family_id}/categories/` and `/api/v1/families/{family_id}/categories/{category_id}`, plus `CategoryResponse`; all checks clean.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/categories.py backend/app/api/v1/expenses.py backend/app/api/v1/router.py backend/tests/test_categories_api.py openapi/openapi.json
git commit -m "feat(backend): add category endpoints"
```

---

### Task 4: Expense endpoints

**Files:**
- Modify: `backend/app/api/v1/expenses.py` (replacing Task 3's placeholder)
- Create: `backend/tests/test_expenses_api.py`
- Modify: `backend/tests/test_categories_api.py` (one cross-cutting test added here, since it needs both categories and expenses to exist)

**Interfaces:**
- Consumes: `app.api.deps.get_current_user`, `app.api.deps.get_family_membership`, `app.core.permissions.require_owner_admin_or_creator`, `app.models.Category`, `app.models.Expense`, `app.models.FamilyMember`, `app.models.User`, schemas from Task 2
- Produces: `app.api.v1.expenses.router`, mounted under `/api/v1/families/{family_id}/expenses`, with `GET /`, `POST /`, `GET /{expense_id}`, `PATCH /{expense_id}`, `DELETE /{expense_id}`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_expenses_api.py`:

```python
import uuid
from datetime import date

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


async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    return response.json()[0]["id"]


def _expense_payload(payer_user_id: str, category_id: str, amount: int = 1000) -> dict:
    return {
        "payer_user_id": payer_user_id,
        "category_id": category_id,
        "amount": amount,
        "is_shared": False,
        "description": "Test expense",
        "expense_date": date.today().isoformat(),
    }


@pytest.mark.integration
async def test_create_expense_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1500),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["amount"] == 1500
    assert body["payer_user_id"] == owner["id"]
    assert body["created_by_user_id"] == owner["id"]
    assert body["is_shared"] is False


@pytest.mark.integration
async def test_create_expense_rejects_payer_not_in_family(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(str(uuid.uuid4()), category_id),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_create_expense_rejects_another_familys_custom_category(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    family_b_id = await _create_family(client, "Family B")
    other_category_response = await client.post(
        f"/api/v1/families/{family_b_id}/categories/", json={"name": "B's Custom"}
    )
    other_category_id = other_category_response.json()["id"]

    response = await client.post(
        f"/api/v1/families/{family_a_id}/expenses/",
        json=_expense_payload(owner["id"], other_category_id),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_create_expense_rejects_non_positive_amount(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=0),
    )

    assert response.status_code == 422


@pytest.mark.integration
async def test_list_expenses_scoped_to_family(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_a_id = await _create_family(client, "Family A")
    family_b_id = await _create_family(client, "Family B")
    category_a_id = await _get_global_category_id(client, family_a_id)
    category_b_id = await _get_global_category_id(client, family_b_id)

    await client.post(
        f"/api/v1/families/{family_a_id}/expenses/",
        json=_expense_payload(owner["id"], category_a_id),
    )
    await client.post(
        f"/api/v1/families/{family_b_id}/expenses/",
        json=_expense_payload(owner["id"], category_b_id),
    )

    response = await client.get(f"/api/v1/families/{family_a_id}/expenses/")

    assert response.status_code == 200
    expenses = response.json()
    assert len(expenses) == 1
    assert expenses[0]["family_id"] == family_a_id


@pytest.mark.integration
async def test_list_expenses_rejects_non_member(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as other_client:
        await _register(other_client, _unique_email())
        response = await other_client.get(f"/api/v1/families/{family_id}/expenses/")

    assert response.status_code == 403


@pytest.mark.integration
async def test_edit_expense_as_creator_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1000),
    )
    expense_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/v1/families/{family_id}/expenses/{expense_id}",
        json=_expense_payload(owner["id"], category_id, amount=2000),
    )

    assert response.status_code == 200
    assert response.json()["amount"] == 2000


@pytest.mark.integration
async def test_edit_expense_as_owner_who_did_not_create_it_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        member_user = await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        create_response = await member_client.post(
            f"/api/v1/families/{family_id}/expenses/",
            json=_expense_payload(member_user["id"], category_id, amount=500),
        )
    expense_id = create_response.json()["id"]

    response = await client.patch(
        f"/api/v1/families/{family_id}/expenses/{expense_id}",
        json=_expense_payload(member_user["id"], category_id, amount=750),
    )

    assert response.status_code == 200
    assert response.json()["amount"] == 750


@pytest.mark.integration
async def test_edit_expense_as_member_who_did_not_create_it_rejected(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id, amount=1000),
    )
    expense_id = create_response.json()["id"]

    member_email = _unique_email()
    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="http://test"
    ) as member_client:
        await _register(member_client, member_email)
        await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )

        response = await member_client.patch(
            f"/api/v1/families/{family_id}/expenses/{expense_id}",
            json=_expense_payload(owner["id"], category_id, amount=9999),
        )

    assert response.status_code == 403


@pytest.mark.integration
async def test_delete_expense_as_creator_succeeds(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    create_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json=_expense_payload(owner["id"], category_id),
    )
    expense_id = create_response.json()["id"]

    response = await client.delete(f"/api/v1/families/{family_id}/expenses/{expense_id}")

    assert response.status_code == 204
    get_response = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert get_response.status_code == 404
```

- [ ] **Step 2: Run to confirm it fails**

```bash
uv run pytest tests/test_expenses_api.py -v -m integration
```
Expected: FAIL — the placeholder router from Task 3 has no routes yet.

- [ ] **Step 3: Implement `backend/app/api/v1/expenses.py`** (replacing the Task 3 placeholder entirely)

```python
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.permissions import require_owner_admin_or_creator
from app.db.session import get_session
from app.models.category import Category
from app.models.expense import Expense
from app.models.family_member import FamilyMember
from app.models.user import User
from app.schemas.expense import CreateExpenseRequest, ExpenseResponse, UpdateExpenseRequest

router = APIRouter()


async def _validate_payer(
    family_id: uuid.UUID, payer_user_id: uuid.UUID, session: AsyncSession
) -> None:
    membership = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == payer_user_id
        )
    )
    if membership is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="payer_user_id is not a member of this family",
        )


async def _validate_category(
    family_id: uuid.UUID, category_id: uuid.UUID, session: AsyncSession
) -> None:
    category = await session.get(Category, category_id)
    if category is None or (category.family_id is not None and category.family_id != family_id):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="category_id is not a valid category for this family",
        )


@router.get("/", response_model=list[ExpenseResponse])
async def list_expenses(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Expense]:
    result = await session.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    return list(result.all())


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ExpenseResponse)
async def create_expense(
    family_id: uuid.UUID,
    payload: CreateExpenseRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Expense:
    await _validate_payer(family_id, payload.payer_user_id, session)
    await _validate_category(family_id, payload.category_id, session)

    expense = Expense(
        family_id=family_id,
        payer_user_id=payload.payer_user_id,
        created_by_user_id=user.id,
        category_id=payload.category_id,
        amount=payload.amount,
        is_shared=payload.is_shared,
        description=payload.description,
        expense_date=payload.expense_date,
    )
    session.add(expense)
    await session.commit()
    return expense


async def _get_expense_or_404(
    family_id: uuid.UUID, expense_id: uuid.UUID, session: AsyncSession
) -> Expense:
    expense = await session.scalar(
        select(Expense).where(Expense.id == expense_id, Expense.family_id == family_id)
    )
    if expense is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Expense not found")
    return expense


@router.get("/{expense_id}", response_model=ExpenseResponse)
async def get_expense(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Expense:
    return await _get_expense_or_404(family_id, expense_id, session)


@router.patch("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    payload: UpdateExpenseRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Expense:
    expense = await _get_expense_or_404(family_id, expense_id, session)
    require_owner_admin_or_creator(membership, expense.created_by_user_id)

    await _validate_payer(family_id, payload.payer_user_id, session)
    await _validate_category(family_id, payload.category_id, session)

    expense.payer_user_id = payload.payer_user_id
    expense.category_id = payload.category_id
    expense.amount = payload.amount
    expense.is_shared = payload.is_shared
    expense.description = payload.description
    expense.expense_date = payload.expense_date
    await session.commit()
    return expense


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    expense = await _get_expense_or_404(family_id, expense_id, session)
    require_owner_admin_or_creator(membership, expense.created_by_user_id)
    await session.delete(expense)
    await session.commit()
```

- [ ] **Step 4: Run the integration tests against real Postgres**

```bash
uv run pytest tests/test_expenses_api.py -v -m integration
```
Expected: 9 passed.

- [ ] **Step 5: Add the cross-cutting category+expense test**

Add to `backend/tests/test_categories_api.py` (this needs the expense-creation endpoint, which now exists):

```python
async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    return response.json()[0]["id"]


@pytest.mark.integration
async def test_cannot_delete_a_category_referenced_by_an_expense(client: AsyncClient) -> None:
    from datetime import date

    owner = await _register(client, _unique_email())
    family_id = await _create_family(client)
    create_category_response = await client.post(
        f"/api/v1/families/{family_id}/categories/", json={"name": "In Use"}
    )
    category_id = create_category_response.json()["id"]

    await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": owner["id"],
            "category_id": category_id,
            "amount": 1000,
            "is_shared": False,
            "description": None,
            "expense_date": date.today().isoformat(),
        },
    )

    response = await client.delete(f"/api/v1/families/{family_id}/categories/{category_id}")

    assert response.status_code == 409
```

(Note the local `from datetime import date` inside the test — add it as a top-level import at the top of `test_categories_api.py` instead if you prefer; either works, just be consistent with the rest of the file's style.)

- [ ] **Step 6: Run to confirm the new test passes too**

```bash
uv run pytest tests/test_categories_api.py tests/test_expenses_api.py -v -m integration
```
Expected: 7 + 9 = 16 passed.

- [ ] **Step 7: Regenerate the OpenAPI schema and run the full suite**

```bash
uv run python scripts/export_openapi.py
uv run pytest -m "not integration"
uv run ruff check .
uv run mypy .
```
Expected: `openapi/openapi.json` now also contains the five expense endpoints and `ExpenseResponse`/`CreateExpenseRequest`/`UpdateExpenseRequest`; all checks clean.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/expenses.py backend/tests/test_expenses_api.py backend/tests/test_categories_api.py openapi/openapi.json
git commit -m "feat(backend): add expense endpoints with payer/category validation"
```

---

### Task 5: Frontend expense list and routing

**Files:**
- Create: `frontend/src/expenses/expenseApi.ts`, `frontend/src/expenses/ExpenseList.tsx`, `frontend/src/expenses/ExpenseList.test.tsx`
- Modify: `frontend/src/AppRoutes.tsx`, `frontend/src/families/FamilyDetail.tsx`, `frontend/src/i18n/locales/ja/common.json`, `frontend/src/i18n/locales/vi/common.json`

**Interfaces:**
- Consumes: the regenerated `openapi/openapi.json` (Tasks 3-4), `getFamilyDetail` (Phase 3's `familyApi.ts`)
- Produces: `frontend/src/api/schema.gen.ts` (regenerated), `expenseApi.ts`'s exported functions, the `/families/:familyId/expenses` route

**Note:** This task is read-only (list expenses, resolve category/payer display names) — Task 6 adds create/edit/delete and category management, mirroring how Phase 3 split `FamilyList`+minimal `FamilyDetail` (Task 5) from the full mutation UI (Task 6).

- [ ] **Step 1: Regenerate the frontend API types**

```bash
cd frontend
pnpm run generate:api-types
```
Expected: `src/api/schema.gen.ts` now includes the category and expense paths/schemas.

- [ ] **Step 2: Add the i18n keys**

Add to `frontend/src/i18n/locales/ja/common.json` (new top-level `"expense"` and `"category"` keys; also add `"cancel"` inside the EXISTING `"common"` object, not as a new top-level key):

```json
  "expense": {
    "myExpenses": "支出一覧",
    "noExpenses": "まだ支出がありません",
    "amount": "金額",
    "category": "カテゴリー",
    "payer": "支払者",
    "description": "メモ",
    "date": "日付",
    "personal": "個人",
    "shared": "共同",
    "addExpense": "追加",
    "editExpense": "編集",
    "deleteExpense": "削除",
    "confirmDeleteExpense": "この支出を削除してもよろしいですか?",
    "addCategory": "カテゴリーを追加",
    "newCategoryName": "新しいカテゴリー名",
    "actionFailed": "エラーが発生しました。もう一度お試しください",
    "amountMustBePositive": "金額は1円以上で入力してください",
    "invalidPayerOrCategory": "支払者またはカテゴリーが無効です"
  },
  "category": {
    "groceries": "食料品",
    "dining": "外食",
    "transport": "交通費",
    "utilities": "光熱費",
    "entertainment": "娯楽",
    "other": "その他"
  }
```

And inside the existing `"common"` object, add `"cancel": "キャンセル"` as a new key alongside `"loading"`/`"language"`.

Add the equivalent to `frontend/src/i18n/locales/vi/common.json`:

```json
  "expense": {
    "myExpenses": "Danh sách chi tiêu",
    "noExpenses": "Chưa có khoản chi nào",
    "amount": "Số tiền",
    "category": "Danh mục",
    "payer": "Người thanh toán",
    "description": "Ghi chú",
    "date": "Ngày",
    "personal": "Cá nhân",
    "shared": "Chung",
    "addExpense": "Thêm",
    "editExpense": "Sửa",
    "deleteExpense": "Xóa",
    "confirmDeleteExpense": "Bạn có chắc muốn xóa khoản chi này?",
    "addCategory": "Thêm danh mục",
    "newCategoryName": "Tên danh mục mới",
    "actionFailed": "Đã xảy ra lỗi. Vui lòng thử lại",
    "amountMustBePositive": "Số tiền phải lớn hơn 0",
    "invalidPayerOrCategory": "Người thanh toán hoặc danh mục không hợp lệ"
  },
  "category": {
    "groceries": "Thực phẩm",
    "dining": "Ăn ngoài",
    "transport": "Đi lại",
    "utilities": "Tiện ích",
    "entertainment": "Giải trí",
    "other": "Khác"
  }
```

And inside the existing `"common"` object: `"cancel": "Hủy"`.

(Both files must remain valid JSON — add commas after preceding keys' closing braces as needed.)

- [ ] **Step 3: Create `frontend/src/expenses/expenseApi.ts`**

```ts
import { apiClient } from "../api/client";
import type { components } from "../api/schema.gen";

export type Category = components["schemas"]["CategoryResponse"];
export type Expense = components["schemas"]["ExpenseResponse"];

export interface ExpenseInput {
  payer_user_id: string;
  category_id: string;
  amount: number;
  is_shared: boolean;
  description?: string | null;
  expense_date: string;
}

export function resolveCategoryDisplayName(
  category: Category,
  t: (key: string) => string,
): string {
  return category.family_id === null ? t(`category.${category.name}`) : category.name;
}

export async function listCategories(familyId: string): Promise<Category[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_categories_failed");
  }
  return data;
}

export async function createCategory(familyId: string, name: string): Promise<Category> {
  const { data, error } = await apiClient.POST("/api/v1/families/{family_id}/categories/", {
    params: { path: { family_id: familyId } },
    body: { name },
  });
  if (error || !data) {
    throw new Error("create_category_failed");
  }
  return data;
}

export async function renameCategory(
  familyId: string,
  categoryId: string,
  name: string,
): Promise<Category> {
  const { data, error } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/categories/{category_id}",
    {
      params: { path: { family_id: familyId, category_id: categoryId } },
      body: { name },
    },
  );
  if (error || !data) {
    throw new Error("rename_category_failed");
  }
  return data;
}

export async function deleteCategory(familyId: string, categoryId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/categories/{category_id}",
    { params: { path: { family_id: familyId, category_id: categoryId } } },
  );
  if (error) {
    if (response.status === 409) {
      throw new Error("category_has_expenses");
    }
    throw new Error("delete_category_failed");
  }
}

export async function listExpenses(familyId: string): Promise<Expense[]> {
  const { data, error } = await apiClient.GET("/api/v1/families/{family_id}/expenses/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw new Error("list_expenses_failed");
  }
  return data;
}

export async function createExpense(familyId: string, input: ExpenseInput): Promise<Expense> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/expenses/",
    {
      params: { path: { family_id: familyId } },
      body: input,
    },
  );
  if (error || !data) {
    if (response.status === 422) {
      throw new Error("invalid_payer_or_category");
    }
    throw new Error("create_expense_failed");
  }
  return data;
}

export async function updateExpense(
  familyId: string,
  expenseId: string,
  input: ExpenseInput,
): Promise<Expense> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/expenses/{expense_id}",
    {
      params: { path: { family_id: familyId, expense_id: expenseId } },
      body: input,
    },
  );
  if (error || !data) {
    if (response.status === 422) {
      throw new Error("invalid_payer_or_category");
    }
    if (response.status === 403) {
      throw new Error("not_permitted");
    }
    throw new Error("update_expense_failed");
  }
  return data;
}

export async function deleteExpense(familyId: string, expenseId: string): Promise<void> {
  const { error } = await apiClient.DELETE("/api/v1/families/{family_id}/expenses/{expense_id}", {
    params: { path: { family_id: familyId, expense_id: expenseId } },
  });
  if (error) {
    throw new Error("delete_expense_failed");
  }
}
```

- [ ] **Step 4: Write the failing test for `ExpenseList`**

Create `frontend/src/expenses/ExpenseList.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ExpenseList } from "./ExpenseList";
import { getFamilyDetail } from "../families/familyApi";

const listExpensesMock = vi.fn();
const listCategoriesMock = vi.fn();

vi.mock("./expenseApi", async () => {
  const actual = await vi.importActual<typeof import("./expenseApi")>("./expenseApi");
  return {
    ...actual,
    listExpenses: (...args: unknown[]) => listExpensesMock(...args),
    listCategories: (...args: unknown[]) => listCategoriesMock(...args),
  };
});
vi.mock("../families/familyApi", () => ({
  getFamilyDetail: vi.fn(),
}));

function renderAt() {
  return render(
    <MemoryRouter initialEntries={["/families/fam-1/expenses"]}>
      <Routes>
        <Route path="/families/:familyId/expenses" element={<ExpenseList />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ExpenseList", () => {
  beforeEach(() => {
    listExpensesMock.mockReset();
    listCategoriesMock.mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
      ],
    });
  });

  it("shows the empty state when there are no expenses", async () => {
    listExpensesMock.mockResolvedValue([]);
    listCategoriesMock.mockResolvedValue([]);

    renderAt();

    expect(await screen.findByText("まだ支出がありません")).toBeInTheDocument();
  });

  it("renders an expense with its resolved category and payer names", async () => {
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u1",
        created_by_user_id: "u1",
        category_id: "cat-1",
        amount: 1500,
        is_shared: false,
        description: "Weekly groceries",
        expense_date: "2026-08-25",
      },
    ]);
    listCategoriesMock.mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries" },
    ]);

    renderAt();

    expect(await screen.findByText(/1500/)).toBeInTheDocument();
    expect(await screen.findByText(/食料品/)).toBeInTheDocument();
    expect(await screen.findByText(/Alice/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to confirm it fails**

```bash
pnpm run test -- ExpenseList
```
Expected: FAIL — `ExpenseList` doesn't exist yet.

- [ ] **Step 6: Create `frontend/src/expenses/ExpenseList.tsx`**

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { getFamilyDetail } from "../families/familyApi";
import {
  listCategories,
  listExpenses,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "./expenseApi";

export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;

    Promise.all([listExpenses(familyId), listCategories(familyId), getFamilyDetail(familyId)])
      .then(([expenseResult, categoryResult, familyDetail]) => {
        if (cancelled) return;
        setExpenses(expenseResult);
        setCategories(categoryResult);
        setMemberNames(
          Object.fromEntries(
            familyDetail.members.map((member) => [member.user_id, member.display_name]),
          ),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setExpenses([]);
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId]);

  function categoryDisplayName(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    return category ? resolveCategoryDisplayName(category, t) : categoryId;
  }

  if (isLoading) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("expense.myExpenses")}</h1>
      {expenses.length === 0 ? (
        <p>{t("expense.noExpenses")}</p>
      ) : (
        <ul>
          {expenses.map((expense) => (
            <li key={expense.id}>
              {expense.amount} — {categoryDisplayName(expense.category_id)} —{" "}
              {memberNames[expense.payer_user_id] ?? expense.payer_user_id} —{" "}
              {expense.expense_date} (
              {expense.is_shared ? t("expense.shared") : t("expense.personal")})
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
```

- [ ] **Step 7: Run to confirm it passes**

```bash
pnpm run test -- ExpenseList
```
Expected: 2 passed.

- [ ] **Step 8: Add the route to `frontend/src/AppRoutes.tsx`**

Add the import and one new `<Route>` (inside `ProtectedRoute`, alongside the existing family routes):

```tsx
import { ExpenseList } from "./expenses/ExpenseList";
```

```tsx
<Route
  path="/families/:familyId/expenses"
  element={
    <ProtectedRoute>
      <ExpenseList />
    </ProtectedRoute>
  }
/>
```

- [ ] **Step 9: Add a link from `frontend/src/families/FamilyDetail.tsx`**

Add, near the top of the rendered content (needs `Link` from `react-router-dom`, and `familyId` is already available from `useParams` in this component):

```tsx
<p>
  <Link to={`/families/${familyId}/expenses`}>{t("expense.myExpenses")}</Link>
</p>
```

- [ ] **Step 10: Run the full frontend check suite**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/expenses frontend/src/AppRoutes.tsx frontend/src/families/FamilyDetail.tsx frontend/src/i18n frontend/src/api/schema.gen.ts
git commit -m "feat(frontend): add expense list, routing, and category/payer name resolution"
```

---

### Task 6: Expense create/edit form and category management

**Files:**
- Modify: `frontend/src/expenses/ExpenseList.tsx`, `frontend/src/expenses/ExpenseList.test.tsx`
- Create: `frontend/src/expenses/ExpenseForm.tsx`, `frontend/src/expenses/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: `useAuth()` (Phase 2), `getFamilyDetail` (Phase 3), all of `expenseApi.ts` (Task 5)
- Produces: the complete `/families/:familyId/expenses` page with create/edit/delete and inline category creation

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/expenses/ExpenseForm.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { ExpenseForm } from "./ExpenseForm";
import { getFamilyDetail } from "../families/familyApi";
import { createCategory, createExpense, listCategories } from "./expenseApi";

vi.mock("./expenseApi", async () => {
  const actual = await vi.importActual<typeof import("./expenseApi")>("./expenseApi");
  return {
    ...actual,
    listCategories: vi.fn(),
    createCategory: vi.fn(),
    createExpense: vi.fn(),
    updateExpense: vi.fn(),
  };
});
vi.mock("../families/familyApi", () => ({
  getFamilyDetail: vi.fn(),
}));

describe("ExpenseForm", () => {
  const onSaved = vi.fn();

  beforeEach(() => {
    onSaved.mockReset();
    vi.mocked(listCategories).mockReset();
    vi.mocked(createCategory).mockReset();
    vi.mocked(createExpense).mockReset();
    vi.mocked(getFamilyDetail).mockReset();

    vi.mocked(listCategories).mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries" },
    ]);
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
      ],
    });
  });

  it("shows a validation error for a non-positive amount without calling the API", async () => {
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "0");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "金額は1円以上で入力してください",
    );
    expect(createExpense).not.toHaveBeenCalled();
  });

  it("submits the selected payer, category, and amount", async () => {
    vi.mocked(createExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      payer_user_id: "u1",
      created_by_user_id: "u1",
      category_id: "cat-1",
      amount: 1200,
      is_shared: false,
      description: null,
      expense_date: "2026-08-25",
    });
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.clear(screen.getByLabelText("金額"));
    await user.type(screen.getByLabelText("金額"), "1200");
    await user.click(screen.getByRole("button", { name: "追加" }));

    expect(createExpense).toHaveBeenCalledWith(
      "fam-1",
      expect.objectContaining({ payer_user_id: "u1", category_id: "cat-1", amount: 1200 }),
    );
    expect(onSaved).toHaveBeenCalled();
  });

  it("creates a new category and selects it", async () => {
    vi.mocked(createCategory).mockResolvedValue({
      id: "cat-2",
      family_id: "fam-1",
      name: "Custom Thing",
    });
    const user = userEvent.setup();
    render(<ExpenseForm familyId="fam-1" onSaved={onSaved} />, { wrapper: MemoryRouter });
    await screen.findByText("食料品");

    await user.type(screen.getByLabelText("新しいカテゴリー名"), "Custom Thing");
    await user.click(screen.getByRole("button", { name: "カテゴリーを追加" }));

    expect(createCategory).toHaveBeenCalledWith("fam-1", "Custom Thing");
    expect(await screen.findByText("Custom Thing")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd frontend && pnpm run test -- ExpenseForm
```
Expected: FAIL — `ExpenseForm` doesn't exist yet.

- [ ] **Step 3: Create `frontend/src/expenses/ExpenseForm.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { getFamilyDetail, type FamilyMemberInfo } from "../families/familyApi";
import {
  createCategory,
  createExpense,
  listCategories,
  resolveCategoryDisplayName,
  updateExpense,
  type Category,
  type Expense,
} from "./expenseApi";

interface ExpenseFormProps {
  familyId: string;
  expense?: Expense;
  onSaved: (expense: Expense) => void;
  onCancel?: () => void;
}

const MIN_AMOUNT = 1;

export function ExpenseForm({ familyId, expense, onSaved, onCancel }: ExpenseFormProps) {
  const { t } = useTranslation();
  const [categories, setCategories] = useState<Category[]>([]);
  const [members, setMembers] = useState<FamilyMemberInfo[]>([]);
  const [payerUserId, setPayerUserId] = useState(expense?.payer_user_id ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [isShared, setIsShared] = useState(expense?.is_shared ?? false);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  );
  const [newCategoryName, setNewCategoryName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listCategories(familyId), getFamilyDetail(familyId)]).then(
      ([categoryResult, familyDetail]) => {
        if (cancelled) return;
        setCategories(categoryResult);
        setMembers(familyDetail.members);
        setCategoryId((current) => current || categoryResult[0]?.id || "");
        setPayerUserId((current) => current || familyDetail.members[0]?.user_id || "");
      },
    );
    return () => {
      cancelled = true;
    };
  }, [familyId]);

  async function handleCreateCategory() {
    const trimmedName = newCategoryName.trim();
    if (!trimmedName) return;
    try {
      const category = await createCategory(familyId, trimmedName);
      setCategories((current) => [...current, category]);
      setCategoryId(category.id);
      setNewCategoryName("");
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(amount);
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
      setError(t("expense.amountMustBePositive"));
      return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const input = {
        payer_user_id: payerUserId,
        category_id: categoryId,
        amount: parsedAmount,
        is_shared: isShared,
        description: description || null,
        expense_date: expenseDate,
      };
      const saved = expense
        ? await updateExpense(familyId, expense.id, input)
        : await createExpense(familyId, input);
      onSaved(saved);
    } catch (err) {
      setError(
        err instanceof Error && err.message === "invalid_payer_or_category"
          ? t("expense.invalidPayerOrCategory")
          : t("expense.actionFailed"),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        {t("expense.payer")}
        <select value={payerUserId} onChange={(event) => setPayerUserId(event.target.value)}>
          {members.map((member) => (
            <option key={member.user_id} value={member.user_id}>
              {member.display_name}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("expense.category")}
        <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {resolveCategoryDisplayName(category, t)}
            </option>
          ))}
        </select>
      </label>
      <label>
        {t("expense.newCategoryName")}
        <input
          type="text"
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
        />
      </label>
      <button type="button" onClick={() => void handleCreateCategory()}>
        {t("expense.addCategory")}
      </button>
      <label>
        {t("expense.amount")}
        <input
          type="number"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          required
        />
      </label>
      <label>
        <input
          type="checkbox"
          checked={isShared}
          onChange={(event) => setIsShared(event.target.checked)}
        />
        {t("expense.shared")}
      </label>
      <label>
        {t("expense.date")}
        <input
          type="date"
          value={expenseDate}
          onChange={(event) => setExpenseDate(event.target.value)}
          required
        />
      </label>
      <label>
        {t("expense.description")}
        <input
          type="text"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </label>
      <button type="submit" disabled={isSubmitting}>
        {expense ? t("expense.editExpense") : t("expense.addExpense")}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          {t("common.cancel")}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
```

- [ ] **Step 4: Run to confirm it passes**

```bash
pnpm run test -- ExpenseForm
```
Expected: 3 passed.

- [ ] **Step 5: Wire create/edit/delete into `frontend/src/expenses/ExpenseList.tsx`**

Rewrite the file to add: a toggleable "add expense" form above the list, per-row edit (toggles inline `ExpenseForm` for that row) and delete buttons gated by `creator or OWNER/ADMIN` (same pattern as Phase 3's `FamilyDetail.tsx`), and category management (rename/delete a custom category) for OWNER/ADMIN.

```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { getFamilyDetail } from "../families/familyApi";
import {
  deleteCategory,
  deleteExpense,
  listCategories,
  listExpenses,
  renameCategory,
  resolveCategoryDisplayName,
  type Category,
  type Expense,
} from "./expenseApi";
import { ExpenseForm } from "./ExpenseForm";

export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [memberNames, setMemberNames] = useState<Record<string, string>>({});
  const [myRole, setMyRole] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);

  useEffect(() => {
    if (!familyId) return;
    let cancelled = false;

    Promise.all([listExpenses(familyId), listCategories(familyId), getFamilyDetail(familyId)])
      .then(([expenseResult, categoryResult, familyDetail]) => {
        if (cancelled) return;
        setExpenses(expenseResult);
        setCategories(categoryResult);
        setMemberNames(
          Object.fromEntries(
            familyDetail.members.map((member) => [member.user_id, member.display_name]),
          ),
        );
        setMyRole(familyDetail.members.find((member) => member.user_id === user?.id)?.role);
      })
      .catch(() => {
        if (!cancelled) {
          setExpenses([]);
          setCategories([]);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [familyId, user?.id]);

  const canManage = myRole === "owner" || myRole === "admin";

  function categoryDisplayName(categoryId: string): string {
    const category = categories.find((item) => item.id === categoryId);
    return category ? resolveCategoryDisplayName(category, t) : categoryId;
  }

  async function handleDeleteExpense(expenseId: string) {
    if (!familyId || !window.confirm(t("expense.confirmDeleteExpense"))) return;
    try {
      await deleteExpense(familyId, expenseId);
      setExpenses((current) => current.filter((expense) => expense.id !== expenseId));
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleRenameCategory(categoryId: string) {
    if (!familyId) return;
    const newName = window.prompt(t("expense.newCategoryName"));
    if (!newName) return;
    try {
      const updated = await renameCategory(familyId, categoryId, newName);
      setCategories((current) =>
        current.map((category) => (category.id === categoryId ? updated : category)),
      );
    } catch {
      setError(t("expense.actionFailed"));
    }
  }

  async function handleDeleteCategory(categoryId: string) {
    if (!familyId) return;
    try {
      await deleteCategory(familyId, categoryId);
      setCategories((current) => current.filter((category) => category.id !== categoryId));
    } catch (err) {
      setError(
        err instanceof Error && err.message === "category_has_expenses"
          ? t("expense.actionFailed")
          : t("expense.actionFailed"),
      );
    }
  }

  if (isLoading || !familyId) {
    return <p>{t("common.loading")}</p>;
  }

  return (
    <main>
      <h1>{t("expense.myExpenses")}</h1>
      {isCreating ? (
        <ExpenseForm
          familyId={familyId}
          onSaved={(expense) => {
            setExpenses((current) => [expense, ...current]);
            setIsCreating(false);
          }}
          onCancel={() => setIsCreating(false)}
        />
      ) : (
        <button onClick={() => setIsCreating(true)}>{t("expense.addExpense")}</button>
      )}
      {expenses.length === 0 ? (
        <p>{t("expense.noExpenses")}</p>
      ) : (
        <ul>
          {expenses.map((expense) => {
            const canEditThis = canManage || expense.created_by_user_id === user?.id;
            if (editingExpenseId === expense.id) {
              return (
                <li key={expense.id}>
                  <ExpenseForm
                    familyId={familyId}
                    expense={expense}
                    onSaved={(updated) => {
                      setExpenses((current) =>
                        current.map((item) => (item.id === updated.id ? updated : item)),
                      );
                      setEditingExpenseId(null);
                    }}
                    onCancel={() => setEditingExpenseId(null)}
                  />
                </li>
              );
            }
            return (
              <li key={expense.id}>
                {expense.amount} — {categoryDisplayName(expense.category_id)} —{" "}
                {memberNames[expense.payer_user_id] ?? expense.payer_user_id} —{" "}
                {expense.expense_date} (
                {expense.is_shared ? t("expense.shared") : t("expense.personal")})
                {canEditThis && (
                  <>
                    <button onClick={() => setEditingExpenseId(expense.id)}>
                      {t("expense.editExpense")}
                    </button>
                    <button onClick={() => void handleDeleteExpense(expense.id)}>
                      {t("expense.deleteExpense")}
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {canManage && (
        <ul>
          {categories
            .filter((category) => category.family_id !== null)
            .map((category) => (
              <li key={category.id}>
                {category.name}
                <button onClick={() => void handleRenameCategory(category.id)}>
                  {t("family.rename")}
                </button>
                <button onClick={() => void handleDeleteCategory(category.id)}>
                  {t("family.delete")}
                </button>
              </li>
            ))}
        </ul>
      )}
      {error && <p role="alert">{error}</p>}
    </main>
  );
}
```

- [ ] **Step 6: Write the failing permission-gating tests for `ExpenseList`**

Add to `frontend/src/expenses/ExpenseList.test.tsx` (alongside the two tests from Task 5; extend the existing `getFamilyDetail` mock setup with more members and add `useAuth` mocking):

```tsx
vi.mock("../auth/useAuth", () => ({
  useAuth: vi.fn(),
}));
```

Add the import at the top: `import { useAuth } from "../auth/useAuth";`

```tsx
describe("ExpenseList permission gating", () => {
  beforeEach(() => {
    listExpensesMock.mockReset();
    listCategoriesMock.mockReset();
    vi.mocked(getFamilyDetail).mockReset();
    vi.mocked(useAuth).mockReset();
    listCategoriesMock.mockResolvedValue([{ id: "cat-1", family_id: null, name: "groceries" }]);
    vi.mocked(getFamilyDetail).mockResolvedValue({
      id: "fam-1",
      name: "Test Family",
      members: [
        { user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" },
        { user_id: "u2", email: "b@example.com", display_name: "Bob", role: "member" },
      ],
    });
  });

  it("hides edit/delete for a plain member viewing someone else's expense", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u1",
        created_by_user_id: "u1",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.queryByText("編集")).not.toBeInTheDocument();
    expect(screen.queryByText("削除")).not.toBeInTheDocument();
  });

  it("shows edit/delete for the expense's own creator", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u2", email: "b@example.com", display_name: "Bob" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u2",
        created_by_user_id: "u2",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });

  it("shows edit/delete for an OWNER viewing someone else's expense", async () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: "u1", email: "a@example.com", display_name: "Alice" },
    } as ReturnType<typeof useAuth>);
    listExpensesMock.mockResolvedValue([
      {
        id: "exp-1",
        family_id: "fam-1",
        payer_user_id: "u2",
        created_by_user_id: "u2",
        category_id: "cat-1",
        amount: 1000,
        is_shared: false,
        description: null,
        expense_date: "2026-08-25",
      },
    ]);

    renderAt();

    await screen.findByText(/1000/);
    expect(screen.getByText("編集")).toBeInTheDocument();
    expect(screen.getByText("削除")).toBeInTheDocument();
  });
});
```

- [ ] **Step 7: Run to confirm the new tests fail**

```bash
pnpm run test -- ExpenseList
```
Expected: FAIL — `useAuth` isn't imported/used in `ExpenseList.tsx` yet, so `user` is undefined and the gating logic isn't wired (this matches the current state before Step 5's rewrite... note Step 5 above already wires this in. If you implemented Step 5 before writing this test, the tests should mostly pass already except for possibly `useAuth` not being mocked correctly — run this to confirm the mock wiring itself is correct, and fix `ExpenseList.tsx` or the test as needed until all three pass for the right reason.)

- [ ] **Step 8: Confirm all `ExpenseList.test.tsx` tests pass**

```bash
pnpm run test -- ExpenseList
```
Expected: 5 passed (2 from Task 5, 3 new gating tests).

- [ ] **Step 9: Run the full frontend check suite**

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
```
Expected: all clean.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/expenses
git commit -m "feat(frontend): add expense create/edit form and category management"
```

---

### Task 7: Documentation

**Files:**
- Modify: `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`

- [ ] **Step 1: Extend `docs/ARCHITECTURE.md`**

Add a new `## Expense Domain` section (after the existing `## Family Management` section):

```markdown
## Expense Domain

Expenses and categories are family-scoped the same way family membership
is — every endpoint depends on `get_family_membership` first. Categories
are a hybrid: global ones (`family_id IS NULL`) are seeded via migration
with stable slugs (`groceries`, `dining`, ...) and are immutable by
design; custom ones belong to exactly one family and are
OWNER/ADMIN-managed, since a category is a shared resource other
members' expenses may already reference.

Editing or deleting a specific expense is gated by a new permission
helper, `require_owner_admin_or_creator` — the expense's own creator can
always edit it, and an OWNER/ADMIN can edit any expense in their family
even if they didn't create it. `payer_user_id` (who paid) is deliberately
separate from `created_by_user_id` (who logged the entry) and from the
caller's own identity — any member can log an expense on another
member's behalf.

This phase deliberately does not implement allocation/splitting math or
settlement calculation — `is_shared` is a plain classification flag for
now; Phases 10 and 11 build the actual splitting and settlement logic on
top of this data model. All amounts are integer yen; no floating-point
money anywhere in the schema or API.
```

- [ ] **Step 2: Extend `docs/PRODUCT_REQUIREMENTS.md`**

Add a new `## Expense Domain` section (after the existing `## Authentication` section, before `## Internationalization`):

```markdown
## Expense Domain

A family member can log an expense: amount (integer yen), a category
(a fixed seeded set plus per-family custom ones), the payer (any family
member, not necessarily whoever is logging it), a personal-or-shared
classification, a date, and an optional description. Editing or deleting
an expense is restricted to its creator or an OWNER/ADMIN of the family.
Custom categories can be created by any member but renamed/deleted only
by an OWNER/ADMIN; the seeded global categories are immutable. How a
shared expense's cost is actually divided among members (Section "Shared
allocation" below) and settlement calculation are both separate, later
phases — this phase only establishes the data these depend on.
```

- [ ] **Step 3: Extend `docs/I18N.md`'s "Current keys" table**

Add these rows after the existing `family.*`/`role.*` rows:

```markdown
| `common.cancel` | キャンセル | Hủy |
| `expense.myExpenses` | 支出一覧 | Danh sách chi tiêu |
| `expense.noExpenses` | まだ支出がありません | Chưa có khoản chi nào |
| `expense.amount` | 金額 | Số tiền |
| `expense.category` | カテゴリー | Danh mục |
| `expense.payer` | 支払者 | Người thanh toán |
| `expense.description` | メモ | Ghi chú |
| `expense.date` | 日付 | Ngày |
| `expense.personal` | 個人 | Cá nhân |
| `expense.shared` | 共同 | Chung |
| `expense.addExpense` | 追加 | Thêm |
| `expense.editExpense` | 編集 | Sửa |
| `expense.deleteExpense` | 削除 | Xóa |
| `expense.confirmDeleteExpense` | この支出を削除してもよろしいですか? | Bạn có chắc muốn xóa khoản chi này? |
| `expense.addCategory` | カテゴリーを追加 | Thêm danh mục |
| `expense.newCategoryName` | 新しいカテゴリー名 | Tên danh mục mới |
| `expense.actionFailed` | エラーが発生しました。もう一度お試しください | Đã xảy ra lỗi. Vui lòng thử lại |
| `expense.amountMustBePositive` | 金額は1円以上で入力してください | Số tiền phải lớn hơn 0 |
| `expense.invalidPayerOrCategory` | 支払者またはカテゴリーが無効です | Người thanh toán hoặc danh mục không hợp lệ |
| `category.groceries` | 食料品 | Thực phẩm |
| `category.dining` | 外食 | Ăn ngoài |
| `category.transport` | 交通費 | Đi lại |
| `category.utilities` | 光熱費 | Tiện ích |
| `category.entertainment` | 娯楽 | Giải trí |
| `category.other` | その他 | Khác |
```

Also add these financial terms to the "Terminology glossary" table near the top of the file (they're recurring domain terms, not one-off UI strings):

```markdown
| Expense | 支出 | Chi tiêu |
| Category | カテゴリー | Danh mục |
```

- [ ] **Step 4: Commit**

```bash
git add docs/ARCHITECTURE.md docs/PRODUCT_REQUIREMENTS.md docs/I18N.md
git commit -m "docs: document expense domain architecture and i18n keys"
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

- [ ] Manually verify end-to-end: log in, go to a family's expenses page,
  add an expense naming a different family member as payer and a custom
  category (creating it inline), confirm it appears in the list with the
  correct resolved category/payer names; edit it; as a plain MEMBER
  viewing another member's expense, confirm no edit/delete buttons render
  for it (but do for your own); as OWNER, confirm you can manage custom
  categories.
- [ ] Confirm `git status` is clean and all commits are on
  `feature/expense-domain`.
- [ ] Proceed to `superpowers:finishing-a-development-branch`.
