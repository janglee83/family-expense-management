
---
mode: agent
description: Build a strict Playwright UI quality and visual regression test suite.
---
# Playwright UI Quality Gate

Act as a senior QA engineer, visual regression engineer, accessibility engineer, UX engineer, and frontend engineer.

Your task is to build a VERY STRICT Playwright test suite for the application's UI.

The objective is not simply to verify that pages render.

The objective is to verify that the UI is:

- visually polished
- responsive
- accessible
- interactive
- semantically correct
- free from unexpected overflow
- consistent
- production-ready

---

# 1. Inspect Before Writing Tests

Inspect:

- package.json
- existing Playwright configuration
- application routes
- pages
- layouts
- components
- Tailwind setup
- design tokens
- forms
- navigation
- tables
- dialogs
- interactive components
- loading states
- error states
- empty states

Understand the application before creating tests.

---

# 2. Install / Configure Playwright

If Playwright is not installed, configure it appropriately.

Prefer:

```text
@playwright/test
```

Do not introduce another E2E framework.

Create or improve:

```text
playwright.config.ts
```

Use deterministic configuration.

---

# 3. Test Architecture

Create a maintainable structure.

Recommended:

```text
tests/
└── ui/
    ├── visual/
    ├── responsive/
    ├── accessibility/
    ├── interaction/
    ├── states/
    └── fixtures/
```

Adapt the structure to the existing project when necessary.

Do not create meaningless folders.

---

# 4. Browser Coverage

Use Chromium at minimum.

If the project supports multiple browsers, consider:

- Chromium
- Firefox
- WebKit

Do not add browsers unnecessarily if the project's CI constraints do not support them.

---

# 5. Viewports

Create strict responsive coverage.

Minimum:

```text
320x800
375x812
390x844
768x1024
1024x768
1280x800
1440x900
```

Also test:

```text
1920x1080
```

when appropriate.

---

# 6. Visual Regression

Every important page should have a baseline screenshot.

Example:

```ts
await expect(page).toHaveScreenshot("dashboard.png", {
  fullPage: true,
});
```

Screenshots must detect:

- layout shifts
- spacing regressions
- typography regressions
- color regressions
- missing content
- unexpected content
- broken responsive layouts
- component changes
- accidental CSS regressions

---

# 7. Screenshot Strategy

Do not create screenshots only for the homepage.

Cover important:

- pages
- components
- states
- responsive layouts

Prioritize user-critical flows.

---

# 8. Responsive Visual Tests

For each important page:

```ts
for (const viewport of viewports) {
  ...
}
```

or use Playwright projects.

Prefer Playwright projects when they improve maintainability.

---

# 9. Horizontal Overflow

Every important page must verify unexpected horizontal overflow.

Example:

```ts
const dimensions = await page.evaluate(() => ({
  scrollWidth: document.documentElement.scrollWidth,
  clientWidth: document.documentElement.clientWidth,
}));

expect(dimensions.scrollWidth).toBeLessThanOrEqual(
  dimensions.clientWidth
);
```

If horizontal scrolling is intentional:

- identify the correct scroll container
- verify the page itself does not overflow
- verify the intended component can scroll

---

# 10. Layout Integrity

Check for:

- overlapping elements
- clipped content
- zero-sized visible elements
- elements outside expected containers
- broken alignment
- content hidden behind fixed navigation
- broken sticky elements

For critical UI, inspect bounding boxes.

---

# 11. Navigation

Test:

- navigation items
- active state
- correct destination
- keyboard navigation
- mobile navigation
- menu opening
- menu closing

Do not test only URLs.

Verify the visual active state.

---

# 12. Forms

Test complete form workflows.

Include:

### Valid

- fill
- submit
- success

### Invalid

- missing required values
- invalid values
- validation messages

### Loading

- loading indicator
- disabled submission where appropriate

### Keyboard

- Tab navigation
- Enter submission where appropriate

---

# 13. Buttons

For important buttons test:

- visible
- enabled
- hover
- focus
- keyboard activation
- expected behavior

For destructive actions also test:

- confirmation
- cancellation

when applicable.

---

# 14. Inputs

Verify:

- accessible label
- placeholder when appropriate
- focus
- typing
- validation
- error
- disabled
- readonly

Do not consider placeholder text a replacement for labels.

---

# 15. Dialogs

Test:

- opening
- accessible title
- focus
- keyboard
- Escape
- closing
- action behavior
- visual layout

---

# 16. Dropdowns

Test:

- opening
- visible options
- keyboard navigation
- selection
- closing
- focus restoration

---

# 17. Tabs

Test:

- active tab
- switching tabs
- keyboard navigation
- correct content
- visual active indicator

---

# 18. Tables

Test:

