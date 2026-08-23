# Product Requirements

Condensed from the full product specification. This is the working
reference for domain decisions in later phases (auth, family, expense,
OCR, settlement) — update it as those phases land.

## Core workflow

Buy → photograph receipt → OCR extracts items/prices/quantities/tax →
system suggests category and PERSONAL/SHARED → user reviews and corrects →
system records payer → shared expenses are allocated among members →
balances are calculated → settlement is generated.

## Family model

A family has members with roles (`OWNER`, `ADMIN`, `MEMBER`). All access is
family-scoped — a member never sees another family's data.

## Expense model

Each receipt has line items; each item is either `PERSONAL` or `SHARED`.
**Payer and responsibility are separate concepts**: whoever pays for a
receipt is not automatically responsible for its full cost — shared items
are allocated across members regardless of who paid.

## Shared allocation

Supported allocation strategies: equal split, selected members, percentage,
exact amount, personal (no split). All money is integer-valued (no floats)
and every allocation must reconcile exactly:
`sum(all allocations) === source amount`, with a documented deterministic
rounding rule (e.g. ¥100 / 3 → ¥34/¥33/¥33).

## Settlement

`net_balance = paid_for_shared - responsibility_for_shared`. Positive means
the member should receive money; negative means they owe money. Personal
expenses never affect settlement. The settlement algorithm should minimize
the number of transfers needed.

## Receipt OCR pipeline

Image → OpenCV preprocessing → receipt detection/perspective correction →
OCR → bounding boxes → normalization → structure detection → item/price/
quantity/tax extraction → subtotal/total validation → category/PERSONAL-
SHARED suggestion → human review. Must run as background processing
(state machine: `UPLOAD → PROCESSING → OCR_COMPLETED → PARSED →
NEEDS_REVIEW → CONFIRMED → FAILED`), never blocking the upload request.
Raw OCR output, parsed values, and user-confirmed values are kept as three
distinct, never-overwritten layers.

## Zero-cost AI constraint

No paid AI/OCR API (OpenAI, Anthropic, Google Vision, AWS Textract, etc.)
in the primary implementation. Preferred stack: OpenCV + PaddleOCR + Ollama
(local LLM), behind interfaces that would allow a paid provider to be
swapped in later without changing calling code.

## Internationalization

Vietnamese and Japanese are supported from the start, not retrofitted.
Every user-facing string goes through a translation key (see
`docs/I18N.md`); both languages are updated together for every
user-facing change.

## Security

Family-scoped authorization, file/MIME/size validation for uploaded
receipt images, secure storage, standard web app protections (SQLi, rate
limiting, safe error messages).

## Non-goals for the current phase

Everything above is the target end state. The `project-foundation` phase
implements none of this domain logic — it only builds the infrastructure
(backend/frontend skeleton, DB connection, i18n plumbing, CI) these later
phases will build on.
