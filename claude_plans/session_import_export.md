# Session Import / Export — Implementation Plan

Export a live game to a file, import it on new devices, and let each player reclaim
their seat. Only *what card and where* is exported; images, oracle text, and type
lines are re-fetched on import. User settings and app state are never exported.

---

## Three constraints found during design

These shape the whole design. Each is a trap that would produce a silently broken
feature, and each has a test in the plan below whose job is to keep it fixed.

1. **`whenSynced()` resolves on IndexedDB only, not remote sync.**
   See the contract on `YjsNetworkProvider.whenSynced` (`YjsNetworkFactory.ts:26-31`)
   and its implementation (`WebsocketProvider.ts:95-97`). A player opening the invite
   link has an *empty* doc at the moment bootstrap would ask "what seats exist?" —
   remote data lands milliseconds to seconds later. The joining player therefore
   cannot detect an imported room by inspecting the doc.
   → **The invite URL carries `&resume=1`.** That flag, not the doc, is what tells
   bootstrap to wait for seats instead of booting a fresh player.

2. **`autoLoadDeckOnStart` would wipe the import.**
   `bootstrap.ts:159` → `deckLoading.ts:74-82`: any room not in `aura-visited-rooms`
   is treated as new, and auto-load calls `player.reset()` + `loadNewDeck`. An
   imported room is always a brand-new room id.
   → **Import writes the new room into `aura-visited-rooms` before navigating**, so
   `roomManager.isRecentRoom()` is already true on the next boot. This reuses the
   existing "not a fresh room" semantics rather than adding a second flag, and has
   the bonus that `roomDocStorage`'s adoption pass recognises the room too
   (`roomDocStorage.ts:138-146`).

3. **`Player`'s constructor overwrites name and color from localStorage.**
   `Player.ts:97-103` unconditionally re-seeds `YSTATE_PLAYER_NAME` /
   `YSTATE_PLAYER_COLOR` from the local device on every boot.
   → This is **correct and intentional** for our flow: the human sitting at the new
   device owns their display name. The snapshot's stored name is used only to *label
   the seat in the picker* ("you were Alice"), never as authoritative state. Do not
   "fix" this by making import win.

---

## Flow

Only **one file** ever changes hands. The second player needs nothing but a link.

```
Player A (old device)                    Player B (old device)
   │ Save game to file
   ▼
 aura-game-mtg-a1b2c3d-2026-07-25.json
   │
   │  (email / Discord / USB — user's problem)
   ▼
Player A (new device)
   │ Load saved game… → picks a seat ("I was Alice")
   │ mint new room id, write seat alias, mark room visited,
   │ stash snapshot in sessionStorage, navigate
   ▼
 ?room=mtg-x9y8z7w&resume=1
   │ bootstrap: rehydrate card data, write doc, THEN construct Player
   ▼
 game restored ── copy room link ──────────► Player B (new device)
                                                │ opens link, sees seat screen
                                                │ picks "Bob"
                                                ▼
                                             game restored via WebRTC
```

Player B pays no lookup cost — they receive the fully hydrated doc over the wire.

---

## Phase 0 — extract `listSeats` (prerequisite)

Seat enumeration is currently duplicated verbatim in `usePlaymatNodes.ts:36-44` and
`usePlaymatNodes.ts:191-199`, including the `YSTATE_REMOVED` skip and the
`joinedAt` ordering. Export needs a third copy — which is the signal to extract it
now rather than ship a fourth.

**New — `src/features/player/listSeats.ts`**

```ts
export interface Seat {
  playerId: string;
  joinedAt: number;
  map: Y.Map<any>;
}

/**
 * Every live seat in the doc, oldest first — the single definition of "who is in
 * this game". Removed (kicked) seats are skipped: Yjs cannot delete a top-level
 * type, so their map lingers forever and only this filter keeps them out of the
 * playmat, the export, and the seat picker alike. See removePlayer.ts.
 */
export function listSeats(yDoc: Y.Doc): Seat[]
```

