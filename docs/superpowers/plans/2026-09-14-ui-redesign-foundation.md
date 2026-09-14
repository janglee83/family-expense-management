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
<!-- PLAN_APPEND_MARKER -->
