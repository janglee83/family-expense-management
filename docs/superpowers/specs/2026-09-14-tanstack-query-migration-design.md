# TanStack Query Migration — Design

## 1. Purpose

This is phase 1 of a two-phase initiative. The user wants to modernize the
frontend: a full visual redesign (phase 2) built on top of a solid,
consistent data-fetching/caching layer (phase 1, this spec).

Today the frontend has two competing ways of loading server data:

1. Five components fetch directly with `useEffect` + local `useState`
   (`FamilyList`, `FamilyDetail`, `ExpenseList`, `ReceiptList`,
   `NotificationCenter`).
2. Five Zustand stores under `frontend/src/finance/stores/` mix server
   state (fetched lists, loading/error flags) with UI-only state (form
   fields, which modal is open) in a single store.
3. `AuthContext` re-implements its own ad-hoc session-fetching state
   machine (`fetchCurrentUser` → fallback `refreshSession` → refetch).

None of these share a cache. Every component remount re-fetches from
scratch, and there is no single source of truth for "is this data stale."
This spec replaces all of it with **TanStack Query** for server state,
while keeping Zustand for UI-only state that genuinely isn't server data
(form drafts, open/closed modal, selected row).

Goal of this phase: identical behavior and UI, but all server data goes
through one caching mechanism, tuned for a slow deploy environment (long
`staleTime`, no refetch-on-focus, explicit invalidation after writes).
Phase 2 (a separate spec) redesigns the visuals on top of this.

## 2. Non-Goals

- No visual/CSS/component redesign in this phase. Loading and error UI
  keep their current shape (same skeletons/spinners/messages), just
  sourced from query/mutation state instead of local state.
- No optimistic updates. Mutations invalidate and refetch; instant-feel
  optimistic UI is left for phase 2 if wanted there.
- No change to any `*Api.ts` function signature or behavior — they stay
  plain, framework-agnostic async functions and become the
  `queryFn`/`mutationFn` implementations verbatim.
- No backend changes.

## 3. Dependencies

Add to `frontend/package.json`:

- `@tanstack/react-query`
- `@tanstack/react-query-devtools` (dev-only; lazy-imported and rendered
  only when `import.meta.env.DEV` is true, so it never ships in the
  production bundle)

## 4. QueryClient setup

New file `frontend/src/api/queryClient.ts`:

- Single shared `QueryClient` instance.
- Default `queries` options:
  - `staleTime`: 5 minutes
  - `gcTime`: 30 minutes
  - `refetchOnWindowFocus`: false
  - `retry`: 1
- Default `mutations` options:
  - `retry`: 0 (never silently retry a write)

`App.tsx` wraps the tree in `QueryClientProvider` (inside
`BrowserRouter`, wrapping `SnackbarProvider`/routes). The React Query
Devtools panel is rendered as a sibling, dev-only.

Long `staleTime` is safe because every mutation explicitly invalidates
the query keys it affects (section 5) — passive background refetching is
what gets suppressed, not correctness after a write.

## 5. Query key design

One key factory per domain, colocated with that domain's existing
`*Api.ts` file. All family-scoped data is keyed under the family id so
invalidation never crosses families.

| Domain | File | Key factory (example) |
|---|---|---|
| auth | `auth/authQueries.ts` | `authKeys.currentUser = ["auth", "me"]` |
| families | `families/familyQueries.ts` | `familyKeys.list()`, `familyKeys.detail(familyId)` |
| expenses | `expenses/expenseQueries.ts` | `expenseKeys.categories(familyId)`, `expenseKeys.list(familyId)` |
| finance: accounts ledger | `finance/queries/accountsLedgerQueries.ts` | `financeKeys.accounts(familyId)`, `financeKeys.ledger(familyId, filters)` |
| finance: goals | `finance/queries/goalsQueries.ts` | `financeKeys.goals(familyId)`, `financeKeys.goalEntries(familyId, goalId)` |
| finance: split expenses | `finance/queries/splitExpensesQueries.ts` | `financeKeys.splitGroups(familyId)`, `financeKeys.splitGroupDetail(familyId, groupId)` |
| finance: subscriptions | `finance/queries/subscriptionsQueries.ts` | `financeKeys.subscriptions(familyId)` |
| finance: data ops | `finance/queries/dataOpsQueries.ts` | (mutations only — import/export are one-shot actions, no cached list) |
| receipts | `receipts/receiptQueries.ts` | `receiptKeys.list(familyId, expenseId?)` |
| notifications | `notifications/notificationQueries.ts` | `notificationKeys.list()` |

Each `*Queries.ts` file exports:

