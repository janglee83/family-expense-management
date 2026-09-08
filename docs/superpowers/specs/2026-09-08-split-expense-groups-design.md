# Split Expense Groups (Monthly Aggregate Split) — Design Spec

Date: 2026-09-08
Branch: `feature/split-expense-groups` (to be created at implementation time)

## Context

The app already has a "Split Expenses" feature (`backend/app/models/split_expense.py`,
`backend/app/api/v1/split_expenses.py`, `frontend/src/finance/SplitExpensesPage.tsx`)
that lets a family member pick **one existing `Expense` row** and split it
among participants (equal / custom / percentage), tracking who has settled.
A `SplitExpense` has a hard `UniqueConstraint` on `expense_id` — each
expense can be split exactly once, and only one at a time.

The user wants to split an entire month's worth of shared spending at once
instead of picking expenses one by one — e.g. "gộp cả tháng 9 lại và chia
1 lần" (aggregate September and split it once). This requires a new data
shape (a split that spans many expenses over a period, not one), so it's
architectural rather than a small addition to the existing flow.

## Goals

- A family member can pick a calendar month and see, before committing,
  every `Expense` that would be aggregated into a group split for that
  month, and the total.
- Confirming creates a "split expense group" that divides that total among
  chosen participants (equal / custom / percentage — same three methods
  the existing per-expense feature supports), and tracks per-participant
  settlement the same way the existing feature does.
- An expense can never be double-counted: once it's part of a group (or
  already individually split via the existing feature), it's excluded from
  every future group's eligible list.
- The existing per-expense Split Expenses feature is completely unmodified
  — no schema change, no API change, no frontend change to what already
  works.
- Both languages (ja/vi) cover every new user-facing string from the start,
  matching this repo's existing i18n convention.

## Non-goals (explicitly deferred)

- **No arbitrary date-range selection.** Only whole calendar months, chosen
  from a month picker — not a custom start/end date UI.
- **No auto-merging of expenses added after a group is created.** A group
  is a snapshot at creation time. An expense entered later for an
  already-grouped month needs its own new group (or the existing
  per-expense flow) — it does not retroactively join an existing group.
- **No editing or deleting a group after creation** (add/remove an
  expense, change participants, change method) — matches the existing
  per-expense Split Expenses feature, which also has no edit/delete today.
- **No unifying the two features' underlying tables.** This was considered
  (a shared `SplitExpense` model with a expense↔split join table instead of
  a direct FK) and explicitly rejected in favor of an additive, isolated
  new feature — see "Rejected approach" below.
- **Personal (non-shared) expenses are never included** in a group, only
  `is_shared = true` ones — matches how the rest of the app (Dashboard,
  ledger) already treats the shared/personal split.

## Rejected approach: unify with the existing `SplitExpense` model

Considered replacing `SplitExpense.expense_id` (a direct FK) with a
many-to-many join table, so one `SplitExpense` row could represent either
one expense (today's behavior) or many (the new monthly case), with the
join table's `UniqueConstraint(expense_id)` enforcing "never split twice"
at the database level for both cases uniformly.

Rejected because it requires changing the existing, already-shipped
per-expense feature's schema and API response shape (`SplitExpenseResponse`
currently has a single `expense_id`; a grouped split has many), which
would force frontend changes to code that isn't broken. The chosen
approach — a fully separate `SplitExpenseGroup` model — costs some
duplicated participant/settlement logic between the two features, but
touches zero existing, working code. This matches how every other finance
sub-feature in this repo (Accounts/Ledger, Goals, Subscriptions, the
existing Split Expenses) is already isolated: its own model file, schema
file, API router, frontend page, and store.

## Decided design

### Data model (`backend/app/models/split_expense_group.py`, new file)

Reuses the existing `SplitMethod` and `SplitStatus` enums from
`app/models/split_expense.py` (equal/custom/percentage; pending/settled) —
no new enums needed.

**`SplitExpenseGroup`**
- `id: UUID` (PK)
- `family_id: UUID` (FK `families.id`, cascade delete, indexed)
- `period_start: date`, `period_end: date` — the selected month's first and
  last day (concrete dates, not a "YYYY-MM" string), so matching against
  `Expense.expense_date` is a plain range comparison
- `created_by_user_id: UUID` (FK `users.id`)
- `method: SplitMethod`
- `status: SplitStatus`, default `PENDING`
- `created_at`, `updated_at`