Rewrite both `usePlaymatNodes` call sites to use it. Behavior must not change —
the existing playmat tests are the proof.

---

## Phase 1 — per-room seat identity

The core insight: **player identity becomes resolvable per room.** Nothing about
`ownerId` semantics changes anywhere in the app; only the resolution point moves.

**Edit — `src/infrastructure/networking/persistence.ts`**

```ts
const SEAT_PREFIX = 'aura:seat:';
const seatKey = (roomName: string) => `${SEAT_PREFIX}${roomName}`;

/**
 * The player id this device plays as *in this room*.
 *
 * Normally the device's own id. But a game restored from a file keeps the seat
 * ids it was exported with — every `ownerId`, token `attachedTo`, and action-log
 * `actorId` in the snapshot references them — so the device claiming that seat
 * adopts its id here rather than rewriting the entire doc. One indirection at
 * boot replaces a rewrite of every id in the game.
 */
export function resolvePlayerIdForRoom(roomName: string): string {
  return localStorage.getItem(seatKey(roomName)) ?? getOrCreatePlayerId();
}

export function getSeatAlias(roomName: string): string | null;
export function setSeatAlias(roomName: string, seatId: string): void;
export function clearSeatAlias(roomName: string): void;
```

`clearPersistedSession()` gains a prefix sweep so "start fresh" clears aliases too.

**Edit — `src/app/bootstrap.ts:80`**

```ts
const roomManager = new RoomManager();
const roomName = roomManager.getRoomName();
const playerId = resolvePlayerIdForRoom(roomName);   // was getOrCreatePlayerId()
```

Note the reorder: `roomName` must be resolved *before* `playerId`. The tab lock at
`bootstrap.ts:91` then keys off the aliased id, which is correct — two tabs on the
same seat are still duplicates.

---

## Phase 2 — snapshot schema + export (pure)

**New — `src/constants.ts` additions**

```ts
// Import provenance + the seat roster a restored game was created with. Written
// once at import and never mutated; presence of this map is what makes a room a
// "resumed" game rather than a fresh one.
export const YDOC_SESSION = 'session';
// seatId -> peerId of whoever claimed it. A Y.Map (not an array on YDOC_SESSION)
// so two players claiming two *different* seats never conflict — per-key
// last-write-wins is exactly the semantics we want here.
export const YDOC_SEAT_CLAIMS = 'seat-claims';
```

**New — `src/features/session-transfer/sessionSnapshot.ts`** (types + pure mappers,
no I/O, no Yjs)

```ts
export const SESSION_SCHEMA_VERSION = 1;

/** A card reduced to identity + position. Everything else is re-fetched. */
export interface CardRef {
  id: string;            // preserved: token `attachedTo` points at these
  name: string;          // the rehydration key (see Phase 3)
  scryfallId?: string;   // exact printing; unused today, see Phase 3 note
  cardNumber: number;
  commander?: boolean;
  isToken?: boolean;     // derived from the `token-` id prefix (ids.ts:10)
  // Board cards only — a card in a pile has no meaningful position:
  x?: number; y?: number; zIndex?: number; rotation?: number;
  isTapped?: boolean; isFlipped?: boolean; isSick?: boolean;
  counters?: number[];
  ownerId?: string;
}

export interface SeatSnapshot {
  seatId: string;        // the original playerId, verbatim
  name: string;          // label for the seat picker only — never restored as state
  color: string;
  joinedAt: number;
  health: number;
  customCounters: CustomCounter[];
  deckRevealCount: number;
  allowViewHand: boolean;
  zones: Record<'deck'|'hand'|'discard'|'exile'|'scry'|'sideboard', CardRef[]>;
}

export interface SessionSnapshot {
  schemaVersion: number;
  exportedAt: number;
  roomName: string;      // provenance for the filename and the import preview
  seats: SeatSnapshot[];
  board: CardRef[];
  tokens: KeywordToken[];      // verbatim: local asset paths + colors, no external data
  actionLog: ActionLogEntry[]; // last N; actorIds resolve against seatIds
}

export function toCardRef(card: Card, opts?: { board?: boolean }): CardRef;
export function fromCardRef(ref: CardRef, hydrated: Partial<Card>): Card;
```

