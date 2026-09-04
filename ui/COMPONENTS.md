# UI Component System

This document defines reusable UI patterns for the application.

The goal is consistency without unnecessary abstraction.

---

## 1. Component Philosophy

Components should be:

- reusable
- predictable
- accessible
- composable
- visually consistent

Extract a component when:

1. The pattern appears multiple times
2. The pattern has meaningful states
3. The pattern has non-trivial styling
4. Reuse improves consistency

Do not abstract every HTML element.

---

## 2. Button

### Variants

Recommended variants:

- primary
- secondary
- outline
- ghost
- destructive

### Primary

Use for the main action.

Example:

```html
<button
  class="
    inline-flex items-center justify-center gap-2
    rounded-md
    bg-primary
    px-4 py-2
    text-sm font-medium
    text-primary-foreground
    shadow-sm
    transition-colors
    hover:bg-primary/90
    focus-visible:outline-none
    focus-visible:ring-2
    focus-visible:ring-primary
    focus-visible:ring-offset-2
    disabled:pointer-events-none
    disabled:opacity-50
  "
>
  Save
</button>
```

---

## 3. Button States

Every button should consider:

- default
- hover
- active
- focus-visible
- disabled
- loading

Loading buttons should communicate that the action is being processed.

Prevent repeated submission while loading.

---

## 4. Input

Inputs should contain:

```text
Field
├── Label
├── Input
├── Description
└── Error
```

Use consistent:

- height
- padding
- typography
- border
- radius

---

## 5. Input States

Support:

- default
- hover
- focus
- disabled
- readonly
- error
- success

Focus must be visible.

Error must not rely only on color.

---

## 6. Select

Select controls should visually match inputs.

Maintain consistent:

- height
- border
- radius
- typography
- focus state

Prefer native `<select>` unless custom behavior is genuinely necessary.

---

## 7. Checkbox

Checkboxes should:

- have a visible label
- have an adequate touch target
- clearly communicate checked state
- have a focus-visible state

Do not use clickable divs for checkbox behavior.

---

## 8. Radio

Radio controls should clearly communicate:

- selected
- unselected
- disabled
- focus

Group related options semantically.

---

## 9. Textarea

Textarea should visually match input controls.

Allow resizing when appropriate.

Do not unnecessarily disable resizing.

---

## 10. Card

Typical structure:

```text
Card
├── Header
│   ├── Title
│   └── Description
├── Content
└── Footer
```

Use:

- surface background
- subtle border
- consistent radius
- appropriate padding

Use shadows sparingly.

---

## 11. Badge

Badges communicate:

- status
- category
- metadata

Recommended variants:

- neutral
- success
- warning
- danger
- info

Badges should be compact.

Avoid using badges purely as decoration.

---

## 12. Alert

Recommended variants:

- info
- success
- warning
- error

Alerts should communicate meaning through:

- icon when appropriate
- text
- semantic color
- clear hierarchy

Do not rely on color alone.

---

## 13. Modal / Dialog

Dialogs should:

- trap focus when implemented as a true modal
- have a clear title
- have an accessible name
- have an obvious close action
- prevent accidental destructive actions

Use appropriate backdrop treatment.

Avoid excessive blur.

---

## 14. Dropdown

Dropdown menus should:

- have a clear trigger
- support keyboard navigation
- communicate hover/focus
- maintain appropriate spacing
- align predictably

Do not use dropdowns when a simple list is clearer.

---

## 15. Tabs

Tabs should communicate:

- current tab
- available tabs
- interactive state

Active tabs should have a clear visual indicator.

---

## 16. Breadcrumb

Breadcrumbs should provide context on hierarchical pages.

Do not use breadcrumbs when hierarchy is already obvious.

---

## 17. Pagination

Pagination should clearly communicate:

- current page
- available pages
- previous/next actions
- disabled states

---

## 18. Table

Requirements:

- semantic table HTML
- clear header
- consistent padding
- readable rows
- hover state where useful
- responsive strategy

Numeric columns should align consistently.

---

## 19. Navigation

Navigation should support:

- active state
- hover state
- keyboard focus
- mobile behavior

Desktop and mobile navigation may use different layouts.

---

## 20. Sidebar

Sidebars should provide:

- clear grouping
- active page
- readable labels
- optional collapse behavior

Avoid excessive nested navigation.

---

## 21. Header

A product header may contain:

- logo or product name
- navigation
- search
- actions
- user menu

Do not overcrowd the header.

---

## 22. Empty State

Typical structure:

```text
Empty State
├── Optional Icon
├── Title
├── Description
└── Primary Action
```

The action should help the user progress.

---

## 23. Loading State

Use:

- skeleton
- spinner
- progress indicator

depending on context.

Skeletons should approximately match the final content structure.

---

## 24. Error State

Typical structure:

```text
Error State
├── Title
├── Explanation
└── Retry / Recovery Action
```

---

## 25. Toast / Notification

Notifications should:

- be noticeable
- not block the interface
- be dismissible when appropriate
- use semantic variants

Do not use notifications for information that should remain visible in-page.

---

## 26. Tooltip

Tooltips should explain unfamiliar controls.

Do not use tooltips for essential information that must always be visible.

---

## 27. Avatar

Avatars may display:

- image
- initials
- fallback

Maintain consistent size and radius.

---

## 28. Icon Rules

Icons should:

- use one consistent icon family
- have appropriate size
- align with text
- not replace important labels unnecessarily

Never use emoji as a substitute for interface icons.

---

## 29. Component Consistency

Before creating a new component, inspect existing components.

Prefer reuse.

Avoid creating components such as:

```text
ButtonBlue
ButtonGreen
SpecialButton
DashboardButton
```

when a variant system can solve the problem.

---

## 30. Tailwind Class Strategy

For long Tailwind classes, organize conceptually as:

1. Layout
2. Spacing
3. Typography
4. Surface
5. Border
6. Effects
7. Interaction
8. Responsive

Example:

```html
class="
  flex items-center gap-3
  px-4 py-2
  text-sm font-medium
  bg-primary text-primary-foreground
  rounded-md border border-transparent
  shadow-sm
  transition-colors
  hover:bg-primary/90
  focus-visible:outline-none
  focus-visible:ring-2
  focus-visible:ring-primary
  disabled:opacity-50
"
```

---

## 31. Component Quality

A component is not complete until:

- default state works
- hover works
- focus works
- disabled works
- responsive behavior works
- accessibility works
- dark mode works when supported
