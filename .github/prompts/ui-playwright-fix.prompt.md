
---
mode: agent
description: Fix UI issues discovered by strict Playwright tests without weakening the quality gate.
---
# Playwright UI Fix & Quality Gate

Act as a senior frontend engineer, UI/UX engineer, accessibility engineer, responsive design engineer, and Playwright test engineer.

Your task is to analyze the latest Playwright failures and fix the underlying UI problems.

The objective is NOT to make the tests green by weakening the tests.

The objective is to make the actual UI production-quality.

## 1. Read Existing Rules

Before making changes, read:

- .github/copilot-instructions.md
- .github/instructions/playwright.instructions.md
- .github/instructions/ui.instructions.md
- .github/instructions/css.instructions.md
- ui/DESIGN.md
- ui/COMPONENTS.md
- ui/REFERENCES.md

Also inspect:

- playwright.config.*
- existing Playwright tests
- relevant application components
- Tailwind configuration
- package.json

Do not assume the project's architecture.

## 2. Inspect Test Results

Run the relevant Playwright tests if necessary.

Inspect:

- assertion failures
- screenshots
- visual diffs
- traces
- console errors
- network failures
- accessibility failures
- responsive failures
- timeout failures

Do not immediately modify the tests.

First determine the root cause.

## 3. Classify Every Failure

Classify every failure as one or more of:

- VISUAL
- RESPONSIVE
- ACCESSIBILITY
- INTERACTION
- TYPOGRAPHY
- LAYOUT
- COMPONENT
- STATE
- NAVIGATION
- FORM
- PERFORMANCE
- TEST INFRASTRUCTURE
- TEST IMPLEMENTATION

Clearly distinguish:

REAL UI BUG

from:

TEST BUG

from:

TEST ENVIRONMENT / INFRASTRUCTURE PROBLEM

## 4. Fix the Root Cause

If the failure is caused by the UI:

Fix the UI.

If the failure is caused by the test:

Fix the test.

If the failure is caused by infrastructure:

Fix the infrastructure.

Never change a correct test merely because the UI cannot pass it.

## 5. Tailwind CSS

When fixing visual problems, use Tailwind CSS properly.

Prefer Tailwind utilities for:

- layout
- spacing
- typography
- colors
- borders
- radius
- shadows
- responsive behavior
- states
- transitions
- accessibility states

Use responsive variants appropriately:

- sm:
- md:
- lg:
- xl:
- 2xl:

Use modern Tailwind techniques where appropriate:

- flex
- grid
- gap
- max-w
- min-w
- w-full
- h-full
- aspect
- overflow
- truncate
- line-clamp
- sticky
- fixed
- absolute
- relative
- group
- peer
- data-*
- aria-*
- dark:
- motion-*

Do not add random utility classes simply to satisfy a screenshot.

The styling must remain coherent with the project's design system.

## 6. Responsive Fixes

When fixing responsive failures, inspect the complete layout.

Test at minimum:

- 320x800
- 375x812
- 390x844
- 768x1024
- 1024x768
- 1280x800
- 1440x900

Check:

- horizontal overflow
- vertical overflow
- content clipping
- broken flex layouts
- broken grid layouts
- buttons escaping containers
- text wrapping
- navigation
- dialogs
- tables
- forms
- cards
- fixed elements
- sticky elements

Do not solve mobile problems by simply hiding important content.

## 7. Horizontal Overflow

Unexpected horizontal overflow is a real UI defect.

Investigate the actual source.

Typical causes include:

- fixed widths
- excessive padding
- long text
- flex children without min-w-0
- grid columns
- absolute positioning
- large images
- tables
- whitespace-nowrap
- viewport units
- transforms

Fix the actual cause.

Do not blindly add:

overflow-x-hidden

unless the overflow is intentionally part of the design.

## 8. Visual Regression

When a screenshot fails:

Do NOT immediately update the snapshot.

First determine:

1. What changed?
2. Why did it change?
3. Is the change intentional?
4. Does it improve or degrade the UI?
5. Does it affect other viewports?

If the UI is wrong:

Fix the UI.

If the new UI is intentionally correct:

Update the snapshot only after verification.

## 9. Accessibility

Treat accessibility failures seriously.

Check:

