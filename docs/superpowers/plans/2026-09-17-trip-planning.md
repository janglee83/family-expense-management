# Trip Planning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a family-owned "Trips" feature — trip with optional budget, a day-grouped itinerary of items, and the ability to link real expenses to a trip and (optionally) to a specific itinerary item — as a new top-level app section, backed by 2 new DB tables + 2 new nullable columns on `expenses`.

**Architecture:** A new backend router (`trips.py`) nested under `/families/{family_id}/trips`, mirroring the existing `goals.py` router's structure (list/create/get/update/delete + nested sub-resource endpoints for participants and itinerary items). The frontend gets a new `frontend/src/trips/` module (API client, TanStack Query hooks, list page, detail page) plus a small extension to the existing `ExpenseForm` to link an expense to a trip/item. No changes to the existing Split Expenses feature — trip-linked shared expenses are picked up by it unmodified via manual date-range selection.

**Tech Stack:** FastAPI + SQLAlchemy (async) + Alembic + Pydantic (backend); React 18 + TypeScript + TanStack Query + openapi-fetch generated client (frontend).

**Spec:** `docs/superpowers/specs/2026-09-17-trip-planning-design.md`

## Global Constraints

- Amounts are stored as plain integers (no decimals) — matches every existing money field in this codebase (JPY/VND have no minor currency unit).
- `expenses.trip_id`/`expenses.trip_itinerary_item_id` use `ondelete="SET NULL"` — deleting a trip or itinerary item must never delete a real expense record, only unlink it (spec §3).
- `trip_itinerary_item_id` may only be set alongside a `trip_id`, and the referenced item must belong to that `trip_id` (spec §3, §7) — enforced in the expenses router, not just the DB.
- Permissions: every family member may view a trip, add/edit/delete itinerary items, and link expenses to it. Only the trip's creator, or a family `owner`/`admin`, may edit the trip's own fields or manage participants — reuse `app.core.permissions.require_owner_admin_or_creator` verbatim (spec §6), the same helper `goals.py`/`split_expense_groups.py` already use.
- No new split-expense engine or "split this trip" shortcut (spec §2) — the existing Split Expenses page needs zero code changes.
- No hour-grid/calendar itinerary UI (spec §2) — day-grouped list only.
- Every form-level validation failure attributable to one field renders via `Field`'s `error` prop, not a generic top banner — this app's established pattern (see `docs/superpowers/specs/2026-09-14-ui-redesign-design.md` §4, already implemented across every existing form).

---

### Task 1: Database migration

**Files:**
- Create: `backend/alembic/versions/0014_add_trips.py`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: the `trips`, `trip_participants`, `trip_itinerary_items` tables, and two new nullable columns (`trip_id`, `trip_itinerary_item_id`) on the existing `expenses` table — every later backend task depends on these exact table/column names.

- [ ] **Step 1: Write the migration**

Create `backend/alembic/versions/0014_add_trips.py`:

```python
"""add trips, trip_participants, trip_itinerary_items, and trip links on expenses

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-17

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None

FAMILY_FK = "families.id"
USER_FK = "users.id"


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("destination", sa.String(length=200), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("budget_amount", sa.Integer(), nullable=True),
        sa.Column("is_cancelled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint("end_date >= start_date", name="ck_trips_end_date_after_start_date"),
        sa.CheckConstraint(
            "budget_amount IS NULL OR budget_amount > 0", name="ck_trips_budget_amount_positive"
        ),
    )
    op.create_index("ix_trips_family_id", "trips", ["family_id"])

    op.create_table(
        "trip_participants",
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK, ondelete="CASCADE"),
            primary_key=True,
        ),
    )

    op.create_table(
        "trip_itinerary_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "family_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(FAMILY_FK, ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey(USER_FK),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.String(length=1000), nullable=True),
        sa.Column("link_url", sa.String(length=2048), nullable=True),
        sa.Column("item_date", sa.Date(), nullable=False),
        sa.Column("item_time", sa.Time(), nullable=True),
        sa.Column("planned_amount", sa.Integer(), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.CheckConstraint(
            "planned_amount IS NULL OR planned_amount > 0",
            name="ck_trip_itinerary_items_planned_amount_positive",
        ),
    )
    op.create_index("ix_trip_itinerary_items_trip_id", "trip_itinerary_items", ["trip_id"])
    op.create_index("ix_trip_itinerary_items_family_id", "trip_itinerary_items", ["family_id"])

    op.add_column(
        "expenses",
        sa.Column(
            "trip_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trips.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "expenses",
        sa.Column(
            "trip_itinerary_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("trip_itinerary_items.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_expenses_trip_id", "expenses", ["trip_id"])
    op.create_index("ix_expenses_trip_itinerary_item_id", "expenses", ["trip_itinerary_item_id"])

    op.alter_column("trips", "is_cancelled", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_expenses_trip_itinerary_item_id", table_name="expenses")
    op.drop_index("ix_expenses_trip_id", table_name="expenses")
    op.drop_column("expenses", "trip_itinerary_item_id")
    op.drop_column("expenses", "trip_id")

    op.drop_index("ix_trip_itinerary_items_family_id", table_name="trip_itinerary_items")
    op.drop_index("ix_trip_itinerary_items_trip_id", table_name="trip_itinerary_items")
    op.drop_table("trip_itinerary_items")

    op.drop_table("trip_participants")

    op.drop_index("ix_trips_family_id", table_name="trips")
    op.drop_table("trips")
```

- [ ] **Step 2: Apply and verify the migration**

Run: `cd backend && uv run alembic upgrade head`
Expected: succeeds with no errors, ending at revision `0014`.

