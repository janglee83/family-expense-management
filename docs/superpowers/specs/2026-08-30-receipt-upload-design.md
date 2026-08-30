# Receipt Upload — Design Spec

Date: 2026-08-30
Branch: `feature/receipt-upload` (to be created)
Phase: 5 of the product roadmap (`docs/PRODUCT_REQUIREMENTS.md`)

## Context

Phase 4 (`feature/expense-domain`, merged to `main`) built manual expense
entry: a family member types in an amount, category, payer, and
personal/shared flag by hand. The product's real goal is photograph-a-receipt
→ automatic extraction (`docs/PRODUCT_REQUIREMENTS.md`'s "Core workflow"),
which the roadmap spreads across four phases (5-8) since it's a genuinely
large subsystem: upload/storage, OCR extraction, parsing, and human review
are each substantial on their own.

`docs/ARCHITECTURE.md` already commits to a specific split: "a separate
`ocr-worker` (introduced in Phase 6) handles OCR/AI workloads." This phase
is everything that has to exist *before* real OCR can run: accepting an
upload, storing it durably, and proving the async job pipeline (Celery +
Redis) actually works end to end — without doing any real image analysis
yet. Phase 6 replaces this phase's stub worker logic with real
OpenCV/PaddleOCR/Ollama extraction.

## Goals

- A family member can upload a photo of a receipt (JPEG, PNG, or HEIC, up
  to 10MB); it's stored durably (MinIO) and tracked as a `receipts` row.
- The upload triggers a background job (Celery, via the existing Redis
  instance) that moves the receipt through the state machine's first real
  transition (`UPLOAD` → `PROCESSING`) — proving the queue/worker
  infrastructure works, not doing any actual OCR.
- Any family member can view the family's receipts (list + individual
  image) and their processing status; the uploader or an OWNER/ADMIN can
  delete one.
- Invalid uploads (wrong type, oversized) are rejected before anything is
  persisted — validated against real file content, not just the filename.
- Both languages (ja/vi) cover every new user-facing string from the start.

## Non-goals (explicitly deferred)

- **Any real OCR, image preprocessing, or text extraction** — Phase 6's
  job entirely. This phase's Celery task is a deliberate stub.
- **Parsing extracted text into line items, or a human-review UI** —
  Phases 7+.
- **Linking a receipt to an expense record** — the `receipts` table has no
  FK to `expenses` in this phase; how a reviewed/confirmed receipt becomes
  expense data is a design question for whichever later phase actually has
  parsed data to reconcile.
- **Polling or websocket status updates** — the stub task settles almost
  instantly, so a manual list-refresh is enough for now; real OCR taking
  meaningful time is what will justify polling later.
- **Multi-file batch upload, image rotation/editing, presigned/public
  URLs** — none of these are needed yet and are easy to add later without
  reshaping this phase's design.

## Decided design

### Architecture

Two new services in `docker-compose.yml`:
- **MinIO** — S3-compatible object storage for receipt images.
- **`worker`** — a Celery worker sharing the *existing* backend Docker
  image (same codebase; runs `celery -A app.worker worker` instead of
  `uvicorn`), using the Redis instance already provisioned for login
  rate-limiting as both broker and (ignored) result backend.

This is deliberately generic infrastructure — not the specialized
`ocr-worker` `ARCHITECTURE.md` already named for Phase 6. Phase 5 proves
"upload → enqueue → worker picks it up → status updates," and Phase 6
specializes/renames this worker once it has real OCR work to do.

The Celery task uses a **synchronous** SQLAlchemy session (same `psycopg`
v3 driver Alembic already uses sync-side) — no async/Celery integration
needed, since the task body is a plain synchronous DB update.

### Database

New Alembic revision (following the expense-domain migration chain):

