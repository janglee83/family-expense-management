# Project Foundation — Design Spec

Date: 2026-08-23
Branch: `feature/project-foundation`
Phase: 1 of the product roadmap (see `PRODUCT_REQUIREMENTS.md` once written)

## Context

The repository (`gianglt-3498/family-expense-management`) was empty prior to this
branch — no code, no history, no default branch. This is the foundational
scaffolding phase: development environment, Docker, database connection,
configuration, logging, basic CI, and base i18n infrastructure. No domain
logic (auth, family, expense, OCR) is implemented in this phase.

## Goals

- A runnable local dev environment (`docker compose up`) with Postgres,
  Redis, backend API, and frontend dev server.
- A backend and frontend that can talk to each other end-to-end (proven by
  one trivial endpoint), with a standard, automated mechanism for sharing
  types between them.
- i18n wired in from the start (Vietnamese + Japanese), so no screen is ever
  built with hardcoded strings.
- CI that fails the build on lint/type/test errors in either backend or
  frontend.
- Documentation scaffolding so architecture decisions are recorded as they
  happen, not after the fact.

## Non-goals (explicitly deferred)

- Authentication (Phase 2).
- Any domain tables (family, expense, receipt, settlement) beyond the
  Alembic migration harness itself.
- The `ocr-worker` service and any Celery tasks (Phase 6) — Redis is
  provisioned now because the stack choice is already made, but nothing
  consumes it yet.
- End-to-end (browser) tests — nothing exists yet to click through.

## Decided stack

| Concern | Choice |
|---|---|
| Backend language/framework | Python + FastAPI |
| Backend package manager | uv |
| ORM / migrations | SQLAlchemy 2.0 (async) + Alembic |
| Database | PostgreSQL |
| Background jobs | Redis + Celery (infra only in this phase) |
| Frontend framework | Vite + React + TypeScript |
| Frontend package manager | pnpm |
| Frontend i18n | react-i18next |
| Repo layout | Plain-folder monorepo (no Nx/Turborepo) |
| CI | GitHub Actions |
| Backend↔frontend type sharing | FastAPI OpenAPI schema export → `openapi-typescript` codegen |

## Repository layout

```
/backend
  app/
    core/          config.py, logging.py
    db/            base.py, session.py
    api/v1/        routers (health, ping)
  alembic/
  scripts/
    export_openapi.py
  tests/
  pyproject.toml
  Dockerfile
/frontend
  src/
    api/           schema.gen.ts (generated, gitignored... see note below)
    i18n/           i18n.ts, locales/ja/common.json, locales/vi/common.json
    components/     LanguageSwitcher
    App.tsx, main.tsx
  package.json
  Dockerfile
/openapi/openapi.json      (generated artifact, committed so frontend codegen
                             doesn't require a running backend)
/docs
  ARCHITECTURE.md
  PRODUCT_REQUIREMENTS.md
  I18N.md
docker-compose.yml
.github/workflows/ci.yml
```

`frontend/src/api/schema.gen.ts` is committed (not gitignored) so a fresh
`pnpm install && pnpm build` works without needing to run codegen first;
CI regenerates it and diffs against the committed version to catch drift.

## Backend foundation

- `app/main.py`: FastAPI app factory, mounts `/api/v1` router, CORS
  configured for the frontend dev origin.
- `app/core/config.py`: `pydantic-settings`-based `Settings`, read from env
  (`.env` in dev, real env vars in prod). Missing required vars fail at
  startup, not at first use.
- `app/core/logging.py`: `structlog` — JSON renderer when `ENV=production`,
  console renderer otherwise.
- `app/db/session.py` / `app/db/base.py`: async SQLAlchemy engine + session
  factory + declarative base. No models yet beyond what Alembic needs to
  bootstrap.
- `alembic/`: initialized, one empty baseline revision, configured to read
  the DB URL from `Settings` rather than a hardcoded `alembic.ini` value.
- Endpoints:
  - `GET /health` — liveness/readiness check (checks DB connectivity).
  - `GET /api/v1/ping` — trivial JSON response, exists purely to prove the
    frontend can reach the backend through the OpenAPI-generated client.
- `scripts/export_openapi.py`: imports the FastAPI app and writes its
  OpenAPI schema to `../openapi/openapi.json` without starting a server.

## Frontend foundation

