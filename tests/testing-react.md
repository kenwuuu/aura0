# Unit & Component Testing Conventions

Conventions for **vitest** tests that live next to source (`src/**/*.test.ts` / `*.test.tsx`).
For end-to-end Playwright tests (PileViewer, dnd-kit, react-flow), see `tests/testing.md` instead.

The one-line rule for **where a test goes**: if it needs pointer physics, react-flow canvas
geometry, or WebRTC sync, it's **e2e** (`tests/e2e/`, Playwright). Everything else is a
**component or logic test** here, running against a real `Y.Doc` in happy-dom.

---

## The three tiers

| Tier                        | Files                 | Renders?   | Example                                                 |
|-----------------------------|-----------------------|------------|---------------------------------------------------------|
| **Logic**                   | `*.test.ts`           | no         | `Player.test.ts`, `Deck.test.ts`, `diceActions.test.ts` |
| **Component / integration** | `*.test.tsx`          | yes (RTL)  | `CardPreview.test.tsx`                                  |
| **E2e**                     | `tests/e2e/*.spec.ts` | Playwright | `card_tooltips.spec.ts`                                 |

Logic tests exercise domain objects (`Player`, `Deck`, store actions) directly against a real
`Y.Doc`. Component tests render a React tree and assert on what the **user** sees. Reach for a
component test only when behavior actually depends on rendering; otherwise a logic test is cheaper
and more stable.

## Reference examples

- **Follow `src/features/card-preview/CardPreview.test.tsx`.** It is the model: a `makeCard()`
  factory, a **real `Y.Doc`** (never a mock), accessible queries (`getByAltText`, `getByRole`),
  and assertions on user-visible behavior.
- **Do NOT follow `src/features/deck-manager/DeckImportModal.test.tsx`.** It is the cautionary
  example — it indexes ambiguous matches (`getAllByText(...)[1]`), reaches into raw DOM
  (`.parentElement`, `.closest`, `document.body.textContent`), asserts on layout/button order, and
  mocks owned domain code via relative paths. Every one of those breaks under refactor even when
  behavior is correct. It will be converted to this guide's pattern; until then, don't copy it.

---

## Rules

### 1. Query by what the user perceives — never by DOM structure

Priority ladder (prefer the highest that works):

1. `getByRole('button', { name: /import/i })` — role + accessible name
2. `getByLabelText` / `getByPlaceholderText` — form controls
3. `getByText` / `getByAltText` — visible text and image alts
4. `findBy*` — the async form, for anything that appears after an interaction or effect
5. `getByTestId` (`data-testid` / your existing `data-card-id`) — **last resort**, only when there
   is no accessible handle