- accessible names
- labels
- roles
- semantic HTML
- keyboard navigation
- focus visibility
- focus order
- dialogs
- forms
- buttons
- links
- heading hierarchy
- landmarks

Do not solve accessibility failures by hiding elements from assistive technology.

Use semantic HTML whenever possible.

## 10. Keyboard Interaction

Verify important flows without a mouse.

Test where appropriate:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- Arrow keys

Focus must:

- move logically
- remain visible
- not disappear
- not become trapped incorrectly
- return appropriately after dialogs or menus close

## 11. Interaction Failures

For interaction failures, verify the complete state transition.

Examples:

button
→ click
→ loading
→ success

dropdown
→ open
→ select
→ selected state

dialog
→ open
→ focus
→ action
→ close

Do not only make the final assertion pass.

Verify important intermediate behavior.

## 12. Forms

Check:

- labels
- input state
- validation
- error messages
- submit state
- loading
- success
- failure
- keyboard interaction

Do not remove validation merely because a test fails.

## 13. Component Consistency

When fixing a component, check whether the same component is used elsewhere.

Do not create one-off styling if a reusable pattern already exists.

If the same UI pattern appears multiple times, consider extracting or updating the shared component.

Preserve the existing architecture unless there is a strong reason to refactor it.

## 14. Do Not Break Business Logic

Do NOT modify unrelated:

- API behavior
- authentication
- routing
- data fetching
- state management
- business rules
- database behavior

unless the Playwright failure directly proves that one of these is broken.

UI fixes should remain UI-focused whenever possible.

## 15. Never Cheat the Test

NEVER fix failures by:

- skipping tests
- using test.skip()
- using test.fixme()
- removing assertions
- weakening assertions
- increasing screenshot tolerance without justification
- updating snapshots blindly
- adding arbitrary sleeps
- adding waitForTimeout()
- hiding broken elements
- disabling accessibility checks
- disabling responsive tests

## 16. No Arbitrary Waiting

Never use:

await page.waitForTimeout(...)

to make a flaky test pass.

Prefer state-based synchronization:

await expect(element).toBeVisible();

await expect(element).toHaveText(...);

await page.waitForLoadState(...);

or another appropriate Playwright assertion.

## 17. Fix One Failure at a Time

Use this loop:

FAILURE
→ ROOT CAUSE
→ FIX
→ TARGETED TEST
→ PASS?

If NO:
→ investigate again

If YES:
→ next failure

After fixing related failures, run the complete UI suite.

## 18. Regression Protection

A fix must not solve one viewport while breaking another.

After responsive changes, test:

- mobile
- tablet
- desktop

After component changes, test all important usages.

After typography changes, inspect:

- headings
- buttons
- cards
- forms
- navigation
- tables

## 19. Strict Visual Quality

When visually reviewing the result, reject:

- excessive whitespace
- cramped spacing
- inconsistent alignment
- inconsistent radius
- inconsistent shadows
- poor hierarchy
- weak contrast
- awkward wrapping
- tiny touch targets
- visually noisy UI
- inconsistent component states
- broken mobile layouts
- accidental clipping

The UI should look intentional and polished.

## 20. Final Verification

After all fixes:

Run the complete Playwright UI suite.

Verify:

- all functional tests pass
- visual tests pass
- responsive tests pass
- accessibility tests pass
- keyboard tests pass
- no unexpected horizontal overflow exists
- no important content is clipped
- no unexplained screenshot differences remain

Then perform one final inspection of the implementation.

## 21. Final Report

At the end, report:

### Fixed

List each significant UI issue that was fixed.

### Test Results

Report:

Functional: PASS/FAIL
Visual: PASS/FAIL
Responsive: PASS/FAIL
Accessibility: PASS/FAIL
Keyboard: PASS/FAIL
Overflow: PASS/FAIL

### Remaining Issues

List anything that could not be fixed and explain why.

### Files Changed

List the files modified.

### Snapshot Changes

If snapshots were updated, explicitly explain:

- which snapshots changed
- why they changed
- why the new screenshots are correct

# Final Rule

A green Playwright suite is NOT the goal by itself.

The goal is:

A genuinely high-quality production UI that passes a strict and meaningful Playwright quality gate.

Never sacrifice UI quality to make the test pass.

Never sacrifice test integrity to make the UI appear correct.
