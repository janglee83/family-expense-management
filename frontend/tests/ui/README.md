# Playwright UI Quality Gate

This folder contains strict Playwright UI quality tests.

- `smoke/`: baseline route and shell checks to ensure the app boots and is navigable.
- `visual/`: screenshot regression coverage for key pages and states.
- `responsive/`: viewport and overflow integrity checks.
- `accessibility/`: keyboard, landmark, and semantic accessibility checks.
- `interaction/`: high-value interaction flows and control states.
- `states/`: loading, empty, success, and error state coverage.
- `fixtures/`: shared test helpers and deterministic test data builders.

Conventions:

1. Prefer role/label/text selectors over structural selectors.
2. Do not add arbitrary sleeps.
3. Treat snapshot updates as explicit review events.
