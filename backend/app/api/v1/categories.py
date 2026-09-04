import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.core.permissions import require_owner_or_admin
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.category import Category
from app.models.family_member import FamilyMember
from app.models.user import User
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
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Category:
    async with locked_write(session, tables=("categories", "notifications")):
        category = Category(family_id=family_id, name=payload.name, icon=payload.icon)
        session.add(category)
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} created category \"{category.name}\".",
            actor_user_id=user.id,
        )
    return category


async def _get_mutable_category(
    family_id: uuid.UUID, category_id: uuid.UUID, session: AsyncSession
) -> Category:
    category = await session.get(Category, category_id)
    if category is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="CATEGORY_NOT_FOUND",
            message="Category not found",
        )
    if category.family_id != family_id:
        raise_api_error(
            status_code=status.HTTP_403_FORBIDDEN,
            code="CATEGORY_MODIFICATION_FORBIDDEN",
            message="This category cannot be modified by this family",
        )
    return category


@router.patch("/{category_id}", response_model=CategoryResponse)
async def rename_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID,
    payload: RenameCategoryRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Category:
    require_owner_or_admin(membership)
    async with locked_write(session, tables=("categories", "notifications")):
        category = await _get_mutable_category(family_id, category_id, session)
        old_name = category.name
        category.name = payload.name
        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} renamed category \"{old_name}\" to \"{category.name}\".",
            actor_user_id=user.id,
        )
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_category(
    family_id: uuid.UUID,
    category_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    require_owner_or_admin(membership)
    try:
        async with locked_write(session, tables=("categories", "notifications")):
            category = await _get_mutable_category(family_id, category_id, session)
            category_name = category.name
            await session.delete(category)
            await queue_family_notification(
                session,
                family_id,
                message=f"{user.display_name} deleted category \"{category_name}\".",
                actor_user_id=user.id,
            )
    except IntegrityError:
        raise_api_error(
            status_code=status.HTTP_409_CONFLICT,
            code="CATEGORY_HAS_EXPENSES",
            message="Cannot delete a category that has expenses",
        )
