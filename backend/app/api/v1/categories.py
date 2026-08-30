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
        ) from None
