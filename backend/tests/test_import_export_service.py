from __future__ import annotations

import uuid
from datetime import date

from app.services.import_export import (
    build_expense_dedupe_key,
    build_expenses_csv_rows,
    parse_expense_import_csv,
)


def test_parse_expense_import_csv_parses_valid_rows() -> None:
    content = (
        "payer_user_id,category_id,amount,is_shared,description,expense_date\n"
        f"{uuid.uuid4()},{uuid.uuid4()},1200,true,Groceries,2026-09-01\n"
    )

    result = parse_expense_import_csv(content)

    assert len(result.issues) == 0
    assert len(result.rows) == 1
    assert result.rows[0].amount == 1200
    assert result.rows[0].is_shared is True


def test_parse_expense_import_csv_returns_issue_for_bad_amount() -> None:
    content = (
        "payer_user_id,category_id,amount,is_shared,description,expense_date\n"
        f"{uuid.uuid4()},{uuid.uuid4()},-1,true,Groceries,2026-09-01\n"
    )

    result = parse_expense_import_csv(content)

    assert len(result.rows) == 0
    assert len(result.issues) == 1


def test_build_expense_dedupe_key_is_stable() -> None:
    payer_id = uuid.uuid4()
    category_id = uuid.uuid4()

    key_a = build_expense_dedupe_key(
        payer_user_id=payer_id,
        category_id=category_id,
        amount=5000,
        is_shared=False,
        description=" Taxi ",
        expense_date=date(2026, 9, 4),
    )
    key_b = build_expense_dedupe_key(
        payer_user_id=payer_id,
        category_id=category_id,
        amount=5000,
        is_shared=False,
        description="taxi",
        expense_date=date(2026, 9, 4),
    )

    assert key_a == key_b


def test_build_expenses_csv_rows_writes_header_on_empty_rows() -> None:
    csv_payload = build_expenses_csv_rows([])
    assert csv_payload.startswith("id,family_id,payer_user_id")


def test_build_expenses_csv_rows_writes_values() -> None:
    csv_payload = build_expenses_csv_rows(
        [
            {
                "id": str(uuid.uuid4()),
                "family_id": str(uuid.uuid4()),
                "payer_user_id": str(uuid.uuid4()),
                "created_by_user_id": str(uuid.uuid4()),
                "category_id": str(uuid.uuid4()),
                "amount": 4200,
                "is_shared": True,
                "description": "Dinner",
                "expense_date": "2026-09-04",
                "created_at": "2026-09-04T10:00:00Z",
            }
        ]
    )

    assert "Dinner" in csv_payload
    assert "4200" in csv_payload
