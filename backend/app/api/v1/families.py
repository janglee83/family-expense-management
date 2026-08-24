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
    AddMemberRequest,
    ChangeRoleRequest,
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
        .order_by(Family.created_at)
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
        .order_by(FamilyMember.joined_at)
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


@router.post(
    "/{family_id}/members", status_code=status.HTTP_201_CREATED, response_model=FamilyMemberResponse
)
async def add_member(
    family_id: uuid.UUID,
    payload: AddMemberRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    require_owner_or_admin(membership)

    email = payload.email.lower()
    target_user = await session.scalar(select(User).where(User.email == email))
    if target_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="No registered user with that email"
        )

    existing = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == target_user.id
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already a member of this family",
        )

    new_member = FamilyMember(
        family_id=family_id, user_id=target_user.id, role=FamilyRole.MEMBER
    )
    session.add(new_member)
    await session.commit()

    return FamilyMemberResponse(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=new_member.role,
    )


@router.delete("/{family_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    target = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")

    is_self_removal = user_id == membership.user_id

    if is_self_removal:
        if membership.role == FamilyRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="The owner cannot leave the family; delete it instead",
            )
    else:
        if target.role == FamilyRole.OWNER:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Cannot remove the owner"
            )
        if target.role == FamilyRole.ADMIN:
            require_owner(membership)
        else:
            require_owner_or_admin(membership)

    await session.delete(target)
    await session.commit()


@router.patch("/{family_id}/members/{user_id}", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChangeRoleRequest,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    require_owner(membership)

    target = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user_id
        )
    )
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Membership not found")
    if target.role == FamilyRole.OWNER:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change the owner's role"
        )

    target.role = payload.role
    await session.commit()

    target_user = await session.get(User, user_id)
    assert target_user is not None
    return FamilyMemberResponse(
        user_id=target_user.id,
        email=target_user.email,
        display_name=target_user.display_name,
        role=target.role,
    )
