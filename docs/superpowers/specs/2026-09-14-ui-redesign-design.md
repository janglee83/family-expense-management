# UI Redesign — Design (Phase 2)

## 1. Purpose

Phase 2 of the frontend modernization initiative (phase 1 — migrating all data-fetching to TanStack Query — already shipped on `main`). This phase redesigns the application's visual language and reconsiders every page's layout and form-validation UX: replacing the current "Minimal SaaS / blue-indigo" look with a warm, neutral-based design anchored by a single Terracotta accent color, and replacing the current "one `<Alert>` for every form error" pattern with consistent inline, per-field validation across the whole app.

The visual direction below was settled through an interactive visual-brainstorming session (mockups compared live in a browser, including hover-tested motion) rather than described in prose alone — the values here are the outcome of that session, not a starting proposal.

## 2. Design language

### 2.1 Color

- **Base stays neutral** (white/stone in light mode, warm dark stone in dark mode) — the accent does **not** tint backgrounds broadly. This was a deliberate correction mid-session: an earlier cream/orange-everywhere direction read as dated ("quê"); the approved direction keeps every surface neutral and uses color only where it earns attention.
- **Accent: Terracotta orange**, used sparingly — primary buttons, key numeric emphasis (e.g. the dashboard's headline spend figure), active/selected nav states, status dots, links.
- Semantic colors (destructive/success/warning/info) keep their current hues — only `primary` moves to the warm family.

Token changes in `frontend/src/styles.css`'s `@theme` block and both dark blocks (`:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ... } }` — these two blocks are currently kept in sync as duplicates and must stay that way per the file's existing convention):

| Token | Current (light) | New (light) | Current (dark) | New (dark) |
|---|---|---|---|---|
| `--color-primary` | `oklch(0.55 0.15 250)` | `oklch(0.62 0.19 42)` | `oklch(0.69 0.13 248)` | `oklch(0.72 0.17 45)` |
| `--color-primary-foreground` | `oklch(0.98 0.005 255)` | `oklch(0.99 0.005 60)` | `oklch(0.23 0.03 262)` | `oklch(0.18 0.03 40)` |

