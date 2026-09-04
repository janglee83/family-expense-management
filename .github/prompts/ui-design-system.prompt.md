
---
mode: agent
description: Create or improve the application's Tailwind CSS design system.
---
# UI Design System

Act as a senior design systems engineer.

Create a lightweight, coherent design system for the application.

---

## Before Editing

Inspect:

- existing styles
- Tailwind setup
- existing components
- repeated patterns
- colors
- typography
- spacing
- responsive behavior

Reuse existing good patterns where possible.

---

## Technology

Use:

- Tailwind CSS v4
- CSS custom properties where useful
- semantic HTML

Do not introduce another UI framework.

---

## Theme

Create semantic tokens for:

- background
- foreground
- card
- card-foreground
- muted
- muted-foreground
- border
- primary
- primary-foreground
- secondary
- secondary-foreground
- destructive
- destructive-foreground
- success
- success-foreground
- warning
- warning-foreground
- info
- info-foreground

Support dark mode if appropriate.

---

## Typography

Define a consistent hierarchy for:

- display
- h1
- h2
- h3
- body
- small
- label
- caption

---

## Spacing

Use Tailwind's spacing scale.

Avoid unnecessary arbitrary values.

---

## Radius

Define a consistent radius hierarchy.

---

## Shadows

Use subtle elevation.

Do not make every component shadowed.

---

## Components

Identify reusable patterns:

- Button
- Input
- Select
- Checkbox
- Radio
- Textarea
- Card
- Badge
- Alert
- Table
- Tabs
- Navigation
- Modal
- Empty State
- Loading State
- Error State

Only create patterns that are actually needed.

---

## Tailwind v4

Prefer CSS-first configuration.

Typical entry point:

```css
@import "tailwindcss";
```

Use appropriate theme definitions.

---

## Constraints

Do not:

- break functionality
- rewrite business logic
- change APIs
- introduce unnecessary dependencies
- over-engineer

---

## Final Review

Check:

- token consistency
- color consistency
- typography consistency
- component consistency
- responsive behavior
- dark mode
- accessibility

Remove duplicated or unnecessary styles.