- header
- rows
- readable content
- responsive behavior
- intentional horizontal scrolling
- actions
- empty state

Do not allow the table to break the entire page.

---

# 19. Loading States

Test important loading scenarios.

Do not use arbitrary sleeps.

Bad:

```ts
await page.waitForTimeout(3000);
```

Good:

```ts
await expect(page.getByRole("status")).toBeVisible();
```

or an appropriate state-based assertion.

---

# 20. Empty States

Verify:

- title
- explanation
- action when appropriate
- layout integrity

---

# 21. Error States

Verify:

- visible error
- understandable message
- recovery action
- layout integrity

---

# 22. Keyboard-Only Testing

At least one complete critical workflow must be tested without mouse interaction.

Example:

```text
Open page
→ Tab
→ focus input
→ type
→ Tab
→ focus button
→ Enter
→ verify result
```

Test:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- Arrow keys where applicable

---

# 23. Accessibility

Integrate an accessibility scanner if appropriate.

Check:

- missing labels
- missing accessible names
- incorrect heading structure
- invalid landmarks
- keyboard issues
- focus issues
- obvious contrast problems

Accessibility failures should fail the test suite when they represent real violations.

---

# 24. Focus Visibility

Important interactive elements must visibly indicate focus.

Where practical, use screenshots or computed styles to ensure focus is visually represented.

Do not accept invisible focus.

---

# 25. Hover States

Test important interactive components with hover.

Examples:

- buttons
- navigation
- cards
- table rows
- links
- dropdown triggers

Do not create tests for every decorative element.

---

# 26. Visual State Matrix

For important components, test:

```text
default
hover
focus
active
selected
disabled
loading
error
success
```

Only include states that actually exist.

---

# 27. Dark Mode

If dark mode exists:

Create visual regression tests for:

- primary pages
- forms
- navigation
- cards
- tables
- dialogs
- interactive states

Check for:

- unreadable text
- incorrect contrast
- hardcoded light colors
- broken borders
- invisible controls

---

# 28. Mobile Navigation

On mobile, verify:

- navigation is usable
- menu can open
- menu can close
- page content remains accessible
- actions remain reachable
- no unexpected horizontal overflow

---

# 29. Touch Targets

Important controls should have reasonable touch targets.

If a control is clearly too small, fail the quality gate.

Use bounding-box inspection when useful.

---

# 30. Content Clipping

Detect obvious clipping.

Check:

- headings
- buttons
- labels
- table cells
- cards
- navigation items

Do not allow important content to be silently clipped.

---

# 31. Animation Stability

For visual screenshots:

- disable non-essential animations
- disable unnecessary transitions
- wait for stable UI state

Do not modify production animation behavior solely for testing.

---

# 32. Determinism

Tests must be deterministic.

Avoid dependence on:

- real production data
- current timestamps
- random values
- network timing
- external APIs

Mock or control unstable dependencies when appropriate.

---

# 33. Selectors

Prefer:

```ts
getByRole()
getByLabel()
getByPlaceholder()
getByText()
```

Avoid:

```ts
div:nth-child(4)
```

Avoid selecting based on Tailwind implementation details.

Tests should survive visual refactoring.

---

# 34. Test Independence

Tests must not depend on execution order.

Each test should establish its own required state.

---

# 35. Strict Failure Policy

NEVER fix failing tests by:

- increasing screenshot tolerance without investigation
- adding arbitrary sleeps
- skipping the test
- weakening assertions
- deleting assertions
- changing the expected screenshot without reviewing the UI

When a test fails:

1. inspect the failure
2. determine root cause
3. fix the UI or test
4. rerun
5. confirm

---

# 36. Quality Threshold

The UI should fail the quality gate if:

- unexpected horizontal overflow exists
- critical content is clipped
- important controls cannot be reached
- focus is invisible
- keyboard navigation fails
- accessibility violations exist
- mobile layout breaks
- visual regression is unexplained
- components overlap
- important states are broken
- navigation is inconsistent
- forms fail basic workflows

---

# 37. Test Reports

Configure useful Playwright output.

The test suite should make failures easy to investigate.

Use:

- screenshots
- traces where useful
- videos when useful
- HTML report

Do not generate unnecessary artifacts for every successful test.

---

# 38. Final Verification

After writing tests:

1. Run the entire Playwright suite.
2. Fix implementation problems discovered by the tests.
3. Rerun the suite.
4. Inspect screenshot differences.
5. Verify responsive layouts.
6. Verify keyboard workflows.
7. Verify accessibility.
8. Verify no unexpected overflow remains.

Do not declare success until the suite passes for the correct reasons.

---

# Final Objective

The test suite must prove:

> The UI is not merely functional.

It must prove:

> The UI is visually consistent, responsive, accessible, interactive, stable, and production-quality.
