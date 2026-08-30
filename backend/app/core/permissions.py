import uuid

from fastapi import HTTPException, status

from app.models.family_member import FamilyMember, FamilyRole


def require_role(membership: FamilyMember, allowed_roles: set[str]) -> None:
    if membership.role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )


def require_owner(membership: FamilyMember) -> None:
    require_role(membership, {FamilyRole.OWNER})


def require_owner_or_admin(membership: FamilyMember) -> None:
    require_role(membership, {FamilyRole.OWNER, FamilyRole.ADMIN})


def require_owner_admin_or_creator(
    membership: FamilyMember, creator_user_id: uuid.UUID
) -> None:
    if membership.user_id == creator_user_id:
        return
    require_owner_or_admin(membership)
