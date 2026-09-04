# Family Expense Management

A multi-language (Vietnamese / Japanese) family expense management system:
receipt OCR, personal/shared expense classification, and settlement
calculation.

## Stack

- Backend: Python 3.12, FastAPI, SQLAlchemy 2.0 (async), Alembic, PostgreSQL, Celery/Redis
- Frontend: Vite, React, TypeScript, react-i18next
- See `docs/ARCHITECTURE.md` for the full rationale.

## Local development

```bash
cp .env.example .env
docker compose up -d
```

- Backend: http://localhost:8000 (docs at `/docs`)
- Frontend: http://localhost:5173

## Backend

```bash
cd backend
uv sync --extra dev
uv run pytest                  # unit tests only need `uv sync`
uv run pytest -m integration   # requires: docker compose up -d postgres redis
uv run python scripts/safe_migrate.py --check-only
uv run python scripts/safe_migrate.py
uv run python scripts/export_openapi.py   # regenerate openapi/openapi.json
```

`scripts/safe_migrate.py` adds deploy-time safety guards:

- renders migration SQL first and blocks destructive statements (`DROP TABLE`, `DROP COLUMN`, `TRUNCATE`, `DELETE FROM`) unless explicitly allowed
- creates a `pg_dump` backup before applying migrations
- acquires a PostgreSQL advisory lock to prevent concurrent migration runs

Useful flags/env:

- `--allow-destructive` or `ALLOW_DESTRUCTIVE_MIGRATIONS=1`
- `--skip-backup` (not recommended in production)
- `MIGRATION_BACKUP_DIR=...` to customize backup location

Host-side commands read `../.env` (the same file docker-compose uses) — copy
`.env.example` to `.env` at the repo root first if you haven't already. Note
`DATABASE_URL`'s `postgres`/`redis` hostnames only resolve inside Docker; for
host-side Postgres access use `docker compose exec` or a separate host-facing
`DATABASE_URL` override.

## Frontend

```bash
cd frontend
pnpm install
pnpm run dev
pnpm run test
pnpm run generate:api-types    # regenerate src/api/schema.gen.ts from openapi/openapi.json
```

## Documentation

- `docs/ARCHITECTURE.md` — system architecture and stack decisions
- `docs/PRODUCT_REQUIREMENTS.md` — product/domain requirements
- `docs/I18N.md` — i18n architecture and JA/VI terminology glossary