- The key factory.
- `useXxx(...)` query hooks wrapping `useQuery`.
- `useCreateXxx/useUpdateXxx/useDeleteXxx(...)` mutation hooks wrapping
  `useMutation`, each with an `onSuccess` that calls
  `queryClient.invalidateQueries` for the affected key(s).

Mutation hooks do **not** take `t` (translate) or `notify` — they return
the raw TanStack Query mutation object. The calling component passes its
own `onSuccess`/`onError` to `.mutate(input, { onSuccess, onError })` to
show the existing snackbar/i18n messages, exactly as today. This keeps
the hooks framework-decoupled from i18n and easy to unit test.

## 6. Domain migrations

### 6.1 Auth

- `authApi.ts` — unchanged.
- New `authQueries.ts`:
  - `useCurrentUser()`: a `useQuery` whose `queryFn` reproduces the
    existing `establishSession` logic (`fetchCurrentUser`, and if null,
    `refreshSession` then retry `fetchCurrentUser`), so behavior is
    identical.
  - `useLogin()`, `useRegister()`: mutations; `onSuccess` calls
    `queryClient.setQueryData(authKeys.currentUser, user)`.
  - `useLogout()`: mutation; `onSuccess` calls
    `queryClient.setQueryData(authKeys.currentUser, null)` then
    `queryClient.clear()` — purges every other user's cached family data
    so a subsequent login never shows stale data from a previous
    session.
- `AuthContext.tsx` and the `AuthProvider` wrapper are removed. React
  Query's cache already dedupes/shares `useCurrentUser()` across every
  consumer, so a Context provider is no longer needed for that purpose.
- `useAuth.ts` becomes a thin hook built directly on `useCurrentUser` +
  the three mutations, but **keeps the exact same return shape**
  (`{ user, isLoading, login, register, logout }`) so `ProtectedRoute`,
  `LoginForm`, `RegisterForm` need no changes.
- `App.tsx`: remove `<AuthProvider>`, since `useAuth` no longer needs a
  provider ancestor.

### 6.2 Families

- `familyApi.ts` — unchanged.
- New `familyQueries.ts` with `useFamilies()`, `useFamilyDetail(familyId)`,
  and mutations for create-family / add-member / (any other family
  writes present in `CreateFamilyForm.tsx`, `AddMemberForm.tsx`).
- `FamilyList.tsx`, `FamilyDetail.tsx`: replace `useEffect`+`useState`
  fetch with `useFamilies()` / `useFamilyDetail()`. Loading/error render
  branches stay the same JSX, sourced from `query.isLoading` /
  `query.error`.
- `CreateFamilyForm.tsx`, `AddMemberForm.tsx`: replace manual submit
  handler with the corresponding mutation hook; invalidate
  `familyKeys.list()` / `familyKeys.detail(familyId)` on success.

### 6.3 Expenses

- `expenseApi.ts` — unchanged (covers both categories and expenses).
- New `expenseQueries.ts`: `useCategories(familyId)`, `useExpenses(familyId)`,
  plus create/update/delete mutations for both categories and expenses.
- `ExpenseList.tsx`: replace direct fetch with `useExpenses(familyId)` (+
  `useCategories(familyId)` where needed for display).
- `ExpenseForm.tsx`: replace manual create/update calls with the
  mutation hooks; invalidate `expenseKeys.list(familyId)` on success.

### 6.4 Finance module (5 stores)

This is the largest and most mechanical part of the migration. Pattern,
applied identically to `goalsStore`, `accountsLedgerStore`,
`splitExpensesStore`, `subscriptionsStore`, `dataOpsStore`:

1. Create the domain's `finance/queries/xxxQueries.ts` with query hooks
   for every list currently fetched by the store's `load`, and mutation
   hooks for every write action currently in the store (e.g.
   `createGoal`, `togglePause`, `deleteGoal`, `createEntry` for
   `goalsStore`).
