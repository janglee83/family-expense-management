
---
mode: agent
description: Perform a strict Playwright audit of the existing UI without modifying production code.
---
# Strict UI Baseline Audit

Act as a senior QA engineer, frontend engineer, accessibility engineer, responsive design engineer, and product designer.

Your task is to perform an extremely strict audit of the CURRENT UI.

This is a BASELINE AUDIT.

The purpose is to discover what is wrong with the existing UI before any redesign takes place.

# CRITICAL RULE

DO NOT MODIFY PRODUCTION UI CODE.

DO NOT redesign the UI.

DO NOT improve styling.

DO NOT modify Tailwind classes.

DO NOT modify HTML structure.

DO NOT modify CSS.

DO NOT modify components.

DO NOT modify business logic.

DO NOT modify application behavior.

DO NOT update screenshots or snapshots.

DO NOT weaken tests.

DO NOT hide failures.

Only inspect, test, analyze, and report.

---

# 1. Inspect the Repository

Before testing, inspect:

- package.json
- application structure
- routes
- pages
- layouts
- components
- Tailwind configuration
- existing CSS
- existing Playwright configuration
- existing Playwright tests
- UI documentation
- design tokens if available

Understand the application before testing it.

---

# 2. Start the Application

Use the existing project scripts.

Do not invent a new development workflow.

If the application cannot start:

- identify the reason
- report it
- do not modify unrelated code just to make the audit run

---

# 3. Discover User-Facing Pages

Identify all important user-facing routes.

Create a list such as:

- `/`
- `/dashboard`
- `/users`
- `/settings`
- `/login`

Use the actual routes discovered in the repository.

Do not assume routes.

---

# 4. Establish Baseline

For every important page:

- open the page
- verify rendering
- capture screenshots
- inspect layout
- inspect console errors
- inspect network errors when relevant
- inspect responsive behavior
- inspect accessibility
- inspect interaction behavior

The baseline must represent the CURRENT implementation.

---

# 5. Responsive Audit

Test at minimum:

- 320x800
- 375x812
- 390x844
- 768x1024
- 1024x768
- 1280x800
- 1440x900

For each important page check:

- horizontal overflow
- vertical overflow
- content clipping
- broken layout
- overlapping elements
- inaccessible actions
- text wrapping
- broken navigation
- broken forms
- broken tables
- broken dialogs
- broken cards
- fixed/sticky element problems

---

# 6. Horizontal Overflow

Explicitly test:

document.documentElement.scrollWidth

against:

document.documentElement.clientWidth

Unexpected page-level horizontal overflow is a failure.

If horizontal scrolling is intentional, determine whether it is isolated to the correct component.

Do not assume overflow is acceptable.

---

# 7. Visual Audit

Inspect:

## Layout

Check:

- alignment
- spacing
- hierarchy
- container widths
- grid/flex behavior
- visual rhythm
- whitespace

## Typography

Check:

- heading hierarchy
- font sizes
- line heights
- weight
- readability
- wrapping
- truncation

## Color

Check:

- contrast
- semantic meaning
- consistency
- muted text
- borders
- backgrounds
- interactive states

## Components

Check:

- buttons
- inputs
- cards
- tables
- navigation
- dialogs
- dropdowns
- badges
- alerts

---

# 8. Interaction Audit

Test important interactions.

Check:

- buttons
- links
- navigation
- dropdowns
- dialogs
- tabs
- forms
- search
- filters
- pagination
- expandable sections

Do not only verify that elements exist.

Verify meaningful behavior.

---

# 9. Keyboard Audit

Perform keyboard-only checks for important flows.

Check:

- Tab
- Shift+Tab
- Enter
- Space
- Escape
- Arrow keys where applicable

Verify:

- logical focus order
- visible focus
- no inaccessible controls
- no unexpected focus traps
- correct keyboard activation

---

# 10. Accessibility Audit

Check:

- semantic HTML
- accessible names
- labels
- button names
- link names
- heading hierarchy
- landmarks
- form errors
- keyboard access
- focus visibility

Use an accessibility scanner when available.

Do not modify the application to fix accessibility findings.

---

# 11. Component State Audit

Identify important states.

Examples:

- default
- hover
- focus
- active
- selected
- disabled
- loading
- error
- success
- empty

Check whether these states exist and whether they are visually and functionally coherent.

---

# 12. Form Audit

Check:

- labels
- required fields
- validation
- invalid input
- error messages
- disabled state
- loading state
- success state
- keyboard submission

---

# 13. UX Audit

Be critical.

Identify:

- unclear hierarchy
- weak CTA
- excessive whitespace
- cramped layout
- inconsistent spacing
- inconsistent components
- confusing navigation
- poor mobile experience
- weak empty states
- unclear errors
- insufficient feedback
- inaccessible interactions

Do not praise the UI unless there is clear evidence it deserves it.

---

# 14. Console and Runtime Errors

Record:

- console errors
- uncaught exceptions
- failed requests
- hydration problems
- rendering warnings

Separate actual application issues from test-environment issues.

---

# 15. Do Not Fix Anything

This is critical.

During this prompt:

DO NOT:

- edit UI files
- edit CSS
- edit Tailwind
- edit components
- edit HTML
- update snapshots
- weaken assertions
- skip tests

The output of this prompt is an AUDIT, not an implementation.

---

# 16. Produce a Strict Audit Report

At the end produce:

## Executive Summary

Overall assessment of the current UI.

## Critical Issues

Problems that significantly affect usability, accessibility, responsiveness, or visual quality.

## High Priority

Important problems that should be fixed before production.

## Medium Priority

Quality improvements that materially improve the experience.

## Low Priority

Polish and refinement.

## Responsive Issues

Table:

| Viewport | Page | Issue | Severity |
| -------- | ---- | ----- | -------- |

## Accessibility Issues

Table:

| Page | Element | Problem | Severity |
| ---- | ------- | ------- | -------- |

## Visual Issues

Table:

| Page | Area | Problem | Severity |
| ---- | ---- | ------- | -------- |

## Interaction Issues

Table:

| Page | Flow | Problem | Severity |
| ---- | ---- | ------- | -------- |

## Playwright Failures

List every failing test.

For each failure include:

- test
- page
- failure
- root cause hypothesis
- severity

## Recommended Fix Order

Provide an ordered implementation plan.

Do not implement the fixes.

---

# Final Requirement

The audit must be uncomfortable.

Do not optimize for making the existing implementation look good.

Find real problems.

The goal is to establish an objective baseline before redesign.
