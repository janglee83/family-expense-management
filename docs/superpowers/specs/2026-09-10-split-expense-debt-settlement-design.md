# Design: Multi-Month Range + Editable Groups + Real Debt Settlement for Split Expense Groups

Date: 2026-09-10
Status: Approved for planning

## Context

The "Chia theo tháng" (split expense groups) feature, built in an earlier session
(`docs/superpowers/specs/2026-09-08-split-expense-groups-design.md`), aggregates a
family's shared (`is_shared=true`) expenses over a period and splits the total
among chosen participants by equal/custom/percentage share.

Three problems, reported directly against the live app:

1. **Period is locked to exactly one calendar month.** The backend never actually
   enforced this — `period_start`/`period_end` already accept any `period_end >=
   period_start` range. The restriction is purely the frontend's `<input
   type="month">`, which can only produce a single month. Users want to pick an
   arbitrary **from month → to month** range (including a single month, i.e.
   from == to).
2. **A group can never be changed once created.** The original spec explicitly
   listed "no edit" as a non-goal. In practice, a family finds out mid-month that
   the split they picked was wrong (wrong participants, wrong method) and has no
   way to fix it short of leaving bad data in place forever.
3. **"Settled" doesn't track a real debt.** `SplitExpenseGroupParticipant` stores
   each participant's fair share and a self-reported `is_settled` checkbox — it
   never looks at `Expense.payer_user_id` to know who actually paid. There is no
   concept of "who owes whom." A family of 3 where A paid 100, B paid 20, C paid
   60 (fair share 60 each) currently just shows three independent "your share is
   60, tick when paid" rows, with no indication that the real-world fix is one
   transfer: B pays A 40.

This spec also covers a nicer custom month-range picker component (replacing the
native `<input type="month">`), since native date/month inputs render with
browser/OS chrome that doesn't track this app's light/dark theme tokens and looks
inconsistent across browsers.

Two smaller, already-shipped changes from the same conversation are **not** part
of this spec (no design was needed — bounded fixes, already implemented and
verified): removing the old "Tạo chia chi tiêu" (create a per-expense split) card
from `SplitExpensesPage.tsx`, adding an in-app light/dark theme toggle, and
unifying the two inconsistent navigation bar styles (`FamilyDetail`'s flat
`outline` buttons vs `FinanceNav`'s `surface-card` tab bar).

## Goals

- Let a group's period span multiple calendar months (or a single one), chosen
  via a proper "from month → to month" range picker.
- Let a group be edited after creation: change period, method, and/or
  participants, with the system re-deriving eligible expenses and re-computing
  everything from scratch.
- Replace "each participant's self-reported settled flag" with a real computed
  debt graph: given who actually paid each included expense and each
  participant's fair share, compute the minimum set of directed payments
  (`from_user → to_user: amount`) that settles all balances, and track
  settlement status per payment, not per participant.

## Non-goals

- No cap on how many months a range can span (the backend already has none;
  this spec doesn't add one). If this turns out to need a limit later, it's a
  cheap follow-up.
- No partial/field-level PATCH semantics for editing a group — editing replaces
  period + method + participants together and recomputes everything, mirroring
  create. There is no way to edit just one field's worth of a group.
- No attempt to preserve prior settlement state across an edit (see "Editing a
  group" below) — edits always reset every settlement to unsettled.
- Debt settlement stays scoped to a single group. It does not net balances
  across multiple groups, across months, or against the older per-expense
  `SplitExpense` feature. Confirmed directly with the user: selecting a range,
  previewing what's in it, and settling it is a self-contained action per group.
- The older per-expense `SplitExpense`/`SplitExpenseItem` feature (now
  create-only via API, no UI entry point after this session's earlier bounded
  fix) is untouched by this spec.

## Decided Design

### 1. Data model: a settlement table replaces per-participant settling

New table, `split_expense_group_settlements`, one row per directed payment the
algorithm computes:

```python
class SplitExpenseGroupSettlement(Base):
    __tablename__ = "split_expense_group_settlements"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_split_expense_group_settlements_amount_positive"),
        CheckConstraint(
            "from_user_id <> to_user_id",
            name="ck_split_expense_group_settlements_distinct_users",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    split_expense_group_id: Mapped[uuid.UUID] = mapped_column(
        PGUUID(as_uuid=True), ForeignKey("split_expense_groups.id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    is_settled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
```

`SplitExpenseGroup` and `SplitExpenseGroupItem` are unchanged.
`SplitExpenseGroupParticipant` is **kept as-is** (it still records each
participant's fair share for display — "your share this month is X") but its
`is_settled`/`settled_at` columns become informational leftovers of the old
model; the API stops writing to them (see below) and the frontend stops
reading them for settle actions. They are not dropped in this migration —
removing dead columns is a separate, low-risk cleanup that doesn't need to
block this feature, and keeping them costs nothing.

Migration `0013_add_split_expense_group_settlements.py`: creates the new table
only (see the model above for exact columns/constraints).

### 2. The settlement algorithm (`finance_engine.py`)

A new, pure, framework-free function alongside `resolve_equal_split_amounts` /
`resolve_percentage_split_amounts`:

```python
T = TypeVar("T")

@dataclass(frozen=True)
class DebtSettlement(Generic[T]):
    from_id: T
    to_id: T
    amount: int


def compute_debt_settlements(net_balance_by_id: dict[T, int]) -> list[DebtSettlement[T]]:
    """Greedy largest-creditor/largest-debtor matching.

    `net_balance_by_id` is `paid - fair_share` per person: positive means the
    person is owed money (creditor), negative means the person owes money
    (debtor). The caller guarantees the values sum to zero (paid and fair
    shares are both derived from the same total).

    True minimum-transaction debt simplification is NP-hard in general
    (it's a set-partition problem). This greedy heuristic — repeatedly settle
    the largest creditor against the largest debtor — is what Splitwise and
    similar tools use in practice, and is provably optimal for small n
    (family-sized groups).
    """
```

Implementation: split into creditors (`balance > 0`) and debtors (`balance <
0`, stored as positive owed amounts), sort both descending, repeatedly match
the head of each list, emit a `DebtSettlement(from=debtor, to=creditor,
amount=min(credit, debt))`, decrement both by that amount, drop whichever
side(s) hit zero, repeat until both lists are empty. `0` balances are excluded
up front (they're neither creditors nor debtors). No rounding edge cases are
possible here: fair shares are already resolved (via the existing
`resolve_equal_split_amounts`/`resolve_percentage_split_amounts`, which
distribute remainders so they sum exactly to the total) against the same
total that "amount paid" sums to, so `sum(net_balance_by_id.values()) == 0`
always holds by construction.

### 3. API changes (`split_expense_groups.py`)

**Shared helper.** Extract a new private function used by preview, create, and
edit alike — it does no database writes, only reads + pure computation:

```python
async def _build_settlement_plan(
    family_id: uuid.UUID,
    period_start: date,
    period_end: date,
    method: SplitMethod,
    participants: list[SplitParticipantInput],
    session: AsyncSession,
    *,
    exclude_group_id: uuid.UUID | None = None,
) -> tuple[list[Expense], list[tuple[uuid.UUID, int, int | None]], list[DebtSettlement[uuid.UUID]]]:
    """Returns (eligible expenses, resolved per-participant fair shares, computed settlements)."""
```

`exclude_group_id` lets editing re-run eligibility while ignoring the group's
own current `SplitExpenseGroupItem` rows (see "Editing a group" below) instead
of first deleting them — cheaper and avoids a half-committed state if
something later in the request fails.

Inside: reuses `_find_eligible_expenses` (extended with an `exclude_group_id:
uuid.UUID | None = None` param; when given, the `already_in_a_group` subquery
adds `.where(SplitExpenseGroupItem.split_expense_group_id != exclude_group_id)`
so the group's own current items don't count as "already claimed" against
itself — `None`, the default, keeps today's behavior unchanged for preview and
create), then
`_validate_participants` (unchanged), then a **new** validation —
`_validate_all_payers_included` — that every `Expense.payer_user_id` among the
eligible expenses is present in the chosen participant set (see "Payer/
participant consistency" below), then `_resolve_group_split_amounts`
(unchanged), then builds `paid_by_user` from `expense.payer_user_id` /
`expense.amount`, `fair_share_by_user` from the resolved amounts, computes
`net_balance_by_user = {uid: paid_by_user.get(uid, 0) - fair_share_by_user[uid]
for uid in participant_ids}`, and calls `compute_debt_settlements`.

**`GET /preview`** (existing route, unchanged signature) — additive only:
`SplitExpenseGroupExpenseSummary` gains a `payer_user_id: uuid.UUID` field so
the frontend can show who paid each eligible expense. No behavior change.

**`POST /preview-settlement`** (new) — body: `{period_start, period_end,
method, participants}` (same shape as `CreateSplitExpenseGroupRequest`).
Calls `_build_settlement_plan` and returns just the computed settlements
(`from_user_id`, `to_user_id`, `amount`) — nothing is persisted. This is what
powers the "see who owes whom before you confirm" step once the user has
picked a method and participants, without duplicating the computation between
preview and create.

**`POST /`** (create, existing route) — now calls `_build_settlement_plan`
instead of resolving amounts inline, persists `SplitExpenseGroupItem` and
`SplitExpenseGroupParticipant` rows as before (participant rows still carry
`amount`/`percentage` for the "your fair share" display, `is_settled` left at
its column default of `False` and no longer meaningfully read), and **also**
persists one `SplitExpenseGroupSettlement` row per computed settlement.

**`PATCH /{group_id}`** (new) — body: same shape as create
(`period_start`, `period_end`, `method`, `participants`). Requires
`require_owner_admin_or_creator(membership, group.created_by_user_id)` —
unlike settling (any participant can toggle their own payment), editing
changes everyone's numbers and is restricted the same way deleting/settling
someone else's split already is elsewhere in this codebase. Inside a
`locked_write`: calls `_build_settlement_plan(..., exclude_group_id=group.id)`
against the (possibly changed) period; if that raises "no eligible expenses,"
the edit is rejected the same way create is (`SPLIT_GROUP_NO_ELIGIBLE_EXPENSES`,
422) and nothing changes. On success: delete the group's existing
`SplitExpenseGroupItem`, `SplitExpenseGroupParticipant`, and
`SplitExpenseGroupSettlement` rows, update `group.period_start`/`period_end`/
`method`, insert fresh item/participant/settlement rows from the plan, set
`group.status = SplitStatus.PENDING` (a fresh settlement graph starts
unsettled), and queue a family notification distinct from the create one
(e.g. "{user} updated the split for {period}").

**`PATCH /{group_id}/settlements/{settlement_id}/settle`** (new, replaces
`PATCH /{group_id}/participants/{participant_id}/settle`) — same shape as the
route it replaces (`{is_settled: bool}` body), but operates on a
`SplitExpenseGroupSettlement` row. Permission check: the actor must be either
`from_user_id` or `to_user_id` on that settlement (either side of a payment
can confirm it happened) — otherwise `require_owner_admin_or_creator`, same
fallback the old route used. The old participant-settle route is deleted
outright (this feature has no production users yet — it was only just built
and deployed this session — so there's no migration/back-compat concern).

**`_refresh_group_status`** now reads settlements instead of participants:

```python
async def _refresh_group_status(group: SplitExpenseGroup, session: AsyncSession) -> None:
    settlements = await _get_group_settlements(group.id, session)
    group.status = SplitStatus.SETTLED if all(s.is_settled for s in settlements) else SplitStatus.PENDING
```

Note `all(...)` on an empty list is `True` — a group whose net balances all
happened to be zero (e.g. one person paid for everything and is also the only
participant, or paid amounts already exactly matched fair shares) has zero
settlements to make and is correctly `SETTLED` immediately, not stuck
`PENDING` forever waiting for a settlement that will never exist. This is a
deliberate behavior difference from the old participants-based check (which
required a non-empty list).

**`SplitExpenseGroupResponse`** changes:
- Drops nothing; `participants` stays (still shows each person's fair share).
- Gains `settlements: list[SplitExpenseGroupSettlementResponse]`
  (`id`, `from_user_id`, `to_user_id`, `amount`, `is_settled`, `settled_at`).
- `total_amount` keeps its current meaning: `sum(expense.amount for expense in
  expenses)` — the period's total shared spending, independent of who owes
  whom.
- `settled_amount` / `outstanding_amount` change meaning: they now describe
  the settlement graph, not participant shares —
  `settled_amount = sum(s.amount for s in settlements if s.is_settled)`,
  `outstanding_amount = sum(s.amount for s in settlements if not s.is_settled)`.
  This is a genuine response semantics change from the shipped version (both
  numbers used to sum participant shares); flagged here explicitly since nothing
  else in the codebase depends on the old meaning yet.

### 4. Payer/participant consistency

An expense contributes its full amount to `paid_by_user[payer]` regardless of
whether the payer chose to also be a *participant* (someone splitting the
cost). If a payer of an eligible expense is left out of the chosen
participant set, their paid amount has nowhere to net against — the debt
graph would be wrong (money "paid" by someone the system pretends doesn't
exist in this split). Rather than silently auto-adding them or silently
ignoring their payment, `_validate_all_payers_included` rejects the request:

```
422 SPLIT_GROUP_PAYER_NOT_IN_PARTICIPANTS — "Every payer of an included expense must be a participant"
```

This runs after `_find_eligible_expenses` and before `_resolve_group_split_amounts`,
in both create and edit (inside `_build_settlement_plan`) and in the new preview-settlement
endpoint (so the frontend can surface this before the user even attempts to submit).

### 5. Editing a group resets settlement progress — by design

Changing the period, method, or participant set fundamentally changes the
debt graph — there's no principled way to map "B owed A 40, already marked
paid" onto a recomputed graph where, say, C is now a participant and the
numbers are entirely different. Rather than attempt a partial reconciliation
that could silently misrepresent who's actually settled, an edit always wipes
and regenerates every settlement row unsettled, and the group status resets to
`PENDING` (unless the new graph happens to be empty, in which case it's
immediately `SETTLED` per the rule above).

The frontend is responsible for warning before this happens: if any of the
group's current settlements has `is_settled: true`, the edit form shows a
confirmation ("Sửa lại sẽ tính lại toàn bộ khoản nợ — các khoản đã đánh dấu đã
trả sẽ cần xác nhận lại") before the user can submit the edit. The backend
does not need a confirmation flag for this — it's a pure UX guard, not a data
integrity one; the backend's job is just to always do the correct full
recompute.

### 6. Frontend: month-range picker component

Replaces the single `<input type="month">` in the "Chia theo tháng" form with
a new `MonthRangePicker` component (`src/finance/MonthRangePicker.tsx`):

- Two side-by-side custom comboboxes ("Từ tháng" / "Đến tháng"), each built
  from the existing `DropdownMenu` primitives (matching `LanguageSwitcher`'s
  and the new `ThemeToggle`'s pattern) rather than a native `<select>` or
  native `<input type="month">` — both of which render browser/OS chrome that
  doesn't track this app's `--color-*` theme tokens.
- Each combobox shows a scrollable month/year grid (or a flat list of the
  trailing ~24 months plus a manual year stepper — implementer's call on
  exact layout, as long as it's fully theme-token-styled and keyboard
  operable).
- Constraint: selecting a "to" month before the current "from" month pushes
  "from" forward to match (never produces `period_end < period_start`); the
  reverse for "from" past "to". Same month for both is valid (single-month
  split, the common case).
- Emits `{ fromMonth: string; toMonth: string }` in `"YYYY-MM"` form; the
  page converts `fromMonth` → first-of-month as `period_start` and `toMonth`
  → last-of-month (via `calendar`-equivalent last-day-of-month logic, already
  a solved problem elsewhere in this codebase's date handling) as
  `period_end`.

### 7. Frontend: create/edit flow

The "Chia theo tháng" card becomes a single reusable form (used for both
"create new" and "edit existing," which is why it needs to already be able to
prefill from an existing group's period/method/participants):

1. Pick a range with `MonthRangePicker`.
2. "Xem trước" (preview) → calls `GET /preview` → shows the eligible expenses
   list, each line now showing **who paid** (resolved client-side via the
   existing `memberNameById` map against the new `payer_user_id` field) and
   the amount, plus the period total.
3. Choose split method + participants (as today) — client-side, cheaply
   pre-validate that every payer shown in step 2 is checked as a participant,
   surfacing the same message the server would (`422
   SPLIT_GROUP_PAYER_NOT_IN_PARTICIPANTS`) before even attempting submit.
4. "Xem nợ" (or automatically, on every change to method/participants once
   valid) → calls `POST /preview-settlement` → renders the computed
   settlements ("B trả A: 40") as the confirmation view.
5. Submit → `POST /` (create) or `PATCH /{group_id}` (edit, if this was
   opened from an existing group's "Sửa" action) → group list refreshes.

Each group in the list gains a "Sửa" (edit) button (visible to the creator,
owner, or admin, mirroring the backend's edit permission) that opens the same
form pre-filled from the group's current period/method/participants and
routes through step 4→5 above ending in `PATCH` instead of `POST`. If the
group already has any settled settlement, clicking "Sửa" shows the warning
from section 5 before the form opens.

The per-group settlement list replaces the current "participant: share amount
+ settle toggle" rows with "from → to: amount" rows, each with its own
mark-settled toggle (calling the new
`PATCH /{group_id}/settlements/{settlement_id}/settle`), visible/actionable
only to the two people on that edge (or an owner/admin), matching the backend
permission rule.

### 8. Error handling

New/changed error codes (added to `frontend/src/api/errorI18n.ts` alongside
the existing `SPLIT_GROUP_*` codes):

- `SPLIT_GROUP_PAYER_NOT_IN_PARTICIPANTS` (422) — new, section 4.
- `SPLIT_EXPENSE_GROUP_SETTLEMENT_NOT_FOUND` (404) — new, for the settle
  route's 404 case (mirrors the deleted participant-not-found code).
- `SPLIT_EXPENSE_GROUP_PARTICIPANT_NOT_FOUND` — removed (no route references
  a participant by ID anymore).

### 9. Testing plan

Backend (`backend/tests/test_split_expense_groups_api.py`, extended):

- `finance_engine` unit tests for `compute_debt_settlements`: the exact
  A/B/C example from this conversation (100/20/60 paid, equal split → single
  `B→A: 40` settlement); a 4-person case needing 2+ settlements; an
  all-balanced case (paid == fair share for everyone) → empty list; a
  single-payer case (one person paid everything) → one settlement per other
  participant, all owed to the payer.
- Integration: create a group, assert the response's `settlements` matches
  the expected debt graph (not just that participants' shares are right).
- Integration: create with a payer excluded from `participants` → 422
  `SPLIT_GROUP_PAYER_NOT_IN_PARTICIPANTS`.
- Integration: `POST /preview-settlement` returns the same settlements a
  subsequent `POST /` would persist, without creating anything (list groups
  before/after, assert unchanged).
- Integration: edit a group (change method from equal to custom, or change
  participants) → old settlements gone, new ones reflect the new plan, status
  reset to `PENDING`.
- Integration: edit a group with a settled settlement → settlement comes back
  unsettled after edit.
- Integration: edit a group whose new period has zero eligible expenses → 422,
  group unchanged (verify via a subsequent `GET`).
- Integration: settle a settlement as the debtor, as the creditor, and as an
  unrelated member (last one rejected unless owner/admin).
- Integration: a group whose computed settlements are empty (balanced
  payments) is immediately `status: "settled"`.

Frontend:
- `MonthRangePicker` unit tests: from/to clamp behavior, `YYYY-MM` output
  shape, keyboard navigation smoke test.
- Store/page-level test for the preview → preview-settlement → submit flow
  (mocked API), and for the edit flow prefill + `PATCH` call.

## Acceptance Criteria

- A group can be created spanning multiple calendar months via a custom range
  picker (no native `<input type="month">` remaining in this flow).
- A group can be edited after creation (period, method, participants), fully
  recomputing its debt graph and resetting settlement progress, with a
  frontend warning when that would discard already-settled payments.
- Creating or editing a group computes and stores a minimal set of directed
  settlements (`from → to: amount`) derived from actual `payer_user_id` data,
  not a self-reported per-participant checkbox.
- The UI shows, before final submit, both the raw expense/payer breakdown for
  the chosen range and the resulting settlement plan.
- All acceptance criteria from the original split-expense-groups spec continue
  to hold except where explicitly superseded above (single-payer-owns-
  settlement instead of per-participant settling; period may span months).
