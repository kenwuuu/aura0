Keyboard hotkeys and the right-click/tap context menu. They are one feature, not two.

## One catalog, two surfaces

`HOTKEYS` in `hotkeys.ts` is the single source for both. Keyboard bindings read it via
`getKeyBindingsForAction`; menu rows read it via `getMenuActionsForTarget`. Both then call
`dispatchGameAction` (`gameActions.ts`), so keyboard and menu cannot drift — a new action or a
bugfix is live on both surfaces at once. Add actions to the catalog, never to one surface.

Executors read their instances from `useGameInstance.getState()`. This hook layer decides
*which* action fires and *what it targets*; it never touches `yDoc`/`player` directly.

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

`HotkeyScope.Board` ↔ `HotkeyScope.PileViewer`, switched on modal state via
`react-hotkeys-hook`'s `<HotkeysProvider>` (owned by `GameHotkeysManager`).

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
