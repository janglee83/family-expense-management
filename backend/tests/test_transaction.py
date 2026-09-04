from __future__ import annotations

from unittest.mock import AsyncMock, Mock

import pytest

from app.db.transaction import _normalize_tables, locked_write


@pytest.mark.parametrize(
    ("tables", "expected"),
    [
        (("users", " users ", "refresh_tokens", "users"), ["users", "refresh_tokens"]),
        (("families",), ["families"]),
    ],
)
def test_normalize_tables_deduplicates_and_preserves_order(
    tables: tuple[str, ...], expected: list[str]
) -> None:
    assert _normalize_tables(tables) == expected


@pytest.mark.parametrize(
    "tables",
    [
        tuple(),
        ("",),
        ("users;DROP TABLE users",),
        ('"users"',),
        ("users test",),
    ],
)
def test_normalize_tables_rejects_invalid_names(tables: tuple[str, ...]) -> None:
    with pytest.raises(ValueError):
        _normalize_tables(tables)


@pytest.mark.asyncio
async def test_locked_write_begins_locks_and_commits() -> None:
    session = Mock()
    session.in_transaction = Mock(return_value=False)
    session.begin = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    async with locked_write(session, tables=("users", "refresh_tokens")):
        pass

    session.begin.assert_awaited_once()
    session.execute.assert_awaited_once()
    lock_sql = str(session.execute.call_args.args[0])
    assert lock_sql == 'LOCK TABLE "users", "refresh_tokens" IN ROW EXCLUSIVE MODE'
    session.commit.assert_awaited_once()
    session.rollback.assert_not_awaited()


@pytest.mark.asyncio
async def test_locked_write_rolls_back_on_error() -> None:
    session = Mock()
    session.in_transaction = Mock(return_value=True)
    session.begin = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    with pytest.raises(RuntimeError, match="boom"):
        async with locked_write(session, tables=("users",)):
            raise RuntimeError("boom")

    session.begin.assert_not_awaited()
    session.execute.assert_awaited_once()
    session.commit.assert_not_awaited()
    session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_locked_write_does_not_begin_when_transaction_exists() -> None:
    session = Mock()
    session.in_transaction = Mock(return_value=True)
    session.begin = AsyncMock()
    session.execute = AsyncMock()
    session.commit = AsyncMock()
    session.rollback = AsyncMock()

    async with locked_write(session, tables=("notifications",)):
        pass

    session.begin.assert_not_awaited()
    session.execute.assert_awaited_once()
    session.commit.assert_awaited_once()
