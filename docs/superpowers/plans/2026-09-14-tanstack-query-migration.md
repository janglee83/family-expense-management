# TanStack Query Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every ad-hoc `useEffect`-driven fetch and Zustand-managed server-state field in the frontend with TanStack Query, so all server data shares one cache tuned for a slow deploy environment (long `staleTime`, no refetch-on-focus, explicit invalidation after writes) — with zero visual or behavioral change.

**Architecture:** A single shared `QueryClient` (long `staleTime`/`gcTime`, `refetchOnWindowFocus: false`) is wired into `App.tsx`. Every domain's existing `*Api.ts` file (already a plain, framework-agnostic set of async functions) is reused verbatim as `queryFn`/`mutationFn`. Each domain gets a new colocated `*Queries.ts` file exporting a query-key factory plus `useXxx` query hooks and `useCreateXxx`/`useUpdateXxx`/`useDeleteXxx` mutation hooks; mutations invalidate the affected key(s) on success and never carry `t`/`notify` — the calling component still owns its own snackbar/i18n wiring via `.mutate(input, { onSuccess, onError })`. The five Zustand finance stores are slimmed to hold only form/UI state (values being typed, which modal is open); their fetched-list fields and async actions move into the new query/mutation hooks. `AuthContext`/`AuthProvider` is deleted outright — `useAuth()` becomes a thin wrapper over a `useCurrentUser()` query and three mutations, since TanStack Query's cache already shares state across components without a Context provider.

