
---
applyTo: "**/*.html"
---
# HTML Instructions

Use semantic, accessible HTML.

---

## Semantic Structure

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

Avoid unnecessary wrapper elements.

---

## Interactive Elements

Use:

```html
<button>
```

for actions.

Use:

```html
<a href="...">
```

for navigation.

Do not use:

```html
<div onclick="...">
```

when a semantic control exists.

---

## Forms

Every form control must have an accessible label.

Prefer:

```html
<label for="email">Email</label>
<input id="email" />
```

---

## Headings

Maintain logical hierarchy.

Do not skip heading levels merely for visual size.

Use Tailwind for visual sizing.

---

## Images

Images require meaningful alt text when informative.

Decorative images should have empty alt text.

---

## Accessibility

Ensure:

- keyboard usability
- focusability
- semantic controls
- accessible names
- logical reading order

Do not add ARIA when native HTML semantics are sufficient.

---

## UI Redesign

HTML structure may be refactored to improve:

- semantics
- layout
- accessibility
- visual hierarchy

Do not change application behavior unnecessarily.
