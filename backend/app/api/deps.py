import uuid
from typing import Annotated

import jwt
from fastapi import Depends, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_errors import raise_api_error
from app.core.security import decode_access_token
from app.db.session import get_session
from app.models.family import Family
from app.models.family_member import FamilyMember
from app.models.user import User


async def get_current_user(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> User:
    token = request.cookies.get("access_token")
    if token is None:
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_NOT_AUTHENTICATED",
            message="Not authenticated",
        )

    try:
        payload = decode_access_token(token)
        user_id = uuid.UUID(payload["sub"])
    except (jwt.InvalidTokenError, KeyError, ValueError):
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_ACCESS_TOKEN_INVALID",
            message="Invalid or expired token",
        )

    user = await session.get(User, user_id)
    if user is None or not user.is_active:
        raise_api_error(
            status_code=status.HTTP_401_UNAUTHORIZED,
            code="AUTH_ACCESS_TOKEN_INVALID",
            message="Invalid or expired token",
        )

    return user


async def get_family_membership(
    family_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> FamilyMember:
    membership = await session.scalar(
        select(FamilyMember).where(
            FamilyMember.family_id == family_id, FamilyMember.user_id == user.id
        )
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
