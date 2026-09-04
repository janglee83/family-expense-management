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
from app.models.account import Account
from app.models.family_member import FamilyMember
from app.models.goal import Goal, GoalEntry, GoalEntryType
from app.models.user import User
from app.schemas.goals import (
    CreateGoalRequest,
    GoalEntryRequest,
    GoalEntryResponse,
    GoalResponse,
    UpdateGoalRequest,
)
from app.services.finance_engine import build_goal_progress

router = APIRouter()


async def _validate_linked_account(
    family_id: uuid.UUID,
    linked_account_id: uuid.UUID | None,
    session: AsyncSession,
) -> None:
    if linked_account_id is None:
        return

    account = await session.scalar(
        select(Account).where(Account.id == linked_account_id, Account.family_id == family_id)
    )
    if account is None:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="GOAL_LINKED_ACCOUNT_INVALID",
            message="linked_account_id is not valid for this family",
        )


def _to_goal_response(goal: Goal, as_of: date) -> GoalResponse:
    progress = build_goal_progress(
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        target_date=goal.target_date,
        monthly_contribution=goal.monthly_contribution,
        as_of=as_of,
    )
    return GoalResponse(
        id=goal.id,
        family_id=goal.family_id,
        created_by_user_id=goal.created_by_user_id,
        name=goal.name,
        icon=goal.icon,
        target_amount=goal.target_amount,
        current_amount=goal.current_amount,
        target_date=goal.target_date,
        linked_account_id=goal.linked_account_id,
        monthly_contribution=goal.monthly_contribution,
        is_paused=goal.is_paused,
        progress_percentage=progress.progress_percentage,
        remaining_amount=progress.remaining_amount,
        estimated_completion_date=progress.estimated_completion_date,
    )


def _to_goal_entry_response(entry: GoalEntry) -> GoalEntryResponse:
    return GoalEntryResponse(
        id=entry.id,
        family_id=entry.family_id,
        goal_id=entry.goal_id,
        created_by_user_id=entry.created_by_user_id,
        entry_type=entry.entry_type,
        amount=entry.amount,
        occurred_on=entry.occurred_on,
        note=entry.note,
    )


async def _get_goal_or_404(family_id: uuid.UUID, goal_id: uuid.UUID, session: AsyncSession) -> Goal:
    goal = await session.scalar(select(Goal).where(Goal.id == goal_id, Goal.family_id == family_id))
    if goal is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="GOAL_NOT_FOUND",
            message="Goal not found",
        )
    return goal


@router.get("/")
async def list_goals(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[GoalResponse]:
    result = await session.scalars(select(Goal).where(Goal.family_id == family_id).order_by(Goal.created_at))
    today = date.today()
    return [_to_goal_response(item, today) for item in result.all()]


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_goal(
    family_id: uuid.UUID,
    payload: CreateGoalRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GoalResponse:
    async with locked_write(session, tables=("goals", "accounts", "notifications")):
        await _validate_linked_account(family_id, payload.linked_account_id, session)

        goal = Goal(
            family_id=family_id,
            created_by_user_id=user.id,
            name=payload.name,
            icon=payload.icon,
            target_amount=payload.target_amount,
            current_amount=payload.current_amount,
            target_date=payload.target_date,
            linked_account_id=payload.linked_account_id,
            monthly_contribution=payload.monthly_contribution,
            is_paused=False,
        )
        session.add(goal)

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} created goal \"{goal.name}\".",
            actor_user_id=user.id,
        )

    return _to_goal_response(goal, date.today())


@router.patch("/{goal_id}")
async def update_goal(
    family_id: uuid.UUID,
    goal_id: uuid.UUID,
    payload: UpdateGoalRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GoalResponse:
    async with locked_write(session, tables=("goals", "accounts", "notifications")):
        goal = await _get_goal_or_404(family_id, goal_id, session)
        require_owner_admin_or_creator(membership, goal.created_by_user_id)

        if "linked_account_id" in payload.model_fields_set:
            await _validate_linked_account(family_id, payload.linked_account_id, session)

        if payload.name is not None:
            goal.name = payload.name
        if "icon" in payload.model_fields_set:
            goal.icon = payload.icon
        if payload.target_amount is not None:
            goal.target_amount = payload.target_amount
        if "target_date" in payload.model_fields_set:
            goal.target_date = payload.target_date
        if "linked_account_id" in payload.model_fields_set:
            goal.linked_account_id = payload.linked_account_id
        if "monthly_contribution" in payload.model_fields_set:
            goal.monthly_contribution = payload.monthly_contribution
        if payload.is_paused is not None:
            goal.is_paused = payload.is_paused

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated goal \"{goal.name}\".",
            actor_user_id=user.id,
        )

    return _to_goal_response(goal, date.today())


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_goal(
    family_id: uuid.UUID,
    goal_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    async with locked_write(session, tables=("goals", "goal_entries", "notifications")):
        goal = await _get_goal_or_404(family_id, goal_id, session)
        require_owner_admin_or_creator(membership, goal.created_by_user_id)
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} deleted goal \"{goal.name}\".",
            actor_user_id=user.id,
        )
        await session.delete(goal)


@router.get("/{goal_id}/entries")
async def list_goal_entries(
    family_id: uuid.UUID,
    goal_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[GoalEntryResponse]:
    await _get_goal_or_404(family_id, goal_id, session)
    result = await session.scalars(
        select(GoalEntry)
        .where(GoalEntry.family_id == family_id, GoalEntry.goal_id == goal_id)
        .order_by(GoalEntry.occurred_on.desc(), GoalEntry.created_at.desc())
    )
    return [_to_goal_entry_response(item) for item in result.all()]


@router.post("/{goal_id}/entries", status_code=status.HTTP_201_CREATED)
async def create_goal_entry(
    family_id: uuid.UUID,
    goal_id: uuid.UUID,
    payload: GoalEntryRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> GoalEntryResponse:
    async with locked_write(session, tables=("goals", "goal_entries", "notifications")):
        goal = await _get_goal_or_404(family_id, goal_id, session)
        require_owner_admin_or_creator(membership, goal.created_by_user_id)

        if payload.entry_type == GoalEntryType.CONTRIBUTION:
            goal.current_amount += payload.amount
        else:
            if goal.current_amount < payload.amount:
                raise_api_error(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    code="GOAL_WITHDRAWAL_EXCEEDS_BALANCE",
                    message="Withdrawal amount exceeds current goal balance",
                )
            goal.current_amount -= payload.amount

        entry = GoalEntry(
            family_id=family_id,
            goal_id=goal.id,
            created_by_user_id=user.id,
            entry_type=payload.entry_type,
            amount=payload.amount,
            occurred_on=payload.occurred_on,
            note=payload.note,
        )
        session.add(entry)

        await queue_family_notification(
            session,
            family_id,
            message=(
                f"{user.display_name} added a {payload.entry_type.value} "
                f"of {payload.amount:,} to goal \"{goal.name}\"."
            ),
            actor_user_id=user.id,
        )

    return _to_goal_entry_response(entry)
