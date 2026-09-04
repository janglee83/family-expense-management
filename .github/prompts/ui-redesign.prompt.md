
---
mode: agent
description: Redesign a page or application using Tailwind CSS and the project's design system.
---

# Mandatory Precondition

Before modifying the UI:

1. Read the latest UI audit.
2. Read all Playwright failures.
3. Read:
   - ui/DESIGN.md
   - ui/COMPONENTS.md
   - ui/REFERENCES.md
   - .github/instructions/playwright.instructions.md
4. Understand the existing architecture.

Do not start redesigning blindly.

Every major redesign decision should address one or more identified problems.

---

# Strict Implementation Rule

You are allowed to modify production UI code.

You are NOT allowed to weaken Playwright tests.

You are NOT allowed to reduce accessibility requirements.

You are NOT allowed to hide responsive problems.

You are NOT allowed to remove functionality simply because it is difficult to style.

Preserve:

- business logic
- API behavior
- routing
- authentication
- state management
- data flow
- existing functionality

Use Tailwind CSS extensively.

Prefer clean, composable, maintainable Tailwind utilities over arbitrary CSS.

Do not create excessive one-off styles.

---

# Implementation Loop

For each major UI area:

1. inspect current implementation
2. identify relevant audit findings
3. redesign
4. run relevant Playwright tests
5. inspect failures
6. fix the implementation
7. rerun
8. verify other viewports
9. continue

Do not wait until the end to discover responsive regressions.

---

# Visual Quality Standard

The redesigned UI should feel like a polished modern production product.

Evaluate:

- hierarchy
- spacing
- typography
- color
- surfaces
- borders
- radius
- shadows
- interaction states
- responsive behavior
- accessibility
- consistency

Avoid:

- excessive gradients
- excessive shadows
- excessive rounded cards
- random animations
- decorative elements without purpose
- inconsistent spacing
- arbitrary colors
- arbitrary breakpoints

The design must feel intentional rather than generated.


# UI Redesign

Act as a senior product designer and frontend engineer.

Redesign the selected page or application using Tailwind CSS.

The goal is to create a polished, modern, production-quality interface.

---

## Phase 1 — Understand

Inspect:

- HTML
- JSX/TSX if present
- CSS
- Tailwind configuration
- JavaScript behavior
- components
- routes
- API usage
- forms
- existing interactions

Understand the implementation before modifying it.

---

## Phase 2 — Preserve Functionality

Do not change:

- business logic
- API contracts
- authentication
- routing
- data flow
- validation
- event handlers

unless explicitly requested.

---

## Phase 3 — Design

Determine:

- page purpose
- primary user goal
- primary action
- secondary actions
- content hierarchy
- visual hierarchy
- responsive strategy

---

## Visual Target

The result should feel:

- modern
- premium
- minimal
- professional
- cohesive
- highly usable

Use inspiration from:

- Linear
- Vercel
- Stripe
- GitHub
- shadcn/ui
- modern SaaS templates

Do not copy proprietary designs.

---

## Tailwind

Use Tailwind extensively.

Use:

- flex
- grid
- gap
- space
- max-width
- min-width
- typography
- borders
- rounded
- shadows
- gradients
- opacity
- backdrop blur
- transitions
- transforms
- animations
- responsive variants
- dark mode
- group
- peer
- data attributes

Use arbitrary values only when they improve the design.

---

## HTML Structure

You may restructure HTML when necessary.

Improve:

- semantic structure
- hierarchy
- layout
- accessibility

Do not restructure application logic unnecessarily.

---

## Page Header

When appropriate:

- clear title
- supporting description
- primary action
- contextual metadata

Do not add unnecessary hero sections.

---

## Surfaces

Create meaningful levels:

- background
- surface
- elevated surface
- interactive surface

Use borders and subtle shadows.

---

## Typography

Create clear hierarchy.

Use:

- text sizes
- font weights
- line heights
- muted colors
- tracking

intentionally.

---

## Interaction

Implement:

- hover
- focus-visible
- active
- selected
- disabled
- loading
- error
- success

where relevant.

Use subtle transitions.

---

## Responsive

Implement mobile-first.

Check:

- 320px
- 375px
- 768px
- 1024px
- 1280px
- wide screens

Do not merely shrink desktop.

Reconsider layout.

---

## Accessibility

Verify:

- semantic HTML
- keyboard navigation
- focus-visible
- labels
- contrast
- heading hierarchy
- accessible names
- reduced motion

---

## Final Visual QA

After implementation, inspect your own work.

Check:

### Alignment

Are elements aligned?

### Spacing

Is spacing consistent?

### Typography

Is hierarchy clear?

### Color

Are colors semantic and restrained?

### Components

Do equivalent components look equivalent?

### Responsive

Does mobile feel intentionally designed?

### Accessibility

Can the page be used with keyboard?

### Polish

Does anything still look like a basic HTML page?

If yes, fix it.

Do not stop after the first implementation.
