# Advanced Personal Finance Layer - Implementation Plan

Date: 2026-09-04
Spec: docs/superpowers/specs/2026-09-04-advanced-finance-layer-design.md

## Phase 1 - Foundation

- [x] Create deterministic finance engine module in backend service layer.
- [x] Add unit tests for core financial formulas and invariants.
- [x] Document architecture and phase roadmap for features 10-27.

## Phase 2 - Accounts and Typed Ledger

- [x] Add Account model with account_type and balance semantics.
- [x] Add typed ledger transaction model and API.
- [x] Add credit card account fields (limit, cycle dates, minimum payment).
- [x] Add payment posting flow that does not double-count expenses.
- [x] Add tests for purchase vs payment vs transfer correctness.

## Phase 3 - Goals, Subscriptions, Split Expenses

- [x] Add Goal CRUD and contribution/withdrawal flows.
- [x] Add Subscription CRUD and renewal projections.
- [x] Add SplitExpense allocations (equal/custom/percent) and settlement state.
- [x] Add tests for sum-of-splits invariants and status transitions.

Notes:
- Integration tests for phase 3 are implemented but currently blocked locally by Postgres auth for `family_expense_test`.
- Non-integration validation/unit tests for phase 3 are passing in default pytest runs.
- Integration suite is now validated in containerized test DB after enum-migration safety fix (`0009`, `0010`).

## Phase 4 - Analytics Read Models

- [x] Add net worth endpoint driven by account/liability balances.
- [x] Add calendar daily aggregates.
- [x] Add cash-flow buckets and fixed/variable summaries.
- [x] Add dashboard-ready analytics DTOs.

Notes:
- Added analytics endpoints for net worth, cash-flow buckets, calendar day aggregates, and cash-flow summary.
- Added non-integration validation tests for analytics date-window contract and API helper behavior.
- Integration analytics flow is validated in containerized test DB.

## Phase 5 - Import/Export/Undo

- [x] Add CSV import flow with mapping, preview, validation, and dedupe.
- [x] Add CSV/JSON export endpoints and full backup export.
- [x] Add soft-delete + undo window for destructive actions.

Notes:
- Implemented as an expense-focused vertical slice: CSV import preview/commit with dedupe, CSV/JSON expense export, and backup export payload.
- Undo currently uses snapshot-based delete+restore tokens for expenses (`undo_actions`) with expiry; can be generalized to more entities in next phase.
- Phase 3-5 integration tests now pass in backend container against `family_expense_test`.

## Phase 6 - Offline and Sync

- [ ] Add frontend local queue for create/update/delete actions.
- [ ] Add sync operation model and retry states.
- [ ] Add server conflict policy and client reconciliation UX.

## Phase 7 - Insights and Guardrails

- [ ] Add rule-based smart categorization with confidence score.
- [ ] Add deterministic forecast and anomaly endpoints.
- [ ] Add daily safe spending metric as primary dashboard card.

## Phase 8 - Natural Language Input

- [ ] Add parse endpoint returning structured transaction draft only.
- [ ] Add validation and user-confirmed commit path.
- [ ] Add parser output schema tests for multilingual examples.

## Phase 9 - AI Assistant

- [ ] Add tool-scoped finance assistant endpoints/functions.
- [ ] Enforce read-only tool access and redact unnecessary raw data.
- [ ] Add prompt and tool contract tests.

## Phase 10 - Hardening

- [ ] Expand edge-case tests (leap year, month boundary, currency, conflicts).
- [ ] Add e2e UX checks for dashboard, undo, import, and offline behavior.
- [ ] Performance and accessibility pass.