**Banned for behavioral assertions:**
- `container.querySelector(...)` / `querySelectorAll(...)`
- `document.body.textContent).toContain(...)`
- `.parentElement` / `.closest(...)` to locate a node
- indexing ambiguous matches: `getAllBy...(x)[n]`
- asserting DOM order or child position (that's layout — leave it to e2e/visual)

If a query is ambiguous, disambiguate with an accessible scope (`within(dialog).getByRole(...)`),
not an array index.

### 2. Yjs: always real, never mocked

Create a real `Y.Doc` (this matches the root `CLAUDE.md` philosophy). CRDT semantics are too subtle
to fake and a real doc is cheap. Mutations to player state go through a real `Player`; battlefield
state is written to `yDoc.getMap(YDOC_CARDS_ON_BOARD)` — same as production.

### 3. Zustand stores are reset between tests, centrally

Stores like `gameInstanceStore` and `playerStore` are module singletons — state leaks across tests
unless reset. Reset happens once in `src/test/setup.ts` (an `afterEach`), so **you never reset
stores by hand** in a spec. Seed state through the harness (below), not by poking singletons.

### 4. Mock only true I/O boundaries

Mock: the card lookup network (`CardLookupService`), IndexedDB persistence, `posthog`. Canonical
mocks live in `src/test/mocks/` — import those rather than re-declaring `vi.mock(...)` per file.

**Never mock:** Yjs, `Player`, or any of your own feature/domain logic. If a component needs a
service, prefer injecting a real or canonical-mock instance over `vi.mock` of a relative path.
Use the `@/` alias in the rare `vi.mock` that remains — never `../services/...`.

### 5. Interactions use `userEvent`, not `fireEvent`

```ts
const user = userEvent.setup();
await user.click(screen.getByRole('button', { name: /help/i }));
```

`userEvent` models real user behavior (focus, pointer, keyboard). Reserve `fireEvent` for the rare
low-level event `userEvent` can't express.

### 6. Async: `findBy*` / `waitFor`, never fixed sleeps

Wait on a condition, not a timer. `await screen.findByText(...)` or
`await waitFor(() => expect(...))`. No `setTimeout` / `waitForTimeout` in unit tests.

### 7. Don't test the untestable-here

Skip (or push to e2e/visual): CSS-module class names, pixel layout/positioning, and third-party
internals (Radix, react-flow, dnd-kit). Assert on the behavior they produce, not their markup.

### 8. Radix modals: a backgrounded dialog leaves the accessibility tree

When a Radix dialog opens on top of another (e.g. the Help dialog over the Import modal), Radix marks
the modal underneath `aria-hidden`. That is correct behavior — but it means the backgrounded modal
**drops out of the accessibility tree**, so `getByRole` / name-based queries can no longer see it, and
its accessible *name* resolves to `""` (its title is hidden too). This is the trap the old
`getAllByText('Import Deck')[1]` hack was papering over: text queries ignore `aria-hidden`, role
queries don't.

Rules for nested dialogs:

- **Foreground dialog** — query normally by role/name: `screen.getByRole('dialog', { name: /help/i })`.
  Scope queries into it with `within(...)` so they can't match the backgrounded one.
- **Background dialog, "is it still mounted / not dismissed?"** — don't query it by role or name.
  Assert a **label-associated form field** (`getByLabelText('Deck Name')`) or other text that stays
  in the DOM regardless of `aria-hidden`, and assert the dismiss callback was **not** called
  (`expect(onClose).not.toHaveBeenCalled()`).
- Reserve `{ hidden: true }` on a role query for elements that are hidden but still have a stable
  accessible name; it won't help when the name itself has collapsed to `""`.

See `deck-manager/DeckImportModal.test.tsx` for the worked example.

### 9. `vi.mock` a module by the path your component actually imports, not the concrete file

A `vi.mock('concrete/submodule/path')` can silently fail to apply if a **globally-loaded
`setupFiles` entry** (or anything it transitively imports) already imported and cached that module
via a **barrel** re-export before your test file's own hoisted `vi.mock` calls register. The
symptom is confusing: no error, the mock is just never used — a real constructor/function runs
instead, and you'll see its real side effects (e.g. a real `ReferenceError: indexedDB is not
defined` from deep inside a service you thought you'd mocked).

Fix: mock the **barrel path** the consuming component actually imports from (e.g. `@/features/
deck-manager`, not `@/features/deck-manager/MtgTextListDeckImporter`), and preserve the rest of
the barrel's real exports with `importOriginal`:

```ts
vi.mock('@/features/deck-manager', async (importOriginal) => ({
  ...(await importOriginal()),
  MtgTextListDeckImporter: vi.fn(),
}));
```

If you mock a class this way and production code calls it with `new`, use a regular `function`
expression in `mockImplementation`, not an arrow function — arrow functions have no `[[Construct]]`
and throw `"... is not a constructor"` the moment production code instantiates them.

### 10. Radix `Slider`: `aria-label` must land on the `Thumb`, not the `Root`

`role="slider"` lives on Radix's `Thumb` subcomponent, not `Root`. An `aria-label` passed to
`<Slider aria-label="..." />` and forwarded only to `Root` (the common shape for a thin wrapper) is
invisible to accessible-name computation — `getByRole('slider', { name: '...' })` won't find it,
and accessibility tooling won't see a name either. Thread `aria-label` explicitly onto
`SliderPrimitive.Thumb` in the shared wrapper (`src/shared/ui/slider.tsx`) if you add a new slider
or a new `aria-label` prop.

See `deck-manager/DeckImportModal.test.tsx` for the module-mocking pattern, and
`settings/sections/DisplaySection.test.tsx` for a slider tested by accessible name.

---

## The harness (`src/test/`)

One source of truth so the good pattern is the path of least resistance:

```
src/test/
  setup.ts        # jest-dom + global afterEach store reset
  harness.tsx     # renderWithGame(ui, opts) — RTL render + seeded stores
  nodeHarness.tsx # renderNode(Node, data, opts) — render one react-flow node in isolation
  factories.ts    # makeCard() (+ makeCards)
  seedGame.ts     # seedGame() -> { yDoc, player, playerId } wired to a real Player
  mocks/          # canonical I/O mocks: cardLookup, posthog, idb (add as needed)
```

`renderWithGame(<CardPreview />, { hand: [makeCard()] })` seeds a real `Y.Doc` + `Player` into
`gameInstanceStore` / `playerStore`, then renders — so a component under test hits real Yjs and
real stores without prop-drilling.

### Testing react-flow nodes

Nodes read only `id`/`data` and touch **no** react-flow context, so `renderNode` deliberately has
**no `ReactFlowProvider`** — it just fills the wide `NodeProps` type with inert defaults and renders
via `renderWithGame`. But a node's markup is redesign-fragile; its *behavior* isn't. So push the
durable logic **down**, and keep only the wiring seam at the node:

1. **Extract pure logic** (which face shows, rotation math, which viewer opens) into a plain `*.ts`
   module → cheap `.test.ts` unit tests, no harness, immune to the redesign. See
   `battlefield/nodes/cardNodeLogic.ts` + its test.
2. **Keep one node-level test** through `renderNode` for the data-cast + store-wiring seam (hover
   drives the preview store, right-click opens the hotkey menu). See `CardNode.test.tsx`.

Two more worked examples of the same split:

- `TokenNode` — `tokenNodeLogic.ts` (`isOwnToken`, `applyTokenDelta`) + `TokenNode.test.tsx` (click/
  right-click gated by ownership, hover shows the hotkey hint).
- `PileNode` — `pileNodeLogic.ts` (`isHandViewDisabled`, `resolvePileOpenRequest`) +
  `PileNode.test.tsx` (click routes to the local vs. opponent viewer, the draw button).

When refactoring an existing node, write the node-level characterization tests **first** (assert
observable behavior via accessible queries), get them green, *then* extract underneath — the
unchanged green bar is the proof the extraction was safe.

## Copyable skeleton

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
// import { renderWithGame } from '@/test/harness';   // once the harness exists
// import { makeCard } from '@/test/factories';

describe('<Thing>', () => {
  it('does the user-visible thing when acted on', async () => {
    const user = userEvent.setup();
    // renderWithGame(<Thing />, { hand: [makeCard({ name: 'Lightning Bolt' })] });

    await user.click(screen.getByRole('button', { name: /play/i }));

    expect(screen.getByAltText('Lightning Bolt')).toBeInTheDocument();
  });
});
```
