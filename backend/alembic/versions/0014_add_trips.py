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
