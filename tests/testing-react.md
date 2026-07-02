# Unit & Component Testing Conventions

Conventions for **vitest** tests that live next to source (`src/**/*.test.ts` / `*.test.tsx`).
For end-to-end Playwright tests (PileViewer, dnd-kit, react-flow), see `tests/testing.md` instead.

The one-line rule for **where a test goes**: if it needs pointer physics, react-flow canvas
geometry, or WebRTC sync, it's **e2e** (`tests/e2e/`, Playwright). Everything else is a
**component or logic test** here, running against a real `Y.Doc` in happy-dom.

---

## The three tiers

| Tier | Files | Renders? | Example |
|------|-------|----------|---------|
| **Logic** | `*.test.ts` | no | `Player.test.ts`, `Deck.test.ts`, `diceActions.test.ts` |
| **Component / integration** | `*.test.tsx` | yes (RTL) | `CardPreview.test.tsx` |
| **E2e** | `tests/e2e/*.spec.ts` | Playwright | `card_tooltips.spec.ts` |

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

---

## The harness (`src/test/`)

> **Status: planned, not yet built.** Until it lands, follow the inline pattern in
> `CardPreview.test.tsx` (local `makeCard()` factory + real `Y.Doc`). When it exists, prefer it.

Target shape — one source of truth so the good pattern is the path of least resistance:

```
src/test/
  setup.ts        # jest-dom + global afterEach store reset (existing file, extended)
  harness.tsx     # renderWithGame(ui, opts) — RTL render + seeded stores
  factories.ts    # makeCard(), makeToken(), makeDeck()
  seedGame.ts     # makeTestDoc() -> { yDoc, player, playerId } wired to a real Player
  mocks/          # canonical I/O mocks: cardLookup, posthog, idb
```

`renderWithGame(<CardPreview />, { hand: [makeCard()] })` seeds a real `Y.Doc` + `Player` into
`gameInstanceStore` / `playerStore`, then renders — so a component under test hits real Yjs and
real stores without prop-drilling.

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
