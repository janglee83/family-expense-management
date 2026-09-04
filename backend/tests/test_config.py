import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_settings_loads_from_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@localhost:5432/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")
    get_settings.cache_clear()

    settings = get_settings()

    assert settings.database_url == "postgresql+psycopg://u:p@localhost:5432/db"
    assert settings.redis_url == "redis://localhost:6379/0"
    assert settings.env == "development"
    assert "http://localhost:5173" in settings.cors_origins
    assert "*" not in settings.cors_origins


def test_settings_raises_when_database_url_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/0")

    with pytest.raises(ValidationError):
        Settings(_env_file=None)  # type: ignore[call-arg]


def test_settings_rejects_wildcard_cors_origin() -> None:
    with pytest.raises(ValidationError):
        Settings(  # type: ignore[call-arg]
            _env_file=None,
            database_url="postgresql+psycopg://u:p@localhost:5432/db",
            redis_url="redis://localhost:6379/0",
            jwt_secret_key="a" * 32,
            cors_origins=["*"],
        )


def test_settings_rejects_placeholder_jwt_secret_in_production() -> None:
    with pytest.raises(ValidationError):
        Settings(  # type: ignore[call-arg]
            _env_file=None,
            env="production",
            database_url="postgresql+psycopg://u:p@localhost:5432/db",
            redis_url="redis://localhost:6379/0",
            jwt_secret_key="change-this-to-a-random-secret-in-real-deployments",
        )


def test_settings_accepts_real_jwt_secret_in_production() -> None:
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        env="production",
        database_url="postgresql+psycopg://u:p@localhost:5432/db",
        redis_url="redis://localhost:6379/0",
        jwt_secret_key="a" * 32,
    )

    assert settings.env == "production"


def test_settings_allows_placeholder_jwt_secret_in_development() -> None:
    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        database_url="postgresql+psycopg://u:p@localhost:5432/db",
        redis_url="redis://localhost:6379/0",
        jwt_secret_key="change-this-to-a-random-secret-in-real-deployments",
    )

    assert settings.env == "development"
