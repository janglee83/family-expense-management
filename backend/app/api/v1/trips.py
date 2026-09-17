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
    TripStatus,
    UpdateTripRequest,
)

router = APIRouter()


def _compute_status(trip: Trip, today: date) -> TripStatus:
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
    return sum(amount for amount in result.all() if amount is not None)


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