No uniqueness constraint on `(family_id, period_start, period_end)` —
multiple groups are allowed to cover the same month (e.g. a second group
later, for expenses entered after the first group's snapshot), as long as
no single expense is claimed twice (enforced below).

**`SplitExpenseGroupItem`** (snapshot: which expenses this group covers)
- `id: UUID` (PK)
- `split_expense_group_id: UUID` (FK, cascade delete, indexed)
- `expense_id: UUID` (FK `expenses.id`)
- `UniqueConstraint(expense_id)` — **across the whole table**, not just
  within one group. An expense can belong to at most one group, ever. This
  is the database-level guarantee against double-counting on the group
  side (mirroring how the existing `SplitExpense.expense_id` unique
  constraint guarantees it on the per-expense side).

**`SplitExpenseGroupParticipant`** (per-member allocation + settlement)
- `id: UUID` (PK)
- `split_expense_group_id: UUID` (FK, cascade delete, indexed)
- `participant_user_id: UUID` (FK `users.id`)
- `amount: int`, `CheckConstraint(amount > 0)`
- `percentage: int | None`, `CheckConstraint(percentage between 0 and 100)`
- `is_settled: bool`, default `False`
- `settled_at: datetime | None`
- `UniqueConstraint(split_expense_group_id, participant_user_id)`

This mirrors `SplitExpenseItem` field-for-field, deliberately — same
shape, same settlement semantics, so the frontend's existing per-item
settle UI pattern from `SplitExpensesPage.tsx` can be reused directly for
groups too.

**Migration:** `backend/alembic/versions/0012_add_split_expense_groups.py`
(next number after `0011_add_undo_actions.py`).

### Shared calculation logic (refactor, in scope)

`backend/app/api/v1/split_expenses.py` currently has
`_build_equal_amounts`, `_build_percentage_amounts`, and
`_resolve_split_amounts` (the equal/custom/percentage arithmetic). These
are pure functions with no per-expense-specific dependency other than
their input type. Extract them into `backend/app/services/finance_engine.py`
(the repo's existing home for framework-free domain calculations — goal
progress, subscription totals, cash-flow math) as generic functions over
`(method, participants: list[(user_id, amount | None, percentage | None)],
total_amount)`, so both the existing per-expense endpoint and the new
group endpoint call the same implementation instead of duplicating ~50
lines of arithmetic. `split_expenses.py` is updated to call the extracted
versions; its own behavior and tests are unchanged.

### API (`backend/app/api/v1/split_expense_groups.py`, new router,
mounted at `/families/{family_id}/split-expense-groups`)

**Preview (read-only, no writes):**
```
GET /families/{family_id}/split-expense-groups/preview?period_start=&period_end=
→ { total_amount: int, expenses: [{id, description, category_id, amount, expense_date}, ...] }
```
Queries `Expense` where `family_id` matches, `is_shared = true`,
`expense_date` between `period_start`/`period_end`, and `id` NOT IN any
existing `SplitExpense.expense_id` (old feature) or
`SplitExpenseGroupItem.expense_id` (this feature). Read-only — used by the
frontend to show what a group would contain before the user commits.

