from __future__ import annotations

import re
from collections.abc import AsyncIterator, Iterable
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

_TABLE_NAME_PATTERN = re.compile(r"^[A-Za-z_]\w*$")


def _normalize_tables(tables: Iterable[str]) -> list[str]:
    seen: set[str] = set()
    ordered: list[str] = []

    for table_name in tables:
        normalized = table_name.strip()
        if not normalized or normalized in seen:
            continue
        if _TABLE_NAME_PATTERN.fullmatch(normalized) is None:
            msg = f"Invalid table name for LOCK TABLE: {table_name}"
            raise ValueError(msg)
        seen.add(normalized)
        ordered.append(normalized)

    if not ordered:
        raise ValueError("At least one table is required for LOCK TABLE")

    return ordered


@asynccontextmanager
async def locked_write(session: AsyncSession, *, tables: Iterable[str]) -> AsyncIterator[None]:
    ordered_tables = _normalize_tables(tables)

    if not session.in_transaction():
        await session.begin()

    lock_targets = ", ".join(f'"{name}"' for name in ordered_tables)
    await session.execute(text(f"LOCK TABLE {lock_targets} IN ROW EXCLUSIVE MODE"))

    try:
        yield
        await session.commit()
    except Exception:
        if session.in_transaction():
            await session.rollback()
        raise
