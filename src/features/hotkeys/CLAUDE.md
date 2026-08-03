Keyboard hotkeys and the right-click/tap context menu. They are one feature, not two.

## One catalog, three surfaces

`HOTKEYS` in `hotkeys.ts` is the single source for all three. Keyboard bindings read it via
`resolveBindings` (`bindings.ts`); menu rows via `getMenuActionsForTarget`; the Game Actions
toolbar via `getToolbarActions`. All three then call `dispatchGameAction` (`gameActions.ts`), so
they cannot drift — a new action or a bugfix is live everywhere at once. Add actions to the
catalog, never to one surface.

## `keys` is a default, not the binding

Since hotkeys became customizable, a catalog entry's `keys` is only the bottom layer of

```
overrides[action] ?? PRESET[action] ?? catalog.keys
```

`presets.ts` holds the schemes (`untap` is empty — the catalog *is* Untap; `default` and
`moxfield` are diffs over it) and `bindings.ts` resolves them. **Never read `keys` to bind or
render a shortcut** — use `useEffectiveBindings()`, or `getEffectiveBindings()` outside React —
or you will bind and display the Untap keys for every player on another preset. That is why
`getKeyBindingsForAction` was deleted rather than left unused, and why `Hotkey.key` (a
hand-written display string that could disagree with `keys`) is gone in favour of
`formatKeyBinding`.

For the same reason, **comments and docs here name actions, not letters** — "Move-to-discard",
not "D". Three surfaces used to hard-code letters and silently went stale on a rebind: the pile
viewer's destination bar and desktop key legend, the mulligan confirmation's "press M", and
`help.md`'s prose.

Two rules that bite:

- **`serializeKeyEvent` must mirror react-hotkeys-hook exactly.** rhk matches on `event.code`,
  aliases some codes *before* lowercasing (`ShiftLeft` → `shift`), then applies
  `.toLowerCase().replace(/key|digit|numpad/, '')`. Get it wrong and a recorded binding is
  stored but never fires.
- **A preset diff is a cycle, not a set of independent edits.** In `default`, `D` is free for
  Draw only because Discard moved to `G`. `bindings.test.ts` asserts key-uniqueness per preset
  for exactly this reason.

Executors read their instances from `useGameInstance.getState()`. This hook layer decides
*which* action fires and *what it targets*; it never touches `yDoc`/`player` directly.

**The toolbar was a second registry until it wasn't.** `features/game-actions/gameActions.ts`
used to hold a parallel `GAME_ACTIONS` list with its own `perform(ctx)` bodies, and the copies
drifted exactly as duplication predicts: the toolbar's Mulligan called `player.mulligan()`
outright while the `M` key and the deck menu went through `triggerConfirmation` first, and
"Exile Top"/"Look at Top" were second implementations of rows the deck node already had as
"Exile"/"View". That file is gone. If you find yourself writing a `perform()` next to a UI
component, that's the smell.

### The toolbar has no hover

It's the one surface with nothing under the cursor, so it can't derive a target the way the
keyboard and menus do. Each entry's `toolbar: ToolbarPlacement` names the target its click
dispatches against — `'board'` for the target-free globals, `'deck'` for rows that act blind on
the top of the library. That's why "Exile Top" is not its own action: it is `moveToExile` with a
deck-targeted placement and a toolbar-only label.

`toolbar.order` is a second ordering system on purpose. Catalog order is semantic and drives
context-menu rows; the toolbar's Actions ▾ groups for a different reader. One array can't sort
both.

## The trap: `keys` and `context` are independent

On a `Hotkey`, **`keys` binds the key. `context` decides which menus show the row.** They are
unrelated fields, and the catalog carries five separate inline comments re-explaining this
because it keeps biting.

Concretely: `v`, `m`, `a`, `i`, `+`/`-` are all bound in `useAllGameHotkeys` regardless of their
`context` list. Dropping `'global'` from `addCard` takes "Add any card" off the empty-board menu
and the `a` key still works. That's deliberate — it's how a row gets removed from a menu without
disabling its shortcut — but it means **you cannot disable a key by editing `context`**, and a
row appearing in the wrong menu is a `context` bug, never a `keys` bug.

## The menu is one app-level component, opened imperatively

`GameContextMenu` is mounted once and serves every target. Surfaces don't render their own
menus — battlefield nodes, hand cards, pile-viewer cards, and the tap hook all call
`useContextMenuStore.getState().openMenu({ target, x, y, ... })`. Rows come from the catalog;
there is no per-surface menu markup to keep in sync.

It's built on shadcn's **`DropdownMenu`**, not a Popover — that migration is done, and the
Popover-shaped facts that used to be written down no longer apply. Two consequences that are
load-bearing:

- **`modal={false}` is not a style choice.** Radix's DropdownMenu defaults to modal, which kills
  pointer events on the rest of the page — including the card you just right-clicked. That flips
  its hover off, clears `hoverTarget`, and breaks the keyboard hotkeys that read it. Hovering a
  card, right-clicking it, then pressing a key must still act on that card.
- **DropdownMenu has no `Anchor` primitive** (Popover does), so cursor positioning uses a
  zero-size `Trigger` pinned at (x, y) with `Content` positioned off it via Radix Popper. The
  trigger is keyed on the cursor point so a second right-click elsewhere re-anchors instead of
  leaving the menu stuck at the first position.

## Routing is by hover, not by registration

One `useHotkeys` per key, not one per surface. Each handler reads the single `hoverTarget` from
`hotkeyStore` and routes to battlefield / hand / pile / token / pile-viewer itself. Adding a
surface means teaching the existing handlers a new `hoverTarget` kind — not re-registering 28
bindings against it.

## Scopes: exactly one, always

`HotkeyScope.Board` ↔ `HotkeyScope.PileViewer` ↔ `HotkeyScope.Capture`, switched on modal and
capture state via `react-hotkeys-hook`'s `<HotkeysProvider>` (owned by `GameHotkeysManager`).

`Capture` has **no bindings registered under it**, which is the point: it is the "no game
hotkeys" state written as a scope, so the never-empty rule below still holds. It exists because
the Settings modal never sets `isModalOpen` (only the pile viewer, AddCard and the command
palette do), so board hotkeys are live inside it — without `Capture`, pressing `D` to *record*
it would also draw a card.

**Never let the active-scope set go empty.** react-hotkeys-hook treats empty as "no scoping" and
silently re-enables *every* scoped binding with only a console warning — board hotkeys firing
under an open modal. The switch enables the incoming scope before disabling the outgoing one for
exactly this reason; keep that order if you touch it.

## Touch is a separate gesture layer

`useContextMenuTap` owns tap, because touch has no right-click and no hover. It is:

- **touch-only** — mouse paths are untouched, so desktop keeps right-click for the menu
- **drag-aware** — travel beyond `TAP_MOVE_TOLERANCE` is a drag/pan, not a tap
- **click-swallowing** — a tap synthesises a `click` that would fire the element's own handler
  (a token's +/-, a pile's viewer); `onClickCapture` cancels it so one tap does one thing

Card surfaces get two taps, and **the order flips by surface**: preview-first for hand and
face-up pile-viewer cards (you're there to identify), menu-first for battlefield cards
(`menuFirst: true` — you're there to act). Non-card surfaces are single-tap → menu. A `null`
target opts out so the element's own click survives (an opponent's pile opens their viewer).

`touchMenuOnly: true` marks rows that exist *only* because touch has no hover — the token
+1/-1 rows, which on desktop are the top/bottom halves of the token itself.
