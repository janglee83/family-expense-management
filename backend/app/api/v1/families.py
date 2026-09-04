import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification, queue_notifications_for_users
from app.core.permissions import require_owner, require_owner_or_admin
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.family import Family, FamilyType
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

_DB_TRANSACTION_ERROR_CODE = "DATABASE_TRANSACTION_FAILED"
_DB_TRANSACTION_ERROR_MESSAGE = "Database transaction failed"


def _dedupe_member_emails(member_emails: list[str], owner_email: str) -> list[str]:
    normalized: list[str] = []
    seen = {owner_email}

    for raw_email in member_emails:
        email = raw_email.strip().lower()
        if email and email not in seen:
            seen.add(email)
            normalized.append(email)

    return normalized


async def _load_users_by_email(
    session: AsyncSession, emails: list[str]
) -> dict[str, User]:
    if not emails:
        return {}

    users = await session.scalars(select(User).where(User.email.in_(emails)))
    users_by_email = {item.email: item for item in users}
    missing_emails = [email for email in emails if email not in users_by_email]
    if missing_emails:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="USER_NOT_FOUND_BY_EMAIL",
            message="No registered user with email",
            details={"email": missing_emails[0]},
        )

    return users_by_email


async def _load_membership_for_update(
    session: AsyncSession, family_id: uuid.UUID, user_id: uuid.UUID
) -> FamilyMember:
    membership = await session.scalar(
        select(FamilyMember)
        .where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
        .with_for_update()
    )
    if membership is not None:
        return membership

    family_exists = await session.scalar(select(Family.id).where(Family.id == family_id))
    if family_exists is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="FAMILY_NOT_FOUND",
            message="Family not found",
        )
    raise_api_error(
        status_code=status.HTTP_403_FORBIDDEN,
        code="FAMILY_MEMBERSHIP_REQUIRED",
        message="Not a member of this family",
    )


async def _load_family_for_update(session: AsyncSession, family_id: uuid.UUID) -> Family:
    family = await session.scalar(
        select(Family).where(Family.id == family_id).with_for_update()
    )
    if family is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="FAMILY_NOT_FOUND",
            message="Family not found",
        )
    return family


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=FamilyResponse)
async def create_family(
    payload: CreateFamilyRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    try:
        async with locked_write(session, tables=("families", "family_members", "notifications")):
            member_emails = _dedupe_member_emails(
                [str(email) for email in payload.member_emails],
                owner_email=user.email,
            )
            users_by_email = await _load_users_by_email(session, member_emails)

            family = Family(
                name=payload.name,
                family_type=payload.family_type,
                currency_code=payload.currency_code,
                monthly_income_enabled=payload.monthly_income_enabled,
                monthly_income=payload.monthly_income,
                savings_goal_amount=payload.savings_goal_amount,
            )
            session.add(family)
            await session.flush()

            membership = FamilyMember(family_id=family.id, user_id=user.id, role=FamilyRole.OWNER)
            session.add(membership)

            added_user_ids: list[uuid.UUID] = []
            for email in member_emails:
                target_user = users_by_email[email]
                session.add(
                    FamilyMember(
                        family_id=family.id,
                        user_id=target_user.id,
                        role=FamilyRole.MEMBER,
                    )
                )
                added_user_ids.append(target_user.id)

            if added_user_ids:
                queue_notifications_for_users(
                    session,
                    added_user_ids,
                    message=f'{user.display_name} added you to the family "{family.name}".',
                    family_id=family.id,
                    actor_user_id=user.id,
                )

            return FamilyResponse(
                id=family.id,
                name=family.name,
                role=FamilyRole(membership.role),
                family_type=family.family_type,
                currency_code=family.currency_code,
                monthly_income_enabled=family.monthly_income_enabled,
                monthly_income=family.monthly_income,
                savings_goal_amount=family.savings_goal_amount,
            )
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


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
        FamilyResponse(
            id=family.id,
            name=family.name,
            role=FamilyRole(role),
            family_type=family.family_type,
            currency_code=family.currency_code,
            monthly_income_enabled=family.monthly_income_enabled,
            monthly_income=family.monthly_income,
            savings_goal_amount=family.savings_goal_amount,
        )
        for family, role in rows.all()
    ]


