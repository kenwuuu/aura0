Vitest setup (`setup.ts`) and shared test scaffolding.
Per-module unit tests live next to the code they test (`*.test.ts` / `*.test.tsx`); E2E lives in the top-level `tests/` directory.

- `setup.ts` — global setup: `@testing-library/jest-dom` matchers + `afterEach` store reset. Specs
  never reset Zustand stores by hand; it happens here.
- Harness (`harness.tsx`, `factories.ts`, `seedGame.ts`, `mocks/`) — seed a real `Y.Doc` + `Player`
  and render. Never mock Yjs or owned domain code.

Conventions live in `@tests/testing-react.md` — read it before adding or changing anything here, and
keep this directory's API consistent with the rules there.