```
receipts
  id                   UUID, primary key
  family_id            UUID, FK -> families.id (ON DELETE CASCADE),
                       NOT NULL, indexed
  uploaded_by_user_id  UUID, FK -> users.id, NOT NULL — no ondelete
                       cascade, matching expenses' financial-record-
                       preservation precedent
  storage_key          str, NOT NULL — MinIO object key, e.g.
                       "receipts/{family_id}/{receipt_id}/{filename}"
  content_type         str, NOT NULL — "image/jpeg" | "image/png" |
                       "image/heic"
  file_size_bytes      integer, NOT NULL
  status               str, NOT NULL — plain string column (a `ReceiptStatus`
                       StrEnum at the app layer, matching `FamilyRole`'s
                       precedent — no Postgres ENUM, so later phases can add
                       new states with no migration). This phase only ever
                       writes `UPLOAD`, `PROCESSING`, or `FAILED`.
                       `OCR_COMPLETED`/`PARSED`/`NEEDS_REVIEW`/`CONFIRMED`
                       are reserved names for later phases, unused here.
  error_message        str, NULLABLE — populated only when status = FAILED
  created_at / updated_at   timestamptz, NOT NULL, server default now()
                       (updated_at also onupdate now())
```

No FK to `expenses`, and no line-items table — both are out of scope per
the non-goals above.

**Validation happens before any row is created.** The actual file bytes
are sniffed (not the filename/extension) and must resolve to one of the
three allowed image types; size must be ≤ 10MB. A failing upload returns
422 and never creates a `receipts` row — it isn't a receipt in any real
sense yet. A row can only reach `FAILED` status *after* being accepted,
if the worker itself errors.

### Storage

A small storage interface, implemented against MinIO:

```python
class ReceiptStorage(Protocol):
    def save(self, key: str, content: bytes, content_type: str) -> None: ...
    def get(self, key: str) -> bytes: ...
    def delete(self, key: str) -> None: ...
```

Called via `boto3` (synchronous), wrapped in a threadpool
(`starlette.concurrency.run_in_threadpool`) when invoked from the async API
layer, and called directly from the synchronous Celery worker. Object keys
are `receipts/{family_id}/{receipt_id}/{sanitized_filename}`. MinIO
credentials live in `.env`, never reach the frontend.

### Permissions

| Action | Rule |
|---|---|
| Upload a receipt | any member of the family |
| View the family's receipts (list, detail, image) | any member |
| Delete a receipt | the uploader, or an OWNER/ADMIN of the family (reuses `require_owner_admin_or_creator` from Phase 4, with `uploaded_by_user_id` as the "creator" argument) |

No edit/PATCH endpoint — an uploaded image can't be meaningfully edited;
delete-and-reupload is the correction path.

### Backend endpoints

