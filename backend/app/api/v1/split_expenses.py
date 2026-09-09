import uuid
from datetime import UTC, datetime
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.core.permissions import require_owner_admin_or_creator
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.expense import Expense
from app.models.family_member import FamilyMember
from app.models.split_expense import (
    SplitExpense,
    SplitExpenseItem,
    SplitMethod,
    SplitStatus,
)
from app.models.split_expense_group import SplitExpenseGroupItem
from app.models.user import User
from app.schemas.split_expenses import (
    CreateSplitExpenseRequest,
    SettleSplitExpenseItemRequest,
    SplitExpenseItemResponse,
    SplitExpenseResponse,
)
from app.services.finance_engine import (
    resolve_equal_split_amounts,
    resolve_percentage_split_amounts,
)

router = APIRouter()


async def _get_expense_or_404(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    session: AsyncSession,
) -> Expense:
    expense = await session.scalar(
        select(Expense).where(Expense.id == expense_id, Expense.family_id == family_id)
    )
    if expense is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="EXPENSE_NOT_FOUND",
            message="Expense not found",
        )
    return expense


async def _get_split_or_404(
    family_id: uuid.UUID,
    split_expense_id: uuid.UUID,
    session: AsyncSession,
) -> SplitExpense:
    split_expense = await session.scalar(
        select(SplitExpense)
        .where(SplitExpense.id == split_expense_id, SplitExpense.family_id == family_id)
        .with_for_update()
    )
    if split_expense is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SPLIT_EXPENSE_NOT_FOUND",
            message="Split expense not found",
        )
    return split_expense


async def _get_split_item_or_404(
    split_expense_id: uuid.UUID,
    item_id: uuid.UUID,
    session: AsyncSession,
) -> SplitExpenseItem:
    split_item = await session.scalar(
        select(SplitExpenseItem)
        .where(
            SplitExpenseItem.id == item_id,
            SplitExpenseItem.split_expense_id == split_expense_id,
        )
        .with_for_update()
    )
    if split_item is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="SPLIT_EXPENSE_ITEM_NOT_FOUND",
            message="Split expense item not found",
        )
    return split_item


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