**Tech Stack:** React 18 + TypeScript, TanStack Query v5 (`@tanstack/react-query`, `@tanstack/react-query-devtools`), Zustand (UI-state only after this plan), `openapi-fetch`, Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-tanstack-query-migration-design.md`

## Global Constraints

- `QueryClient` defaults: `staleTime` 5 minutes, `gcTime` 30 minutes, `refetchOnWindowFocus: false`, query `retry: 1`, mutation `retry: 0` (spec section 3).
- No `*Api.ts` file changes — every one of them is reused verbatim as `queryFn`/`mutationFn` (spec section 1, 3).
- No visual/CSS change. Every loading/error/empty JSX branch keeps its exact current shape; it is only re-sourced from `query.isLoading`/`query.error`/`mutation.isPending` instead of local `useState` (spec section 2).
- No optimistic updates. Every mutation's `onSuccess` calls `queryClient.invalidateQueries` for the key(s) it affects; no manual cache patching (spec section 2, 3).
- Mutation hooks never take `t` (translate) or `notify` (snackbar) as parameters. The calling component passes its own `onSuccess`/`onError` into `.mutate(input, { onSuccess, onError })` to show the exact same messages as today (spec section 5).
- All finance-domain (`frontend/src/finance/**`) query keys live in one shared file, `frontend/src/finance/queries/financeKeys.ts`, so no two files can define slightly different keys for the same cached list and silently break cache sharing. Every `finance/queries/*Queries.ts` file imports from it; later tasks add to it, never redefine a key that already exists.
- `useAuth()` keeps the exact return shape `{ user, isLoading, login, register, logout }` — every existing consumer (`ProtectedRoute`, `LoginForm`, `RegisterForm`, `PageFrame`, and every finance/receipts/expenses page) needs zero changes.
- `logout` calls `queryClient.clear()` after clearing the cached user, purging every other cached list so a subsequent login by a different account never shows stale data (spec section 6.1).
- Pages that have **no pre-existing test file** today (`GoalsPage`, `AccountsLedgerPage`, `SubscriptionsPage`, `SplitExpensesPage`, `DataOpsPage`) do **not** get new full component test suites as part of this migration — that would be scope creep beyond "preserve behavior" (spec section 2, non-goals). Their new coverage is at the hook level: every `*Queries.ts` file gets a direct `renderHook` test for its query hook and every mutation hook.
- Every component test that renders a page wrapped in `PageFrame` (which renders `NotificationCenter`) must use the new `renderWithProviders` test helper (Task 2) once the page itself is migrated in that same task, so `useQuery`/`useMutation` calls in its tree never throw "No QueryClient set".

---

### Task 1: Install TanStack Query, create the shared `QueryClient`, wire it into `App`

**Files:**
- Modify: `frontend/package.json`, `frontend/pnpm-lock.yaml` (via `pnpm add`)
- Create: `frontend/src/api/queryClient.ts`
- Test: `frontend/src/api/queryClient.test.ts`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `queryClient: QueryClient`, exported from `frontend/src/api/queryClient.ts`. Every later task's `*Queries.ts` file imports `useQueryClient()` from `@tanstack/react-query` directly (not this export) — this export is consumed only by `App.tsx` and by tests that want to assert on the real default options.

- [ ] **Step 1: Install the packages**

Run: `cd frontend && pnpm add @tanstack/react-query @tanstack/react-query-devtools`

This updates `frontend/package.json` and `frontend/pnpm-lock.yaml` automatically — do not hand-edit version numbers.

- [ ] **Step 2: Write the failing test for the shared QueryClient's defaults**

Create `frontend/src/api/queryClient.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { queryClient } from "./queryClient";

describe("queryClient", () => {
  it("uses a long staleTime, a long gcTime, and disables refetch-on-focus for queries", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.queries?.staleTime).toBe(5 * 60 * 1000);
    expect(defaults.queries?.gcTime).toBe(30 * 60 * 1000);
    expect(defaults.queries?.refetchOnWindowFocus).toBe(false);
    expect(defaults.queries?.retry).toBe(1);
  });

  it("disables retry for mutations", () => {
    const defaults = queryClient.getDefaultOptions();
    expect(defaults.mutations?.retry).toBe(0);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && pnpm vitest run src/api/queryClient.test.ts`
Expected: FAIL — `Cannot find module './queryClient'`.

- [ ] **Step 4: Implement `queryClient.ts`**

Create `frontend/src/api/queryClient.ts`:

```ts
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
    mutations: {
      retry: 0,
    },
  },
});
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && pnpm vitest run src/api/queryClient.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Wire `QueryClientProvider` and the devtools into `App.tsx`**

Read `frontend/src/App.tsx` first (current content is 16 lines). Replace its entire content with:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./api/queryClient";
import { AuthProvider } from "./auth/AuthContext";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SnackbarProvider>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </SnackbarProvider>
      </BrowserRouter>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
```

`AuthProvider` stays here for now — Task 3 removes it. This step only adds the query client layer around the existing tree.

- [ ] **Step 7: Run the full frontend test suite and typecheck to confirm nothing broke**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS, same results as before this task (this step adds no new consumer of `useQuery`/`useMutation` yet, so no existing test should change behavior).

- [ ] **Step 8: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml frontend/src/api/queryClient.ts frontend/src/api/queryClient.test.ts frontend/src/App.tsx
git commit -m "feat(frontend): install TanStack Query and wire the shared QueryClient into App"
```

---

### Task 2: Test utilities for rendering and hook-testing under a `QueryClientProvider`

**Files:**
- Create: `frontend/src/testUtils/renderWithProviders.tsx`
- Test: `frontend/src/testUtils/renderWithProviders.test.tsx`

**Interfaces:**
- Consumes: nothing new (uses `@tanstack/react-query`, `@testing-library/react` directly).
- Produces: `createTestQueryClient(): QueryClient`, `createQueryWrapper(): React.ComponentType<{ children: ReactNode }>`, `renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">): RenderResult & { queryClient: QueryClient }` — all exported from `frontend/src/testUtils/renderWithProviders.tsx`. Every later task's component test imports `renderWithProviders`; every later task's hook test imports `createQueryWrapper`.

- [ ] **Step 1: Write the failing test**

Create `frontend/src/testUtils/renderWithProviders.test.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { renderHook, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createQueryWrapper, renderWithProviders } from "./renderWithProviders";

function Probe() {
  const { data } = useQuery({ queryKey: ["probe"], queryFn: async () => "ok" });
  return <p>{data ?? "loading"}</p>;
}

describe("renderWithProviders", () => {
  it("renders children under a QueryClientProvider", async () => {
    renderWithProviders(<Probe />);
    expect(await screen.findByText("ok")).toBeInTheDocument();
  });
});

describe("createQueryWrapper", () => {
  it("wraps renderHook so useQuery works without throwing", async () => {
    const { result } = renderHook(() => useQuery({ queryKey: ["probe-2"], queryFn: async () => "hook-ok" }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBe("hook-ok"));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && pnpm vitest run src/testUtils/renderWithProviders.test.tsx`
Expected: FAIL — `Cannot find module './renderWithProviders'`.

- [ ] **Step 3: Implement `renderWithProviders.tsx`**

Create `frontend/src/testUtils/renderWithProviders.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function createQueryWrapper() {
  const queryClient = createTestQueryClient();

  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

export function renderWithProviders(ui: ReactElement, options?: Omit<RenderOptions, "wrapper">) {
  const queryClient = createTestQueryClient();

  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  return { queryClient, ...render(ui, { wrapper: Wrapper, ...options }) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && pnpm vitest run src/testUtils/renderWithProviders.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/testUtils/renderWithProviders.tsx frontend/src/testUtils/renderWithProviders.test.tsx
git commit -m "test(frontend): add renderWithProviders/createQueryWrapper test helpers for TanStack Query"
```

---
### Task 3: Auth — `authQueries.ts`, `useAuth.ts` rewrite, delete `AuthContext`

**Files:**
- Create: `frontend/src/auth/authQueries.ts`
- Test: `frontend/src/auth/authQueries.test.ts`
- Modify: `frontend/src/auth/useAuth.ts`
- Delete: `frontend/src/auth/AuthContext.tsx`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/App.test.tsx`

**Interfaces:**
- Consumes: `fetchCurrentUser`, `loginUser`, `logoutUser`, `refreshSession`, `registerUser`, `type AuthUser` from `./authApi` (unchanged); `createQueryWrapper`, `renderWithProviders` from `../testUtils/renderWithProviders` (Task 2).
- Produces: `authKeys.currentUser: readonly ["auth", "me"]`, `useCurrentUser()`, `useLogin()`, `useRegister()`, `useLogout()` from `frontend/src/auth/authQueries.ts`. `useAuth(): { user: AuthUser | null; isLoading: boolean; login: (email: string, password: string) => Promise<void>; register: (email: string, password: string, displayName: string) => Promise<void>; logout: () => Promise<void> }` from `frontend/src/auth/useAuth.ts` — unchanged shape, every existing consumer keeps working untouched.

- [ ] **Step 1: Write the failing tests for `authQueries.ts`**

Create `frontend/src/auth/authQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { authKeys, useCurrentUser, useLogin, useLogout, useRegister } from "./authQueries";
import * as authApi from "./authApi";

vi.mock("./authApi");

describe("useCurrentUser", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the user fetched from fetchCurrentUser", async () => {
    vi.mocked(authApi.fetchCurrentUser).mockResolvedValue({
      id: "u1",
      email: "a@example.com",
      display_name: "Alice",
    });

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("u1"));
  });

  it("falls back to refreshSession then refetches when fetchCurrentUser first returns null", async () => {
    vi.mocked(authApi.fetchCurrentUser)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "u1", email: "a@example.com", display_name: "Alice" });
    vi.mocked(authApi.refreshSession).mockResolvedValue(true);

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("u1"));
    expect(authApi.refreshSession).toHaveBeenCalled();
  });

  it("resolves to null instead of throwing when fetchCurrentUser rejects at the network level", async () => {
    vi.mocked(authApi.fetchCurrentUser).mockRejectedValue(new Error("network error"));

    const { result } = renderHook(() => useCurrentUser(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
  });
});

describe("useLogin", () => {
  it("seeds authKeys.currentUser with the logged-in user on success", async () => {
    vi.mocked(authApi.loginUser).mockResolvedValue({ id: "u1", email: "a@example.com", display_name: "Alice" });
    const wrapper = createQueryWrapper();
    const { result: loginResult } = renderHook(() => useLogin(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await loginResult.current.mutateAsync({ email: "a@example.com", password: "secret123" });
    });

    await waitFor(() => expect(currentUserResult.current.data?.id).toBe("u1"));
  });
});

describe("useRegister", () => {
  it("seeds authKeys.currentUser with the registered user on success", async () => {
    vi.mocked(authApi.registerUser).mockResolvedValue({ id: "u2", email: "b@example.com", display_name: "Bob" });
    const wrapper = createQueryWrapper();
    const { result: registerResult } = renderHook(() => useRegister(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await registerResult.current.mutateAsync({ email: "b@example.com", password: "secret123", displayName: "Bob" });
    });

    await waitFor(() => expect(currentUserResult.current.data?.id).toBe("u2"));
  });
});

describe("useLogout", () => {
  it("clears authKeys.currentUser to null on success", async () => {
    vi.mocked(authApi.logoutUser).mockResolvedValue(undefined);
    const wrapper = createQueryWrapper();
    const { result: logoutResult } = renderHook(() => useLogout(), { wrapper });
    const { result: currentUserResult } = renderHook(() => useCurrentUser(), { wrapper });

    await act(async () => {
      await logoutResult.current.mutateAsync();
    });

    expect(currentUserResult.current.data).toBeNull();
  });
});

describe("authKeys", () => {
  it("has a stable currentUser key", () => {
    expect(authKeys.currentUser).toEqual(["auth", "me"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/auth/authQueries.test.ts`
Expected: FAIL — `Cannot find module './authQueries'`.

- [ ] **Step 3: Implement `authQueries.ts`**

Create `frontend/src/auth/authQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchCurrentUser,
  loginUser,
  logoutUser,
  refreshSession,
  registerUser,
  type AuthUser,
} from "./authApi";

export const authKeys = {
  currentUser: ["auth", "me"] as const,
};

async function establishSession(): Promise<AuthUser | null> {
  try {
    let currentUser = await fetchCurrentUser();
    if (!currentUser) {
      const refreshed = await refreshSession();
      if (refreshed) {
        currentUser = await fetchCurrentUser();
      }
    }
    return currentUser;
  } catch {
    return null;
  }
}

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.currentUser,
    queryFn: establishSession,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ email, password }: { email: string; password: string }) => loginUser(email, password),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      email,
      password,
      displayName,
    }: {
      email: string;
      password: string;
      displayName: string;
    }) => registerUser(email, password, displayName),
    onSuccess: (user) => {
      queryClient.setQueryData(authKeys.currentUser, user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: logoutUser,
    onSuccess: () => {
      queryClient.setQueryData(authKeys.currentUser, null);
      queryClient.clear();
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/auth/authQueries.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Rewrite `useAuth.ts` and delete `AuthContext.tsx`**

Delete `frontend/src/auth/AuthContext.tsx`.

Replace `frontend/src/auth/useAuth.ts` entirely with:

```ts
import { useCurrentUser, useLogin, useLogout, useRegister } from "./authQueries";

export function useAuth() {
  const currentUserQuery = useCurrentUser();
  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  return {
    user: currentUserQuery.data ?? null,
    isLoading: currentUserQuery.isLoading,
    login: async (email: string, password: string) => {
      await loginMutation.mutateAsync({ email, password });
    },
    register: async (email: string, password: string, displayName: string) => {
      await registerMutation.mutateAsync({ email, password, displayName });
    },
    logout: async () => {
      await logoutMutation.mutateAsync();
    },
  };
}
```

- [ ] **Step 6: Remove `AuthProvider` from `App.tsx`**

In `frontend/src/App.tsx`, remove the `AuthProvider` import and unwrap its usage:

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { BrowserRouter } from "react-router-dom";
import { queryClient } from "./api/queryClient";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SnackbarProvider>
          <AppRoutes />
        </SnackbarProvider>
      </BrowserRouter>
      {import.meta.env.DEV ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
```

- [ ] **Step 7: Update `App.test.tsx` to stop importing `AuthContext` and wrap with a real `QueryClientProvider`**

In `frontend/src/App.test.tsx`, replace the imports and `renderAt` helper:

```tsx
import { render, screen } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "./i18n/i18n";
import { AppRoutes } from "./AppRoutes";
import { SnackbarProvider } from "./components/ui/Snackbar";
import { createTestQueryClient } from "./testUtils/renderWithProviders";

const fetchCurrentUserMock = vi.fn();
const refreshSessionMock = vi.fn();

vi.mock("./auth/authApi", () => ({
  fetchCurrentUser: (...args: unknown[]) => fetchCurrentUserMock(...args),
  refreshSession: (...args: unknown[]) => refreshSessionMock(...args),
  loginUser: vi.fn(),
  registerUser: vi.fn(),
  logoutUser: vi.fn(),
}));

function renderAt(initialPath: string) {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SnackbarProvider>
          <AppRoutes />
        </SnackbarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
```

Everything below the `renderAt` function (the `describe("AppRoutes", ...)` block and every `it(...)`) is unchanged — leave it exactly as-is. `AuthProvider` is gone from the import list and from the tree; `fetchCurrentUser`/`refreshSession` are still mocked at the same `./auth/authApi` boundary, which is what `useCurrentUser()`'s `establishSession()` now calls internally, so every existing assertion keeps working unmodified.

- [ ] **Step 8: Run the affected test files and the full typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/App.test.tsx src/auth`
Expected: PASS. `LoginForm.test.tsx` and `RegisterForm.test.tsx` are unaffected — both mock `./useAuth` entirely (`vi.mock("./useAuth")`), so `useAuth`'s new internals are never exercised there.

- [ ] **Step 9: Run the full suite to catch any other consumer**

Run: `cd frontend && pnpm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/auth/authQueries.ts frontend/src/auth/authQueries.test.ts frontend/src/auth/useAuth.ts frontend/src/App.tsx frontend/src/App.test.tsx
git rm frontend/src/auth/AuthContext.tsx
git commit -m "feat(frontend): back useAuth with TanStack Query, delete AuthContext"
```

---
### Task 4: Families — `familyQueries.ts`, `FamilyList`, `FamilyDetail`, `CreateFamilyForm`, `AddMemberForm`

**Files:**
- Create: `frontend/src/families/familyQueries.ts`
- Test: `frontend/src/families/familyQueries.test.ts`
- Modify: `frontend/src/families/FamilyList.tsx`
- Modify: `frontend/src/families/FamilyList.test.tsx`
- Modify: `frontend/src/families/FamilyDetail.tsx`
- Modify: `frontend/src/families/FamilyDetail.test.tsx`
- Modify: `frontend/src/families/CreateFamilyForm.tsx`
- Modify: `frontend/src/families/AddMemberForm.tsx`

**Interfaces:**
- Consumes: every function in `./familyApi` (unchanged); `createQueryWrapper`, `renderWithProviders` (Task 2).
- Produces: `familyKeys.list: readonly ["families"]`, `familyKeys.detail: (familyId: string) => readonly ["families", string]`, `useFamilies()`, `useFamilyDetail(familyId: string)`, `useCreateFamily()`, `useRenameFamily(familyId: string)`, `useDeleteFamily(familyId: string)`, `useAddMember(familyId: string)`, `useRemoveMember(familyId: string)`, `useChangeMemberRole(familyId: string)` from `frontend/src/families/familyQueries.ts`. `useFamilyDetail` and `familyKeys.detail` are imported by every later finance/receipts/expenses task that needs `familyCurrencyCode` or the member list.

- [ ] **Step 1: Write the failing tests for `familyQueries.ts`**

Create `frontend/src/families/familyQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import {
  familyKeys,
  useAddMember,
  useChangeMemberRole,
  useCreateFamily,
  useDeleteFamily,
  useFamilies,
  useFamilyDetail,
  useRemoveMember,
  useRenameFamily,
} from "./familyQueries";
import * as familyApi from "./familyApi";

vi.mock("./familyApi");

const FAMILY_DETAIL = {
  id: "fam-1",
  name: "My Family",
  family_type: "shared" as const,
  currency_code: "jpy" as const,
  monthly_income_enabled: false,
  monthly_income: null,
  savings_goal_amount: null,
  members: [{ user_id: "u1", email: "a@example.com", display_name: "Alice", role: "owner" as const }],
};

describe("familyQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useFamilies returns the list from listMyFamilies", async () => {
    vi.mocked(familyApi.listMyFamilies).mockResolvedValue([
      { id: "fam-1", name: "My Family", role: "owner" },
    ]);

    const { result } = renderHook(() => useFamilies(), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("useFamilyDetail returns the detail from getFamilyDetail", async () => {
    vi.mocked(familyApi.getFamilyDetail).mockResolvedValue(FAMILY_DETAIL);

    const { result } = renderHook(() => useFamilyDetail("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data?.id).toBe("fam-1"));
  });

  it("useCreateFamily invalidates familyKeys.list on success", async () => {
    vi.mocked(familyApi.createFamily).mockResolvedValue({ id: "fam-2", name: "New Family", role: "owner" });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateFamily(), list: useFamilies() }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({
        name: "New Family",
        family_type: "shared",
        currency_code: "jpy",
        monthly_income_enabled: false,
        member_emails: [],
      });
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useRenameFamily invalidates familyKeys.detail(familyId) on success", async () => {
    vi.mocked(familyApi.renameFamily).mockResolvedValue({ id: "fam-1", name: "Renamed", role: "owner" });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ rename: useRenameFamily("fam-1"), detail: useFamilyDetail("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.rename.mutateAsync("Renamed");
    });

    expect(result.current.detail.isStale).toBe(true);
    expect(familyApi.renameFamily).toHaveBeenCalledWith("fam-1", "Renamed");
  });

  it("useDeleteFamily calls deleteFamily with the bound familyId", async () => {
    vi.mocked(familyApi.deleteFamily).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteFamily("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(familyApi.deleteFamily).toHaveBeenCalledWith("fam-1");
  });

  it("useAddMember calls addMember and invalidates familyKeys.detail(familyId)", async () => {
    vi.mocked(familyApi.addMember).mockResolvedValue({
      user_id: "u2",
      email: "b@example.com",
      display_name: "Bob",
      role: "member",
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ add: useAddMember("fam-1"), detail: useFamilyDetail("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.add.mutateAsync("b@example.com");
    });

    expect(familyApi.addMember).toHaveBeenCalledWith("fam-1", "b@example.com");
    expect(result.current.detail.isStale).toBe(true);
  });

  it("useRemoveMember calls removeMember with the bound familyId and given userId", async () => {
    vi.mocked(familyApi.removeMember).mockResolvedValue(undefined);
    const { result } = renderHook(() => useRemoveMember("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("u2");
    });

    expect(familyApi.removeMember).toHaveBeenCalledWith("fam-1", "u2");
  });

  it("useChangeMemberRole calls changeMemberRole with userId and role", async () => {
    vi.mocked(familyApi.changeMemberRole).mockResolvedValue({
      user_id: "u2",
      email: "b@example.com",
      display_name: "Bob",
      role: "admin",
    });
    const { result } = renderHook(() => useChangeMemberRole("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ userId: "u2", role: "admin" });
    });

    expect(familyApi.changeMemberRole).toHaveBeenCalledWith("fam-1", "u2", "admin");
  });

  it("familyKeys produces stable, family-scoped keys", () => {
    expect(familyKeys.list).toEqual(["families"]);
    expect(familyKeys.detail("fam-1")).toEqual(["families", "fam-1"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/families/familyQueries.test.ts`
Expected: FAIL — `Cannot find module './familyQueries'`.

- [ ] **Step 3: Implement `familyQueries.ts`**

Create `frontend/src/families/familyQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addMember,
  changeMemberRole,
  createFamily,
  deleteFamily,
  getFamilyDetail,
  listMyFamilies,
  removeMember,
  renameFamily,
  type CreateFamilyInput,
} from "./familyApi";

export const familyKeys = {
  list: ["families"] as const,
  detail: (familyId: string) => ["families", familyId] as const,
};

export function useFamilies() {
  return useQuery({
    queryKey: familyKeys.list,
    queryFn: listMyFamilies,
  });
}

export function useFamilyDetail(familyId: string) {
  return useQuery({
    queryKey: familyKeys.detail(familyId),
    queryFn: () => getFamilyDetail(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateFamily() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateFamilyInput) => createFamily(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.list });
    },
  });
}

export function useRenameFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => renameFamily(familyId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useDeleteFamily(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteFamily(familyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.list });
    },
  });
}

export function useAddMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (email: string) => addMember(familyId, email),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useRemoveMember(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => removeMember(familyId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}

export function useChangeMemberRole(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: "admin" | "member" }) =>
      changeMemberRole(familyId, userId, role),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: familyKeys.detail(familyId) });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/families/familyQueries.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Migrate `FamilyList.tsx`**

In `frontend/src/families/FamilyList.tsx`, replace the `import { listMyFamilies, type Family } from "./familyApi";` line with `import { useFamilies } from "./familyQueries";`, and replace lines 12–38 (the `useState`/`useEffect` block) with:

```tsx
export function FamilyList() {
  const { t } = useTranslation();
  const { data: families = [], isLoading, isError } = useFamilies();
  const error = isError ? t("family.actionFailed") : null;
```

Every other reference to `families`, `isLoading`, and `error` below this point in the JSX is unchanged (they already read from these same local names).

- [ ] **Step 6: Update `FamilyList.test.tsx`**

In `frontend/src/families/FamilyList.test.tsx`, replace the `render(...)` import and both call sites to use `renderWithProviders`:

```tsx
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import "../i18n/i18n";
import { FamilyList } from "./FamilyList";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";
import { renderWithProviders } from "../testUtils/renderWithProviders";
```

Replace both `render(<SnackbarProvider>...` call sites with `renderWithProviders(<SnackbarProvider>...` (same JSX inside, only the function name changes). Everything else in the file (mocks, `beforeEach`, assertions) is unchanged.

- [ ] **Step 7: Migrate `FamilyDetail.tsx`**

In `frontend/src/families/FamilyDetail.tsx`:

Replace the import block:

```tsx
import { useTranslation } from "react-i18next";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import {
  useChangeMemberRole,
  useDeleteFamily,
  useFamilyDetail,
  useRemoveMember,
  useRenameFamily,
} from "./familyQueries";
import { LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
```

(drop the old `familyApi` import and `useEffect`/`useState` from `"react"` entirely — nothing else in the file uses them once this migration is done).

Replace lines 23–61 (component body up through the fetch `useEffect`) with:

```tsx
export function FamilyDetail() {
  const { t } = useTranslation();
  const { familyId: familyIdParam } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const detailQuery = useFamilyDetail(familyIdParam ?? "");
  const detail = detailQuery.data ?? null;
  const isLoading = detailQuery.isLoading;
  const [nameInput, setNameInput] = useState("");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [memberToConfirm, setMemberToConfirm] = useState<{
    userId: string;
    displayName: string;
    isSelf: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const nameInputId = "family-name";
  const renameFamily = useRenameFamily(familyIdParam ?? "");
  const deleteFamilyMutation = useDeleteFamily(familyIdParam ?? "");
  const removeMember = useRemoveMember(familyIdParam ?? "");
  const changeMemberRole = useChangeMemberRole(familyIdParam ?? "");

  useEffect(() => {
    if (detail) {
      setNameInput(detail.name);
    }
  }, [detail]);
```

`useState`/`useEffect` are still needed (for `nameInput`/`isEditingName`/etc. and the sync-on-load effect above) — keep them imported from `"react"`.

Replace the four handler functions (`handleRename`, `handleDelete`, `handleRemoveOrLeave`, `handleRoleChange`, currently lines 108–192) with:

```tsx
  function handleRename() {
    if (!detail) {
      return;
    }

    setError(null);
    const trimmedName = nameInput.trim();
    if (!trimmedName) {
      setError(t("family.nameRequired"));
      return;
    }

    if (trimmedName === detail.name) {
      setIsEditingName(false);
      return;
    }

    renameFamily.mutate(trimmedName, {
      onSuccess: () => {
        setIsEditingName(false);
        showSnackbar({ message: t("family.renameSuccess"), variant: "success" });
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleDelete() {
    setError(null);
    deleteFamilyMutation.mutate(undefined, {
      onSuccess: () => {
        showSnackbar({ message: t("family.deleteSuccess"), variant: "success" });
        navigate("/families");
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleRemoveOrLeave(userId: string, isSelf: boolean) {
    setError(null);
    removeMember.mutate(userId, {
      onSuccess: () => {
        if (isSelf) {
          showSnackbar({ message: t("family.leaveSuccess"), variant: "success" });
          navigate("/families");
          return;
        }
        showSnackbar({ message: t("family.removeSuccess"), variant: "success" });
      },
      onError: () => {
        setError(t("family.actionFailed"));
        showSnackbar({ message: t("family.actionFailed"), variant: "error" });
      },
    });
  }

  function handleRoleChange(userId: string, role: "admin" | "member") {
    setError(null);
    changeMemberRole.mutate(
      { userId, role },
      {
        onSuccess: () => {
          showSnackbar({ message: t("family.roleChangeSuccess"), variant: "success" });
        },
        onError: () => {
          setError(t("family.actionFailed"));
          showSnackbar({ message: t("family.actionFailed"), variant: "error" });
        },
      },
    );
  }
```

Every call site further down (`onClick={() => void handleRename()}` etc.) drops its `void`/`async` wrapping since these handlers are synchronous now — e.g. `onClick={() => handleRename()}`. Every other line of JSX (the loading/error early-returns, the members list, the modals) is unchanged — `detail`, `isLoading`, `error`, `familyId` all still resolve from the same local names declared above.

- [ ] **Step 8: Update `FamilyDetail.test.tsx`**

In `frontend/src/families/FamilyDetail.test.tsx`, replace the `render` import and the `renderAtFamily` function's `return render(...)` with `renderWithProviders`:

```tsx
import { screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { FamilyDetail } from "./FamilyDetail";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";
import { renderWithProviders } from "../testUtils/renderWithProviders";
```

```tsx
  return renderWithProviders(
    <SnackbarProvider>
      <MemoryRouter initialEntries={["/families/fam-1"]}>
        <Routes>
          <Route path="/families/:familyId" element={<FamilyDetail />} />
        </Routes>
      </MemoryRouter>
    </SnackbarProvider>,
  );
```

The rest of the file is unchanged — `getFamilyDetailMock`/`removeMemberMock` still back the same `familyApi` calls that `useFamilyDetail`/`useRemoveMember` now make internally.

- [ ] **Step 9: Migrate `CreateFamilyForm.tsx`**

In `frontend/src/families/CreateFamilyForm.tsx`, replace `import { createFamily, type CurrencyCode, type Family, type FamilyType } from "./familyApi";` with:

```tsx
import { type CurrencyCode, type Family, type FamilyType } from "./familyApi";
import { useCreateFamily } from "./familyQueries";
```

Add `const createFamilyMutation = useCreateFamily();` alongside the other `useState` declarations, and replace the body of `handleSubmit` (from `setError(null);` through the `catch`/`finally` block, i.e. lines 116–141) with:

```tsx
    setError(null);
    createFamilyMutation.mutate(
      {
        name: trimmedName,
        family_type: familyType,
        currency_code: currencyCode,
        monthly_income_enabled: monthlyIncomeEnabled,
        member_emails: familyType === "shared" ? memberEmails : [],
        monthly_income: monthlyIncomeEnabled ? parsedIncome : null,
        savings_goal_amount: parsedSavingsGoal,
      },
      {
        onSuccess: (family) => {
          onCreated(family);
          setName("");
          setFamilyType("shared");
          setCurrencyCode("jpy");
          setMonthlyIncomeEnabled(false);
          setMonthlyIncome("");
          setSavingsGoalAmount("");
          setMemberEmailInput("");
          setMemberEmails([]);
        },
        onError: (err) => {
          setError(translateApiError(t, err, "family.actionFailed"));
        },
      },
    );
```

`handleSubmit` no longer needs to be `async` (drop `async` from its signature) and no longer sets `isSubmitting` itself — replace every remaining reference to the local `isSubmitting` state and its `setIsSubmitting` calls with `createFamilyMutation.isPending`, and delete the now-unused `const [isSubmitting, setIsSubmitting] = useState(false);` line. The submit button's `loading={isSubmitting}` becomes `loading={createFamilyMutation.isPending}`.

- [ ] **Step 10: Migrate `AddMemberForm.tsx`**

In `frontend/src/families/AddMemberForm.tsx`, replace `import { addMember, type FamilyMemberInfo } from "./familyApi";` with:

```tsx
import { type FamilyMemberInfo } from "./familyApi";
import { useAddMember } from "./familyQueries";
```

Add `const addMemberMutation = useAddMember(familyId);` alongside the `useState` declarations, delete `const [isSubmitting, setIsSubmitting] = useState(false);`, and replace `handleSubmit`'s body with:

```tsx
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    addMemberMutation.mutate(email, {
      onSuccess: (member) => {
        onAdded(member);
        setEmail("");
      },
      onError: (err) => {
        setError(translateApiError(t, err, "family.actionFailed"));
      },
    });
  }
```

Update the `<form onSubmit={handleSubmit} ...>` — `handleSubmit` is no longer `async`, this attribute doesn't need to change. Replace `loading={isSubmitting}` with `loading={addMemberMutation.isPending}` on the submit `<Button>`.

- [ ] **Step 11: Run the affected tests and full typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/families`
Expected: PASS.

- [ ] **Step 12: Run the full suite**

Run: `cd frontend && pnpm test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add frontend/src/families
git commit -m "feat(frontend): migrate families domain to TanStack Query"
```

---
### Task 5: Expenses — `expenseQueries.ts`, `ExpenseList`, `ExpenseForm`

**Files:**
- Create: `frontend/src/expenses/expenseQueries.ts`
- Test: `frontend/src/expenses/expenseQueries.test.ts`
- Modify: `frontend/src/expenses/ExpenseList.tsx`
- Modify: `frontend/src/expenses/ExpenseList.test.tsx`
- Modify: `frontend/src/expenses/ExpenseForm.tsx`
- Modify: `frontend/src/expenses/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: every function in `./expenseApi` (unchanged); `useFamilyDetail` from `../families/familyQueries` (Task 4); `createQueryWrapper`, `renderWithProviders` (Task 2).
- Produces: `expenseKeys.categories: (familyId: string) => readonly [...]`, `expenseKeys.list: (familyId: string) => readonly [...]`, `useCategories(familyId)`, `useExpenses(familyId)`, `useCreateCategory(familyId)`, `useRenameCategory(familyId)`, `useDeleteCategory(familyId)`, `useCreateExpense(familyId)`, `useUpdateExpense(familyId)`, `useDeleteExpense(familyId)` from `frontend/src/expenses/expenseQueries.ts`. `useCategories`/`expenseKeys.categories` and `useExpenses`/`expenseKeys.list` are reused by Task 6 (Dashboard) and Task 8/9/11 (finance domains that also read categories/expenses).

- [ ] **Step 1: Write the failing tests for `expenseQueries.ts`**

Create `frontend/src/expenses/expenseQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import {
  expenseKeys,
  useCategories,
  useCreateCategory,
  useCreateExpense,
  useDeleteCategory,
  useDeleteExpense,
  useExpenses,
  useRenameCategory,
  useUpdateExpense,
} from "./expenseQueries";
import * as expenseApi from "./expenseApi";

vi.mock("./expenseApi");

const EXPENSE_INPUT = {
  payer_user_id: "u1",
  category_id: "cat-1",
  amount: 1000,
  is_shared: false,
  expense_date: "2026-09-01",
};

describe("expenseQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useCategories returns the list from listCategories", async () => {
    vi.mocked(expenseApi.listCategories).mockResolvedValue([
      { id: "cat-1", family_id: null, name: "groceries", icon: "basket" },
    ]);

    const { result } = renderHook(() => useCategories("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toHaveLength(1));
  });

  it("useExpenses returns the list from listExpenses", async () => {
    vi.mocked(expenseApi.listExpenses).mockResolvedValue([]);

    const { result } = renderHook(() => useExpenses("fam-1"), { wrapper: createQueryWrapper() });

    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useCreateCategory invalidates expenseKeys.categories on success", async () => {
    vi.mocked(expenseApi.createCategory).mockResolvedValue({
      id: "cat-2",
      family_id: "fam-1",
      name: "fun",
      icon: "tag",
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateCategory("fam-1"), list: useCategories("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({ name: "fun", icon: "tag" });
    });

    expect(expenseApi.createCategory).toHaveBeenCalledWith("fam-1", "fun", "tag");
    expect(result.current.list.isStale).toBe(true);
  });

  it("useRenameCategory calls renameCategory with the bound familyId", async () => {
    vi.mocked(expenseApi.renameCategory).mockResolvedValue({
      id: "cat-1",
      family_id: "fam-1",
      name: "renamed",
      icon: "tag",
    });
    const { result } = renderHook(() => useRenameCategory("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ categoryId: "cat-1", name: "renamed" });
    });

    expect(expenseApi.renameCategory).toHaveBeenCalledWith("fam-1", "cat-1", "renamed");
  });

  it("useDeleteCategory calls deleteCategory with the bound familyId", async () => {
    vi.mocked(expenseApi.deleteCategory).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteCategory("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("cat-1");
    });

    expect(expenseApi.deleteCategory).toHaveBeenCalledWith("fam-1", "cat-1");
  });

  it("useCreateExpense invalidates expenseKeys.list on success", async () => {
    vi.mocked(expenseApi.createExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      created_by_user_id: "u1",
      description: null,
      ...EXPENSE_INPUT,
    });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateExpense("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync(EXPENSE_INPUT);
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useUpdateExpense calls updateExpense with the bound familyId and given expenseId", async () => {
    vi.mocked(expenseApi.updateExpense).mockResolvedValue({
      id: "exp-1",
      family_id: "fam-1",
      created_by_user_id: "u1",
      description: null,
      ...EXPENSE_INPUT,
    });
    const { result } = renderHook(() => useUpdateExpense("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ expenseId: "exp-1", input: EXPENSE_INPUT });
    });

    expect(expenseApi.updateExpense).toHaveBeenCalledWith("fam-1", "exp-1", EXPENSE_INPUT);
  });

  it("useDeleteExpense calls deleteExpense with the bound familyId and given expenseId", async () => {
    vi.mocked(expenseApi.deleteExpense).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteExpense("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("exp-1");
    });

    expect(expenseApi.deleteExpense).toHaveBeenCalledWith("fam-1", "exp-1");
  });

  it("expenseKeys produces stable, family-scoped keys", () => {
    expect(expenseKeys.categories("fam-1")).toEqual(["families", "fam-1", "categories"]);
    expect(expenseKeys.list("fam-1")).toEqual(["families", "fam-1", "expenses"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/expenses/expenseQueries.test.ts`
Expected: FAIL — `Cannot find module './expenseQueries'`.

- [ ] **Step 3: Implement `expenseQueries.ts`**

Create `frontend/src/expenses/expenseQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createCategory,
  createExpense,
  deleteCategory,
  deleteExpense,
  listCategories,
  listExpenses,
  renameCategory,
  updateExpense,
  type ExpenseInput,
} from "./expenseApi";

export const expenseKeys = {
  categories: (familyId: string) => ["families", familyId, "categories"] as const,
  list: (familyId: string) => ["families", familyId, "expenses"] as const,
};

export function useCategories(familyId: string) {
  return useQuery({
    queryKey: expenseKeys.categories(familyId),
    queryFn: () => listCategories(familyId),
    enabled: Boolean(familyId),
  });
}

export function useExpenses(familyId: string) {
  return useQuery({
    queryKey: expenseKeys.list(familyId),
    queryFn: () => listExpenses(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, icon }: { name: string; icon?: string }) => createCategory(familyId, name, icon),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useRenameCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ categoryId, name }: { categoryId: string; name: string }) =>
      renameCategory(familyId, categoryId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useDeleteCategory(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) => deleteCategory(familyId, categoryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.categories(familyId) });
    },
  });
}

export function useCreateExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseInput) => createExpense(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useUpdateExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ expenseId, input }: { expenseId: string; input: ExpenseInput }) =>
      updateExpense(familyId, expenseId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useDeleteExpense(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpense(familyId, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/expenses/expenseQueries.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Migrate `ExpenseForm.tsx`**

In `frontend/src/expenses/ExpenseForm.tsx`, replace the import block (lines 1–17) with:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { resolveCategoryDisplayName, type Expense } from "./expenseApi";
import { useCategories, useCreateExpense, useUpdateExpense } from "./expenseQueries";
import { Field } from "../components/ui/Field";
import { Button } from "../components/ui/Button";
import { Alert } from "../components/ui/Alert";
import { resolveCategoryIconSymbol } from "./categoryIcons";
import { currencyLocale } from "../utils/currency";
```

Replace the component's state block and fetch effect (lines 42–85) with:

```tsx
export function ExpenseForm({ familyId, expense, currencyCode, onSaved, onCancel }: ExpenseFormProps) {
  const { t } = useTranslation();
  const categoriesQuery = useCategories(familyId);
  const familyDetailQuery = useFamilyDetail(familyId);
  const categories = categoriesQuery.data ?? [];
  const members = familyDetailQuery.data?.members ?? [];
  const activeCurrencyCode = currencyCode ?? familyDetailQuery.data?.currency_code ?? "jpy";
  const [payerUserId, setPayerUserId] = useState(expense?.payer_user_id ?? "");
  const [categoryId, setCategoryId] = useState(expense?.category_id ?? "");
  const [amountInput, setAmountInput] = useState(
    expense ? formatDigitsAsAmount(String(expense.amount), currencyCode ?? "jpy") : "",
  );
  const [isShared, setIsShared] = useState(expense?.is_shared ?? false);
  const [description, setDescription] = useState(expense?.description ?? "");
  const [expenseDate, setExpenseDate] = useState(
    expense?.expense_date ?? new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const createExpenseMutation = useCreateExpense(familyId);
  const updateExpenseMutation = useUpdateExpense(familyId);
  const isSubmitting = createExpenseMutation.isPending || updateExpenseMutation.isPending;
  const payerId = `expense-payer-${familyId}`;
  const categoryIdInput = `expense-category-${familyId}`;
  const amountId = `expense-amount-${familyId}`;
  const sharedId = `expense-shared-${familyId}`;
  const dateId = `expense-date-${familyId}`;
  const descriptionId = `expense-description-${familyId}`;
  const effectivePayerUserId = payerUserId || members[0]?.user_id || "";
  const effectiveCategoryId = categoryId || categories[0]?.id || "";
```

`payerUserId`/`categoryId` default-seeding no longer happens in a `useEffect` (there is no more fetch to react to) — instead, `effectivePayerUserId`/`effectiveCategoryId` compute the fallback inline on every render, and every JSX reference to `payerUserId`/`categoryId` below (the `<select value={...}>` props) changes to `effectivePayerUserId`/`effectiveCategoryId`. The `onChange` handlers (`setPayerUserId`/`setCategoryId`) are unchanged.

Replace `handleSubmit` (lines 87–120) with:

```tsx
  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(toDigits(amountInput));
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
      setError(t("expense.amountMustBePositive"));
      return;
    }
    if (parsedAmount > MAX_INT_32) {
      setError(t("expense.amountTooLarge"));
      return;
    }

    setError(null);
    const input = {
      payer_user_id: effectivePayerUserId,
      category_id: effectiveCategoryId,
      amount: parsedAmount,
      is_shared: isShared,
      description: description || null,
      expense_date: expenseDate,
    };

    const mutationOptions = {
      onSuccess: onSaved,
      onError: (err: unknown) => {
        setError(translateApiError(t, err, "expense.actionFailed"));
      },
    };

    if (expense) {
      updateExpenseMutation.mutate({ expenseId: expense.id, input }, mutationOptions);
    } else {
      createExpenseMutation.mutate(input, mutationOptions);
    }
  }
```

`categories.map(...)` and `members.map(...)` in the JSX below are unchanged (they already read from the local `categories`/`members` names, now sourced from the queries).

- [ ] **Step 6: Update `ExpenseForm.test.tsx`**

In `frontend/src/expenses/ExpenseForm.test.tsx`, replace `import { render, screen } from "@testing-library/react";` with `import { screen } from "@testing-library/react";` and add `import { renderWithProviders } from "../testUtils/renderWithProviders";`. Replace each of the three `render(<ExpenseForm ... />, { wrapper: MemoryRouter })` call sites with:

```tsx
    renderWithProviders(
      <MemoryRouter>
        <ExpenseForm familyId="fam-1" onSaved={onSaved} />
      </MemoryRouter>,
    );
```

(and the equivalent for the third test, which also passes `expense={existingExpense}`). Everything else in the file — the mocks, the `beforeEach`, every assertion — is unchanged; `listCategories`/`createExpense`/`updateExpense`/`getFamilyDetail` are still the exact functions `expenseQueries.ts`/`familyQueries.ts` call internally.

- [ ] **Step 7: Migrate `ExpenseList.tsx`**

In `frontend/src/expenses/ExpenseList.tsx`, replace the import block (lines 1–27) with:

```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useFamilyDetail } from "../families/familyQueries";
import { useSnackbar } from "../components/ui/Snackbar";
import { PageFrame, PageHeader, EmptyState, LoadingState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { resolveCategoryDisplayName, type Category, type Expense } from "./expenseApi";
import {
  useCategories,
  useCreateCategory,
  useDeleteCategory,
  useDeleteExpense,
  useExpenses,
  useRenameCategory,
} from "./expenseQueries";
import { ExpenseForm } from "./ExpenseForm";
import { formatMoney } from "../utils/currency";
import { CATEGORY_ICON_OPTIONS, resolveCategoryIconSymbol } from "./categoryIcons";
```

Replace the component's state block and fetch effect (lines 29–87) with:

```tsx
export function ExpenseList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const { showSnackbar } = useSnackbar();
  const expensesQuery = useExpenses(familyId ?? "");
  const categoriesQuery = useCategories(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const expenses = expensesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const memberNames = Object.fromEntries(
    (familyDetailQuery.data?.members ?? []).map((member) => [member.user_id, member.display_name]),
  );
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const myRole = familyDetailQuery.data?.members.find((member) => member.user_id === user?.id)?.role;
  const isLoading = expensesQuery.isLoading || categoriesQuery.isLoading || familyDetailQuery.isLoading;
  const error =
    expensesQuery.isError || categoriesQuery.isError || familyDetailQuery.isError
      ? t("expense.actionFailed")
      : null;
  const [isCreating, setIsCreating] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [viewingExpenseId, setViewingExpenseId] = useState<string | null>(null);
  const [deletingExpenseId, setDeletingExpenseId] = useState<string | null>(null);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("tag");
  const [renamingCategory, setRenamingCategory] = useState<Category | null>(null);
  const [renameCategoryName, setRenameCategoryName] = useState("");
  const [deletingCategoryId, setDeletingCategoryId] = useState<string | null>(null);
  const deleteExpenseMutation = useDeleteExpense(familyId ?? "");
  const createCategoryMutation = useCreateCategory(familyId ?? "");
  const renameCategoryMutation = useRenameCategory(familyId ?? "");
  const deleteCategoryMutation = useDeleteCategory(familyId ?? "");
  const isCategorySubmitting = createCategoryMutation.isPending;
  const categoryNameInputId = `expense-category-new-${familyId ?? "none"}`;
  const categoryIconInputId = `expense-category-icon-${familyId ?? "none"}`;
```

Replace the four handler functions (`handleDeleteExpense`, `handleCreateCategory`, `handleRenameCategory`, `handleDeleteCategory`, lines 104–170) with:

```tsx
  function handleDeleteExpense(expenseId: string) {
    if (!familyId) return;
    deleteExpenseMutation.mutate(expenseId, {
      onSuccess: () => {
        showSnackbar({ message: t("expense.deleteSuccess"), variant: "success" });
      },
      onError: () => {
        showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handleCreateCategory() {
    if (!familyId) return;

    const trimmedName = newCategoryName.trim();
    if (!trimmedName) {
      return;
    }

    createCategoryMutation.mutate(
      { name: trimmedName, icon: newCategoryIcon },
      {
        onSuccess: () => {
          setNewCategoryName("");
          setNewCategoryIcon("tag");
          setIsAddingCategory(false);
          showSnackbar({ message: t("expense.categoryAdded"), variant: "success" });
        },
        onError: () => {
          showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
        },
      },
    );
  }

  function handleRenameCategory(categoryId: string, newName: string) {
    if (!familyId) return;
    renameCategoryMutation.mutate(
      { categoryId, name: newName },
      {
        onSuccess: () => {
          showSnackbar({ message: t("expense.categoryRenamed"), variant: "success" });
        },
        onError: () => {
          showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
        },
      },
    );
  }

  function handleDeleteCategory(categoryId: string) {
    if (!familyId) return;
    deleteCategoryMutation.mutate(categoryId, {
      onSuccess: () => {
        showSnackbar({ message: t("expense.categoryDeleted"), variant: "success" });
      },
      onError: () => {
        showSnackbar({ message: t("expense.actionFailed"), variant: "error" });
      },
    });
  }
```

Every call site below (`onClick={() => void handleDeleteExpense(...)}` etc. and the rename/delete confirm buttons in the modals) drops its `void` wrapping since these are synchronous now.

Replace the two `ExpenseForm`'s `onSaved` callbacks (the create form around former lines 246–253, and the inline edit form around former lines 277–286) — both simplify since `useCreateExpense`/`useUpdateExpense` (Task 5, Step 5) already invalidate `expenseKeys.list(familyId)`, so `ExpenseList`'s own `useExpenses` refetches automatically and the manual `setExpenses`/redundant `listCategories` refetch are no longer needed:

```tsx
                onSaved={() => {
                  setIsCreating(false);
                  showSnackbar({ message: t("expense.createSuccess"), variant: "success" });
                }}
```

and, for the inline edit form:

```tsx
                          onSaved={() => {
                            setEditingExpenseId(null);
                            showSnackbar({ message: t("expense.updateSuccess"), variant: "success" });
                          }}
```

The rename-category modal's confirm button currently calls `void handleRenameCategory(renamingCategory.id, trimmedName)` — this becomes `handleRenameCategory(renamingCategory.id, trimmedName)` (drop `void`); likewise the delete-expense and delete-category confirm buttons drop their `void` wrapping. Every other line of JSX (the empty state, the expense list rendering, the categories card, the three confirmation modals) is unchanged — it already reads from the same local `expenses`/`categories`/`memberNames`/`familyCurrencyCode`/`myRole`/`isLoading`/`error` names.

- [ ] **Step 8: Update `ExpenseList.test.tsx`**

In `frontend/src/expenses/ExpenseList.test.tsx`, replace `import { render, screen } from "@testing-library/react";` with `import { screen } from "@testing-library/react";`, add `import { renderWithProviders } from "../testUtils/renderWithProviders";`, and change `renderAt`'s `return render(...)` to `return renderWithProviders(...)` (same JSX inside). Everything else in the file is unchanged.

- [ ] **Step 9: Run the affected tests and full typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/expenses`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `cd frontend && pnpm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/expenses
git commit -m "feat(frontend): migrate expenses domain to TanStack Query"
```

---
### Task 6: Dashboard — shared `financeKeys.ts`, `analyticsQueries.ts`, `HomePage`

**Files:**
- Create: `frontend/src/finance/queries/financeKeys.ts`
- Create: `frontend/src/finance/queries/analyticsQueries.ts`
- Test: `frontend/src/finance/queries/analyticsQueries.test.ts`
- Modify: `frontend/src/routes/HomePage.tsx`
- Modify: `frontend/src/routes/HomePage.test.tsx`

**Interfaces:**
- Consumes: `getNetWorth` from `../financeApi` (unchanged); `useFamilies` (Task 4), `useCategories`/`useExpenses` (Task 5); `createQueryWrapper`, `renderWithProviders` (Task 2).
- Produces: `financeKeys.netWorth: (familyId: string, range: { startDate?: string; endDate?: string }) => readonly [...]` from `frontend/src/finance/queries/financeKeys.ts` — every later finance task (7–11) adds its own key(s) to this same file, never redefines one. `useNetWorth(familyId: string, range: { startDate: string; endDate: string })` from `frontend/src/finance/queries/analyticsQueries.ts`.

- [ ] **Step 1: Create the shared `financeKeys.ts`**

Create `frontend/src/finance/queries/financeKeys.ts`:

```ts
export const financeKeys = {
  netWorth: (familyId: string, range: { startDate?: string; endDate?: string }) =>
    ["finance", familyId, "analytics", "net-worth", range.startDate ?? null, range.endDate ?? null] as const,
};
```

This file has no behavior to unit test on its own (it is extended, not tested, by every later finance task) — its key shapes are exercised through `analyticsQueries.test.ts` below and every subsequent domain's own `*Queries.test.ts`.

- [ ] **Step 2: Write the failing test for `analyticsQueries.ts`**

Create `frontend/src/finance/queries/analyticsQueries.test.ts`:

```ts
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import { useNetWorth } from "./analyticsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("useNetWorth", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the snapshot from getNetWorth for the given family and range", async () => {
    vi.mocked(financeApi.getNetWorth).mockResolvedValue({
      current_net_worth: 500000,
      change_amount: 10000,
    });

    const { result } = renderHook(
      () => useNetWorth("fam-1", { startDate: "2026-09-01", endDate: "2026-09-30" }),
      { wrapper: createQueryWrapper() },
    );

    await waitFor(() => expect(result.current.data?.current_net_worth).toBe(500000));
    expect(financeApi.getNetWorth).toHaveBeenCalledWith("fam-1", {
      startDate: "2026-09-01",
      endDate: "2026-09-30",
    });
  });

  it("does not fetch when familyId is empty", () => {
    renderHook(() => useNetWorth("", { startDate: "2026-09-01", endDate: "2026-09-30" }), {
      wrapper: createQueryWrapper(),
    });

    expect(financeApi.getNetWorth).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd frontend && pnpm vitest run src/finance/queries/analyticsQueries.test.ts`
Expected: FAIL — `Cannot find module './analyticsQueries'`.

- [ ] **Step 4: Implement `analyticsQueries.ts`**

Create `frontend/src/finance/queries/analyticsQueries.ts`:

```ts
import { useQuery } from "@tanstack/react-query";
import { getNetWorth } from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useNetWorth(familyId: string, range: { startDate: string; endDate: string }) {
  return useQuery({
    queryKey: financeKeys.netWorth(familyId, range),
    queryFn: () => getNetWorth(familyId, range),
    enabled: Boolean(familyId),
  });
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend && pnpm vitest run src/finance/queries/analyticsQueries.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Migrate `HomePage.tsx`**

In `frontend/src/routes/HomePage.tsx`, replace the data-related imports (the `listMyFamilies`/`listCategories`/`listExpenses`/`getNetWorth` lines, i.e. lines 21–28 and line 37) with:

```tsx
import { useFamilies } from "../families/familyQueries";
import { useCategories, useExpenses } from "../expenses/expenseQueries";
import { resolveCategoryDisplayName } from "../expenses/expenseApi";
import { useNetWorth } from "../finance/queries/analyticsQueries";
```

Replace the component's state block and its four data-fetching `useEffect`s (lines 209–334, i.e. from `const [activeTab, ...` through the closing of the net-worth effect) with:

```tsx
export function HomePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<"overview" | "analysis" | "transactions">("overview");
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [selectedRange, setSelectedRange] = useState<MonthPickerValue>(() => {
    const currentMonth = toYearMonth(new Date());
    return { startMonth: currentMonth, endMonth: currentMonth };
  });

  const familiesQuery = useFamilies();
  const families = familiesQuery.data ?? [];
  const isFamiliesLoading = familiesQuery.isLoading;

  useEffect(() => {
    if (families.length > 0 && !selectedFamilyId) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  useEffect(() => {
    if (families.length === 0) {
      return;
    }

    if (!families.some((family) => family.id === selectedFamilyId)) {
      setSelectedFamilyId(families[0].id);
    }
  }, [families, selectedFamilyId]);

  const fallbackDate = useMemo(() => new Date(), []);
  const rangeContext = useMemo(() => {
    const rawStart = toMonthStart(selectedRange.startMonth, fallbackDate);
    const rawEnd = toMonthEnd(selectedRange.endMonth, fallbackDate);
    const startDate =
      rawStart <= rawEnd ? rawStart : toMonthStart(selectedRange.endMonth, fallbackDate);
    const endDate =
      rawStart <= rawEnd ? rawEnd : toMonthEnd(selectedRange.startMonth, fallbackDate);
    const startMonth = toYearMonth(startDate);
    const endMonth = toYearMonth(endDate);

    return {
      startDate,
      endDate,
      startMonth,
      endMonth,
      monthKeys: buildMonthKeysInRange(startDate, endDate),
    };
  }, [fallbackDate, selectedRange.endMonth, selectedRange.startMonth]);

  const expensesQuery = useExpenses(selectedFamilyId);
  const categoriesQuery = useCategories(selectedFamilyId);
  const expenses = expensesQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const isExpensesLoading = expensesQuery.isLoading || categoriesQuery.isLoading;

  const netWorthQuery = useNetWorth(selectedFamilyId, {
    startDate: toDateKey(rangeContext.startDate),
    endDate: toDateKey(rangeContext.endDate),
  });
  const netWorthSnapshot = netWorthQuery.data ?? null;

  const error =
    familiesQuery.isError
      ? t("family.actionFailed")
      : expensesQuery.isError || categoriesQuery.isError
        ? t("expense.actionFailed")
        : null;
```

Two notes on this replacement:
1. The original had a third effect ("ensure `selectedFamilyId` stays valid when `families` changes") that is functionally identical to seeding the initial selection — both are kept above as two small effects (matching the original's two separate effects) since they run at different times (first-load seeding vs. re-validating after a family is deleted elsewhere) and neither is a data fetch.
2. `rangeContext` moves above `expensesQuery`/`categoriesQuery`/`netWorthQuery` only because `netWorthQuery` needs it — this reordering has no behavioral effect since none of these are effects with ordering-sensitive side effects, only hook calls and a `useMemo`.

Every reference below this point to `families`, `selectedFamilyId`, `expenses`, `categories`, `isFamiliesLoading`, `isExpensesLoading`, `netWorthSnapshot`, `error`, `rangeContext` is unchanged — they resolve to the same local names.

- [ ] **Step 7: Update `HomePage.test.tsx`**

In `frontend/src/routes/HomePage.test.tsx`, replace the imports and add a `financeApi` mock:

```tsx
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import i18n from "../i18n/i18n";
import { HomePage } from "./HomePage";
import { useAuth } from "../auth/useAuth";
import { SnackbarProvider } from "../components/ui/Snackbar";
import { renderWithProviders } from "../testUtils/renderWithProviders";
import { listMyFamilies } from "../families/familyApi";
import { listCategories, listExpenses } from "../expenses/expenseApi";
import { getNetWorth } from "../finance/financeApi";

vi.mock("../families/familyApi", () => ({
  listMyFamilies: vi.fn(),
}));
vi.mock("../expenses/expenseApi", async () => {
  const actual = await vi.importActual<typeof import("../expenses/expenseApi")>("../expenses/expenseApi");
  return {
    ...actual,
    listExpenses: vi.fn(),
    listCategories: vi.fn(),
  };
});
vi.mock("../finance/financeApi", () => ({
  getNetWorth: vi.fn(),
}));

vi.mock("../auth/useAuth");
```

In the `beforeEach`, add resets and a default resolved value for `getNetWorth` alongside the existing ones:

```tsx
    vi.mocked(getNetWorth).mockReset();
    vi.mocked(getNetWorth).mockResolvedValue({ current_net_worth: 0, change_amount: 0 });
```

Replace the `renderPage` function's `return render(...)` with `return renderWithProviders(...)` (same JSX inside). Every other line in the file (mocks list, individual test bodies) is unchanged.

- [ ] **Step 8: Run the affected tests and full typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/routes src/finance/queries`
Expected: PASS.

- [ ] **Step 9: Run the full suite**

Run: `cd frontend && pnpm test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/finance/queries frontend/src/routes/HomePage.tsx frontend/src/routes/HomePage.test.tsx
git commit -m "feat(frontend): migrate dashboard (HomePage) and net-worth analytics to TanStack Query"
```

---
### Task 7: Finance — Goals (`goalsQueries.ts`, slim `goalsStore`, `GoalsPage`)

**Files:**
- Create: `frontend/src/finance/queries/goalsQueries.ts`
- Test: `frontend/src/finance/queries/goalsQueries.test.ts`
- Modify: `frontend/src/finance/queries/financeKeys.ts`
- Modify: `frontend/src/finance/stores/goalsStore.ts`
- Modify: `frontend/src/finance/GoalsPage.tsx`

**Interfaces:**
- Consumes: `useFamilyDetail` (Task 4); `financeKeys` (Task 6, extended here).
- Produces: `financeKeys.accounts(familyId)`, `financeKeys.goals(familyId)`, `financeKeys.goalEntries(familyId, goalId)` added to `frontend/src/finance/queries/financeKeys.ts`. `useAccounts(familyId)`, `useGoals(familyId)`, `useGoalEntries(familyId, goalId: string | undefined)`, `useCreateGoal(familyId)`, `useTogglePauseGoal(familyId)`, `useDeleteGoal(familyId)`, `useCreateGoalEntry(familyId, goalId)` from `frontend/src/finance/queries/goalsQueries.ts` — `useAccounts`/`financeKeys.accounts` is reused by Task 8 (Accounts Ledger) and Task 9 (Subscriptions). `useGoalsStore` now returns only `{ goalForm, entryGoal, entryForm, setGoalForm, setEntryForm, openEntryModal, closeEntryModal, resetGoalForm, resetEntryForm }`.

- [ ] **Step 1: Add this domain's keys to `financeKeys.ts`**

In `frontend/src/finance/queries/financeKeys.ts`, add three entries to the object:

```ts
export const financeKeys = {
  netWorth: (familyId: string, range: { startDate?: string; endDate?: string }) =>
    ["finance", familyId, "analytics", "net-worth", range.startDate ?? null, range.endDate ?? null] as const,
  accounts: (familyId: string) => ["finance", familyId, "accounts"] as const,
  goals: (familyId: string) => ["finance", familyId, "goals"] as const,
  goalEntries: (familyId: string, goalId: string) => ["finance", familyId, "goals", goalId, "entries"] as const,
};
```

- [ ] **Step 2: Write the failing tests for `goalsQueries.ts`**

Create `frontend/src/finance/queries/goalsQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useAccounts,
  useCreateGoal,
  useCreateGoalEntry,
  useDeleteGoal,
  useGoalEntries,
  useGoals,
  useTogglePauseGoal,
} from "./goalsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("goalsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useAccounts returns the list from listAccounts", async () => {
    vi.mocked(financeApi.listAccounts).mockResolvedValue([]);
    const { result } = renderHook(() => useAccounts("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useGoals returns the list from listGoals", async () => {
    vi.mocked(financeApi.listGoals).mockResolvedValue([]);
    const { result } = renderHook(() => useGoals("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useGoalEntries is disabled until a goalId is given", async () => {
    vi.mocked(financeApi.listGoalEntries).mockResolvedValue([]);
    const { result, rerender } = renderHook(({ goalId }: { goalId: string | undefined }) => useGoalEntries("fam-1", goalId), {
      wrapper: createQueryWrapper(),
      initialProps: { goalId: undefined },
    });

    expect(financeApi.listGoalEntries).not.toHaveBeenCalled();

    rerender({ goalId: "goal-1" });
    await waitFor(() => expect(financeApi.listGoalEntries).toHaveBeenCalledWith("fam-1", "goal-1"));
    expect(result.current.data).toEqual([]);
  });

  it("useCreateGoal invalidates financeKeys.goals on success", async () => {
    vi.mocked(financeApi.createGoal).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(() => ({ create: useCreateGoal("fam-1"), list: useGoals("fam-1") }), { wrapper });

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Trip", target_amount: 1000, current_amount: 0 } as never);
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useTogglePauseGoal calls updateGoal with is_paused", async () => {
    vi.mocked(financeApi.updateGoal).mockResolvedValue({} as never);
    const { result } = renderHook(() => useTogglePauseGoal("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ goalId: "goal-1", isPaused: true });
    });

    expect(financeApi.updateGoal).toHaveBeenCalledWith("fam-1", "goal-1", { is_paused: true });
  });

  it("useDeleteGoal calls deleteGoal with the bound familyId", async () => {
    vi.mocked(financeApi.deleteGoal).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteGoal("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("goal-1");
    });

    expect(financeApi.deleteGoal).toHaveBeenCalledWith("fam-1", "goal-1");
  });

  it("useCreateGoalEntry invalidates both financeKeys.goals and financeKeys.goalEntries on success", async () => {
    vi.mocked(financeApi.createGoalEntry).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateGoalEntry("fam-1", "goal-1"),
        goals: useGoals("fam-1"),
        entries: useGoalEntries("fam-1", "goal-1"),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({
        amount: 100,
        entry_type: "contribution",
        occurred_on: "2026-09-01",
      } as never);
    });

    expect(result.current.goals.isStale).toBe(true);
    expect(result.current.entries.isStale).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/finance/queries/goalsQueries.test.ts`
Expected: FAIL — `Cannot find module './goalsQueries'`.

- [ ] **Step 4: Implement `goalsQueries.ts`**

Create `frontend/src/finance/queries/goalsQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createGoal,
  createGoalEntry,
  deleteGoal,
  listAccounts,
  listGoalEntries,
  listGoals,
  updateGoal,
  type CreateGoalEntryInput,
  type CreateGoalInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useAccounts(familyId: string) {
  return useQuery({
    queryKey: financeKeys.accounts(familyId),
    queryFn: () => listAccounts(familyId),
    enabled: Boolean(familyId),
  });
}

export function useGoals(familyId: string) {
  return useQuery({
    queryKey: financeKeys.goals(familyId),
    queryFn: () => listGoals(familyId),
    enabled: Boolean(familyId),
  });
}

export function useGoalEntries(familyId: string, goalId: string | undefined) {
  return useQuery({
    queryKey: financeKeys.goalEntries(familyId, goalId ?? ""),
    queryFn: () => listGoalEntries(familyId, goalId ?? ""),
    enabled: Boolean(familyId) && Boolean(goalId),
  });
}

export function useCreateGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalInput) => createGoal(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useTogglePauseGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, isPaused }: { goalId: string; isPaused: boolean }) =>
      updateGoal(familyId, goalId, { is_paused: isPaused }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useDeleteGoal(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (goalId: string) => deleteGoal(familyId, goalId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
    },
  });
}

export function useCreateGoalEntry(familyId: string, goalId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateGoalEntryInput) => createGoalEntry(familyId, goalId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.goals(familyId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.goalEntries(familyId, goalId) });
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/finance/queries/goalsQueries.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Slim `goalsStore.ts` to UI-only state**

Replace `frontend/src/finance/stores/goalsStore.ts` entirely with:

```ts
import { create } from "zustand";
import type { Goal } from "../financeApi";

interface GoalFormState {
  goalName: string;
  goalTarget: string;
  goalCurrent: string;
  goalDate: string;
  goalMonthlyContribution: string;
  goalIcon: string;
  goalLinkedAccountId: string;
}

interface GoalEntryFormState {
  entryAmount: string;
  entryType: "contribution" | "withdrawal";
  entryDate: string;
  entryNote: string;
}

interface GoalsStore {
  goalForm: GoalFormState;
  entryGoal: Goal | null;
  entryForm: GoalEntryFormState;
  setGoalForm: (patch: Partial<GoalFormState>) => void;
  setEntryForm: (patch: Partial<GoalEntryFormState>) => void;
  openEntryModal: (goal: Goal) => void;
  closeEntryModal: () => void;
  resetGoalForm: () => void;
  resetEntryForm: () => void;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultGoalForm: GoalFormState = {
  goalName: "",
  goalTarget: "",
  goalCurrent: "0",
  goalDate: "",
  goalMonthlyContribution: "",
  goalIcon: "",
  goalLinkedAccountId: "",
};

const defaultEntryForm: GoalEntryFormState = {
  entryAmount: "",
  entryType: "contribution",
  entryDate: todayDate(),
  entryNote: "",
};

export const useGoalsStore = create<GoalsStore>((set) => ({
  goalForm: defaultGoalForm,
  entryGoal: null,
  entryForm: defaultEntryForm,

  setGoalForm: (patch) => {
    set((state) => ({ goalForm: { ...state.goalForm, ...patch } }));
  },

  setEntryForm: (patch) => {
    set((state) => ({ entryForm: { ...state.entryForm, ...patch } }));
  },

  openEntryModal: (goal) => {
    set({ entryGoal: goal, entryForm: { ...defaultEntryForm, entryDate: todayDate() } });
  },

  closeEntryModal: () => {
    set({ entryGoal: null });
  },

  resetGoalForm: () => {
    set({ goalForm: defaultGoalForm });
  },

  resetEntryForm: () => {
    set((state) => ({ entryForm: { ...state.entryForm, entryAmount: "", entryNote: "" } }));
  },
}));
```

- [ ] **Step 7: Migrate `GoalsPage.tsx`**

In `frontend/src/finance/GoalsPage.tsx`, replace the import block (lines 1–15) with:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { type GoalEntry } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import {
  useAccounts,
  useCreateGoal,
  useCreateGoalEntry,
  useDeleteGoal,
  useGoalEntries,
  useGoals,
  useTogglePauseGoal,
} from "./queries/goalsQueries";
import { useGoalsStore } from "./stores/goalsStore";
```

Replace the component body from its declaration through the end of `handleCreateEntry` (lines 21–110) with:

```tsx
export function GoalsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const { goalForm, entryGoal, entryForm, setGoalForm, setEntryForm, closeEntryModal, openEntryModal, resetGoalForm, resetEntryForm } =
    useGoalsStore();

  const goalsQuery = useGoals(familyId ?? "");
  const accountsQuery = useAccounts(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const goalEntriesQuery = useGoalEntries(familyId ?? "", entryGoal?.id);
  const goals = goalsQuery.data ?? [];
  const accounts = accountsQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const selectedGoalEntries = goalEntriesQuery.data ?? [];
  const isLoading = goalsQuery.isLoading || accountsQuery.isLoading || familyDetailQuery.isLoading;
  const queryError =
    goalsQuery.isError || accountsQuery.isError || familyDetailQuery.isError
      ? t("expense.actionFailed")
      : null;
  const error = queryError ?? formError;

  const createGoalMutation = useCreateGoal(familyId ?? "");
  const togglePauseMutation = useTogglePauseGoal(familyId ?? "");
  const deleteGoalMutation = useDeleteGoal(familyId ?? "");
  const createEntryMutation = useCreateGoalEntry(familyId ?? "", entryGoal?.id ?? "");
  const isSavingGoal = createGoalMutation.isPending;
  const isSavingEntry = createEntryMutation.isPending;

  const goalEntryTypeLabel = (entryTypeValue: GoalEntry["entry_type"]) =>
    entryTypeValue === "contribution" ? t("finance.contribution") : t("finance.withdrawal");

  function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const targetAmount = Number(goalForm.goalTarget);
    const currentAmount = Number(goalForm.goalCurrent);
    if (!Number.isFinite(targetAmount) || targetAmount <= 0 || !Number.isFinite(currentAmount) || currentAmount < 0) {
      setFormError(t("expense.actionFailed"));
      return;
    }

    setFormError(null);
    createGoalMutation.mutate(
      {
        name: goalForm.goalName.trim(),
        target_amount: targetAmount,
        current_amount: currentAmount,
        target_date: goalForm.goalDate || null,
        monthly_contribution: goalForm.goalMonthlyContribution ? Number(goalForm.goalMonthlyContribution) : null,
        icon: goalForm.goalIcon.trim() || null,
        linked_account_id: goalForm.goalLinkedAccountId || null,
      },
      {
        onSuccess: () => {
          resetGoalForm();
          showSnackbar({ message: t("finance.goalCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleTogglePause(goalId: string) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) return;

    setFormError(null);
    togglePauseMutation.mutate(
      { goalId, isPaused: !goal.is_paused },
      {
        onSuccess: () => {
          showSnackbar({ message: t("finance.goalUpdated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleDeleteGoal(goalId: string) {
    setFormError(null);
    deleteGoalMutation.mutate(goalId, {
      onSuccess: () => {
        showSnackbar({ message: t("finance.goalDeleted"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }

  function handleOpenEntry(goalId: string) {
    const goal = goals.find((item) => item.id === goalId);
    if (!goal) return;
    openEntryModal(goal);
  }

  function handleCreateEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryGoal) return;

    const amount = Number(entryForm.entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t("expense.amountMustBePositive"));
      return;
    }

    setFormError(null);
    createEntryMutation.mutate(
      {
        amount,
        entry_type: entryForm.entryType,
        occurred_on: entryForm.entryDate,
        note: entryForm.entryNote.trim() || null,
      },
      {
        onSuccess: () => {
          resetEntryForm();
          showSnackbar({ message: t("finance.goalEntryAdded"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }
```

Every call site below (`onClick={() => handleTogglePause(goal.id)}` etc.) is already synchronous — no `void` wrapping to remove here (the original page component never awaited these). In the JSX, replace every occurrence of `isSavingGoal`/`isSavingEntry` (the two `<Button type="submit" loading={...}>` props) with the same local names — they still resolve correctly since they're declared above with the same names, now backed by mutation state. Every other line (the loading early-return, the stats cards, the goal list, the entry modal) is unchanged.

- [ ] **Step 8: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. (`GoalsPage` has no pre-existing component test file — per the Global Constraints, none is added here; `goalsQueries.test.ts` and the slimmed store's own behavior are this task's coverage.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/finance/queries/financeKeys.ts frontend/src/finance/queries/goalsQueries.ts frontend/src/finance/queries/goalsQueries.test.ts frontend/src/finance/stores/goalsStore.ts frontend/src/finance/GoalsPage.tsx
git commit -m "feat(frontend): migrate finance goals domain to TanStack Query"
```

---
### Task 8: Finance — Accounts Ledger (`accountsLedgerQueries.ts`, slim `accountsLedgerStore`, `AccountsLedgerPage`)

**Files:**
- Create: `frontend/src/finance/queries/accountsLedgerQueries.ts`
- Test: `frontend/src/finance/queries/accountsLedgerQueries.test.ts`
- Modify: `frontend/src/finance/queries/financeKeys.ts`
- Modify: `frontend/src/finance/stores/accountsLedgerStore.ts`
- Modify: `frontend/src/finance/AccountsLedgerPage.tsx`

**Interfaces:**
- Consumes: `useAccounts` (Task 7); `useCategories` (Task 5); `useFamilyDetail` (Task 4); `financeKeys` (Task 6/7, extended here).
- Produces: `financeKeys.ledgerTransactions(familyId)` added to `financeKeys.ts`. `useLedgerTransactions(familyId)`, `useCreateAccount(familyId)`, `useToggleAccountActive(familyId)`, `useCreateLedgerTransaction(familyId)` from `frontend/src/finance/queries/accountsLedgerQueries.ts`. `useAccountsLedgerStore` now returns only `{ accountForm, ledgerForm, setAccountForm, setLedgerForm, resetAccountForm, resetLedgerForm }`.

- [ ] **Step 1: Add this domain's key to `financeKeys.ts`**

In `frontend/src/finance/queries/financeKeys.ts`, add:

```ts
  ledgerTransactions: (familyId: string) => ["finance", familyId, "ledger-transactions"] as const,
```

- [ ] **Step 2: Write the failing tests for `accountsLedgerQueries.ts`**

Create `frontend/src/finance/queries/accountsLedgerQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useAccounts,
  useCreateAccount,
  useCreateLedgerTransaction,
  useLedgerTransactions,
  useToggleAccountActive,
} from "./accountsLedgerQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("accountsLedgerQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useLedgerTransactions returns the list from listLedgerTransactions", async () => {
    vi.mocked(financeApi.listLedgerTransactions).mockResolvedValue([]);
    const { result } = renderHook(() => useLedgerTransactions("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useCreateAccount invalidates financeKeys.accounts on success", async () => {
    vi.mocked(financeApi.createAccount).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ create: useCreateAccount("fam-1"), list: useAccounts("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Bank", account_type: "bank" } as never);
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useToggleAccountActive calls updateAccount with is_active", async () => {
    vi.mocked(financeApi.updateAccount).mockResolvedValue({} as never);
    const { result } = renderHook(() => useToggleAccountActive("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ accountId: "acc-1", isActive: false });
    });

    expect(financeApi.updateAccount).toHaveBeenCalledWith("fam-1", "acc-1", { is_active: false });
  });

  it("useCreateLedgerTransaction invalidates both accounts and ledgerTransactions on success", async () => {
    vi.mocked(financeApi.createLedgerTransaction).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateLedgerTransaction("fam-1"),
        accounts: useAccounts("fam-1"),
        transactions: useLedgerTransactions("fam-1"),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({
        transaction_type: "expense",
        amount: 500,
        occurred_on: "2026-09-01",
      } as never);
    });

    expect(result.current.accounts.isStale).toBe(true);
    expect(result.current.transactions.isStale).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/finance/queries/accountsLedgerQueries.test.ts`
Expected: FAIL — `Cannot find module './accountsLedgerQueries'`.

- [ ] **Step 4: Implement `accountsLedgerQueries.ts`**

Create `frontend/src/finance/queries/accountsLedgerQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAccount,
  createLedgerTransaction,
  listLedgerTransactions,
  updateAccount,
  type CreateAccountInput,
  type CreateLedgerTransactionInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export { useAccounts } from "./goalsQueries";

export function useLedgerTransactions(familyId: string) {
  return useQuery({
    queryKey: financeKeys.ledgerTransactions(familyId),
    queryFn: () => listLedgerTransactions(familyId),
    enabled: Boolean(familyId),
  });
}

export function useCreateAccount(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAccountInput) => createAccount(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
    },
  });
}

export function useToggleAccountActive(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ accountId, isActive }: { accountId: string; isActive: boolean }) =>
      updateAccount(familyId, accountId, { is_active: isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
    },
  });
}

export function useCreateLedgerTransaction(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLedgerTransactionInput) => createLedgerTransaction(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.accounts(familyId) });
      queryClient.invalidateQueries({ queryKey: financeKeys.ledgerTransactions(familyId) });
    },
  });
}
```

Re-exporting `useAccounts` from `./goalsQueries` here (rather than importing `financeKeys.accounts` a second time and redefining the hook) keeps exactly one implementation of the accounts query, importable from whichever domain file reads more naturally at each call site.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/finance/queries/accountsLedgerQueries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Slim `accountsLedgerStore.ts` to UI-only state**

Replace `frontend/src/finance/stores/accountsLedgerStore.ts` entirely with:

```ts
import { create } from "zustand";
import type { AccountType, LedgerTransactionType } from "../financeApi";

interface AccountFormState {
  accountName: string;
  accountType: AccountType;
  openingBalance: string;
  creditLimit: string;
  statementClosingDay: string;
  paymentDueDay: string;
  minimumPayment: string;
}

interface LedgerFormState {
  ledgerType: LedgerTransactionType;
  ledgerAmount: string;
  ledgerDate: string;
  sourceAccountId: string;
  destinationAccountId: string;
  ledgerCategoryId: string;
  ledgerDescription: string;
}

interface AccountsLedgerStore {
  accountForm: AccountFormState;
  ledgerForm: LedgerFormState;
  setAccountForm: (patch: Partial<AccountFormState>) => void;
  setLedgerForm: (patch: Partial<LedgerFormState>) => void;
  resetAccountForm: () => void;
  resetLedgerForm: () => void;
}

function defaultDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultAccountForm: AccountFormState = {
  accountName: "",
  accountType: "bank",
  openingBalance: "0",
  creditLimit: "",
  statementClosingDay: "",
  paymentDueDay: "",
  minimumPayment: "",
};

const defaultLedgerForm: LedgerFormState = {
  ledgerType: "expense",
  ledgerAmount: "",
  ledgerDate: defaultDate(),
  sourceAccountId: "",
  destinationAccountId: "",
  ledgerCategoryId: "",
  ledgerDescription: "",
};

export const useAccountsLedgerStore = create<AccountsLedgerStore>((set) => ({
  accountForm: defaultAccountForm,
  ledgerForm: defaultLedgerForm,

  setAccountForm: (patch) => {
    set((state) => ({ accountForm: { ...state.accountForm, ...patch } }));
  },

  setLedgerForm: (patch) => {
    set((state) => ({ ledgerForm: { ...state.ledgerForm, ...patch } }));
  },

  resetAccountForm: () => {
    set({ accountForm: defaultAccountForm });
  },

  resetLedgerForm: () => {
    set((state) => ({
      ledgerForm: {
        ...state.ledgerForm,
        ledgerAmount: "",
        sourceAccountId: "",
        destinationAccountId: "",
        ledgerCategoryId: "",
        ledgerDescription: "",
      },
    }));
  },
}));
```

- [ ] **Step 7: Migrate `AccountsLedgerPage.tsx`**

In `frontend/src/finance/AccountsLedgerPage.tsx`, replace the import block (lines 1–15) with:

```tsx
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { useCategories } from "../expenses/expenseQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { resolveCategoryDisplayName } from "../expenses/expenseApi";
import { formatMoney } from "../utils/currency";
import { type AccountType, type LedgerTransactionType } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import {
  useAccounts,
  useCreateAccount,
  useCreateLedgerTransaction,
  useLedgerTransactions,
  useToggleAccountActive,
} from "./queries/accountsLedgerQueries";
import { useAccountsLedgerStore } from "./stores/accountsLedgerStore";
```

Replace the component body from its declaration through the end of `handleCreateLedger` (lines 28–97) with:

```tsx
export function AccountsLedgerPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const { accountForm, ledgerForm, setAccountForm, setLedgerForm, resetAccountForm, resetLedgerForm } =
    useAccountsLedgerStore();

  const accountsQuery = useAccounts(familyId ?? "");
  const transactionsQuery = useLedgerTransactions(familyId ?? "");
  const categoriesQuery = useCategories(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const accounts = accountsQuery.data ?? [];
  const transactions = transactionsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading =
    accountsQuery.isLoading || transactionsQuery.isLoading || categoriesQuery.isLoading || familyDetailQuery.isLoading;
  const queryError =
    accountsQuery.isError || transactionsQuery.isError || categoriesQuery.isError || familyDetailQuery.isError
      ? t("expense.actionFailed")
      : null;
  const error = queryError ?? formError;

  const createAccountMutation = useCreateAccount(familyId ?? "");
  const toggleAccountActiveMutation = useToggleAccountActive(familyId ?? "");
  const createLedgerMutation = useCreateLedgerTransaction(familyId ?? "");
  const isCreatingAccount = createAccountMutation.isPending;
  const isCreatingLedger = createLedgerMutation.isPending;

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, resolveCategoryDisplayName(category, t)])),
    [categories, t],
  );

  const accountTypeLabel = (type: AccountType) => t(`finance.accountTypeValues.${type}`);
  const ledgerTypeLabel = (type: LedgerTransactionType) => t(`finance.ledgerTypeValues.${type}`);

  function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const opening = Number(accountForm.openingBalance);
    if (!Number.isFinite(opening)) {
      setFormError(t("expense.actionFailed"));
      return;
    }

    setFormError(null);
    createAccountMutation.mutate(
      {
        name: accountForm.accountName.trim(),
        account_type: accountForm.accountType,
        currency_code: familyCurrencyCode === "vnd" ? "vnd" : "jpy",
        opening_balance: opening,
        credit_limit: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.creditLimit) : null,
        statement_closing_day:
          accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.statementClosingDay) : null,
        payment_due_day: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.paymentDueDay) : null,
        minimum_payment: accountForm.accountType === "credit_card" ? toNumberOrNull(accountForm.minimumPayment) : null,
      },
      {
        onSuccess: () => {
          resetAccountForm();
          showSnackbar({ message: t("finance.accountCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleToggleAccountActive(accountId: string) {
    const account = accounts.find((item) => item.id === accountId);
    if (!account) return;

    setFormError(null);
    toggleAccountActiveMutation.mutate(
      { accountId, isActive: !account.is_active },
      {
        onSuccess: () => {
          showSnackbar({
            message: account.is_active ? t("finance.accountDisabled") : t("finance.accountEnabled"),
            variant: "success",
          });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleCreateLedger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const amount = Number(ledgerForm.ledgerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError(t("expense.amountMustBePositive"));
      return;
    }

    setFormError(null);
    createLedgerMutation.mutate(
      {
        transaction_type: ledgerForm.ledgerType,
        amount,
        occurred_on: ledgerForm.ledgerDate,
        description: ledgerForm.ledgerDescription.trim() || null,
        category_id: ledgerForm.ledgerCategoryId || null,
        source_account_id: ledgerForm.sourceAccountId || null,
        destination_account_id: ledgerForm.destinationAccountId || null,
      },
      {
        onSuccess: () => {
          resetLedgerForm();
          showSnackbar({ message: t("finance.ledgerCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }
```

Add this small helper near the top of the file (it existed before as a module-level function and stays one — keep it exactly where it was, just above or below the component, it is unaffected by this migration):

```ts
function toNumberOrNull(value: string): number | null {
  if (!value.trim()) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
```

In the JSX below, replace `isCreatingAccount`/`isCreatingLedger` usages with the same local names (already declared above, now sourced from mutation state) — no other JSX changes needed.

- [ ] **Step 8: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. (`AccountsLedgerPage` has no pre-existing component test file — none added here, per the Global Constraints.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/finance/queries/financeKeys.ts frontend/src/finance/queries/accountsLedgerQueries.ts frontend/src/finance/queries/accountsLedgerQueries.test.ts frontend/src/finance/stores/accountsLedgerStore.ts frontend/src/finance/AccountsLedgerPage.tsx
git commit -m "feat(frontend): migrate finance accounts ledger domain to TanStack Query"
```

---
### Task 9: Finance — Subscriptions (`subscriptionsQueries.ts`, slim `subscriptionsStore`, `SubscriptionsPage`)

**Files:**
- Create: `frontend/src/finance/queries/subscriptionsQueries.ts`
- Test: `frontend/src/finance/queries/subscriptionsQueries.test.ts`
- Modify: `frontend/src/finance/queries/financeKeys.ts`
- Modify: `frontend/src/finance/stores/subscriptionsStore.ts`
- Modify: `frontend/src/finance/SubscriptionsPage.tsx`

**Interfaces:**
- Consumes: `useAccounts` (Task 7); `useCategories` (Task 5); `useFamilyDetail` (Task 4); `financeKeys` (extended here).
- Produces: `financeKeys.subscriptions(familyId)`, `financeKeys.subscriptionSummary(familyId)` added to `financeKeys.ts`. `useSubscriptions(familyId)`, `useSubscriptionSummary(familyId)`, `useCreateSubscription(familyId)`, `useChangeSubscriptionStatus(familyId)`, `useDeleteSubscription(familyId)` from `frontend/src/finance/queries/subscriptionsQueries.ts`. `useSubscriptionsStore` now returns only `{ form, setForm, resetForm }`.

- [ ] **Step 1: Add this domain's keys to `financeKeys.ts`**

In `frontend/src/finance/queries/financeKeys.ts`, add:

```ts
  subscriptions: (familyId: string) => ["finance", familyId, "subscriptions"] as const,
  subscriptionSummary: (familyId: string) => ["finance", familyId, "subscriptions", "summary"] as const,
```

- [ ] **Step 2: Write the failing tests for `subscriptionsQueries.ts`**

Create `frontend/src/finance/queries/subscriptionsQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  useChangeSubscriptionStatus,
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptionSummary,
  useSubscriptions,
} from "./subscriptionsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("subscriptionsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useSubscriptions returns the list from listSubscriptions", async () => {
    vi.mocked(financeApi.listSubscriptions).mockResolvedValue([]);
    const { result } = renderHook(() => useSubscriptions("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useSubscriptionSummary returns the summary from getSubscriptionSummary", async () => {
    vi.mocked(financeApi.getSubscriptionSummary).mockResolvedValue({
      monthly_total: 0,
      yearly_total: 0,
      upcoming_subscription_ids: [],
    });
    const { result } = renderHook(() => useSubscriptionSummary("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data?.monthly_total).toBe(0));
  });

  it("useCreateSubscription invalidates both subscriptions and subscriptionSummary on success", async () => {
    vi.mocked(financeApi.createSubscription).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({
        create: useCreateSubscription("fam-1"),
        list: useSubscriptions("fam-1"),
        summary: useSubscriptionSummary("fam-1"),
      }),
      { wrapper },
    );

    await act(async () => {
      await result.current.create.mutateAsync({ name: "Netflix" } as never);
    });

    expect(result.current.list.isStale).toBe(true);
    expect(result.current.summary.isStale).toBe(true);
  });

  it("useChangeSubscriptionStatus calls updateSubscription with the new status", async () => {
    vi.mocked(financeApi.updateSubscription).mockResolvedValue({} as never);
    const { result } = renderHook(() => useChangeSubscriptionStatus("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ subscriptionId: "sub-1", status: "paused" });
    });

    expect(financeApi.updateSubscription).toHaveBeenCalledWith("fam-1", "sub-1", { status: "paused" });
  });

  it("useDeleteSubscription calls deleteSubscription with the bound familyId", async () => {
    vi.mocked(financeApi.deleteSubscription).mockResolvedValue(undefined);
    const { result } = renderHook(() => useDeleteSubscription("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync("sub-1");
    });

    expect(financeApi.deleteSubscription).toHaveBeenCalledWith("fam-1", "sub-1");
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/finance/queries/subscriptionsQueries.test.ts`
Expected: FAIL — `Cannot find module './subscriptionsQueries'`.

- [ ] **Step 4: Implement `subscriptionsQueries.ts`**

Create `frontend/src/finance/queries/subscriptionsQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSubscription,
  deleteSubscription,
  getSubscriptionSummary,
  listSubscriptions,
  updateSubscription,
  type CreateSubscriptionInput,
  type SubscriptionStatus,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useSubscriptions(familyId: string) {
  return useQuery({
    queryKey: financeKeys.subscriptions(familyId),
    queryFn: () => listSubscriptions(familyId),
    enabled: Boolean(familyId),
  });
}

export function useSubscriptionSummary(familyId: string) {
  return useQuery({
    queryKey: financeKeys.subscriptionSummary(familyId),
    queryFn: () => getSubscriptionSummary(familyId),
    enabled: Boolean(familyId),
  });
}

function invalidateSubscriptions(queryClient: ReturnType<typeof useQueryClient>, familyId: string) {
  queryClient.invalidateQueries({ queryKey: financeKeys.subscriptions(familyId) });
  queryClient.invalidateQueries({ queryKey: financeKeys.subscriptionSummary(familyId) });
}

export function useCreateSubscription(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateSubscriptionInput) => createSubscription(familyId, input),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}

export function useChangeSubscriptionStatus(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ subscriptionId, status }: { subscriptionId: string; status: SubscriptionStatus }) =>
      updateSubscription(familyId, subscriptionId, { status }),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}

export function useDeleteSubscription(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (subscriptionId: string) => deleteSubscription(familyId, subscriptionId),
    onSuccess: () => invalidateSubscriptions(queryClient, familyId),
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/finance/queries/subscriptionsQueries.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Slim `subscriptionsStore.ts` to UI-only state**

Replace `frontend/src/finance/stores/subscriptionsStore.ts` entirely with:

```ts
import { create } from "zustand";
import type { SubscriptionBillingCycle, SubscriptionStatus } from "../financeApi";

interface SubscriptionFormState {
  name: string;
  merchant: string;
  amount: string;
  billingCycle: SubscriptionBillingCycle;
  nextBillingDate: string;
  status: SubscriptionStatus;
  categoryId: string;
  accountId: string;
  cancellationUrl: string;
}

interface SubscriptionsStore {
  form: SubscriptionFormState;
  setForm: (patch: Partial<SubscriptionFormState>) => void;
  resetForm: () => void;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

const defaultForm: SubscriptionFormState = {
  name: "",
  merchant: "",
  amount: "",
  billingCycle: "monthly",
  nextBillingDate: todayDate(),
  status: "active",
  categoryId: "",
  accountId: "",
  cancellationUrl: "",
};

export const useSubscriptionsStore = create<SubscriptionsStore>((set) => ({
  form: defaultForm,

  setForm: (patch) => {
    set((state) => ({ form: { ...state.form, ...patch } }));
  },

  resetForm: () => {
    set({ form: { ...defaultForm, nextBillingDate: todayDate() } });
  },
}));
```

- [ ] **Step 7: Migrate `SubscriptionsPage.tsx`**

In `frontend/src/finance/SubscriptionsPage.tsx`, replace the import block (lines 1–15) with:

```tsx
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { useAccounts } from "./queries/goalsQueries";
import { useCategories } from "../expenses/expenseQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { resolveCategoryDisplayName } from "../expenses/expenseApi";
import { formatMoney } from "../utils/currency";
import { type SubscriptionBillingCycle, type SubscriptionStatus } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import {
  useChangeSubscriptionStatus,
  useCreateSubscription,
  useDeleteSubscription,
  useSubscriptionSummary,
  useSubscriptions,
} from "./queries/subscriptionsQueries";
import { useSubscriptionsStore } from "./stores/subscriptionsStore";
```

Replace the component body from its declaration through the end of `handleDelete` (lines 20–81) with:

```tsx
export function SubscriptionsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();
  const [formError, setFormError] = useState<string | null>(null);

  const { form, setForm, resetForm } = useSubscriptionsStore();

  const subscriptionsQuery = useSubscriptions(familyId ?? "");
  const summaryQuery = useSubscriptionSummary(familyId ?? "");
  const accountsQuery = useAccounts(familyId ?? "");
  const categoriesQuery = useCategories(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const subscriptions = subscriptionsQuery.data ?? [];
  const summary = summaryQuery.data ?? null;
  const accounts = accountsQuery.data ?? [];
  const categories = categoriesQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading =
    subscriptionsQuery.isLoading ||
    summaryQuery.isLoading ||
    accountsQuery.isLoading ||
    categoriesQuery.isLoading ||
    familyDetailQuery.isLoading;
  const queryError =
    subscriptionsQuery.isError ||
    summaryQuery.isError ||
    accountsQuery.isError ||
    categoriesQuery.isError ||
    familyDetailQuery.isError
      ? t("expense.actionFailed")
      : null;
  const error = queryError ?? formError;

  const createSubscriptionMutation = useCreateSubscription(familyId ?? "");
  const changeStatusMutation = useChangeSubscriptionStatus(familyId ?? "");
  const deleteSubscriptionMutation = useDeleteSubscription(familyId ?? "");
  const isSaving = createSubscriptionMutation.isPending;

  const categoryNameById = useMemo(
    () => Object.fromEntries(categories.map((category) => [category.id, resolveCategoryDisplayName(category, t)])),
    [categories, t],
  );

  const billingCycleLabel = (cycle: SubscriptionBillingCycle) => t(`finance.billingCycleValues.${cycle}`);
  const subscriptionStatusLabel = (statusValue: SubscriptionStatus) => t(`finance.subscriptionStatusValues.${statusValue}`);

  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const parsedAmount = Number(form.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError(t("expense.amountMustBePositive"));
      return;
    }

    setFormError(null);
    createSubscriptionMutation.mutate(
      {
        name: form.name.trim(),
        merchant: form.merchant.trim(),
        amount: parsedAmount,
        currency_code: familyCurrencyCode === "vnd" ? "vnd" : "jpy",
        billing_cycle: form.billingCycle,
        next_billing_date: form.nextBillingDate,
        status: form.status,
        category_id: form.categoryId || null,
        account_id: form.accountId || null,
        cancellation_url: form.cancellationUrl.trim() || null,
      },
      {
        onSuccess: () => {
          resetForm();
          showSnackbar({ message: t("finance.subscriptionCreated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleChangeStatus(subscriptionId: string, nextStatus: SubscriptionStatus) {
    setFormError(null);
    changeStatusMutation.mutate(
      { subscriptionId, status: nextStatus },
      {
        onSuccess: () => {
          showSnackbar({ message: t("finance.subscriptionUpdated"), variant: "success" });
        },
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }

  function handleDelete(subscriptionId: string) {
    setFormError(null);
    deleteSubscriptionMutation.mutate(subscriptionId, {
      onSuccess: () => {
        showSnackbar({ message: t("finance.subscriptionDeleted"), variant: "success" });
      },
      onError: (err) => {
        const message = translateApiError(t, err, "expense.actionFailed");
        setFormError(message);
        showSnackbar({ message, variant: "error" });
      },
    });
  }
```

`isSaving` in the JSX below already resolves to this same local name. Every other line (the summary cards, the create form, the subscription list) is unchanged.

- [ ] **Step 8: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. (`SubscriptionsPage` has no pre-existing component test file — none added here, per the Global Constraints.)

- [ ] **Step 9: Commit**

```bash
git add frontend/src/finance/queries/financeKeys.ts frontend/src/finance/queries/subscriptionsQueries.ts frontend/src/finance/queries/subscriptionsQueries.test.ts frontend/src/finance/stores/subscriptionsStore.ts frontend/src/finance/SubscriptionsPage.tsx
git commit -m "feat(frontend): migrate finance subscriptions domain to TanStack Query"
```

---
### Task 10: Finance — Split Expenses (`splitExpensesQueries.ts`, slim `splitExpensesStore`, `SplitExpensesPage`)

This domain has dead code to remove first: `splitExpensesStore.ts` currently also holds a "single expense split" flow (`form`, `splits`, `toggleParticipant`, `setCustomAmount`, `setPercentage`, `createSplit`, `toggleSettle`) and an `expenses` field — none of these are read by `SplitExpensesPage.tsx` (verified: `grep -rn "useSplitExpensesStore\|\.splits\b\|createSplit\b\|toggleSettle\b" frontend/src` finds no consumer outside the store and its own test file). Only the group-based flow is actually rendered. This task deletes that dead code as part of rewriting the store — it is not migrated to TanStack Query because nothing uses it. `financeApi.ts`'s `createSplitExpense`/`listSplitExpenses`/`settleSplitExpenseItem`/`SplitExpense` stay untouched (they still map to real backend endpoints; only the unused frontend store/page wiring is removed).

**Files:**
- Create: `frontend/src/finance/queries/splitExpensesQueries.ts`
- Test: `frontend/src/finance/queries/splitExpensesQueries.test.ts`
- Modify: `frontend/src/finance/queries/financeKeys.ts`
- Modify: `frontend/src/finance/stores/splitExpensesStore.ts`
- Modify: `frontend/src/finance/stores/splitExpensesStore.test.ts`
- Modify: `frontend/src/finance/SplitExpensesPage.tsx`

**Interfaces:**
- Consumes: `useFamilyDetail` (Task 4); `financeKeys` (extended here).
- Produces: `financeKeys.splitExpenseGroups(familyId)` added to `financeKeys.ts`. `useSplitExpenseGroups(familyId)`, `usePreviewSplitExpenseGroup(familyId)`, `usePreviewSplitExpenseGroupSettlement(familyId)`, `useSaveSplitExpenseGroup(familyId)`, `useSettleSplitExpenseGroupSettlement(familyId)` from `frontend/src/finance/queries/splitExpensesQueries.ts`. `useSplitExpensesStore` now returns only `{ groupForm, editingGroupId, groupPreview, settlementPreview, setGroupRange, setGroupForm, toggleGroupParticipant, setGroupCustomAmount, setGroupPercentage, setGroupPreview, setSettlementPreview, startEditGroup, cancelEditGroup }`.

- [ ] **Step 1: Add this domain's key to `financeKeys.ts`**

In `frontend/src/finance/queries/financeKeys.ts`, add:

```ts
  splitExpenseGroups: (familyId: string) => ["finance", familyId, "split-expense-groups"] as const,
```

- [ ] **Step 2: Write the failing tests for `splitExpensesQueries.ts`**

Create `frontend/src/finance/queries/splitExpensesQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import {
  usePreviewSplitExpenseGroup,
  usePreviewSplitExpenseGroupSettlement,
  useSaveSplitExpenseGroup,
  useSettleSplitExpenseGroupSettlement,
  useSplitExpenseGroups,
} from "./splitExpensesQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");

describe("splitExpensesQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useSplitExpenseGroups returns the list from listSplitExpenseGroups", async () => {
    vi.mocked(financeApi.listSplitExpenseGroups).mockResolvedValue([]);
    const { result } = renderHook(() => useSplitExpenseGroups("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("usePreviewSplitExpenseGroup calls previewSplitExpenseGroup with the given range", async () => {
    vi.mocked(financeApi.previewSplitExpenseGroup).mockResolvedValue({ total_amount: 0, expenses: [] });
    const { result } = renderHook(() => usePreviewSplitExpenseGroup("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync({ fromDate: "2026-09-01", toDate: "2026-09-30" });
    });

    expect(financeApi.previewSplitExpenseGroup).toHaveBeenCalledWith("fam-1", "2026-09-01", "2026-09-30", undefined);
  });

  it("usePreviewSplitExpenseGroupSettlement calls previewSplitExpenseGroupSettlement with the given input", async () => {
    vi.mocked(financeApi.previewSplitExpenseGroupSettlement).mockResolvedValue({ settlements: [] });
    const { result } = renderHook(() => usePreviewSplitExpenseGroupSettlement("fam-1"), {
      wrapper: createQueryWrapper(),
    });
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.mutateAsync({ input });
    });

    expect(financeApi.previewSplitExpenseGroupSettlement).toHaveBeenCalledWith("fam-1", input, undefined);
  });

  it("useSaveSplitExpenseGroup calls createSplitExpenseGroup when no groupId is given, and invalidates the group list", async () => {
    vi.mocked(financeApi.createSplitExpenseGroup).mockResolvedValue({} as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ save: useSaveSplitExpenseGroup("fam-1"), list: useSplitExpenseGroups("fam-1") }),
      { wrapper },
    );
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.save.mutateAsync({ groupId: null, input });
    });

    expect(financeApi.createSplitExpenseGroup).toHaveBeenCalledWith("fam-1", input);
    expect(financeApi.updateSplitExpenseGroup).not.toHaveBeenCalled();
    expect(result.current.list.isStale).toBe(true);
  });

  it("useSaveSplitExpenseGroup calls updateSplitExpenseGroup when a groupId is given", async () => {
    vi.mocked(financeApi.updateSplitExpenseGroup).mockResolvedValue({} as never);
    const { result } = renderHook(() => useSaveSplitExpenseGroup("fam-1"), { wrapper: createQueryWrapper() });
    const input = {
      period_start: "2026-09-01",
      period_end: "2026-09-30",
      method: "equal" as const,
      participants: [{ participant_user_id: "u1" }],
    };

    await act(async () => {
      await result.current.mutateAsync({ groupId: "group-1", input });
    });

    expect(financeApi.updateSplitExpenseGroup).toHaveBeenCalledWith("fam-1", "group-1", input);
    expect(financeApi.createSplitExpenseGroup).not.toHaveBeenCalled();
  });

  it("useSettleSplitExpenseGroupSettlement calls settleSplitExpenseGroupSettlement with the given ids", async () => {
    vi.mocked(financeApi.settleSplitExpenseGroupSettlement).mockResolvedValue({} as never);
    const { result } = renderHook(() => useSettleSplitExpenseGroupSettlement("fam-1"), {
      wrapper: createQueryWrapper(),
    });

    await act(async () => {
      await result.current.mutateAsync({ groupId: "group-1", settlementId: "settle-1", isSettled: true });
    });

    expect(financeApi.settleSplitExpenseGroupSettlement).toHaveBeenCalledWith("fam-1", "group-1", "settle-1", true);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/finance/queries/splitExpensesQueries.test.ts`
Expected: FAIL — `Cannot find module './splitExpensesQueries'`.

- [ ] **Step 4: Implement `splitExpensesQueries.ts`**

Create `frontend/src/finance/queries/splitExpensesQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSplitExpenseGroup,
  listSplitExpenseGroups,
  previewSplitExpenseGroup,
  previewSplitExpenseGroupSettlement,
  settleSplitExpenseGroupSettlement,
  updateSplitExpenseGroup,
  type CreateSplitExpenseGroupInput,
} from "../financeApi";
import { financeKeys } from "./financeKeys";

export function useSplitExpenseGroups(familyId: string) {
  return useQuery({
    queryKey: financeKeys.splitExpenseGroups(familyId),
    queryFn: () => listSplitExpenseGroups(familyId),
    enabled: Boolean(familyId),
  });
}

export function usePreviewSplitExpenseGroup(familyId: string) {
  return useMutation({
    mutationFn: ({ fromDate, toDate, excludeGroupId }: { fromDate: string; toDate: string; excludeGroupId?: string }) =>
      previewSplitExpenseGroup(familyId, fromDate, toDate, excludeGroupId),
  });
}

export function usePreviewSplitExpenseGroupSettlement(familyId: string) {
  return useMutation({
    mutationFn: ({
      input,
      excludeGroupId,
    }: {
      input: CreateSplitExpenseGroupInput;
      excludeGroupId?: string;
    }) => previewSplitExpenseGroupSettlement(familyId, input, excludeGroupId),
  });
}

export function useSaveSplitExpenseGroup(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ groupId, input }: { groupId: string | null; input: CreateSplitExpenseGroupInput }) =>
      groupId ? updateSplitExpenseGroup(familyId, groupId, input) : createSplitExpenseGroup(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.splitExpenseGroups(familyId) });
    },
  });
}

export function useSettleSplitExpenseGroupSettlement(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      groupId,
      settlementId,
      isSettled,
    }: {
      groupId: string;
      settlementId: string;
      isSettled: boolean;
    }) => settleSplitExpenseGroupSettlement(familyId, groupId, settlementId, isSettled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.splitExpenseGroups(familyId) });
    },
  });
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/finance/queries/splitExpensesQueries.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Slim `splitExpensesStore.ts` to UI-only state (and drop the dead single-split fields)**

Replace `frontend/src/finance/stores/splitExpensesStore.ts` entirely with:

```ts
import { create } from "zustand";
import type {
  SplitExpenseGroup,
  SplitExpenseGroupPreview,
  SplitExpenseGroupSettlementPreview,
  SplitMethod,
} from "../financeApi";

interface GroupFormState {
  fromDate: string;
  toDate: string;
  method: SplitMethod;
  participantIds: string[];
  customAmountByParticipant: Record<string, string>;
  percentageByParticipant: Record<string, string>;
}

function currentIsoDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

interface SplitExpensesStore {
  groupForm: GroupFormState;
  editingGroupId: string | null;
  groupPreview: SplitExpenseGroupPreview | null;
  settlementPreview: SplitExpenseGroupSettlementPreview | null;
  setGroupRange: (range: { fromDate: string; toDate: string }) => void;
  setGroupForm: (patch: Partial<Omit<GroupFormState, "fromDate" | "toDate">>) => void;
  toggleGroupParticipant: (userId: string) => void;
  setGroupCustomAmount: (userId: string, amount: string) => void;
  setGroupPercentage: (userId: string, percentage: string) => void;
  setGroupPreview: (preview: SplitExpenseGroupPreview | null) => void;
  setSettlementPreview: (preview: SplitExpenseGroupSettlementPreview | null) => void;
  startEditGroup: (group: SplitExpenseGroup) => void;
  cancelEditGroup: () => void;
}

const defaultGroupForm: GroupFormState = {
  fromDate: currentIsoDate(),
  toDate: currentIsoDate(),
  method: "equal",
  participantIds: [],
  customAmountByParticipant: {},
  percentageByParticipant: {},
};

export const useSplitExpensesStore = create<SplitExpensesStore>((set) => ({
  groupForm: defaultGroupForm,
  editingGroupId: null,
  groupPreview: null,
  settlementPreview: null,

  setGroupRange: (range) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...range },
      groupPreview: null,
      settlementPreview: null,
    }));
  },

  setGroupForm: (patch) => {
    set((state) => ({
      groupForm: { ...state.groupForm, ...patch },
      settlementPreview: null,
    }));
  },

  toggleGroupParticipant: (userId) => {
    set((state) => {
      const hasParticipant = state.groupForm.participantIds.includes(userId);
      return {
        groupForm: {
          ...state.groupForm,
          participantIds: hasParticipant
            ? state.groupForm.participantIds.filter((id) => id !== userId)
            : [...state.groupForm.participantIds, userId],
        },
        settlementPreview: null,
      };
    });
  },

  setGroupCustomAmount: (userId, amount) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        customAmountByParticipant: { ...state.groupForm.customAmountByParticipant, [userId]: amount },
      },
      settlementPreview: null,
    }));
  },

  setGroupPercentage: (userId, percentage) => {
    set((state) => ({
      groupForm: {
        ...state.groupForm,
        percentageByParticipant: { ...state.groupForm.percentageByParticipant, [userId]: percentage },
      },
      settlementPreview: null,
    }));
  },

  setGroupPreview: (preview) => {
    set({ groupPreview: preview });
  },

  setSettlementPreview: (preview) => {
    set({ settlementPreview: preview });
  },

  startEditGroup: (group) => {
    set({
      editingGroupId: group.id,
      groupPreview: { total_amount: group.total_amount, expenses: group.expenses },
      settlementPreview: null,
      groupForm: {
        fromDate: group.period_start,
        toDate: group.period_end,
        method: group.method,
        participantIds: group.participants.map((participant) => participant.participant_user_id),
        customAmountByParticipant: Object.fromEntries(
          group.participants.map((participant) => [participant.participant_user_id, String(participant.amount)]),
        ),
        percentageByParticipant: Object.fromEntries(
          group.participants
            .filter((participant) => participant.percentage !== null)
            .map((participant) => [participant.participant_user_id, String(participant.percentage)]),
        ),
      },
    });
  },

  cancelEditGroup: () => {
    set({ editingGroupId: null, groupForm: defaultGroupForm, groupPreview: null, settlementPreview: null });
  },
}));
```

- [ ] **Step 7: Rewrite `splitExpensesStore.test.ts` to match the slimmed store**

Replace `frontend/src/finance/stores/splitExpensesStore.test.ts` entirely with:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { useSplitExpensesStore } from "./splitExpensesStore";

describe("splitExpensesStore", () => {
  beforeEach(() => {
    useSplitExpensesStore.setState(useSplitExpensesStore.getInitialState(), true);
  });

  it("setGroupRange updates fromDate/toDate and clears any existing settlement preview", () => {
    useSplitExpensesStore.setState({
      settlementPreview: { settlements: [] },
    });

    useSplitExpensesStore.getState().setGroupRange({ fromDate: "2026-01-05", toDate: "2026-03-20" });

    const state = useSplitExpensesStore.getState();
    expect(state.groupForm.fromDate).toBe("2026-01-05");
    expect(state.groupForm.toDate).toBe("2026-03-20");
    expect(state.settlementPreview).toBeNull();
  });

  it("startEditGroup prefills groupForm from the given group and sets editingGroupId", () => {
    useSplitExpensesStore.getState().startEditGroup({
      id: "group-1",
      period_start: "2026-09-01",
      period_end: "2026-10-31",
      method: "equal",
      participants: [
        { id: "p1", split_expense_group_id: "group-1", participant_user_id: "u1", amount: 50, percentage: null, is_settled: false },
        { id: "p2", split_expense_group_id: "group-1", participant_user_id: "u2", amount: 50, percentage: null, is_settled: false },
      ],
    } as never);

    const state = useSplitExpensesStore.getState();
    expect(state.editingGroupId).toBe("group-1");
    expect(state.groupForm.fromDate).toBe("2026-09-01");
    expect(state.groupForm.toDate).toBe("2026-10-31");
    expect(state.groupForm.participantIds).toEqual(["u1", "u2"]);
  });

  it("cancelEditGroup clears editingGroupId and resets the form", () => {
    useSplitExpensesStore.setState({ editingGroupId: "group-1" });

    useSplitExpensesStore.getState().cancelEditGroup();

    expect(useSplitExpensesStore.getState().editingGroupId).toBeNull();
  });
});
```

(The removed tests — `previewGroupSettlement stores the API result`, `saveGroup calls createSplitExpenseGroup when not editing`, `saveGroup calls updateSplitExpenseGroup with the full payload when editing` — are superseded by `splitExpensesQueries.test.ts`, Step 2, which now owns that behavior.)

- [ ] **Step 8: Migrate `SplitExpensesPage.tsx`**

In `frontend/src/finance/SplitExpensesPage.tsx`, replace the import block (lines 1–17) with:

```tsx
import { useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { Modal } from "../components/ui/Modal";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { type SplitExpenseGroup, type SplitMethod } from "./financeApi";
import { FinanceNav } from "./FinanceNav";
import { DateRangePicker } from "./DateRangePicker";
import {
  usePreviewSplitExpenseGroup,
  usePreviewSplitExpenseGroupSettlement,
  useSaveSplitExpenseGroup,
  useSettleSplitExpenseGroupSettlement,
  useSplitExpenseGroups,
} from "./queries/splitExpensesQueries";
import { useSplitExpensesStore } from "./stores/splitExpensesStore";
```

Replace the component body from its declaration through the end of `handleSettleGroupSettlement` (lines 21–128) with:

```tsx
export function SplitExpensesPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { user } = useAuth();
  const { familyId } = useParams<{ familyId: string }>();
  const [pendingEditGroup, setPendingEditGroup] = useState<SplitExpenseGroup | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    groupForm,
    setGroupRange,
    setGroupForm,
    toggleGroupParticipant,
    setGroupCustomAmount,
    setGroupPercentage,
    setGroupPreview,
    setSettlementPreview,
    editingGroupId,
    groupPreview,
    settlementPreview,
    startEditGroup,
    cancelEditGroup,
  } = useSplitExpensesStore();

  const groupsQuery = useSplitExpenseGroups(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const groups = groupsQuery.data ?? [];
  const family = familyDetailQuery.data ?? null;
  const isLoading = groupsQuery.isLoading || familyDetailQuery.isLoading;
  const queryError = groupsQuery.isError || familyDetailQuery.isError ? t("expense.actionFailed") : null;
  const error = queryError ?? formError;

  const previewGroupMutation = usePreviewSplitExpenseGroup(familyId ?? "");
  const previewSettlementMutation = usePreviewSplitExpenseGroupSettlement(familyId ?? "");
  const saveGroupMutation = useSaveSplitExpenseGroup(familyId ?? "");
  const settleGroupSettlementMutation = useSettleSplitExpenseGroupSettlement(familyId ?? "");
  const isPreviewLoading = previewGroupMutation.isPending;
  const isSettlementPreviewLoading = previewSettlementMutation.isPending;
  const isGroupSaving = saveGroupMutation.isPending;

  const currencyCode = family?.currency_code ?? "jpy";

  const memberNameById = useMemo(
    () => Object.fromEntries((family?.members ?? []).map((member) => [member.user_id, member.display_name])),
    [family?.members],
  );

  const memberName = (userId: string) => memberNameById[userId] ?? userId;

  const myRole = family?.members.find((member) => member.user_id === user?.id)?.role;

  function canManageGroup(group: SplitExpenseGroup): boolean {
    return group.created_by_user_id === user?.id || myRole === "owner" || myRole === "admin";
  }

  const splitMethodLabel = (methodValue: SplitMethod) => t(`finance.splitMethodValues.${methodValue}`);
  const splitStatusLabel = (statusValue: SplitExpenseGroup["status"]) => t(`finance.splitStatusValues.${statusValue}`);

  function buildParticipants() {
    return groupForm.participantIds.map((participantId) => {
      const base = { participant_user_id: participantId };
      if (groupForm.method === "custom") {
        return { ...base, amount: Number(groupForm.customAmountByParticipant[participantId] ?? 0) };
      }
      if (groupForm.method === "percentage") {
        return { ...base, percentage: Number(groupForm.percentageByParticipant[participantId] ?? 0) };
      }
      return base;
    });
  }

  function handlePreviewGroup() {
    if (!familyId) return;

    setFormError(null);
    previewGroupMutation.mutate(
      { fromDate: groupForm.fromDate, toDate: groupForm.toDate, excludeGroupId: editingGroupId ?? undefined },
      {
        onSuccess: (preview) => setGroupPreview(preview),
        onError: (err) => setFormError(translateApiError(t, err, "expense.actionFailed")),
      },
    );
  }

  function handlePreviewSettlement() {
    if (!familyId) return;

    setFormError(null);
    previewSettlementMutation.mutate(
      {
        input: {
          period_start: groupForm.fromDate,
          period_end: groupForm.toDate,
          method: groupForm.method,
          participants: buildParticipants(),
        },
        excludeGroupId: editingGroupId ?? undefined,
      },
      {
        onSuccess: (preview) => setSettlementPreview(preview),
        onError: (err) => setFormError(translateApiError(t, err, "expense.actionFailed")),
      },
    );
  }

  function handleSaveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId || !groupPreview || groupForm.participantIds.length === 0) {
      setFormError(t("expense.actionFailed"));
      return;
    }

    setFormError(null);
    saveGroupMutation.mutate(
      {
        groupId: editingGroupId,
        input: {
          period_start: groupForm.fromDate,
          period_end: groupForm.toDate,
          method: groupForm.method,
          participants: buildParticipants(),
        },
      },
      {
        onSuccess: () => {
          const wasEditing = Boolean(editingGroupId);
          cancelEditGroup();
          showSnackbar({ message: t(wasEditing ? "finance.splitUpdated" : "finance.splitCreated"), variant: "success" });
        },
        onError: (err) => setFormError(translateApiError(t, err, "expense.actionFailed")),
      },
    );
  }

  function handleEditGroupClick(group: SplitExpenseGroup) {
    if (group.settlements.some((settlement) => settlement.is_settled)) {
      setPendingEditGroup(group);
      return;
    }
    startEditGroup(group);
  }

  function handleConfirmEditGroup() {
    if (pendingEditGroup) {
      startEditGroup(pendingEditGroup);
    }
    setPendingEditGroup(null);
  }

  function handleSettleGroupSettlement(groupId: string, settlementId: string, currentState: boolean) {
    setFormError(null);
    settleGroupSettlementMutation.mutate(
      { groupId, settlementId, isSettled: !currentState },
      {
        onSuccess: () => showSnackbar({ message: t("finance.splitUpdated"), variant: "success" }),
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }
```

Every reference below this point to `family`, `isLoading`, `error`, `groups`, `groupPreview`, `isPreviewLoading`, `isGroupSaving`, `groupForm`, `editingGroupId`, `settlementPreview`, `isSettlementPreviewLoading` is unchanged — they resolve to the same local names. Every `onClick`/`onSubmit` call site (`handlePreviewGroup`, `handlePreviewSettlement`, `handleSaveGroup`, `handleSettleGroupSettlement`) is already synchronous, so no `void` wrapping changes there either.

- [ ] **Step 9: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. (`SplitExpensesPage` has no pre-existing component test file — none added here, per the Global Constraints; `splitExpensesQueries.test.ts` plus the rewritten `splitExpensesStore.test.ts` are this task's coverage.)

- [ ] **Step 10: Commit**

```bash
git add frontend/src/finance/queries/financeKeys.ts frontend/src/finance/queries/splitExpensesQueries.ts frontend/src/finance/queries/splitExpensesQueries.test.ts frontend/src/finance/stores/splitExpensesStore.ts frontend/src/finance/stores/splitExpensesStore.test.ts frontend/src/finance/SplitExpensesPage.tsx
git commit -m "feat(frontend): migrate finance split-expense-groups domain to TanStack Query, drop dead single-split code"
```

---
### Task 11: Finance — Data Ops (`dataOpsQueries.ts`, slim `dataOpsStore`, `DataOpsPage`)

**Files:**
- Create: `frontend/src/finance/queries/dataOpsQueries.ts`
- Test: `frontend/src/finance/queries/dataOpsQueries.test.ts`
- Modify: `frontend/src/finance/stores/dataOpsStore.ts`
- Modify: `frontend/src/finance/DataOpsPage.tsx`

No new `financeKeys.ts` entries are needed — every mutation here either invalidates the existing `expenseKeys.list(familyId)` (Task 5) or reads/writes nothing cacheable (the exports and the import preview are one-shot actions).

**Interfaces:**
- Consumes: `expenseKeys`, `useExpenses` (Task 5); `useFamilyDetail` (Task 4).
- Produces: `useExportExpensesJson(familyId)`, `useExportExpensesCsv(familyId)`, `useExportBackup(familyId)`, `usePreviewExpenseImport(familyId)`, `useCommitExpenseImport(familyId)`, `useDeleteExpenseWithUndo(familyId)`, `useRestoreUndo(familyId)` from `frontend/src/finance/queries/dataOpsQueries.ts`. `useDataOpsStore` now returns only `{ selectedFile, skipDuplicates, undoToken, setSelectedFile, setSkipDuplicates, setUndoToken }`.

- [ ] **Step 1: Write the failing tests for `dataOpsQueries.ts`**

Create `frontend/src/finance/queries/dataOpsQueries.test.ts`:

```ts
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../../testUtils/renderWithProviders";
import { useExpenses } from "../../expenses/expenseQueries";
import {
  useCommitExpenseImport,
  useDeleteExpenseWithUndo,
  useExportBackup,
  useExportExpensesCsv,
  useExportExpensesJson,
  usePreviewExpenseImport,
  useRestoreUndo,
} from "./dataOpsQueries";
import * as financeApi from "../financeApi";

vi.mock("../financeApi");
vi.mock("../../expenses/expenseApi");

describe("dataOpsQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useExportExpensesJson calls exportExpensesJson with the bound familyId", async () => {
    vi.mocked(financeApi.exportExpensesJson).mockResolvedValue({ items: [] });
    const { result } = renderHook(() => useExportExpensesJson("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportExpensesJson).toHaveBeenCalledWith("fam-1");
  });

  it("useExportExpensesCsv calls exportExpensesCsv with the bound familyId", async () => {
    vi.mocked(financeApi.exportExpensesCsv).mockResolvedValue("csv,data");
    const { result } = renderHook(() => useExportExpensesCsv("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportExpensesCsv).toHaveBeenCalledWith("fam-1");
  });

  it("useExportBackup calls exportBackup with the bound familyId", async () => {
    vi.mocked(financeApi.exportBackup).mockResolvedValue({} as never);
    const { result } = renderHook(() => useExportBackup("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(financeApi.exportBackup).toHaveBeenCalledWith("fam-1");
  });

  it("usePreviewExpenseImport calls previewExpenseImport with the given file", async () => {
    const file = new File(["a,b"], "expenses.csv", { type: "text/csv" });
    vi.mocked(financeApi.previewExpenseImport).mockResolvedValue({
      total_rows: 1,
      valid_rows: 1,
      invalid_rows: 0,
      duplicate_rows: 0,
      issues: [],
      rows: [],
    });
    const { result } = renderHook(() => usePreviewExpenseImport("fam-1"), { wrapper: createQueryWrapper() });

    await act(async () => {
      await result.current.mutateAsync(file);
    });

    expect(financeApi.previewExpenseImport).toHaveBeenCalledWith("fam-1", file);
  });

  it("useCommitExpenseImport invalidates expenseKeys.list on success", async () => {
    vi.mocked(financeApi.commitExpenseImport).mockResolvedValue({ created_count: 1, skipped_duplicate_count: 0 });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ commit: useCommitExpenseImport("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.commit.mutateAsync({ rows: [], skip_duplicates: true });
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useDeleteExpenseWithUndo invalidates expenseKeys.list on success", async () => {
    vi.mocked(financeApi.deleteExpenseWithUndo).mockResolvedValue({ undo_token: "tok-1" });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ del: useDeleteExpenseWithUndo("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.del.mutateAsync("exp-1");
    });

    expect(financeApi.deleteExpenseWithUndo).toHaveBeenCalledWith("fam-1", "exp-1");
    expect(result.current.list.isStale).toBe(true);
  });

  it("useRestoreUndo invalidates expenseKeys.list on success", async () => {
    vi.mocked(financeApi.restoreUndoAction).mockResolvedValue({ restored_expense_id: "exp-1" });
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ restore: useRestoreUndo("fam-1"), list: useExpenses("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.restore.mutateAsync("tok-1");
    });

    expect(financeApi.restoreUndoAction).toHaveBeenCalledWith("fam-1", "tok-1");
    expect(result.current.list.isStale).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/finance/queries/dataOpsQueries.test.ts`
Expected: FAIL — `Cannot find module './dataOpsQueries'`.

- [ ] **Step 3: Implement `dataOpsQueries.ts`**

Create `frontend/src/finance/queries/dataOpsQueries.ts`:

```ts
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { expenseKeys } from "../../expenses/expenseQueries";
import {
  commitExpenseImport,
  deleteExpenseWithUndo,
  exportBackup,
  exportExpensesCsv,
  exportExpensesJson,
  previewExpenseImport,
  restoreUndoAction,
  type ExpenseImportCommitInput,
} from "../financeApi";

export function useExportExpensesJson(familyId: string) {
  return useMutation({ mutationFn: () => exportExpensesJson(familyId) });
}

export function useExportExpensesCsv(familyId: string) {
  return useMutation({ mutationFn: () => exportExpensesCsv(familyId) });
}

export function useExportBackup(familyId: string) {
  return useMutation({ mutationFn: () => exportBackup(familyId) });
}

export function usePreviewExpenseImport(familyId: string) {
  return useMutation({ mutationFn: (file: File) => previewExpenseImport(familyId, file) });
}

export function useCommitExpenseImport(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ExpenseImportCommitInput) => commitExpenseImport(familyId, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useDeleteExpenseWithUndo(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (expenseId: string) => deleteExpenseWithUndo(familyId, expenseId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}

export function useRestoreUndo(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (undoToken: string) => restoreUndoAction(familyId, undoToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: expenseKeys.list(familyId) });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/finance/queries/dataOpsQueries.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Slim `dataOpsStore.ts` to UI-only state**

Replace `frontend/src/finance/stores/dataOpsStore.ts` entirely with:

```ts
import { create } from "zustand";

interface DataOpsStore {
  selectedFile: File | null;
  skipDuplicates: boolean;
  undoToken: string;
  setSelectedFile: (file: File | null) => void;
  setSkipDuplicates: (value: boolean) => void;
  setUndoToken: (value: string) => void;
}

export const useDataOpsStore = create<DataOpsStore>((set) => ({
  selectedFile: null,
  skipDuplicates: true,
  undoToken: "",

  setSelectedFile: (file) => {
    set({ selectedFile: file });
  },

  setSkipDuplicates: (value) => {
    set({ skipDuplicates: value });
  },

  setUndoToken: (value) => {
    set({ undoToken: value });
  },
}));
```

- [ ] **Step 6: Migrate `DataOpsPage.tsx`**

In `frontend/src/finance/DataOpsPage.tsx`, replace the import block (lines 1–13) with:

```tsx
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { translateApiError } from "../api/errorI18n";
import { useFamilyDetail } from "../families/familyQueries";
import { useExpenses } from "../expenses/expenseQueries";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Field } from "../components/ui/Field";
import { EmptyState, LoadingState, PageFrame, PageHeader } from "../components/ui/Page";
import { useSnackbar } from "../components/ui/Snackbar";
import { formatMoney } from "../utils/currency";
import { FinanceNav } from "./FinanceNav";
import {
  useCommitExpenseImport,
  useDeleteExpenseWithUndo,
  useExportBackup,
  useExportExpensesCsv,
  useExportExpensesJson,
  usePreviewExpenseImport,
  useRestoreUndo,
} from "./queries/dataOpsQueries";
import { useDataOpsStore } from "./stores/dataOpsStore";

function downloadContent(filename: string, mimeType: string, content: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function nowFileStamp(): string {
  return new Date().toISOString().replaceAll(":", "-").slice(0, 19);
}
```

(`downloadContent`/`nowFileStamp` move here verbatim from the old `dataOpsStore.ts` — they are pure helpers with no store dependency.)

Replace the component body from its declaration through the end of `handleRestoreUndo` (lines 15–107) with:

```tsx
export function DataOpsPage() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const { familyId } = useParams<{ familyId: string }>();

  const { selectedFile, skipDuplicates, undoToken, setSelectedFile, setSkipDuplicates, setUndoToken } =
    useDataOpsStore();

  const expensesQuery = useExpenses(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const expenses = expensesQuery.data ?? [];
  const familyCurrencyCode = familyDetailQuery.data?.currency_code ?? "jpy";
  const isLoading = expensesQuery.isLoading || familyDetailQuery.isLoading;
  const error = expensesQuery.isError || familyDetailQuery.isError ? t("expense.actionFailed") : null;

  const exportJsonMutation = useExportExpensesJson(familyId ?? "");
  const exportCsvMutation = useExportExpensesCsv(familyId ?? "");
  const exportBackupMutation = useExportBackup(familyId ?? "");
  const previewImportMutation = usePreviewExpenseImport(familyId ?? "");
  const commitImportMutation = useCommitExpenseImport(familyId ?? "");
  const deleteWithUndoMutation = useDeleteExpenseWithUndo(familyId ?? "");
  const restoreUndoMutation = useRestoreUndo(familyId ?? "");
  const previewResult = previewImportMutation.data ?? null;
  const isPreviewing = previewImportMutation.isPending;
  const isImporting = commitImportMutation.isPending;
  const isRestoring = restoreUndoMutation.isPending;

  function handleExportJson() {
    exportJsonMutation.mutate(undefined, {
      onSuccess: (payload) => {
        downloadContent(`expenses-${nowFileStamp()}.json`, "application/json", `${JSON.stringify(payload.items, null, 2)}\n`);
        showSnackbar({ message: t("finance.exportJsonDone"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handleExportCsv() {
    exportCsvMutation.mutate(undefined, {
      onSuccess: (csvContent) => {
        downloadContent(`expenses-${nowFileStamp()}.csv`, "text/csv", csvContent);
        showSnackbar({ message: t("finance.exportCsvDone"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handleExportBackup() {
    exportBackupMutation.mutate(undefined, {
      onSuccess: (payload) => {
        downloadContent(`expenses-backup-${nowFileStamp()}.json`, "application/json", `${JSON.stringify(payload, null, 2)}\n`);
        showSnackbar({ message: t("finance.exportBackupDone"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handlePreviewImport() {
    if (!selectedFile) return;
    previewImportMutation.mutate(selectedFile, {
      onSuccess: () => {
        showSnackbar({ message: t("finance.previewReady"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handleCommitImport() {
    if (!previewResult) return;

    const rows = previewResult.rows.map((row) => ({
      payer_user_id: row.payer_user_id,
      category_id: row.category_id,
      amount: row.amount,
      is_shared: row.is_shared,
      description: row.description ?? null,
      expense_date: row.expense_date,
    }));

    commitImportMutation.mutate(
      { rows, skip_duplicates: skipDuplicates },
      {
        onSuccess: (result) => {
          setSelectedFile(null);
          previewImportMutation.reset();
          showSnackbar({
            message: t("finance.importDone", {
              created: result.created_count,
              skipped: result.skipped_duplicate_count,
            }),
            variant: "success",
          });
        },
        onError: (err) => {
          showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
        },
      },
    );
  }

  function handleDeleteWithUndo(expenseId: string) {
    deleteWithUndoMutation.mutate(expenseId, {
      onSuccess: (result) => {
        setUndoToken(result.undo_token);
        showSnackbar({ message: t("finance.deletedWithUndo"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }

  function handleRestoreUndo() {
    const token = undoToken.trim();
    if (!token) return;

    restoreUndoMutation.mutate(token, {
      onSuccess: () => {
        setUndoToken("");
        showSnackbar({ message: t("finance.undoRestored"), variant: "success" });
      },
      onError: (err) => {
        showSnackbar({ message: translateApiError(t, err, "expense.actionFailed"), variant: "error" });
      },
    });
  }
```

Every reference below this point to `expenses`, `familyCurrencyCode`, `previewResult`, `undoToken`, `selectedFile`, `skipDuplicates`, `isLoading`, `isPreviewing`, `isImporting`, `isRestoring`, `error` is unchanged — they resolve to the same local names, and every `onClick={handleExportJson}` etc. call site was already synchronous (no `void` wrapping to remove).

- [ ] **Step 7: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. (`DataOpsPage` has no pre-existing component test file — none added here, per the Global Constraints.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/finance/queries/dataOpsQueries.ts frontend/src/finance/queries/dataOpsQueries.test.ts frontend/src/finance/stores/dataOpsStore.ts frontend/src/finance/DataOpsPage.tsx
git commit -m "feat(frontend): migrate finance data-ops domain to TanStack Query"
```

---
### Task 12: Receipts — `receiptQueries.ts`, `ReceiptList`, `ReceiptUploadForm`

**Files:**
- Create: `frontend/src/receipts/receiptQueries.ts`
- Test: `frontend/src/receipts/receiptQueries.test.ts`
- Modify: `frontend/src/receipts/ReceiptList.tsx`
- Modify: `frontend/src/receipts/ReceiptList.test.tsx`
- Modify: `frontend/src/receipts/ReceiptUploadForm.tsx`
- Modify: `frontend/src/receipts/ReceiptUploadForm.test.tsx`

**Interfaces:**
- Consumes: every function in `./receiptApi` (unchanged); `useFamilyDetail` (Task 4); `createQueryWrapper`, `renderWithProviders` (Task 2).
- Produces: `receiptKeys.list: (familyId: string) => readonly [...]`, `useReceipts(familyId)`, `useUploadReceipt(familyId)`, `useDeleteReceipt(familyId)` from `frontend/src/receipts/receiptQueries.ts`.

- [ ] **Step 1: Write the failing tests for `receiptQueries.ts`**

Create `frontend/src/receipts/receiptQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { receiptKeys, useDeleteReceipt, useReceipts, useUploadReceipt } from "./receiptQueries";
import * as receiptApi from "./receiptApi";

vi.mock("./receiptApi");

describe("receiptQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useReceipts returns the list from listReceipts", async () => {
    vi.mocked(receiptApi.listReceipts).mockResolvedValue([]);
    const { result } = renderHook(() => useReceipts("fam-1"), { wrapper: createQueryWrapper() });
    await waitFor(() => expect(result.current.data).toEqual([]));
  });

  it("useUploadReceipt invalidates receiptKeys.list on success", async () => {
    vi.mocked(receiptApi.uploadReceipt).mockResolvedValue({
      id: "rec-1",
      family_id: "fam-1",
      uploaded_by_user_id: "u1",
      status: "processing",
      created_at: "2026-09-01T00:00:00Z",
    } as never);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ upload: useUploadReceipt("fam-1"), list: useReceipts("fam-1") }),
      { wrapper },
    );
    const file = new File(["x"], "receipt.jpg", { type: "image/jpeg" });

    await act(async () => {
      await result.current.upload.mutateAsync(file);
    });

    expect(receiptApi.uploadReceipt).toHaveBeenCalledWith("fam-1", file);
    expect(result.current.list.isStale).toBe(true);
  });

  it("useDeleteReceipt invalidates receiptKeys.list on success", async () => {
    vi.mocked(receiptApi.deleteReceipt).mockResolvedValue(undefined);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ del: useDeleteReceipt("fam-1"), list: useReceipts("fam-1") }),
      { wrapper },
    );

    await act(async () => {
      await result.current.del.mutateAsync("rec-1");
    });

    expect(receiptApi.deleteReceipt).toHaveBeenCalledWith("fam-1", "rec-1");
    expect(result.current.list.isStale).toBe(true);
  });

  it("receiptKeys produces a stable, family-scoped key", () => {
    expect(receiptKeys.list("fam-1")).toEqual(["families", "fam-1", "receipts"]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/receipts/receiptQueries.test.ts`
Expected: FAIL — `Cannot find module './receiptQueries'`.

- [ ] **Step 3: Implement `receiptQueries.ts`**

Create `frontend/src/receipts/receiptQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { deleteReceipt, listReceipts, uploadReceipt } from "./receiptApi";

export const receiptKeys = {
  list: (familyId: string) => ["families", familyId, "receipts"] as const,
};

export function useReceipts(familyId: string) {
  return useQuery({
    queryKey: receiptKeys.list(familyId),
    queryFn: () => listReceipts(familyId),
    enabled: Boolean(familyId),
  });
}

export function useUploadReceipt(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadReceipt(familyId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.list(familyId) });
    },
  });
}

export function useDeleteReceipt(familyId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (receiptId: string) => deleteReceipt(familyId, receiptId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: receiptKeys.list(familyId) });
    },
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/receipts/receiptQueries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Migrate `ReceiptUploadForm.tsx`**

In `frontend/src/receipts/ReceiptUploadForm.tsx`, replace `import { uploadReceipt, validateReceiptFile, type Receipt } from "./receiptApi";` with:

```tsx
import { validateReceiptFile } from "./receiptApi";
import { useUploadReceipt } from "./receiptQueries";
```

(the `Receipt` type import is no longer needed directly — `onUploaded`'s parameter type is inferred from the mutation's success value). Add `const uploadReceiptMutation = useUploadReceipt(familyId);` alongside the other state, delete `const [isUploading, setIsUploading] = useState(false);`, and replace `handleSubmit`'s body with:

```tsx
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;

    setError(null);
    uploadReceiptMutation.mutate(selectedFile, {
      onSuccess: (receipt) => {
        onUploaded(receipt);
        setSelectedFile(null);
      },
      onError: (err) => {
        setError(translateApiError(t, err, "receipt.uploadFailed"));
      },
    });
  }
```

`handleSubmit` is no longer `async` — the `<form onSubmit={handleSubmit}>` attribute doesn't need to change. Replace `loading={isUploading}` with `loading={uploadReceiptMutation.isPending}` on the submit `<Button>`.

- [ ] **Step 6: Update `ReceiptUploadForm.test.tsx`**

In `frontend/src/receipts/ReceiptUploadForm.test.tsx`, replace `import { render, screen } from "@testing-library/react";` with `import { screen } from "@testing-library/react";`, add `import { renderWithProviders } from "../testUtils/renderWithProviders";`, and change every `render(<ReceiptUploadForm ... />)` call site to `renderWithProviders(<ReceiptUploadForm ... />)`. Everything else is unchanged.

- [ ] **Step 7: Migrate `ReceiptList.tsx`**

In `frontend/src/receipts/ReceiptList.tsx`, replace the import block (lines 1–12) with:

```tsx
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { useAuth } from "../auth/useAuth";
import { useFamilyDetail } from "../families/familyQueries";
import { getReceiptImageUrl } from "./receiptApi";
import { useDeleteReceipt, useReceipts } from "./receiptQueries";
import { ReceiptUploadForm } from "./ReceiptUploadForm";
import { PageFrame, PageHeader, EmptyState, LoadingState } from "../components/ui/Page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { Badge } from "../components/ui/Badge";
import { Alert } from "../components/ui/Alert";
```

Replace the component body from its declaration through `handleDelete` (lines 33–84) with:

```tsx
export function ReceiptList() {
  const { t } = useTranslation();
  const { familyId } = useParams<{ familyId: string }>();
  const { user } = useAuth();
  const receiptsQuery = useReceipts(familyId ?? "");
  const familyDetailQuery = useFamilyDetail(familyId ?? "");
  const receipts = receiptsQuery.data ?? [];
  const myRole = familyDetailQuery.data?.members.find((member) => member.user_id === user?.id)?.role;
  const isLoading = receiptsQuery.isLoading || familyDetailQuery.isLoading;
  const error = receiptsQuery.isError || familyDetailQuery.isError ? t("receipt.uploadFailed") : null;

  const deleteReceiptMutation = useDeleteReceipt(familyId ?? "");
  const canManage = myRole === "owner" || myRole === "admin";

  function statusVariant(status: string): "neutral" | "success" | "danger" | "warning" {
    if (status === "upload") return "success";
    if (status === "failed") return "danger";
    return "warning";
  }

  function handleDelete(receiptId: string) {
    if (!familyId || !window.confirm(t("receipt.confirmDelete"))) return;
    deleteReceiptMutation.mutate(receiptId);
  }
```

Every reference below this point to `receipts`, `isLoading`, `error`, `canManage` is unchanged. The delete button's `onClick={() => void handleDelete(receipt.id)}` becomes `onClick={() => handleDelete(receipt.id)}` (drop `void` — `handleDelete` is synchronous now). `onUploaded={(receipt) => setReceipts((current) => [receipt, ...current])}` on the `<ReceiptUploadForm>` is no longer needed — `useUploadReceipt`'s invalidation already refreshes `useReceipts`, so replace it with `onUploaded={() => {}}` (the prop stays required by `ReceiptUploadForm`'s existing interface, but this list no longer needs to react to the value directly).

- [ ] **Step 8: Update `ReceiptList.test.tsx`**

In `frontend/src/receipts/ReceiptList.test.tsx`, replace `import { render, screen } from "@testing-library/react";` with `import { screen } from "@testing-library/react";`, add `import { renderWithProviders } from "../testUtils/renderWithProviders";`, and change `renderAt`'s `return render(...)` to `return renderWithProviders(...)`. Everything else is unchanged.

- [ ] **Step 9: Run the affected tests and full typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/receipts`
Expected: PASS.

- [ ] **Step 10: Run the full suite**

Run: `cd frontend && pnpm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/receipts
git commit -m "feat(frontend): migrate receipts domain to TanStack Query"
```

---
### Task 13: Notifications — `notificationQueries.ts`, `NotificationCenter`

`NotificationCenter` is rendered by `PageFrame`, so it is present in the tree of every authenticated page — this is the last domain task deliberately, so that by the time it changes, every other page's own test file already renders through `renderWithProviders` (Tasks 4–12), and this change cannot break them.

**Files:**
- Create: `frontend/src/notifications/notificationQueries.ts`
- Test: `frontend/src/notifications/notificationQueries.test.ts`
- Modify: `frontend/src/components/NotificationCenter.tsx`

**Interfaces:**
- Consumes: every function in `./notificationApi` (unchanged).
- Produces: `notificationKeys.all: readonly ["notifications"]`, `notificationKeys.list: (options?: { limit?: number; unreadOnly?: boolean }) => readonly [...]`, `useNotifications(options?)`, `useMarkNotificationRead()`, `useMarkAllNotificationsRead()` from `frontend/src/notifications/notificationQueries.ts`.

- [ ] **Step 1: Write the failing tests for `notificationQueries.ts`**

Create `frontend/src/notifications/notificationQueries.test.ts`:

```ts
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "../testUtils/renderWithProviders";
import { notificationKeys, useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "./notificationQueries";
import * as notificationApi from "./notificationApi";

vi.mock("./notificationApi");

describe("notificationQueries", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("useNotifications passes its options through to listNotifications", async () => {
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const { result } = renderHook(() => useNotifications({ unreadOnly: true, limit: 100 }), {
      wrapper: createQueryWrapper(),
    });

    await waitFor(() => expect(result.current.data).toEqual([]));
    expect(notificationApi.listNotifications).toHaveBeenCalledWith({ unreadOnly: true, limit: 100 });
  });

  it("caches distinct option sets under distinct keys", () => {
    expect(notificationKeys.list({ limit: 20 })).not.toEqual(notificationKeys.list({ unreadOnly: true, limit: 100 }));
  });

  it("useMarkNotificationRead invalidates every notificationKeys.list query on success", async () => {
    vi.mocked(notificationApi.markNotificationRead).mockResolvedValue({
      id: "n1",
      message: "hi",
      created_at: "2026-09-01T00:00:00Z",
      read_at: "2026-09-01T00:01:00Z",
    } as never);
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ mark: useMarkNotificationRead(), list: useNotifications({ limit: 20 }) }),
      { wrapper },
    );

    await act(async () => {
      await result.current.mark.mutateAsync("n1");
    });

    expect(result.current.list.isStale).toBe(true);
  });

  it("useMarkAllNotificationsRead invalidates every notificationKeys.list query on success", async () => {
    vi.mocked(notificationApi.markAllNotificationsRead).mockResolvedValue(undefined);
    vi.mocked(notificationApi.listNotifications).mockResolvedValue([]);
    const wrapper = createQueryWrapper();
    const { result } = renderHook(
      () => ({ markAll: useMarkAllNotificationsRead(), list: useNotifications({ limit: 20 }) }),
      { wrapper },
    );

    await act(async () => {
      await result.current.markAll.mutateAsync();
    });

    expect(result.current.list.isStale).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd frontend && pnpm vitest run src/notifications/notificationQueries.test.ts`
Expected: FAIL — `Cannot find module './notificationQueries'`.

- [ ] **Step 3: Implement `notificationQueries.ts`**

Create `frontend/src/notifications/notificationQueries.ts`:

```ts
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "./notificationApi";

const POLL_INTERVAL_MS = 20000;

export const notificationKeys = {
  all: ["notifications"] as const,
  list: (options?: { limit?: number; unreadOnly?: boolean }) => [...notificationKeys.all, options ?? {}] as const,
};

export function useNotifications(options?: { limit?: number; unreadOnly?: boolean }) {
  return useQuery({
    queryKey: notificationKeys.list(options),
    queryFn: () => listNotifications(options),
    refetchInterval: POLL_INTERVAL_MS,
  });
}

export function useMarkNotificationRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (notificationId: string) => markNotificationRead(notificationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });
}
```

`refetchInterval: 20000` reproduces the original component's `window.setInterval(fetchNotifications, POLL_INTERVAL_MS)` polling — this is the one place in the whole migration that deliberately overrides the shared `QueryClient`'s long default `staleTime`/no-background-refetch posture, because notifications are the one kind of data in this app that is expected to change from outside the current tab.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd frontend && pnpm vitest run src/notifications/notificationQueries.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Migrate `NotificationCenter.tsx`**

In `frontend/src/components/NotificationCenter.tsx`, replace the import block (lines 1–14) with:

```tsx
import { DropdownContent, DropdownMenu } from "./ui/primitives";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "./ui/Button";
import { Badge } from "./ui/Badge";
import { useSnackbar } from "./ui/Snackbar";
import { useMarkAllNotificationsRead, useMarkNotificationRead, useNotifications } from "../notifications/notificationQueries";
import type { NotificationItem } from "../notifications/notificationApi";
```

`NotificationRow` (the standalone component using `NotificationItem`) is unchanged — leave it exactly as-is.

Replace the `NotificationCenter` component from its declaration through the end of `handleOpenChange` (former lines 47–135) with:

```tsx
export function NotificationCenter() {
  const { t } = useTranslation();
  const { showSnackbar } = useSnackbar();
  const [isOpen, setIsOpen] = useState(false);
  // The badge must reflect the TRUE unread total, not just how many of the 20
  // most-recently-fetched notifications happen to be unread — a separate query
  // counts unread items outside that recent window too (up to the API's max limit).
  const latestQuery = useNotifications({ limit: 20 });
  const unreadQuery = useNotifications({ unreadOnly: true, limit: 100 });
  const notifications = latestQuery.data ?? [];
  const unreadCount = unreadQuery.data?.length ?? 0;
  const isLoading = latestQuery.isLoading || unreadQuery.isLoading;
  const lastNotificationIdRef = useRef<string | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    const latest = latestQuery.data;
    if (!latest) {
      return;
    }

    if (latest.length > 0 && hasLoadedRef.current) {
      const newest = latest[0];
      if (newest.id !== lastNotificationIdRef.current && newest.read_at === null) {
        showSnackbar({ message: newest.message, variant: "info", durationMs: 3000 });
      }
    }

    lastNotificationIdRef.current = latest[0]?.id ?? null;
    hasLoadedRef.current = true;
  }, [latestQuery.data, showSnackbar]);

  const markReadMutation = useMarkNotificationRead();
  const markAllReadMutation = useMarkAllNotificationsRead();

  function handleMarkRead(notificationId: string) {
    markReadMutation.mutate(notificationId, {
      onError: () => showSnackbar({ message: t("notification.actionFailed"), variant: "error" }),
    });
  }

  function handleMarkAllRead() {
    markAllReadMutation.mutate(undefined, {
      onError: () => showSnackbar({ message: t("notification.actionFailed"), variant: "error" }),
    });
  }

  const handleOpenChange = useCallback(
    (nextOpen: boolean) => {
      setIsOpen(nextOpen);
      if (nextOpen) {
        void latestQuery.refetch();
        void unreadQuery.refetch();
      }
    },
    [latestQuery, unreadQuery],
  );
```

Below this point, every JSX reference to `isOpen`, `isLoading`, `notifications`, `unreadCount` is unchanged. `onClick={() => void handleMarkAllRead()}` becomes `onClick={handleMarkAllRead}` and `onMarkRead={(notificationId) => void handleMarkRead(notificationId)}` becomes `onMarkRead={handleMarkRead}` (both handlers are synchronous now — they hand off to `.mutate`, not `await`).

- [ ] **Step 6: Run typecheck and the full suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS. `NotificationCenter` has no pre-existing component test file, and — because Tasks 4 through 12 already moved every tested `PageFrame`-rendering page onto `renderWithProviders` — no other test file should newly fail from this change either.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/notifications/notificationQueries.ts frontend/src/notifications/notificationQueries.test.ts frontend/src/components/NotificationCenter.tsx
git commit -m "feat(frontend): migrate notifications to TanStack Query"
```

---
### Task 14: Remove now-dead `Notify`/`Translate` types, full verification pass

Every finance store's mutation-handling methods (the reason `frontend/src/finance/stores/types.ts` existed) were removed in Tasks 7–11 — every remaining store action is a synchronous setter that takes no `t`/`notify` parameter. This task confirms the file is genuinely unused before deleting it, then runs the complete verification suite from the spec (section 9) end-to-end.

**Files:**
- Delete: `frontend/src/finance/stores/types.ts` (only if Step 1 confirms it is unused)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this task only removes dead code and verifies.

- [ ] **Step 1: Confirm `finance/stores/types.ts` has no remaining consumer**

Run: `grep -rn "stores/types\"" frontend/src --include="*.ts" --include="*.tsx"`
Expected: no output (every `import ... from "./types"` / `"../stores/types"` that referenced `Notify`/`Translate`/`SnackbarMessage` was removed when its store was slimmed in Tasks 7–11).

If this grep finds any remaining import, stop and read that file — do not delete `types.ts` until every consumer is gone; that would indicate a store slimming step was missed earlier in the plan.

- [ ] **Step 2: Delete the dead file**

```bash
git rm frontend/src/finance/stores/types.ts
```

- [ ] **Step 3: Run the full verification suite**

Run, in order, from `frontend/`:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Expected: all four succeed with no errors or warnings. `pnpm build` in particular catches anything `typecheck` alone would miss (e.g. a Vite-specific import issue), and confirms `ReactQueryDevtools` is excluded from the production bundle by the `import.meta.env.DEV` guard added in Task 1 — check the build output's file list for `App.tsx`'s chunk and confirm no `@tanstack/react-query-devtools` module is listed as a non-dev-only dependency of it.

- [ ] **Step 4: Run the Playwright smoke suite**

Run: `cd frontend && pnpm test:ui:smoke`
Expected: PASS. This is the closest thing to an end-to-end check that real user flows (login, navigating between families, viewing pages) still work against a running app, not just mocked unit tests.

- [ ] **Step 5: Manual verification against a running dev server**

Per spec section 9, with the backend running (see `docker-compose.yml` / `README.md` for local setup) and `cd frontend && pnpm dev`:

1. Log in, view a family's dashboard — confirm the KPI cards, charts, and transaction table render with real data.
2. Create, edit, and delete an expense — confirm the list updates immediately after each action (via cache invalidation, not a manual refresh).
3. Open Goals, Split Expenses, Subscriptions, Accounts Ledger, and Data Ops in turn — confirm each renders its list and that creating/updating/deleting an item in each is reflected immediately.
4. Open the browser devtools Network tab, navigate to a page, then navigate away and back within a few seconds — confirm no new request fires for data already cached (proof the long `staleTime` is doing its job).
5. Open the React Query Devtools panel (bottom of the screen in dev mode) and confirm it lists the expected query keys per page, with no key colliding across unrelated families.
6. Log out and log back in as a different account — confirm no data from the previous account is visible anywhere (proof `queryClient.clear()` in `useLogout` works).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(frontend): remove dead Notify/Translate store types after TanStack Query migration"
```

---

## Self-Review Notes

- **Spec coverage:** every section of `docs/superpowers/specs/2026-09-14-tanstack-query-migration-design.md` maps to a task — §3/§4 (QueryClient, deps) → Task 1; §8 (testing) → Task 2 and every domain task's test steps; §6.1 (auth) → Task 3; §6.2 (families) → Task 4; §6.3 (expenses) → Task 5; §6.4 (finance stores, including the goals/accounts/subscriptions/split/data-ops breakdown and the `getFamilyDetail` dedup note) → Tasks 6–11; §6.5 (receipts) → Task 12; §6.6 (notifications) → Task 13; §7 (error handling, unchanged) → implicit in every task's `translateApiError` reuse; §9 (verification) → Task 14.
- **Discovered during research, not in the original spec:** `HomePage.tsx` (the dashboard) also fetches directly via `useEffect` and was missing from the spec's file inventory — added as Task 6 with its own `useNetWorth`/`financeKeys.netWorth`. `splitExpensesStore.ts`'s single-split fields (`form`, `splits`, `createSplit`, `toggleSettle`) were found to be dead code with no UI consumer — Task 10 removes them instead of migrating them, and calls this out explicitly so the executing engineer doesn't think it's an oversight.
- **Type consistency:** `financeKeys` is defined once (Task 6) and only ever extended (Tasks 7–11), never redefined — every task that adds a key states the exact existing object it's adding to. `useAccounts`/`financeKeys.accounts` has one implementation (Task 7, `goalsQueries.ts`) re-exported by Task 8's `accountsLedgerQueries.ts` and imported directly by Task 9's `SubscriptionsPage.tsx`, so there is exactly one `useAccounts` in the codebase, not three. `useFamilyDetail`/`familyKeys.detail` (Task 4), `useExpenses`/`useCategories`/`expenseKeys` (Task 5), and `expenseKeys.list` (reused by Task 11's `dataOpsQueries.ts`) follow the same single-definition-many-importers pattern throughout.

