# OCR Worker — Design Spec

Date: 2026-09-03
Branch: `feature/ocr-worker` (to be created)
Phase: 6 of the product roadmap (`docs/PRODUCT_REQUIREMENTS.md`)

## Context

Phase 5 (`feature/receipt-upload`, merged to `main`) built receipt upload,
storage, and a generic Celery `worker` service running a deliberate stub
task (`process_receipt`) that only advances a receipt's status from
`UPLOAD` to `PROCESSING`, proving the queue/worker infrastructure works.
This phase replaces that stub with real OCR extraction: OpenCV
preprocessing + PaddleOCR text recognition, advancing the state machine
to `OCR_COMPLETED` (or `FAILED`).

The roadmap groups Phases 5-8 as the whole receipts/OCR pipeline. This
phase is scoped narrowly to raw OCR only — turning a photo into
recognized text + bounding boxes. Structure detection (turning that text
into item/price/quantity/tax line items, likely via Ollama) is Phase 7's
job; a human review UI is Phase 8's. This mirrors how Phase 4 deliberately
scoped manual expense entry narrower than the full financial picture, and
how Phase 5 scoped upload/storage narrower than the full OCR pipeline.

## Goals

- The `process_receipt` Celery task actually runs OCR: fetch the image
  from MinIO, normalize it with OpenCV, recognize text with PaddleOCR,
  and store the raw result.
- Both Vietnamese and Japanese receipts are supported without asking the
  user anything — the pipeline auto-detects which language fits better.
- Raw OCR output (recognized text, bounding boxes, confidence) is stored
  as its own durable layer, never overwritten by later phases' parsed or
  confirmed data.
- The heavy OCR dependencies (PaddleOCR, OpenCV, baked-in models) live in
  a dedicated `ocr-worker` Docker image — the API server's image stays
  lean.
- A receipt that fails to process (corrupted image, pipeline crash) lands
  in `FAILED` with a recorded reason, exactly like Phase 5's stub already
  does for its own failure cases — this phase just gives that path real
  content to fail on.

## Non-goals (explicitly deferred)

- **Structure detection, item/price/quantity/tax extraction** — Phase 7.
  This phase stores raw recognized text; turning it into structured data
  is a separate, later step.
- **Any human review UI, or displaying the extracted text anywhere** —
  Phase 8. The only frontend change in this phase is fixing a label
  fallback gap so a completed receipt doesn't silently mislabel itself.
- **Category/PERSONAL-SHARED suggestion** — Phase 9, per the existing
  roadmap notes.
- **Full contour-based perspective correction** (detecting a receipt's
  paper boundary against an arbitrary photo background and warping it
  flat) — deferred as a follow-up refinement once there's real data on
  how much it actually improves OCR accuracy over basic normalization.
  This phase does grayscale/denoise/contrast normalization only; rotation
  correction comes from PaddleOCR's built-in text-orientation classifier,
  not a hand-rolled OpenCV step.
- **Retry/history of OCR attempts** — `receipt_ocr_results` has a unique
  constraint on `receipt_id`; a re-run overwrites the row. Keeping a
  history of multiple OCR attempts per receipt is not needed yet.
- **Running real OCR inference in CI** — the pipeline is exercised by a
  new `ocr` pytest marker, excluded from CI's default run (mirroring how
  `integration` is already excluded by default), and expected to be run
  locally/manually before merging changes that touch it. CI does still
  build the `ocr-worker` Docker image — since the Dockerfile bakes models
  in at build time, this build necessarily downloads them too, but that's
  a bounded, one-time-per-run cost distinct from running inference
  against test images, and it's the only way to catch Dockerfile/
  dependency breakage before merge. What CI skips is repeatedly running
  the trained models against receipt fixtures, not the image build
  itself.

## Decided design

### Architecture

The generic `worker` service from Phase 5 is renamed to `ocr-worker` and
gets its own Dockerfile. Both still build from the same `backend/`
codebase — no code duplication, one source of truth for `Receipt`,
`Settings`, `ReceiptStorage`, etc. — but the `ocr-worker` Dockerfile
installs a new `ocr` optional-dependency group on top of the base
dependencies, and bakes PaddleOCR's pretrained models into the image at
build time (so the container never needs network access at runtime, and
the first real task isn't slow or flaky waiting on a model download).

```
backend/
  pyproject.toml           (adds [project.optional-dependencies] ocr = [...])
  Dockerfile                 (existing — backend API, base deps only, unchanged)
  Dockerfile.ocr-worker        (new — `uv sync --extra ocr`, model download baked in)
```

`docker-compose.yml`'s `worker` service is renamed `ocr-worker`, pointed
at the new Dockerfile, with the same Celery command as before.

### Data model

New Alembic revision (following `0005` from Phase 5):

```
receipt_ocr_results
  id                  UUID, primary key
  receipt_id          UUID, FK -> receipts.id (ON DELETE CASCADE),
                      NOT NULL, UNIQUE — one OCR result per receipt; a
                      re-run overwrites this row rather than accumulating
                      history
  raw_text            text, NOT NULL — full concatenated recognized text
  bounding_boxes       JSONB, NOT NULL — list of
                       `{text, confidence, box: [[x,y] x4]}` per detected
                       text region, matching PaddleOCR's native output
                       shape
  average_confidence   float, NOT NULL
  detected_language     str, NOT NULL — whichever of the `vi`/`japan`
                        passes scored higher; recorded for debugging and
                        future display, not acted on by this phase
  created_at            timestamptz, NOT NULL, server default now()
```

This is the "raw OCR output" layer the product spec calls out as
distinct from later parsed/confirmed layers — it gets its own table
rather than another JSON column bolted onto `receipts`, so `receipts`
doesn't become a kitchen-sink as Phases 7-8 add their own layers.

### Pipeline logic

`process_receipt`'s task body (replacing Phase 5's stub entirely):