**New — `src/features/session-transfer/exportSession.ts`**

```ts
export function exportSession(yDoc: Y.Doc, roomName: string): SessionSnapshot
```

Walks `listSeats(yDoc)`, `YDOC_CARDS_ON_BOARD`, `YDOC_KEYWORD_TOKENS`, and the tail
of `YDOC_ACTION_LOG`. Pure — a `Y.Doc` in, a plain object out, trivially testable.

**New — `src/features/session-transfer/downloadSnapshot.ts`**

`Blob` + object URL + a synthetic anchor click. Filename:
`aura-game-<roomName>-<YYYY-MM-DD>.json`.

---

## Phase 3 — import: rehydrate + write

**New — `src/features/session-transfer/importSession.ts`**

```ts
export interface ApplyResult {
  /** Card names the lookup could not resolve. They are still placed — with a name
   *  and no art — because losing a card silently is worse than losing its image. */
  unresolved: string[];
}

export async function applySessionSnapshot(
  yDoc: Y.Doc,
  snapshot: SessionSnapshot,
  lookup: CardLookupService,
  onProgress?: (done: number, total: number) => void,
): Promise<ApplyResult>
```

**Rehydration strategy — by name, deliberately.** `fetchCardById` goes straight to
Scryfall by design (`cards/CLAUDE.md`), throttled to 2 req/s (`clients.ts:26`) —
200 unique cards would take 100 seconds. `fetchImagesForList` hits Aura at 200/s
with automatic Scryfall fallback and is the exact path deck import already uses.

1. Dedupe every `CardRef` across every zone by name → one `DeckLineItem` each.
2. **Except `isToken` refs**, which go through `fetchCardById(scryfallId)`
   individually. A name lookup for "Treasure" or "Clue" can resolve to a real card
   instead of the token; there are only ever a handful of tokens on a board, so the
   slow path is affordable there and nowhere else.
3. Build `Map<name, hydrated>` (+ `Map<scryfallId, hydrated>` for tokens).
4. Write **in one `yDoc.transact`** — one undo step, one observer rebuild, matching
   the reasoning already documented in `removePlayer.ts:62`.
   - each seat's `YDOC_PLAYER(seatId)` map: all six zones, health, counters, name,
     color, `joinedAt`, `deckRevealCount`, `allowViewHand`, and
     **`YSTATE_DECK_CARD_COUNT`** (the visible deck count — easy to forget, and the
     round-trip test in the test plan is what catches it)
   - `YDOC_CARDS_ON_BOARD`, `YDOC_KEYWORD_TOKENS`, `YDOC_ACTION_LOG`
   - `YDOC_SESSION` = `{ schemaVersion, importedAt, seatIds }`
   - `YDOC_SEAT_CLAIMS` = the importer's own seat

`scryfallId` is exported and carried but unused for non-token rehydration today.
It costs 38 bytes per card and buys exact-printing fidelity the day the Aura
backend grows a bulk-by-id endpoint — at which point this becomes a one-function
change with no schema migration.

**New — `src/features/session-transfer/pendingImport.ts`**

The hand-off across the navigation:

```ts
/**
 * sessionStorage, not localStorage: a pending import is scoped to this tab and
 * this navigation. If the import screen is closed mid-flight, the snapshot dies
 * with the tab instead of haunting every future boot of that room.
 */
export function stashPendingImport(roomName: string, snapshot: SessionSnapshot): void;
export function takePendingImport(roomName: string): SessionSnapshot | null;  // read + delete
export function hasPendingImport(roomName: string): boolean;
```

