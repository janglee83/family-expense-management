import pytest
from fastapi import HTTPException

from app.core.permissions import require_owner, require_owner_or_admin
from app.models.family_member import FamilyMember, FamilyRole


def _membership(role: str) -> FamilyMember:
    return FamilyMember(role=role)


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