**Create:**
```
POST /families/{family_id}/split-expense-groups/
Body: { period_start, period_end, method, participants: [{participant_user_id, amount?, percentage?}] }
```
Re-runs the same eligibility query as preview inside a `locked_write`
(tables: `expenses`, `split_expenses`, `split_expense_groups`,
`split_expense_group_items`, `notifications`) — never trusts a
client-supplied expense list, always recomputes server-side, so a
concurrent create can't double-claim an expense. If the eligible list is
empty, reject with `SPLIT_GROUP_NO_ELIGIBLE_EXPENSES` (422) rather than
creating an empty group. Validates participants with the same rules as
the existing feature (min 2 / max 50, no duplicates, custom amounts must
sum to the total, percentages must sum to 100) via the shared logic
above. On success: creates the `SplitExpenseGroup`, one
`SplitExpenseGroupItem` per eligible expense, one
`SplitExpenseGroupParticipant` per participant, and queues a family
notification (mirroring `create_split_expense`'s pattern).

**List / detail:**
```
GET /families/{family_id}/split-expense-groups/
GET /families/{family_id}/split-expense-groups/{id}
```
Same computed-on-read shape as `SplitExpenseResponse`
(`total_amount`/`settled_amount`/`outstanding_amount` summed from
participants at request time, not stored), plus the list of included
expenses (id, description, category_id, amount, expense_date) so the
frontend can show what's inside the group.

**Settle:**
```
PATCH /families/{family_id}/split-expense-groups/{id}/participants/{participant_id}/settle
Body: { is_settled: bool }
```
Identical semantics to `settle_split_expense_item`: a participant can
settle their own entry; anyone else needs
`require_owner_admin_or_creator`. Recomputes the group's `status`
(`SETTLED` once every participant is, else `PENDING`) the same way
`_refresh_split_status` does today.

No delete/edit endpoint — matches the existing per-expense feature, which
has none either (see Non-goals).

### Frontend (`frontend/src/finance/SplitExpensesPage.tsx`, extended)

A new section on the existing page, below the current per-expense
create-form/list — not merged into the same list, kept visually and
structurally separate since they're different data shapes:

1. A month picker (single month, not a range — reusing the existing
   month-selection UI pattern from the Dashboard where practical).
2. A "Preview" action that calls the preview endpoint and renders the
   included expenses (description, category, amount) plus the total. If
   the total is 0 (nothing eligible), show an empty state and disable
   further action.
3. The same method/participant form the per-expense flow already has
   (equal / custom / percentage, participant checkboxes with custom
   amount/percentage inputs), driven by the previewed total instead of a
   single expense's amount.
4. On confirm, POST to create; the new group appears in its own list
   below ("Đã chia theo tháng" / month-heading per group), with the same
   per-participant settle-toggle UI pattern the per-expense list already
   uses.

New store functions in `frontend/src/finance/stores/splitExpensesStore.ts`
(or a new sibling store, decided at plan time depending on how large the
existing store already is) for: `previewGroup`, `createGroup`,
`loadGroups`, `toggleGroupParticipantSettle`.

New i18n keys under a `finance.splitGroup*` namespace (ja + vi), following
the existing `finance.split*` naming convention in
`frontend/src/i18n/locales/{ja,vi}/common.json`.

## Error handling

- Empty eligible list on create → `SPLIT_GROUP_NO_ELIGIBLE_EXPENSES` (422),
  no group created.
- `period_end < period_start` → `422` (reuse the same validation pattern
  `AnalyticsWindowParams` already uses elsewhere in the codebase).
- Participant validation errors → identical codes/messages to the
  existing feature (`SPLIT_PARTICIPANT_NOT_IN_FAMILY`,
  `SPLIT_CUSTOM_AMOUNT_MISMATCH`, `SPLIT_PERCENTAGE_AMOUNT_MISMATCH`),
  since they're the same shared validation logic.
- Concurrent group creation for overlapping periods → the `locked_write`
  table lock serializes creation; the second request's re-query naturally
  excludes whatever the first request just claimed.

## Testing plan

Integration tests (`backend/tests/test_split_expense_groups_api.py`, new
file, following `test_split_expenses_api.py`'s existing patterns):
- Preview returns the correct expense list and total for a month, and
  excludes personal (non-shared) expenses.
- Create with each of the 3 methods produces correct per-participant
  amounts (equal with a remainder, custom, percentage).
- An expense already in another group is excluded from a second group's
  eligible list (and preview) for the same or overlapping period.
- An expense already split individually (existing `SplitExpense`) is
  excluded.
- Creating with zero eligible expenses is rejected, no rows created.
- Settling a participant updates `is_settled`/`settled_at` and flips the
  group's `status` to `SETTLED` once everyone has.
- Non-family-member participant is rejected.

Frontend: component test for the new preview + create flow (mirroring
`ReceiptUploadForm.test.tsx`'s style of testing a multi-step form), plus
updating the Playwright suite if the existing Split Expenses page already
has coverage there.

## Acceptance criteria

- Selecting September, previewing, and confirming a 3-way equal split
  correctly aggregates all shared September expenses not already claimed
  by another split, divides the total with no yen lost to rounding
  (matches the existing equal-split remainder-distribution behavior), and
  each participant can independently mark themselves settled.
- An expense that was individually split via the existing feature never
  appears in any group's preview or eligible list.
- The existing per-expense Split Expenses feature's tests
  (`test_split_expenses_api.py`) pass unmodified.
