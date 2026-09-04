
---
applyTo: "**/*.css"
---
# CSS Instructions

The project uses Tailwind CSS v4 as the primary styling system.

---

## Tailwind First

Prefer Tailwind utilities over custom CSS.

Use custom CSS only when it provides meaningful value.

Good use cases:

- CSS variables
- theme definitions
- complex keyframes
- pseudo-elements
- third-party integrations
- browser-specific behavior

---

## Avoid

Avoid:

- !important
- deeply nested selectors
- excessive specificity
- duplicated declarations
- arbitrary magic numbers
- huge component-specific CSS blocks

---

## Design Tokens

Use semantic CSS variables for important design decisions.

Examples:

```css
:root {
  --color-background: ...;
  --color-foreground: ...;
  --color-primary: ...;
  --color-border: ...;
  --color-muted: ...;
}
```

Use the project's existing token naming convention when one already exists.

---

## Tailwind v4

Prefer CSS-first configuration.

Typical entry point:

```css
@import "tailwindcss";
```

Use theme definitions where appropriate.

---

## Responsive

Prefer Tailwind responsive variants.

Examples:

```text
sm:
md:
lg:
xl:
2xl:
```

Do not create many custom breakpoints without a reason.

---

## Motion

Keep animations subtle.

Respect:

```css
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms;
    animation-iteration-count: 1;
    transition-duration: 0.01ms;
    scroll-behavior: auto;
  }
}
```

Only add this globally if the application does not already provide an equivalent rule.

---

## Maintainability

Repeated Tailwind patterns may be extracted into:

- reusable components
- shared classes
- CSS utilities

Do not create abstractions solely to shorten class strings.

---

## Visual Quality

Custom CSS should support the project's design system.

Do not introduce arbitrary colors or spacing values without justification.
