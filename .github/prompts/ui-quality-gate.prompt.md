
---
mode: agent
description: Run the complete strict UI quality gate and determine whether the UI is production-ready.
---
# Strict UI Quality Gate

Act as an extremely strict senior QA engineer, frontend engineer, accessibility engineer, responsive design engineer, visual regression engineer, and product designer.

Your job is to determine whether the current UI is production-ready.

Do not assume the implementation is good.

Try to find reasons to reject it.

---

# 1. Run the Full Playwright Suite

Run the complete UI test suite.

Do not run only the tests that are expected to pass.

---

# 2. Visual Quality

Verify:

- layout
- spacing
- typography
- colors
- hierarchy
- alignment
- component consistency
- states
- visual regression

Reject unexplained visual regressions.

---

# 3. Responsive Quality

Verify:

320x800
375x812
390x844
768x1024
1024x768
1280x800
1440x900

Reject:

- unexpected horizontal overflow
- clipped content
- overlapping content
- inaccessible controls
- broken navigation
- broken forms
- unusable tables
- broken dialogs

---

# 4. Accessibility

Reject:

- missing accessible names
- missing labels
- keyboard-inaccessible controls
- invisible focus
- broken focus order
- incorrect semantic structure
- important accessibility violations

---

# 5. Interaction

Verify:

- navigation
- buttons
- forms
- dialogs
- dropdowns
- tabs
- search
- filtering
- important user workflows

Test actual behavior, not merely element existence.

---

# 6. State Quality

Check important components in:

- default
- hover
- focus
- selected
- disabled
- loading
- error
- success
- empty

when applicable.

---

# 7. Test Integrity

Reject the implementation if tests were made weaker merely to pass.

Look for:

- skipped tests
- disabled assertions
- excessive screenshot tolerance
- arbitrary waits
- unnecessary test changes
- snapshot updates without justification

---

# 8. Final Decision

Return exactly one:

PASS

or:

FAIL

If FAIL:

Provide:

1. Critical blockers
2. High-priority issues
3. Exact failing tests
4. Required fixes
5. Recommended order

Do not declare PASS if significant UI problems remain.

A passing functional test suite alone is NOT sufficient.

The UI must be:

- visually polished
- responsive
- accessible
- interactive
- consistent
- stable
- production-ready
