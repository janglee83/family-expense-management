import os
import uuid

import psycopg
import pytest
from sqlalchemy import create_engine, inspect
from sqlalchemy.engine.url import make_url

from app.core.config import get_settings
from scripts import safe_migrate
from scripts.safe_migrate import detect_destructive_sql


@pytest.mark.integration
def test_main_commits_the_migration_so_it_survives_connection_close(monkeypatch: pytest.MonkeyPatch) -> None:
    # Regression test: `main()` used to leave the migration's DDL uncommitted
    # on the connection it shares with Alembic (see the cookbook recipe for
    # sharing a connection — the caller, not env.py, owns the commit). A
    # SQLAlchemy 2.0 `engine.connect()` Connection rolls back on close by
    # default, so the script printed "Migration completed successfully" while
    # silently discarding every table it just created. Verifying through a
    # brand-new connection (rather than the one main() used) is what would
    # have caught that: the same connection would still see its own
    # not-yet-rolled-back writes.
    #
    # Admin URL is derived from the ambient DATABASE_URL (host/user/password)
    # rather than hardcoded, so this works both on the host (localhost) and
    # inside the backend container (hostname "postgres").
    base_url = make_url(os.environ["DATABASE_URL"]).set(drivername="postgresql")
    admin_url = base_url.set(database="postgres").render_as_string(hide_password=False)
    db_name = f"safe_migrate_regression_{uuid.uuid4().hex[:8]}"

    with psycopg.connect(admin_url, autocommit=True) as admin_conn:
        admin_conn.execute(f'CREATE DATABASE "{db_name}"')

    try:
        test_db_url = base_url.set(
            drivername="postgresql+psycopg", database=db_name
        ).render_as_string(hide_password=False)
        monkeypatch.setenv("DATABASE_URL", test_db_url)
        get_settings.cache_clear()
        monkeypatch.setattr(
            "sys.argv", ["safe_migrate.py", "--skip-backup", "--revision", "0002"]
        )

        exit_code = safe_migrate.main()
        assert exit_code == 0

        verify_engine = create_engine(test_db_url, future=True)
        try:
            with verify_engine.connect() as verify_connection:
                table_names = set(inspect(verify_connection).get_table_names())
        finally:
            verify_engine.dispose()

        assert "users" in table_names
        assert "alembic_version" in table_names
    finally:
        get_settings.cache_clear()
        with psycopg.connect(admin_url, autocommit=True) as admin_conn:
            admin_conn.execute(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')


def test_detect_destructive_sql_flags_drop_table() -> None:
    sql = """
    CREATE TABLE demo(id INTEGER);
    DROP TABLE users;
    """

    findings = detect_destructive_sql(sql)

    assert len(findings) == 1
    assert findings[0].rule == "DROP_TABLE"


def test_detect_destructive_sql_ignores_alembic_version_delete() -> None:
    sql = """
    DELETE FROM alembic_version WHERE version_num='abc';
    """

    findings = detect_destructive_sql(sql)

    assert findings == []


def test_detect_destructive_sql_flags_delete_on_business_table() -> None:
    sql = """
    DELETE FROM expenses WHERE id = 1;
    """

    findings = detect_destructive_sql(sql)

    assert len(findings) == 1
    assert findings[0].rule == "DELETE_ROWS"
