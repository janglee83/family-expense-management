import os


def pytest_configure() -> None:
    os.environ.setdefault(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/family_expense_test",
    )
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
    os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-only")
    os.environ.setdefault("MINIO_ENDPOINT_URL", "http://localhost:9000")
    os.environ.setdefault("MINIO_ACCESS_KEY", "minioadmin")
    os.environ.setdefault("MINIO_SECRET_KEY", "minioadmin")
    os.environ.setdefault("MINIO_BUCKET_NAME", "receipts-test")
