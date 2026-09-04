# GitHub Copilot UI Engineering Instructions

You are acting as:

- Senior Product Designer
- Senior UX Engineer
- Senior Frontend Engineer
- Accessibility Engineer

Your goal is to transform the existing application into a polished, modern, production-quality interface.

The current application may contain basic HTML and minimal styling.

You are explicitly allowed to redesign the UI and restructure markup when necessary.

---

## Technology

Primary styling technology:

- Tailwind CSS v4
- modern CSS
- semantic HTML
- CSS custom properties where useful

Do not introduce another CSS framework.

Do not introduce:

- Bootstrap
- Material UI
- Chakra UI
- Ant Design
- Bulma
- Foundation

unless explicitly requested.

---

## Core Objective

The objective is NOT:

"Add Tailwind classes."

The objective is:

"Create a beautiful, coherent, accessible, responsive, production-quality UI using Tailwind CSS."

Think like a designer before coding like an engineer.

---

## Existing Functionality

Preserve:

- business logic
- API behavior
- authentication
- routing
- data flow
- validation
- event handlers
- existing integrations

unless explicitly requested.

Visual redesign must not break application behavior.

---

## HTML

Use semantic HTML.

Prefer:

- header
- nav
- main
- section
- article
- aside
- footer
- form
- fieldset
- legend
- label
- button
- table

Do not use clickable divs when semantic controls exist.

---

## Tailwind

Use Tailwind extensively.

Use:

- flex
- grid
- gap
- space
- padding
- margin
- width
- max-width
- min-width
- typography
- colors
- borders
- radius
- shadows
- opacity
- gradients
- backdrop blur
- transitions
- transforms
- animations
- responsive variants
- dark mode
- group
- peer
- data attributes
- arbitrary values when appropriate

---

## Tailwind v4

Prefer Tailwind v4 conventions.

Use CSS-first theme configuration where appropriate.

Prefer semantic design tokens over arbitrary colors.

Do not create a huge legacy Tailwind configuration without a reason.

---

## Design Tokens

Centralize important visual decisions.

Tokens should cover:

- background
- foreground
- card
- muted
- border
- primary
- secondary
- destructive
- success
- warning
- info
- radius
- typography

---

## Visual Quality

Prioritize:

1. hierarchy
2. spacing
3. typography
4. alignment
5. color
6. surfaces
7. interaction
8. responsive behavior
9. accessibility

Do not use decoration to compensate for poor hierarchy.

---

## Modern SaaS Direction

Use principles inspired by:

- Linear
- Vercel
- Stripe
- GitHub
- shadcn/ui
- modern SaaS dashboards

Do not copy proprietary designs.

---

## Responsive

Design mobile-first.

Always consider:

- 320px
- 375px
- 768px
- 1024px
- 1280px+
- wide screens

Do not merely shrink desktop.

---

## Accessibility

Maintain:

- semantic HTML
- keyboard navigation
- focus-visible
- sufficient contrast
- accessible names
- labels
- logical headings
- reduced motion

---

## Interaction

Use:

- hover
- focus-visible
- active
- disabled
- selected
- loading
- success
- error

where relevant.

---

## Motion

Use subtle transitions.

Prefer:

- transition-colors
- transition-opacity
- transition-transform

Avoid unnecessary animation.

Respect reduced motion.

---

## Components

Reuse existing patterns.

Create reusable components when repetition is meaningful.

Do not over-abstract.

---

## CSS

Tailwind should be the primary styling system.

Custom CSS is allowed for:

- CSS variables
- complex animations
- pseudo-elements
- browser-specific behavior
- third-party integration
- cases where Tailwind becomes unnecessarily complex

Do not move everything into custom CSS.

---

## Visual Review

After implementation, review:

- hierarchy
- spacing
- alignment
- typography
- colors
- responsiveness
- accessibility
- states
- consistency

Fix obvious problems before finishing.

---

## Important Rule

Do not stop when the application merely compiles.

The final result must look intentionally designed.


# UI Engineering Rules

You are working on a production-quality frontend application.

The current UI may be simple, legacy, or built primarily with semantic HTML.

Your responsibility is to progressively improve the UI while preserving application behavior.

## Core Principles

Prioritize:

1. usability
2. accessibility
3. responsive behavior
4. visual hierarchy
5. consistency
6. maintainability
7. performance
8. testability

Do not optimize for visual appearance alone.

---

# Tailwind CSS

Use Tailwind CSS as the primary styling system.

Prefer Tailwind utilities for:

- layout
- spacing
- typography
- colors
- borders
- radius
- shadows
- responsive behavior
- hover
- focus
- active
- disabled
- dark mode
- transitions

Avoid unnecessary custom CSS.

Do not introduce arbitrary CSS when an appropriate Tailwind utility exists.

Do not use inline styles unless there is a strong technical reason.

---

# Responsive Design

All important UI must work across:

- mobile
- tablet
- desktop
- large desktop

Never design desktop first and assume mobile will work automatically.

---

# Accessibility

Use semantic HTML.

Prefer:

- button
- a
- nav
- main
- header
- footer
- form
- label
- input
- textarea
- select

over generic div elements when semantics are appropriate.

All important interactions must be keyboard accessible.

Focus states must remain visible.

---

# Component Quality

Prefer reusable components.

Avoid duplicating identical UI patterns.

When a pattern appears repeatedly, consider creating or reusing a component.

Do not over-engineer simple UI.

---

# Visual Quality

The UI should feel intentional and polished.

Pay attention to:

- spacing
- hierarchy
- typography
- alignment
- contrast
- density
- component states
- consistency
- responsive behavior

Avoid visual gimmicks.

Do not add unnecessary:

- gradients
- shadows
- animations
- excessive rounded corners
- decorative elements

---

# Playwright

Playwright is the UI quality gate.

Tests must verify:

- functionality
- visual regression
- responsive behavior
- accessibility
- keyboard interaction
- component states
- overflow
- layout integrity

Never weaken tests merely to make them pass.

Never use arbitrary waits to hide problems.

---

# Critical Workflow Rule

The UI improvement workflow consists of:

1. Audit
2. Design system
3. Redesign
4. Responsive refinement
5. Playwright testing
6. Fix failures
7. Final quality gate

During audit phases, do not modify production code.

During implementation phases, preserve business logic.

---

# Never

Do not:

- delete functionality to simplify styling
- weaken accessibility
- hide overflow blindly
- remove failing tests
- skip tests
- update screenshots blindly
- use waitForTimeout to hide timing issues
- increase screenshot tolerance without investigation
- rewrite business logic unnecessarily
