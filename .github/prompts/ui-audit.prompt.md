
---
mode: agent
description: Audit the application's current UI and produce a redesign plan without modifying files.
---
# UI Audit

Act as a senior product designer, UX engineer, frontend engineer, and accessibility reviewer.

Analyze the current application before any redesign.

Do NOT modify files during this task.

---

## Step 1 — Inspect

Inspect:

- project structure
- HTML
- JSX/TSX if present
- CSS
- Tailwind setup
- existing components
- pages
- layouts
- navigation
- forms
- tables
- interactive elements

Understand the application before judging it.

---

## Step 2 — Understand the Product

Identify:

- primary user types if obvious
- major user workflows
- purpose of each important page
- primary actions
- secondary actions
- information hierarchy

---

## Step 3 — Visual Audit

Evaluate:

### Layout

- page width
- alignment
- whitespace
- grid
- flex layouts
- vertical rhythm
- content density

### Typography

- font hierarchy
- font sizes
- font weights
- line heights
- readability

### Color

- palette
- semantic meaning
- contrast
- consistency

### Components

- buttons
- forms
- cards
- tables
- navigation
- badges
- alerts
- dialogs

### States

- hover
- focus
- active
- disabled
- loading
- empty
- error
- success

### Responsive

Evaluate mobile, tablet, and desktop behavior.

### Accessibility

Check:

- semantic HTML
- keyboard navigation
- focus
- labels
- contrast
- heading hierarchy

---

## Step 4 — Identify Problems

Classify issues:

### Critical

Problems that significantly hurt usability or accessibility.

### High

Problems that significantly hurt visual quality or workflow.

### Medium

Consistency and polish issues.

### Low

Minor visual improvements.

---

## Step 5 — Design Direction

Choose one primary direction.

Possible directions:

- Modern minimal SaaS
- Linear-inspired
- Vercel-inspired
- Stripe-inspired
- GitHub-inspired
- shadcn/ui-inspired

Do not copy a specific product.

Explain why the chosen direction fits the application.

---

## Step 6 — Design System

Propose:

- color system
- typography
- spacing
- radius
- shadows
- surfaces
- buttons
- inputs
- cards
- tables
- navigation
- states
- responsive behavior
- dark mode strategy

---

## Step 7 — Redesign Plan

Create an ordered implementation plan.

Prioritize:

1. Global layout
2. Typography
3. Color/theme
4. Navigation
5. Primary components
6. Page-specific layouts
7. Responsive behavior
8. Accessibility
9. Polish

---

## Output

Return a detailed but actionable audit.

Do not modify files.
