
---
applyTo: "**/*.{spec,test}.{ts,tsx,js,jsx}"
---
# Playwright UI Testing Instructions

Act as a senior QA engineer, frontend engineer, accessibility engineer, and visual regression engineer.

The purpose of these tests is to enforce a HIGH UI quality bar.

Do not write superficial tests.

---

## Primary Goal

Playwright tests must verify:

- visual quality
- layout correctness
- responsive behavior
- accessibility
- interaction behavior
- component states
- content hierarchy
- keyboard usability
- overflow
- visual regression

The test suite should behave as a strict production UI quality gate.

---

## Testing Philosophy

Do NOT only test whether elements exist.

A test such as:

```ts
await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
```

is insufficient by itself.

Tests should verify behavior and quality.

---

# 1. Visual Regression

Use Playwright screenshots.

Example:

```ts
await expect(page).toHaveScreenshot("dashboard.png", {
  fullPage: true,
});
```

Visual tests should detect:

- layout changes
- spacing changes
- typography changes
- color changes
- missing elements
- unexpected elements
- broken responsive layouts
- overflow
- incorrect component states

Do not blindly update snapshots.

If a snapshot changes, determine whether the change is intentional.

---

# 2. Responsive Testing

Every important page should be tested at multiple viewport sizes.

Minimum:

- 320x800
- 375x812
- 390x844
- 768x1024
- 1024x768
- 1280x800
- 1440x900

When appropriate also test:

- 1920x1080

---

# 3. Horizontal Overflow

Pages must not unexpectedly overflow horizontally.

Test:

```ts
const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);

expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
```

Exceptions must be explicitly justified.

For intentional horizontally scrollable components such as tables, verify that only the intended container scrolls.

---

# 4. Vertical Layout

Detect obvious layout problems:

- elements outside viewport
- overlapping elements
- clipped content
- text escaping containers
- fixed elements covering content

---

# 5. Typography

Verify important text is:

- visible
- readable
- not clipped
- not unexpectedly truncated
- correctly aligned

Check important headings and actions.

---

# 6. Buttons

Every important button should be tested for:

- visibility
- enabled state
- disabled state
- hover
- focus
- keyboard activation
- expected action

Example:

```ts
await page.getByRole("button", { name: "Save" }).focus();

await expect(
  page.getByRole("button", { name: "Save" })
).toBeFocused();
```

---

# 7. Forms

Forms must test:

- labels
- required fields
- valid input
- invalid input
- error messages
- submission
- loading state
- success state
- keyboard navigation

Do not rely exclusively on visual checks.

---

# 8. Keyboard Accessibility

Important flows must work without a mouse.

Test:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- Arrow keys where appropriate

Focus must never disappear unexpectedly.

---

# 9. Focus Visibility

Every interactive element must have a visible focus state.

Do not accept:

```css
outline: none;
```

unless an equivalent accessible focus treatment exists.

---

# 10. Dialogs

Dialogs must test:

- opening
- closing
- Escape
- focus behavior
- accessible name
- action buttons
- backdrop interaction when supported

---

# 11. Dropdowns

Test:

- opening
- keyboard navigation
- selection
- closing
- focus restoration

---

# 12. Navigation

Test:

- active navigation state
- navigation correctness
- keyboard access
- mobile navigation
- current page indication

---

# 13. Loading States

Test important loading states.

Verify:

- loading indicator exists when expected
- content does not visually collapse unexpectedly
- buttons cannot be accidentally double-submitted
- loading state eventually resolves

---

# 14. Empty States

Verify that empty states contain:

- clear title
- useful explanation
- appropriate next action when applicable

Reject meaningless empty states such as:

```text
No data.
```

when more useful context is possible.

---

# 15. Error States

Verify:

- error visibility
- readable error message
- recovery action when applicable
- error does not destroy layout

---

# 16. Accessibility

Use accessibility testing where appropriate.

Verify:

- semantic landmarks
- accessible names
- labels
- heading hierarchy
- keyboard navigation
- focus visibility
- sufficient contrast where tooling supports it

If an accessibility scanner is available, integrate it.

---

# 17. Interactive States

Important components should be checked in:

- default
- hover
- focus
- active
- selected
- disabled
- loading
- error
- success

Use screenshots when state differences are visual.

---

# 18. Component Boundaries

Tests should target behavior and accessible semantics.

Prefer:

```ts
page.getByRole(...)
page.getByLabel(...)
page.getByText(...)
```

Avoid brittle selectors such as:

```ts
.page > div:nth-child(3)
```

Avoid selectors based purely on Tailwind classes.

---

# 19. Layout Assertions

Where appropriate, inspect bounding boxes.

Example:

```ts
const box = await element.boundingBox();

expect(box).not.toBeNull();
expect(box!.width).toBeGreaterThan(0);
expect(box!.height).toBeGreaterThan(0);
```

For critical layouts, verify relationships between elements.

---

# 20. Screenshot Strictness

Visual regression should use strict thresholds.

Do not configure large tolerance values simply to make tests pass.

If visual differences are small but systematic, investigate the root cause.

Do not hide real regressions with excessive:

```text
maxDiffPixelRatio
```

or similar tolerances.

---

# 21. Animations

Disable non-essential animations during screenshot tests to reduce nondeterminism.

Use a controlled test environment.

Do not permanently disable animations in production.

---

# 22. Test Isolation

Each test must be deterministic.

Avoid relying on:

- previous test state
- random data
- current time
- external services
- network timing

unless explicitly controlled.

---

# 23. Test Data

Use stable test data.

Do not make visual snapshots depend on changing production data.

---

# 24. Failure Philosophy

A failing UI test is valuable information.

Do not:

- weaken assertions
- increase screenshot tolerance
- skip tests
- add arbitrary waits
- use `waitForTimeout()` to hide timing problems

unless there is a documented reason.

Prefer deterministic waiting.

---

# 25. No Arbitrary Sleeps

Avoid:

```ts
await page.waitForTimeout(3000);
```

Prefer:

```ts
await expect(element).toBeVisible();
```

or another state-based assertion.

---

# 26. Test Quality Gate

The UI should fail the quality gate when:

- horizontal overflow is unexpected
- important content is clipped
- interactive controls cannot be reached
- focus is invisible
- required labels are missing
- mobile layout breaks
- important actions disappear
- components overlap
- visual regression is unexplained
- accessibility regressions appear
- loading/error states break layout

---

# 27. Final Principle

Do not write tests that merely prove:

"The page renders."

Write tests that prove:

"The page is usable, accessible, responsive, visually consistent, and production-quality."


# UI Quality Gate Workflow

The UI quality process has two strictly separated phases.

## Phase A — Audit Existing UI

During Phase A:

- inspect the existing UI
- run Playwright tests
- collect failures
- collect screenshots
- inspect visual regressions
- inspect responsive behavior
- inspect accessibility
- inspect interaction behavior
- identify UX problems

DO NOT modify production UI code.

DO NOT redesign components.

DO NOT modify Tailwind classes.

DO NOT modify HTML structure.

DO NOT modify CSS.

DO NOT modify business logic.

DO NOT modify application behavior.

DO NOT update snapshots.

DO NOT weaken tests.

The purpose of Phase A is to establish an objective baseline of the existing UI.

---

## Phase B — Fix UI

Phase B may modify the UI based on the findings from Phase A.

Production UI may be changed to fix genuine problems.

Tests must remain strict.

Never modify a test merely because the UI fails it.

Never reduce the quality threshold to make the implementation pass.

---

## Phase C — Verification

After UI changes:

1. run the affected tests
2. run responsive tests
3. run accessibility tests
4. run visual regression tests
5. run the complete Playwright suite
6. inspect failures
7. fix genuine problems
8. repeat until stable

A test passing is not sufficient evidence of quality.

The implementation must also satisfy the UI quality requirements.