1. Fetch the image bytes from MinIO via the existing
   `ReceiptStorage.get(storage_key)`.
2. OpenCV normalization: decode → grayscale → denoise/contrast
   adjustment. No perspective correction (see Non-goals).
3. Run PaddleOCR twice — once with its `vi` model, once with `japan` —
   and keep whichever pass has the higher `average_confidence`. Running
   both is simpler and more robust than trying to pre-detect language
   from the image; the ~2x inference cost is acceptable for an async
   background job nothing is waiting on live.
4. Upsert a `receipt_ocr_results` row (insert if none exists for this
   `receipt_id`, update in place if a prior attempt exists) with the
   winning pass's `raw_text`/`bounding_boxes`/`average_confidence`/
   `detected_language`.
5. Set `receipts.status = OCR_COMPLETED`, commit.
6. Any exception anywhere in steps 1-4 → `receipts.status = FAILED`,
   `error_message = str(exc)` — matching Phase 5's existing
   exception-handling shape exactly (rollback, set both fields, commit,
   re-raise).

**`FAILED` vs. a sparse result:** `FAILED` is reserved for actual
pipeline failures (corrupted image, OpenCV/PaddleOCR crash,
out-of-memory). A successful run that just finds little or no text
(blurry photo, blank page) still reaches `OCR_COMPLETED` with a
sparse/low-confidence result — judging whether a result is "good enough"
is a human-review concern, and that doesn't exist until Phase 8. This
phase's job is to run the pipeline and record what it found, not to
grade the result.

### Frontend

Minimal — this phase closes a gap Phase 5's final review already
flagged rather than building new UI. `frontend/src/receipts/ReceiptList.tsx`'s
`statusLabelKey` currently falls through every unrecognized status to
"Processing"; add an explicit `ocr_completed` case plus a new i18n key
(`receipt.statusOcrCompleted`) in both `ja`/`vi`, so a completed receipt
displays its own label instead of silently staying "Processing" forever.
No new UI to browse the extracted text — that's Phase 8's job.

## Testing plan

**Unit/mocked tests** (run in CI, no real OCR):
- The exception-handling shape (steps 1-4 failing → `FAILED` +
  `error_message`) is tested by mocking each step to raise, following
  the exact same `flaky_commit`-style technique Phase 5's worker tests
  already established.
- The upsert logic (insert-if-absent, update-if-present) is tested
  against real Postgres with a mocked OCR call returning canned
  `raw_text`/`bounding_boxes`/`confidence` values.

**Real-OCR tests** (`@pytest.mark.ocr`, excluded from CI's default run,
run locally/manually):
- A couple of small real receipt-shaped image fixtures (one
  Vietnamese-ish, one Japanese-ish) checked into
  `backend/tests/fixtures/`, run through the actual pipeline end to end.
  Assertions are a sanity floor, not exact-text matching — OCR output can
  vary slightly across PaddleOCR versions/environments:
  - `average_confidence > 0.3`
  - `raw_text` is non-empty
  - `detected_language` matches the fixture's expected language

**CI:** the `ocr-worker` Docker image is built in CI (catching
Dockerfile/dependency breakage, and incurring the baked-in model
download as a one-time build cost), but the `ocr`-marked tests that
actually run inference are excluded from the default `pytest` run,
matching how `integration` is already excluded by default via
`addopts`.

## Security invariants

- No new attack surface beyond what Phase 5 already established — the
  OCR pipeline runs entirely within the existing family-scoped receipt
  record; it never introduces a new endpoint or bypasses
  `get_family_membership`.
- `receipt_ocr_results` cascades on `receipts` deletion (matching
  `receipts.family_id`'s cascade precedent) — deleting a receipt also
  removes its OCR result, no orphaned data.
- No paid AI/OCR API is used anywhere in this pipeline (OpenCV + local
  PaddleOCR only), matching the zero-cost AI constraint.

## Acceptance criteria

- Uploading a real Vietnamese or Japanese receipt photo results in a
  `receipts` row reaching `OCR_COMPLETED` with a corresponding
  `receipt_ocr_results` row containing non-trivial recognized text.
- A corrupted/unreadable image results in `FAILED` with a recorded
  `error_message`, not an unhandled worker crash.
- The `ocr-worker` service builds and runs independently of the `backend`
  API service, and the API service's image size/build time is unaffected
  by PaddleOCR.
- `ReceiptList.tsx` displays a distinct label for `OCR_COMPLETED`
  receipts, not a silent fallback to "Processing".
- CI (backend + frontend jobs, including the OpenAPI/type-drift checks)
  is green on this branch, without running the real-OCR pipeline tests.