**Correction from the initial draft of this spec, made after re-checking the actual approved mockup's colors:** `background`/`foreground`/`card`/`muted`/`border` do **not** stay on the current cool hue (~255-262, blue-slate) — the approved final mockup (`final-check.html`, option 4) used warm-neutral **stone** tones (`#fafaf9`/`#f5f5f4`/`#78716c`/`#1c1917`/`#e7e5e4` — Tailwind's stone palette), not cool slate. So these five tokens move to the same warm hue family as `primary` (~50-60°, distinct from primary's ~42-45° so the accent still reads as a separate color), at **lower chroma** than the current cool tokens (warm neutrals need less chroma to read as "neutral" rather than "tan/brown") — roughly half the current chroma value at each token, hue changed to ~50-60, lightness unchanged. This applies in **both** the light block and both dark blocks, keeping each token's existing lightness magnitude so the contrast relationships that already work don't need to be re-derived from scratch.

`--color-secondary`/`--color-secondary-foreground` (used for the "secondary" button variant **and** `PageFrame`'s active sidebar-nav-item background) move to a *soft terracotta tint* — low-chroma but clearly on the `primary` hue (~42°), not the neutral stone hue — rather than staying a generic gray. This is what makes "active/selected nav states" (§2.1's own accent-usage list) actually carry a hint of the accent color instead of looking identical to a neutral hover state.

Exact final OKLCH numbers for all of the above are tuned during implementation (verify WCAG AA for text-on-background, text-on-primary, and text-on-secondary at each step); the table and description above are the starting point, not pixel-locked.

### 2.2 Typography

Add Quicksand (Google Fonts, weights 500/600/700) as the **first** font in `--font-sans`'s stack:

```css
--font-sans: "Quicksand", "Be Vietnam Pro", "Noto Sans JP", "Hiragino Sans", "Segoe UI", sans-serif;
```

Browsers fall back per-character automatically: Quicksand (Latin-only) renders Latin letters/numbers; Vietnamese diacritics and Japanese characters — which Quicksand doesn't cover — fall through to "Be Vietnam Pro"/"Noto Sans JP" untouched. Every heading, button label, and KPI number gets the friendlier rounded look with zero per-locale override beyond what `:root[lang="vi"]`/`:root[lang="ja"]` already do.

`--font-mono` ("IBM Plex Mono") stays unchanged — it's used for tabular numeric alignment in lists/ledgers, a functional choice unrelated to this aesthetic direction.

### 2.3 Shape & elevation

- Default card/surface radius moves from `--radius-lg` (1rem) to `--radius-xl` (1.25rem) for `.surface-card`/`.surface-elevated` and the `Card` component.
- Primary/secondary buttons move to fully-rounded (`rounded-full`) pill shape. `outline`/`ghost`/`destructive` variants keep their current radius unless they visibly clash once primary changes (implementer's call, verify visually).
- Default resting elevation for `.surface-card` moves from `shadow-sm` to `shadow-md`; `shadow-lg` stays reserved for modals/popovers only — no change to `ui/DESIGN.md` §14's existing "prefer borders before heavy shadows" principle, just which shadow variable counts as "default."
- Shadow color switches from the hardcoded cool `rgb(15 23 42 / …)` to `color-mix(in oklab, var(--color-foreground) …%, transparent)`, so shadows tint warm automatically once `--color-foreground` moves to the warm-neutral family — no separate warm/cool shadow token needed.

### 2.4 Motion

Three live, hoverable options were tested directly in-browser (subtle color transition / lift-with-shadow / playful bounce-and-scale) — **subtle** was chosen over both alternatives. Concretely:

- Remove `.interactive-row`'s `hover:-translate-y-0.5` transform; keep only the existing `hover:border-primary/35 hover:bg-card hover:shadow-sm` color/shadow transition.
- Keep `enter-fade`/`enter-rise` entrance animations as-is — already subtle, used sparingly.
- No new animation library. Plain CSS transitions (the codebase's current approach) are sufficient for "subtle" — do not introduce Framer Motion or similar.
- `prefers-reduced-motion` handling already in `styles.css` needs no change.

### 2.5 Dark mode

Confirmed required (existing `ThemeToggle`/`data-theme` mechanism is unchanged) — approved via a live light/dark side-by-side mockup in the same session. Dark values use warm-neutral stone tones (not the current cool blue-gray) per §2.1's token table, keeping the app's warm identity consistent across both themes.

## 3. Component-level changes (`frontend/src/components/ui/*`)

Every page already composes from this shared library — updating it here is what makes the redesign cascade automatically instead of requiring a page-by-page visual rewrite:

- `Button.tsx` / `buttonClassName.ts` — pill shape for primary/secondary, updated hover per §2.4's subtle-motion rule.
- `Card.tsx` — new default radius/shadow per §2.3.
- `Field.tsx` — **no structural change** — it already accepts `error`/`description` props rendered per-field (`error ? <p role="alert">{error}</p> : null` directly under the input). The change is in how forms *use* it — see §4.
- `Modal.tsx`, `Badge.tsx`, `Alert.tsx`, `Snackbar.tsx` — visual token pass; most inherit the new look automatically via tokens, but verify each renders correctly against the new primary hue (contrast, any hardcoded color reference).
- `Page.tsx` (`PageFrame`, `PageHeader`, `AuthFrame`, `EmptyState`, `LoadingState`) — the app shell every page sits inside; gets the layout-level pass in §5.1.

## 4. Form validation pattern (applies to every form in scope)

**Current state:** every form in the app (`ExpenseForm`, `CreateFamilyForm`, `AddMemberForm`, `LoginForm`, `RegisterForm`, `ReceiptUploadForm`, and every finance page's inline create/edit forms) funnels all validation failures — client-side ("amount must be positive") and server-side ("email already registered") alike — into one component-level `error: string | null`, rendered as a single `<Alert variant="error">` at the top or bottom of the form.

**New pattern:**

- Each form tracks per-field error state (e.g. a `Record<fieldName, string>` or one `useState` per field) instead of one flat `error` string.
- Field-level validation failures render via `Field`'s existing `error` prop, directly under the offending input — no `<Alert>` for these.
- Only failures that genuinely aren't attributable to one field (network error, unexpected server error, "family not found") keep a single form-level `<Alert>` — a smaller set of cases than today.
- A server-side business error that *does* map to one field (e.g. `AUTH_EMAIL_ALREADY_REGISTERED` → the email field) routes to that field's inline error instead of the top-level `Alert`.
- Submit stays blocked while any field has an error, consistent with `ui/COMPONENTS.md`'s existing "Component Quality" bar (default/hover/focus/disabled/responsive/accessible all working).
- This is a per-form code change to each form's local validation-state shape — not a new shared component, since `Field` already supports it.

## 5. Page-by-page scope

Every page gets a layout/UX pass on top of the token+component cascade (§2-3), which alone already changes every page's color/shape/motion automatically. This section covers layout-level changes beyond that automatic cascade — no page in this app is "visual-only" for this phase.

### 5.1 Shell (`PageFrame`, `FinanceNav`) — foundation, touches every authenticated page

Sidebar/header structure stays (not a navigation-model change) but gets the same visual pass as everything else: pill nav-item active state, spacing updated to the new radius scale, notification/theme/language icon buttons restyled to match.

### 5.2 Dashboard (`HomePage.tsx`)

Reconsider KPI card grouping and the Overview/Analysis/Transactions tab layout for clarity. Exact layout decided visually during implementation (mockup in the visual companion before coding, the same process used for §2's decisions).

### 5.3 Expenses (`ExpenseList.tsx`, `ExpenseForm.tsx`)

Reconsider the create/edit form's field grouping and the list row's information density; apply §4's inline-validation pattern to amount/payer/category fields.

### 5.4 Finance pages — one shared new template (`GoalsPage`, `AccountsLedgerPage`, `SubscriptionsPage`, `SplitExpensesPage`, `DataOpsPage`)

These five already share an identical structural pattern (form beside/above a list) — confirmed during phase 1's migration. Design **one** new shared layout template for this pattern and apply it to all five, rather than designing five pages independently; this is both cheaper and keeps them visually consistent with each other, which `ui/DESIGN.md` §4.4 already requires. Apply §4's inline validation to every field across all five (goal target/current amount, account opening balance, ledger amount, subscription amount, split-group participant amounts/percentages).

### 5.5 Families (`FamilyList.tsx`, `FamilyDetail.tsx`, `CreateFamilyForm.tsx`, `AddMemberForm.tsx`)

Layout pass + inline validation (family name, member email format, monthly income/savings goal amount fields).

### 5.6 Receipts (`ReceiptList.tsx`, `ReceiptUploadForm.tsx`)

Layout pass; upload form gets inline validation for file-type/size errors (currently a single `error` state — same field-error treatment as §4).

### 5.7 Auth (`LoginForm.tsx`, `RegisterForm.tsx`, `AuthFrame`)

Layout pass; inline validation per §4 — email format, password length (`RegisterForm`'s existing `MIN_PASSWORD_LENGTH` client check moves from a top `<Alert>` to the password field), and server errors like "invalid credentials"/"email already registered" routed to the relevant field where possible.

### 5.8 Onboarding (`OnboardingGuide.tsx`)

Visual pass only (tour copy/steps unchanged) — reviewed once the shell (§5.1) is done, since the guide highlights shell elements.

## 6. Testing & verification

- Existing Vitest component tests assert behavior (data, interactions), not visual appearance — mostly unaffected, **except** any test asserting on a removed top-level `<Alert>` for a validation case that §4 moves to a field-level error; that assertion updates alongside its form's change.
- `frontend/playwright.config.ts` already has visual-regression screenshots configured (`toHaveScreenshot`, `maxDiffPixels: 50`) — every existing baseline needs regenerating after this phase via `pnpm test:ui:update-snapshots`, and the new screenshots must be reviewed manually once before committing (verify "this is the correct new design," not just "this differs from the old baseline").
- No automated way to verify "looks good." Final acceptance is manual, page by page, in a running dev server (`pnpm dev`), in both light and dark mode, at mobile width — per `ui/DESIGN.md` §28-29's existing responsive requirements, which are unchanged and still binding.

## 7. Out of scope

- Routing/navigation structure (which pages exist, what URL they're at) — unchanged.
- i18n copy/wording, beyond what §4's validation rewiring requires (reuse existing translation keys; new keys only where a currently-shared error message must split per-field).
- New charting library or chart-type changes beyond what §5.2's dashboard layout pass decides during implementation.
- Backend/API — zero changes, frontend-only phase, same as phase 1.
