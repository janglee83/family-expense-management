
---
applyTo: "**/*.{html,jsx,tsx,js,ts,vue,svelte}"
---
# UI Engineering Instructions

Act as a senior UI engineer and product designer.

---

## Before Editing

Understand:

1. Page purpose
2. User goal
3. Primary action
4. Existing functionality
5. Existing visual patterns
6. Existing components
7. Existing design tokens

---

## Visual Hierarchy

Every page should have a clear hierarchy:

1. Context
2. Page title
3. Supporting information
4. Primary action
5. Main content
6. Supporting content

Not every page requires every item.

---

## Spacing

Prefer consistent Tailwind spacing.

Common values:

```text
gap-2
gap-3
gap-4
gap-6
gap-8
gap-12
```

Avoid arbitrary spacing unless required.

---

## Containers

Use consistent content widths.

Typical:

```html
<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
```

Adjust when content requires a different width.

---

## Components

Reuse existing components.

If a visual pattern appears repeatedly, consider extraction.

Do not create one-off abstractions unnecessarily.

---

## Interaction

Interactive elements should have:

```text
hover:
focus-visible:
active:
disabled:
```

when applicable.

---

## Focus

Never remove focus without replacing it with an accessible focus-visible state.

---

## Responsive

Design mobile-first.

Do not treat responsive design as an afterthought.

---

## Dark Mode

If dark mode is supported:

- use semantic colors
- avoid hardcoded light colors
- ensure readable contrast
- maintain surface hierarchy

---

## Class Organization

For long Tailwind classes, organize conceptually as:

1. layout
2. spacing
3. typography
4. surface
5. border
6. effects
7. interaction
8. responsive

---

## UX

Do not redesign purely for aesthetics.

Every change should improve at least one of:

- clarity
- usability
- hierarchy
- accessibility
- consistency
- responsiveness

---

## Final Check

Before finishing:

- Does the page look intentional?
- Is the primary action obvious?
- Is spacing consistent?
- Does mobile work?
- Are states handled?
- Is keyboard navigation preserved?
- Did functionality remain unchanged?
