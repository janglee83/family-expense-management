# Architecture

## Overview

A modular monolith: one FastAPI backend owns auth, family, expense, and
settlement domains; a separate `worker` process (this phase adds it as a
generic Celery/Redis consumer; Phase 6 specializes it into the real
`ocr-worker`) handles background/OCR workloads, since those have very
different resource and scaling characteristics from normal API traffic. A
Vite/React SPA is the only frontend client for now.

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

No user-deletion endpoint exists yet, so this is not reachable today, but
it's worth flagging for whichever future phase adds account deletion:
`family_members.user_id` cascades on delete, so deleting a user who is the
sole OWNER of a family would silently delete their OWNER row and leave
that family ownerless — with no OWNER left, nobody could rename, delete,
or manage it (ADMINs cannot promote themselves, and there is no ownership
transfer). Account-deletion work should address this explicitly, e.g. by
blocking deletion of a user who is the sole OWNER of any family, or by
requiring ownership transfer/family deletion first.

## Expense Domain

Expenses and categories are family-scoped the same way family membership
is — every endpoint depends on `get_family_membership` first. Categories
are a hybrid: global ones (`family_id IS NULL`) are seeded via migration
with stable slugs (`groceries`, `dining`, ...) and are immutable by
design; custom ones belong to exactly one family and are
OWNER/ADMIN-managed, since a category is a shared resource other
members' expenses may already reference.

Editing or deleting a specific expense is gated by a new permission
helper, `require_owner_admin_or_creator` — the expense's own creator can
always edit it, and an OWNER/ADMIN can edit any expense in their family
even if they didn't create it. `payer_user_id` (who paid) is deliberately
separate from `created_by_user_id` (who logged the entry) and from the
caller's own identity — any member can log an expense on another
member's behalf.

This phase deliberately does not implement allocation/splitting math or
settlement calculation — `is_shared` is a plain classification flag for
now; Phases 10 and 11 build the actual splitting and settlement logic on
top of this data model. All amounts are integer yen; no floating-point
money anywhere in the schema or API.

## Receipt Upload

Receipts are family-scoped the same way expenses are — every endpoint
depends on `get_family_membership` first. Uploaded images are validated
by real content-sniffing (`python-magic`, not the client-supplied
filename/MIME), stored in MinIO behind a small `ReceiptStorage`
interface, and served back through a backend proxy endpoint (never a
public/presigned URL) so family-membership authorization applies to
every view, not just the upload.

A `receipts` row tracks `status` as a plain string (a `ReceiptStatus`
StrEnum at the app layer, matching `FamilyRole`'s precedent) so later
phases can add new states without a migration. This phase's Celery task
(`process_receipt`, run by the new generic `worker` service) is a
deliberate stub: it only advances `UPLOAD` → `PROCESSING`, proving the
queue/worker infrastructure works end to end. Phase 6 replaces the task
body with real OpenCV/PaddleOCR/Ollama extraction and advances the state
machine further (toward `OCR_COMPLETED`/`FAILED`).

`receipts` has no FK to `expenses` in this phase — the two stay fully
independent until a later phase has parsed OCR data to reconcile against
manual expense entries.

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
