Domain verticals. Each directory is one slice of the game and owns its UI, business logic, and
types together — a feature is a thing a player can do, not a layer.

Features call `infrastructure/` for I/O, `shared/` for primitives, and `app/stores/` for
cross-cutting state. Control flow runs that way only; nothing in those three calls into a
feature. Their *type* imports do come back the other way — the domain model lives here — but
never a feature's stores, components, or actions. Two features needing the same thing means
push it down, not import sideways.

Tests live beside the source (`*.test.ts` / `*.test.tsx`). Conventions: `@tests/testing-react.md`
— real `Y.Doc` (never mocked), query by role/text, follow `card-preview/CardPreview.test.tsx`.
