# UI Design System

## 1. Purpose

This document defines the visual language and UX principles for the application.

The goal is to transform a basic HTML interface into a polished, modern, production-quality product UI.

The UI should feel:

- modern
- professional
- clean
- intentional
- trustworthy
- consistent
- responsive
- accessible

The application should not feel like a collection of independently styled HTML pages.

Every page and component should feel like part of the same product.

---

## 2. Design Direction

The primary visual direction is:

**Modern Minimal SaaS / Product UI**

The visual language should combine:

- strong typography
- restrained colors
- generous whitespace
- subtle borders
- subtle elevation
- clear hierarchy
- consistent spacing
- purposeful interaction states

The interface should feel premium without becoming visually excessive.

---

## 3. Design Inspiration

The design may take inspiration from principles commonly found in:

- Linear
- Vercel
- Stripe
- GitHub
- shadcn/ui
- modern SaaS dashboards

These references are inspiration only.

Do not copy:

- logos
- branding
- proprietary assets
- exact layouts
- exact component implementations
- proprietary illustrations

Adapt the underlying design principles to this product.

---

## 4. Design Principles

### 4.1 Clarity First

Every screen should communicate:

1. Where the user is
2. What the page is for
3. What information matters
4. What action the user should take

Do not prioritize decoration over clarity.

### 4.2 Visual Hierarchy

Not every element should have equal visual importance.

Use:

- typography
- size
- weight
- spacing
- color
- surface elevation

to communicate importance.

Primary actions should be visually stronger than secondary actions.

Supporting information should visually recede.

### 4.3 Whitespace

Whitespace is an intentional design element.

Prefer consistent spacing over dense layouts.

Avoid:

- cramped forms
- crowded cards
- tightly packed tables
- random spacing
- unexplained empty areas

### 4.4 Consistency

Equivalent UI elements should look equivalent.

All primary buttons should share:

- height
- typography
- radius
- color
- focus treatment
- hover behavior
- disabled behavior

The same principle applies to:

- inputs
- cards
- tables
- badges
- alerts
- navigation
- dialogs

---

## 5. Layout

A typical page should follow:

```text
Page
├── Header
├── Navigation
└── Main
    ├── Page Header
    ├── Primary Content
    └── Supporting Content
```

Not every page needs every section.

Do not force unnecessary structure.

---

## 6. Page Width

Use a consistent content container.

Typical Tailwind pattern:

```html
<div class="mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8">
```

Adjust the maximum width when content requires it.

Examples:

- forms may use a narrower container
- dashboards may use a wider container
- reading content should remain narrow

---

## 7. Spacing System

Use Tailwind's spacing scale consistently.

Preferred values:

- 1
- 2
- 3
- 4
- 5
- 6
- 8
- 10
- 12
- 16
- 20
- 24

Common patterns:

```text
gap-2
gap-3
gap-4
gap-6
gap-8

p-4
p-6
p-8

space-y-4
space-y-6
```

Avoid arbitrary spacing unless necessary.

---

## 8. Typography

Typography should establish clear hierarchy.

Recommended hierarchy:

- display
- h1
- h2
- h3
- body
- body-small
- label
- caption

Use:

- font-medium
- font-semibold
- font-bold

intentionally.

Avoid making every heading bold.

---

## 9. Text Colors

Use semantic hierarchy.

Primary text:

```text
text-foreground
```

Secondary text:

```text
text-muted-foreground
```

Supporting text should visually recede without becoming difficult to read.

Avoid low-contrast text for important information.

---

## 10. Color System

Use a restrained semantic palette.

Required concepts:

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

Do not introduce arbitrary colors when an existing semantic token is suitable.

---

## 11. Surfaces

Use multiple visual levels.

Level 1:

Application background.

Level 2:

Cards and panels.

Level 3:

Elevated interactive surfaces.

Level 4:

Dialogs and popovers.

Depth should be subtle.

Prefer borders before heavy shadows.

---

## 12. Borders

Borders should generally be subtle.

Preferred:

```text
border
border-border
```

Avoid thick borders unless they communicate a specific state.

---

## 13. Border Radius

Use a consistent radius system.

Typical hierarchy:

- small controls
- inputs
- cards
- dialogs

Do not make every element extremely rounded.

Avoid excessive pill-shaped UI.

Use fully rounded elements mainly for:

- badges
- tags
- compact status indicators
- avatars

---

