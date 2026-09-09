from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Response, UploadFile, status
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_family_membership
from app.core.api_errors import raise_api_error
from app.core.notifications import queue_family_notification
from app.core.permissions import require_owner_admin_or_creator
from app.db.session import get_session
from app.db.transaction import locked_write
from app.models.category import Category
from app.models.expense import Expense
from app.models.family_member import FamilyMember
from app.models.undo_action import UndoAction
from app.models.user import User
from app.schemas.data_ops import (
    BackupExportResponse,
    ExpenseExportResponse,
    ExpenseExportRow,
    ExpenseImportCommitRequest,
    ExpenseImportCommitResponse,
    ExpenseImportIssue,
    ExpenseImportPreviewResponse,
    ExpenseImportPreviewRow,
    UndoDeleteResponse,
    UndoRestoreResponse,
)
from app.services.import_export import (
    build_expense_dedupe_key,
    build_expenses_csv_rows,
    parse_expense_import_csv,
)

router = APIRouter()

UNDO_TTL_MINUTES = 15
ENTITY_TYPE_EXPENSE = "expense"


def _to_export_row(expense: Expense) -> ExpenseExportRow:
    return ExpenseExportRow(
        id=expense.id,
        family_id=expense.family_id,
        payer_user_id=expense.payer_user_id,
        created_by_user_id=expense.created_by_user_id,
        category_id=expense.category_id,
        amount=expense.amount,
        is_shared=expense.is_shared,
        description=expense.description,
        expense_date=expense.expense_date,
        created_at=expense.created_at,
    )


def _to_dedupe_key_for_expense(expense: Expense) -> str:
    return build_expense_dedupe_key(
        payer_user_id=expense.payer_user_id,
        category_id=expense.category_id,
        amount=expense.amount,
        is_shared=expense.is_shared,
        description=expense.description,
        expense_date=expense.expense_date,
    )


async def _get_expense_or_404(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    session: AsyncSession,
) -> Expense:
    expense = await session.scalar(
        select(Expense).where(Expense.id == expense_id, Expense.family_id == family_id)
    )
    if expense is None:
        raise_api_error(
            status_code=status.HTTP_404_NOT_FOUND,
            code="EXPENSE_NOT_FOUND",
            message="Expense not found",
        )
    return expense


async def _build_existing_expense_dedupe_keys(
    family_id: uuid.UUID,
    session: AsyncSession,
) -> set[str]:
    rows = await session.scalars(select(Expense).where(Expense.family_id == family_id))
    return {_to_dedupe_key_for_expense(item) for item in rows.all()}


def _serialize_expense_payload(expense: Expense) -> dict[str, Any]:
    return {
        "id": str(expense.id),
        "family_id": str(expense.family_id),
        "payer_user_id": str(expense.payer_user_id),
        "created_by_user_id": str(expense.created_by_user_id),
        "category_id": str(expense.category_id),
        "amount": expense.amount,
        "is_shared": expense.is_shared,
        "description": expense.description,
        "expense_date": expense.expense_date.isoformat(),
    }


@router.get("/exports/expenses")
async def export_expenses_json(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExpenseExportResponse:
    rows = await session.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    return ExpenseExportResponse(items=[_to_export_row(item) for item in rows.all()])


@router.get("/exports/expenses.csv")
async def export_expenses_csv(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Response:
    rows = await session.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    payload = [row.model_dump(mode="json") for row in [_to_export_row(item) for item in rows.all()]]
    csv_content = build_expenses_csv_rows(payload)

    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="family-{family_id}-expenses.csv"'
        },
    )


