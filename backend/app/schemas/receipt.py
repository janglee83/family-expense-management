import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ReceiptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    family_id: uuid.UUID
    uploaded_by_user_id: uuid.UUID
    content_type: str
    file_size_bytes: int
    status: str
    error_message: str | None
    created_at: datetime
    updated_at: datetime
