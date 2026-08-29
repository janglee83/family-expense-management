# Expense Domain — Design Spec

Date: 2026-08-25
Branch: `feature/expense-domain`
Phase: 4 of the product roadmap (`docs/PRODUCT_REQUIREMENTS.md`)

## Context

Phase 3 (`feature/family-management`, merged to `main`) built families,
multi-family membership, and a three-role permission system. No expense
data exists yet. This phase adds the foundational expense/category data
model and manual CRUD — deliberately narrower than the full financial
picture, since the roadmap gives allocation splitting (Phase 10),
settlement calculation (Phase 11), and receipts/OCR (Phases 5-8) their
own dedicated phases.

## Goals

- A family member can log an expense: amount (integer yen), category,
  payer (any family member, not necessarily the person logging it),
  personal-or-shared classification, date, and an optional description.
- Categories are a hybrid: a fixed, seeded set of global categories
  shared by every family, plus per-family custom categories.
- Expenses and categories are family-scoped the same way Phase 3 scoped
  family membership — every endpoint depends on `get_family_membership`
  first.
- Editing/deleting an expense is restricted to its creator or an
  OWNER/ADMIN; managing custom categories (rename/delete) is
  OWNER/ADMIN-only, since a category is a shared resource other members'
  expenses may already reference.
- Both languages (ja/vi) cover every new user-facing string, including
  the seeded category names, from the start.

## Non-goals (explicitly deferred)

- Allocation/splitting math for shared expenses — `is_shared` is a plain
  classification flag in this phase; how a shared expense's cost is
  divided among members is Phase 10's job.
- Settlement calculation (who owes whom) — Phase 11.
- Receipts, image upload, OCR, or any merchant/store-name extraction —
  Phases 5-8. `description` is a plain free-text field for now, not a
  structured receipt field.
- Auto-categorization or category suggestion — Phase 9 builds on the
  categories this phase seeds.
- Multi-currency — every amount is yen (integer, no floats, no
  subunits), matching the master spec's JPY-centric examples.
- A dashboard, filtering/search UI beyond a plain list, or export —
  later phases.

## Decided design

### Database

New Alembic revision (following `0003` from Phase 3):

```
categories
  id           UUID, primary key
  family_id    UUID, FK -> families.id (ON DELETE CASCADE), NULLABLE
               NULL = global/seeded, shared by all families
               non-NULL = custom, belongs to exactly one family
  name         str, NOT NULL
  created_at   timestamptz, NOT NULL, server default now()

expenses
  id                  UUID, primary key
  family_id           UUID, FK -> families.id (ON DELETE CASCADE),
                      NOT NULL, indexed
  payer_user_id       UUID, FK -> users.id, NOT NULL — who paid
  created_by_user_id  UUID, FK -> users.id, NOT NULL — who logged the
                      entry (may differ from the payer)
  category_id         UUID, FK -> categories.id, NOT NULL
  amount              integer, NOT NULL, CHECK (amount > 0) — yen
  is_shared           bool, NOT NULL — personal vs. shared classification
  description         str, NULLABLE — free text
  expense_date        date, NOT NULL — when the purchase happened,
                      distinct from created_at
  created_at / updated_at   timestamptz, NOT NULL, server default now()
                      (updated_at also onupdate now())
```

A data migration (or a step in the same migration) seeds the global
categories (`family_id = NULL`): a stable slug per category (e.g.
`groceries`, `dining`, `transport`, `utilities`, `entertainment`,
`other`) — NOT a translated display string. Display text is resolved via
i18n at render time (`category.<slug>`), the same pattern `role.owner`
etc. already use. This keeps the category *data* language-neutral; only
the *display* is localized.

