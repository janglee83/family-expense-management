import json

import pytest
import structlog

from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger


def test_get_logger_returns_bound_logger_and_does_not_raise(
    capsys: object,
) -> None:
    configure_logging()
    logger = get_logger("test.logger")

    logger.info("hello", key="value")

    captured = capsys.readouterr()  # type: ignore[attr-defined]
    assert "hello" in captured.out


def test_configure_logging_is_idempotent() -> None:
    configure_logging()
    configure_logging()
    assert structlog.is_configured()


def test_configure_logging_uses_json_renderer_in_production(
    capsys: object,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Set env to production before loading settings
    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("DATABASE_URL", "postgresql://user:pass@localhost/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()

    configure_logging()
    logger = get_logger("test.logger")

    logger.info("production_test", test_key="test_value")

    captured = capsys.readouterr()  # type: ignore[attr-defined]
    # Verify JSON output by parsing it
    output_lines = captured.out.strip().split("\n")
    parsed = json.loads(output_lines[0])
    assert parsed["event"] == "production_test"
    assert parsed["test_key"] == "test_value"

    # Clean up cache for other tests
    get_settings.cache_clear()
