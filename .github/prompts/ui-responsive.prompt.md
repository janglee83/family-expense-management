
---
mode: agent
description: Audit and improve responsive behavior across the selected UI.
---
# Responsive UI

Act as a senior responsive design engineer.

Improve the responsive behavior of the selected page or component.

---

## Goal

The UI should feel intentionally designed at every viewport.

Do not simply make the desktop layout narrower.

---

## Viewports

Consider:

- 320px
- 375px
- 390px
- 480px
- 640px
- 768px
- 1024px
- 1280px
- 1440px
- wide desktop

---

## Inspect

Check:

- horizontal overflow
- content width
- grid behavior
- flex wrapping
- navigation
- forms
- tables
- buttons
- cards
- dialogs
- typography
- spacing
- images
- long text

---

## Mobile

Verify:

- navigation
- page header
- actions
- forms
- cards
- tables
- filters
- pagination

Important actions must remain accessible.

---

## Tailwind

Use responsive variants:

```text
sm:
md:
lg:
xl:
2xl:
```

Prefer mobile-first implementation.

---

## Layout

Use:

- grid
- flex
- min-w-0
- max-w
- overflow
- responsive columns

Avoid unnecessary fixed widths.

---

## Tables

If a table cannot reasonably collapse:

Use an appropriate responsive overflow strategy.

Do not allow the entire page to become horizontally scrollable accidentally.

---

## Typography

Check:

- heading size
- line length
- wrapping
- button text
- labels

Use responsive typography where appropriate.

---

## Spacing

Reduce spacing where necessary on mobile.

Do not make mobile layouts cramped.

---

## Touch Targets

Interactive elements should be comfortably tappable.

Avoid tiny buttons and links.

---

## Final Review

Fix:

- overflow
- broken layouts
- awkward wrapping
- inconsistent spacing
- inaccessible actions
- desktop-only assumptions

Do not change business logic.
