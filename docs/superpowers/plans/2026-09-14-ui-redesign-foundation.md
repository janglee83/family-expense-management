# UI Redesign — Foundation & Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the warm-neutral/terracotta-accent design token overhaul (colors, typography, shape, shadow, motion) plus a consistent inline per-field form-validation pattern across every existing form in the app — the two parts of the phase-2 UI redesign spec that are fully specified and don't require new page-layout mockups.

**Architecture:** A one-time edit to `frontend/src/styles.css`'s `@theme` tokens and two component files (`Button`/`buttonClassName`, `Card`) cascades the new visual language to every page automatically, since every page already composes from this shared library — confirmed by reading `Badge.tsx`/`Alert.tsx`/`Modal.tsx`, which use only semantic tokens with zero hardcoded colors. On top of that cascade, every form in the app (11 files) is refactored from one flat `error: string | null` + a single top-level `<Alert>` to per-field error state rendered via `Field`'s existing (already-built, unused-until-now) `error` prop, with the top-level `<Alert>` kept only for errors that don't belong to one field.

**Tech Stack:** React 18 + TypeScript, Tailwind v4 (`@theme` CSS custom properties, OKLCH colors), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-14-ui-redesign-design.md`

**Out of scope for this plan (deferred to future plans, one visual-mockup cycle per page/group first):** the per-page layout reconsideration in spec §5.2–§5.8 (Dashboard, Expenses list/detail layout, the five finance pages' shared new template, Families, Receipts, Auth, Onboarding page structure). This plan only does what spec §5 calls "the automatic cascade" (§2–§3) plus the validation-pattern rewiring (§4), which needs no new visual design — every layout stays exactly as it is today, just restyled and revalidated in place.

## Global Constraints

- `--color-primary`/`--color-primary-foreground` move to the terracotta hue (~42-45°); every other neutral token (`background`/`foreground`/`card`/`muted`/`border`) moves to the warm-stone hue (~50-60°) at lower chroma than today — not the cool blue-slate hue (~255-262°) the codebase currently uses. `--color-secondary`/`--color-secondary-foreground` move to a soft terracotta *tint* (still ~42° hue, low chroma), not neutral gray (spec §2.1).
- `--font-sans` gets `"Quicksand"` prepended ahead of `"Be Vietnam Pro"`/`"Noto Sans JP"` — per-character font fallback means Vietnamese/Japanese text is unaffected (spec §2.2). `--font-mono` is untouched.
- Default surface radius moves from `--radius-lg` to `--radius-xl`; default surface elevation moves from `shadow-sm` to `shadow-md`; shadow color becomes `color-mix(in oklab, var(--color-foreground) …%, transparent)` instead of a hardcoded cool RGB (spec §2.3).
- All hover "lift" motion (`-translate-y-0.5` / `translate-y-0` transform pairs) is removed wherever it exists — the user explicitly chose "subtle" (color/shadow only) over "lift" and "bounce" after live-testing all three in-browser (spec §2.4). No new animation library.
- No `*Api.ts` file changes, no backend changes (spec §7) — this plan only touches `frontend/src/styles.css`, `frontend/src/components/ui/*`, and the 11 form-bearing page/component files listed in Task 4 onward.
- Every form-level validation failure that's attributable to one specific field renders via `Field`'s existing `error` prop directly under that field; only failures not attributable to one field (network errors, "family not found", etc.) keep the single top-level `<Alert>` (spec §4). Submit stays blocked while any field has an error.
- Playwright's visual-regression snapshot baselines (`frontend/playwright.config.ts`'s `toHaveScreenshot`) need regenerating once, at the very end, after every other task — not per-task, since intermediate states aren't meant to be individually "correct" screenshots (spec §6).

---

### Task 1: Design tokens (`frontend/src/styles.css`)

**Files:**
- Modify: `frontend/src/styles.css`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: every semantic color/font/radius/shadow token every later task and every existing component relies on. No new token *names* are added — only the *values* of `--color-primary`, `--color-primary-foreground`, `--color-secondary`, `--color-secondary-foreground`, `--color-background`, `--color-foreground`, `--color-card`, `--color-card-foreground`, `--color-muted`, `--color-muted-foreground`, `--color-border`, `--font-sans`, `--shadow-sm`, `--shadow-md`, `--shadow-lg` change, plus `.surface-card`/`.surface-elevated`/`.interactive-row`'s utility-class definitions.

This is a pure CSS/styling change with no unit-testable logic — there is no failing-test-first cycle for a stylesheet edit. Verification here is: the full existing test suite must stay 100% green (nothing in this file affects component *behavior*), plus a manual visual check in a running dev server. Do not invent a fake Vitest test for a CSS value.

- [ ] **Step 1: Update the Google Fonts import and `--font-sans`**

In `frontend/src/styles.css` line 1, add Quicksand to the import:

```css
@import url("https://fonts.googleapis.com/css2?family=Quicksand:wght@500;600;700&family=Be+Vietnam+Pro:wght@400;500;600;700&family=Noto+Sans+JP:wght@400;500;600;700&display=swap");
```

In the `@theme` block, change `--font-sans` (line 5):

```css
  --font-sans: "Quicksand", "Be Vietnam Pro", "Noto Sans JP", "Hiragino Sans", "Segoe UI", sans-serif;
```

`--font-mono` (line 6) is unchanged.

- [ ] **Step 2: Update the light-mode color tokens in `@theme`**

Replace lines 8-19 (from `--color-background` through `--color-secondary-foreground`) with:

```css
  --color-background: oklch(0.975 0.004 58);
  --color-foreground: oklch(0.26 0.012 55);
  --color-card: oklch(0.995 0.002 60);
  --color-card-foreground: oklch(0.26 0.012 55);
  --color-muted: oklch(0.948 0.006 58);
  --color-muted-foreground: oklch(0.5 0.012 55);
  --color-border: oklch(0.89 0.008 58);

  --color-primary: oklch(0.62 0.19 42);
  --color-primary-foreground: oklch(0.99 0.005 60);
  --color-secondary: oklch(0.93 0.035 42);
  --color-secondary-foreground: oklch(0.35 0.06 40);
```

`--color-destructive`/`--color-success`/`--color-warning`/`--color-info` and their `-foreground` pairs (lines 21-28) are unchanged in this step — Task 3's visual QA pass flags it if any of them clash against the new neutral/primary tokens.

- [ ] **Step 3: Update `--radius-*` comment and `--shadow-*` to use warm, foreground-derived color**

`--radius-sm`/`-md`/`-lg`/`-xl` (lines 30-33) keep their current values (`0.4rem`/`0.7rem`/`1rem`/`1.25rem`) — this task changes *which* radius utility `.surface-card`/`.surface-elevated` use (Step 5), not the radius scale itself.

Replace `--shadow-sm`/`--shadow-md`/`--shadow-lg` (lines 35-37) with:

```css
  --shadow-sm: 0 1px 2px -1px color-mix(in oklab, var(--color-foreground) 12%, transparent), 0 1px 1px color-mix(in oklab, var(--color-foreground) 6%, transparent);
  --shadow-md: 0 6px 16px -8px color-mix(in oklab, var(--color-foreground) 24%, transparent), 0 2px 8px -4px color-mix(in oklab, var(--color-foreground) 14%, transparent);
  --shadow-lg: 0 18px 35px -16px color-mix(in oklab, var(--color-foreground) 36%, transparent), 0 8px 16px -10px color-mix(in oklab, var(--color-foreground) 20%, transparent);
```

This makes every shadow tint warm automatically once `--color-foreground` is warm (Step 2), with no separate warm/cool shadow token needed — matching spec §2.3.

- [ ] **Step 4: Update both dark-mode blocks**

`frontend/src/styles.css` has two dark blocks that are kept as exact duplicates of each other (`:root[data-theme="dark"]` at lines 48-69, and `:root:not([data-theme="light"])` inside the `@media (prefers-color-scheme: dark)` block at lines 72-93). Apply the **same** replacement to both:

```css
    --color-background: oklch(0.2 0.012 50);
    --color-foreground: oklch(0.94 0.008 50);
    --color-card: oklch(0.24 0.012 50);
    --color-card-foreground: oklch(0.94 0.008 50);
    --color-muted: oklch(0.31 0.012 50);
    --color-muted-foreground: oklch(0.76 0.012 50);
    --color-border: oklch(0.34 0.012 50);
    --color-primary: oklch(0.72 0.17 45);
    --color-primary-foreground: oklch(0.18 0.03 40);
    --color-secondary: oklch(0.32 0.05 42);
    --color-secondary-foreground: oklch(0.92 0.03 50);
```

(This replaces the `--color-background` through `--color-secondary-foreground` lines in each block — `--color-destructive` through `--color-info-foreground` below them are unchanged, same as Step 2.) After this edit, re-diff the two blocks against each other (e.g. `sed -n '48,69p' frontend/src/styles.css` vs the `@media` block's inner lines) to confirm they're still byte-identical, since the file's own convention depends on that.

- [ ] **Step 5: Bump default surface radius/elevation and remove the "lift" hover motion**

Replace `.surface-card`/`.surface-elevated` (lines 196-202):

```css
  .surface-card {
    @apply rounded-xl border border-border bg-card/90 shadow-md backdrop-blur-sm;
  }

  .surface-elevated {
    @apply rounded-xl border border-border bg-card/95 shadow-md backdrop-blur-xl;
  }
```

Replace `.interactive-row` (lines 204-206), removing the translate-y transform, keeping only color/shadow:

```css
  .interactive-row {
    @apply relative overflow-hidden rounded-md border border-border bg-muted/30 px-4 py-3 transition-all duration-200 hover:border-primary/35 hover:bg-card hover:shadow-sm;
  }
```

(`.interactive-row::after`'s hover-line and `.enter-fade`/`.enter-rise`/`prefers-reduced-motion` blocks below are unchanged.)

- [ ] **Step 6: Verify nothing broke**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all four pass — this is a pure styling change, so the existing 119-test suite (behavior-only) must stay 100% green with zero modifications needed to any test file.

- [ ] **Step 7: Manual visual spot-check**

Run: `cd frontend && pnpm dev`, open `http://localhost:5173` in a browser (log in or register a test account first if needed). Confirm:
- Buttons/links/focus rings show the new terracotta color, not the old blue-indigo.
- Body text and headings render in Quicksand for Latin characters (check any English UI chrome or numeric KPI value) and still render Vietnamese/Japanese text correctly (switch language via the 🌐 switcher and re-check — diacritics and Japanese characters must NOT show tofu/missing-glyph boxes).
- Cards have visibly more rounded corners and a slightly stronger shadow than before.
- Hovering a row/card/button shows a color/shadow change only — no upward movement.
- Toggle dark mode (🖥️/theme button) and repeat the same checks.

Note anything that looks wrong for Task 3 to address, but do not fix component-level issues in this task — this task's scope is `styles.css` only.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/styles.css
git commit -m "feat(frontend): warm terracotta design tokens, Quicksand type, softer motion"
```

---

### Task 2: `Button`/`buttonClassName` and `Card` — pill shape, motion, shadow

**Files:**
- Modify: `frontend/src/components/ui/buttonClassName.ts`
- Modify: `frontend/src/components/ui/Card.tsx`

**Interfaces:**
- Consumes: `--color-primary`/`--color-secondary`/`--shadow-*` from Task 1.
- Produces: no new exports — `buttonClassName`'s signature (`{ variant?, size?, className? }`) and `Card`/`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`'s signatures are unchanged. Every existing call site (dozens across the app) keeps working with zero changes, since only the *classes* these functions return change, not their API.

- [ ] **Step 1: Give primary/secondary buttons a pill shape, remove the lift motion, keep radius explicit per-variant**

`frontend/src/components/ui/cn.ts`'s `cn()` is a plain string-join (not `tailwind-merge`), so `BASE_CLASSES` must not carry a radius class that a variant then tries to override — put radius on each variant instead. Replace the whole file content:

```ts
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const BASE_CLASSES =
  "inline-flex items-center justify-center gap-2 font-medium transition-all duration-200 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "rounded-full bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md focus-visible:ring-primary/70",
  secondary:
    "rounded-full bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/85 focus-visible:ring-secondary/70",
  outline:
    "rounded-md border border-border bg-card text-foreground hover:border-primary/35 hover:bg-muted focus-visible:ring-primary/60",
  ghost: "rounded-md bg-transparent text-foreground hover:bg-muted focus-visible:ring-primary/60",
  destructive:
    "rounded-md bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 focus-visible:ring-destructive/70",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-sm",
};

interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
}

export function buttonClassName({
  variant = "primary",
  size = "md",
  className,
}: ButtonClassNameOptions = {}) {
  return cn(BASE_CLASSES, VARIANT_CLASSES[variant], SIZE_CLASSES[size], className);
}
```

Changes from the current file: `BASE_CLASSES` drops `rounded-md` and `motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0` (the lift motion spec §2.4 says to remove); `primary`/`secondary` gain `rounded-full` plus (`primary` only) `hover:shadow-md` as its subtle-motion feedback; `outline`/`ghost`/`destructive` gain an explicit `rounded-md` (previously inherited from `BASE_CLASSES`, now stated per-variant since `BASE_CLASSES` no longer sets it) — their visual radius is unchanged.

- [ ] **Step 2: Escalate `Card`'s hover shadow to match the new higher resting elevation**

In `frontend/src/components/ui/Card.tsx`, replace line 8 (the `Card` function's className):

```tsx
        "surface-card transition-all duration-200 motion-safe:hover:border-primary/25 motion-safe:hover:shadow-lg",
```

(`.surface-card`'s resting shadow is now `shadow-md` per Task 1 — hovering to `shadow-lg`, the top of the existing shadow scale, keeps a visible-but-subtle step up. No translate/scale is added, consistent with `.interactive-row`'s equivalent fix in Task 1.) Every other line in `Card.tsx` (`CardHeader`/`CardTitle`/`CardDescription`/`CardContent`/`CardFooter`) is unchanged.

- [ ] **Step 3: Run the full suite and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS, 100% green, same as Task 1 (no component test asserts on exact Tailwind class strings for `Button`/`Card`, so this should need no test changes — if you find one that does, that test is asserting an implementation detail it shouldn't; fix the test to assert on rendered role/text/behavior instead, not on class names).

- [ ] **Step 4: Manual visual spot-check**

Run: `cd frontend && pnpm dev`. Find any page with a primary button (e.g. the login page's "ログイン"/"Login" button) and any page with the sidebar's active nav link (any page — it's `PageFrame`'s "secondary"-variant active state). Confirm:
- Primary and secondary buttons are now fully pill-shaped (fully rounded ends).
- Outline/ghost/destructive buttons keep their previous, less-rounded corners.
- The active sidebar nav item shows a soft terracotta-tinted background (from `--color-secondary`), not plain gray.
- Hovering a `Card` shows a shadow increase with no movement.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ui/buttonClassName.ts frontend/src/components/ui/Card.tsx
git commit -m "feat(frontend): pill-shaped primary/secondary buttons, subtle-only card hover"
```

---

### Task 3: Shell + primitive components — visual verification pass

**Files:** none expected to change — this task verifies the cascade from Tasks 1-2 reached every remaining shared component and the app shell correctly. If verification finds a real problem, fix it in the specific file found and note the fix in the commit; do not preemptively edit files that verification doesn't flag.

**Interfaces:**
- Consumes: the complete token/component set from Tasks 1-2.
- Produces: nothing new — this is a checkpoint before the validation-pattern tasks begin.

`Badge.tsx`, `Alert.tsx`, `Modal.tsx`, and `Snackbar.tsx` were read during planning and confirmed to use only semantic tokens (`bg-muted`, `text-destructive`, `border-info/35`, etc.) with zero hardcoded colors or radius — they should inherit the new look with no code changes. This task is where that assumption gets checked against reality, in a real running app across both themes and mobile width, per `ui/DESIGN.md` §28-29's existing (unchanged) responsive requirements.

- [ ] **Step 1: Run the dev server and walk the shell**

Run: `cd frontend && pnpm dev`. Log in (register a test account if needed) and check, in both light and dark mode (theme toggle in the header) and at both desktop and mobile width (resize the browser or use devtools' device toolbar, ~375px wide):
- `PageFrame`'s sidebar (desktop) and mobile nav drawer (hamburger menu at mobile width) — spacing, active-state color, logout button.
- The header row: language switcher (🌐), theme toggle (🖥️), notification bell (🔔), onboarding guide (📘) — icon buttons should look consistent with the new radius/shadow direction (they're plain `outline`/`ghost` buttons, so this mostly validates Task 2's `outline`/`ghost` classes render correctly).
- `FinanceNav` (visit any `/families/:id/finance/*` page) — same nav-pill pattern as the sidebar.

- [ ] **Step 2: Check the primitive components in context**

Trigger each of these in the running app and check both themes:
- A `Badge` (e.g. a family role badge on `/families`, or a goal's "Paused"/"Active" badge on the Goals page).
- An `Alert` (e.g. submit an invalid login to see the error `Alert`, or open any finance page's empty state).
- A `Modal` (e.g. click "Delete" on a family, or "Add Entry" on a goal).
- A `Snackbar`/toast (e.g. successfully rename a family).

Confirm every one of these reads correctly against the new warm-neutral background and terracotta accent — no leftover cool-toned outline, no low-contrast text, no radius that looks inconsistent with the rest of the page.

- [ ] **Step 3: Fix anything found, or confirm nothing needed fixing**

If Step 1 or 2 surfaced a real problem (e.g. a hardcoded color somewhere not caught during planning), fix it in that specific file, re-run `pnpm typecheck && pnpm test`, and note the fix explicitly in this task's report/commit message. If nothing needed fixing, say so explicitly rather than silently skipping this step — this is the checkpoint that earns the assumption "the whole app cascades from tokens + two components."

- [ ] **Step 4: Commit (only if Step 3 found something to fix; otherwise skip — no empty commit)**

```bash
git add <whatever files Step 3 touched>
git commit -m "fix(frontend): <specific thing found during shell/primitive visual QA>"
```

---
### Task 4: Shared email validator + Login/Register per-field validation

**Files:**
- Create: `frontend/src/utils/validators.ts`
- Test: `frontend/src/utils/validators.test.ts`
- Modify: `frontend/src/auth/LoginForm.tsx`
- Modify: `frontend/src/auth/RegisterForm.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: `Field`'s `error?: string | null` prop (already exists, `frontend/src/components/ui/Field.tsx:8`).
- Produces: `isEmailLike(value: string): boolean`, exported from `frontend/src/utils/validators.ts` — Task 6 imports this same function for `CreateFamilyForm`/`AddMemberForm` instead of keeping a local copy.

- [ ] **Step 1: Add new i18n keys**

In `frontend/src/i18n/locales/vi/common.json`, inside the `"auth"` object (alongside `"passwordTooShort"`), add:

```json
    "emailRequired": "Vui lòng nhập email",
    "emailInvalid": "Email không hợp lệ",
    "passwordRequired": "Vui lòng nhập mật khẩu",
    "displayNameRequired": "Vui lòng nhập tên hiển thị"
```

In `frontend/src/i18n/locales/ja/common.json`, inside the `"auth"` object, add:

```json
    "emailRequired": "メールアドレスを入力してください",
    "emailInvalid": "メールアドレスの形式が正しくありません",
    "passwordRequired": "パスワードを入力してください",
    "displayNameRequired": "表示名を入力してください"
```

- [ ] **Step 2: Write the failing test for the shared validator**

Create `frontend/src/utils/validators.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { isEmailLike } from "./validators";

describe("isEmailLike", () => {
  it("accepts a well-formed email", () => {
    expect(isEmailLike("member@example.com")).toBe(true);
  });

  it("rejects a string with no @", () => {
    expect(isEmailLike("member.example.com")).toBe(false);
  });

  it("rejects a string with no domain suffix", () => {
    expect(isEmailLike("member@example")).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(isEmailLike("")).toBe(false);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && pnpm vitest run src/utils/validators.test.ts`
Expected: FAIL with "Failed to resolve import ./validators" (file doesn't exist yet).

- [ ] **Step 4: Create the validator**

Create `frontend/src/utils/validators.ts`:

```ts
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isEmailLike(value: string): boolean {
  return EMAIL_PATTERN.test(value);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && pnpm vitest run src/utils/validators.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Rewrite `LoginForm.tsx` with per-field validation**

Replace the full contents of `frontend/src/auth/LoginForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

interface LoginFieldErrors {
  email?: string;
  password?: string;
}

export function LoginForm() {
  const { t } = useTranslation();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const emailId = "login-email";
  const passwordId = "login-password";

  function validate(): LoginFieldErrors {
    const errors: LoginFieldErrors = {};
    if (!email.trim()) {
      errors.email = t("auth.emailRequired");
    }
    if (!password) {
      errors.password = t("auth.passwordRequired");
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      setFormError(translateApiError(t, err, "auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-login-form" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.login")}</legend>

        <Field label={t("auth.email")} htmlFor={emailId} required error={fieldErrors.email}>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
          />
        </Field>

        <Field label={t("auth.password")} htmlFor={passwordId} required error={fieldErrors.password}>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            aria-invalid={fieldErrors.password ? true : undefined}
          />
        </Field>
      </fieldset>

      <Button
        type="submit"
        className="w-full"
        loading={isSubmitting}
        loadingLabel={t("common.loading")}
      >
        {t("auth.loginButton")}
      </Button>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
```

Removing the native `required` attribute (replaced by `noValidate` on the `<form>` plus JS validation) avoids the browser's native tooltip racing with the new per-field `<p role="alert">` message — the two would otherwise both appear and disagree about which field is invalid first.

- [ ] **Step 7: Rewrite `RegisterForm.tsx` with per-field validation**

Replace the full contents of `frontend/src/auth/RegisterForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { useAuth } from "./useAuth";
import { translateApiError } from "../api/errorI18n";
import { isEmailLike } from "../utils/validators";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

const MIN_PASSWORD_LENGTH = 8;

interface RegisterFieldErrors {
  displayName?: string;
  email?: string;
  password?: string;
}

export function RegisterForm() {
  const { t } = useTranslation();
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fieldErrors, setFieldErrors] = useState<RegisterFieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const displayNameId = "register-display-name";
  const emailId = "register-email";
  const passwordId = "register-password";

  function validate(): RegisterFieldErrors {
    const errors: RegisterFieldErrors = {};
    if (!displayName.trim()) {
      errors.displayName = t("auth.displayNameRequired");
    }
    if (!email.trim()) {
      errors.email = t("auth.emailRequired");
    } else if (!isEmailLike(email.trim())) {
      errors.email = t("auth.emailInvalid");
    }
    if (!password) {
      errors.password = t("auth.passwordRequired");
    } else if (password.length < MIN_PASSWORD_LENGTH) {
      errors.password = t("auth.passwordTooShort");
    }
    return errors;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      await register(email, password, displayName);
      navigate("/");
    } catch (err) {
      setFormError(translateApiError(t, err, "auth.genericError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="enter-fade space-y-5" data-tour="auth-register-form" noValidate>
      <fieldset className="space-y-4">
        <legend className="sr-only">{t("auth.register")}</legend>

        <Field label={t("auth.displayName")} htmlFor={displayNameId} required error={fieldErrors.displayName}>
          <input
            id={displayNameId}
            type="text"
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setFieldErrors((current) => ({ ...current, displayName: undefined }));
            }}
            aria-invalid={fieldErrors.displayName ? true : undefined}
          />
        </Field>

        <Field label={t("auth.email")} htmlFor={emailId} required error={fieldErrors.email}>
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setFieldErrors((current) => ({ ...current, email: undefined }));
            }}
            aria-invalid={fieldErrors.email ? true : undefined}
          />
        </Field>

        <Field label={t("auth.password")} htmlFor={passwordId} required error={fieldErrors.password}>
          <input
            id={passwordId}
            type="password"
            value={password}
            onChange={(event) => {
              setPassword(event.target.value);
              setFieldErrors((current) => ({ ...current, password: undefined }));
            }}
            aria-invalid={fieldErrors.password ? true : undefined}
          />
        </Field>
      </fieldset>

      <Button
        type="submit"
        className="w-full"
        loading={isSubmitting}
        loadingLabel={t("common.loading")}
      >
        {t("auth.registerButton")}
      </Button>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 8: Update existing form tests if they assert on the removed top-level error text for validation cases**

Run: `cd frontend && pnpm vitest run src/auth`
Read the output. `LoginForm.test.tsx`/`RegisterForm.test.tsx` (if present) may have a case like "shows error when password is empty" that asserted an `Alert`-rendered message — that assertion must move to asserting the `Field`'s error paragraph (`screen.getByText(...)` still works since the text now renders in a `<p role="alert">` instead of the `Alert` div; only a `role="alert"` `getByRole` query that assumed exactly one match would need updating to disambiguate, e.g. by asserting on the specific field's error via `within`). Fix any such test to match the new DOM structure — do not delete the assertion, adapt it.

- [ ] **Step 9: Run the full test suite**

Run: `cd frontend && pnpm typecheck && pnpm test`
Expected: PASS, 100% green.

- [ ] **Step 10: Manual check**

Run: `cd frontend && pnpm dev`, open the login page, click submit with both fields empty — confirm two separate red messages appear directly under each field (not a single banner), and typing into a field clears only that field's message. Repeat on the register page for all three fields, including submitting a malformed email and a 3-character password to see `auth.emailInvalid`/`auth.passwordTooShort` render per-field.

- [ ] **Step 11: Commit**

```bash
git add frontend/src/utils/validators.ts frontend/src/utils/validators.test.ts frontend/src/auth/LoginForm.tsx frontend/src/auth/RegisterForm.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): per-field validation for login/register forms"
```

---

### Task 5: `ExpenseForm` per-field validation

**Files:**
- Modify: `frontend/src/expenses/ExpenseForm.tsx`

**Interfaces:**
- Consumes: `Field`'s `error` prop; reuses existing `expense.amountMustBePositive`/`expense.amountTooLarge` i18n keys (`frontend/src/i18n/locales/{vi,ja}/common.json`, already present) — no new keys needed for this task.
- Produces: nothing new — `ExpenseFormProps` is unchanged.

- [ ] **Step 1: Restructure the amount validation to a field-level error**

In `frontend/src/expenses/ExpenseForm.tsx`, replace the `error` state declaration (line 53) with two states:

```tsx
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
```

Replace the `displayError` line (line 67):

```tsx
  const displayError = formError || initialLoadError;
```

Replace `handleSubmit` (lines 69-104):

```tsx
  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const parsedAmount = Number(toDigits(amountInput));
    if (!Number.isInteger(parsedAmount) || parsedAmount < MIN_AMOUNT) {
      setAmountError(t("expense.amountMustBePositive"));
      return;
    }
    if (parsedAmount > MAX_INT_32) {
      setAmountError(t("expense.amountTooLarge"));
      return;
    }

    setAmountError(null);
    setFormError(null);
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
        setFormError(translateApiError(t, err, "expense.actionFailed"));
      },
    };

    if (expense) {
      updateExpenseMutation.mutate({ expenseId: expense.id, input }, mutationOptions);
    } else {
      createExpenseMutation.mutate(input, mutationOptions);
    }
  }
```

- [ ] **Step 2: Wire the amount field's error and clear-on-type**

Replace the amount `Field` block (lines 141-153):

```tsx
        <Field label={t("expense.amount")} htmlFor={amountId} required error={amountError}>
          <input
            id={amountId}
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(event) => {
              setAmountInput(formatDigitsAsAmount(event.target.value, activeCurrencyCode));
              setAmountError(null);
            }}
            placeholder="12,345"
            aria-invalid={amountError ? true : undefined}
          />
        </Field>
```

- [ ] **Step 3: Update the trailing error block to use `displayError`**

Replace lines 208-212:

```tsx
      {displayError ? (
        <Alert variant="error" role="alert">
          {displayError}
        </Alert>
      ) : null}
```

(This was already reading `displayError` — confirm it now resolves through the renamed `formError || initialLoadError` from Step 1 rather than the removed `error` state.)

- [ ] **Step 4: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/expenses`
Expected: PASS. If `ExpenseForm.test.tsx` has a case asserting the amount-invalid message renders inside the top `Alert`, update it to assert the message renders under the amount field instead (same text, different DOM location — see Task 4 Step 8's guidance).

- [ ] **Step 5: Manual check**

Run: `cd frontend && pnpm dev`, open any family's expense list, click "add expense", submit with the amount field emptied — confirm the "amount must be positive" message appears directly under the amount input, not as a banner at the bottom of the form.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/expenses/ExpenseForm.tsx
git commit -m "feat(frontend): per-field amount validation on expense form"
```

---

### Task 6: `CreateFamilyForm` + `AddMemberForm` per-field validation

**Files:**
- Modify: `frontend/src/families/CreateFamilyForm.tsx`
- Modify: `frontend/src/families/AddMemberForm.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: `isEmailLike` from `frontend/src/utils/validators.ts` (Task 4); `Field`'s `error` prop; every `family.*` i18n key already used by the current `CreateFamilyForm` (`nameRequired`, `savingsGoalRequiredForSolo`, `monthlyIncomeRequiredWhenEnabled`, `monthlyIncomeMustBeEmptyWhenDisabled`, `invalidMonthlyIncome`, `invalidSavingsGoal`, `invalidMemberEmail`, `memberAlreadyInDraft`) — all already exist, reused as field-level messages instead of top-banner messages.
- Produces: nothing new.

- [ ] **Step 1: Add one new i18n key for `AddMemberForm`**

In `frontend/src/i18n/locales/vi/common.json`, inside `"family"` (alongside `"invalidMemberEmail"`), add:

```json
    "memberEmailRequired": "Vui lòng nhập email thành viên",
```

In `frontend/src/i18n/locales/ja/common.json`, inside `"family"`, add:

```json
    "memberEmailRequired": "メンバーのメールアドレスを入力してください",
```

- [ ] **Step 2: Replace `CreateFamilyForm`'s local `isEmailLike` with the shared one**

In `frontend/src/families/CreateFamilyForm.tsx`, replace the import block (lines 1-8):

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { type CurrencyCode, type Family, type FamilyType } from "./familyApi";
import { useCreateFamily } from "./familyQueries";
import { isEmailLike } from "../utils/validators";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";
```

Delete the local `isEmailLike` function (lines 16-18 in the original — the one defined as `function isEmailLike(value: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value); }`).

- [ ] **Step 3: Restructure state into field errors + one non-field form error**

Replace the `error` state (line 56) and add a field-errors state right after it:

```tsx
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    memberEmail?: string;
    monthlyIncome?: string;
    savingsGoal?: string;
  }>({});
  const [formError, setFormError] = useState<string | null>(null);
```

- [ ] **Step 4: Rewrite `addMemberEmail` to set a field error**

Replace `addMemberEmail` (lines 66-83):

```tsx
  function addMemberEmail() {
    const normalized = normalizeEmail(memberEmailInput);
    if (!normalized) {
      return;
    }
    if (!isEmailLike(normalized)) {
      setFieldErrors((current) => ({ ...current, memberEmail: t("family.invalidMemberEmail") }));
      return;
    }
    if (memberEmails.includes(normalized)) {
      setFieldErrors((current) => ({ ...current, memberEmail: t("family.memberAlreadyInDraft") }));
      return;
    }

    setFieldErrors((current) => ({ ...current, memberEmail: undefined }));
    setMemberEmails((current) => [...current, normalized]);
    setMemberEmailInput("");
  }
```

- [ ] **Step 5: Rewrite `handleSubmit` to route each failure to its field**

Replace `handleSubmit` (lines 85-145):

```tsx
  function handleSubmit(event: FormEvent) {
    event.preventDefault();

    const trimmedName = name.trim();
    const errors: typeof fieldErrors = {};
    if (!trimmedName) {
      errors.name = t("family.nameRequired");
    }

    const parsedIncome = parseIntegerFromFormatted(monthlyIncome);
    const parsedSavingsGoal = parseIntegerFromFormatted(savingsGoalAmount);
    if (familyType === "solo" && parsedSavingsGoal === null) {
      errors.savingsGoal = t("family.savingsGoalRequiredForSolo");
    } else if (monthlyIncomeEnabled && parsedIncome === null) {
      errors.monthlyIncome = t("family.monthlyIncomeRequiredWhenEnabled");
    } else if (!monthlyIncomeEnabled && parsedIncome !== null) {
      errors.monthlyIncome = t("family.monthlyIncomeMustBeEmptyWhenDisabled");
    } else if (parsedIncome !== null && (parsedIncome < 1 || parsedIncome > MAX_INT_32)) {
      errors.monthlyIncome = t("family.invalidMonthlyIncome");
    } else if (parsedSavingsGoal !== null && (parsedSavingsGoal < 1 || parsedSavingsGoal > MAX_INT_32)) {
      errors.savingsGoal = t("family.invalidSavingsGoal");
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setFormError(null);
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
          setFieldErrors({});
        },
        onError: (err) => {
          setFormError(translateApiError(t, err, "family.actionFailed"));
        },
      },
    );
  }
```

- [ ] **Step 6: Wire `error` props and clear-on-type onto the four affected fields**

In the JSX, update the `name` `Field` (around line 152):

```tsx
          <Field label={t("family.name")} htmlFor={nameId} required className="md:col-span-2" error={fieldErrors.name}>
            <input
              id={nameId}
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }}
            />
          </Field>
```

Update the monthly-income `Field` (around line 209):

```tsx
            <Field
              label={t("family.monthlyIncomeWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor={incomeId}
              required
              error={fieldErrors.monthlyIncome}
            >
              <input
                id={incomeId}
                type="text"
                inputMode="numeric"
                value={monthlyIncome}
                onChange={(event) => {
                  setMonthlyIncome(formatNumberWithCommas(event.target.value, currencyCode));
                  setFieldErrors((current) => ({ ...current, monthlyIncome: undefined }));
                }}
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
              />
            </Field>
```

Update the savings-goal `Field` (around line 229):

```tsx
            <Field
              label={t("family.savingsGoalWithCurrency", { currency: currencyCode.toUpperCase() })}
              htmlFor={savingsGoalId}
              required
              error={fieldErrors.savingsGoal}
            >
              <input
                id={savingsGoalId}
                type="text"
                inputMode="numeric"
                value={savingsGoalAmount}
                onChange={(event) => {
                  setSavingsGoalAmount(formatNumberWithCommas(event.target.value, currencyCode));
                  setFieldErrors((current) => ({ ...current, savingsGoal: undefined }));
                }}
                placeholder={currencyCode === "vnd" ? "20.000.000" : "200,000"}
              />
            </Field>
```

Update the member-email `Field` (around line 252):

```tsx
          <Field label={t("family.memberEmail")} htmlFor={emailId} error={fieldErrors.memberEmail}>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id={emailId}
                type="email"
                value={memberEmailInput}
                onChange={(event) => {
                  setMemberEmailInput(event.target.value);
                  setFieldErrors((current) => ({ ...current, memberEmail: undefined }));
                }}
                placeholder="member@example.com"
              />
              <Button type="button" variant="secondary" onClick={addMemberEmail}>
                {t("family.addMember")}
              </Button>
            </div>
          </Field>
```

Update the trailing error block (around line 305):

```tsx
      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
```

Every `required` HTML attribute this form had is removed alongside the switch to JS-driven validation (consistent with Task 4); add `noValidate` to the `<form onSubmit={handleSubmit} className="space-y-5" data-tour="family-create-form">` tag.

- [ ] **Step 7: Rewrite `AddMemberForm.tsx` with pre-submit validation**

Replace the full contents of `frontend/src/families/AddMemberForm.tsx`:

```tsx
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { isEmailLike } from "../utils/validators";
import { type FamilyMemberInfo } from "./familyApi";
import { useAddMember } from "./familyQueries";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

export function AddMemberForm({
  familyId,
  onAdded,
}: {
  familyId: string;
  onAdded: (member: FamilyMemberInfo) => void;
}) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const addMemberMutation = useAddMember(familyId);
  const emailId = `member-email-${familyId}`;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(t("family.memberEmailRequired"));
      return;
    }
    if (!isEmailLike(trimmed)) {
      setEmailError(t("family.invalidMemberEmail"));
      return;
    }

    setEmailError(null);
    setFormError(null);
    addMemberMutation.mutate(trimmed, {
      onSuccess: (member) => {
        onAdded(member);
        setEmail("");
      },
      onError: (err) => {
        setFormError(translateApiError(t, err, "family.actionFailed"));
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4"
      noValidate
    >
      <Field label={t("family.memberEmail")} htmlFor={emailId} required error={emailError}>
        <input
          id={emailId}
          type="email"
          value={email}
          onChange={(event) => {
            setEmail(event.target.value);
            setEmailError(null);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={addMemberMutation.isPending} loadingLabel={t("common.loading")}>
          {t("family.addMember")}
        </Button>
      </div>
      {formError && (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      )}
    </form>
  );
}
```

- [ ] **Step 8: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/families`
Expected: PASS. Fix any test asserting the old single-`error` shape per Task 4 Step 8's guidance.

- [ ] **Step 9: Manual check**

Run: `cd frontend && pnpm dev`. On the create-family page: submit with an empty name; toggle on monthly income without entering a value; type an invalid member email and click "add member" — confirm each error lands under its own field. On a family's detail page, submit "add member" with an invalid email — confirm the field-level error, not a banner.

- [ ] **Step 10: Commit**

```bash
git add frontend/src/families/CreateFamilyForm.tsx frontend/src/families/AddMemberForm.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): per-field validation for family creation and member forms"
```

---

### Task 7: `ReceiptUploadForm` per-field validation

**Files:**
- Modify: `frontend/src/receipts/ReceiptUploadForm.tsx`

**Interfaces:**
- Consumes: `Field`'s `error` prop; existing `receipt.invalidFileType`/`receipt.fileTooLarge`/`receipt.uploadFailed` i18n keys (already present, `validateReceiptFile` in `receiptApi.ts` already returns the raw key suffix such as `"invalidFileType"` that gets interpolated as `` `receipt.${validationError}` ``).
- Produces: nothing new.

- [ ] **Step 1: Split file-selection errors (field-level) from upload errors (form-level)**

Replace the full contents of `frontend/src/receipts/ReceiptUploadForm.tsx`:

```tsx
import { useState, type ChangeEvent, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { translateApiError } from "../api/errorI18n";
import { validateReceiptFile, type Receipt } from "./receiptApi";
import { useUploadReceipt } from "./receiptQueries";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Alert } from "../components/ui/Alert";

interface ReceiptUploadFormProps {
  familyId: string;
  onUploaded: (receipt: Receipt) => void;
}

export function ReceiptUploadForm({ familyId, onUploaded }: ReceiptUploadFormProps) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const uploadReceiptMutation = useUploadReceipt(familyId);
  const fileId = `receipt-file-${familyId}`;

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    setFileError(null);
    if (file) {
      const validationError = validateReceiptFile(file);
      if (validationError) {
        setFileError(t(`receipt.${validationError}`));
        setSelectedFile(null);
        return;
      }
    }
    setSelectedFile(file);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!selectedFile) return;

    setFormError(null);
    uploadReceiptMutation.mutate(selectedFile, {
      onSuccess: (receipt) => {
        onUploaded(receipt);
        setSelectedFile(null);
      },
      onError: (err) => {
        setFormError(translateApiError(t, err, "receipt.uploadFailed"));
      },
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <section className="space-y-4 rounded-lg border border-border/80 bg-muted/25 p-4">
        <Field label={t("receipt.upload")} htmlFor={fileId} required error={fileError}>
          <input id={fileId} type="file" onChange={handleFileChange} />
        </Field>

        {selectedFile ? (
          <p className="type-body-sm break-all">
            {selectedFile.name}
          </p>
        ) : null}
      </section>

      <Button
        type="submit"
        className="w-full sm:w-auto"
        disabled={!selectedFile}
        loading={uploadReceiptMutation.isPending}
        loadingLabel={t("receipt.uploading")}
      >
        {t("receipt.upload")}
      </Button>

      {formError ? (
        <Alert variant="error" role="alert">
          {formError}
        </Alert>
      ) : null}
    </form>
  );
}
```

- [ ] **Step 2: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/receipts`
Expected: PASS. Fix any test asserting the old single-`error` shape per Task 4 Step 8's guidance.

- [ ] **Step 3: Manual check**

Run: `cd frontend && pnpm dev`, open a family's receipts page, pick an oversized or wrong-type file — confirm the message renders directly under the file input, not as a banner.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/receipts/ReceiptUploadForm.tsx
git commit -m "feat(frontend): per-field file validation for receipt upload"
```

---

### Task 8: `GoalsPage` per-field validation (create-goal form + add-entry modal form)

**Files:**
- Modify: `frontend/src/finance/GoalsPage.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: `Field`'s `error` prop; reuses `expense.amountMustBePositive` for the entry-amount field.
- Produces: nothing new. `useGoalsStore`'s `goalForm`/`entryForm`/`setGoalForm`/`setEntryForm`/etc. (UI-draft state) are untouched — only local component state for errors is added, mirroring how `formError` already works today.

- [ ] **Step 1: Add two new i18n keys**

In `frontend/src/i18n/locales/vi/common.json`, inside `"finance"` (alongside `"targetAmount"`), add:

```json
    "goalNameRequired": "Vui lòng nhập tên mục tiêu",
    "targetAmountInvalid": "Số tiền mục tiêu phải lớn hơn 0",
    "currentAmountInvalid": "Số tiền hiện tại không hợp lệ",
```

In `frontend/src/i18n/locales/ja/common.json`, inside `"finance"`, add:

```json
    "goalNameRequired": "目標名を入力してください",
    "targetAmountInvalid": "目標金額は1より大きい値を入力してください",
    "currentAmountInvalid": "現在の金額が無効です",
```

- [ ] **Step 2: Add field-error state alongside the existing `formError`**

In `frontend/src/finance/GoalsPage.tsx`, after the existing `const [formError, setFormError] = useState<string | null>(null);` (line 36), add:

```tsx
  const [goalFieldErrors, setGoalFieldErrors] = useState<{ name?: string; target?: string; current?: string }>({});
  const [entryFieldErrors, setEntryFieldErrors] = useState<{ amount?: string }>({});
```

- [ ] **Step 3: Rewrite `handleCreateGoal` to route failures to fields**

Replace `handleCreateGoal` (lines 66-100):

```tsx
  function handleCreateGoal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const targetAmount = Number(goalForm.goalTarget);
    const currentAmount = Number(goalForm.goalCurrent);
    const errors: typeof goalFieldErrors = {};
    if (!goalForm.goalName.trim()) {
      errors.name = t("finance.goalNameRequired");
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      errors.target = t("finance.targetAmountInvalid");
    }
    if (!Number.isFinite(currentAmount) || currentAmount < 0) {
      errors.current = t("finance.currentAmountInvalid");
    }

    setGoalFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
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
          setGoalFieldErrors({});
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
```

- [ ] **Step 4: Rewrite `handleCreateEntry` to route the amount failure to its field**

Replace `handleCreateEntry` (lines 142-172):

```tsx
  function handleCreateEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!entryGoal) return;

    const amount = Number(entryForm.entryAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setEntryFieldErrors({ amount: t("expense.amountMustBePositive") });
      return;
    }

    setEntryFieldErrors({});
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

- [ ] **Step 5: Wire the three create-goal fields**

Update the goal-name `Field` (around line 225):

```tsx
              <Field label={t("family.name")} htmlFor="finance-goal-name" required error={goalFieldErrors.name}>
                <input
                  id="finance-goal-name"
                  type="text"
                  value={goalForm.goalName}
                  onChange={(event) => {
                    setGoalForm({ goalName: event.target.value });
                    setGoalFieldErrors((current) => ({ ...current, name: undefined }));
                  }}
                />
              </Field>
```

Update the target/current amount `Field`s (around lines 236-255):

```tsx
                <Field label={t("finance.targetAmount")} htmlFor="finance-goal-target" required error={goalFieldErrors.target}>
                  <input
                    id="finance-goal-target"
                    type="number"
                    min={1}
                    value={goalForm.goalTarget}
                    onChange={(event) => {
                      setGoalForm({ goalTarget: event.target.value });
                      setGoalFieldErrors((current) => ({ ...current, target: undefined }));
                    }}
                  />
                </Field>
                <Field label={t("finance.currentAmount")} htmlFor="finance-goal-current" required error={goalFieldErrors.current}>
                  <input
                    id="finance-goal-current"
                    type="number"
                    min={0}
                    value={goalForm.goalCurrent}
                    onChange={(event) => {
                      setGoalForm({ goalCurrent: event.target.value });
                      setGoalFieldErrors((current) => ({ ...current, current: undefined }));
                    }}
                  />
                </Field>
```

- [ ] **Step 6: Wire the entry-modal amount field**

Update the entry-amount `Field` (around line 383):

```tsx
              <Field label={t("expense.amount")} htmlFor="finance-goal-entry-amount" required error={entryFieldErrors.amount}>
                <input
                  id="finance-goal-entry-amount"
                  type="number"
                  min={1}
                  value={entryForm.entryAmount}
                  onChange={(event) => {
                    setEntryForm({ entryAmount: event.target.value });
                    setEntryFieldErrors({});
                  }}
                />
              </Field>
```

Also clear `entryFieldErrors` in `closeEntryModal`'s call site — add a wrapper where the modal's `onClose` is passed (around line 362): change `onClose={closeEntryModal}` to `onClose={() => { closeEntryModal(); setEntryFieldErrors({}); }}` so a stale amount error doesn't linger the next time the modal opens for a different goal. Do the same for the footer's close button `onClick={closeEntryModal}` at line 364 → `onClick={() => { closeEntryModal(); setEntryFieldErrors({}); }}`.

- [ ] **Step 7: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/finance/GoalsPage`
Expected: PASS. Fix any test asserting the old single-`formError`-covers-everything shape per Task 4 Step 8's guidance.

- [ ] **Step 8: Manual check**

Run: `cd frontend && pnpm dev`, open a family's Goals page, submit the create-goal form empty — confirm three separate field errors. Open the "add entry" modal and submit with amount 0 — confirm the field-level error; close and reopen the modal for a different goal and confirm the error doesn't reappear stale.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/finance/GoalsPage.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): per-field validation on goals page forms"
```

---

### Task 9: `AccountsLedgerPage` per-field validation (create-account form + add-ledger-entry form)

**Files:**
- Modify: `frontend/src/finance/AccountsLedgerPage.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: `Field`'s `error` prop; reuses `expense.amountMustBePositive` for the ledger-amount field.
- Produces: nothing new.

- [ ] **Step 1: Add two new i18n keys**

In `frontend/src/i18n/locales/vi/common.json`, inside `"finance"` (alongside `"openingBalance"`), add:

```json
    "accountNameRequired": "Vui lòng nhập tên tài khoản",
    "openingBalanceInvalid": "Số dư đầu kỳ không hợp lệ",
```

In `frontend/src/i18n/locales/ja/common.json`, inside `"finance"`, add:

```json
    "accountNameRequired": "口座名を入力してください",
    "openingBalanceInvalid": "初期残高が無効です",
```

- [ ] **Step 2: Add field-error state**

After the existing `const [formError, setFormError] = useState<string | null>(null);` (line 50), add:

```tsx
  const [accountFieldErrors, setAccountFieldErrors] = useState<{ name?: string; openingBalance?: string }>({});
  const [ledgerFieldErrors, setLedgerFieldErrors] = useState<{ amount?: string }>({});
```

- [ ] **Step 3: Rewrite `handleCreateAccount`**

Replace `handleCreateAccount` (lines 85-120):

```tsx
  function handleCreateAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const opening = Number(accountForm.openingBalance);
    const errors: typeof accountFieldErrors = {};
    if (!accountForm.accountName.trim()) {
      errors.name = t("finance.accountNameRequired");
    }
    if (!Number.isFinite(opening)) {
      errors.openingBalance = t("finance.openingBalanceInvalid");
    }

    setAccountFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
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
          setAccountFieldErrors({});
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
```

- [ ] **Step 4: Rewrite `handleCreateLedger`**

Replace `handleCreateLedger` (lines 145-178):

```tsx
  function handleCreateLedger(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const amount = Number(ledgerForm.ledgerAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setLedgerFieldErrors({ amount: t("expense.amountMustBePositive") });
      return;
    }

    setLedgerFieldErrors({});
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

- [ ] **Step 5: Wire the account-name and opening-balance fields**

Update the two `Field`s (around lines 239-271):

```tsx
                <Field label={t("family.name")} htmlFor="finance-account-name" required error={accountFieldErrors.name}>
                  <input
                    id="finance-account-name"
                    type="text"
                    value={accountForm.accountName}
                    onChange={(event) => {
                      setAccountForm({ accountName: event.target.value });
                      setAccountFieldErrors((current) => ({ ...current, name: undefined }));
                    }}
                  />
                </Field>

                <Field label={t("finance.accountType")} htmlFor="finance-account-type" required>
                  <select
                    id="finance-account-type"
                    value={accountForm.accountType}
                    onChange={(event) => setAccountForm({ accountType: event.target.value as AccountType })}
                  >
                    {ACCOUNT_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {accountTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label={t("finance.openingBalance")} htmlFor="finance-account-opening" required error={accountFieldErrors.openingBalance}>
                  <input
                    id="finance-account-opening"
                    type="number"
                    value={accountForm.openingBalance}
                    onChange={(event) => {
                      setAccountForm({ openingBalance: event.target.value });
                      setAccountFieldErrors((current) => ({ ...current, openingBalance: undefined }));
                    }}
                  />
                </Field>
```

- [ ] **Step 6: Wire the ledger-amount field**

Update the ledger-amount `Field` (around line 342):

```tsx
                  <Field label={t("expense.amount")} htmlFor="finance-ledger-amount" required error={ledgerFieldErrors.amount}>
                    <input
                      id="finance-ledger-amount"
                      type="number"
                      min={1}
                      value={ledgerForm.ledgerAmount}
                      onChange={(event) => {
                        setLedgerForm({ ledgerAmount: event.target.value });
                        setLedgerFieldErrors({});
                      }}
                    />
                  </Field>
```

- [ ] **Step 7: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/finance/AccountsLedgerPage`
Expected: PASS. Fix any test asserting the old shape per Task 4 Step 8's guidance.

- [ ] **Step 8: Manual check**

Run: `cd frontend && pnpm dev`, open a family's Accounts & Ledger page, submit the create-account form with an empty name — confirm the field-level error; submit the add-ledger-entry form with amount 0 — confirm the field-level error.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/finance/AccountsLedgerPage.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): per-field validation on accounts and ledger forms"
```

---

### Task 10: `SubscriptionsPage` per-field validation

**Files:**
- Modify: `frontend/src/finance/SubscriptionsPage.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: `Field`'s `error` prop; reuses `expense.amountMustBePositive` for the amount field.
- Produces: nothing new.

- [ ] **Step 1: Add two new i18n keys**

In `frontend/src/i18n/locales/vi/common.json`, inside `"finance"` (alongside `"subscriptionName"`), add:

```json
    "subscriptionNameRequired": "Vui lòng nhập tên đăng ký",
    "merchantRequired": "Vui lòng nhập nhà cung cấp",
```

In `frontend/src/i18n/locales/ja/common.json`, inside `"finance"`, add:

```json
    "subscriptionNameRequired": "サブスクリプション名を入力してください",
    "merchantRequired": "サービス提供元を入力してください",
```

- [ ] **Step 2: Add field-error state**

After the existing `const [formError, setFormError] = useState<string | null>(null);` (line 35), add:

```tsx
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; merchant?: string; amount?: string }>({});
```

- [ ] **Step 3: Rewrite `handleCreate`**

Replace `handleCreate` (lines 78-114):

```tsx
  function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId) return;

    const parsedAmount = Number(form.amount);
    const errors: typeof fieldErrors = {};
    if (!form.name.trim()) {
      errors.name = t("finance.subscriptionNameRequired");
    }
    if (!form.merchant.trim()) {
      errors.merchant = t("finance.merchantRequired");
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      errors.amount = t("expense.amountMustBePositive");
    }

    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
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
          setFieldErrors({});
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
```

- [ ] **Step 4: Wire the three fields**

Update the name/merchant `Field`s (around lines 205-222):

```tsx
                <Field label={t("finance.subscriptionName")} htmlFor="finance-subscription-name" required error={fieldErrors.name}>
                  <input
                    id="finance-subscription-name"
                    type="text"
                    value={form.name}
                    onChange={(event) => {
                      setForm({ name: event.target.value });
                      setFieldErrors((current) => ({ ...current, name: undefined }));
                    }}
                  />
                </Field>
                <Field label={t("finance.merchant")} htmlFor="finance-subscription-merchant" required error={fieldErrors.merchant}>
                  <input
                    id="finance-subscription-merchant"
                    type="text"
                    value={form.merchant}
                    onChange={(event) => {
                      setForm({ merchant: event.target.value });
                      setFieldErrors((current) => ({ ...current, merchant: undefined }));
                    }}
                  />
                </Field>
```

Update the amount `Field` (around line 226):

```tsx
                <Field label={t("expense.amount")} htmlFor="finance-subscription-amount" required error={fieldErrors.amount}>
                  <input
                    id="finance-subscription-amount"
                    type="number"
                    min={1}
                    value={form.amount}
                    onChange={(event) => {
                      setForm({ amount: event.target.value });
                      setFieldErrors((current) => ({ ...current, amount: undefined }));
                    }}
                  />
                </Field>
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/finance/SubscriptionsPage`
Expected: PASS. Fix any test asserting the old shape per Task 4 Step 8's guidance.

- [ ] **Step 6: Manual check**

Run: `cd frontend && pnpm dev`, open a family's Subscriptions page, submit the create form empty — confirm three separate field errors.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/finance/SubscriptionsPage.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): per-field validation on subscriptions form"
```

---

### Task 11: `SplitExpensesPage` participants-required field-level validation

**Files:**
- Modify: `frontend/src/finance/SplitExpensesPage.tsx`
- Modify: `frontend/src/i18n/locales/vi/common.json`
- Modify: `frontend/src/i18n/locales/ja/common.json`

**Interfaces:**
- Consumes: none of `Field`'s API — the participants control is a `<fieldset>` of checkboxes, not a single labeled input, so it cannot use `Field`. This task adds a small inline error paragraph matching `Field`'s own error styling (`text-sm text-destructive`, `role="alert"`) directly under the `<fieldset>`.
- Produces: nothing new. The custom-amount/percentage-mismatch failures stay server-validated and surfaced through the existing top-level `Alert` (`formError`) — they depend on relationships across multiple participant rows, which is not a single-field concern the spec's per-field pattern covers (spec §4 scope is per-field, not per-row cross-field).

- [ ] **Step 1: Add one new i18n key**

In `frontend/src/i18n/locales/vi/common.json`, inside `"finance"` (alongside `"participants"`), add:

```json
    "splitParticipantsRequired": "Vui lòng chọn ít nhất một người tham gia",
```

In `frontend/src/i18n/locales/ja/common.json`, inside `"finance"`, add:

```json
    "splitParticipantsRequired": "参加者を1人以上選択してください",
```

- [ ] **Step 2: Add a participants-error state**

After the existing `const [formError, setFormError] = useState<string | null>(null);` (line 36), add:

```tsx
  const [participantsError, setParticipantsError] = useState<string | null>(null);
```

- [ ] **Step 3: Rewrite `handleSaveGroup` to distinguish the participants case from the generic preview-missing case**

Replace `handleSaveGroup` (lines 137-168):

```tsx
  function handleSaveGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!familyId || !groupPreview) {
      setFormError(t("expense.actionFailed"));
      return;
    }
    if (groupForm.participantIds.length === 0) {
      setParticipantsError(t("finance.splitParticipantsRequired"));
      return;
    }

    setParticipantsError(null);
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
        onError: (err) => {
          const message = translateApiError(t, err, "expense.actionFailed");
          setFormError(message);
          showSnackbar({ message, variant: "error" });
        },
      },
    );
  }
```

- [ ] **Step 4: Clear the participants error on toggle, and render it under the fieldset**

Find `toggleGroupParticipant` usage in the JSX (around line 326): wrap it so the error clears the moment the user checks a box:

```tsx
                          <input
                            type="checkbox"
                            checked={groupForm.participantIds.includes(member.user_id)}
                            onChange={() => {
                              toggleGroupParticipant(member.user_id);
                              setParticipantsError(null);
                            }}
                          />
```

Immediately after the closing `</fieldset>` (around line 352), add:

```tsx
                    {participantsError ? (
                      <p className="text-sm text-destructive" role="alert">
                        {participantsError}
                      </p>
                    ) : null}
```

- [ ] **Step 5: Run tests and typecheck**

Run: `cd frontend && pnpm typecheck && pnpm vitest run src/finance/SplitExpensesPage`
Expected: PASS. Fix any test asserting the old generic `expense.actionFailed` banner for the no-participants case per Task 4 Step 8's guidance — it now reads `finance.splitParticipantsRequired` under the fieldset instead.

- [ ] **Step 6: Manual check**

Run: `cd frontend && pnpm dev`, open a family's Split Expenses page, preview a month, deselect every participant, and submit — confirm the message renders directly under the participants list, not as a generic top banner.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/finance/SplitExpensesPage.tsx frontend/src/i18n/locales/vi/common.json frontend/src/i18n/locales/ja/common.json
git commit -m "feat(frontend): field-level validation for split-expense participants"
```

---

### Task 12: Final verification pass

**Files:** none expected to change — this task verifies Tasks 1-11 together. `frontend/src/finance/DataOpsPage.tsx` is included in this task's manual QA sweep (per the plan's Architecture note, it has no per-field-validatable form of its own — its actions are file-select/export/restore buttons, not a form with distinct required fields — so it gets restyled automatically by the Task 1-2 cascade with no dedicated task) but not modified.

**Interfaces:**
- Consumes: everything from Tasks 1-11.
- Produces: refreshed Playwright visual-regression snapshot baselines.

- [ ] **Step 1: Full automated suite**

Run: `cd frontend && pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all four pass, 100% green, zero skipped tests.

- [ ] **Step 2: Regenerate Playwright visual snapshots**

Per spec §6, every existing `toHaveScreenshot` baseline is now stale (colors/shapes changed everywhere). Run:

```bash
cd frontend && pnpm exec playwright install --with-deps chromium
pnpm test:ui:update-snapshots
```

Review the diff of the updated `.png` files under `frontend/tests/ui/**/*-snapshots/` by opening a handful in an image viewer (not by reading the binary) — confirm they show the new warm/terracotta look and not a blank or broken page. Then run the suite once more without `--update-snapshots` to confirm it's now green against the new baselines:

Run: `cd frontend && pnpm test:ui`
Expected: PASS.

- [ ] **Step 3: Full manual QA sweep**

Run: `cd frontend && pnpm dev`, with the backend running (`docker compose up -d postgres redis backend` from the repo root, per the working pattern established during Phase 1 verification). Log in and, in both light and dark mode:

- Submit every form touched in Tasks 4-11 (login, register, expense add/edit, create family, add member, receipt upload, goal create + add-entry, account create + ledger entry, subscription create, split-expense participants) completely empty or with one deliberately invalid field, and confirm every failure renders under its own field, not as a generic banner — except the intentionally-shared cases (split-expense custom/percentage mismatches, any server-side "not found"/permission errors) which still correctly show as a top banner.
- Confirm typing into a field with a visible error clears that field's error without needing to resubmit.
- Spot-check `DataOpsPage` (export/CSV-preview/restore) purely visually — buttons, cards, and badges should match the new look with no code changes needed.
- Resize to mobile width (~375px) on at least the login page, one finance page, and the family list, confirming no layout breakage was introduced by the radius/shadow/motion changes.

- [ ] **Step 4: Fix anything found**

If Step 3 surfaces a real defect, fix it in the specific file, re-run Step 1, and commit the fix with a message describing exactly what was found — do not silently patch without explanation, and do not expand scope beyond the specific defect found.

- [ ] **Step 5: Commit the snapshot update**

```bash
git add frontend/tests/ui frontend/src
git commit -m "test(frontend): refresh visual-regression snapshots after design-token rollout"
```

(If Step 4 produced its own separate commit, this commit contains only the snapshot files plus any final touch-ups not already committed.)

---

## Self-Review Notes

- **Spec coverage:** §2.1 (color) → Task 1. §2.2 (typography) → Task 1. §2.3 (shape/elevation) → Task 1 (radius/shadow tokens) + Task 2 (button/card radius, hover shadow). §2.4 (motion) → Task 1 (`.interactive-row`) + Task 2 (`buttonClassName`, `Card`). §2.5 (dark mode) → Task 1 Step 4 + verified throughout Tasks 3/12. §3 (component-level changes) → Tasks 2-3. §4 (validation pattern) → Tasks 4-11. §6 (testing/verification) → Task 12. §5 (page-by-page layout) and §7 (out of scope) are explicitly deferred per the user-approved scope split — not covered by this plan, and Task 12's Architecture note says so explicitly rather than silently.
- **Placeholder scan:** every task step contains literal file paths, literal line-number anchors taken from the current file contents, and complete code blocks with no "TBD"/"similar to Task N" shorthand — each form task repeats its own full function bodies rather than referencing a sibling task's code, since implementers work task-by-task in isolation.
- **Type consistency:** `Field`'s `error?: string | null` (`frontend/src/components/ui/Field.tsx:8`) accepts the `string | undefined` shapes produced by every task's `fieldErrors` objects (TypeScript's structural typing allows `undefined` where `string | null | undefined` — i.e., an optional prop — is expected). `buttonClassName`'s exported `ButtonVariant`/`ButtonSize`/`buttonClassName` names (Task 2) are unchanged from their current names, so no downstream call site (`Button.tsx` and its many consumers, untouched by this plan) needs updating. `isEmailLike(value: string): boolean` (Task 4) is used with the identical signature in Task 6's `CreateFamilyForm`/`AddMemberForm`.

