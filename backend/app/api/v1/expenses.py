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
