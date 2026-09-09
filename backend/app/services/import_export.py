from __future__ import annotations

import csv
import io
import uuid
from dataclasses import dataclass
from datetime import date


@dataclass(frozen=True)
class ParsedExpenseRow:
    payer_user_id: uuid.UUID
    category_id: uuid.UUID
    amount: int
    is_shared: bool
    description: str | None
    expense_date: date


@dataclass(frozen=True)
class ParseIssue:
    row_number: int
    message: str


@dataclass(frozen=True)
class ExpenseParseResult:
    rows: list[ParsedExpenseRow]
    issues: list[ParseIssue]


def _parse_bool(value: str) -> bool:
    normalized = value.strip().lower()
    if normalized in {"1", "true", "yes", "y"}:
        return True
    if normalized in {"0", "false", "no", "n"}:
        return False
    raise ValueError("is_shared must be one of: true,false,1,0,yes,no")


def build_expense_dedupe_key(
    *,
    payer_user_id: uuid.UUID,
    category_id: uuid.UUID,
    amount: int,
    is_shared: bool,
    description: str | None,
    expense_date: date,
) -> str:
    normalized_description = (description or "").strip().lower()
    return "|".join(
        [
            str(payer_user_id),
            str(category_id),
            str(amount),
            "1" if is_shared else "0",
            expense_date.isoformat(),
            normalized_description,
        ]
    )


def parse_expense_import_csv(content: str) -> ExpenseParseResult:
    reader = csv.DictReader(io.StringIO(content))
    required_columns = {
        "payer_user_id",
        "category_id",
        "amount",
        "is_shared",
        "description",
        "expense_date",
    }

    if reader.fieldnames is None:
        return ExpenseParseResult(rows=[], issues=[ParseIssue(row_number=1, message="CSV header is missing")])

    missing = sorted(required_columns - set(reader.fieldnames))
    if missing:
        return ExpenseParseResult(
            rows=[],
            issues=[
                ParseIssue(
                    row_number=1,
                    message=f"Missing required columns: {', '.join(missing)}",
                )
            ],
        )

    rows: list[ParsedExpenseRow] = []
    issues: list[ParseIssue] = []

    for idx, raw in enumerate(reader, start=2):
        try:
            payer_user_id = uuid.UUID((raw.get("payer_user_id") or "").strip())
            category_id = uuid.UUID((raw.get("category_id") or "").strip())
            amount = int((raw.get("amount") or "").strip())
            if amount <= 0:
                raise ValueError("amount must be > 0")
            is_shared = _parse_bool((raw.get("is_shared") or "").strip())
            description_raw = (raw.get("description") or "").strip()
            description = description_raw or None
            expense_date = date.fromisoformat((raw.get("expense_date") or "").strip())
        except ValueError as exc:
            issues.append(ParseIssue(row_number=idx, message=str(exc)))
            continue

        rows.append(
            ParsedExpenseRow(
                payer_user_id=payer_user_id,
                category_id=category_id,
                amount=amount,
                is_shared=is_shared,
                description=description,
                expense_date=expense_date,
            )
        )

    return ExpenseParseResult(rows=rows, issues=issues)


def build_expenses_csv_rows(rows: list[dict[str, object]]) -> str:
    if not rows:
        return (
            "id,family_id,payer_user_id,created_by_user_id,category_id,amount,"
            "is_shared,description,expense_date,created_at\n"
        )

    fieldnames = [
        "id",
        "family_id",
        "payer_user_id",
        "created_by_user_id",
        "category_id",
        "amount",
        "is_shared",
        "description",
        "expense_date",
        "created_at",
    ]
    buffer = io.StringIO()
    writer = csv.DictWriter(buffer, fieldnames=fieldnames)
    writer.writeheader()
    for row in rows:
        writer.writerow(row)
    return buffer.getvalue()
