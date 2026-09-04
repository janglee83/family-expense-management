# Advanced Personal Finance Layer - Design Spec

Date: 2026-09-04
Scope: Features 10-27

## Objectives

Build one coherent finance system that extends the existing family expense core.
The system must be deterministic for financial math, AI-safe for assistance flows,
and compatible with existing expense/category/family data.

## Architectural Direction

Layering:

UI
-> State/Hooks
-> Domain Services
-> Repositories
-> Database

Primary backend modules:

- TransactionService
- AccountService
- GoalService
- SubscriptionService
- CreditCardService
- AnalyticsService
- ForecastService
- InsightService
- CategorizationService
- ImportExportService
- SyncService
- AIAssistantService

Core rule: Financial calculations live in services, not in API handlers or React components.

## Financial Invariants

1. Transfer is never counted as expense.
2. Credit card purchase counts as expense and liability increase, but not immediate bank cash out.
3. Credit card payment reduces bank cash and liability, and is never a second expense.
4. Goal contribution/withdrawal are balance moves, not expense/income.
5. Net worth is derived from accounts and liabilities, not duplicated summary rows.

## Domain Model Extension

Planned entities (normalized):

- Account
- CreditCardAccount (or Account subtype fields)
- LedgerTransaction
- Goal
- GoalContribution
- Subscription
- SplitExpense
- ImportJob
- ExportJob
- SyncOperation
- CategorizationRule

Keep backward compatibility:

- Existing expenses remain valid.
- Existing dashboard can consume new analytics read models without breaking old endpoints.

## Feature Mapping

10 Savings Goals:
- Goal + contribution service (progress, remaining, estimated completion)

11 Net Worth:
- Derived analytics from account balances and liabilities

12 Credit Card Management:
- LedgerTransaction types with explicit payment semantics

13 Calendar View:
- Daily aggregate read model from ledger transactions

14 Cash Flow:
- Daily/weekly/monthly cash-flow buckets

15 Fixed vs Variable:
- Category-level default + transaction-level override classification

16 Subscriptions:
- Subscription entity and monthly/yearly totals with upcoming renewals

17 Split Expenses:
- SplitExpense lines linked to an origin expense with pending/settled states

18 Import:
- ImportJob pipeline: upload -> mapping -> validate -> preview -> dedupe -> commit

19 Export/Backup:
- Deterministic export endpoints (CSV/JSON first)

20 Offline-first:
- Frontend local persistence + sync queue + conflict strategy

21 Undo:
- Soft-delete window + undo token workflow for destructive actions

22 Smart Categorization:
- Deterministic merchant/category rules first, then adaptive historical scoring

23 Natural Language Input:
- Parse-only AI stage -> validation -> preview -> explicit user confirm -> mutation service

24 AI Financial Assistant:
- Tool-restricted assistant access, no direct DB write path

25 Spending Forecast:
- Transparent formula-based projection

26 Anomaly Detection:
- Deterministic baseline (moving average/stddev) with confidence thresholds

27 Daily Spending Limit:
- Derived metric from budget, obligations, and remaining days

## AI Safety Contract

AI may:
- parse
- classify
- explain
- recommend

AI may not:
- mutate database directly
- delete records
- execute payments
- bypass user confirmation

All write actions must pass deterministic application services.

## Delivery Phases

Phase 1: architecture + domain math foundation
Phase 2: accounts + typed ledger transactions + credit card correctness
Phase 3: goals + subscriptions + split expenses
Phase 4: analytics views (calendar, cash flow, net worth)
Phase 5: import/export + undo
Phase 6: offline queue + sync conflict handling
Phase 7: categorization + forecast + anomaly + daily limit on dashboard
Phase 8: natural-language parser integration (parse preview only)
Phase 9: AI financial assistant with strict tool boundaries
Phase 10: comprehensive test and UX refinement

## Current Implementation in This Iteration

Implemented deterministic backend finance engine and unit tests for:

- ledger impact and anti-double-counting rules
- net worth delta
- savings goal progress and estimated completion
- subscription monthly/yearly totals
- deterministic spending forecast
- anomaly detection
- daily spending limit
- daily/weekly/monthly cash-flow bucketing

These functions are reusable by upcoming API and frontend phases.
