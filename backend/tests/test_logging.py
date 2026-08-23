import structlog

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
