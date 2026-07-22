Domain verticals — `battlefield`, `bug-report`, `card-preview`, `deck-manager`, `game-dock`, `hotkeys`, `keyword-tokens`, `opponents`, `player`, `room`. Each owns its UI plus business logic for that slice.

`bug-report` is the one vertical every other surface may import: `openBugReport(surface)` is a complete action (snapshot → tags → telemetry → keyboard capture → form), so a new report button only has to say where it is.
Reach out to `infrastructure/` for I/O (cards lookup, networking, persistence, analytics), `shared/` for primitives, and `app/stores/` for cross-cutting Zustand stores.

Tests for a feature live beside its source (`*.test.ts` / `*.test.tsx`). Conventions: `@tests/testing-react.md` — real `Y.Doc` (never mocked), query by role/text, follow `card-preview/CardPreview.test.tsx`.