**New — `src/features/session-transfer/startImport.ts`** — the pre-navigation half:

```ts
export function startImport(snapshot: SessionSnapshot, seatId: string): void {
  const roomName = ROOM_PREFIX + randomIdSuffix(7);
  setSeatAlias(roomName, seatId);
  markRoomAsVisited(roomName);       // constraint #2 — must precede navigation
  stashPendingImport(roomName, snapshot);
  window.location.assign(`?room=${roomName}&resume=1`);
}
```

`markRoomAsVisited` becomes a standalone export on `RoomManager` (it currently only
exists as an instance method for the *current* room, `RoomManager.ts:57`).

---

## Phase 4 — bootstrap gates

Three new decisions, all in the seam between `whenSynced()` (`bootstrap.ts:131`)
and `new Player(...)` (`bootstrap.ts:134`) — the same seam `restoreDeckForRoom`
already occupies, and for the same reason the comment there gives.

```ts
await yjsNetworkProvider.whenSynced();

// ── 5a. Apply a pending import ────────────────────────────────────────────
// Before Player, which seeds defaults into a doc that looks empty. An import
// that landed after Player construction would be racing its own defaults.
const pending = takePendingImport(roomName);
if (pending) {
  useSessionImportStore.getState().begin(pending);
  const { unresolved } = await applySessionSnapshot(yDoc, pending, cardLookup, onProgress);
  useSessionImportStore.getState().finish(unresolved);
}

// ── 5b. Seat selection ────────────────────────────────────────────────────
// Only for a link flagged `resume=1` (constraint #1: the doc is empty here, so
// the flag is the only reliable signal), and only if this device has not
// already claimed a seat in this room.
else if (isResumeLink() && !getSeatAlias(roomName)) {
  return { status: 'seat-selection', roomName, yDoc, yjsNetworkProvider };
}

const restoredDeck = DeckPersistenceService.restoreDeckForRoom(roomName);
const player = new Player(playerId, yDoc, restoredDeck, { initialHealth: 40 });

// ── 5c. Record the claim ──────────────────────────────────────────────────
// Written here, post-reload, rather than on the picker screen: a claim written
// immediately before `location.reload()` may not survive the IndexedDB flush.
if (getSeatAlias(roomName)) claimSeat(yDoc, playerId, peerId);
```

`BootstrapResult` gains a variant:

```ts
| { status: 'seat-selection'; roomName: string; yDoc: Y.Doc;
    yjsNetworkProvider: YjsNetworkProvider }
```

The doc and provider stay live so the picker can observe incoming claims — this is
why the gate returns a handle rather than tearing down.

**Edit — `src/app/main.ts`**, extending the existing `boot()` switch:

```ts
if (result.status === 'seat-selection') {
  root.render(React.createElement(SeatSelectionScreen, {
    yDoc: result.yDoc,
    roomName: result.roomName,
    onClaim: (seatId) => { setSeatAlias(result.roomName, seatId); window.location.reload(); },
    onJoinAsNew: () => { setSeatAlias(result.roomName, getOrCreatePlayerId()); window.location.reload(); },
  }));
  return;
}
```

Reload rather than re-entering `boot()`: the doc and providers are already live at
this point and must be torn down. The app already uses exactly this move for the
tab-takeover path (`bootstrap.ts:101-104`).

"Join as a new player" writes the device's *own* id as the alias. That is a no-op
for identity but marks the room as decided, so the picker never re-fires.

**New — `src/features/session-transfer/sessionImportStore.ts`** — a small Zustand
store (`phase`, `done`, `total`, `unresolved`) so the progress screen can render
without threading a callback through `bootstrapGame`. It lives in the feature, not
`app/stores/`, because only this feature and its own screen touch it — consistent
with `app/CLAUDE.md`'s "no domain logic in app/".

---

## Phase 5 — the seat selection screen