@router.get("/exports/backup")
async def export_backup(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> BackupExportResponse:
    rows = await session.scalars(
        select(Expense)
        .where(Expense.family_id == family_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
    )
    return BackupExportResponse(expenses=[_to_export_row(item) for item in rows.all()])


@router.post("/imports/expenses/preview")
async def preview_expense_import(
    family_id: uuid.UUID,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    session: Annotated[AsyncSession, Depends(get_session)],
    file: Annotated[UploadFile, File(...)],
) -> ExpenseImportPreviewResponse:
    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        raise_api_error(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            code="IMPORT_FILE_ENCODING_INVALID",
            message="CSV must be UTF-8 encoded",
        )

    parsed = parse_expense_import_csv(content)
    existing_keys = await _build_existing_expense_dedupe_keys(family_id, session)

    preview_rows: list[ExpenseImportPreviewRow] = []
    duplicate_rows = 0
    for row in parsed.rows:
        dedupe_key = build_expense_dedupe_key(
            payer_user_id=row.payer_user_id,
            category_id=row.category_id,
            amount=row.amount,
            is_shared=row.is_shared,
            description=row.description,
            expense_date=row.expense_date,
        )
        is_duplicate = dedupe_key in existing_keys
        if is_duplicate:
            duplicate_rows += 1
        preview_rows.append(
            ExpenseImportPreviewRow(
                payer_user_id=row.payer_user_id,
                category_id=row.category_id,
                amount=row.amount,
                is_shared=row.is_shared,
                description=row.description,
                expense_date=row.expense_date,
                dedupe_key=dedupe_key,
                is_duplicate=is_duplicate,
            )
        )

    return ExpenseImportPreviewResponse(
        total_rows=len(parsed.rows) + len(parsed.issues),
        valid_rows=len(parsed.rows),
        invalid_rows=len(parsed.issues),
        duplicate_rows=duplicate_rows,
        rows=preview_rows,
        issues=[
            ExpenseImportIssue(row_number=item.row_number, message=item.message)
            for item in parsed.issues
        ],
    )


@router.post("/imports/expenses/commit")
async def commit_expense_import(
    family_id: uuid.UUID,
    payload: ExpenseImportCommitRequest,
    _membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> ExpenseImportCommitResponse:
    if not payload.rows:
        return ExpenseImportCommitResponse(created_count=0, skipped_duplicate_count=0)

    async with locked_write(
        session,
        tables=("expenses", "categories", "family_members", "notifications"),
    ):
        existing_keys = await _build_existing_expense_dedupe_keys(family_id, session)

        member_ids = set(
            (
                await session.scalars(
                    select(FamilyMember.user_id).where(FamilyMember.family_id == family_id)
                )
            ).all()
        )
        category_ids = set(
            (
                await session.scalars(
                    select(Category.id).where(
                        or_(Category.family_id == family_id, Category.family_id.is_(None))
                    )
                )
            ).all()
        )

        created_count = 0
        skipped_duplicate_count = 0

        for row in payload.rows:
            if row.payer_user_id not in member_ids:
                raise_api_error(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    code="IMPORT_PAYER_NOT_IN_FAMILY",
                    message="payer_user_id is not a member of this family",
                )
            if row.category_id not in category_ids:
                raise_api_error(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    code="IMPORT_CATEGORY_INVALID",
                    message="category_id is not a valid category for this family",
                )

            dedupe_key = build_expense_dedupe_key(
                payer_user_id=row.payer_user_id,
                category_id=row.category_id,
                amount=row.amount,
                is_shared=row.is_shared,
                description=row.description,
                expense_date=row.expense_date,
            )
            if payload.skip_duplicates and dedupe_key in existing_keys:
                skipped_duplicate_count += 1
                continue

            session.add(
                Expense(
                    family_id=family_id,
                    payer_user_id=row.payer_user_id,
                    created_by_user_id=user.id,
                    category_id=row.category_id,
                    amount=row.amount,
                    is_shared=row.is_shared,
                    description=row.description,
                    expense_date=row.expense_date,
                )
            )
            existing_keys.add(dedupe_key)
            created_count += 1

        if created_count > 0:
            await queue_family_notification(
                session,
                family_id,
                message=(
                    f"{user.display_name} imported {created_count} expenses "
                    "from CSV."
                ),
                actor_user_id=user.id,
            )

    return ExpenseImportCommitResponse(
        created_count=created_count,
        skipped_duplicate_count=skipped_duplicate_count,
    )


@router.post("/undo/expenses/{expense_id}")
async def delete_expense_with_undo(
    family_id: uuid.UUID,
    expense_id: uuid.UUID,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UndoDeleteResponse:
    async with locked_write(session, tables=("expenses", "undo_actions", "notifications")):
        expense = await _get_expense_or_404(family_id, expense_id, session)
        require_owner_admin_or_creator(membership, expense.created_by_user_id)

        undo_token = uuid.uuid4().hex
        expires_at = datetime.now(UTC) + timedelta(minutes=UNDO_TTL_MINUTES)

        session.add(
            UndoAction(
                family_id=family_id,
                created_by_user_id=user.id,
                entity_type=ENTITY_TYPE_EXPENSE,
                entity_id=expense.id,
                undo_token=undo_token,
                payload_json=_serialize_expense_payload(expense),
                expires_at=expires_at,
            )
        )
        await session.delete(expense)

        await queue_family_notification(
            session,
            family_id,
            message=f"{user.display_name} deleted an expense with undo enabled.",
            actor_user_id=user.id,
        )

    return UndoDeleteResponse(
        undo_token=undo_token,
        expires_at=expires_at,
        deleted_expense_id=expense_id,
    )


@router.post("/undo/{undo_token}/restore")
async def restore_undo_action(
    family_id: uuid.UUID,
    undo_token: str,
    membership: Annotated[FamilyMember, Depends(get_family_membership)],
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> UndoRestoreResponse:
    _ = user
    now = datetime.now(UTC)

    async with locked_write(session, tables=("undo_actions", "expenses", "notifications")):
        undo_action = await session.scalar(
            select(UndoAction)
            .where(UndoAction.family_id == family_id, UndoAction.undo_token == undo_token)
            .with_for_update()
        )
        if undo_action is None:
            raise_api_error(
                status_code=status.HTTP_404_NOT_FOUND,
                code="UNDO_ACTION_NOT_FOUND",
                message="Undo action not found",
            )

        require_owner_admin_or_creator(membership, undo_action.created_by_user_id)

        if undo_action.used_at is not None:
            raise_api_error(
                status_code=status.HTTP_409_CONFLICT,
                code="UNDO_ACTION_ALREADY_USED",
                message="Undo action was already used",
            )
        if undo_action.expires_at < now:
            raise_api_error(
                status_code=status.HTTP_410_GONE,
                code="UNDO_ACTION_EXPIRED",
                message="Undo action has expired",
            )
        if undo_action.entity_type != ENTITY_TYPE_EXPENSE:
            raise_api_error(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                code="UNDO_ACTION_ENTITY_TYPE_UNSUPPORTED",
                message="Only expense undo is supported",
            )

        payload = undo_action.payload_json
        expense_id = uuid.UUID(str(payload["id"]))

        existing = await session.scalar(
            select(Expense).where(Expense.id == expense_id, Expense.family_id == family_id)
        )
        if existing is not None:
            raise_api_error(
                status_code=status.HTTP_409_CONFLICT,
                code="UNDO_EXPENSE_ALREADY_EXISTS",
                message="Expense already exists",
            )

        restored = Expense(
            id=expense_id,
            family_id=uuid.UUID(str(payload["family_id"])),
            payer_user_id=uuid.UUID(str(payload["payer_user_id"])),
            created_by_user_id=uuid.UUID(str(payload["created_by_user_id"])),
            category_id=uuid.UUID(str(payload["category_id"])),
            amount=int(str(payload["amount"])),
            is_shared=bool(payload["is_shared"]),
            description=(
                str(payload["description"]) if payload.get("description") is not None else None
            ),
            expense_date=datetime.fromisoformat(str(payload["expense_date"])).date(),
        )
        session.add(restored)

        undo_action.used_at = now

        await queue_family_notification(
            session,
            family_id,
            message="A deleted expense was restored via undo.",
            actor_user_id=undo_action.created_by_user_id,
        )

    return UndoRestoreResponse(restored_expense_id=expense_id)