2. Remove from the store: fetched data fields (`goals`, `accounts`,
   `selectedGoalEntries`, ...), `isLoading`, `isSavingGoal`,
   `isSavingEntry`, `error`, and the async action methods that did
   fetching (`load`, `createGoal`, `togglePause`, `deleteGoal`,
   `createEntry`, `openEntryModal`'s fetch part).
3. Keep in the store: form field state (`goalForm`, `entryForm`),
   `setGoalForm`/`setEntryForm`, which-modal-is-open state
   (`entryGoal`), `closeEntryModal`. `openEntryModal` keeps only its
   synchronous part (setting `entryGoal` + resetting `entryForm`); the
   entries fetch it used to trigger becomes a query enabled only while a
   goal is selected (`useGoalEntries(familyId, entryGoal?.id, { enabled: !!entryGoal })`).
4. Update the page component (`GoalsPage.tsx`, `AccountsLedgerPage.tsx`,
   `SplitExpensesPage.tsx`, `SubscriptionsPage.tsx`, `DataOpsPage.tsx`)
   to call the new query/mutation hooks directly and pass results into
   the same JSX that previously read from the store. Client-side
   business logic that already lives outside the fetch layer (e.g. the
   settlement algorithm used by split expenses, the day-range filtering
   in `DateRangePicker`) is untouched — it operates on the data returned
   by the query hooks exactly as it operated on store fields before.
5. `dataOpsStore` is import/export — these are one-shot actions with no
   cached list to invalidate beyond whatever summary data they affect
   (e.g. re-invalidate `financeKeys.accounts`/`expenseKeys.list` after a
   successful import). No query hook needed here, only mutations.

Cross-domain note: `goalsStore.load` currently also calls
`getFamilyDetail` for `familyCurrencyCode`. After migration this reads
from `useFamilyDetail(familyId)` (already cached by section 6.2) instead
of a redundant fetch — one of several places where sharing the cache
removes a duplicate network call that exists today.

### 6.5 Receipts

- `receiptApi.ts` — unchanged.
- New `receiptQueries.ts`: `useReceipts(familyId, expenseId?)`, upload
  mutation.
- `ReceiptList.tsx`: replace direct fetch with `useReceipts(...)`.
- `ReceiptUploadForm.tsx`: replace manual upload call with the mutation
  hook; invalidate `receiptKeys.list(...)` on success.

### 6.6 Notifications

- `notificationApi.ts` — unchanged.
- New `notificationQueries.ts`: `useNotifications(options?)` (list),
  `useMarkNotificationRead()` and `useMarkAllNotificationsRead()`
  mutations, both invalidating `notificationKeys.list()` on success.
- `NotificationCenter.tsx`: replace direct fetch and manual mark-read
  calls with the query/mutation hooks.

## 7. Error handling

Unchanged. `buildApiError` (in `api/errors.ts`) and `translateApiError`
(in `api/errorI18n.ts`) keep working exactly as today — they operate on
whatever the `queryFn`/`mutationFn` throws, and TanStack Query surfaces
that thrown value as `query.error` / `mutation.error` without any
special handling required.

## 8. Testing

- New `frontend/src/testUtils/renderWithProviders.tsx`: creates a fresh
  `QueryClient` per test (`retry: false` on both queries and mutations,
  `gcTime: 0`) and renders `children` wrapped in
  `QueryClientProvider`, composable with whatever other providers a
  given test needs (router, auth, snackbar).
- Store tests that currently exercise server-fetching actions (e.g.
  `splitExpensesStore.test.ts`) are updated to only cover the remaining
  UI-only state; the removed fetch/mutation behavior is covered instead
  by hook tests using `renderHook` from `@testing-library/react`,
  wrapped in the new provider helper, with the relevant `*Api.ts`
  function(s) mocked via `vi.mock`.
- Component tests that mocked `useEffect`-driven fetches directly
  (`FamilyList.test.tsx`, `FamilyDetail.test.tsx`, `ExpenseList.test.tsx`,
  `ExpenseForm.test.tsx`, `ReceiptList.test.tsx`,
  `ReceiptUploadForm.test.tsx`, `LoginForm.test.tsx`,
  `RegisterForm.test.tsx`) are updated to render through
  `renderWithProviders` and mock the corresponding `*Api.ts` functions
  instead of mocking fetch/store internals.

## 9. Verification plan

After implementation:

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (vitest) all pass.
- `pnpm test:ui:smoke` (Playwright) passes against the migrated app —
  this is the closest thing to an end-to-end behavior check that the
  visible UI/flows are unchanged.
- Manual spot check with the dev server: login, view a family's
  dashboard, create/edit/delete an expense, open Goals/Split
  Expenses/Subscriptions/Accounts Ledger/Data Ops, confirm no duplicate
  network requests in the browser devtools Network tab for data already
  cached (e.g. navigating back to a page within the staleTime window
  shows no new request), and confirm a mutation (e.g. creating an
  expense) is reflected immediately after invalidation.

## 10. Out of scope / Phase 2

Visual redesign (new components, layout, animation, design-system
application from `ui/DESIGN.md` / `ui/COMPONENTS.md`) is a separate
spec, built after this one lands, so it can consume `isLoading`/`error`
from query hooks directly when building new skeleton/error states.