- Vite + React + TypeScript scaffold (`pnpm create vite`).
- `src/i18n/i18n.ts`: react-i18next setup, language persisted to
  `localStorage`, default language falls back to browser locale, restricted
  to `ja` | `vi`.
- `locales/ja/common.json`, `locales/vi/common.json`: seeded with real keys
  used by the scaffold itself (`app.title`, `common.loading`,
  `common.language`), not placeholder text — this is the first entry in the
  terminology glossary in `docs/I18N.md`.
- `LanguageSwitcher` component: the first real, working UI feature —
  toggles `ja`/`vi` and re-renders translated text.
- Home page: calls `GET /api/v1/ping` via the generated client and displays
  the translated result, proving the full chain (frontend → generated
  types → backend → DB-connected health check) works.
- `src/api/schema.gen.ts`: generated via
  `openapi-typescript ../openapi/openapi.json -o src/api/schema.gen.ts`,
  wired to an `pnpm run generate:api-types` script.
- ESLint + Prettier configured; `pnpm run lint`, `pnpm run typecheck`
  (`tsc --noEmit`), `pnpm run build`.

## Type-sharing mechanism (detail)

1. Backend `scripts/export_openapi.py` writes `openapi/openapi.json` at the
   repo root (single source of truth, versioned in git).
2. Frontend `pnpm run generate:api-types` runs `openapi-typescript` against
   that file, emitting `frontend/src/api/schema.gen.ts`.
3. CI backend job re-runs the export script and fails if the committed
   `openapi/openapi.json` differs from freshly generated output (schema
   drift = a backend change wasn't reflected).
4. CI frontend job re-runs the codegen and fails if `schema.gen.ts` differs
   from the freshly generated output (frontend types not regenerated after
   a schema change).

This makes "backend changed a response shape but frontend types weren't
updated" a CI failure, not a runtime bug discovered later.

## Docker Compose (dev)

Services: `postgres`, `redis`, `backend` (uvicorn --reload, mounts
`./backend`), `frontend` (vite dev server, mounts `./frontend`). Backend
depends on `postgres` and `redis` health checks. `.env.example` at repo
root documents required variables for both services.

## CI (GitHub Actions)

Two jobs, run in parallel on every push/PR:

- **backend**: `uv sync` → `ruff check` → `mypy` → `pytest` → export OpenAPI
  schema → diff against committed `openapi/openapi.json` (fail on drift) →
  upload schema as an artifact.
- **frontend**: `pnpm install` → `eslint` → `tsc --noEmit` → regenerate
  `schema.gen.ts` from the committed `openapi/openapi.json` → diff against
  committed file (fail on drift) → `vitest` → `vite build`.

## Testing plan

Backend (`pytest`):
- `GET /health` returns 200 and includes a DB-connectivity check.
- `GET /api/v1/ping` returns the expected payload.
- `Settings` raises a clear error when a required env var is missing.

Frontend (`vitest` + React Testing Library):
- `App` renders without crashing.
- Switching language via `LanguageSwitcher` changes rendered text for a
  known key.
- The ping call renders the translated success state (mocked network call).

## Documentation deliverables

- `README.md`: updated with real setup/run instructions (currently a
  placeholder from the bootstrap commit).
- `docs/ARCHITECTURE.md`: this stack decision, a system diagram, and the
  rationale for each major choice above.
- `docs/PRODUCT_REQUIREMENTS.md`: condensed version of the full product
  spec (family model, expense model, allocation, settlement, OCR pipeline)
  supplied by the user.
- `docs/I18N.md`: the Japanese/Vietnamese terminology glossary (家族 /
  Gia đình, 共同支出 / Chi tiêu chung, etc.) plus the i18n architecture rules
  (no hardcoded strings, stable semantic keys, both languages updated
  together).

## Acceptance criteria

- `docker compose up` brings up postgres, redis, backend, frontend with no
  manual steps beyond copying `.env.example` → `.env`.
- Visiting the frontend shows a page that successfully calls the backend
  ping endpoint and displays translated text; switching language updates
  the displayed text without a page reload.
- `GET /health` reflects real DB connectivity (fails if Postgres is down).
- CI is green on this branch: backend lint/typecheck/test/schema-check and
  frontend lint/typecheck/schema-check/test/build all pass.
- No user-facing string in the frontend is hardcoded outside the i18n
  system.
- `docs/ARCHITECTURE.md`, `docs/PRODUCT_REQUIREMENTS.md`, `docs/I18N.md`
  exist and reflect the actual implementation, not aspirational content.
