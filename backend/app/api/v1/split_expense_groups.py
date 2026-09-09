import uuid
from datetime import UTC, date, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
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
from app.models.split_expense import SplitExpense, SplitMethod, SplitStatus
from app.models.split_expense_group import (
    SplitExpenseGroup,
    SplitExpenseGroupItem,
    SplitExpenseGroupParticipant,
)
from app.models.user import User
from app.schemas.split_expense_groups import (
    CreateSplitExpenseGroupRequest,
    SettleSplitExpenseGroupParticipantRequest,
    SplitExpenseGroupExpenseSummary,
    SplitExpenseGroupParticipantResponse,
    SplitExpenseGroupPreviewResponse,
    SplitExpenseGroupResponse,
)
from app.services.finance_engine import (
    resolve_equal_split_amounts,
    resolve_percentage_split_amounts,
)

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


async def _get_group_participant_or_404(
    group_id: uuid.UUID, participant_id: uuid.UUID, session: AsyncSession
) -> SplitExpenseGroupParticipant:
    participant = await session.scalar(
        select(SplitExpenseGroupParticipant)
        .where(
            SplitExpenseGroupParticipant.id == participant_id,
            SplitExpenseGroupParticipant.split_expense_group_id == group_id,
        )
        .with_for_update()
    )
    if participant is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SPLIT_EXPENSE_GROUP_PARTICIPANT_NOT_FOUND",
            message="Split expense group participant not found",
        )
    return participant


async def _refresh_group_status(group: SplitExpenseGroup, session: AsyncSession) -> None:
    participants = await _get_group_participants(group.id, session)
    group.status = (
        SplitStatus.SETTLED
        if participants and all(item.is_settled for item in participants)
        else SplitStatus.PENDING
    )


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
            message=(
                f"{user.display_name} created a monthly split "
                f"for {payload.period_start:%Y-%m}."
            ),
            actor_user_id=user.id,
        )

    return await _to_group_response(group, session)


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


# NOTE: this route MUST stay declared after `GET /preview` above — otherwise Starlette
# would match the literal path "preview" against this `{group_id}` path parameter
# before FastAPI gets a chance to validate it as a UUID.
@router.get("/{group_id}")
async def get_split_expense_group(
    family_id: uuid.UUID,
    group_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseGroupResponse:
    group = await _get_group_or_404(family_id, group_id, session)
    return await _to_group_response(group, session)


# NOTE: this route is required for this task's own "create + settle" integration test
# (`test_create_equal_split_group_and_settle_each_participant`), even though the plan's
# Interfaces section describes settle as a Task 4 addition. It follows the exact same
# shape as the existing per-expense `PATCH /{split_expense_id}/items/{item_id}/settle`
# route in `split_expenses.py`. Flagged in the task report for the plan/Task 4 author to
# reconcile so Task 4 does not attempt to redeclare this same route.
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
        tables=(
            "split_expense_groups",
            "split_expense_group_participants",
            "notifications",
        ),
    ):
        group = await _get_group_or_404(family_id, group_id, session)
        participant = await _get_group_participant_or_404(group.id, participant_id, session)

        if participant.participant_user_id != user.id:
            require_owner_admin_or_creator(membership, group.created_by_user_id)

        participant.is_settled = payload.is_settled
        participant.settled_at = datetime.now(UTC) if payload.is_settled else None

        await _refresh_group_status(group, session)
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated split settlement status.",
            actor_user_id=user.id,
        )

    return await _to_group_response(group, session)
