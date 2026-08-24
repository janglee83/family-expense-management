import uuid
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class CreateFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class RenameFamilyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class AddMemberRequest(BaseModel):
    email: EmailStr


class ChangeRoleRequest(BaseModel):
    role: Literal["admin", "member"]


class FamilyResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    role: str


class FamilyMemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    display_name: str
    role: str


class FamilyDetailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    members: list[FamilyMemberResponse]
