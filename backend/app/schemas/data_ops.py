from __future__ import annotations

import uuid
from datetime import date, datetime
from enum import StrEnum

from pydantic import BaseModel, Field


class ExportFormat(StrEnum):
    CSV = "csv"
    JSON = "json"


class ExpenseExportRow(BaseModel):
    id: uuid.UUID
    family_id: uuid.UUID
    payer_user_id: uuid.UUID
    created_by_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int
    is_shared: bool
    description: str | None
    expense_date: date
    created_at: datetime


class ExpenseExportResponse(BaseModel):
    items: list[ExpenseExportRow]


class ExpenseImportRowInput(BaseModel):
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int = Field(gt=0, le=2_147_483_647)
    is_shared: bool
    description: str | None = Field(default=None, max_length=500)
    expense_date: date


class ExpenseImportIssue(BaseModel):
    row_number: int
    message: str


class ExpenseImportPreviewRow(ExpenseImportRowInput):
    dedupe_key: str
    is_duplicate: bool


class ExpenseImportPreviewResponse(BaseModel):
    total_rows: int
    valid_rows: int
    invalid_rows: int
    duplicate_rows: int
    rows: list[ExpenseImportPreviewRow]
    issues: list[ExpenseImportIssue]


class ExpenseImportCommitRequest(BaseModel):
    rows: list[ExpenseImportRowInput] = Field(default_factory=list, max_length=5000)
    skip_duplicates: bool = True


class ExpenseImportCommitResponse(BaseModel):
    created_count: int
    skipped_duplicate_count: int


class UndoDeleteResponse(BaseModel):
    undo_token: str
    expires_at: datetime
    deleted_expense_id: uuid.UUID


class UndoRestoreResponse(BaseModel):
    restored_expense_id: uuid.UUID


class BackupExportResponse(BaseModel):
    expenses: list[ExpenseExportRow]
