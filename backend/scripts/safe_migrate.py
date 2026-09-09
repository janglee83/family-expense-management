from __future__ import annotations

import argparse
import io
import os
import re
import subprocess
from contextlib import redirect_stdout
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path

from alembic import command
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Connection
from sqlalchemy.engine.url import URL, make_url

from app.core.config import get_settings

MIGRATION_LOCK_ID = 84_321_017

_DESTRUCTIVE_RULES: tuple[tuple[str, re.Pattern[str]], ...] = (
    ("DROP_TABLE", re.compile(r"\bDROP\s+TABLE\b")),
    ("DROP_COLUMN", re.compile(r"\bDROP\s+COLUMN\b")),
    ("TRUNCATE", re.compile(r"\bTRUNCATE(?:\s+TABLE)?\b")),
    (
        "DELETE_ROWS",
        re.compile(r"\bDELETE\s+FROM\s+(?!\"?ALEMBIC_VERSION\"?\b)"),
    ),
)


@dataclass(frozen=True)
class DestructiveFinding:
    rule: str
    line_number: int
    statement: str


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "y", "on"}


def _normalize_database_url(raw_url: str) -> URL:
    url = make_url(raw_url)
    if url.get_backend_name() != "postgresql":
        raise RuntimeError("safe_migrate currently supports PostgreSQL only")
    if url.get_driver_name() != "psycopg":
        return url.set(drivername="postgresql+psycopg")
    return url


def _build_alembic_config(database_url: URL) -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url.render_as_string(hide_password=False))
    return config


def _get_current_revision(connection: Connection) -> str | None:
    context = MigrationContext.configure(connection)
    return context.get_current_revision()


def _resolve_target_revision(script: ScriptDirectory, revision: str) -> str:
    if revision != "head":
        return revision

    heads = script.get_heads()
    if len(heads) != 1:
        raise RuntimeError(
            "Multiple Alembic heads found. Merge heads before running safe migration."
        )
    return heads[0]


def render_upgrade_sql(config: Config, revision_range: str) -> str:
    output_buffer = io.StringIO()
    with redirect_stdout(output_buffer):
        command.upgrade(config, revision_range, sql=True)
    return output_buffer.getvalue()


def detect_destructive_sql(sql_text: str) -> list[DestructiveFinding]:
    findings: list[DestructiveFinding] = []

    for line_number, line in enumerate(sql_text.splitlines(), start=1):
        normalized = " ".join(line.strip().upper().split())
        if not normalized or normalized.startswith("--"):
            continue
        if "ALEMBIC_VERSION" in normalized:
            continue

        for rule, pattern in _DESTRUCTIVE_RULES:
            if pattern.search(normalized):
                findings.append(
                    DestructiveFinding(rule=rule, line_number=line_number, statement=line.strip())
                )
                break

    return findings


def _create_backup(
    database_url: URL, backup_dir: Path, from_revision: str, to_revision: str
) -> Path:
    backup_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    backup_path = backup_dir / f"pre_migrate_{from_revision}_to_{to_revision}_{timestamp}.dump"

    dump_url = database_url.set(drivername="postgresql", password=None)
    dump_target = dump_url.render_as_string(hide_password=False)
    command_env = os.environ.copy()
    if database_url.password is not None:
        command_env["PGPASSWORD"] = database_url.password

    command_args = ["pg_dump", "--format=custom", "--file", str(backup_path), dump_target]

    try:
        subprocess.run(
            command_args,
            check=True,
            env=command_env,
            capture_output=True,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("pg_dump is not installed; cannot create safety backup") from exc
    except subprocess.CalledProcessError as exc:
        stderr = exc.stderr.strip() if exc.stderr else "unknown error"
        raise RuntimeError(f"pg_dump failed: {stderr}") from exc

    return backup_path


def _print_findings(findings: list[DestructiveFinding]) -> None:
    print("Destructive migration SQL detected:")
    for finding in findings:
        print(f"- line {finding.line_number}: [{finding.rule}] {finding.statement}")


def _acquire_advisory_lock(connection: Connection) -> None:
    connection.execute(text("SELECT pg_advisory_lock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})


def _release_advisory_lock(connection: Connection) -> None:
    connection.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": MIGRATION_LOCK_ID})


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Run Alembic migrations with data-loss guards"
    )
    parser.add_argument(
        "--revision", default="head", help="Alembic target revision (default: head)"
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Run preflight checks only; do not apply migrations",
    )
    parser.add_argument(
        "--allow-destructive",
        action="store_true",
        help="Allow destructive SQL (DROP/TRUNCATE/DELETE) after explicit confirmation",
    )
    parser.add_argument(
        "--skip-backup",
        action="store_true",
        help="Skip pre-migration pg_dump backup",
    )
    parser.add_argument(
        "--backup-dir",
        default=os.getenv("MIGRATION_BACKUP_DIR", "../backups/db"),
        help="Directory for pre-migration backup dumps",
    )
    return parser.parse_args()


def main() -> int:
    args = _parse_args()
    settings = get_settings()
    database_url = _normalize_database_url(settings.database_url)

    alembic_config = _build_alembic_config(database_url)
    script = ScriptDirectory.from_config(alembic_config)
    target_revision = _resolve_target_revision(script, args.revision)

    engine = create_engine(database_url.render_as_string(hide_password=False), future=True)

    with engine.connect() as connection:
        current_revision = _get_current_revision(connection)

    if current_revision == target_revision:
        print(f"No migration needed: database already at {target_revision}")
        return 0

    revision_range = f"{current_revision or 'base'}:{target_revision}"
    sql_preview = render_upgrade_sql(alembic_config, revision_range)
    destructive_findings = detect_destructive_sql(sql_preview)

    allow_destructive = args.allow_destructive or _is_truthy(
        os.getenv("ALLOW_DESTRUCTIVE_MIGRATIONS")
    )
    if destructive_findings and not allow_destructive:
        _print_findings(destructive_findings)
        print(
            "Blocked migration. Re-run with --allow-destructive "
            "(or ALLOW_DESTRUCTIVE_MIGRATIONS=1) "
            "after validating an explicit backup/restore plan."
        )
        return 2

    if args.check_only:
        if destructive_findings:
            _print_findings(destructive_findings)
        print("Migration preflight check completed")
        return 0

    from_revision = current_revision or "base"
    if not args.skip_backup:
        backup_path = _create_backup(
            database_url=database_url,
            backup_dir=Path(args.backup_dir),
            from_revision=from_revision,
            to_revision=target_revision,
        )
        print(f"Backup created: {backup_path}")

    with engine.connect() as connection:
        _acquire_advisory_lock(connection)
        try:
            alembic_config.attributes["connection"] = connection
            command.upgrade(alembic_config, target_revision)
            # Alembic's "shared connection" recipe leaves commit to the caller:
            # env.py's run_migrations_online() only calls context.begin_transaction()
            # around the upgrade, it never commits. Without this, the engine
            # Connection (SQLAlchemy 2.0, non-autocommit) silently rolls back
            # every DDL statement when the `with` block below closes it.
            connection.commit()
        finally:
            _release_advisory_lock(connection)

    print(f"Migration completed successfully: {from_revision} -> {target_revision}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
