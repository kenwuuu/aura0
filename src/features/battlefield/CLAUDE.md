## Two sync channels

**Yjs document** — durable shared game state. Card/token positions are written here on drag-stop and survive reload. Peers who join late get the full state. Use this for anything that should persist.

**Yjs awareness** — ephemeral, peer-local, never persisted. Each peer has a local state object; updates are broadcast but not retained — a peer who joins after a cursor move never sees it. Use this for "what I'm doing right now": in-flight drag positions, live cursors.

Rule of thumb: *if it should survive a reload or a late-joining peer, it goes in the Yjs doc; if it's transient, it goes in awareness.*

## Why awareness for live drag (not the Yjs doc)

Mid-drag Yjs writes trigger the observer in `useBattlefieldNodes.ts` → `setNodes(buildNodes(...))` rebuild → react-flow's in-flight drag gets clobbered (cards vanished for peers). Awareness bypasses the observer entirely. The `draggingIdsRef` + `nodesWithPeerDrags` mechanism in `useBattlefieldNodes.ts` then merges peer drag positions on top of the Yjs snapshot without touching local drag state.

## Typed awareness shape

All battlefield awareness fields live in `awareness.ts` as `BattlefieldAwareness`. Add new fields there — never add bare `as` casts at call sites.

## Persistence caveat

`setupAwarenessStatePersistence` (persistence.ts) saves local awareness on `beforeunload`. Only identity fields (`name`/`color`) are whitelisted; transient fields (`drag`, `cursor`) are stripped at save time. Never persist a transient field — it would reappear as a phantom on next load and be re-broadcast to peers.