## 14. Shadows

Use shadows intentionally.

Preferred hierarchy:

```text
shadow-sm
shadow-md
shadow-lg
```

Avoid applying shadows to every element.

A flat surface with a subtle border is often preferable.

---

## 15. Gradients

Gradients are allowed.

Use them for:

- hero areas
- subtle backgrounds
- decorative accents
- visual emphasis

Do not apply gradients to every component.

Gradients should support hierarchy rather than become the hierarchy.

---

## 16. Glass Effects

Backdrop blur may be used selectively for:

- sticky navigation
- overlays
- floating panels
- premium hero areas

Typical pattern:

```text
bg-background/80 backdrop-blur
```

Do not turn the entire application into glassmorphism.

---

## 17. Buttons

Buttons should have clear hierarchy.

Recommended variants:

- primary
- secondary
- outline
- ghost
- destructive

Primary:

Used for the main action.

Secondary:

Used for supporting actions.

Ghost:

Used for low-emphasis actions.

Destructive:

Used for irreversible or dangerous actions.

Do not make every button visually dominant.

---

## 18. Inputs

Inputs should clearly communicate:

- label
- current value
- focus
- error
- disabled
- readonly

Use consistent:

- height
- padding
- radius
- border
- typography

Focus states must be visible.

---

## 19. Cards

Cards should group meaningful content.

Typical structure:

```text
Card
├── Header
├── Content
└── Footer
```

Cards should improve hierarchy, not create unnecessary visual boxes.

---

## 20. Tables

Tables should prioritize:

- readability
- alignment
- scanability
- consistent row height
- meaningful column hierarchy

Recommended behaviors:

- subtle row borders
- hover state
- clear header
- responsive overflow when necessary
- appropriate numeric alignment

Do not make tables unnecessarily dense.

---

## 21. Navigation

Navigation should clearly communicate:

- current page
- available pages
- hierarchy
- primary actions

Active navigation items should have a distinct but restrained treatment.

---

## 22. Forms

Forms should prioritize:

- clear labels
- logical grouping
- consistent spacing
- visible validation
- clear primary action

Avoid extremely dense forms.

Use sections or fieldsets when appropriate.

---

## 23. Empty States

Empty states should explain:

1. What is empty
2. Why it may be empty
3. What the user can do next

Do not simply display:

```text
No data.
```

Provide useful context.

---

## 24. Loading States

Use loading indicators appropriate to the content.

Prefer skeletons when the structure of the final content is known.

Avoid unnecessary full-screen loading states.

---

## 25. Error States

Errors should communicate:

- what happened
- what the user can do
- whether retry is possible

Errors should be clear without becoming visually overwhelming.

---

## 26. Interaction

Interactive elements should provide clear feedback.

Required states where applicable:

- default
- hover
- focus-visible
- active
- selected
- disabled
- loading
- error
- success

---

## 27. Motion

Animations should be subtle and purposeful.

Use motion for:

- hover transitions
- opening and closing
- state changes
- feedback
- loading

Avoid animation that slows down interaction.

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  /* reduce or remove non-essential motion */
}
```

---

## 28. Responsive Design

Design mobile-first.

Required target categories:

- mobile
- tablet
- desktop
- wide desktop

Do not simply shrink desktop layouts.

Instead reconsider:

- navigation
- columns
- action placement
- table behavior
- form structure
- spacing
- content density

---

## 29. Mobile

On mobile:

- stack columns when appropriate
- reduce horizontal padding
- simplify navigation
- keep important actions accessible
- avoid tiny controls
- avoid accidental horizontal overflow

---

## 30. Accessibility

Accessibility is part of visual quality.

Maintain:

- semantic HTML
- keyboard navigation
- visible focus
- sufficient contrast
- logical headings
- accessible labels
- meaningful button names
- appropriate ARIA
- reduced motion support

Prefer native HTML semantics over unnecessary ARIA.

---

## 31. Dark Mode

If dark mode exists or is introduced:

All semantic colors must work in both themes.

Do not hardcode light-only colors.

Avoid pure black backgrounds unless specifically required.

Use surface hierarchy to preserve depth.

---

## 32. Overall Quality Bar

The final application should look:

- cohesive
- intentional
- modern
- polished
- production-ready

It should not look like:

- default HTML
- randomly styled Tailwind
- a collection of unrelated templates
- excessive component decoration

Every visual decision should have a reason.
