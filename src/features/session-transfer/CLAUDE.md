Save a game to a file and resume it on new devices.

A snapshot records **which card and where**, never what the card looks like — names, oracle text,
type lines and image URIs are re-fetched on import. That is a ~1.1 KB hydrated card against ~110
bytes stored, so a two-player Commander game is about 25 KB. `sessionSnapshot.ts` owns the format
and is pure; `exportSession.ts` reads a doc into it, `importSession.ts` writes it back.

Only one file ever changes hands. The player who restores it lands in a fresh room and shares the
link; everyone else claims a seat from `SeatSelectionScreen` and receives the game over WebRTC.

## Three constraints, each pinned by a test

**`whenSynced()` resolves on IndexedDB alone** (`YjsNetworkFactory`), so a player opening an invite
link has an *empty* doc at the moment bootstrap must decide whether to offer them a seat. The doc
cannot answer in time — the link does, via `resume=1` (`isResumeLink`). This is also why the seat
picker has a `waiting` state instead of just rendering a list.

**`autoLoadDeckOnStart` resets any room not in `aura-visited-rooms`** (`deck-manager/deckLoading.ts`)
— `player.reset()` plus a fresh opening hand, over the game just restored. Every device in a restore
is seeing that room for the first time, so `claimSeatOnThisDevice` marks it visited. Both the
importing device and every device following the link go through that one function precisely because
the rule was once applied on one path and forgotten on the other.

**Import must run before `Player` is constructed**, which seeds defaults into a doc that looks empty.
Those defaults win the CRDT merge. See bootstrap step 5a.

## Rehydration is by name, not by id

`fetchCardById` is Scryfall-only and capped at 2 req/s, so 200 cards would take 100 seconds against
~2 via `fetchImagesForList`. Names go through `stripBackFace` — a snapshot stores the full Scryfall
name of a double-faced card and neither backend resolves `A // B`.

**MTG tokens are the exception and must go by id**: a name lookup for "Treasure" or "Clue" can
return a real card. `isTokenCard` derives this from the `token-` id prefix.

A card whose name resolves to nothing is still placed, with its name and no art, and reported in
`unresolved`. Losing a card silently changes the game; a card without a picture is visibly wrong and
the player can fix it.

## Picking the right seat is a safety feature

Claiming the wrong seat hands you an opponent's hand — the UI reveals it as if it were yours. So
the picker's job is to make the answer obvious, and the claim reversible.

`seatIdentity.ts` derives what identifies a seat, strongest first: **deck name** (`YSTATE_DECK_NAME`,
written by `Player.loadNewDeck`), then **commander** (public information by the rules of Commander),
then **cards in play** (public during the game). Hand contents are never used — they are the thing
being protected. `SeatIdentityDetails` renders this and is shared by both surfaces that ask the
question, because a seat identifiable on one and not the other is the gap.

**Not board position.** Every client centres its camera on its own mat (`computeLocalMatOrigin`), so
every player experiences themselves as sitting in the same place. "The left seat" is not a memory
anybody has.

When two seats read the same, `isAmbiguous` makes the picker say so rather than letting the rows
look informative. Claiming then takes a second, confirming step, and `ChangeSeatSetting`
(Settings → Profile) undoes it. A seat claimed by *this device's own peer* stays pickable and reads
"Was yours" — locking it would strand the very player trying to correct a mistake.

## Seat identity

Snapshots keep the seat ids they were exported with, because every `ownerId`, token `attachedTo`,
and action-log `actorId` refers to them. `resolvePlayerIdForRoom` (in `infrastructure/networking/
persistence.ts`) resolves identity per room, so one indirection at boot replaces rewriting every id
in the game. Nothing else in the app changes.

`Player`'s constructor still overwrites name and colour from localStorage on every boot. That is
correct — the human at the new device owns their name — so a snapshot's stored name only ever labels
a seat in the picker.
