from sqlalchemy.ext.asyncio import AsyncEngine

from app.db.session import get_engine, get_session_factory


def test_get_engine_returns_async_engine_with_configured_url() -> None:
    engine = get_engine()

    assert isinstance(engine, AsyncEngine)
    assert engine.url.drivername == "postgresql+psycopg"


def test_get_engine_is_cached() -> None:
    assert get_engine() is get_engine()


def test_get_session_factory_is_bound_to_the_engine() -> None:
    factory = get_session_factory()

    assert factory.kw["bind"] is get_engine()
