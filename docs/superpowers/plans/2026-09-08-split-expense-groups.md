# Split Expense Groups (Monthly Aggregate Split) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a family member pick a calendar month, preview every shared expense that would be aggregated, and split that total among participants in one action — without touching the existing per-expense Split Expenses feature.

**Architecture:** A fully separate, additive feature (`SplitExpenseGroup` / `SplitExpenseGroupItem` / `SplitExpenseGroupParticipant`) that mirrors the existing per-expense `SplitExpense` model shape closely but claims a *set* of expenses (via a snapshot join table with a global uniqueness constraint) instead of exactly one. A shared arithmetic helper (equal/percentage distribution) is extracted out of the existing feature into `finance_engine.py` so both features use one implementation; nothing else about the existing feature changes.

**Tech Stack:** FastAPI, SQLAlchemy 2.0 (async), Alembic, Pydantic; React + TypeScript, Zustand, `openapi-fetch`.

**Spec:** `docs/superpowers/specs/2026-09-08-split-expense-groups-design.md`

## Global Constraints

- Only `Expense` rows with `is_shared = true` are ever eligible for a group.
- An expense can belong to at most one thing, ever: either the existing per-expense `SplitExpense`, or one `SplitExpenseGroup` — enforced by `UniqueConstraint("expense_id")` on the new `split_expense_group_items` table, and by excluding both sources from every eligibility query.
- `period_start`/`period_end` are concrete `date` values (the selected month's first/last day), never a "YYYY-MM" string — computed by the frontend, re-validated (not blindly trusted) by the backend on every write.
- A group is a snapshot at creation time — no edit, no delete, no auto-merging expenses added later. Matches the existing per-expense feature, which also has no edit/delete.
- The existing per-expense Split Expenses feature's schema, API contract, and frontend behavior are unchanged. Its own test file (`backend/tests/test_split_expenses_api.py`) must pass unmodified after every task in this plan.
- Both languages (ja/vi) cover every new user-facing string, following this repo's existing `frontend/src/i18n/locales/{ja,vi}/common.json` convention.
- `openapi/openapi.json` and `frontend/src/api/schema.gen.ts` must be regenerated and committed whenever a backend route/schema changes (CI's drift check fails otherwise) — see `backend/scripts/export_openapi.py` and `frontend`'s `generate:api-types` script.

---

## File Structure

```
backend/
  app/
    services/
      finance_engine.py                  (modify: add 2 shared split-amount functions)
      __init__.py                          (modify: export the 2 new functions)
    models/
      split_expense_group.py                 (new: SplitExpenseGroup, SplitExpenseGroupItem, SplitExpenseGroupParticipant)
      __init__.py                              (modify: register new models)
    schemas/
      split_expense_groups.py                    (new: request/response schemas)
    api/v1/
      split_expenses.py                            (modify: use the shared arithmetic functions)
      split_expense_groups.py                        (new: preview/create/list/detail/settle router)
      router.py                                        (modify: register the new router)
  alembic/versions/
    0012_add_split_expense_groups.py                    (new: migration)
  tests/
    test_finance_engine.py                                (modify: tests for the 2 extracted functions)
    test_split_expense_groups_api.py                        (new: integration tests)
openapi/
  openapi.json                                              (regenerated, committed)
frontend/
  src/
    api/
      schema.gen.ts                                           (regenerated, committed)
      errorI18n.ts                                              (modify: map new error codes)
    finance/
      financeApi.ts                                               (modify: add types + 4 new API functions)
      SplitExpensesPage.tsx                                         (modify: add month-group section)
      stores/
        splitExpensesStore.ts                                         (modify: add group state/actions)
    i18n/locales/
      ja/common.json                                                  (modify: add finance.splitGroup* keys)
      vi/common.json                                                  (modify: add finance.splitGroup* keys)
```

---

### Task 1: Extract shared split-amount arithmetic into `finance_engine.py`

**Files:**
- Modify: `backend/app/services/finance_engine.py`
- Modify: `backend/app/services/__init__.py`
- Modify: `backend/app/api/v1/split_expenses.py`
- Test: `backend/tests/test_finance_engine.py`

**Interfaces:**
- Produces: `resolve_equal_split_amounts(total_amount: int, participant_count: int) -> list[int]` and `resolve_percentage_split_amounts(total_amount: int, percentages: list[int]) -> list[int]` in `app.services.finance_engine` — pure functions, no exceptions raised, no framework/model imports. Both later tasks (the existing feature's refactor in this task, and the new group feature in Task 3) call these two functions by exactly this name and signature.
- Consumes: nothing new.

This is a pure refactor — no behavior change. `backend/tests/test_split_expenses_api.py` must pass, unmodified, at the end of this task.

- [ ] **Step 1: Write the failing tests for the two extracted functions**

Add to `backend/tests/test_finance_engine.py` (alongside the existing `test_build_subscription_totals_and_upcoming_renewals` test — same file, just add these two new test functions; `build_subscription_totals` and its import line stay as-is):

```python
def test_resolve_equal_split_amounts_distributes_remainder_to_first_participants() -> None:
    amounts = resolve_equal_split_amounts(total_amount=100, participant_count=3)
    assert amounts == [34, 33, 33]
    assert sum(amounts) == 100


def test_resolve_percentage_split_amounts_sums_exactly_to_total() -> None:
    amounts = resolve_percentage_split_amounts(total_amount=999, percentages=[50, 30, 20])
    assert sum(amounts) == 999
    assert amounts[0] >= amounts[1] >= amounts[2]
```

Add `resolve_equal_split_amounts` and `resolve_percentage_split_amounts` to the existing `from app.services.finance_engine import (...)` block at the top of `test_finance_engine.py`.

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && docker compose run --rm backend sh -c "uv sync --extra dev -q && uv run pytest tests/test_finance_engine.py -k resolve_split -v"`
Expected: FAIL — `ImportError: cannot import name 'resolve_equal_split_amounts'`.

- [ ] **Step 3: Implement the two functions in `finance_engine.py`**

Add these two functions to `backend/app/services/finance_engine.py`, right after `build_subscription_totals` (moved verbatim from the arithmetic currently in `backend/app/api/v1/split_expenses.py`'s `_build_equal_amounts`/`_build_percentage_amounts` — same logic, new home, new names):

```python
def resolve_equal_split_amounts(total_amount: int, participant_count: int) -> list[int]:
    base_amount = total_amount // participant_count
    remainder = total_amount % participant_count
    return [base_amount + (1 if index < remainder else 0) for index in range(participant_count)]


def resolve_percentage_split_amounts(total_amount: int, percentages: list[int]) -> list[int]:
    raw_amounts = [(total_amount * percentage) / 100 for percentage in percentages]
    floored = [int(amount) for amount in raw_amounts]
    delta = total_amount - sum(floored)
    for index in range(delta):
        floored[index % len(floored)] += 1
    return floored
```

Add both names to `backend/app/services/__init__.py`'s import block and `__all__` list, alphabetically alongside the existing entries (matches that file's existing style).

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_finance_engine.py -v"`
Expected: all tests in the file PASS, including the two new ones and the pre-existing `test_build_subscription_totals_and_upcoming_renewals`.

- [ ] **Step 5: Point `split_expenses.py` at the shared functions**

In `backend/app/api/v1/split_expenses.py`:
- Add `from app.services.finance_engine import resolve_equal_split_amounts, resolve_percentage_split_amounts` to the imports.
- Delete the two local functions `_build_equal_amounts` and `_build_percentage_amounts` entirely.
- In `_resolve_split_amounts`, replace `amounts = _build_equal_amounts(total_amount, len(payload.participants))` with `amounts = resolve_equal_split_amounts(total_amount, len(payload.participants))`, and replace `amounts = _build_percentage_amounts(total_amount, percentages)` with `amounts = resolve_percentage_split_amounts(total_amount, percentages)`. Nothing else in the function changes — the `sum(amounts) != total_amount` checks and `raise_api_error` calls stay exactly as they are.

- [ ] **Step 6: Run the existing per-expense split tests to confirm zero behavior change**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_split_expenses_api.py -v -m integration"`
Expected: both existing tests (`test_create_and_settle_equal_split_expense`, `test_create_custom_split_rejects_amount_mismatch`) PASS with no changes to the test file itself.

- [ ] **Step 7: Lint and type-check**

Run: `cd backend && docker compose run --rm backend sh -c "uv run ruff check app/services/finance_engine.py app/services/__init__.py app/api/v1/split_expenses.py tests/test_finance_engine.py && uv run mypy app/services/finance_engine.py app/services/__init__.py app/api/v1/split_expenses.py"`
Expected: clean (0 new errors — this repo has pre-existing, unrelated ruff/mypy debt in other finance files; don't chase those here).

- [ ] **Step 8: Commit**

```bash
git add backend/app/services/finance_engine.py backend/app/services/__init__.py backend/app/api/v1/split_expenses.py backend/tests/test_finance_engine.py
git commit -m "refactor(backend): share split-amount arithmetic between split-expense features"
```

---

### Task 2: Backend models and migration for split expense groups

**Files:**
- Create: `backend/app/models/split_expense_group.py`
- Modify: `backend/app/models/__init__.py`
- Create: `backend/alembic/versions/0012_add_split_expense_groups.py`

**Interfaces:**
- Consumes: `SplitMethod`, `SplitStatus` from `app.models.split_expense` (reused, not redefined).
- Produces: `SplitExpenseGroup` (table `split_expense_groups`), `SplitExpenseGroupItem` (table `split_expense_group_items`), `SplitExpenseGroupParticipant` (table `split_expense_group_participants`) — importable from `app.models.split_expense_group`, and re-exported from `app.models`. Task 3 imports these exact names.

This task has no application logic to TDD in the usual sense — its "test cycle" is the migration applying cleanly forward and backward, and the models importing/type-checking cleanly.

- [ ] **Step 1: Write the model file**

Create `backend/app/models/split_expense_group.py`:

```python
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Integer,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.split_expense import SplitMethod, SplitStatus


def _enum_values(enum_cls: type[SplitMethod] | type[SplitStatus]) -> list[str]:
    return [item.value for item in enum_cls.__members__.values()]


class SplitExpenseGroup(Base):
    __tablename__ = "split_expense_groups"

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    method: Mapped[SplitMethod] = mapped_column(
        Enum(SplitMethod, name="split_method_enum", values_callable=_enum_values),
        nullable=False,
    )
    status: Mapped[SplitStatus] = mapped_column(
        Enum(SplitStatus, name="split_status_enum", values_callable=_enum_values),
        nullable=False,
        default=SplitStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SplitExpenseGroupItem(Base):
    __tablename__ = "split_expense_group_items"
    __table_args__ = (
        UniqueConstraint("expense_id", name="uq_split_expense_group_items_expense_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    split_expense_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    expense_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("expenses.id", ondelete="CASCADE"),
        nullable=False,
    )


class SplitExpenseGroupParticipant(Base):
    __tablename__ = "split_expense_group_participants"
    __table_args__ = (
        CheckConstraint(
            "amount > 0", name="ck_split_expense_group_participants_amount_positive"
        ),
        CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_split_expense_group_participants_percentage_range",
        ),
        UniqueConstraint(
            "split_expense_group_id",
            "participant_user_id",
            name="uq_split_expense_group_participants_group_participant",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    split_expense_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    participant_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    percentage: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_settled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
```

- [ ] **Step 2: Register the models in `app/models/__init__.py`**

Add `from app.models.split_expense_group import (\n    SplitExpenseGroup,\n    SplitExpenseGroupItem,\n    SplitExpenseGroupParticipant,\n)` alongside the existing `from app.models.split_expense import ...` line, and add `"SplitExpenseGroup"`, `"SplitExpenseGroupItem"`, `"SplitExpenseGroupParticipant"` to `__all__`, alphabetically.

- [ ] **Step 3: Write the migration**

Create `backend/alembic/versions/0012_add_split_expense_groups.py`:

```python
"""add split expense groups

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-08

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

split_method_enum = postgresql.ENUM(
    "equal", "custom", "percentage", name="split_method_enum", create_type=False
)
split_status_enum = postgresql.ENUM(
    "pending", "settled", name="split_status_enum", create_type=False
)
FAMILY_FK = "families.id"
USER_FK = "users.id"
POSITIVE_AMOUNT_CHECK = "amount > 0"


def upgrade() -> None:
    op.create_table(
        "split_expense_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("method", split_method_enum, nullable=False),
        sa.Column("status", split_status_enum, nullable=False, server_default="pending"),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_split_expense_groups_family_id", "split_expense_groups", ["family_id"])

    op.create_table(
        "split_expense_group_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "expense_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("expenses.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.UniqueConstraint("expense_id", name="uq_split_expense_group_items_expense_id"),
    )
    op.create_index(
        "ix_split_expense_group_items_split_expense_group_id",
        "split_expense_group_items",
        ["split_expense_group_id"],
    )

    op.create_table(
        "split_expense_group_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "split_expense_group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "participant_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("percentage", sa.Integer(), nullable=True),
        sa.Column("is_settled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("settled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            POSITIVE_AMOUNT_CHECK, name="ck_split_expense_group_participants_amount_positive"
        ),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_split_expense_group_participants_percentage_range",
        ),
        sa.UniqueConstraint(
            "split_expense_group_id",
            "participant_user_id",
            name="uq_split_expense_group_participants_group_participant",
        ),
    )
    op.create_index(
        "ix_split_expense_group_participants_split_expense_group_id",
        "split_expense_group_participants",
        ["split_expense_group_id"],
    )

    op.alter_column("split_expense_groups", "status", server_default=None)
    op.alter_column("split_expense_group_participants", "is_settled", server_default=None)


def downgrade() -> None:
    op.drop_index(
        "ix_split_expense_group_participants_split_expense_group_id",
        table_name="split_expense_group_participants",
    )
    op.drop_table("split_expense_group_participants")

    op.drop_index(
        "ix_split_expense_group_items_split_expense_group_id",
        table_name="split_expense_group_items",
    )
    op.drop_table("split_expense_group_items")

    op.drop_index("ix_split_expense_groups_family_id", table_name="split_expense_groups")
    op.drop_table("split_expense_groups")
```

Note: this migration does NOT create or drop `split_method_enum`/`split_status_enum` — they already exist (created by migration `0010`), and are only referenced here (`create_type=False`) for column typing.

- [ ] **Step 4: Verify the migration applies forward and backward cleanly**

Run (bring up `postgres` first if not already running: `docker compose up -d postgres`):
```bash
cd backend
docker compose run --rm backend sh -c "uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head"
```
Expected: all three commands succeed with no errors — proves both `upgrade` and `downgrade` are correct, and the migration is idempotent when re-applied.

- [ ] **Step 5: Type-check the new model file**

Run: `cd backend && docker compose run --rm backend sh -c "uv run mypy app/models/split_expense_group.py app/models/__init__.py"`
Expected: `Success: no issues found`.

- [ ] **Step 6: Commit**

```bash
git add backend/app/models/split_expense_group.py backend/app/models/__init__.py backend/alembic/versions/0012_add_split_expense_groups.py
git commit -m "feat(backend): add split expense group models and migration"
```

---

### Task 3: Schemas + API — preview and create

**Files:**
- Create: `backend/app/schemas/split_expense_groups.py`
- Create: `backend/app/api/v1/split_expense_groups.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_split_expense_groups_api.py` (new — this task adds the preview/create tests; Task 4 appends list/detail/settle tests to the same file)

**Interfaces:**
- Consumes: `resolve_equal_split_amounts`, `resolve_percentage_split_amounts` from `app.services.finance_engine` (Task 1); `SplitExpenseGroup`, `SplitExpenseGroupItem`, `SplitExpenseGroupParticipant` from `app.models.split_expense_group` (Task 2); `SplitParticipantInput` from `app.schemas.split_expenses` (existing, reused as-is).
- Produces: router mounted at `/families/{family_id}/split-expense-groups`, with `GET /preview`, `POST /` in this task (`GET /`, `GET /{group_id}`, `PATCH /{group_id}/participants/{participant_id}/settle` added in Task 4, same router object). Also produces the shared response-building helpers `_get_group_or_404`, `_get_group_expenses`, `_get_group_participants`, `_to_group_response` in `split_expense_groups.py` — Task 4 imports nothing extra, it just adds more route functions to the same file that call these same helpers.

**Critical ordering note:** FastAPI/Starlette matches routes in declaration order, and a bare `{group_id}` path segment matches ANY string at that position — including the literal word `preview` — before FastAPI validates it as a UUID. The `GET /preview` route **must be declared before** `GET /{group_id}` in the file (Task 4 adds `/{group_id}` after this task's `/preview`, preserving the correct order — do not reorder them).

- [ ] **Step 1: Write the schemas**

Create `backend/app/schemas/split_expense_groups.py`:

```python
import uuid
from datetime import date

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.split_expense import SplitMethod, SplitStatus
from app.schemas.split_expenses import SplitParticipantInput


class SplitExpenseGroupExpenseSummary(BaseModel):
    id: uuid.UUID
    description: str | None
    category_id: uuid.UUID
    amount: int
    expense_date: date


class SplitExpenseGroupPreviewResponse(BaseModel):
    total_amount: int
    expenses: list[SplitExpenseGroupExpenseSummary]


class CreateSplitExpenseGroupRequest(BaseModel):
    period_start: date
    period_end: date
    method: SplitMethod
    participants: list[SplitParticipantInput] = Field(min_length=2, max_length=50)

    @field_validator("participants")
    @classmethod
    def _validate_no_duplicate_participants(
        cls, values: list[SplitParticipantInput]
    ) -> list[SplitParticipantInput]:
        ids = [item.participant_user_id for item in values]
        if len(ids) != len(set(ids)):
            raise ValueError("participant_user_id must be unique")
        return values

    @model_validator(mode="after")
    def _validate_period(self) -> "CreateSplitExpenseGroupRequest":
        if self.period_end < self.period_start:
            raise ValueError("period_end must be >= period_start")
        return self

    @model_validator(mode="after")
    def _validate_split_payload(self) -> "CreateSplitExpenseGroupRequest":
        if self.method == SplitMethod.EQUAL:
            return self

        if self.method == SplitMethod.CUSTOM:
            if any(item.amount is None for item in self.participants):
                raise ValueError("amount is required for custom split")
            return self

        if any(item.percentage is None for item in self.participants):
            raise ValueError("percentage is required for percentage split")
        total_percentage = sum(item.percentage or 0 for item in self.participants)
        if total_percentage != 100:
            raise ValueError("percentage split must sum to 100")
        return self


class SettleSplitExpenseGroupParticipantRequest(BaseModel):
    is_settled: bool = True


class SplitExpenseGroupParticipantResponse(BaseModel):
    id: uuid.UUID
    split_expense_group_id: uuid.UUID
    participant_user_id: uuid.UUID
    amount: int
    percentage: int | None
    is_settled: bool


class SplitExpenseGroupResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    period_start: date
    period_end: date
    created_by_user_id: uuid.UUID
    method: SplitMethod
    status: SplitStatus
    total_amount: int
    settled_amount: int
    outstanding_amount: int
    expenses: list[SplitExpenseGroupExpenseSummary]
    participants: list[SplitExpenseGroupParticipantResponse]
```

- [ ] **Step 2: Write the failing integration tests (preview + create)**

Create `backend/tests/test_split_expense_groups_api.py`:

```python
import uuid
from collections.abc import AsyncGenerator
from datetime import date
from typing import Any

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def client() -> AsyncGenerator[AsyncClient, None]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


def _unique_email() -> str:
    return f"user-{uuid.uuid4()}@example.com"


async def _register(client: AsyncClient, email: str, display_name: str = "Alice") -> dict[str, Any]:
    response = await client.post(
        "/api/v1/auth/register",
        json={"email": email, "password": "correct-password", "display_name": display_name},
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


async def _create_family(client: AsyncClient, name: str = "Test Family") -> str:
    response = await client.post("/api/v1/families/", json={"name": name})
    assert response.status_code == 201
    return response.json()["id"]  # type: ignore[no-any-return]


async def _get_global_category_id(client: AsyncClient, family_id: str) -> str:
    response = await client.get(f"/api/v1/families/{family_id}/categories/")
    assert response.status_code == 200
    return response.json()[0]["id"]  # type: ignore[no-any-return]


async def _create_expense(
    client: AsyncClient,
    family_id: str,
    payer_user_id: str,
    category_id: str,
    amount: int,
    is_shared: bool,
    expense_date: date,
    description: str = "",
) -> dict[str, Any]:
    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": payer_user_id,
            "category_id": category_id,
            "amount": amount,
            "is_shared": is_shared,
            "description": description,
            "expense_date": expense_date.isoformat(),
        },
    )
    assert response.status_code == 201
    return response.json()  # type: ignore[no-any-return]


@pytest.mark.integration
async def test_preview_excludes_personal_expenses_and_sums_shared_ones(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    await _create_expense(client, family_id, owner["id"], category_id, 3000, True, date(2026, 9, 5))
    await _create_expense(client, family_id, owner["id"], category_id, 2000, True, date(2026, 9, 20))
    await _create_expense(client, family_id, owner["id"], category_id, 9999, False, date(2026, 9, 10))

    response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/preview",
        params={"period_start": "2026-09-01", "period_end": "2026-09-30"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total_amount"] == 5000
    assert len(body["expenses"]) == 2


@pytest.mark.integration
async def test_create_equal_split_group_and_settle_each_participant(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        add_member_response = await client.post(
            f"/api/v1/families/{family_id}/members", json={"email": member_email}
        )
        assert add_member_response.status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 3000, True, date(2026, 9, 5))
    await _create_expense(client, family_id, owner["id"], category_id, 2400, True, date(2026, 9, 20))

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert create_response.status_code == 201
    group = create_response.json()
    assert group["total_amount"] == 5400
    assert len(group["expenses"]) == 2
    assert {item["amount"] for item in group["participants"]} == {2700}

    owner_participant = next(
        item for item in group["participants"] if item["participant_user_id"] == owner["id"]
    )
    settle_response = await client.patch(
        f"/api/v1/families/{family_id}/split-expense-groups/{group['id']}/participants/{owner_participant['id']}/settle",
        json={"is_settled": True},
    )
    assert settle_response.status_code == 200
    assert settle_response.json()["settled_amount"] == 2700
    assert settle_response.json()["status"] == "pending"


@pytest.mark.integration
async def test_create_custom_split_group_rejects_amount_mismatch(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 5000, True, date(2026, 9, 5))

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "custom",
            "participants": [
                {"participant_user_id": owner["id"], "amount": 2000},
                {"participant_user_id": member["id"], "amount": 2000},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_CUSTOM_AMOUNT_MISMATCH"


@pytest.mark.integration
async def test_create_percentage_split_group_computes_amounts_summing_to_total(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    await _create_expense(client, family_id, owner["id"], category_id, 999, True, date(2026, 9, 5))

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "percentage",
            "participants": [
                {"participant_user_id": owner["id"], "percentage": 70},
                {"participant_user_id": member["id"], "percentage": 30},
            ],
        },
    )
    assert response.status_code == 201
    group = response.json()
    assert sum(item["amount"] for item in group["participants"]) == 999
    owner_participant = next(
        item for item in group["participants"] if item["participant_user_id"] == owner["id"]
    )
    assert owner_participant["amount"] > 0
    assert owner_participant["percentage"] == 70


@pytest.mark.integration
async def test_create_rejects_when_no_eligible_expenses(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-09-01",
            "period_end": "2026-09-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": owner["id"]},
            ],
        },
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_expense_already_individually_split_is_excluded_from_group(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    expense = await _create_expense(
        client, family_id, owner["id"], category_id, 4000, True, date(2026, 9, 8)
    )

    split_response = await client.post(
        f"/api/v1/families/{family_id}/split-expenses/",
        json={
            "expense_id": expense["id"],
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert split_response.status_code == 201

    preview_response = await client.get(
        f"/api/v1/families/{family_id}/split-expense-groups/preview",
        params={"period_start": "2026-09-01", "period_end": "2026-09-30"},
    )
    assert preview_response.status_code == 200
    assert preview_response.json()["total_amount"] == 0
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_split_expense_groups_api.py -v -m integration"`
Expected: FAIL — `404 Not Found` on every request (router not registered yet) or connection/import errors.

- [ ] **Step 4: Implement the API router**

Create `backend/app/api/v1/split_expense_groups.py`:

```python
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.expense import Expense
from app.models.family_member import FamilyMember
from app.models.split_expense import SplitExpense, SplitMethod, SplitStatus
from app.models.split_expense_group import (
    SplitExpenseGroup,
    SplitExpenseGroupItem,
    SplitExpenseGroupParticipant,
)
from app.models.user import User
from app.schemas.split_expense_groups import (
    CreateSplitExpenseGroupRequest,
    SplitExpenseGroupExpenseSummary,
    SplitExpenseGroupParticipantResponse,
    SplitExpenseGroupPreviewResponse,
    SplitExpenseGroupResponse,
)
from app.services.finance_engine import resolve_equal_split_amounts, resolve_percentage_split_amounts

router = APIRouter()


async def _find_eligible_expenses(
    family_id: uuid.UUID, period_start: date, period_end: date, session: AsyncSession
) -> list[Expense]:
    already_split_individually = select(SplitExpense.expense_id)
    already_in_a_group = select(SplitExpenseGroupItem.expense_id)

    result = await session.scalars(
        select(Expense)
        .where(
            Expense.family_id == family_id,
            Expense.is_shared.is_(True),
            Expense.expense_date >= period_start,
            Expense.expense_date <= period_end,
            Expense.id.not_in(already_split_individually),
            Expense.id.not_in(already_in_a_group),
        )
        .order_by(Expense.expense_date)
    )
    return list(result.all())


async def _validate_participants(
    family_id: uuid.UUID,
    participant_ids: set[uuid.UUID],
    session: AsyncSession,
) -> None:
    member_ids = await session.scalars(
        select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)
    )
    member_set = set(member_ids.all())
    if not participant_ids.issubset(member_set):
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="SPLIT_PARTICIPANT_NOT_IN_FAMILY",
            message="All participants must belong to this family",
        )


def _resolve_group_split_amounts(
    payload: CreateSplitExpenseGroupRequest, total_amount: int
) -> list[tuple[uuid.UUID, int, int | None]]:
    if payload.method == SplitMethod.EQUAL:
        amounts = resolve_equal_split_amounts(total_amount, len(payload.participants))
        return [
            (participant.participant_user_id, amounts[index], None)
            for index, participant in enumerate(payload.participants)
        ]

    if payload.method == SplitMethod.CUSTOM:
        amounts = [participant.amount or 0 for participant in payload.participants]
        if sum(amounts) != total_amount:
            raise_api_error(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="SPLIT_CUSTOM_AMOUNT_MISMATCH",
                message="Custom split amounts must equal the group total",
            )
        return [
            (participant.participant_user_id, participant.amount or 0, None)
            for participant in payload.participants
        ]

    percentages = [participant.percentage or 0 for participant in payload.participants]
    amounts = resolve_percentage_split_amounts(total_amount, percentages)
    if sum(amounts) != total_amount:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="SPLIT_PERCENTAGE_AMOUNT_MISMATCH",
            message="Percentage split calculation failed",
        )
    return [
        (participant.participant_user_id, amounts[index], participant.percentage)
        for index, participant in enumerate(payload.participants)
    ]


async def _get_group_or_404(
    family_id: uuid.UUID, group_id: uuid.UUID, session: AsyncSession
) -> SplitExpenseGroup:
    group = await session.scalar(
        select(SplitExpenseGroup)
        .where(SplitExpenseGroup.id == group_id, SplitExpenseGroup.family_id == family_id)
        .with_for_update()
    )
    if group is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SPLIT_EXPENSE_GROUP_NOT_FOUND",
            message="Split expense group not found",
        )
    return group


async def _get_group_expenses(group_id: uuid.UUID, session: AsyncSession) -> list[Expense]:
    result = await session.scalars(
        select(Expense)
        .join(SplitExpenseGroupItem, SplitExpenseGroupItem.expense_id == Expense.id)
        .where(SplitExpenseGroupItem.split_expense_group_id == group_id)
        .order_by(Expense.expense_date)
    )
    return list(result.all())


async def _get_group_participants(
    group_id: uuid.UUID, session: AsyncSession
) -> list[SplitExpenseGroupParticipant]:
    result = await session.scalars(
        select(SplitExpenseGroupParticipant)
        .where(SplitExpenseGroupParticipant.split_expense_group_id == group_id)
        .order_by(SplitExpenseGroupParticipant.created_at)
    )
    return list(result.all())


async def _to_group_response(
    group: SplitExpenseGroup, session: AsyncSession
) -> SplitExpenseGroupResponse:
    expenses = await _get_group_expenses(group.id, session)
    participants = await _get_group_participants(group.id, session)
    total_amount = sum(item.amount for item in participants)
    settled_amount = sum(item.amount for item in participants if item.is_settled)

    return SplitExpenseGroupResponse(
        id=group.id,
        family_id=group.family_id,
        period_start=group.period_start,
        period_end=group.period_end,
        created_by_user_id=group.created_by_user_id,
        method=group.method,
        status=group.status,
        total_amount=total_amount,
        settled_amount=settled_amount,
        outstanding_amount=total_amount - settled_amount,
        expenses=[
            SplitExpenseGroupExpenseSummary(
                id=expense.id,
                description=expense.description,
                category_id=expense.category_id,
                amount=expense.amount,
                expense_date=expense.expense_date,
            )
            for expense in expenses
        ],
        participants=[
            SplitExpenseGroupParticipantResponse(
                id=item.id,
                split_expense_group_id=item.split_expense_group_id,
                participant_user_id=item.participant_user_id,
                amount=item.amount,
                percentage=item.percentage,
                is_settled=item.is_settled,
            )
            for item in participants
        ],
    )


# NOTE: this route MUST stay declared before `GET /{group_id}` (added in Task 4) —
# otherwise Starlette matches the literal path "preview" against the `{group_id}`
# path parameter before FastAPI gets a chance to validate it as a UUID.
@router.get("/preview")
async def preview_split_expense_group(
    family_id: uuid.UUID,
    period_start: Annotated[date, Query()],
    period_end: Annotated[date, Query()],
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseGroupPreviewResponse:
    if period_end < period_start:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="SPLIT_GROUP_INVALID_PERIOD",
            message="period_end must be greater than or equal to period_start",
        )
    expenses = await _find_eligible_expenses(family_id, period_start, period_end, session)
    return SplitExpenseGroupPreviewResponse(
        total_amount=sum(expense.amount for expense in expenses),
        expenses=[
            SplitExpenseGroupExpenseSummary(
                id=expense.id,
                description=expense.description,
                category_id=expense.category_id,
                amount=expense.amount,
                expense_date=expense.expense_date,
            )
            for expense in expenses
        ],
    )


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_split_expense_group(
    family_id: uuid.UUID,
    payload: CreateSplitExpenseGroupRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseGroupResponse:
    async with locked_write(
        session,
        tables=(
            "expenses",
            "split_expenses",
            "split_expense_groups",
            "split_expense_group_items",
            "split_expense_group_participants",
            "notifications",
        ),
    ):
        expenses = await _find_eligible_expenses(
            family_id, payload.period_start, payload.period_end, session
        )
        if not expenses:
            raise_api_error(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="SPLIT_GROUP_NO_ELIGIBLE_EXPENSES",
                message="No eligible expenses found for this period",
            )

        total_amount = sum(expense.amount for expense in expenses)
        participant_ids = {item.participant_user_id for item in payload.participants}
        await _validate_participants(family_id, participant_ids, session)
        resolved_items = _resolve_group_split_amounts(payload, total_amount)

        group = SplitExpenseGroup(
            family_id=family_id,
            period_start=payload.period_start,
            period_end=payload.period_end,
            created_by_user_id=user.id,
            method=payload.method,
            status=SplitStatus.PENDING,
        )
        session.add(group)
        await session.flush()

        for expense in expenses:
            session.add(
                SplitExpenseGroupItem(split_expense_group_id=group.id, expense_id=expense.id)
            )

        for participant_user_id, amount, percentage in resolved_items:
            session.add(
                SplitExpenseGroupParticipant(
                    split_expense_group_id=group.id,
                    participant_user_id=participant_user_id,
                    amount=amount,
                    percentage=percentage,
                    is_settled=False,
                )
            )

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} created a monthly split for {payload.period_start:%Y-%m}.",
            actor_user_id=user.id,
        )

    return await _to_group_response(group, session)
```

- [ ] **Step 5: Register the router**

In `backend/app/api/v1/router.py`: add `split_expense_groups` to the `from app.api.v1 import (...)` block (alphabetically, before `split_expenses`), and add:

```python
api_router.include_router(
    split_expense_groups.router,
    prefix="/families/{family_id}/split-expense-groups",
    tags=["split-expense-groups"],
)
```

Place this `include_router` call anywhere among the other family-scoped routers (e.g. right before the existing `split_expenses.router` registration).

- [ ] **Step 6: Run to verify it passes**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_split_expense_groups_api.py -v -m integration"`
Expected: all 6 tests PASS.

- [ ] **Step 7: Run the full backend test suite to confirm nothing else broke**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest -v"`
Expected: every test passes, including `tests/test_split_expenses_api.py` unmodified.

- [ ] **Step 8: Lint and type-check**

Run: `cd backend && docker compose run --rm backend sh -c "uv run ruff check app/schemas/split_expense_groups.py app/api/v1/split_expense_groups.py app/api/v1/router.py tests/test_split_expense_groups_api.py && uv run mypy app/schemas/split_expense_groups.py app/api/v1/split_expense_groups.py app/api/v1/router.py"`
Expected: clean.

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/split_expense_groups.py backend/app/api/v1/split_expense_groups.py backend/app/api/v1/router.py backend/tests/test_split_expense_groups_api.py
git commit -m "feat(backend): add split expense group preview and create endpoints"
```

---

### Task 4: Backend API — list, detail, settle; regenerate OpenAPI types

**Files:**
- Modify: `backend/app/api/v1/split_expense_groups.py`
- Test: `backend/tests/test_split_expense_groups_api.py` (append)
- Modify: `openapi/openapi.json` (regenerated)
- Modify: `frontend/src/api/schema.gen.ts` (regenerated)

**Interfaces:**
- Consumes: `_get_group_or_404`, `_get_group_expenses`, `_get_group_participants`, `_to_group_response` (Task 3, same file).
- Produces: `GET /families/{family_id}/split-expense-groups/`, `GET /families/{family_id}/split-expense-groups/{group_id}`, `PATCH /families/{family_id}/split-expense-groups/{group_id}/participants/{participant_id}/settle` — this completes the API surface Task 5 (frontend) consumes.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_split_expense_groups_api.py`:

```python
@pytest.mark.integration
async def test_list_and_get_group_detail(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    await _create_expense(client, family_id, owner["id"], category_id, 2000, True, date(2026, 10, 3))

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": owner["id"]},
            ],
        },
    )
    assert create_response.status_code == 422  # duplicate participant, expected — see below

    # A real two-participant creation, matching the equal-split test's pattern:
    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    real_create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-10-01",
            "period_end": "2026-10-31",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert real_create_response.status_code == 201
    group_id = real_create_response.json()["id"]

    list_response = await client.get(f"/api/v1/families/{family_id}/split-expense-groups/")
    assert list_response.status_code == 200
    assert any(item["id"] == group_id for item in list_response.json())

    detail_response = await client.get(f"/api/v1/families/{family_id}/split-expense-groups/{group_id}")
    assert detail_response.status_code == 200
    assert detail_response.json()["id"] == group_id


@pytest.mark.integration
async def test_settle_all_participants_flips_group_status_to_settled(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    await _create_expense(client, family_id, owner["id"], category_id, 1000, True, date(2026, 11, 5))

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

    create_response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-11-01",
            "period_end": "2026-11-30",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": member["id"]},
            ],
        },
    )
    assert create_response.status_code == 201
    group = create_response.json()

    for participant in group["participants"]:
        settle_response = await client.patch(
            f"/api/v1/families/{family_id}/split-expense-groups/{group['id']}/participants/{participant['id']}/settle",
            json={"is_settled": True},
        )
        assert settle_response.status_code == 200

    final_detail = await client.get(f"/api/v1/families/{family_id}/split-expense-groups/{group['id']}")
    assert final_detail.json()["status"] == "settled"
    assert final_detail.json()["outstanding_amount"] == 0


@pytest.mark.integration
async def test_create_rejects_non_family_member_participant(client: AsyncClient) -> None:
    owner = await _register(client, _unique_email(), "Owner")
    family_id = await _create_family(client)
    category_id = await _get_global_category_id(client, family_id)
    await _create_expense(client, family_id, owner["id"], category_id, 1000, True, date(2026, 12, 5))

    member_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as member_client:
        member = await _register(member_client, member_email, "Bob")
        assert (
            await client.post(f"/api/v1/families/{family_id}/members", json={"email": member_email})
        ).status_code == 201

        create_response = await client.post(
            f"/api/v1/families/{family_id}/split-expense-groups/",
            json={
                "period_start": "2026-12-01",
                "period_end": "2026-12-31",
                "method": "equal",
                "participants": [
                    {"participant_user_id": owner["id"]},
                    {"participant_user_id": member["id"]},
                ],
            },
        )
    assert create_response.status_code == 201

    outsider_email = _unique_email()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as outsider_client:
        await _register(outsider_client, outsider_email, "Eve")

    response = await client.post(
        f"/api/v1/families/{family_id}/split-expense-groups/",
        json={
            "period_start": "2026-12-01",
            "period_end": "2026-12-31",
            "method": "equal",
            "participants": [
                {"participant_user_id": owner["id"]},
                {"participant_user_id": str(uuid.uuid4())},
            ],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "SPLIT_PARTICIPANT_NOT_IN_FAMILY"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_split_expense_groups_api.py -v -m integration"`
Expected: the 3 new tests FAIL with `404 Not Found` (routes don't exist yet); the 6 tests from Task 3 still PASS.

- [ ] **Step 3: Add the three routes**

Add to `backend/app/api/v1/split_expense_groups.py`:
- Add `from datetime import date, datetime, timezone` (extend the existing `from datetime import date` import to include `datetime, timezone`).
- Add `from app.core.permissions import require_owner_admin_or_creator` and `SettleSplitExpenseGroupParticipantRequest` to the `app.schemas.split_expense_groups` import block.

```python
@router.get("/")
async def list_split_expense_groups(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SplitExpenseGroupResponse]:
    groups = await session.scalars(
        select(SplitExpenseGroup)
        .where(SplitExpenseGroup.family_id == family_id)
        .order_by(SplitExpenseGroup.created_at.desc())
    )
    return [await _to_group_response(group, session) for group in groups.all()]


@router.get("/{group_id}")
async def get_split_expense_group(
    family_id: uuid.UUID,
    group_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseGroupResponse:
    group = await _get_group_or_404(family_id, group_id, session)
    return await _to_group_response(group, session)


@router.patch("/{group_id}/participants/{participant_id}/settle")
async def settle_split_expense_group_participant(
    family_id: uuid.UUID,
    group_id: uuid.UUID,
    participant_id: uuid.UUID,
    payload: SettleSplitExpenseGroupParticipantRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseGroupResponse:
    async with locked_write(
        session,
        tables=("split_expense_groups", "split_expense_group_participants", "notifications"),
    ):
        group = await _get_group_or_404(family_id, group_id, session)
        participant = await session.scalar(
            select(SplitExpenseGroupParticipant)
            .where(
                SplitExpenseGroupParticipant.id == participant_id,
                SplitExpenseGroupParticipant.split_expense_group_id == group.id,
            )
            .with_for_update()
        )
        if participant is None:
            raise_api_error(
                status_code=status.HTTP_404_NOT_FOUND,
                code="SPLIT_EXPENSE_GROUP_PARTICIPANT_NOT_FOUND",
                message="Split expense group participant not found",
            )

        if participant.participant_user_id != user.id:
            require_owner_admin_or_creator(membership, group.created_by_user_id)

        participant.is_settled = payload.is_settled
        participant.settled_at = datetime.now(timezone.utc) if payload.is_settled else None

        all_participants = await _get_group_participants(group.id, session)
        group.status = (
            SplitStatus.SETTLED
            if all_participants and all(item.is_settled for item in all_participants)
            else SplitStatus.PENDING
        )

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated monthly split settlement status.",
            actor_user_id=user.id,
        )

    return await _to_group_response(group, session)
```

Place `GET /` and `GET /{group_id}` after the existing `POST /` route, and keep `GET /preview` where it already is — declared BEFORE `GET /{group_id}`, per the ordering note in Task 3.

- [ ] **Step 4: Run to verify it passes**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest tests/test_split_expense_groups_api.py -v -m integration"`
Expected: all 9 tests in the file PASS.

- [ ] **Step 5: Run the full backend suite**

Run: `cd backend && docker compose run --rm backend sh -c "uv run pytest -v"`
Expected: everything passes.

- [ ] **Step 6: Lint and type-check**

Run: `cd backend && docker compose run --rm backend sh -c "uv run ruff check app/api/v1/split_expense_groups.py tests/test_split_expense_groups_api.py && uv run mypy app/api/v1/split_expense_groups.py"`
Expected: clean.

- [ ] **Step 7: Regenerate and commit the OpenAPI contract**

```bash
cd backend
docker compose run --rm backend sh -c "uv run python scripts/export_openapi.py"
cd ../frontend
docker compose run --rm frontend sh -c "pnpm run generate:api-types"
```
(If the frontend container isn't set up for one-off `run --rm` the same way, run `pnpm run generate:api-types` directly from the `frontend/` directory with Node/pnpm installed locally instead — either produces the same `frontend/src/api/schema.gen.ts` output.)

Verify: `git diff --stat openapi/openapi.json frontend/src/api/schema.gen.ts` shows changes (new schemas/paths present) — confirms the regeneration actually picked up the new endpoints.

- [ ] **Step 8: Commit**

```bash
git add backend/app/api/v1/split_expense_groups.py backend/tests/test_split_expense_groups_api.py openapi/openapi.json frontend/src/api/schema.gen.ts
git commit -m "feat(backend): add split expense group list, detail, and settle endpoints"
```

---

### Task 5: Frontend API client and store

**Files:**
- Modify: `frontend/src/finance/financeApi.ts`
- Modify: `frontend/src/finance/stores/splitExpensesStore.ts`
- Modify: `frontend/src/api/errorI18n.ts`

**Interfaces:**
- Consumes: `SplitExpenseGroupResponse`, `SplitExpenseGroupPreviewResponse`, `CreateSplitExpenseGroupRequest` schemas from `frontend/src/api/schema.gen.ts` (Task 4's regeneration).
- Produces: `previewSplitExpenseGroup`, `createSplitExpenseGroup`, `listSplitExpenseGroups`, `settleSplitExpenseGroupParticipant` in `frontend/src/finance/financeApi.ts`; new group-related state and actions on `useSplitExpensesStore` — Task 6 (the page component) consumes these exact names.

- [ ] **Step 1: Add types and API functions to `financeApi.ts`**

Add these type exports near the existing `SplitExpense`/`SplitMethod`/`CreateSplitExpenseInput` block:

```typescript
export type SplitExpenseGroup = components["schemas"]["SplitExpenseGroupResponse"];
export type SplitExpenseGroupPreview = components["schemas"]["SplitExpenseGroupPreviewResponse"];
export type CreateSplitExpenseGroupInput = components["schemas"]["CreateSplitExpenseGroupRequest"];
```

Add these functions near the end of the file, after the existing `settleSplitExpenseItem` function:

```typescript
export async function previewSplitExpenseGroup(
  familyId: string,
  periodStart: string,
  periodEnd: string,
): Promise<SplitExpenseGroupPreview> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/split-expense-groups/preview",
    {
      params: {
        path: { family_id: familyId },
        query: { period_start: periodStart, period_end: periodEnd },
      },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "preview_split_expense_group_failed",
      fallbackMessage: "Failed to preview split expense group",
    });
  }
  return data;
}

export async function createSplitExpenseGroup(
  familyId: string,
  input: CreateSplitExpenseGroupInput,
): Promise<SplitExpenseGroup> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/split-expense-groups/",
    {
      params: { path: { family_id: familyId } },
      body: input,
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_split_expense_group_failed",
      fallbackMessage: "Failed to create split expense group",
    });
  }
  return data;
}

export async function listSplitExpenseGroups(familyId: string): Promise<SplitExpenseGroup[]> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/split-expense-groups/",
    { params: { path: { family_id: familyId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_split_expense_groups_failed",
      fallbackMessage: "Failed to list split expense groups",
    });
  }
  return data;
}

export async function settleSplitExpenseGroupParticipant(
  familyId: string,
  groupId: string,
  participantId: string,
  isSettled: boolean,
): Promise<SplitExpenseGroup> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/split-expense-groups/{group_id}/participants/{participant_id}/settle",
    {
      params: {
        path: { family_id: familyId, group_id: groupId, participant_id: participantId },
      },
      body: { is_settled: isSettled },
    },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "settle_split_expense_group_participant_failed",
      fallbackMessage: "Failed to update settlement status",
    });
  }
  return data;
}
```

- [ ] **Step 2: Map the new backend error codes**

In `frontend/src/api/errorI18n.ts`, add alongside the existing `SPLIT_*` entries:

```typescript
  SPLIT_GROUP_NO_ELIGIBLE_EXPENSES: "finance.splitGroupNoEligibleExpenses",
  SPLIT_GROUP_INVALID_PERIOD: "finance.splitGroupInvalidPeriod",
  SPLIT_EXPENSE_GROUP_NOT_FOUND: "finance.splitGroupNotFound",
  SPLIT_EXPENSE_GROUP_PARTICIPANT_NOT_FOUND: "finance.splitGroupParticipantNotFound",
```

(These 4 i18n keys are added to both locale files in Task 6 — this task only wires the mapping; the app still compiles and runs fine before Task 6 adds the actual key text, `react-i18next` just renders the raw key as a fallback if hit, which won't happen in practice before Task 6 lands in the same PR/plan run.)

- [ ] **Step 3: Extend the store with group state and actions**

Replace the full content of `frontend/src/finance/stores/splitExpensesStore.ts` with:

```typescript
import { create } from "zustand";
import { translateApiError } from "../../api/errorI18n";
import { listExpenses, type Expense } from "../../expenses/expenseApi";
import { getFamilyDetail, type FamilyDetail } from "../../families/familyApi";
import {
  createSplitExpense,
  createSplitExpenseGroup,
  listSplitExpenseGroups,
  listSplitExpenses,
  previewSplitExpenseGroup,
  settleSplitExpenseGroupParticipant,
  settleSplitExpenseItem,
  type SplitExpense,
  type SplitExpenseGroup,
  type SplitExpenseGroupPreview,
  type SplitMethod,
} from "../financeApi";
import type { Notify, Translate } from "./types";

interface SplitFormState {
  expenseId: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

interface GroupFormState {
  month: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthToDateRange(month: string): { periodStart: string; periodEnd: string } {
  const [yearText, monthText] = month.split("-");
  const year = Number(yearText);
  const monthIndex = Number(monthText) - 1;
  const start = new Date(year, monthIndex, 1);
  const end = new Date(year, monthIndex + 1, 0);
  const toIso = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { periodStart: toIso(start), periodEnd: toIso(end) };
}

interface SplitExpensesStore {
  family: FamilyDetail | null;
  expenses: Expense[];
  splits: SplitExpense[];
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  form: SplitFormState;
  setForm: (patch: Partial<SplitFormState>) => void;
  toggleParticipant: (userId: string) => void;
  setCustomAmount: (userId: string, amount: string) => void;
  setPercentage: (userId: string, percentage: string) => void;
  load: (familyId: string, t: Translate) => Promise<void>;
  createSplit: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  toggleSettle: (
    familyId: string,
    splitId: string,
    itemId: string,
    currentState: boolean,
    t: Translate,
    notify: Notify,
  ) => Promise<void>;

  groups: SplitExpenseGroup[];
  groupPreview: SplitExpenseGroupPreview | null;
  isPreviewLoading: boolean;
  isGroupSaving: boolean;
  groupForm: GroupFormState;
  setGroupForm: (patch: Partial<GroupFormState>) => void;
  toggleGroupParticipant: (userId: string) => void;
  setGroupCustomAmount: (userId: string, amount: string) => void;
  setGroupPercentage: (userId: string, percentage: string) => void;
  previewGroup: (familyId: string, t: Translate) => Promise<void>;
  createGroup: (familyId: string, t: Translate, notify: Notify) => Promise<void>;
  toggleGroupParticipantSettle: (
    familyId: string,
    groupId: string,
    participantId: string,
    currentState: boolean,
    t: Translate,
    notify: Notify,
  ) => Promise<void>;
}

const defaultForm: SplitFormState = {
  expenseId: "",
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

const defaultGroupForm: GroupFormState = {
  month: currentYearMonth(),
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

export const useSplitExpensesStore = create<SplitExpensesStore>((set, get) => ({
  family: null,
  expenses: [],
  splits: [],
  isLoading: true,
  isSaving: false,
  error: null,
  form: defaultForm,

  setForm: (patch) => {
    set((state) => ({ form: { ...state.form, ...patch } }));
  },

  toggleParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.form.participantIds.includes(userId);
      return {
        form: {
          ...state.form,
          participantIds: hasParticipant
            ? state.form.participantIds.filter((id) => id !== userId)
            : [...state.form.participantIds, userId],
        },
      };
    });
  },

  setCustomAmount: (userId, amount) => {
    set((state) => ({
      form: {
        ...state.form,
        customAmountByParticipant: { ...state.form.customAmountByParticipant, [userId]: amount },
      },
    }));
  },

  setPercentage: (userId, percentage) => {
    set((state) => ({
      form: {
        ...state.form,
        percentageByParticipant: { ...state.form.percentageByParticipant, [userId]: percentage },
      },
    }));
  },

  load: async (familyId, t) => {
    set({ isLoading: true, error: null });

    try {
      const [family, expenses, splits, groups] = await Promise.all([
        getFamilyDetail(familyId),
        listExpenses(familyId),
        listSplitExpenses(familyId),
        listSplitExpenseGroups(familyId),
      ]);
      set({ family, expenses, splits, groups });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isLoading: false });
    }
  },

  createSplit: async (familyId, t, notify) => {
    const { form } = get();

    if (!form.expenseId || form.participantIds.length === 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    const participants = form.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };

      if (form.method === "custom") {
        return { ...base, amount: Number(form.customAmountByParticipant[participantId] ?? 0) };
      }

      if (form.method === "percentage") {
        return { ...base, percentage: Number(form.percentageByParticipant[participantId] ?? 0) };
      }

      return base;
    });

    set({ error: null, isSaving: true });

    try {
      await createSplitExpense(familyId, { expense_id: form.expenseId, method: form.method, participants });

      set({ form: defaultForm, splits: await listSplitExpenses(familyId) });
      notify({ message: t("finance.splitCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isSaving: false });
    }
  },

  toggleSettle: async (familyId, splitId, itemId, currentState, t, notify) => {
    set({ error: null });

    try {
      const updated = await settleSplitExpenseItem(familyId, splitId, itemId, !currentState);
      set((state) => ({
        splits: state.splits.map((split) => (split.id === updated.id ? updated : split)),
      }));
      notify({ message: t("finance.splitUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },

  groups: [],
  groupPreview: null,
  isPreviewLoading: false,
  isGroupSaving: false,
  groupForm: defaultGroupForm,

  setGroupForm: (patch) => {
    set((state) => ({ groupForm: { ...state.groupForm, ...patch }, groupPreview: null }));
  },

  toggleGroupParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.groupForm.participantIds.includes(userId);
      return {
        groupForm: {
          ...state.groupForm,
          participantIds: hasParticipant
            ? state.groupForm.participantIds.filter((id) => id !== userId)
            : [...state.groupForm.participantIds, userId],
        },
      };
    });
  },

  setGroupCustomAmount: (userId, amount) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        customAmountByParticipant: { ...state.groupForm.customAmountByParticipant, [userId]: amount },
      },
    }));
  },

  setGroupPercentage: (userId, percentage) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        percentageByParticipant: { ...state.groupForm.percentageByParticipant, [userId]: percentage },
      },
    }));
  },

  previewGroup: async (familyId, t) => {
    const { groupForm } = get();
    const { periodStart, periodEnd } = monthToDateRange(groupForm.month);

    set({ isPreviewLoading: true, error: null });
    try {
      const preview = await previewSplitExpenseGroup(familyId, periodStart, periodEnd);
      set({ groupPreview: preview });
    } catch (error) {
      set({ error: translateApiError(t, error, "expense.actionFailed") });
    } finally {
      set({ isPreviewLoading: false });
    }
  },

  createGroup: async (familyId, t, notify) => {
    const { groupForm, groupPreview } = get();

    if (!groupPreview || groupForm.participantIds.length === 0) {
      set({ error: t("expense.actionFailed") });
      return;
    }

    const { periodStart, periodEnd } = monthToDateRange(groupForm.month);
    const participants = groupForm.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };

      if (groupForm.method === "custom") {
        return { ...base, amount: Number(groupForm.customAmountByParticipant[participantId] ?? 0) };
      }

      if (groupForm.method === "percentage") {
        return { ...base, percentage: Number(groupForm.percentageByParticipant[participantId] ?? 0) };
      }

      return base;
    });

    set({ error: null, isGroupSaving: true });

    try {
      await createSplitExpenseGroup(familyId, {
        period_start: periodStart,
        period_end: periodEnd,
        method: groupForm.method,
        participants,
      });

      set({
        groupForm: { ...defaultGroupForm, month: groupForm.month },
        groupPreview: null,
        groups: await listSplitExpenseGroups(familyId),
      });
      notify({ message: t("finance.splitCreated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    } finally {
      set({ isGroupSaving: false });
    }
  },

  toggleGroupParticipantSettle: async (familyId, groupId, participantId, currentState, t, notify) => {
    set({ error: null });

    try {
      const updated = await settleSplitExpenseGroupParticipant(
        familyId,
        groupId,
        participantId,
        !currentState,
      );
      set((state) => ({
        groups: state.groups.map((group) => (group.id === updated.id ? updated : group)),
      }));
      notify({ message: t("finance.splitUpdated"), variant: "success" });
    } catch (error) {
      const message = translateApiError(t, error, "expense.actionFailed");
      set({ error: message });
      notify({ message, variant: "error" });
    }
  },
}));
```

- [ ] **Step 2: Verify types**

Run: `cd frontend && pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep -v "finance/stores/\(accountsLedgerStore\|dataOpsStore\|goalsStore\|splitExpensesStore.*TFunctionBrand\|subscriptionsStore\)"`

Note: `splitExpensesStore.ts` itself is expected to be clean — the grep filter above only excludes the OTHER, pre-existing `$TFunctionBrand` errors in sibling store files that are unrelated to this change (confirmed pre-existing in an earlier session). If `splitExpensesStore.ts` itself shows a new error, fix it — don't filter it away.

Expected: no NEW errors attributable to `splitExpensesStore.ts` or `financeApi.ts` or `errorI18n.ts`.

- [ ] **Step 3: Lint**

Run: `cd frontend && pnpm exec eslint src/finance/financeApi.ts src/finance/stores/splitExpensesStore.ts src/api/errorI18n.ts --max-warnings 0`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/finance/financeApi.ts frontend/src/finance/stores/splitExpensesStore.ts frontend/src/api/errorI18n.ts
git commit -m "feat(frontend): add split expense group API client and store"
```

---

### Task 6: Frontend UI — month-group section on Split Expenses page, i18n

**Files:**
- Modify: `frontend/src/finance/SplitExpensesPage.tsx`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Modify: `frontend/src/i18n/locales/vi/common.json`

**Interfaces:**
- Consumes: `groups`, `groupPreview`, `isPreviewLoading`, `isGroupSaving`, `groupForm`, `setGroupForm`, `toggleGroupParticipant`, `setGroupCustomAmount`, `setGroupPercentage`, `previewGroup`, `createGroup`, `toggleGroupParticipantSettle` from `useSplitExpensesStore` (Task 5).

- [ ] **Step 1: Add the new i18n keys**

Add to `frontend/src/i18n/locales/ja/common.json`, inside the `finance` object, alongside the existing `split*` keys (e.g. right after `"splitItemNotFound"`):

```json
    "splitByMonth": "月ごとにまとめて精算",
    "splitByMonthDescription": "選択した月の共有支出をすべてまとめて、1回で精算します。",
    "selectMonth": "月を選択",
    "previewMonth": "プレビュー",
    "groupTotal": "合計金額",
    "groupIncludedExpenses": "対象となる支出",
    "noEligibleExpensesForMonth": "この月に対象となる支出がありません",
    "createGroupSplit": "月ごとの精算を作成",
    "groupSplitList": "月ごとの精算一覧",
    "noGroupSplits": "まだ月ごとの精算がありません",
    "splitGroupNoEligibleExpenses": "この月に対象となる支出がありません",
    "splitGroupInvalidPeriod": "終了日は開始日以降の日付にしてください",
    "splitGroupNotFound": "月ごとの精算が見つかりません",
    "splitGroupParticipantNotFound": "参加者情報が見つかりません",
```

Add to `frontend/src/i18n/locales/vi/common.json`, in the same location:

```json
    "splitByMonth": "Chia theo tháng",
    "splitByMonthDescription": "Gộp toàn bộ chi tiêu chung trong tháng đã chọn lại và chia 1 lần duy nhất.",
    "selectMonth": "Chọn tháng",
    "previewMonth": "Xem trước",
    "groupTotal": "Tổng cộng",
    "groupIncludedExpenses": "Các khoản chi được gộp",
    "noEligibleExpensesForMonth": "Không có khoản chi hợp lệ trong tháng này",
    "createGroupSplit": "Tạo chia theo tháng",
    "groupSplitList": "Danh sách chia theo tháng",
    "noGroupSplits": "Chưa có nhóm chia theo tháng nào",
    "splitGroupNoEligibleExpenses": "Không có khoản chi hợp lệ trong tháng này",
    "splitGroupInvalidPeriod": "Ngày kết thúc phải sau ngày bắt đầu",
    "splitGroupNotFound": "Không tìm thấy nhóm chia theo tháng",
    "splitGroupParticipantNotFound": "Không tìm thấy thông tin thành viên",
```

Verify both files stay valid JSON and structurally in sync (same key set) — run `python3 -c "import json; ja=json.load(open('frontend/src/i18n/locales/ja/common.json')); vi=json.load(open('frontend/src/i18n/locales/vi/common.json')); assert ja.keys()==vi.keys(); import sys; print('top-level keys match')"` from the repo root, and separately diff the `finance` sub-object's key sets the same way if you want extra confidence — a JSON syntax error or key-set mismatch here breaks the app.

- [ ] **Step 2: Load groups when the page mounts**

In `frontend/src/finance/SplitExpensesPage.tsx`, extend the destructured store values (the existing `const { family, expenses, splits, isLoading, isSaving, error, form, setForm, toggleParticipant, setCustomAmount, setPercentage, load, createSplit, toggleSettle } = useSplitExpensesStore();` block) to also pull `groups, groupPreview, isPreviewLoading, isGroupSaving, groupForm, setGroupForm, toggleGroupParticipant, setGroupCustomAmount, setGroupPercentage, previewGroup, createGroup, toggleGroupParticipantSettle`.

No new `useEffect` is needed for the initial fetch — `useSplitExpensesStore`'s `load` action (Task 5) already fetches `groups` as part of the same `Promise.all` that loads `family`/`expenses`/`splits`, so the existing `useEffect(() => { ... void load(familyId, t); }, [familyId, load, t]);` already covers it.

- [ ] **Step 3: Add handler functions**

Add alongside the existing `handleCreateSplit`/`handleToggleSettle` functions:

```typescript
  function handlePreviewGroup() {
    if (!familyId) {
      return;
    }

    void previewGroup(familyId, t);
  }

  function handleCreateGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) {
      return;
    }

    void createGroup(familyId, t, showSnackbar);
  }

  function handleToggleGroupParticipantSettle(groupId: string, participantId: string, currentState: boolean) {
    if (!familyId) {
      return;
    }

    void toggleGroupParticipantSettle(familyId, groupId, participantId, currentState, t, showSnackbar);
  }
```

- [ ] **Step 4: Add the month-group section to the page**

Insert a new `<Card>` block between the existing "create split" `<Card>` and the existing "split list" `<Card>` (i.e., right after the `</Card>` that closes the per-expense create form, before the `<Card>` that starts the per-expense list):

```tsx
        <Card>
          <CardHeader>
            <CardTitle>{t("finance.splitByMonth")}</CardTitle>
            <CardDescription>{t("finance.splitByMonthDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Field label={t("finance.selectMonth")} htmlFor="finance-split-group-month">
                <input
                  id="finance-split-group-month"
                  type="month"
                  value={groupForm.month}
                  onChange={(event) => setGroupForm({ month: event.target.value })}
                />
              </Field>

              <Button type="button" variant="outline" loading={isPreviewLoading} onClick={handlePreviewGroup}>
                {t("finance.previewMonth")}
              </Button>

              {groupPreview ? (
                groupPreview.expenses.length === 0 ? (
                  <EmptyState title={t("finance.noEligibleExpensesForMonth")} />
                ) : (
                  <form className="space-y-4" onSubmit={handleCreateGroup}>
                    <div className="surface-card space-y-2 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-foreground">{t("finance.groupIncludedExpenses")}</span>
                        <span className="font-mono text-foreground">
                          {t("finance.groupTotal")}: {formatMoney(groupPreview.total_amount, currencyCode)}
                        </span>
                      </div>
                      <ul className="space-y-1 text-sm text-muted-foreground">
                        {groupPreview.expenses.map((expense) => (
                          <li key={expense.id} className="flex items-center justify-between gap-2">
                            <span>{expense.expense_date} {expense.description ? `• ${expense.description}` : ""}</span>
                            <span className="font-mono">{formatMoney(expense.amount, currencyCode)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Field label={t("finance.splitMethod")} htmlFor="finance-split-group-method" required>
                      <select
                        id="finance-split-group-method"
                        value={groupForm.method}
                        onChange={(event) => setGroupForm({ method: event.target.value as SplitMethod })}
                      >
                        {SPLIT_METHODS.map((item) => (
                          <option key={item} value={item}>
                            {splitMethodLabel(item)}
                          </option>
                        ))}
                      </select>
                    </Field>

                    <fieldset className="space-y-3 rounded-md border border-border/80 p-3">
                      <legend className="px-1 text-sm font-medium text-foreground">{t("finance.participants")}</legend>
                      {family?.members.map((member) => (
                        <label key={member.user_id} className="flex flex-wrap items-center gap-3">
                          <input
                            type="checkbox"
                            checked={groupForm.participantIds.includes(member.user_id)}
                            onChange={() => toggleGroupParticipant(member.user_id)}
                          />
                          <span className="text-sm text-foreground">{member.display_name}</span>
                          {groupForm.method === "custom" && groupForm.participantIds.includes(member.user_id) ? (
                            <input
                              type="number"
                              className="max-w-36"
                              min={0}
                              placeholder={t("expense.amount")}
                              value={groupForm.customAmountByParticipant[member.user_id] ?? ""}
                              onChange={(event) => setGroupCustomAmount(member.user_id, event.target.value)}
                            />
                          ) : null}
                          {groupForm.method === "percentage" && groupForm.participantIds.includes(member.user_id) ? (
                            <input
                              type="number"
                              className="max-w-28"
                              min={0}
                              max={100}
                              placeholder="%"
                              value={groupForm.percentageByParticipant[member.user_id] ?? ""}
                              onChange={(event) => setGroupPercentage(member.user_id, event.target.value)}
                            />
                          ) : null}
                        </label>
                      ))}
                    </fieldset>

                    <Button type="submit" loading={isGroupSaving}>
                      {t("finance.createGroupSplit")}
                    </Button>
                  </form>
                )
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("finance.groupSplitList")}</CardTitle>
          </CardHeader>
          <CardContent>
            {groups.length === 0 ? (
              <EmptyState title={t("finance.noGroupSplits")} />
            ) : (
              <ul className="space-y-4">
                {groups.map((group) => (
                  <li key={group.id} className="interactive-row space-y-3 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant={group.status === "settled" ? "success" : "warning"}>
                          {splitStatusLabel(group.status)}
                        </Badge>
                        <Badge variant="info">{splitMethodLabel(group.method)}</Badge>
                        <span className="text-sm text-muted-foreground">{group.period_start.slice(0, 7)}</span>
                      </div>
                      <span className="font-mono text-sm text-foreground">
                        {formatMoney(group.total_amount, currencyCode)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {t("finance.outstanding")}: {formatMoney(group.outstanding_amount, currencyCode)}
                    </p>
                    <ul className="space-y-2">
                      {group.participants.map((participant) => (
                        <li key={participant.id} className="rounded-md border border-border/80 bg-muted/30 px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="font-medium text-foreground">
                              {memberNameById[participant.participant_user_id] ?? participant.participant_user_id}
                              {participant.participant_user_id === user?.id ? ` (${t("finance.you")})` : ""}
                            </span>
                            <span className="font-mono text-foreground">
                              {formatMoney(participant.amount, currencyCode)}
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                            <Badge variant={participant.is_settled ? "success" : "warning"}>
                              {participant.is_settled ? t("finance.settled") : t("finance.unsettled")}
                            </Badge>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={() =>
                                handleToggleGroupParticipantSettle(group.id, participant.id, participant.is_settled)
                              }
                            >
                              {participant.is_settled ? t("finance.markUnsettled") : t("finance.markSettled")}
                            </Button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
```

- [ ] **Step 5: Type-check, lint, and run the existing test suite**

Run:
```bash
cd frontend
pnpm exec tsc --noEmit -p tsconfig.json 2>&1 | grep "SplitExpensesPage\|error TS" | grep -v "finance/stores/"
pnpm exec eslint src/finance/SplitExpensesPage.tsx --max-warnings 0
pnpm run test
```
Expected: no new TypeScript errors attributable to `SplitExpensesPage.tsx`, eslint clean, and the full existing test suite still passes (this page has no pre-existing unit test file — coverage here is via the Playwright suite, see Step 6).

- [ ] **Step 6: Verify the Playwright finance-pages coverage still passes**

The existing `frontend/tests/ui/smoke/finance-pages.smoke.spec.ts` and `frontend/tests/ui/interaction/finance-guided-usage.interaction.spec.ts` already visit the Split Expenses page. Run them against the running dev stack (`docker compose up -d` first) to confirm the new section doesn't break page load or the existing guided-usage flow:

```bash
cd frontend
pnpm exec playwright test tests/ui/smoke/finance-pages.smoke.spec.ts tests/ui/interaction/finance-guided-usage.interaction.spec.ts
```

Expected: both pass unmodified. If either fails because it asserts something about the page's exact layout that this task's new section disturbs (e.g. an element-count or text assertion), fix the new section's markup to stop colliding — do not weaken the existing test's assertions to make it pass.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/finance/SplitExpensesPage.tsx frontend/src/i18n/locales/ja/common.json frontend/src/i18n/locales/vi/common.json
git commit -m "feat(frontend): add month-based split expense group UI"
```

---

## After all tasks: verification

- [ ] Full backend suite from a clean state: `docker compose down -v && docker compose up -d --build postgres redis minio && cd backend && docker compose run --rm backend sh -c "uv sync --extra dev && uv run alembic upgrade head && uv run pytest && uv run ruff check . && uv run mypy ." && cd ..` (bring up `minio` the way earlier tasks in this repo's history have — via a standalone container on the compose network — if the `minio` service in `docker-compose.yml` is still commented out; the receipts feature's own tests need it, unrelated to this plan).
- [ ] Full frontend suite: `cd frontend && pnpm run lint && pnpm run typecheck && pnpm run test && pnpm run build && cd ..`
- [ ] `git status` clean, every commit present.
- [ ] Manually exercise the flow once end to end (register → create a family → add a couple of shared expenses in the current month → open Split Expenses → pick the month → preview → create with "equal" → settle one participant → confirm the group's status stays "pending" until every participant settles).