**New — `src/features/session-transfer/SeatSelectionScreen.tsx`**

Follows `DuplicateTabNotice.tsx` — the existing precedent for a full-viewport
pre-game screen: no Radix, no app chrome, self-contained styles, because it renders
before the game tree exists.

### Three states, one component

| State | When | Shows |
|---|---|---|
| `waiting` | `resume=1`, no `YDOC_SESSION` yet | "Connecting to the game…" + spinner |
| `choosing` | `YDOC_SESSION` present | the seat list |
| `unreachable` | 15s elapsed in `waiting` | "Couldn't reach the other player" + Retry + join-as-new |

The `waiting` state is not a nicety — it is the direct consequence of constraint #1.
The doc arrives over WebRTC after boot, so the screen must be built to open empty
and fill in.

### Layout (`choosing`)

```
┌──────────────────────────────────────────┐
│                                          │
│            Resume your game              │
│   Saved 25 Jul · 2 players · 214 cards   │
│                                          │
│   Which seat is yours?                   │
│                                          │
│   ┌────────────────────────────────────┐ │
│   │ ●  Alice                           │ │
│   │    97 in deck · 7 in hand · 40 life│ │
│   └────────────────────────────────────┘ │
│   ┌────────────────────────────────────┐ │
│   │ ●  Bob                      Taken  │ │   ← disabled, claimed
│   │    94 in deck · 6 in hand · 33 life│ │
│   └────────────────────────────────────┘ │
│                                          │
│   ─────────────────────────────────────  │
│   Neither — join as a new player         │   ← quiet text button
│                                          │
└──────────────────────────────────────────┘
```

### Design rules

- **One button per seat.** The color swatch is `YSTATE_PLAYER_COLOR` from the
  snapshot, so a player recognises their seat by the color they have been staring
  at all game — faster than reading a name they may have never set.
- **The zone counts are the real identifier.** Names are often defaults
  (`player-a1b2c3d` sliced), so "97 in deck · 7 in hand · 40 life" is what actually
  lets someone recognise their own board state.
- **Claimed seats stay visible, disabled, labeled "Taken"** — never hidden. A seat
  vanishing mid-decision is disorienting; a seat greying out explains itself.
- **Live.** Subscribes to the real `YDOC_SEAT_CLAIMS` map, so when the other player
  claims theirs it greys out in place with no refresh.
- **The escape hatch is mandatory, not optional.** A third friend joining a resumed
  game is a completely normal thing to do, and without "join as a new player" the
  link is a trap that hands them somebody else's cards.
- **Accessibility:** a `<ul>` of `<li><button>`, each button's accessible name being
  the seat name plus its status, so `getByRole('button', { name: /Alice/ })` works
  and a claimed one is reachable as `{ name: /Bob.*taken/i }`. `aria-live="polite"`
  on the list so a remote claim is announced.

---

## Phase 6 — entry points

- **Toolbar → Actions menu**: "Save game to file" and "Load saved game…".
- **Command palette**: the same two commands registered alongside "Copy game link",
  so both surfaces stay in lockstep (the pattern `copyRoomLink.ts:5-8` already
  establishes for shared actions).
- **Settings → "Change seat"**: calls `clearSeatAlias(roomName)` + reload, which
  re-shows the picker. This is the recovery path for a mis-claim (see Risks).

**New — `src/features/session-transfer/ImportSessionModal.tsx`**: file picker →
parse → validate → preview ("2 players, Alice and Bob, saved 25 Jul") → seat
choice → `startImport`. Refuses a `schemaVersion` newer than the build with a plain
message rather than partially applying it.

Sharing needs **no new UI**: `copyRoomLink` copies `window.location.href`
(`copyRoomLink.ts:53`), and the post-import URL already carries `&resume=1`.

