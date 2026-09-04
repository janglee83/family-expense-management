import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.family_member import FamilyMember
from app.models.notification import Notification


def queue_notifications_for_users(
    session: AsyncSession,
    user_ids: Iterable[uuid.UUID],
    *,
    message: str,
    family_id: uuid.UUID | None = None,
    actor_user_id: uuid.UUID | None = None,
) -> None:
    for user_id in user_ids:
        session.add(
            Notification(
                user_id=user_id,
                family_id=family_id,
                actor_user_id=actor_user_id,
                message=message,
            )
        )


async def queue_family_notification(
    session: AsyncSession,
    family_id: uuid.UUID,
    *,
    message: str,
    actor_user_id: uuid.UUID | None = None,
    exclude_user_ids: set[uuid.UUID] | None = None,
) -> None:
    excluded = set(exclude_user_ids or set())
    if actor_user_id is not None:
        excluded.add(actor_user_id)

    member_user_ids = await session.scalars(
        select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)
    )

    queue_notifications_for_users(
        session,
        [user_id for user_id in member_user_ids if user_id not in excluded],
        message=message,
        family_id=family_id,
        actor_user_id=actor_user_id,
    )
