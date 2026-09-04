
---
mode: agent
description: Perform a strict visual and UX quality review and fix high-impact UI problems.
---
# UI Quality Review

Act as a strict senior product designer reviewing a production application.

Do not assume that the current implementation is good simply because it works.

---

## Review Categories

### 1. Layout

Check:

- alignment
- proportions
- page width
- whitespace
- vertical rhythm
- grid
- flex
- content density

### 2. Typography

Check:

- hierarchy
- font size
- font weight
- line height
- readability
- muted text

### 3. Color

Check:

- semantic colors
- contrast
- accent usage
- surface hierarchy
- dark mode

### 4. Components

Review:

- buttons
- inputs
- selects
- cards
- tables
- badges
- alerts
- navigation
- dialogs
- tabs

Equivalent components should look equivalent.

### 5. Interaction

Check:

- hover
- focus-visible
- active
- selected
- disabled
- loading

### 6. UX States

Check:

- empty
- loading
- error
- success
- confirmation

### 7. Responsive

Check:

- mobile
- tablet
- desktop
- wide screens

Look for:

- overflow
- cramped content
- excessive whitespace
- broken grids
- inaccessible actions

### 8. Accessibility

Check:

- semantic HTML
- keyboard navigation
- focus
- labels
- contrast
- heading hierarchy
- accessible names
- reduced motion

---

## Visual Problems

Look specifically for:

- random spacing
- arbitrary colors
- inconsistent radii
- inconsistent shadows
- excessive gradients
- excessive rounded elements
- excessive borders
- weak hierarchy
- oversized headings
- tiny text
- unclear actions
- excessive decoration
- default-browser-looking controls
- unfinished states

---

## Fix

Fix obvious high-impact issues.

Do not merely report them.

You are authorized to modify UI implementation.

Do not:

- change business logic
- change APIs
- change authentication
- break routing
- introduce unnecessary dependencies

---

## Final Pass

After fixes, review again.

The UI should feel:

- cohesive
- polished
- intentional
- modern
- production-ready

It should not look like basic HTML with Tailwind classes randomly added.
