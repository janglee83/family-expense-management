import uuid

import pytest
from fastapi import HTTPException

from app.core.permissions import (
    require_owner,
    require_owner_admin_or_creator,
    require_owner_or_admin,
)
from app.models.family_member import FamilyMember, FamilyRole


def _membership(role: str, user_id: uuid.UUID | None = None) -> FamilyMember:
    return FamilyMember(role=role, user_id=user_id or uuid.uuid4())


def test_require_owner_allows_owner() -> None:
    require_owner(_membership(FamilyRole.OWNER))


def test_require_owner_rejects_admin() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner(_membership(FamilyRole.ADMIN))
    assert exc_info.value.status_code == 403


def test_require_owner_or_admin_allows_admin() -> None:
    require_owner_or_admin(_membership(FamilyRole.ADMIN))


def test_require_owner_or_admin_rejects_member() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner_or_admin(_membership(FamilyRole.MEMBER))
    assert exc_info.value.status_code == 403


def test_require_owner_admin_or_creator_allows_the_creator() -> None:
    creator_id = uuid.uuid4()
    require_owner_admin_or_creator(_membership(FamilyRole.MEMBER, creator_id), creator_id)


def test_require_owner_admin_or_creator_allows_owner_for_someone_elses_resource() -> None:
    require_owner_admin_or_creator(_membership(FamilyRole.OWNER), uuid.uuid4())


def test_require_owner_admin_or_creator_rejects_member_for_someone_elses_resource() -> None:
    with pytest.raises(HTTPException) as exc_info:
        require_owner_admin_or_creator(_membership(FamilyRole.MEMBER), uuid.uuid4())
    assert exc_info.value.status_code == 403
