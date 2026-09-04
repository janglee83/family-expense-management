from __future__ import annotations

from datetime import date

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.api.v1.analytics import _resolve_window
from app.schemas.analytics import AnalyticsWindowParams


def test_analytics_window_params_rejects_inverted_range() -> None:
    start = date(2026, 9, 10)
    end = date(2026, 9, 1)
    with pytest.raises(ValidationError, match="end_date must be >= start_date"):
        AnalyticsWindowParams(start_date=start, end_date=end)


def test_resolve_window_uses_month_start_when_start_missing() -> None:
    start_date, end_date = _resolve_window(None, date(2026, 9, 18))
    assert start_date == date(2026, 9, 1)
    assert end_date == date(2026, 9, 18)


def test_resolve_window_raises_http_error_on_invalid_range() -> None:
    start = date(2026, 9, 30)
    end = date(2026, 9, 1)
    with pytest.raises(HTTPException) as exc_info:
        _resolve_window(start, end)

    assert exc_info.value.status_code == 422
    detail = exc_info.value.detail
    assert detail["code"] == "ANALYTICS_INVALID_DATE_RANGE"
