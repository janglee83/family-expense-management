# Trip Planning (Kế hoạch đi chơi) — Design

## 1. Purpose

Add a "Trips" feature that lets a family plan an outing/trip with an optional budget and a day-by-day itinerary, and link real expenses (already recorded elsewhere in the app) to specific trips and specific itinerary items — turning "how much did our Đà Lạt trip actually cost" into a first-class question the app can answer, without duplicating any financial logic that already exists (expenses, sharing, splitting).

## 2. Scope

**In scope:**
- A `Trip` entity owned by a family, with name, destination, date range, optional total budget, cancel/status.
- A day-grouped itinerary: each item has a date, optional time, title, description, optional link, and an optional planned amount.
- Linking real `Expense` records to a trip and (optionally) to a specific itinerary item — many expenses may link to the same item.
- A new top-level "Trips" nav page (family-scoped via a selector, same pattern as the dashboard) plus a trip detail page.
- `ExpenseForm` gains two new optional fields: trip, then (once a trip is picked) itinerary item.

**Out of scope (explicitly deferred):**
- No new split-expense engine or "split this trip" shortcut — a trip's shared expenses are ordinary expenses with `is_shared=true`, already picked up by the existing Split Expenses page when the user selects the trip's date range there manually. No code changes to that feature.
- No calendar/hour-grid itinerary UI — the itinerary renders as a day-grouped timeline list (validated via visual mockup), not a Google-Calendar-style time grid. A true hour-grid view, if ever wanted, is a separate future iteration.
- No reminders/notifications for upcoming trips or itinerary items.
- No attachments/photos on itinerary items — `link_url` is a plain text URL field, not file upload.

## 3. Data Model

Follows this codebase's existing model conventions (see `backend/app/models/goal.py`, `expense.py`): UUID primary keys, `family_id` FK with `ondelete="CASCADE"`, integer amounts (no decimals — matches JPY/VND, which don't use minor units), `created_at`/`updated_at` timestamps, `CheckConstraint`s for positivity.

### `trips`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `family_id` | UUID FK → `families.id`, `ondelete="CASCADE"` | |
| `created_by_user_id` | UUID FK → `users.id` | |
| `name` | String(200), not null | |
| `destination` | String(200), nullable | free text, no geocoding |
| `start_date` | Date, not null | |
| `end_date` | Date, not null | `CheckConstraint("end_date >= start_date")` |
| `budget_amount` | Integer, nullable | `CheckConstraint("budget_amount IS NULL OR budget_amount > 0")` |
| `is_cancelled` | Boolean, not null, default false | mirrors `Goal.is_paused` |
| `created_at`/`updated_at` | DateTime(timezone=True) | |

Display status is **computed, not stored**: `cancelled` if `is_cancelled`; else `upcoming` if today < `start_date`; `ongoing` if `start_date` ≤ today ≤ `end_date`; `completed` if today > `end_date`.

### `trip_participants`
| Column | Type | Notes |
|---|---|---|
| `trip_id` | UUID FK → `trips.id`, `ondelete="CASCADE"` | part of composite PK |
| `user_id` | UUID FK → `users.id` | part of composite PK |

Pure join table — who is actually going on the trip. Every family member can still see and interact with the trip regardless of participant list (see §6 permissions); this table is informational/for-later-use only in this iteration (no split-expense auto-integration, see §2).

### `trip_itinerary_items`
| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `trip_id` | UUID FK → `trips.id`, `ondelete="CASCADE"` | |
| `family_id` | UUID FK → `families.id`, `ondelete="CASCADE"` | denormalized for query convenience, mirrors `GoalEntry.family_id` |
| `created_by_user_id` | UUID FK → `users.id` | |
| `title` | String(200), not null | |
| `description` | String(1000), nullable | |
| `link_url` | String(2048), nullable | plain text URL, no validation beyond max length |
| `item_date` | Date, not null | `CheckConstraint`-equivalent enforced at the API layer: must fall within the parent trip's `[start_date, end_date]` (a DB-level check across tables isn't practical with a simple `CheckConstraint`, so this is application-layer validated in the router, same pattern the codebase already uses for split-expense-group period validation) |
| `item_time` | Time, nullable | null = "no specific time" (renders without a time badge) |
| `planned_amount` | Integer, nullable | `CheckConstraint("planned_amount IS NULL OR planned_amount > 0")` |
| `created_at`/`updated_at` | DateTime(timezone=True) | |

### `expenses` (existing table, 2 new nullable columns)
| Column | Type | Notes |
|---|---|---|
| `trip_id` | UUID FK → `trips.id`, `ondelete="SET NULL"`, nullable | |
| `trip_itinerary_item_id` | UUID FK → `trip_itinerary_items.id`, `ondelete="SET NULL"`, nullable | only meaningful when `trip_id` is also set |