All depend on `get_family_membership(family_id)` first, exactly like the
expense/category endpoints.

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/families/{family_id}/receipts` | multipart upload; any member; 201 with the receipt (status=UPLOAD); 422 on invalid file (rejected before persistence) |
| GET | `/api/v1/families/{family_id}/receipts` | list, family-scoped, most recent first |
| GET | `/api/v1/families/{family_id}/receipts/{receipt_id}` | detail (status, error_message, uploader, timestamps) |
| GET | `/api/v1/families/{family_id}/receipts/{receipt_id}/image` | streams the image bytes from MinIO — a backend proxy (not a public/presigned URL), so family-membership auth is enforced on every view, not only at upload time |
| DELETE | `/api/v1/families/{family_id}/receipts/{receipt_id}` | uploader or OWNER/ADMIN; removes both the DB row and the MinIO object |

**Upload flow:**
1. Sniff the actual file bytes (`python-magic`) → must resolve to JPEG,
   PNG, or HEIC; size ≤ 10MB. Fail → 422, nothing persisted (no DB row, no
   MinIO write).
2. Save to MinIO at `receipts/{family_id}/{uuid4()}/{sanitized_filename}`.
3. Insert the `receipts` row (status=UPLOAD), commit.
4. Enqueue `process_receipt.delay(receipt_id)` on Celery, return 201.

**Celery task (`process_receipt`) — Phase 5's stub, in full:** load the
receipt, set `status=PROCESSING`, commit. That is the entire task body.
Wrapped so any exception instead sets `status=FAILED` with
`error_message` and commits. A basic autoretry policy (max 3 attempts,
exponential backoff) is configured so the retry/failure infrastructure is
proven even though there's no real work to retry yet. Phase 6 replaces
this task body with real OCR logic that advances the state machine
further (toward `OCR_COMPLETED`/`FAILED`).

**New dependencies:** `python-magic` (backend Dockerfile needs
`libmagic1` installed at the OS level) for real content-sniffing;
`boto3` for the MinIO/S3 client; `celery` for the background job
framework.

### Frontend

`frontend/src/receipts/` mirrors the shape of `frontend/src/expenses/`:
- `receiptApi.ts` — `uploadReceipt(familyId, file)`, `listReceipts(familyId)`,
  `deleteReceipt(familyId, receiptId)`. The image itself is rendered via a
  plain `<img src="/api/v1/families/{familyId}/receipts/{id}/image">` —
  the httpOnly auth cookie is sent automatically by the browser on that
  same-origin request, no fetch/blob handling needed.
- `ReceiptUploadForm.tsx` — a file input + submit button; a fast
  client-side pre-check of type/size before hitting the API (the server
  remains the actual authority).
- `ReceiptList.tsx` — lists each receipt with a status badge
  (Uploaded/Processing/Failed), a small image thumbnail/link, and a
  delete button gated the same way as expenses (uploader or OWNER/ADMIN).
- Route: `/families/:familyId/receipts`, linked from `FamilyDetail.tsx`
  alongside the existing "My Expenses" link.

No polling/auto-refresh — a manual list-refresh is enough until Phase 6
makes status changes take meaningful time.

### i18n

New `receipt.*` keys: `myReceipts`, `noReceipts`, `upload`, `uploading`,
`delete`, `confirmDelete`, `statusUploaded`, `statusProcessing`,
`statusFailed`, `invalidFileType`, `fileTooLarge`, `uploadFailed` — in
both `ja/common.json` and `vi/common.json`.

## Testing plan

Backend (`pytest`, integration, real Postgres + real MinIO via docker
compose):
- Valid upload (JPEG/PNG/HEIC, under 10MB) → 201, a `receipts` row exists
  with status=UPLOAD, and the Celery task was enqueued.
- Oversized upload (>10MB) → 422, no `receipts` row created, nothing
  written to MinIO.
- Wrong-type upload (e.g. a PDF renamed to `.jpg`, detected via real
  content sniffing, not the extension) → 422, no row, no MinIO write.
- Non-member gets 403 on every endpoint (upload, list, detail, image,
  delete).
- Delete removes both the DB row and the MinIO object (verified by
  checking the object no longer exists in MinIO after delete).
- Delete as a non-uploader plain MEMBER → 403; as OWNER/ADMIN who didn't
  upload it → succeeds.
- The Celery task itself, called directly (not through the broker):
  normal path sets status=PROCESSING; a forced exception sets
  status=FAILED with a non-null error_message.

Frontend (`vitest` + React Testing Library):
- `ReceiptUploadForm` rejects an oversized/wrong-type file client-side
  before calling the API.
- Successful upload calls the API and the new receipt appears in the list.
- `ReceiptList` renders each status as a distinct, correctly-labeled badge;
  empty state when there are none.
- Delete button gated by role/uploader, mirroring the expense list's
  established pattern.

## Security invariants

- Every receipt endpoint resolves family membership via
  `get_family_membership` before anything else — no endpoint trusts a
  `family_id` in the URL without verifying the caller belongs to it.
- File type/size validation is against actual file content (via
  `python-magic`), never trusting the client-supplied filename or
  declared MIME type alone.
- The image-serving endpoint re-checks family membership on every
  request — there is no public or presigned URL that bypasses
  per-request authorization.
- MinIO credentials are server-side configuration only (`.env`), never
  exposed to the frontend.

## Acceptance criteria

- A family member can upload a receipt image and see it appear in the
  family's receipt list with status "Uploaded," transitioning to
  "Processing" once the worker picks it up.
- An invalid upload (wrong type or too large) is rejected with a clear
  error and never appears in the list.
- The uploader or an OWNER/ADMIN can delete a receipt; a plain MEMBER who
  didn't upload it cannot.
- A non-member of the family gets 403 on every receipt endpoint.
- No user-facing string in the new frontend code is hardcoded outside the
  i18n system; both `ja` and `vi` locale files are complete.
- `docker compose up` brings up MinIO and the new `worker` service
  alongside the existing stack, cleanly.
- CI (backend + frontend jobs, including the OpenAPI/type-drift checks)
  is green on this branch.
