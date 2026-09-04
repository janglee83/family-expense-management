import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    family_id: uuid.UUID | None
    actor_user_id: uuid.UUID | None
    message: str
    read_at: datetime | None
    created_at: datetime