**Deliberately `SET NULL`, not `CASCADE`**, on both new expense FKs: deleting a trip or an itinerary item must never delete a real financial record — it only unlinks it. Application-layer validation on expense create/update enforces `trip_itinerary_item_id`'s parent item actually belongs to `trip_id` when both are provided.

## 4. API

Nested under family, mirroring the existing `goals`/`subscriptions` routers:

- `POST /families/{family_id}/trips` · `GET /families/{family_id}/trips` (list)
- `GET /families/{family_id}/trips/{trip_id}` (detail — includes itinerary items and a computed summary: sum of `planned_amount` across items, sum of actual linked-expense amounts, vs `budget_amount`)
- `PATCH /families/{family_id}/trips/{trip_id}` (name/destination/dates/budget/`is_cancelled`)
- `DELETE /families/{family_id}/trips/{trip_id}`
- `POST /families/{family_id}/trips/{trip_id}/participants/{user_id}` · `DELETE .../participants/{user_id}`
- `POST /families/{family_id}/trips/{trip_id}/items` · `PATCH .../items/{item_id}` · `DELETE .../items/{item_id}`
- Existing `POST/PATCH /families/{family_id}/expenses[/{expense_id}]` request schemas gain two optional fields: `trip_id`, `trip_itinerary_item_id`.

## 5. Frontend

- **`/trips`** — new top-level nav item (sidebar, alongside Dashboard/Families). Family selector at the top (same pattern the dashboard already uses to pick the active family — trips remain family-owned data even though the nav entry is top-level). Below it: a card list of the selected family's trips — name, destination, date range, status badge, a small budget bar (planned-from-items vs `budget_amount` vs actual spent).
- **`/trips/:tripId`** — detail page. Day-grouped itinerary list (the "Option A" layout validated via the visual-companion mockup: each day is a header, items below it sorted by time, each item showing time/title/description-snippet/planned amount, with linked-expenses total and a way to view them). Add/edit/delete itinerary item via a modal (reusing `Field`/`Modal`/`Button` primitives, matching the Foundation plan's per-field validation pattern). Trip-level edit (name/dates/destination/budget/participants/cancel) via the same modal pattern used elsewhere (e.g. `AddMemberForm`'s style for participant management).
- **`ExpenseForm`** gains two new optional `Field`s: "Kế hoạch" (trip select, populated from the family's trips) and, once a trip is chosen, "Mục lịch trình" (item select, populated from that trip's items only — disabled/hidden until a trip is picked).
- Reuse `DateRangePicker` (already built for Split Expenses) for the trip create/edit form's date range.

## 6. Permissions

Every family member can view a trip and its itinerary, and can add/edit itinerary items and link expenses to it (same openness as adding an `Expense` today). Only the trip's creator, or a family `owner`/`admin`, may edit the trip's own fields (name/dates/destination/budget/cancel) or manage `trip_participants` — this mirrors the existing rule for `SplitExpenseGroup` (`backend/app/api/v1/split_expenses.py`'s `require_owner_admin_or_creator`), reused verbatim rather than inventing a new permission model.

## 7. Validation

- Trip: `name` required (non-empty after trim); `end_date >= start_date`; `budget_amount`, if provided, > 0.
- Itinerary item: `title` required; `item_date` must fall within `[trip.start_date, trip.end_date]`; `planned_amount`, if provided, > 0.
- Expense linking: `trip_itinerary_item_id` may only be set alongside a `trip_id`, and the referenced item must belong to that trip (both application-layer checks, returning a 422 with a field-attributable error the frontend renders via the established per-field `Field` error pattern — not a generic banner).
- Deleting a trip or itinerary item never deletes linked expenses — only unlinks (`SET NULL`), per §3.

## 8. Testing

- Backend: unit tests per endpoint (create/update/delete for trips, items, participants); cascade behavior (deleting a trip/item unlinks but doesn't delete expenses); permission tests (a non-creator, non-owner/admin member cannot edit/delete the trip or manage participants, but can still add itinerary items and link expenses).
- Frontend: per-field validation tests for the trip and itinerary-item forms (following the pattern established by the UI-redesign Foundation plan — `Field`'s `error` prop, not a top banner, for every field-attributable failure); a render test confirming the itinerary list groups correctly by day; an `ExpenseForm` test confirming the itinerary-item dropdown only populates after a trip is selected and stays empty/disabled otherwise.

## 9. Out of Scope (recap)

- Split-expense auto-integration (§2) — deliberately deferred; the existing Split Expenses page already works unmodified for trip-linked shared expenses via manual date-range selection.
- Hour-grid/Google-Calendar-style itinerary view (§2) — day-grouped list only, for this iteration.
- Reminders/notifications, file attachments on itinerary items.