Run: `cd backend && uv run alembic downgrade -1 && uv run alembic upgrade head`
Expected: both succeed — proves the downgrade path is correct, not just the upgrade.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/0014_add_trips.py
git commit -m "feat(backend): add trips, trip_participants, trip_itinerary_items tables"
```

---

### Task 2: SQLAlchemy models

**Files:**
- Create: `backend/app/models/trip.py`
- Modify: `backend/app/models/expense.py`
- Modify: `backend/app/models/__init__.py`

**Interfaces:**
- Consumes: the tables/columns from Task 1 (exact names must match).
- Produces: `Trip`, `TripParticipant`, `TripItineraryItem` ORM classes (importable from `app.models.trip`), plus `Expense.trip_id`/`Expense.trip_itinerary_item_id` columns — every later backend task imports these.

- [ ] **Step 1: Create the Trip model file**

Create `backend/app/models/trip.py`:

```python
import uuid
from datetime import date, datetime, time

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Time,
    func,
)
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class Trip(Base):
    __tablename__ = "trips"
    __table_args__ = (
        CheckConstraint("end_date >= start_date", name="ck_trips_end_date_after_start_date"),
        CheckConstraint(
            "budget_amount IS NULL OR budget_amount > 0", name="ck_trips_budget_amount_positive"
        ),
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
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    destination: Mapped[str | None] = mapped_column(String(200), nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    budget_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_cancelled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class TripParticipant(Base):
    __tablename__ = "trip_participants"

    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )


class TripItineraryItem(Base):
    __tablename__ = "trip_itinerary_items"
    __table_args__ = (
        CheckConstraint(
            "planned_amount IS NULL OR planned_amount > 0",
            name="ck_trip_itinerary_items_planned_amount_positive",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    trip_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trips.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    family_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("families.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    link_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    item_date: Mapped[date] = mapped_column(Date, nullable=False)
    item_time: Mapped[time | None] = mapped_column(Time, nullable=True)
    planned_amount: Mapped[int | None] = mapped_column(Integer, nullable=True)

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

- [ ] **Step 2: Add the two new columns to the Expense model**

In `backend/app/models/expense.py`, add these two lines to the `Expense` class body, right after the existing `expense_date` column (before `created_at`):

```python
    trip_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("trips.id", ondelete="SET NULL"), nullable=True
    )
    trip_itinerary_item_id: Mapped[uuid.UUID | None] = mapped_column(
        PGUUID(as_uuid=True),
        ForeignKey("trip_itinerary_items.id", ondelete="SET NULL"),
        nullable=True,
    )
```

- [ ] **Step 3: Register the new models in `app/models/__init__.py`**

Read `backend/app/models/__init__.py` first to see its exact existing import/export pattern (it should mirror how `Goal`/`GoalEntry` from `app.models.goal` are already registered — follow that exact same pattern for `Trip`/`TripParticipant`/`TripItineraryItem` from `app.models.trip`). This registration is required so Alembic's autogenerate and the ORM's mapper configuration both see the new models.

- [ ] **Step 4: Verify the models load and match the DB schema**

Run: `cd backend && uv run python -c "from app.models.trip import Trip, TripParticipant, TripItineraryItem; from app.models.expense import Expense; print('ok')"`
Expected: prints `ok` with no import errors.

Run: `cd backend && uv run alembic check`
Expected: no output (or "No new upgrade operations detected") — confirms the ORM models exactly match the migration from Task 1, with no drift.

- [ ] **Step 5: Commit**

```bash
git add backend/app/models/trip.py backend/app/models/expense.py backend/app/models/__init__.py
git commit -m "feat(backend): add Trip, TripParticipant, TripItineraryItem models"
```

---

### Task 3: Pydantic schemas

**Files:**
- Create: `backend/app/schemas/trips.py`

**Interfaces:**
- Consumes: nothing new (pure Pydantic, no DB access).
- Produces: `CreateTripRequest`, `UpdateTripRequest`, `TripItineraryItemRequest`, `UpdateTripItineraryItemRequest`, `TripItineraryItemResponse`, `TripResponse`, `TripDetailResponse` — Task 4/5's router imports all of these by these exact names.

- [ ] **Step 1: Write the schemas**

Create `backend/app/schemas/trips.py`:

```python
import uuid
from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

TripStatus = Literal["upcoming", "ongoing", "completed", "cancelled"]


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class CreateTripRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    start_date: date
    end_date: date
    budget_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @field_validator("destination")
    @classmethod
    def _validate_destination(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def _validate_date_range(self) -> "CreateTripRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class UpdateTripRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    budget_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    is_cancelled: bool | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)

    @field_validator("destination")
    @classmethod
    def _validate_destination(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class TripItineraryItemRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    link_url: str | None = Field(default=None, max_length=2048)
    item_date: date
    item_time: time | None = None
    planned_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @field_validator("description", "link_url")
    @classmethod
    def _validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class UpdateTripItineraryItemRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    link_url: str | None = Field(default=None, max_length=2048)
    item_date: date | None = None
    item_time: time | None = None
    planned_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)

    @field_validator("description", "link_url")
    @classmethod
    def _validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class TripItineraryItemResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    title: str
    description: str | None
    link_url: str | None
    item_date: date
    item_time: time | None
    planned_amount: int | None
    linked_expense_ids: list[uuid.UUID]
    actual_amount: int


class TripResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    destination: str | None
    start_date: date
    end_date: date
    budget_amount: int | None
    is_cancelled: bool
    status: TripStatus
    participant_user_ids: list[uuid.UUID]
    planned_total: int
    actual_total: int


class TripDetailResponse(TripResponse):
    items: list[TripItineraryItemResponse]
```

Note: none of these response models use `ConfigDict(from_attributes=True)`, matching `GoalResponse`/`GoalEntryResponse` in `backend/app/schemas/goals.py` — every field here (`status`, `participant_user_ids`, `planned_total`, `actual_total`, `linked_expense_ids`, `actual_amount`) is computed, not a direct ORM column mirror, so the router always constructs these manually (Task 4/5) rather than via `model_validate(orm_object)`.

- [ ] **Step 2: Verify it imports cleanly**

Run: `cd backend && uv run python -c "from app.schemas.trips import CreateTripRequest, UpdateTripRequest, TripItineraryItemRequest, UpdateTripItineraryItemRequest, TripItineraryItemResponse, TripResponse, TripDetailResponse; print('ok')"`
Expected: prints `ok`.

Run: `cd backend && uv run python -c "from app.schemas.trips import CreateTripRequest; CreateTripRequest(name='Đà Lạt', start_date='2026-03-12', end_date='2026-03-10')"`
Expected: raises a `pydantic.ValidationError` mentioning "end_date must be on or after start_date" — confirms the date-range validator fires.

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/trips.py
git commit -m "feat(backend): add trip request/response schemas"
```

---

### Task 4: Trips CRUD + participants router

**Files:**
- Create: `backend/app/api/v1/trips.py`
- Modify: `backend/app/api/v1/router.py`
- Test: `backend/tests/test_trips_api.py`

**Interfaces:**
- Consumes: `Trip`/`TripParticipant`/`TripItineraryItem` (Task 2), all schemas from Task 3, `app.core.permissions.require_owner_admin_or_creator`, `app.db.transaction.locked_write`, `app.core.notifications.queue_family_notification`, `app.api.deps.get_current_user`/`get_family_membership` — all pre-existing, exact signatures shown in Task 2/3 and this task's code.
- Produces: `router` (FastAPI `APIRouter`) exported from `app.api.v1.trips`, registered at `/families/{family_id}/trips`. Also produces the helper functions `_to_trip_response`, `_to_item_response`, `_get_trip_or_404` that Task 5 (itinerary items, same file) directly calls — Task 5's steps assume these exist.

- [ ] **Step 1: Write the router**

Create `backend/app/api/v1/trips.py`:

```python
import uuid
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.core.permissions import require_owner_admin_or_creator
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.expense import Expense
from app.models.family_member import FamilyMember
from app.models.trip import Trip, TripItineraryItem, TripParticipant
from app.models.user import User
from app.schemas.trips import (
    CreateTripRequest,
    TripDetailResponse,
    TripItineraryItemResponse,
    TripResponse,
    UpdateTripRequest,
)

router = APIRouter()


def _compute_status(trip: Trip, today: date) -> str:
    if trip.is_cancelled:
        return "cancelled"
    if today < trip.start_date:
        return "upcoming"
    if today > trip.end_date:
        return "completed"
    return "ongoing"


async def _get_trip_or_404(family_id: uuid.UUID, trip_id: uuid.UUID, session: AsyncSession) -> Trip:
    trip = await session.scalar(select(Trip).where(Trip.id == trip_id, Trip.family_id == family_id))
    if trip is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="TRIP_NOT_FOUND",
            message="Trip not found",
        )
    return trip


async def _participant_ids(trip_id: uuid.UUID, session: AsyncSession) -> list[uuid.UUID]:
    result = await session.scalars(
        select(TripParticipant.user_id).where(TripParticipant.trip_id == trip_id)
    )
    return list(result.all())


async def _planned_total(trip_id: uuid.UUID, session: AsyncSession) -> int:
    result = await session.scalars(
        select(TripItineraryItem.planned_amount).where(
            TripItineraryItem.trip_id == trip_id, TripItineraryItem.planned_amount.is_not(None)
        )
    )
    return sum(result.all())


async def _actual_total(trip_id: uuid.UUID, session: AsyncSession) -> int:
    result = await session.scalars(select(Expense.amount).where(Expense.trip_id == trip_id))
    return sum(result.all())


async def _to_trip_response(trip: Trip, session: AsyncSession, today: date) -> TripResponse:
    return TripResponse(
        id=trip.id,
        family_id=trip.family_id,
        created_by_user_id=trip.created_by_user_id,
        name=trip.name,
        destination=trip.destination,
        start_date=trip.start_date,
        end_date=trip.end_date,
        budget_amount=trip.budget_amount,
        is_cancelled=trip.is_cancelled,
        status=_compute_status(trip, today),
        participant_user_ids=await _participant_ids(trip.id, session),
        planned_total=await _planned_total(trip.id, session),
        actual_total=await _actual_total(trip.id, session),
    )


async def _to_item_response(
    item: TripItineraryItem, session: AsyncSession
) -> TripItineraryItemResponse:
    result = await session.scalars(select(Expense).where(Expense.trip_itinerary_item_id == item.id))
    linked_expenses = list(result.all())
    return TripItineraryItemResponse(
        id=item.id,
        trip_id=item.trip_id,
        family_id=item.family_id,
        created_by_user_id=item.created_by_user_id,
        title=item.title,
        description=item.description,
        link_url=item.link_url,
        item_date=item.item_date,
        item_time=item.item_time,
        planned_amount=item.planned_amount,
        linked_expense_ids=[expense.id for expense in linked_expenses],
        actual_amount=sum(expense.amount for expense in linked_expenses),
    )


@router.get("/")
async def list_trips(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TripResponse]:
    result = await session.scalars(
        select(Trip).where(Trip.family_id == family_id).order_by(Trip.start_date.desc())
    )
    today = date.today()
    return [await _to_trip_response(trip, session, today) for trip in result.all()]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_trip(
    family_id: uuid.UUID,
    payload: CreateTripRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripResponse:
    async with locked_write(session, tables=("trips", "notifications")):
        trip = Trip(
            family_id=family_id,
            created_by_user_id=user.id,
            name=payload.name,
            destination=payload.destination,
            start_date=payload.start_date,
            end_date=payload.end_date,
            budget_amount=payload.budget_amount,
            is_cancelled=False,
        )
        session.add(trip)
        await session.flush()

        await queue_family_notification(
            session,
            family_id,
            message=f'{user.display_name} created trip "{trip.name}".',
            actor_user_id=user.id,
        )

    return await _to_trip_response(trip, session, date.today())


@router.get("/{trip_id}")
async def get_trip(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripDetailResponse:
    trip = await _get_trip_or_404(family_id, trip_id, session)
    trip_response = await _to_trip_response(trip, session, date.today())
    items_result = await session.scalars(
        select(TripItineraryItem)
        .where(TripItineraryItem.trip_id == trip_id)
        .order_by(TripItineraryItem.item_date, TripItineraryItem.item_time)
    )
    items = [await _to_item_response(item, session) for item in items_result.all()]
    return TripDetailResponse(**trip_response.model_dump(), items=items)


@router.patch("/{trip_id}")
async def update_trip(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    payload: UpdateTripRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripResponse:
    async with locked_write(session, tables=("trips", "notifications")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        require_owner_admin_or_creator(membership, trip.created_by_user_id)

        new_start = payload.start_date if payload.start_date is not None else trip.start_date
        new_end = payload.end_date if payload.end_date is not None else trip.end_date
        if new_end < new_start:
            raise_api_error(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="TRIP_INVALID_DATE_RANGE",
                message="end_date must be on or after start_date",
            )

        if payload.name is not None:
            trip.name = payload.name
        if "destination" in payload.model_fields_set:
            trip.destination = payload.destination
        trip.start_date = new_start
        trip.end_date = new_end
        if "budget_amount" in payload.model_fields_set:
            trip.budget_amount = payload.budget_amount
        if payload.is_cancelled is not None:
            trip.is_cancelled = payload.is_cancelled

        await queue_family_notification(
            session,
            family_id,
            message=f'{user.display_name} updated trip "{trip.name}".',
            actor_user_id=user.id,
        )

    return await _to_trip_response(trip, session, date.today())


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    async with locked_write(session, tables=("trips", "trip_itinerary_items", "notifications")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        require_owner_admin_or_creator(membership, trip.created_by_user_id)
        await queue_family_notification(
            session,
            family_id,
            message=f'{user.display_name} deleted trip "{trip.name}".',
            actor_user_id=user.id,
        )
        await session.delete(trip)


@router.post("/{trip_id}/participants/{user_id}", status_code=status.HTTP_201_CREATED)
async def add_trip_participant(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    user_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripResponse:
    async with locked_write(session, tables=("trips", "trip_participants")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        require_owner_admin_or_creator(membership, trip.created_by_user_id)

        target_membership = await session.scalar(
            select(FamilyMember).where(
                FamilyMember.family_id == family_id, FamilyMember.user_id == user_id
            )
        )
        if target_membership is None:
            raise_api_error(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="TRIP_PARTICIPANT_NOT_IN_FAMILY",
                message="user_id is not a member of this family",
            )

        existing = await session.scalar(
            select(TripParticipant).where(
                TripParticipant.trip_id == trip_id, TripParticipant.user_id == user_id
            )
        )
        if existing is None:
            session.add(TripParticipant(trip_id=trip_id, user_id=user_id))

    return await _to_trip_response(trip, session, date.today())


@router.delete("/{trip_id}/participants/{user_id}")
async def remove_trip_participant(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    user_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripResponse:
    async with locked_write(session, tables=("trips", "trip_participants")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        require_owner_admin_or_creator(membership, trip.created_by_user_id)

        participant = await session.scalar(
            select(TripParticipant).where(
                TripParticipant.trip_id == trip_id, TripParticipant.user_id == user_id
            )
        )
        if participant is not None:
            await session.delete(participant)

    return await _to_trip_response(trip, session, date.today())
```

- [ ] **Step 2: Register the router**

In `backend/app/api/v1/router.py`, add `trips` to the import block (alphabetically, after `subscriptions`):

```python
from app.api.v1 import (
    accounts,
    analytics,
    auth,
    categories,
    data_ops,
    expenses,
    families,
    goals,
    ledger_transactions,
    notifications,
    ping,
    receipts,
    split_expense_groups,
    split_expenses,
    subscriptions,
    trips,
)
```

And add the registration (after the `subscriptions` block, before `split_expense_groups`):

```python
api_router.include_router(
    trips.router,
    prefix="/families/{family_id}/trips",
    tags=["trips"],
)
```

- [ ] **Step 3: Write integration tests**

Create `backend/tests/test_trips_api.py`:

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


@pytest.mark.integration
async def test_create_trip_and_compute_status(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Đà Lạt Trip",
            "destination": "Đà Lạt",
            "start_date": date(2020, 1, 1).isoformat(),
            "end_date": date(2020, 1, 5).isoformat(),
            "budget_amount": 5000000,
        },
    )
    assert create_response.status_code == 201
    trip = create_response.json()
    assert trip["status"] == "completed"
    assert trip["planned_total"] == 0
    assert trip["actual_total"] == 0
    assert trip["participant_user_ids"] == []

    list_response = await client.get(f"/api/v1/families/{family_id}/trips/")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 1


@pytest.mark.integration
async def test_create_trip_rejects_invalid_date_range(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Bad Trip",
            "start_date": date(2026, 3, 12).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_update_trip_requires_creator_or_owner_admin(client: AsyncClient) -> None:
    await _register(client, _unique_email(), "Alice")
    family_id = await _create_family(client)

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Original",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 3).isoformat(),
        },
    )
    trip_id = create_response.json()["id"]

    # A second user who is NOT a family member gets 404/membership-denied, not 403 —
    # covered implicitly by get_family_membership; here we instead invite a real member
    # with the 'member' role and confirm THEY cannot edit someone else's trip.
    bob_client = AsyncClient(transport=ASGITransport(app=app), base_url="http://test")
    await _register(bob_client, _unique_email(), "Bob")
    bob_me = await bob_client.get("/api/v1/auth/me")
    bob_user_id = bob_me.json()["id"]

    invite_response = await client.post(
        f"/api/v1/families/{family_id}/members", json={"email": bob_me.json()["email"]}
    )
    assert invite_response.status_code == 201

    update_response = await bob_client.patch(
        f"/api/v1/families/{family_id}/trips/{trip_id}",
        json={"name": "Hijacked"},
    )
    assert update_response.status_code == 403
    await bob_client.aclose()


@pytest.mark.integration
async def test_delete_trip_unlinks_but_does_not_delete_expenses(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]

    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 1000,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_id,
        },
    )
    assert expense_response.status_code == 201
    expense_id = expense_response.json()["id"]

    delete_response = await client.delete(f"/api/v1/families/{family_id}/trips/{trip_id}")
    assert delete_response.status_code == 204

    get_expense_response = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert get_expense_response.status_code == 200
    assert get_expense_response.json()["trip_id"] is None


@pytest.mark.integration
async def test_add_and_remove_trip_participant(client: AsyncClient) -> None:
    await _register(client, _unique_email(), "Alice")
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]
    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]

    add_response = await client.post(f"/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}")
    assert add_response.status_code == 201
    assert user_id in add_response.json()["participant_user_ids"]

    remove_response = await client.delete(
        f"/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}"
    )
    assert remove_response.status_code == 200
    assert user_id not in remove_response.json()["participant_user_ids"]
```

Note: `test_update_trip_requires_creator_or_owner_admin` assumes an `/api/v1/auth/me` endpoint and a `POST /api/v1/families/{family_id}/members` invite-by-email endpoint exist — both are used elsewhere in this codebase (e.g. `AddMemberForm.tsx`'s call in the frontend). If either endpoint's exact path differs from what's written here, check `backend/app/api/v1/auth.py` and `backend/app/api/v1/families.py` for the actual routes and adjust the test's URLs to match — do not invent new endpoints for this.

- [ ] **Step 4: Run the tests**

Run: `cd backend && uv run pytest tests/test_trips_api.py -v -m integration`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full backend suite to confirm nothing else broke**

Run: `cd backend && uv run pytest -m integration`
Expected: all tests PASS (the new trips tests plus every pre-existing test, all green).

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/v1/trips.py backend/app/api/v1/router.py backend/tests/test_trips_api.py
git commit -m "feat(backend): add trips CRUD and participants endpoints"
```

---

### Task 5: Itinerary items endpoints

**Files:**
- Modify: `backend/app/api/v1/trips.py`
- Modify: `backend/tests/test_trips_api.py`

**Interfaces:**
- Consumes: `_get_trip_or_404`, `_to_item_response` (Task 4, same file), `TripItineraryItemRequest`/`UpdateTripItineraryItemRequest`/`TripItineraryItemResponse` (Task 3).
- Produces: 4 new endpoints on the same `router` — nothing new for later tasks to consume beyond what Task 3/4 already exposed.

- [ ] **Step 1: Add the itinerary-item imports**

At the top of `backend/app/api/v1/trips.py`, add to the existing `from app.schemas.trips import (...)` block:

```python
from app.schemas.trips import (
    CreateTripRequest,
    TripDetailResponse,
    TripItineraryItemRequest,
    TripItineraryItemResponse,
    TripResponse,
    UpdateTripItineraryItemRequest,
    UpdateTripRequest,
)
```

(This replaces the import block Task 4 wrote — same file, adding the two item-schema names.)

- [ ] **Step 2: Add the itinerary-item endpoints**

Append to the end of `backend/app/api/v1/trips.py`:

```python
async def _get_item_or_404(
    trip_id: uuid.UUID, item_id: uuid.UUID, session: AsyncSession
) -> TripItineraryItem:
    item = await session.scalar(
        select(TripItineraryItem).where(
            TripItineraryItem.id == item_id, TripItineraryItem.trip_id == trip_id
        )
    )
    if item is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="TRIP_ITEM_NOT_FOUND",
            message="Itinerary item not found",
        )
    return item


def _validate_item_date_in_range(trip: Trip, item_date: date) -> None:
    if item_date < trip.start_date or item_date > trip.end_date:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="TRIP_ITEM_DATE_OUT_OF_RANGE",
            message="item_date must fall within the trip's date range",
        )


@router.get("/{trip_id}/items")
async def list_trip_items(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[TripItineraryItemResponse]:
    await _get_trip_or_404(family_id, trip_id, session)
    result = await session.scalars(
        select(TripItineraryItem)
        .where(TripItineraryItem.trip_id == trip_id)
        .order_by(TripItineraryItem.item_date, TripItineraryItem.item_time)
    )
    return [await _to_item_response(item, session) for item in result.all()]


@router.post("/{trip_id}/items", status_code=status.HTTP_201_CREATED)
async def create_trip_item(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    payload: TripItineraryItemRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripItineraryItemResponse:
    async with locked_write(session, tables=("trips", "trip_itinerary_items")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        _validate_item_date_in_range(trip, payload.item_date)

        item = TripItineraryItem(
            trip_id=trip_id,
            family_id=family_id,
            created_by_user_id=user.id,
            title=payload.title,
            description=payload.description,
            link_url=payload.link_url,
            item_date=payload.item_date,
            item_time=payload.item_time,
            planned_amount=payload.planned_amount,
        )
        session.add(item)
        await session.flush()

    return await _to_item_response(item, session)


@router.patch("/{trip_id}/items/{item_id}")
async def update_trip_item(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: UpdateTripItineraryItemRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> TripItineraryItemResponse:
    async with locked_write(session, tables=("trips", "trip_itinerary_items")):
        trip = await _get_trip_or_404(family_id, trip_id, session)
        item = await _get_item_or_404(trip_id, item_id, session)

        new_item_date = payload.item_date if payload.item_date is not None else item.item_date
        _validate_item_date_in_range(trip, new_item_date)

        if payload.title is not None:
            item.title = payload.title
        if "description" in payload.model_fields_set:
            item.description = payload.description
        if "link_url" in payload.model_fields_set:
            item.link_url = payload.link_url
        item.item_date = new_item_date
        if "item_time" in payload.model_fields_set:
            item.item_time = payload.item_time
        if "planned_amount" in payload.model_fields_set:
            item.planned_amount = payload.planned_amount

    return await _to_item_response(item, session)


@router.delete("/{trip_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip_item(
    family_id: uuid.UUID,
    trip_id: uuid.UUID,
    item_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    async with locked_write(session, tables=("trip_itinerary_items", "expenses")):
        await _get_trip_or_404(family_id, trip_id, session)
        item = await _get_item_or_404(trip_id, item_id, session)
        await session.delete(item)
```

Note: unlike trip-level edit/delete, these 4 endpoints deliberately do NOT call `require_owner_admin_or_creator` — spec §6 says every family member may add/edit/delete itinerary items, only trip-level fields and participant management are creator/owner/admin-gated.

- [ ] **Step 3: Add tests for itinerary items**

Append to `backend/tests/test_trips_api.py`:

```python
@pytest.mark.integration
async def test_create_and_update_itinerary_item(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 3, 1).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    create_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={
            "title": "Nhận phòng khách sạn",
            "item_date": date(2026, 3, 2).isoformat(),
            "item_time": "14:00:00",
            "planned_amount": 2500000,
        },
    )
    assert create_response.status_code == 201
    item = create_response.json()
    assert item["actual_amount"] == 0
    assert item["linked_expense_ids"] == []

    update_response = await client.patch(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items/{item['id']}",
        json={"planned_amount": 3000000},
    )
    assert update_response.status_code == 200
    assert update_response.json()["planned_amount"] == 3000000

    trip_after = await client.get(f"/api/v1/families/{family_id}/trips/{trip_id}")
    assert trip_after.json()["planned_total"] == 3000000


@pytest.mark.integration
async def test_create_itinerary_item_rejects_date_outside_trip_range(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 3, 1).isoformat(),
            "end_date": date(2026, 3, 10).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Too early", "item_date": date(2026, 2, 28).isoformat()},
    )
    assert response.status_code == 422


@pytest.mark.integration
async def test_delete_itinerary_item_unlinks_but_does_not_delete_expense(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]

    item_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Item", "item_date": date(2026, 1, 2).isoformat()},
    )
    item_id = item_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    expense_response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_id,
            "trip_itinerary_item_id": item_id,
        },
    )
    assert expense_response.status_code == 201
    expense_id = expense_response.json()["id"]

    delete_response = await client.delete(f"/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}")
    assert delete_response.status_code == 204

    expense_after = await client.get(f"/api/v1/families/{family_id}/expenses/{expense_id}")
    assert expense_after.json()["trip_itinerary_item_id"] is None
    assert expense_after.json()["trip_id"] == trip_id
```

- [ ] **Step 4: Run the tests**

Run: `cd backend && uv run pytest tests/test_trips_api.py -v -m integration`
Expected: all 8 tests PASS (5 from Task 4 + 3 new).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/v1/trips.py backend/tests/test_trips_api.py
git commit -m "feat(backend): add trip itinerary item endpoints"
```

---
### Task 6: Link expenses to a trip and itinerary item

**Files:**
- Modify: `backend/app/schemas/expense.py`
- Modify: `backend/app/api/v1/expenses.py`
- Modify: `backend/tests/test_trips_api.py`

**Interfaces:**
- Consumes: `Trip`/`TripItineraryItem` (Task 2).
- Produces: `CreateExpenseRequest.trip_id`/`trip_itinerary_item_id` and `UpdateExpenseRequest.trip_id`/`trip_itinerary_item_id` (both `uuid.UUID | None`), and the matching fields on `ExpenseResponse` — Task 7's OpenAPI export/codegen and Task 11's `ExpenseForm` both depend on these exact field names existing on the generated `CreateExpenseRequest`/`UpdateExpenseRequest`/`ExpenseResponse` schemas.

- [ ] **Step 1: Add the two fields to the expense schemas**

In `backend/app/schemas/expense.py`, replace `CreateExpenseRequest`, `UpdateExpenseRequest`, and `ExpenseResponse`:

```python
class CreateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0, le=2_147_483_647)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date
    trip_id: uuid.UUID | None = None
    trip_itinerary_item_id: uuid.UUID | None = None


class UpdateExpenseRequest(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0, le=2_147_483_647)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date
    trip_id: uuid.UUID | None = None
    trip_itinerary_item_id: uuid.UUID | None = None


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
    trip_id: uuid.UUID | None
    trip_itinerary_item_id: uuid.UUID | None
```

- [ ] **Step 2: Add the trip-link validator to the expenses router**

In `backend/app/api/v1/expenses.py`, add to the imports:

```python
from app.models.trip import Trip, TripItineraryItem
```

Add this helper function right after the existing `_validate_category` function:

```python
async def _validate_trip_link(
    family_id: uuid.UUID,
    trip_id: uuid.UUID | None,
    trip_itinerary_item_id: uuid.UUID | None,
    session: AsyncSession,
) -> None:
    if trip_itinerary_item_id is not None and trip_id is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="EXPENSE_TRIP_ITEM_REQUIRES_TRIP",
            message="trip_itinerary_item_id requires trip_id to also be set",
        )
    if trip_id is None:
        return

    trip = await session.scalar(select(Trip).where(Trip.id == trip_id, Trip.family_id == family_id))
    if trip is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="EXPENSE_TRIP_INVALID_FOR_FAMILY",
            message="trip_id is not a valid trip for this family",
        )

    if trip_itinerary_item_id is None:
        return

    item = await session.scalar(
        select(TripItineraryItem).where(
            TripItineraryItem.id == trip_itinerary_item_id,
            TripItineraryItem.trip_id == trip_id,
        )
    )
    if item is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="EXPENSE_TRIP_ITEM_INVALID_FOR_TRIP",
            message="trip_itinerary_item_id does not belong to trip_id",
        )
```

- [ ] **Step 3: Wire the validator and fields into `create_expense`**

In `backend/app/api/v1/expenses.py`'s `create_expense`, add the validation call right after the existing `await _validate_category(...)` line:

```python
        await _validate_trip_link(family_id, payload.trip_id, payload.trip_itinerary_item_id, session)
```

And add the two fields to the `Expense(...)` constructor call, right after `expense_date=payload.expense_date,`:

```python
            trip_id=payload.trip_id,
            trip_itinerary_item_id=payload.trip_itinerary_item_id,
```

- [ ] **Step 4: Wire the validator and fields into `update_expense`**

In the same file's `update_expense`, add the validation call right after `await _validate_category(...)`:

```python
        await _validate_trip_link(family_id, payload.trip_id, payload.trip_itinerary_item_id, session)
```

And add the two assignments right after `expense.expense_date = payload.expense_date`:

```python
        expense.trip_id = payload.trip_id
        expense.trip_itinerary_item_id = payload.trip_itinerary_item_id
```

- [ ] **Step 5: Add tests for the linking validation**

Append to `backend/tests/test_trips_api.py`:

```python
@pytest.mark.integration
async def test_create_expense_rejects_item_without_trip(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_response = await client.post(
        f"/api/v1/families/{family_id}/trips/",
        json={
            "name": "Trip",
            "start_date": date(2026, 1, 1).isoformat(),
            "end_date": date(2026, 1, 5).isoformat(),
        },
    )
    trip_id = trip_response.json()["id"]
    item_response = await client.post(
        f"/api/v1/families/{family_id}/trips/{trip_id}/items",
        json={"title": "Item", "item_date": date(2026, 1, 2).isoformat()},
    )
    item_id = item_response.json()["id"]

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_itinerary_item_id": item_id,
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EXPENSE_TRIP_ITEM_REQUIRES_TRIP"


@pytest.mark.integration
async def test_create_expense_rejects_item_from_different_trip(client: AsyncClient) -> None:
    await _register(client, _unique_email())
    family_id = await _create_family(client)

    trip_a = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/",
            json={
                "name": "Trip A",
                "start_date": date(2026, 1, 1).isoformat(),
                "end_date": date(2026, 1, 5).isoformat(),
            },
        )
    ).json()
    trip_b = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/",
            json={
                "name": "Trip B",
                "start_date": date(2026, 2, 1).isoformat(),
                "end_date": date(2026, 2, 5).isoformat(),
            },
        )
    ).json()
    item_b = (
        await client.post(
            f"/api/v1/families/{family_id}/trips/{trip_b['id']}/items",
            json={"title": "Item in B", "item_date": date(2026, 2, 2).isoformat()},
        )
    ).json()

    me_response = await client.get("/api/v1/auth/me")
    user_id = me_response.json()["id"]
    category_response = await client.get(f"/api/v1/families/{family_id}/categories/")
    category_id = category_response.json()[0]["id"]

    response = await client.post(
        f"/api/v1/families/{family_id}/expenses/",
        json={
            "payer_user_id": user_id,
            "category_id": category_id,
            "amount": 500,
            "is_shared": False,
            "expense_date": date(2026, 1, 2).isoformat(),
            "trip_id": trip_a["id"],
            "trip_itinerary_item_id": item_b["id"],
        },
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "EXPENSE_TRIP_ITEM_INVALID_FOR_TRIP"
```

- [ ] **Step 6: Run the tests**

Run: `cd backend && uv run pytest tests/test_trips_api.py -v -m integration`
Expected: all 10 tests PASS (8 from Tasks 4-5 + 2 new).

Run: `cd backend && uv run pytest -m integration`
Expected: all tests PASS, including the pre-existing `tests/test_expenses_api.py` (if it exists) unaffected by the two new optional fields.

- [ ] **Step 7: Commit**

```bash
git add backend/app/schemas/expense.py backend/app/api/v1/expenses.py backend/tests/test_trips_api.py
git commit -m "feat(backend): allow linking expenses to a trip and itinerary item"
```

---

### Task 7: Export OpenAPI schema and regenerate frontend types

**Files:**
- Modify: `openapi/openapi.json` (regenerated, not hand-edited)
- Modify: `frontend/src/api/schema.gen.ts` (regenerated, not hand-edited)

**Interfaces:**
- Consumes: every backend schema change from Tasks 3 and 6.
- Produces: `components["schemas"]["TripResponse"]`, `["TripDetailResponse"]`, `["TripItineraryItemResponse"]`, `["CreateTripRequest"]`, `["UpdateTripRequest"]`, `["TripItineraryItemRequest"]`, `["UpdateTripItineraryItemRequest"]`, and updated `["CreateExpenseRequest"]`/`["UpdateExpenseRequest"]`/`["ExpenseResponse"]` (now carrying `trip_id`/`trip_itinerary_item_id`) — Task 8's `tripApi.ts` and Task 11's `ExpenseForm.tsx` both import types from this generated file by these exact names.

This is a pure codegen task — there is no code to write by hand, only commands to run and verify.

- [ ] **Step 1: Export the OpenAPI schema from the backend**

Run: `cd backend && uv run python scripts/export_openapi.py`
Expected: `openapi/openapi.json` is rewritten (check `git diff --stat openapi/openapi.json` shows changes).

- [ ] **Step 2: Regenerate the frontend TypeScript types**

Run: `cd frontend && pnpm generate:api-types`
Expected: `src/api/schema.gen.ts` is rewritten.

- [ ] **Step 3: Verify the new types are present and the frontend still compiles**

Run: `cd frontend && grep -c "TripResponse\|TripDetailResponse\|CreateTripRequest" src/api/schema.gen.ts`
Expected: a positive count (the new schema names appear in the generated file).

Run: `cd frontend && pnpm typecheck`
Expected: PASS — no existing frontend code references the new types yet, so this only confirms the regeneration itself didn't break anything structurally.

- [ ] **Step 4: Commit**

```bash
git add openapi/openapi.json frontend/src/api/schema.gen.ts
git commit -m "chore: regenerate OpenAPI schema and frontend types for trips"
```

---

### Task 8: Frontend trip API client and TanStack Query hooks

**Files:**
- Create: `frontend/src/trips/tripApi.ts`
- Create: `frontend/src/trips/queries/tripKeys.ts`
- Create: `frontend/src/trips/queries/tripQueries.ts`
- Test: `frontend/src/trips/tripQueries.test.ts`

**Interfaces:**
- Consumes: `components["schemas"]["TripResponse"]` etc. (Task 7), `apiClient`/`buildApiError` (`frontend/src/api/client.ts`/`frontend/src/api/errors.ts`, pre-existing).
- Produces: `useTrips`, `useTripDetail`, `useCreateTrip`, `useUpdateTrip`, `useDeleteTrip`, `useAddTripParticipant`, `useRemoveTripParticipant`, `useCreateTripItem`, `useUpdateTripItem`, `useDeleteTripItem` — Tasks 9-11 import these exact hook names from `../trips/tripQueries` (or `./tripQueries` from within `trips/`). Also produces `Trip`, `TripDetail`, `TripItineraryItem`, `CreateTripInput`, `UpdateTripInput`, `CreateTripItemInput`, `UpdateTripItemInput` types from `./tripApi`.

- [ ] **Step 1: Write the API client**

Create `frontend/src/trips/tripApi.ts`:

```ts
import { apiClient } from "../api/client";
import { buildApiError } from "../api/errors";
import type { components } from "../api/schema.gen";

export type Trip = components["schemas"]["TripResponse"];
export type TripDetail = components["schemas"]["TripDetailResponse"];
export type TripItineraryItem = components["schemas"]["TripItineraryItemResponse"];
export type CreateTripInput = components["schemas"]["CreateTripRequest"];
export type UpdateTripInput = components["schemas"]["UpdateTripRequest"];
export type CreateTripItemInput = components["schemas"]["TripItineraryItemRequest"];
export type UpdateTripItemInput = components["schemas"]["UpdateTripItineraryItemRequest"];

export async function listTrips(familyId: string): Promise<Trip[]> {
  const { data, error, response } = await apiClient.GET("/api/v1/families/{family_id}/trips/", {
    params: { path: { family_id: familyId } },
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "list_trips_failed",
      fallbackMessage: "Failed to list trips",
    });
  }
  return data;
}

export async function getTrip(familyId: string, tripId: string): Promise<TripDetail> {
  const { data, error, response } = await apiClient.GET(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "get_trip_failed",
      fallbackMessage: "Failed to load trip",
    });
  }
  return data;
}

export async function createTrip(familyId: string, input: CreateTripInput): Promise<Trip> {
  const { data, error, response } = await apiClient.POST("/api/v1/families/{family_id}/trips/", {
    params: { path: { family_id: familyId } },
    body: input,
  });
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_trip_failed",
      fallbackMessage: "Failed to create trip",
    });
  }
  return data;
}

export async function updateTrip(
  familyId: string,
  tripId: string,
  input: UpdateTripInput,
): Promise<Trip> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_trip_failed",
      fallbackMessage: "Failed to update trip",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function deleteTrip(familyId: string, tripId: string): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}",
    { params: { path: { family_id: familyId, trip_id: tripId } } },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_trip_failed",
      fallbackMessage: "Failed to delete trip",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
}

export async function addTripParticipant(
  familyId: string,
  tripId: string,
  userId: string,
): Promise<Trip> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, user_id: userId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "add_trip_participant_failed",
      fallbackMessage: "Failed to add participant",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function removeTripParticipant(
  familyId: string,
  tripId: string,
  userId: string,
): Promise<Trip> {
  const { data, error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}/participants/{user_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, user_id: userId } } },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "remove_trip_participant_failed",
      fallbackMessage: "Failed to remove participant",
      codeMap: { PERMISSION_DENIED: "not_permitted" },
    });
  }
  return data;
}

export async function createTripItem(
  familyId: string,
  tripId: string,
  input: CreateTripItemInput,
): Promise<TripItineraryItem> {
  const { data, error, response } = await apiClient.POST(
    "/api/v1/families/{family_id}/trips/{trip_id}/items",
    { params: { path: { family_id: familyId, trip_id: tripId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "create_trip_item_failed",
      fallbackMessage: "Failed to create itinerary item",
    });
  }
  return data;
}

export async function updateTripItem(
  familyId: string,
  tripId: string,
  itemId: string,
  input: UpdateTripItemInput,
): Promise<TripItineraryItem> {
  const { data, error, response } = await apiClient.PATCH(
    "/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, item_id: itemId } }, body: input },
  );
  if (error || !data) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "update_trip_item_failed",
      fallbackMessage: "Failed to update itinerary item",
    });
  }
  return data;
}

export async function deleteTripItem(
  familyId: string,
  tripId: string,
  itemId: string,
): Promise<void> {
  const { error, response } = await apiClient.DELETE(
    "/api/v1/families/{family_id}/trips/{trip_id}/items/{item_id}",
    { params: { path: { family_id: familyId, trip_id: tripId, item_id: itemId } } },
  );
  if (error) {
    throw buildApiError({
      status: response.status,
      payload: error,
      fallbackCode: "delete_trip_item_failed",
      fallbackMessage: "Failed to delete itinerary item",
    });
  }
}
```

- [ ] **Step 2: Write the query-key factory**

Create `frontend/src/trips/queries/tripKeys.ts`:

```ts
export const tripKeys = {
  list: (familyId: string) => ["trips", familyId] as const,
  detail: (familyId: string, tripId: string) => ["trips", familyId, tripId] as const,
};
```

- [ ] **Step 3: Write the TanStack Query hooks**

Create `frontend/src/trips/queries/tripQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addTripParticipant,
  createTrip,
  createTripItem,
  deleteTrip,
  deleteTripItem,
  getTrip,
  listTrips,
  removeTripParticipant,
  updateTrip,
  updateTripItem,
  type CreateTripInput,
  type CreateTripItemInput,
  type UpdateTripInput,
  type UpdateTripItemInput,
} from "../tripApi";
import { tripKeys } from "./tripKeys";

export function useTrips(familyId: string) {
  return useQuery({
    queryKey: tripKeys.list(familyId),
    queryFn: () => listTrips(familyId),
    enabled: Boolean(familyId),
  });
}

export function useTripDetail(familyId: string, tripId: string) {
  return useQuery({
    queryKey: tripKeys.detail(familyId, tripId),
    queryFn: () => getTrip(familyId, tripId),
    enabled: Boolean(familyId) && Boolean(tripId),
  });
}

export function useCreateTrip(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripInput) => createTrip(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useUpdateTrip(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTripInput) => updateTrip(familyId, tripId, input),
    onSuccess: () => {
      // tripKeys.detail(familyId, tripId) is a key-prefix descendant of tripKeys.list(familyId),
      // so this single invalidateQueries call (default exact: false) already matches and
      // refetches both the trip list and this trip's detail query.
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useDeleteTrip(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (tripId: string) => deleteTrip(familyId, tripId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useAddTripParticipant(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => addTripParticipant(familyId, tripId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useRemoveTripParticipant(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeTripParticipant(familyId, tripId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useCreateTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTripItemInput) => createTripItem(familyId, tripId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useUpdateTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: UpdateTripItemInput }) =>
      updateTripItem(familyId, tripId, itemId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}

export function useDeleteTripItem(familyId: string, tripId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (itemId: string) => deleteTripItem(familyId, tripId, itemId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: tripKeys.list(familyId) });
    },
  });
}
```

- [ ] **Step 4: Write a smoke test for the query-key factory**

Create `frontend/src/trips/tripQueries.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { tripKeys } from "./queries/tripKeys";

describe("tripKeys", () => {
  it("builds a list key scoped to the family", () => {
    expect(tripKeys.list("fam-1")).toEqual(["trips", "fam-1"]);
  });

  it("builds a detail key that is a prefix-descendant of the list key", () => {
    const listKey = tripKeys.list("fam-1");
    const detailKey = tripKeys.detail("fam-1", "trip-1");
    expect(detailKey.slice(0, listKey.length)).toEqual(listKey);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `cd frontend && pnpm vitest run src/trips`
Expected: PASS, 2/2 tests.

Run: `cd frontend && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/trips/tripApi.ts frontend/src/trips/queries/tripKeys.ts frontend/src/trips/queries/tripQueries.ts frontend/src/trips/tripQueries.test.ts
git commit -m "feat(frontend): add trip API client and TanStack Query hooks"
```

---
### Task 9: i18n keys, TripsPage, nav entry, and route

**Files:**
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`
- Create: `frontend/src/trips/TripsPage.tsx`
- Modify: `frontend/src/components/ui/Page.tsx`
- Modify: `frontend/src/AppRoutes.tsx`

**Interfaces:**
- Consumes: `useTrips`/`useCreateTrip` (Task 8), `useFamilies` (`frontend/src/families/familyQueries.ts`, pre-existing), `DateRangePicker`/`DateRange` (`frontend/src/finance/DateRangePicker.tsx`, pre-existing — `{ fromDate, toDate, onChange }` props, `onChange` receives `{ fromDate: string, toDate: string }`), `Field`/`Button`/`Card`/`Badge`/`Alert`/`PageFrame`/`PageHeader`/`EmptyState`/`LoadingState` (pre-existing UI primitives), `translateApiError` (`frontend/src/api/errorI18n.ts`, pre-existing).
- Produces: the `TripsPage` component (default route `/trips`), registered in the app's routing and sidebar nav — Task 10's `TripDetailPage` links back here are not required, but Task 10 IS linked FROM here (`/families/${familyId}/trips/${trip.id}`).

- [ ] **Step 1: Add the new i18n keys**

In `frontend/src/i18n/locales/vi/common.json`:
- Add `"save": "Lưu"` to the existing `"common"` object.
- Add `"trips": "Kế hoạch"` to the existing `"nav"` object.
- Add a new top-level `"trip"` object (as a sibling of `"finance"`, `"family"`, etc.):

```json
  "trip": {
    "trips": "Kế hoạch đi chơi",
    "tripsDescription": "Lên kế hoạch cho chuyến đi, đặt ngân sách và gắn các khoản chi thực tế.",
    "createTrip": "Tạo kế hoạch",
    "name": "Tên kế hoạch",
    "nameRequired": "Vui lòng nhập tên kế hoạch",
    "destination": "Địa điểm",
    "dateRange": "Khoảng thời gian",
    "dateRangeInvalid": "Ngày kết thúc phải sau ngày bắt đầu",
    "budget": "Ngân sách",
    "budgetWithCurrency": "Ngân sách ({{currency}})",
    "budgetInvalid": "Ngân sách không hợp lệ",
    "tripList": "Danh sách kế hoạch",
    "noTrips": "Chưa có kế hoạch nào",
    "noFamilies": "Bạn chưa có gia đình nào",
    "actionFailed": "Đã xảy ra lỗi. Vui lòng thử lại",
    "statusValues": {
      "upcoming": "Sắp tới",
      "ongoing": "Đang diễn ra",
      "completed": "Đã xong",
      "cancelled": "Đã hủy"
    },
    "plannedShort": "Dự kiến",
    "actualShort": "Thực chi",
    "plannedTotal": "Tổng dự kiến",
    "actualSpent": "Đã chi",
    "tripDetail": "Chi tiết kế hoạch",
    "notFound": "Không tìm thấy kế hoạch",
    "editTrip": "Sửa kế hoạch",
    "updateSuccess": "Đã cập nhật kế hoạch",
    "deleteSuccess": "Đã xóa kế hoạch",
    "cancel": "Hủy kế hoạch",
    "resume": "Khôi phục",
    "participants": "Người tham gia",
    "itinerary": "Lịch trình",
    "addItem": "Thêm mục",
    "editItem": "Sửa mục",
    "noItems": "Chưa có mục lịch trình nào",
    "itemTitle": "Tiêu đề",
    "itemTitleRequired": "Vui lòng nhập tiêu đề",
    "itemDate": "Ngày",
    "itemDateOutOfRange": "Ngày phải nằm trong khoảng thời gian của kế hoạch",
    "itemNotFound": "Không tìm thấy mục lịch trình",
    "itemTime": "Giờ",
    "itemDescription": "Mô tả",
    "itemLink": "Link",
    "plannedAmountWithCurrency": "Số tiền dự kiến ({{currency}})",
    "plannedAmountInvalid": "Số tiền dự kiến không hợp lệ",
    "itemCreated": "Đã thêm mục lịch trình",
    "itemUpdated": "Đã cập nhật mục lịch trình",
    "itemDeleted": "Đã xóa mục lịch trình",
    "trip": "Kế hoạch",
    "item": "Mục lịch trình",
    "participantNotInFamily": "Người này không thuộc gia đình",
    "invalidTripForExpense": "Kế hoạch không hợp lệ cho gia đình này",
    "invalidItemForExpense": "Mục lịch trình không thuộc kế hoạch đã chọn",
    "itemRequiresTrip": "Vui lòng chọn kế hoạch trước khi chọn mục lịch trình"
  }
```

In `frontend/src/i18n/locales/ja/common.json`, the same structure with:
- `"common"` gains `"save": "保存"`.
- `"nav"` gains `"trips": "プラン"`.
- New top-level `"trip"` object:

```json
  "trip": {
    "trips": "旅行プラン",
    "tripsDescription": "旅行の計画を立て、予算を設定し、実際の支出を紐付けます。",
    "createTrip": "プランを作成",
    "name": "プラン名",
    "nameRequired": "プラン名を入力してください",
    "destination": "行き先",
    "dateRange": "期間",
    "dateRangeInvalid": "終了日は開始日以降にしてください",
    "budget": "予算",
    "budgetWithCurrency": "予算 ({{currency}})",
    "budgetInvalid": "予算の値が無効です",
    "tripList": "プラン一覧",
    "noTrips": "まだプランがありません",
    "noFamilies": "まだ家族がありません",
    "actionFailed": "エラーが発生しました。もう一度お試しください",
    "statusValues": {
      "upcoming": "予定",
      "ongoing": "進行中",
      "completed": "終了",
      "cancelled": "キャンセル済み"
    },
    "plannedShort": "予定",
    "actualShort": "実績",
    "plannedTotal": "予定合計",
    "actualSpent": "実支出",
    "tripDetail": "プラン詳細",
    "notFound": "プランが見つかりません",
    "editTrip": "プランを編集",
    "updateSuccess": "プランを更新しました",
    "deleteSuccess": "プランを削除しました",
    "cancel": "プランをキャンセル",
    "resume": "再開",
    "participants": "参加者",
    "itinerary": "旅程",
    "addItem": "項目を追加",
    "editItem": "項目を編集",
    "noItems": "まだ旅程の項目がありません",
    "itemTitle": "タイトル",
    "itemTitleRequired": "タイトルを入力してください",
    "itemDate": "日付",
    "itemDateOutOfRange": "日付はプランの期間内にしてください",
    "itemNotFound": "旅程の項目が見つかりません",
    "itemTime": "時刻",
    "itemDescription": "メモ",
    "itemLink": "リンク",
    "plannedAmountWithCurrency": "予定金額 ({{currency}})",
    "plannedAmountInvalid": "予定金額が無効です",
    "itemCreated": "旅程の項目を追加しました",
    "itemUpdated": "旅程の項目を更新しました",
    "itemDeleted": "旅程の項目を削除しました",
    "trip": "プラン",
    "item": "旅程の項目",
    "participantNotInFamily": "この人はこの家族のメンバーではありません",
    "invalidTripForExpense": "この家族に対して無効なプランです",
    "invalidItemForExpense": "旅程の項目が選択したプランに属していません",
    "itemRequiresTrip": "先にプランを選択してください"
  }
```

Verify both files still parse: `node -e "JSON.parse(require('fs').readFileSync('frontend/src/i18n/locales/vi/common.json', 'utf8'))"` (and same for `ja`).

- [ ] **Step 2: Map the new backend error codes**

In `frontend/src/api/errorI18n.ts`, add these entries to `ERROR_TRANSLATION_KEYS`:

```ts
  TRIP_NOT_FOUND: "trip.notFound",
  TRIP_ITEM_NOT_FOUND: "trip.itemNotFound",
  TRIP_INVALID_DATE_RANGE: "trip.dateRangeInvalid",
  TRIP_ITEM_DATE_OUT_OF_RANGE: "trip.itemDateOutOfRange",
  TRIP_PARTICIPANT_NOT_IN_FAMILY: "trip.participantNotInFamily",
  EXPENSE_TRIP_INVALID_FOR_FAMILY: "trip.invalidTripForExpense",
  EXPENSE_TRIP_ITEM_INVALID_FOR_TRIP: "trip.invalidItemForExpense",
  EXPENSE_TRIP_ITEM_REQUIRES_TRIP: "trip.itemRequiresTrip",
```

- [ ] **Step 3: Write the TripsPage component**

Create `frontend/src/trips/TripsPage.tsx`:

```tsx
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useFamilies } from "../families/familyQueries";
import { translateApiError } from "../api/errorI18n";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { DateRangePicker, type DateRange } from "../finance/DateRangePicker";
import { formatMoney } from "../utils/currency";
import { useCreateTrip, useTrips } from "./queries/tripQueries";
import type { Trip } from "./tripApi";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function tripStatusVariant(status: Trip["status"]): "info" | "success" | "neutral" | "danger" {
  if (status === "ongoing") return "success";
  if (status === "cancelled") return "danger";
  if (status === "completed") return "neutral";
  return "info";
}

interface CreateTripFieldErrors {
  name?: string;
  dateRange?: string;
  budget?: string;
}

export function TripsPage() {
  const { t } = useTranslation();
  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];
  const [selectedFamilyId, setSelectedFamilyId] = useState("");

  useEffect(() => {
    if (families.length > 0 && !selectedFamilyId) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  const tripsQuery = useTrips(selectedFamilyId);
  const trips = tripsQuery.data ?? [];
  const selectedFamily = families.find((family) => family.id === selectedFamilyId) ?? null;
  const currencyCode = selectedFamily?.currency_code ?? "jpy";

  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>({ fromDate: todayIso(), toDate: todayIso() });
  const [budgetInput, setBudgetInput] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CreateTripFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const createTripMutation = useCreateTrip(selectedFamilyId);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFamilyId) return;

    const errors: CreateTripFieldErrors = {};
    if (!name.trim()) {
      errors.name = t("trip.nameRequired");
    }
    if (dateRange.toDate < dateRange.fromDate) {
      errors.dateRange = t("trip.dateRangeInvalid");
    }
    const parsedBudget = budgetInput.trim() ? Number(budgetInput) : null;
    if (budgetInput.trim() && (!Number.isFinite(parsedBudget) || (parsedBudget ?? 0) <= 0)) {
      errors.budget = t("trip.budgetInvalid");
    }

    setFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    createTripMutation.mutate(
      {
        name: name.trim(),
        destination: destination.trim() || null,
        start_date: dateRange.fromDate,
        end_date: dateRange.toDate,
        budget_amount: parsedBudget,
      },
      {
        onSuccess: () => {
          setName("");
          setDestination("");
          setDateRange({ fromDate: todayIso(), toDate: todayIso() });
          setBudgetInput("");
          setFieldErrors({});
        },
        onError: (err) => {
          setFormError(translateApiError(t, err, "trip.actionFailed"));
        },
      },
    );
  }

  if (familiesQuery.isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.trips")} description={t("trip.tripsDescription")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader title={t("trip.trips")} description={t("trip.tripsDescription")} />

        {families.length > 1 ? (
          <Field label={t("dashboard.family")} htmlFor="trips-family-select">
            <select
              id="trips-family-select"
              value={selectedFamilyId}
              className="min-h-10"
              onChange={(event) => setSelectedFamilyId(event.target.value)}
            >
              {families.map((family) => (
                <option key={family.id} value={family.id}>
                  {family.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        {families.length === 0 ? (
          <EmptyState
            title={t("trip.noFamilies")}
            action={
              <Link to="/families/new" className="no-underline">
                <Button type="button">{t("family.create")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle>{t("trip.createTrip")}</CardTitle>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCreate} noValidate>
                  <Field label={t("trip.name")} htmlFor="trip-name" required error={fieldErrors.name}>
                    <input
                      id="trip-name"
                      type="text"
                      value={name}
                      onChange={(event) => {
                        setName(event.target.value);
                        setFieldErrors((current) => ({ ...current, name: undefined }));
                      }}
                    />
                  </Field>

                  <Field label={t("trip.destination")} htmlFor="trip-destination">
                    <input
                      id="trip-destination"
                      type="text"
                      value={destination}
                      onChange={(event) => setDestination(event.target.value)}
                    />
                  </Field>

                  <Field
                    label={t("trip.dateRange")}
                    htmlFor="trip-date-range"
                    required
                    error={fieldErrors.dateRange}
                  >
                    <div id="trip-date-range">
                      <DateRangePicker
                        fromDate={dateRange.fromDate}
                        toDate={dateRange.toDate}
                        onChange={(range) => {
                          setDateRange(range);
                          setFieldErrors((current) => ({ ...current, dateRange: undefined }));
                        }}
                      />
                    </div>
                  </Field>

                  <Field
                    label={t("trip.budgetWithCurrency", { currency: currencyCode.toUpperCase() })}
                    htmlFor="trip-budget"
                    error={fieldErrors.budget}
                  >
                    <input
                      id="trip-budget"
                      type="number"
                      min={1}
                      value={budgetInput}
                      onChange={(event) => {
                        setBudgetInput(event.target.value);
                        setFieldErrors((current) => ({ ...current, budget: undefined }));
                      }}
                    />
                  </Field>

                  <Button type="submit" loading={createTripMutation.isPending}>
                    {t("trip.createTrip")}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {formError ? (
              <Alert variant="error" role="alert">
                {formError}
              </Alert>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle>{t("trip.tripList")}</CardTitle>
              </CardHeader>
              <CardContent>
                {tripsQuery.isLoading ? (
                  <LoadingState label={t("common.loading")} />
                ) : trips.length === 0 ? (
                  <EmptyState title={t("trip.noTrips")} />
                ) : (
                  <ul className="space-y-3">
                    {trips.map((trip) => (
                      <li key={trip.id} className="interactive-row space-y-2 p-4">
                        <Link
                          to={`/families/${selectedFamilyId}/trips/${trip.id}`}
                          className="block no-underline"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-medium text-foreground">{trip.name}</p>
                            <Badge variant={tripStatusVariant(trip.status)}>
                              {t(`trip.statusValues.${trip.status}`)}
                            </Badge>
                          </div>
                          {trip.destination ? (
                            <p className="text-sm text-muted-foreground">{trip.destination}</p>
                          ) : null}
                          <p className="text-sm text-muted-foreground">
                            {trip.start_date} → {trip.end_date}
                          </p>
                          <p className="font-mono text-sm text-foreground">
                            {formatMoney(trip.actual_total, currencyCode)}
                            {trip.budget_amount
                              ? ` / ${formatMoney(trip.budget_amount, currencyCode)}`
                              : trip.planned_total
                                ? ` (${t("trip.plannedShort")}: ${formatMoney(trip.planned_total, currencyCode)})`
                                : ""}
                          </p>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </PageFrame>
  );
}
```

- [ ] **Step 4: Add the "Trips" sidebar nav entry**

In `frontend/src/components/ui/Page.tsx`, replace the two pathname-check lines (right after `const isCreateFamilyRoute = ...`):

```tsx
  const isTripDetailRoute = pathname.startsWith("/families/") && pathname.includes("/trips/");
  const isTripsRoute = pathname === "/trips" || isTripDetailRoute;
  const isFamiliesRoute =
    pathname === "/families" ||
    (pathname.startsWith("/families/") && !isCreateFamilyRoute && !isTripDetailRoute);
```

(This replaces the existing single-line `isFamiliesRoute` definition — the trip-detail path `/families/:familyId/trips/:tripId` also starts with `/families/`, so it must be excluded from "Families" active-state and folded into "Trips" active-state instead.)

Then add one new `SidebarLink` in BOTH the mobile nav `<nav>` block and the desktop nav `<nav>` block, right after the existing `nav-families` `SidebarLink` and before `nav-create-family`:

Mobile version:
```tsx
              <SidebarLink
                to="/trips"
                label={t("nav.trips")}
                isActive={isTripsRoute}
                tourId="nav-trips"
                onClick={() => setIsMobileNavOpen(false)}
              />
```

Desktop version:
```tsx
              <SidebarLink to="/trips" label={t("nav.trips")} isActive={isTripsRoute} tourId="nav-trips" />
```

- [ ] **Step 5: Register the routes**

In `frontend/src/AppRoutes.tsx`, add the import:

```tsx
import { TripsPage } from "./trips/TripsPage";
```

And add this route (placed after the `/families/:familyId/receipts` route, before the finance routes):

```tsx
      <Route
        path="/trips"
        element={
          <ProtectedRoute>
            <TripsPage />
          </ProtectedRoute>
        }
      />
```

(The `/families/:familyId/trips/:tripId` route is added in Task 10, once `TripDetailPage` exists.)

- [ ] **Step 6: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both PASS.

Run: `cd frontend && pnpm test`
Expected: green except the one already-accepted pre-existing `HomePage > switches to Vietnamese when selected` timeout.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json frontend/src/api/errorI18n.ts frontend/src/trips/TripsPage.tsx frontend/src/components/ui/Page.tsx frontend/src/AppRoutes.tsx
git commit -m "feat(frontend): add Trips list page, nav entry, and route"
```

---
### Task 10: TripDetailPage — itinerary, trip edit, participants

**Files:**
- Create: `frontend/src/trips/TripDetailPage.tsx`
- Modify: `frontend/src/AppRoutes.tsx`

**Interfaces:**
- Consumes: every hook from Task 8 (`useTripDetail`, `useUpdateTrip`, `useDeleteTrip`, `useAddTripParticipant`, `useRemoveTripParticipant`, `useCreateTripItem`, `useUpdateTripItem`, `useDeleteTripItem`), `TripItineraryItem` type (Task 8's `tripApi.ts`), `useFamilyDetail` (`frontend/src/families/familyQueries.ts`, pre-existing — returns `{ members: FamilyMemberInfo[], currency_code, ... }`), `useAuth` (`frontend/src/auth/useAuth.ts`, pre-existing — returns `{ user }`), `Modal`/`useSnackbar` (pre-existing UI primitives), `DateRangePicker`/`DateRange` (Task 9 already imports these — same component).
- Produces: the `TripDetailPage` component, routed at `/families/:familyId/trips/:tripId`.

- [ ] **Step 1: Write the TripDetailPage component**

Create `frontend/src/trips/TripDetailPage.tsx`:

```tsx
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { DateRangePicker, type DateRange } from "../finance/DateRangePicker";
import { formatMoney } from "../utils/currency";
import {
  useAddTripParticipant,
  useCreateTripItem,
  useDeleteTrip,
  useDeleteTripItem,
  useRemoveTripParticipant,
  useTripDetail,
  useUpdateTrip,
  useUpdateTripItem,
} from "./queries/tripQueries";
import type { TripItineraryItem } from "./tripApi";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

interface ItemFieldErrors {
  title?: string;
  date?: string;
  amount?: string;
}

interface ItemFormState {
  title: string;
  description: string;
  linkUrl: string;
  itemDate: string;
  itemTime: string;
  plannedAmount: string;
}

function emptyItemForm(defaultDate: string): ItemFormState {
  return {
    title: "",
    description: "",
    linkUrl: "",
    itemDate: defaultDate,
    itemTime: "",
    plannedAmount: "",
  };
}

function itemFormFromExisting(item: TripItineraryItem): ItemFormState {
  return {
    title: item.title,
    description: item.description ?? "",
    linkUrl: item.link_url ?? "",
    itemDate: item.item_date,
    itemTime: item.item_time ?? "",
    plannedAmount: item.planned_amount ? String(item.planned_amount) : "",
  };
}

export function TripDetailPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { familyId, tripId } = useParams<{ familyId: string; tripId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const tripQuery = useTripDetail(familyId ?? "", tripId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const trip = tripQuery.data ?? null;
  const members = familyDetailQuery.data?.members ?? [];
  const currencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading = tripQuery.isLoading || familyDetailQuery.isLoading;
  const queryError = tripQuery.isError || familyDetailQuery.isError ? t("trip.actionFailed") : null;
  const error = queryError ?? formError;

  const myRole = familyDetailQuery.data?.members.find((member) => member.user_id === user?.id)?.role;
  const canManageTrip = trip?.created_by_user_id === user?.id || myRole === "owner" || myRole === "admin";

  const updateTripMutation = useUpdateTrip(familyId ?? "", tripId ?? "");
  const deleteTripMutation = useDeleteTrip(familyId ?? "");
  const addParticipantMutation = useAddTripParticipant(familyId ?? "", tripId ?? "");
  const removeParticipantMutation = useRemoveTripParticipant(familyId ?? "", tripId ?? "");
  const createItemMutation = useCreateTripItem(familyId ?? "", tripId ?? "");
  const updateItemMutation = useUpdateTripItem(familyId ?? "", tripId ?? "");
  const deleteItemMutation = useDeleteTripItem(familyId ?? "", tripId ?? "");

  const [isEditingTrip, setIsEditingTrip] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDestination, setEditDestination] = useState("");
  const [editRange, setEditRange] = useState<DateRange>({ fromDate: todayIso(), toDate: todayIso() });
  const [editBudget, setEditBudget] = useState("");
  const [editFieldErrors, setEditFieldErrors] = useState<{
    name?: string;
    dateRange?: string;
    budget?: string;
  }>({});

  function openEditTrip() {
    if (!trip) return;
    setEditName(trip.name);
    setEditDestination(trip.destination ?? "");
    setEditRange({ fromDate: trip.start_date, toDate: trip.end_date });
    setEditBudget(trip.budget_amount ? String(trip.budget_amount) : "");
    setEditFieldErrors({});
    setIsEditingTrip(true);
  }

  function handleUpdateTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors: typeof editFieldErrors = {};
    if (!editName.trim()) {
      errors.name = t("trip.nameRequired");
    }
    if (editRange.toDate < editRange.fromDate) {
      errors.dateRange = t("trip.dateRangeInvalid");
    }
    const parsedBudget = editBudget.trim() ? Number(editBudget) : null;
    if (editBudget.trim() && (!Number.isFinite(parsedBudget) || (parsedBudget ?? 0) <= 0)) {
      errors.budget = t("trip.budgetInvalid");
    }

    setEditFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    updateTripMutation.mutate(
      {
        name: editName.trim(),
        destination: editDestination.trim() || null,
        start_date: editRange.fromDate,
        end_date: editRange.toDate,
        budget_amount: parsedBudget,
      },
      {
        onSuccess: () => {
          setIsEditingTrip(false);
          showSnackbar({ message: t("trip.updateSuccess"), variant: "success" });
        },
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      },
    );
  }

  function handleCancelTrip() {
    if (!trip) return;
    setFormError(null);
    updateTripMutation.mutate(
      { is_cancelled: !trip.is_cancelled },
      {
        onSuccess: () => showSnackbar({ message: t("trip.updateSuccess"), variant: "success" }),
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      },
    );
  }

  function handleDeleteTrip() {
    setFormError(null);
    deleteTripMutation.mutate(tripId ?? "", {
      onSuccess: () => showSnackbar({ message: t("trip.deleteSuccess"), variant: "success" }),
      onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
    });
  }

  function handleToggleParticipant(memberId: string, isCurrentlyParticipant: boolean) {
    setFormError(null);
    if (isCurrentlyParticipant) {
      removeParticipantMutation.mutate(memberId, {
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    } else {
      addParticipantMutation.mutate(memberId, {
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    }
  }

  const [editingItem, setEditingItem] = useState<TripItineraryItem | "new" | null>(null);
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyItemForm(trip?.start_date ?? todayIso()));
  const [itemFieldErrors, setItemFieldErrors] = useState<ItemFieldErrors>({});

  function openNewItem() {
    setItemForm(emptyItemForm(trip?.start_date ?? todayIso()));
    setItemFieldErrors({});
    setEditingItem("new");
  }

  function openEditItem(item: TripItineraryItem) {
    setItemForm(itemFormFromExisting(item));
    setItemFieldErrors({});
    setEditingItem(item);
  }

  function closeItemModal() {
    setEditingItem(null);
    setItemFieldErrors({});
  }

  function handleSaveItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trip) return;

    const errors: ItemFieldErrors = {};
    if (!itemForm.title.trim()) {
      errors.title = t("trip.itemTitleRequired");
    }
    if (itemForm.itemDate < trip.start_date || itemForm.itemDate > trip.end_date) {
      errors.date = t("trip.itemDateOutOfRange");
    }
    const parsedAmount = itemForm.plannedAmount.trim() ? Number(itemForm.plannedAmount) : null;
    if (itemForm.plannedAmount.trim() && (!Number.isFinite(parsedAmount) || (parsedAmount ?? 0) <= 0)) {
      errors.amount = t("trip.plannedAmountInvalid");
    }

    setItemFieldErrors(errors);
    setFormError(null);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      title: itemForm.title.trim(),
      description: itemForm.description.trim() || null,
      link_url: itemForm.linkUrl.trim() || null,
      item_date: itemForm.itemDate,
      item_time: itemForm.itemTime || null,
      planned_amount: parsedAmount,
    };

    if (editingItem === "new") {
      createItemMutation.mutate(payload, {
        onSuccess: () => {
          closeItemModal();
          showSnackbar({ message: t("trip.itemCreated"), variant: "success" });
        },
        onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
      });
    } else if (editingItem) {
      updateItemMutation.mutate(
        { itemId: editingItem.id, input: payload },
        {
          onSuccess: () => {
            closeItemModal();
            showSnackbar({ message: t("trip.itemUpdated"), variant: "success" });
          },
          onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
        },
      );
    }
  }

  function handleDeleteItem(itemId: string) {
    setFormError(null);
    deleteItemMutation.mutate(itemId, {
      onSuccess: () => showSnackbar({ message: t("trip.itemDeleted"), variant: "success" }),
      onError: (err) => setFormError(translateApiError(t, err, "trip.actionFailed")),
    });
  }

  const itemsByDay = useMemo(() => {
    if (!trip) return [];
    const groups = new Map<string, TripItineraryItem[]>();
    for (const item of trip.items) {
      const list = groups.get(item.item_date) ?? [];
      list.push(item);
      groups.set(item.item_date, list);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([itemDate, items]) => ({
        itemDate,
        items: items.slice().sort((a, b) => (a.item_time ?? "").localeCompare(b.item_time ?? "")),
      }));
  }, [trip]);

  if (!familyId || !tripId || isLoading) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.tripDetail")} />
          <LoadingState label={t("common.loading")} />
        </main>
      </PageFrame>
    );
  }

  if (!trip) {
    return (
      <PageFrame>
        <main className="space-y-6">
          <PageHeader title={t("trip.tripDetail")} />
          <EmptyState title={t("trip.notFound")} />
        </main>
      </PageFrame>
    );
  }

  return (
    <PageFrame>
      <main className="space-y-6">
        <PageHeader
          title={trip.name}
          description={trip.destination ?? undefined}
          actions={
            canManageTrip ? (
              <>
                <Button type="button" variant="outline" size="sm" onClick={openEditTrip}>
                  {t("common.edit")}
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={handleCancelTrip}>
                  {trip.is_cancelled ? t("trip.resume") : t("trip.cancel")}
                </Button>
                <Button type="button" variant="destructive" size="sm" onClick={handleDeleteTrip}>
                  {t("family.delete")}
                </Button>
              </>
            ) : undefined
          }
        />

        {error ? (
          <Alert variant="error" role="alert">
            {error}
          </Alert>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>{formatMoney(trip.actual_total, currencyCode)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.actualSpent")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{formatMoney(trip.planned_total, currencyCode)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.plannedTotal")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>
                {trip.budget_amount ? formatMoney(trip.budget_amount, currencyCode) : "-"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">{t("trip.budget")}</p>
            </CardContent>
          </Card>
        </section>

        <Card>
          <CardHeader>
            <CardTitle>{t("trip.participants")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-2">
              {members.map((member) => {
                const isParticipant = trip.participant_user_ids.includes(member.user_id);
                return (
                  <li key={member.user_id}>
                    <button
                      type="button"
                      disabled={!canManageTrip}
                      onClick={() => handleToggleParticipant(member.user_id, isParticipant)}
                      className="disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Badge variant={isParticipant ? "success" : "neutral"}>{member.display_name}</Badge>
                    </button>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("trip.itinerary")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button type="button" size="sm" onClick={openNewItem}>
              {t("trip.addItem")}
            </Button>

            {itemsByDay.length === 0 ? (
              <EmptyState title={t("trip.noItems")} />
            ) : (
              <div className="space-y-4">
                {itemsByDay.map(({ itemDate, items }) => (
                  <div key={itemDate} className="surface-card overflow-hidden">
                    <div className="border-b border-border/80 bg-muted/40 px-4 py-2">
                      <p className="text-sm font-semibold text-foreground">{itemDate}</p>
                    </div>
                    <ul>
                      {items.map((item) => (
                        <li
                          key={item.id}
                          className="flex flex-wrap items-start justify-between gap-2 border-b border-border/60 px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              {item.item_time ? (
                                <span className="text-xs font-semibold text-muted-foreground">
                                  {item.item_time}
                                </span>
                              ) : null}
                              <span className="font-medium text-foreground">{item.title}</span>
                            </div>
                            {item.description ? (
                              <p className="text-sm text-muted-foreground">{item.description}</p>
                            ) : null}
                            {item.link_url ? (
                              <a
                                href={item.link_url}
                                target="_blank"
                                rel="noreferrer"
                                className="text-sm text-primary hover:underline"
                              >
                                {item.link_url}
                              </a>
                            ) : null}
                          </div>
                          <div className="flex flex-shrink-0 flex-col items-end gap-2">
                            {item.planned_amount ? (
                              <span className="font-mono text-sm text-muted-foreground">
                                {t("trip.plannedShort")}: {formatMoney(item.planned_amount, currencyCode)}
                              </span>
                            ) : null}
                            {item.actual_amount > 0 ? (
                              <span className="font-mono text-sm text-foreground">
                                {t("trip.actualShort")}: {formatMoney(item.actual_amount, currencyCode)}
                              </span>
                            ) : null}
                            <div className="flex gap-2">
                              <Button type="button" size="sm" variant="outline" onClick={() => openEditItem(item)}>
                                {t("common.edit")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => handleDeleteItem(item.id)}
                              >
                                {t("family.delete")}
                              </Button>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Modal
          isOpen={isEditingTrip}
          title={t("trip.editTrip")}
          closeLabel={t("common.close")}
          onClose={() => setIsEditingTrip(false)}
        >
          <form className="space-y-4" onSubmit={handleUpdateTrip} noValidate>
            <Field label={t("trip.name")} htmlFor="edit-trip-name" required error={editFieldErrors.name}>
              <input
                id="edit-trip-name"
                type="text"
                value={editName}
                onChange={(event) => {
                  setEditName(event.target.value);
                  setEditFieldErrors((current) => ({ ...current, name: undefined }));
                }}
              />
            </Field>
            <Field label={t("trip.destination")} htmlFor="edit-trip-destination">
              <input
                id="edit-trip-destination"
                type="text"
                value={editDestination}
                onChange={(event) => setEditDestination(event.target.value)}
              />
            </Field>
            <Field
              label={t("trip.dateRange")}
              htmlFor="edit-trip-date-range"
              required
              error={editFieldErrors.dateRange}
            >
              <div id="edit-trip-date-range">
                <DateRangePicker
                  fromDate={editRange.fromDate}
                  toDate={editRange.toDate}
                  onChange={(range) => {
                    setEditRange(range);
                    setEditFieldErrors((current) => ({ ...current, dateRange: undefined }));
                  }}
                />
              </div>
            </Field>
            <Field
              label={t("trip.budgetWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor="edit-trip-budget"
              error={editFieldErrors.budget}
            >
              <input
                id="edit-trip-budget"
                type="number"
                min={1}
                value={editBudget}
                onChange={(event) => {
                  setEditBudget(event.target.value);
                  setEditFieldErrors((current) => ({ ...current, budget: undefined }));
                }}
              />
            </Field>
            <Button type="submit" loading={updateTripMutation.isPending}>
              {t("common.save")}
            </Button>
          </form>
        </Modal>

        <Modal
          isOpen={editingItem !== null}
          title={editingItem === "new" ? t("trip.addItem") : t("trip.editItem")}
          closeLabel={t("common.close")}
          onClose={closeItemModal}
        >
          <form className="space-y-4" onSubmit={handleSaveItem} noValidate>
            <Field label={t("trip.itemTitle")} htmlFor="item-title" required error={itemFieldErrors.title}>
              <input
                id="item-title"
                type="text"
                value={itemForm.title}
                onChange={(event) => {
                  setItemForm((current) => ({ ...current, title: event.target.value }));
                  setItemFieldErrors((current) => ({ ...current, title: undefined }));
                }}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t("trip.itemDate")} htmlFor="item-date" required error={itemFieldErrors.date}>
                <input
                  id="item-date"
                  type="date"
                  min={trip.start_date}
                  max={trip.end_date}
                  value={itemForm.itemDate}
                  onChange={(event) => {
                    setItemForm((current) => ({ ...current, itemDate: event.target.value }));
                    setItemFieldErrors((current) => ({ ...current, date: undefined }));
                  }}
                />
              </Field>
              <Field label={t("trip.itemTime")} htmlFor="item-time">
                <input
                  id="item-time"
                  type="time"
                  value={itemForm.itemTime}
                  onChange={(event) =>
                    setItemForm((current) => ({ ...current, itemTime: event.target.value }))
                  }
                />
              </Field>
            </div>
            <Field label={t("trip.itemDescription")} htmlFor="item-description">
              <input
                id="item-description"
                type="text"
                value={itemForm.description}
                onChange={(event) =>
                  setItemForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
            <Field label={t("trip.itemLink")} htmlFor="item-link">
              <input
                id="item-link"
                type="text"
                value={itemForm.linkUrl}
                onChange={(event) => setItemForm((current) => ({ ...current, linkUrl: event.target.value }))}
                placeholder="https://..."
              />
            </Field>
            <Field
              label={t("trip.plannedAmountWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor="item-amount"
              error={itemFieldErrors.amount}
            >
              <input
                id="item-amount"
                type="number"
                min={1}
                value={itemForm.plannedAmount}
                onChange={(event) => {
                  setItemForm((current) => ({ ...current, plannedAmount: event.target.value }));
                  setItemFieldErrors((current) => ({ ...current, amount: undefined }));
                }}
              />
            </Field>
            <Button
              type="submit"
              loading={editingItem === "new" ? createItemMutation.isPending : updateItemMutation.isPending}
            >
              {t("common.save")}
            </Button>
          </form>
        </Modal>
      </main>
    </PageFrame>
  );
}
```

- [ ] **Step 2: Register the route**

In `frontend/src/AppRoutes.tsx`, add the import:

```tsx
import { TripDetailPage } from "./trips/TripDetailPage";
```

And add this route (placed right after the `/trips` route from Task 9):

```tsx
      <Route
        path="/families/:familyId/trips/:tripId"
        element={
          <ProtectedRoute>
            <TripDetailPage />
          </ProtectedRoute>
        }
      />
```

- [ ] **Step 3: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm lint`
Expected: both PASS.

Run: `cd frontend && pnpm test`
Expected: green except the one already-accepted pre-existing `HomePage` timeout.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/trips/TripDetailPage.tsx frontend/src/AppRoutes.tsx
git commit -m "feat(frontend): add trip detail page with itinerary, editing, and participants"
```

---

### Task 11: Link expenses to a trip from ExpenseForm

**Files:**
- Modify: `frontend/src/expenses/expenseApi.ts`
- Modify: `frontend/src/expenses/ExpenseForm.tsx`

**Interfaces:**
- Consumes: `useTrips`/`useTripDetail` (Task 8), `Trip`/`TripDetail` types (Task 8's `tripApi.ts`), the regenerated `CreateExpenseRequest`/`UpdateExpenseRequest` schemas (Task 7, now carrying `trip_id`/`trip_itinerary_item_id`).
- Produces: nothing new for later tasks — this is the last piece of the linking surface described in spec §5.

- [ ] **Step 1: Add the two fields to the hand-written `ExpenseInput` type**

In `frontend/src/expenses/expenseApi.ts`, replace the `ExpenseInput` interface:

```ts
export interface ExpenseInput {
  payer_user_id: string;
  category_id: string;
  amount: number;
  is_shared: boolean;
  description?: string | null;
  expense_date: string;
  trip_id?: string | null;
  trip_itinerary_item_id?: string | null;
}
```

(`Expense` itself is `components["schemas"]["ExpenseResponse"]`, which already picked up the two new nullable fields automatically from Task 7's codegen — no change needed to that type alias.)

- [ ] **Step 2: Add trip/item state and dropdowns to ExpenseForm**

In `frontend/src/expenses/ExpenseForm.tsx`, add to the imports:

```tsx
import { useTripDetail, useTrips } from "../trips/queries/tripQueries";
```

Add two new pieces of state right after the existing `expenseDate` state (before `const [amountError, ...`):

```tsx
  const [tripId, setTripId] = useState(expense?.trip_id ?? "");
  const [tripItemId, setTripItemId] = useState(expense?.trip_itinerary_item_id ?? "");
  const tripsQuery = useTrips(familyId);
  const trips = tripsQuery.data ?? [];
  const tripDetailQuery = useTripDetail(familyId, tripId);
  const tripItems = tripDetailQuery.data?.items ?? [];
```

Add two id constants right after the existing `descriptionId` line:

```tsx
  const tripFieldId = `expense-trip-${familyId}`;
  const tripItemFieldId = `expense-trip-item-${familyId}`;
```

In the `input` object built inside `handleSubmit` (right after `expense_date: expenseDate,`), add:

```tsx
      trip_id: tripId || null,
      trip_itinerary_item_id: tripId ? tripItemId || null : null,
```

In the JSX, add a new row right after the existing `</section>` that closes the payer/category section (i.e. immediately before the second `<section>` that holds amount/date/description):

```tsx
      <section className="grid gap-4 rounded-lg border border-border/80 bg-muted/25 p-4 md:grid-cols-2">
        <Field label={t("trip.trip")} htmlFor={tripFieldId}>
          <select
            id={tripFieldId}
            value={tripId}
            className="min-h-10"
            onChange={(event) => {
              setTripId(event.target.value);
              setTripItemId("");
            }}
          >
            <option value="">-</option>
            {trips.map((trip) => (
              <option key={trip.id} value={trip.id}>
                {trip.name}
              </option>
            ))}
          </select>
        </Field>

        {tripId ? (
          <Field label={t("trip.item")} htmlFor={tripItemFieldId}>
            <select
              id={tripItemFieldId}
              value={tripItemId}
              className="min-h-10"
              onChange={(event) => setTripItemId(event.target.value)}
            >
              <option value="">-</option>
              {tripItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>
```

- [ ] **Step 3: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/expenses`
Expected: PASS. If `ExpenseForm.test.tsx` renders the form without a `QueryClientProvider` wrapping trip-query-capable context, it already must be wrapped for the pre-existing `useCategories`/`useFamilyDetail` calls to work — the new `useTrips`/`useTripDetail` calls need nothing extra beyond what's already there. If a test asserts on the exact set of fields rendered and needs updating to account for the new trip/item dropdowns, update it — don't delete the assertion, adapt it.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/expenses/expenseApi.ts frontend/src/expenses/ExpenseForm.tsx
git commit -m "feat(frontend): link expenses to a trip and itinerary item from ExpenseForm"
```

---

### Task 12: Final verification pass

**Files:** none expected to change — this task verifies Tasks 1-11 together.

**Interfaces:**
- Consumes: everything from Tasks 1-11.
- Produces: nothing new.

- [ ] **Step 1: Full backend suite**

Run: `cd backend && uv run ruff check . && uv run mypy app && uv run alembic upgrade head && uv run pytest && uv run pytest -m integration`
Expected: all green.

- [ ] **Step 2: Full frontend suite**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all green except the one already-accepted pre-existing `HomePage > switches to Vietnamese when selected` timeout.

- [ ] **Step 3: Manual QA sweep**

With the backend running against a database with Task 1's migration applied, and the frontend dev server up:

- Create a trip with a name, destination, date range, and budget. Confirm it appears in the trip list with the correct status badge (create one with dates entirely in the past to see "completed", one spanning today to see "ongoing").
- Open the trip detail page. Add 2-3 itinerary items across different dates, with and without a time, with and without a planned amount. Confirm they render grouped by day, sorted by time within each day.
- Edit the trip's name/dates/budget via the edit modal — confirm the field-level validation (empty name, invalid date range, non-positive budget) renders under each field, not a top banner.
- Toggle a participant on and off (as the trip's creator) — confirm the badge state updates.
- Create a new expense via the normal expense form, pick the trip you just created, then pick one of its itinerary items — save it, then return to the trip detail page and confirm the item shows the correct "actual" amount and the trip-level "Đã chi"/actual total reflects it.
- Delete the itinerary item that expense was linked to — confirm the expense itself still exists (check the expense list) and its trip link (not item link) is intact.
- Delete the trip — confirm the expense still exists with no trip link at all.
- As a non-creator, non-owner/admin family member, confirm you can still add/edit itinerary items but cannot see the trip-level edit/cancel/delete buttons (or get a 403 if you call the API directly).
- Check both light and dark mode, and resize to ~375px width, on the trips list page and a trip detail page.

- [ ] **Step 4: Fix anything found**

If Step 3 surfaces a real defect, fix it in the specific file, re-run the relevant suite from Step 1/2, and commit the fix with a message describing exactly what was found and fixed.

- [ ] **Step 5: Commit (only if Step 4 found something to fix)**

```bash
git add <files Step 4 touched>
git commit -m "fix: <specific thing found during trip planning final verification>"
```

---

## Self-Review Notes

- **Spec coverage:** §3 (data model) → Tasks 1-2. §4 (API) → Tasks 3-6. §5 (frontend) → Tasks 8-11 (TripsPage/TripDetailPage/ExpenseForm/DateRangePicker reuse all present). §6 (permissions) → Task 4/5 (trip-level gated via `require_owner_admin_or_creator`, item-level open to all members — both explicitly implemented, not just described). §7 (validation) → Tasks 3-6 (backend) and Tasks 9-11 (frontend field-level errors). §8 (testing) → backend tests embedded in Tasks 4-6, frontend smoke test in Task 8, full sweep in Task 12. §2/§9 (out of scope: no split-expense integration, no calendar UI) — verified no task in this plan touches `SplitExpensesPage.tsx` or builds a calendar/grid component; the itinerary is a day-grouped list per the spec's explicit choice.
- **Placeholder scan:** every task's code blocks are complete, runnable code with real field names, real error codes, and real i18n keys — no "TBD"/"add validation"/"similar to Task N" shorthand anywhere.
- **Type consistency:** `TripResponse`/`TripDetailResponse`/`TripItineraryItemResponse` (Task 3) field names match exactly what Task 4/5's router helpers (`_to_trip_response`/`_to_item_response`) construct, which match exactly what Task 8's `tripApi.ts` types (via codegen, Task 7) and Task 9/10/11's component code read (`trip.status`, `trip.participant_user_ids`, `trip.planned_total`, `trip.actual_total`, `item.linked_expense_ids`, `item.actual_amount`, etc.) — traced end-to-end from Pydantic schema through the router, through codegen, to every frontend read site. `useTrips`/`useTripDetail`/`useCreateTrip`/etc. (Task 8) are called with the exact same names and argument order in Tasks 9-11.

