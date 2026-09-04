import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.api_errors import raise_api_error
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.notification import Notification
from app.models.user import User
from app.schemas.notification import NotificationResponse

router = APIRouter()

_NOTIFICATION_RETENTION_DAYS = 30
_DB_TRANSACTION_ERROR_CODE = "DATABASE_TRANSACTION_FAILED"
_DB_TRANSACTION_ERROR_MESSAGE = "Database transaction failed"


async def _cleanup_expired_notifications(session: AsyncSession, user_id: uuid.UUID) -> None:
    cutoff = datetime.now(UTC) - timedelta(days=_NOTIFICATION_RETENTION_DAYS)
    await session.execute(
        delete(Notification).where(
            Notification.user_id == user_id,
            Notification.created_at < cutoff,
        )
    )


@router.get("/", response_model=list[NotificationResponse])
async def list_notifications(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    unread_only: bool = False,
) -> list[Notification]:
    try:
        async with locked_write(session, tables=("notifications",)):
            await _cleanup_expired_notifications(session, user.id)

            query = select(Notification).where(Notification.user_id == user.id)
            if unread_only:
                query = query.where(Notification.read_at.is_(None))

            result = await session.scalars(
                query.order_by(Notification.created_at.desc()).limit(limit)
            )
            return list(result.all())
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.patch("/{notification_id}/read", response_model=NotificationResponse)
async def mark_notification_read(
    notification_id: uuid.UUID,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Notification:
    try:
        async with locked_write(session, tables=("notifications",)):
            await _cleanup_expired_notifications(session, user.id)

            notification = await session.scalar(
                select(Notification)
                .where(Notification.id == notification_id, Notification.user_id == user.id)
                .with_for_update()
            )
            if notification is None:
                raise_api_error(
                    status_code=status.HTTP_404_NOT_FOUND,
                    code="NOTIFICATION_NOT_FOUND",
                    message="Notification not found",
                )

            if notification.read_at is None:
                notification.read_at = datetime.now(UTC)

            return notification
    except HTTPException:
        raise
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    try:
        async with locked_write(session, tables=("notifications",)):
            await _cleanup_expired_notifications(session, user.id)

            notifications = await session.scalars(
                select(Notification)
                .where(
                    Notification.user_id == user.id,
                    Notification.read_at.is_(None),
                )
                .with_for_update()
            )
            now = datetime.now(UTC)
            for notification in notifications:
                notification.read_at = now
    except SQLAlchemyError:
        raise_api_error(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            code=_DB_TRANSACTION_ERROR_CODE,
            message=_DB_TRANSACTION_ERROR_MESSAGE,
        )
