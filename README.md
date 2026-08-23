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
uv run alembic upgrade head
uv run python scripts/export_openapi.py   # regenerate openapi/openapi.json
```

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
