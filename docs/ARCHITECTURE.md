# Architecture

## Overview

A modular monolith: one FastAPI backend owns auth, family, expense, and
settlement domains. There is no separate worker process — an earlier phase
abandoned OCR and the Celery/Redis-as-broker pattern was removed with it, so
all backend work (including receipt-upload status updates) happens
synchronously within the request/transaction that creates it. If a future
phase reintroduces genuinely heavy background work, that phase should design
its own async pipeline at that time. A Vite/React SPA is the only frontend
client for now.

## Stack decisions

| Concern | Choice | Why |
|---|---|---|
| Backend | Python + FastAPI | Async-first (SQLAlchemy 2.0 async, `httpx`) with a mature ecosystem for the domain's validation-heavy JSON APIs. |
| DB | PostgreSQL | Rich constraint/transaction support needed for financial invariants (`sum(allocations) == source amount`). |
| ORM | SQLAlchemy 2.0 (async) + Alembic | Explicit control over schema and constraints; versioned migrations. |
| DB driver | `psycopg` v3 | Single driver for both sync (Alembic) and async (app) connections. |
| Redis | Login rate-limiting only | Lightweight, already-provisioned store for a fixed-window counter; the Celery-as-broker usage was removed once background OCR processing was abandoned. |
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
Redis fixed-window counter — Redis's only remaining use since
Celery-as-broker was removed (see Deployment).

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
phases can add new states without a migration. A receipt is written
straight to `PROCESSING` synchronously, in the same request/transaction
that creates it, and stays there — there is no Celery task, no worker, and
no further automatic state transition. The enum's other values (`UPLOAD`,
`FAILED`, `OCR_COMPLETED`, `PARSED`, `NEEDS_REVIEW`, `CONFIRMED`) remain
defined but are not set by any code path today; they are reserved for a
possible future phase that reintroduces real receipt processing, not a
committed roadmap item.

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

## Deployment

The app deploys serverlessly on AWS rather than as an always-on server,
because real traffic at this scale (a small number of family members) is
low and sporadic — paying for compute that sits idle most of the day would
dominate the cost for no benefit.

- **Backend**: runs on AWS Lambda as a container image (ARM/Graviton),
  behind API Gateway (HTTP API). The Lambda Web Adapter
  (`backend/Dockerfile.lambda`) lets the existing FastAPI/Uvicorn app run
  unmodified — it translates API Gateway events into real HTTP requests
  against the app's own local Uvicorn server and back.
- **Database**: Neon.tech (serverless Postgres) via its pooled connection
  string — Lambda's per-invocation connection pattern needs pooling to
  avoid exhausting Postgres's connection limit.
- **Rate-limit store**: Upstash Redis (serverless, TLS) — Redis is kept
  only for login rate-limiting; the Celery/Redis-as-broker pattern was
  removed entirely (see below).
- **Receipt storage**: S3, accessed via implicit IAM credentials from the
  Lambda execution role (no explicit access key/secret in production —
  `app/core/storage.py`'s `MinioReceiptStorage` only passes explicit
  credentials when they're configured, which is a dev/MinIO-only case).
- **Frontend**: a static build served through CloudFront, with a private
  S3 origin restricted to CloudFront via Origin Access Control — never a
  public S3 bucket. The same distribution also has an API Gateway origin
  behind a `/api/*` cache behavior (caching disabled, cookies forwarded), so
  the SPA and API are same-origin. That is a correctness requirement, not an
  optimization: the auth cookies are `SameSite=Lax`, which browsers refuse
  to attach to cross-site `fetch`/XHR, so a separate API domain would leave
  every post-login request unauthenticated. The frontend build therefore
  needs no `VITE_API_BASE_URL` — it calls `/api/v1/...` relatively.
- **No background job processing**: the receipt-upload flow used to
  enqueue a Celery task (`process_receipt`) that, since real OCR was
  abandoned in an earlier phase, did nothing but flip a status flag. That
  task and the entire Celery/worker service are gone — the status update
  now happens synchronously in the same request/transaction that creates
  the receipt row. If a future phase reintroduces genuinely heavy
  background work, that phase should design its own serverless-async
  pipeline (e.g. SQS + a dedicated Lambda) at that time.
- **Infrastructure as code**: `infra/` (Terraform) provisions the ECR
  repository, Lambda function, API Gateway, IAM roles/policies, S3
  buckets, and CloudFront distribution. The Lambda function's container
  image is deployed by CI (`aws lambda update-function-code`), not by
  `terraform apply` — Terraform only sets the image at first creation and
  is told to ignore later changes to it, so CI and Terraform don't fight
  over the same field.
- **CI/CD**: `.github/workflows/deploy.yml`, triggered on push to `main`,
  authenticates to AWS via OIDC (no static credentials), builds and pushes
  the backend image, updates the Lambda function, runs
  `scripts/safe_migrate.py` against Neon, then builds and syncs the
  frontend to S3 and invalidates the CloudFront cache. That migration runs
  with `--skip-backup`: the script's `pg_dump` backup would be written to
  the runner's ephemeral filesystem and discarded when the job ends, so CI
  relies on Neon's own branching / point-in-time recovery for migration
  rollback safety instead. It also uses a separate direct (unpooled) Neon
  connection secret, since `pg_dump` and session-scoped advisory locks are
  unreliable through PgBouncer transaction pooling.

At the current low-traffic scale, this architecture costs roughly
$0-3/month — every component either has a permanent free tier at this
volume (Lambda, Neon, Upstash) or scales its cost with actual usage
rather than charging for idle time (API Gateway, S3, CloudFront).
