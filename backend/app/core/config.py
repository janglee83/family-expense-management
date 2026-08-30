from functools import lru_cache

from pydantic import ValidationInfo, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_PLACEHOLDER_JWT_SECRET = "change-this-to-a-random-secret-in-real-deployments"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"), env_file_encoding="utf-8", extra="ignore"
    )

    env: str = "development"
    database_url: str
    redis_url: str
    cors_origins: list[str] = ["http://localhost:5173"]
    jwt_secret_key: str
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    minio_endpoint_url: str
    minio_access_key: str
    minio_secret_key: str
    minio_bucket_name: str = "receipts"

    @field_validator("cors_origins")
    @classmethod
    def _reject_wildcard_cors(cls, value: list[str]) -> list[str]:
        if "*" in value:
            raise ValueError(
                "cors_origins must not contain '*' — CORS is paired with allow_credentials=True"
            )
        return value

    @field_validator("jwt_secret_key")
    @classmethod
    def _reject_placeholder_secret_in_production(cls, value: str, info: ValidationInfo) -> str:
        env = info.data.get("env", "development")
        if env == "production" and (len(value) < 32 or value == _PLACEHOLDER_JWT_SECRET):
            raise ValueError(
                "jwt_secret_key must be a real random secret (>=32 chars) in production"
            )
        return value


@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
