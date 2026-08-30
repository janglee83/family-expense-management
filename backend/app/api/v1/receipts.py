import uuid
from typing import Annotated

import magic
from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.permissions import require_owner_admin_or_creator
from app.core.storage import get_receipt_storage
from app.db.session import get_session
from app.models.family_member import FamilyMember
from app.models.receipt import Receipt, ReceiptStatus
from app.models.user import User
from app.schemas.receipt import ReceiptResponse
from app.worker import process_receipt

router = APIRouter()

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/heic", "image/heif"}
MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024


def _validate_receipt_content(content: bytes) -> str:
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="File exceeds the 10MB size limit",
        )
    content_type: str = magic.from_buffer(content, mime=True)
    if content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Unsupported file type; only JPEG, PNG, and HEIC are allowed",
        )
    return content_type


@router.post("/", status_code=status.HTTP_201_CREATED, response_model=ReceiptResponse)
async def upload_receipt(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: UploadFile,
) -> Receipt:
    content = await file.read()
    content_type = _validate_receipt_content(content)

    receipt_id = uuid.uuid4()
    filename = (file.filename or "receipt").replace("/", "_")
    storage_key = f"receipts/{family_id}/{receipt_id}/{filename}"

    storage = get_receipt_storage()
    await run_in_threadpool(storage.save, storage_key, content, content_type)

    receipt = Receipt(
        id=receipt_id,
        family_id=family_id,
        uploaded_by_user_id=user.id,
        storage_key=storage_key,
        content_type=content_type,
        file_size_bytes=len(content),
        status=ReceiptStatus.UPLOAD.value,
    )
    session.add(receipt)
    await session.commit()

    process_receipt.delay(str(receipt.id))
    return receipt


@router.get("/", response_model=list[ReceiptResponse])
async def list_receipts(
    family_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> list[Receipt]:
    result = await session.scalars(
        select(Receipt).where(Receipt.family_id == family_id).order_by(Receipt.created_at.desc())
    )
    return list(result.all())


async def _get_receipt_or_404(
    family_id: uuid.UUID, receipt_id: uuid.UUID, session: AsyncSession
) -> Receipt:
    receipt = await session.scalar(
        select(Receipt).where(Receipt.id == receipt_id, Receipt.family_id == family_id)
    )
    if receipt is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Receipt not found")
    return receipt


@router.get("/{receipt_id}", response_model=ReceiptResponse)
async def get_receipt(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Receipt:
    return await _get_receipt_or_404(family_id, receipt_id, session)


@router.get("/{receipt_id}/image")
async def get_receipt_image(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    receipt = await _get_receipt_or_404(family_id, receipt_id, session)
    storage = get_receipt_storage()
    content = await run_in_threadpool(storage.get, receipt.storage_key)
    return Response(content=content, media_type=receipt.content_type)


@router.delete("/{receipt_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_receipt(
    family_id: uuid.UUID,
    receipt_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    receipt = await _get_receipt_or_404(family_id, receipt_id, session)
    require_owner_admin_or_creator(membership, receipt.uploaded_by_user_id)
    storage = get_receipt_storage()
    await run_in_threadpool(storage.delete, receipt.storage_key)
    await session.delete(receipt)
    await session.commit()
