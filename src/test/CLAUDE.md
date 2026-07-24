Vitest global setup and shared unit-test scaffolding — anything more than one spec needs
(factories, game seeding, render harnesses). A helper used by exactly one spec belongs in that
spec. Per-module unit tests live next to the code they test; E2E lives in the top-level `tests/`.

Setup is global, so **specs never reset Zustand stores by hand** — an `afterEach` here already
does, and a spec resetting again is usually papering over leaked state.

The harness seeds a **real `Y.Doc` + `Player`** and renders against it. Never mock Yjs or owned
domain code; mock only at the network boundary.

For react-flow nodes, prefer extracting the pure logic into a `*.ts` module and testing that.
The node render harness is for the store-wiring seam only — reach for it when the wiring *is*
what you're testing.

Conventions live in `@tests/testing-react.md` — read it before changing anything here, and keep
this directory's API consistent with it.