@router.get("/{family_id}", response_model=FamilyDetailResponse)
async def get_family_detail(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyDetailResponse:
    family = await session.get(Family, family_id)
    if family is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="FAMILY_NOT_FOUND",
            message="Family not found",
        )

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
            role=FamilyRole(member_row.role),
        )
        for member_row, user_row in rows.all()
    ]
    return FamilyDetailResponse(
        id=family.id,
        name=family.name,
        family_type=family.family_type,
        currency_code=family.currency_code,
        monthly_income_enabled=family.monthly_income_enabled,
        monthly_income=family.monthly_income,
        savings_goal_amount=family.savings_goal_amount,
        members=members,
    )


@router.patch("/{family_id}", response_model=FamilyResponse)
async def rename_family(
    family_id: uuid.UUID,
    payload: RenameFamilyRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyResponse:
    try:
        async with locked_write(session, tables=("families", "notifications")):
            membership = await _load_membership_for_update(session, family_id, user.id)
            require_owner_or_admin(membership)

            family = await _load_family_for_update(session, family_id)
            old_name = family.name
            family.name = payload.name
            await queue_family_notification(
                session,
                family_id,
                message=f'{user.display_name} renamed family "{old_name}" to "{family.name}".',
                actor_user_id=user.id,
            )

            return FamilyResponse(
                id=family.id,
                name=family.name,
                role=FamilyRole(membership.role),
                family_type=family.family_type,
                currency_code=family.currency_code,
                monthly_income_enabled=family.monthly_income_enabled,
                monthly_income=family.monthly_income,
                savings_goal_amount=family.savings_goal_amount,
            )
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.delete("/{family_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_family(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        async with locked_write(
            session,
            tables=(
                "families",
                "family_members",
                "categories",
                "expenses",
                "receipts",
                "notifications",
            ),
        ):
            membership = await _load_membership_for_update(session, family_id, user.id)
            require_owner(membership)

            family = await _load_family_for_update(session, family_id)
            await queue_family_notification(
                session,
                family_id,
                message=f'{user.display_name} deleted family "{family.name}".',
                actor_user_id=user.id,
            )
            await session.delete(family)
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.post(
    "/{family_id}/members", status_code=status.HTTP_201_CREATED, response_model=FamilyMemberResponse
)
async def add_member(
    family_id: uuid.UUID,
    payload: AddMemberRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    try:
        async with locked_write(session, tables=("family_members", "notifications")):
            membership = await _load_membership_for_update(session, family_id, user.id)
            require_owner_or_admin(membership)
            family = await _load_family_for_update(session, family_id)
            if family.family_type == FamilyType.SOLO:
                raise_api_error(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="SOLO_FAMILY_MEMBER_ADD_FORBIDDEN",
                    message="Cannot add members to a solo family",
                )

            email = str(payload.email).lower()
            target_user = await session.scalar(select(User).where(User.email == email))
            if target_user is None:
                raise_api_error(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="USER_NOT_FOUND_BY_EMAIL",
                    message="No registered user with that email",
                    details={"email": email},
                )

            existing = await session.scalar(
                select(FamilyMember)
                .where(FamilyMember.family_id == family_id, FamilyMember.user_id == target_user.id)
                .with_for_update()
            )
            if existing is not None:
                raise_api_error(
                    status_code=status.HTTP_409_CONFLICT,
                    code="FAMILY_MEMBER_ALREADY_EXISTS",
                    message="User is already a member of this family",
                )

            new_member = FamilyMember(
                family_id=family_id, user_id=target_user.id, role=FamilyRole.MEMBER
            )
            session.add(new_member)

            await queue_family_notification(
                session,
                family_id,
                message=f"{user.display_name} added {target_user.display_name} to the family.",
                actor_user_id=user.id,
                exclude_user_ids={target_user.id},
            )
            queue_notifications_for_users(
                session,
                [target_user.id],
                message=f"{user.display_name} added you to a family.",
                family_id=family_id,
                actor_user_id=user.id,
            )

            return FamilyMemberResponse(
                user_id=target_user.id,
                email=target_user.email,
                display_name=target_user.display_name,
                role=FamilyRole(new_member.role),
            )
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.delete("/{family_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        async with locked_write(session, tables=("family_members", "notifications")):
            membership = await _load_membership_for_update(session, family_id, user.id)
            await _load_family_for_update(session, family_id)

            target = await session.scalar(
                select(FamilyMember)
                .where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
                .with_for_update()
            )
            if target is None:
                raise_api_error(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="FAMILY_MEMBER_NOT_FOUND",
                    message="Membership not found",
                )

            is_self_removal = user_id == membership.user_id
            target_user = await session.get(User, user_id)

            if is_self_removal:
                if membership.role == FamilyRole.OWNER:
                    raise_api_error(
                        status_code=status.HTTP_403_FORBIDDEN,
                        code="FAMILY_OWNER_CANNOT_LEAVE",
                        message="The owner cannot leave the family; delete it instead",
                    )
            else:
                if target.role == FamilyRole.OWNER:
                    raise_api_error(
                        status_code=status.HTTP_403_FORBIDDEN,
                        code="FAMILY_OWNER_REMOVE_FORBIDDEN",
                        message="Cannot remove the owner",
                    )
                if target.role == FamilyRole.ADMIN:
                    require_owner(membership)
                else:
                    require_owner_or_admin(membership)

            if is_self_removal:
                await queue_family_notification(
                    session,
                    family_id,
                    message=f"{user.display_name} left the family.",
                    actor_user_id=user.id,
                )
            else:
                target_display_name = target_user.display_name if target_user else "A member"
                await queue_family_notification(
                    session,
                    family_id,
                    message=f"{user.display_name} removed {target_display_name} from the family.",
                    actor_user_id=user.id,
                    exclude_user_ids={user_id},
                )
                if target_user is not None:
                    queue_notifications_for_users(
                        session,
                        [user_id],
                        message=f"{user.display_name} removed you from a family.",
                        family_id=family_id,
                        actor_user_id=user.id,
                    )

            await session.delete(target)
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.patch("/{family_id}/members/{user_id}", response_model=FamilyMemberResponse)
async def change_member_role(
    family_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: ChangeRoleRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMemberResponse:
    try:
        async with locked_write(session, tables=("family_members", "notifications")):
            membership = await _load_membership_for_update(session, family_id, user.id)
            require_owner(membership)
            await _load_family_for_update(session, family_id)

            target = await session.scalar(
                select(FamilyMember)
                .where(FamilyMember.family_id == family_id, FamilyMember.user_id == user_id)
                .with_for_update()
            )
            if target is None:
                raise_api_error(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="FAMILY_MEMBER_NOT_FOUND",
                    message="Membership not found",
                )
            if target.role == FamilyRole.OWNER:
                raise_api_error(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    code="FAMILY_OWNER_ROLE_CHANGE_FORBIDDEN",
                    message="Cannot change the owner's role",
                )

            target.role = payload.role
            target_user = await session.get(User, user_id)
            if target_user is None:
                raise_api_error(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="USER_NOT_FOUND",
                    message="User not found",
                )

            await queue_family_notification(
                session,
                family_id,
                message=(
                    f"{user.display_name} changed {target_user.display_name}'s role "
                    f"to {target.role}."
                ),
                actor_user_id=user.id,
                exclude_user_ids={target_user.id},
            )
            queue_notifications_for_users(
                session,
                [target_user.id],
                message=f"{user.display_name} changed your role to {target.role}.",
                family_id=family_id,
                actor_user_id=user.id,
            )

            return FamilyMemberResponse(
                user_id=target_user.id,
                email=target_user.email,
                display_name=target_user.display_name,
                role=FamilyRole(target.role),
            )
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )
