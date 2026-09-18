import uuid
from datetime import date, time
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

TripStatus = Literal["upcoming", "ongoing", "completed", "cancelled"]


def _normalize_non_empty_name(value: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError("must not be blank")
    return normalized


def _normalize_optional_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


class CreateTripRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    start_date: date
    end_date: date
    budget_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @field_validator("destination")
    @classmethod
    def _validate_destination(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)

    @model_validator(mode="after")
    def _validate_date_range(self) -> "CreateTripRequest":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class UpdateTripRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    destination: str | None = Field(default=None, max_length=200)
    start_date: date | None = None
    end_date: date | None = None
    budget_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)
    is_cancelled: bool | None = None

    @field_validator("name")
    @classmethod
    def _validate_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)

    @field_validator("destination")
    @classmethod
    def _validate_destination(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class TripItineraryItemRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    link_url: str | None = Field(default=None, max_length=2048)
    item_date: date
    item_time: time | None = None
    planned_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str) -> str:
        return _normalize_non_empty_name(value)

    @field_validator("description", "link_url")
    @classmethod
    def _validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class UpdateTripItineraryItemRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=1000)
    link_url: str | None = Field(default=None, max_length=2048)
    item_date: date | None = None
    item_time: time | None = None
    planned_amount: int | None = Field(default=None, gt=0, le=2_147_483_647)

    @field_validator("title")
    @classmethod
    def _validate_title(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _normalize_non_empty_name(value)

    @field_validator("description", "link_url")
    @classmethod
    def _validate_optional_text(cls, value: str | None) -> str | None:
        return _normalize_optional_text(value)


class TripItineraryItemResponse(BaseModel):
    id: uuid.UUID
    trip_id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    title: str
    description: str | None
    link_url: str | None
    item_date: date
    item_time: time | None
    planned_amount: int | None
    actual_amount: int


class TripResponse(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    created_by_user_id: uuid.UUID
    name: str
    destination: str | None
    start_date: date
    end_date: date
    budget_amount: int | None
    is_cancelled: bool
    status: TripStatus
    participant_user_ids: list[uuid.UUID]
    planned_total: int
    actual_total: int


class TripDetailResponse(TripResponse):
    items: list[TripItineraryItemResponse]