**Analytics** (matching the repo's existing PostHog habit): `session_exported`
(seat + card counts), `session_imported` (counts, `unresolved` length, duration),
`seat_claimed` (`{ claimed_existing: boolean }`). Import failures to Sentry.

---

## Test plan

### Unit — logic (`*.test.ts`, real `Y.Doc`, per `tests/testing-react.md`)

**`sessionSnapshot.test.ts`** — pure mappers, no doc
- `toCardRef` drops `images` / `oracleText` / `type_line`, keeps identity fields
- board refs carry position + flags; pile refs carry none
- `isToken` is derived from the `token-` id prefix

**`listSeats.test.ts`** — the Phase 0 extraction
- skips seats tombstoned with `YSTATE_REMOVED`; orders by `joinedAt`

**`exportSession.test.ts`** — real `Y.Doc` + real `Player` via `seedGame`
- two seats round-trip with correct per-zone counts
- a removed seat is absent from the export
- board `ownerId` survives
- **token `attachedTo` still names an exported card id** — referential integrity is
  the property most likely to break silently under refactor
- an empty doc exports zero seats without throwing

**`importSession.test.ts`** — real `Y.Doc`, `CardLookupService` from `src/test/mocks/`
- **a `Player` constructed after import does not reseed** (assert hand length is the
  imported one, not `[]`) — the guard for the Phase 4 ordering trap
- `YSTATE_DECK_CARD_COUNT` matches the imported deck length
- an unresolved name still produces a placed card, and is reported in `unresolved`
- token refs go through `fetchCardById`; non-token refs go through
  `fetchImagesForList` — asserted on the mock's call shape, because taking the slow
  Scryfall path for 200 cards is a 100-second regression that no count assertion
  would catch
- **one transaction**: attach a `yDoc.on('afterTransaction')` counter, assert 1
- applying the same snapshot twice is idempotent

**`sessionRoundTrip.test.ts`** — the highest-value test in the suite
- `exportSession(docA)` → `applySessionSnapshot(docB, …)` with a lookup stub that
  echoes names back → `exportSession(docB)` deep-equals the original modulo
  `exportedAt`.
- One test that fails the moment anyone adds a field to player state and forgets to
  carry it through either direction. Every "we forgot to export X" bug is this test.

**`seatIdentity.test.ts`** — `persistence.ts`
- `resolvePlayerIdForRoom` returns the alias when set, the global id otherwise
- aliases are per-room and do not leak between rooms
- `clearPersistedSession` sweeps `aura:seat:*`

**`startImport.test.ts`**
- **marks the new room visited before navigating** — the direct guard for
  constraint #2; assert `aura-visited-rooms` contains the new room id
- writes the alias and the pending snapshot under the *new* room name
- navigates to a URL carrying both `room` and `resume=1`

### Unit — component (`*.test.tsx`, RTL, following `CardPreview.test.tsx`)

**`SeatSelectionScreen.test.tsx`** — real `Y.Doc`, accessible queries only
1. one button per seat, each named by its seat name
2. a seat already in `YDOC_SEAT_CLAIMS` renders disabled and named as taken
3. picking a seat calls `onClaim` with that seat id (assert the callback — never the
   reload)
4. "join as a new player" calls `onJoinAsNew`
5. **a claim written to the real `YDOC_SEAT_CLAIMS` map while the screen is open
   disables that seat** (`await screen.findByRole(...)`) — the observer-wiring test
6. `waiting`: renders the connecting message when `YDOC_SESSION` is absent
7. `unreachable`: after the timeout (`vi.useFakeTimers`, with
   `userEvent.setup({ advanceTimers })`), retry and join-as-new are offered

**`ImportSessionModal.test.tsx`**
- a well-formed file shows the preview with both seat names
- a malformed file shows an error and does not navigate
- a `schemaVersion` newer than the build is refused by name, not silently applied

Drive the file input with `userEvent.upload` and a synthetic `File`, queried via
`getByLabelText` — no `container.querySelector` (banned, `testing-react.md` rule 1).

### E2E (Playwright — harness-first, `docs/testing/e2e.md`)

**Harness additions first** (rule 2 — a spec must never invent a selector):
- `selectors.ts`: `seatSelection`, `seatOption`, `sessionExport`, `sessionImport`
- `pageObjects.ts`: `seatSelectionScreen(page)`, `seatOption(page, name)`
- `interactions.ts`: `exportSessionToFile(page): Promise<string>` (wraps
  `waitForEvent('download')` → `download.path()`), `importSessionFile(page, path)`
- `scenarios.ts`: `resumeGameFromExport(page)` — export, new room, import, claim, in
  one line

**Specs — `tests/e2e/app/session/`**

1. `export_import.spec.ts` — **the round trip.** Play a card to the board, move one
   to discard, export, start a new game, import, claim the seat → the board card is
   back, and discard/hand/deck counts match. This is the spec that proves the
   feature works at all.
2. `seat_selection.spec.ts` — two contexts, real WebRTC. A imports; B opens A's URL
   (which carries `resume=1`), gets the picker, claims the other seat. Assert
   `waitForSync(page, 2)` on both, and that **B's hand is the imported hand, not a
   fresh 8** — the assertion that would catch a seat alias silently not applying.
3. `import_does_not_autoload.spec.ts` — the regression guard for constraint #2: after
   import the hand is the imported one, not the default deck's opening eight. Verify
   it fails when the `markRoomAsVisited` call is removed; a guard nobody has seen
   fail is not yet a guard.

**Not `@smoke`.** Per rule 8, these start advisory in `app/` and get promoted only
after they have proven their flake rate. Downloads need `acceptDownloads` on the
context; no hover-sensitive interaction is involved, so plain clicks are fine here.

---

## Sequencing

| # | Phase | Files | Est. |
|---|---|---|---|
| 0 | `listSeats` extraction | 1 new, 2 edits, 1 test | 0.5h |
| 1 | Seat identity | `persistence.ts`, `bootstrap.ts`, 1 test | 0.5h |
| 2 | Schema + export | 3 new, 2 tests | 2h |
| 3 | Import + rehydration | 3 new, 2 tests | 3h |
| 4 | Bootstrap gates | `bootstrap.ts`, `main.ts`, 1 store | 2h |
| 5 | Seat screen | 1 new, 1 test | 2h |
| 6 | Entry points + modal | 2 new, menu edits, 1 test | 2h |
| 7 | E2E harness + 3 specs | 4 edits, 3 new | 3h |

**~2 focused days, ~900 LOC including tests.** Phases 0–3 are independently
shippable and testable behind no flag at all (nothing calls them yet), so the risky
integration work in Phase 4 lands on top of already-green foundations.

---

## Size

A stripped `CardRef` is ~110 bytes against the ~1.1 KB of a full hydrated `Card`.
Two 100-card decks plus board and tokens is **~25 KB**, ~35 KB pretty-printed —
small enough to paste as text if a file picker is inconvenient on mobile.

---

## Risks and accepted limitations

- **Concurrent claim race.** Two players clicking the same seat within the same
  couple of seconds both get it (per-key LWW). Not worth a locking protocol for two
  friends coordinating over voice chat — mitigated by the live-greying list, and made
  non-fatal by Settings → "Change seat".
- **Name-based rehydration loses the exact printing.** Alternate art may come back
  as the default printing. Accepted per the brief (images are re-retrievable);
  `scryfallId` is already in the schema for the day a bulk-by-id endpoint exists.
- **The file contains both players' hands.** Same trust model as the live doc, where
  every peer already replicates everything — but a file persists and gets forwarded.
  One sentence in the export dialog, not a technical control.
- **`resume=1` lingers in the room URL.** Benign: the gate is alias-guarded, so it
  only ever fires for a device that has not yet decided.
- **N players, not 2.** Nothing in the schema, the picker, or the claim map is
  two-player specific; a three-player pod exports and restores on the same path.