`payer_user_id` and `created_by_user_id` are validated at the API layer
against `family_members` for the target `family_id` — both must actually
belong to the family the expense is being created in, not just be any
registered user. `category_id` is validated to be either a global
category or a custom category belonging to that same family (never a
different family's custom category).

### Permissions

| Action | Rule |
|---|---|
| View expenses/categories | any member of the family |
| Create an expense | any member (as `created_by_user_id`; `payer_user_id` can be any member, chosen from a dropdown) |
| Edit/delete an expense | the expense's `created_by_user_id`, or an OWNER/ADMIN of the family |
| Create a custom category | any member |
| Rename/delete a custom category | OWNER/ADMIN only |
| Rename/delete a global category | nobody — 403 regardless of role. The rename/delete endpoint always resolves `get_family_membership` and the caller's role first; if that passes but the target category's `family_id IS NULL` (global) or belongs to a *different* family, it returns 403 ("not a mutable category for this family") — never 404, since the category genuinely exists, the caller just isn't allowed to touch it. |

### Backend endpoints

All mounted under the existing family-scoped router, depending on
`get_family_membership(family_id)` first, exactly like Phase 3's family
endpoints.

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/families/{family_id}/categories` | global categories + this family's custom ones |
| POST | `/api/v1/families/{family_id}/categories` | create a custom category; any member |
| PATCH | `/api/v1/families/{family_id}/categories/{category_id}` | rename; OWNER/ADMIN; 403 if the target is global or belongs to a different family |
| DELETE | `/api/v1/families/{family_id}/categories/{category_id}` | same rule as PATCH |
| GET | `/api/v1/families/{family_id}/expenses` | list, most recent first |
| POST | `/api/v1/families/{family_id}/expenses` | create |
| GET | `/api/v1/families/{family_id}/expenses/{expense_id}` | detail |
| PATCH | `/api/v1/families/{family_id}/expenses/{expense_id}` | edit; creator or OWNER/ADMIN |
| DELETE | `/api/v1/families/{family_id}/expenses/{expense_id}` | delete; creator or OWNER/ADMIN |

### Frontend

A new section under the existing family detail area:
`/families/:familyId/expenses` — a list (amount, category, payer's
display name, date, a personal/shared badge) with a create form (amount,
category `<select>` with an inline "create new category" affordance,
payer `<select>` populated from the family's member list, a
personal/shared toggle, date picker, optional description), and per-row
edit/delete controls gated the same way as the backend (client-side hint
only, same pattern established in Phase 3's `FamilyDetail.tsx`). A link
to this page is added from the existing `/families/:familyId` page.

`frontend/src/expenses/` mirrors the shape of `frontend/src/families/`:
`expenseApi.ts`, `categoryApi.ts` (or one combined `expenseApi.ts` if the
two are small enough — decided during planning), `ExpenseList.tsx`,
`ExpenseForm.tsx` (shared between create and edit).

### i18n

New `expense.*` keys (amount, category, payer, description, date,
personal, shared, addExpense, editExpense, deleteExpense,
confirmDeleteExpense, addCategory, categoryName, actionFailed, etc.) and
`category.*` keys for each seeded slug (`category.groceries`,
`category.dining`, `category.transport`, `category.utilities`,
`category.entertainment`, `category.other`), in both `ja/common.json`
and `vi/common.json`.

## Testing plan

Backend (`pytest`, integration, real Postgres):
- Create an expense with a valid payer/category → 201, fields round-trip
  correctly, `amount` stored as a plain integer.
- Create an expense naming a payer who isn't a member of the family →
  422 (not silently accepted).
- Create an expense referencing another family's custom category → 422
  (same status as the invalid-payer case — both are "this value doesn't
  satisfy a referential business rule for this family," distinct from a
  404 on a URL path segment or a 409 conflict).
- List expenses for a family → returns only that family's expenses, most
  recent first.
- A non-member gets 403 on every endpoint above (family-scoping is not
  optional).
- Edit/delete an expense as its creator → succeeds. As an OWNER/ADMIN who
  didn't create it → succeeds. As a plain MEMBER who didn't create it →
  403.
- Create a custom category as a plain MEMBER → succeeds (creation is
  open to all members). Rename/delete that custom category as a MEMBER →
  403. As an OWNER/ADMIN → succeeds.
- Attempt to rename/delete a global category (as OWNER) → 403.
- `GET .../categories` for a fresh family returns exactly the seeded
  global categories (no custom ones yet).
- `amount <= 0` on create → 422 (schema-level validation, not just a DB
  constraint).

Frontend (`vitest` + React Testing Library):
- `ExpenseList` renders expenses with category/payer/date/badge; empty
  state when there are none.
- `ExpenseForm` validates amount > 0 client-side before submitting.
- Creating an expense calls the API with the exact selected payer/category
  and appends/reflects the result.
- Edit/delete controls only render for permitted roles (creator or
  OWNER/ADMIN) — mirroring Phase 3's `FamilyDetail.tsx` gating tests.

## Security invariants

- Every expense/category endpoint resolves family membership via
  `get_family_membership` before anything else — no endpoint trusts a
  `family_id` in the URL without verifying the caller belongs to it
  (same invariant Phase 3 established).
- `payer_user_id`/`created_by_user_id` are always validated against that
  specific family's membership list — a user cannot be named as payer
  for a family they don't belong to.
- A family's custom category can never be attached to another family's
  expense, and never mutated by a non-OWNER/ADMIN of its own family.

## Acceptance criteria

- A family member can create an expense naming any other family member
  as payer, pick a global or custom category, mark it personal or
  shared, and see it in the family's expense list.
- The full permission matrix above (view/create/edit/delete expenses;
  create/rename/delete categories) is enforced server-side and covered
  by tests — every denied case actually returns 403, every allowed case
  actually succeeds.
- Global categories are seeded and immutable; custom categories are
  family-scoped and OWNER/ADMIN-managed.
- No user-facing string in the new frontend code is hardcoded outside
  the i18n system; both `ja` and `vi` locale files are complete,
  including the seeded category names.
- `docker compose up` still brings up the full stack cleanly with the
  new migration applied.
- CI (backend + frontend jobs, including the OpenAPI/type-drift checks)
  is green on this branch.