def _resolve_split_amounts(
    payload: CreateSplitExpenseRequest, total_amount: int
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
                message="Custom split amounts must equal expense amount",
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


async def _get_split_items(split_expense_id: uuid.UUID, session: AsyncSession) -> list[SplitExpenseItem]:
    result = await session.scalars(
        select(SplitExpenseItem)
        .where(SplitExpenseItem.split_expense_id == split_expense_id)
        .order_by(SplitExpenseItem.created_at)
    )
    return list(result.all())


def _to_split_response(split_expense: SplitExpense, items: list[SplitExpenseItem]) -> SplitExpenseResponse:
    total_amount = sum(item.amount for item in items)
    settled_amount = sum(item.amount for item in items if item.is_settled)

    return SplitExpenseResponse(
        id=split_expense.id,
        family_id=split_expense.family_id,
        expense_id=split_expense.expense_id,
        created_by_user_id=split_expense.created_by_user_id,
        method=split_expense.method,
        status=split_expense.status,
        total_amount=total_amount,
        settled_amount=settled_amount,
        outstanding_amount=total_amount - settled_amount,
        items=[
            SplitExpenseItemResponse(
                id=item.id,
                split_expense_id=item.split_expense_id,
                participant_user_id=item.participant_user_id,
                amount=item.amount,
                percentage=item.percentage,
                is_settled=item.is_settled,
            )
            for item in items
        ],
    )


async def _refresh_split_status(split_expense: SplitExpense, session: AsyncSession) -> None:
    items = await _get_split_items(split_expense.id, session)
    split_expense.status = (
        SplitStatus.SETTLED
        if items and all(item.is_settled for item in items)
        else SplitStatus.PENDING
    )


@router.get("/")
async def list_split_expenses(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[SplitExpenseResponse]:
    split_rows = await session.scalars(
        select(SplitExpense).where(SplitExpense.family_id == family_id).order_by(SplitExpense.created_at.desc())
    )

    responses: list[SplitExpenseResponse] = []
    for split_expense in split_rows.all():
        items = await _get_split_items(split_expense.id, session)
        responses.append(_to_split_response(split_expense, items))
    return responses


@router.get("/{split_expense_id}")
async def get_split_expense(
    family_id: uuid.UUID,
    split_expense_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseResponse:
    split_expense = await _get_split_or_404(family_id, split_expense_id, session)
    items = await _get_split_items(split_expense.id, session)
    return _to_split_response(split_expense, items)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_split_expense(
    family_id: uuid.UUID,
    payload: CreateSplitExpenseRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseResponse:
    try:
        async with locked_write(
            session,
            tables=(
                "expenses",
                "split_expenses",
                "split_expense_items",
                "split_expense_group_items",
                "notifications",
            ),
        ):
            expense = await _get_expense_or_404(family_id, payload.expense_id, session)

            existing = await session.scalar(
                select(SplitExpense)
                .where(SplitExpense.expense_id == payload.expense_id)
                .with_for_update()
            )
            if existing is not None:
                raise_api_error(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SPLIT_EXPENSE_ALREADY_EXISTS",
                    message="This expense already has split details",
                )

            # An expense claimed by a monthly split-expense group must not also be split
            # individually — otherwise the same amount is counted twice.
            already_in_group = await session.scalar(
                select(SplitExpenseGroupItem)
                .where(SplitExpenseGroupItem.expense_id == payload.expense_id)
                .with_for_update()
            )
            if already_in_group is not None:
                raise_api_error(
                    status_code=status.HTTP_409_CONFLICT,
                    code="SPLIT_EXPENSE_ALREADY_EXISTS",
                    message="This expense already has split details",
                )

            participant_ids = {item.participant_user_id for item in payload.participants}
            await _validate_participants(family_id, participant_ids, session)
            resolved_items = _resolve_split_amounts(payload, expense.amount)

            split_expense = SplitExpense(
                family_id=family_id,
                expense_id=payload.expense_id,
                created_by_user_id=user.id,
                method=payload.method,
                status=SplitStatus.PENDING,
            )
            session.add(split_expense)
            await session.flush()

            for participant_user_id, amount, percentage in resolved_items:
                session.add(
                    SplitExpenseItem(
                        split_expense_id=split_expense.id,
                        participant_user_id=participant_user_id,
                        amount=amount,
                        percentage=percentage,
                        is_settled=False,
                    )
                )

            await queue_family_notification(
                session,
                family_id,
                message=f"{user.display_name} created split details for an expense.",
                actor_user_id=user.id,
            )
    except IntegrityError:
        # `locked_write` takes ROW EXCLUSIVE locks, which do not conflict with each other, so
        # two concurrent requests can both pass the checks above. The unique constraints on
        # `split_expenses.expense_id` / `split_expense_group_items.expense_id` are the real
        # guard — surface a loser as the same clean 409 instead of an unhandled 500.
        raise_api_error(
            status_code=status.HTTP_409_CONFLICT,
            code="SPLIT_EXPENSE_ALREADY_EXISTS",
            message="This expense already has split details",
        )

    items = await _get_split_items(split_expense.id, session)
    return _to_split_response(split_expense, items)


@router.patch("/{split_expense_id}/items/{item_id}/settle")
async def settle_split_expense_item(
    family_id: uuid.UUID,
    split_expense_id: uuid.UUID,
    item_id: uuid.UUID,
    payload: SettleSplitExpenseItemRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> SplitExpenseResponse:
    async with locked_write(session, tables=("split_expenses", "split_expense_items", "notifications")):
        split_expense = await _get_split_or_404(family_id, split_expense_id, session)
        split_item = await _get_split_item_or_404(split_expense.id, item_id, session)

        if split_item.participant_user_id != user.id:
            require_owner_admin_or_creator(membership, split_expense.created_by_user_id)

        split_item.is_settled = payload.is_settled
        split_item.settled_at = datetime.now(UTC) if payload.is_settled else None

        await _refresh_split_status(split_expense, session)
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} updated split settlement status.",
            actor_user_id=user.id,
        )

    items = await _get_split_items(split_expense.id, session)
    return _to_split_response(split_expense, items)
