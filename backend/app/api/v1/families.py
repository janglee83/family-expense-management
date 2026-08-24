import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.permissions import require_owner, require_owner_or_admin
from app.db.session import get_session
from app.models.family import Family
from app.models.family_member import FamilyMember, FamilyRole
from app.models.user import User
from app.schemas.family import (
    CreateFamilyRequest,
    FamilyDetailResponse,
    FamilyMemberResponse,
    FamilyResponse,
    RenameFamilyRequest,
)

router = APIRouter()


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=FamilyResponse)
async def create_family(
    payload: CreateFamilyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    family = Family(name=payload.name)
    session.add(family)
    await session.flush()

    membership = FamilyMember(family_id=family.id, user_id=user.id, role=FamilyRole.OWNER)
    session.add(membership)
    await session.commit()

    return FamilyResponse(id=family.id, name=family.name, role=membership.role)


@router.get("/", response_model=list[FamilyResponse])
async def list_my_families(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[FamilyResponse]:
    rows = await session.execute(
        select(Family, FamilyMember.role)
        .join(FamilyMember, FamilyMember.family_id == Family.id)
        .where(FamilyMember.user_id == user.id)
    )
    return [
        FamilyResponse(id=family.id, name=family.name, role=role) for family, role in rows.all()
    ]


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family_detail(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyDetailResponse:
    family = await session.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    rows = await session.execute(
        select(FamilyMember, User)
        .join(User, User.id == FamilyMember.user_id)
        .where(FamilyMember.family_id == family_id)
    )
    members = [
        FamilyMemberResponse(
            user_id=user_row.id,
            email=user_row.email,
            display_name=user_row.display_name,
            role=member_row.role,
        )
        for member_row, user_row in rows.all()
    ]
    return FamilyDetailResponse(id=family.id, name=family.name, members=members)


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: uuid.UUID,
    payload: RenameFamilyRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    require_owner_or_admin(membership)

    family = await session.get(Family, family_id)
    if family is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Family not found")

    family.name = payload.name
    await session.commit()
    return FamilyResponse(id=family.id, name=family.name, role=membership.role)


@router.delete("/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    require_owner(membership)

    family = await session.get(Family, family_id)
    if family is not None:
        await session.delete(family)
        await session.commit()
