Domain verticals — `battlefield`, `card-preview`, `deck-manager`, `game-dock`, `hotkeys`, `keyword-tokens`, `opponents`, `player`, `room`. Each owns its UI plus business logic for that slice.
Reach out to `infrastructure/` for I/O (cards lookup, networking, persistence, analytics), `shared/` for primitives, and `app/stores/` for cross-cutting Zustand stores.

Tests for a feature live beside its source (`*.test.ts` / `*.test.tsx`). Conventions: `@tests/testing-react.md` — real `Y.Doc` (never mocked), query by role/text, follow `card-preview/CardPreview.test.tsx`.
