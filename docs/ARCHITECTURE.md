# Architecture

## Overview

A modular monolith: one FastAPI backend owns auth, family, expense, and
settlement domains; a separate `ocr-worker` (introduced in Phase 6) handles
OCR/AI workloads, since those have very different resource and scaling
characteristics from normal API traffic. A Vite/React SPA is the only
frontend client for now.

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Backend | Python + FastAPI | OCR stack (OpenCV/PaddleOCR/Ollama) is Python-native; sharing a language with the future OCR worker simplifies ops. |
| DB | PostgreSQL | Rich constraint/transaction support needed for financial invariants (`sum(allocations) == source amount`). |
| ORM | SQLAlchemy 2.0 (async) + Alembic | Explicit control over schema and constraints; versioned migrations. |
| DB driver | `psycopg` v3 | Single driver for both sync (Alembic) and async (app) connections. |
| Background jobs | Redis + Celery | Standard, well-documented retry/failure handling; fits the receipt processing state machine (UPLOAD → PROCESSING → ... → CONFIRMED). |
| Frontend | Vite + React + TypeScript | No SSR/SEO need (authenticated app); fast dev server. |
| Frontend i18n | react-i18next | Namespaced JSON translation files map directly onto the stable, semantic key architecture required for JA/VI. |
| Repo layout | Plain-folder monorepo | Backend is Python, frontend is separate anyway — a JS-focused monorepo tool (Nx/Turborepo) buys little here. |

## Type sharing between backend and frontend

1. `backend/scripts/export_openapi.py` writes the FastAPI app's OpenAPI
   schema to `openapi/openapi.json` (committed, single source of truth).
2. `frontend`'s `pnpm run generate:api-types` runs `openapi-typescript`
   against that file, emitting `frontend/src/api/schema.gen.ts` (also
   committed).
3. CI regenerates both files on every push and fails if either differs
   from what's committed — a backend response-shape change without a
   matching frontend type regen is a CI failure, not a runtime bug found
   later.

## Authentication

Email/password only for now (no OAuth, no email verification). Sessions
use two token types, both delivered as httpOnly cookies so the frontend
never handles a token directly:

- **Access token**: a stateless JWT (HS256, 15-minute lifetime). Verified
  per-request with no database round-trip.
- **Refresh token**: an opaque random string; only its SHA-256 hash is
  stored (`refresh_tokens.token_hash`), so it can be revoked. `/refresh`
  rotates it on every use (old token is revoked, a new one issued);
  `/logout` revokes it directly. This is what makes logout actually
  invalidate a session server-side, not just delete a cookie.

Login is rate-limited per email (5 failed attempts / 15 minutes) via a
Redis fixed-window counter — the same Redis instance already provisioned
for Celery.

`app/api/deps.py`'s `get_current_user` is the dependency every future
protected route (family, expense, receipt endpoints) will depend on.

## Family Management

A user can belong to multiple families. Each membership carries exactly
one role — OWNER (the creator; no ownership transfer in this phase),
ADMIN, or MEMBER — stored as a plain string (`FamilyRole` StrEnum at the
application layer) rather than a Postgres ENUM, so adding a role later
needs no migration.

`app/api/deps.py`'s `get_family_membership` is the family-scoped
counterpart to `get_current_user`: every family route depends on it first
(404 if the family doesn't exist, 403 if the caller isn't a member), then
layers `require_owner`/`require_owner_or_admin` (`app/core/permissions.py`)
on top for actions restricted by role. Later phases scoping data to a
family (expenses, receipts, settlements) should depend on
`get_family_membership` the same way, rather than re-implementing
membership checks.

Adding a member requires they already have an account (looked up by
email) — there are no invite tokens for not-yet-registered users in this
phase.

## Repository layout

```
backend/    FastAPI app, SQLAlchemy models, Alembic migrations
frontend/   Vite + React + TypeScript SPA
openapi/    Generated, committed OpenAPI schema (source of truth for types)
docs/       Architecture, product requirements, i18n glossary
```

## Local environment

`docker-compose.yml` runs `postgres`, `redis`, `backend`, `frontend` for
local development. Configuration is environment-variable driven
(`.env`, copied from `.env.example`); the backend fails fast at startup if
a required variable is missing.
