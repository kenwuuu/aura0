Top-level application composition under the screaming-architecture layout.

- `main.ts` — entry point; Sentry/PostHog init, then `bootstrapGame()` + single `createRoot(<App/>)`.
- `bootstrap.ts` — `bootstrapGame()`: wires the imperative game singletons (`Y.Doc`, networking,
  `Player`, `MultiPlayerBoardManager`, `GameResourcesDock`, services) in dependency order, populates
  Zustand stores, and returns a `GameContext` for `App.tsx`. Deck domain logic lives in
  `features/deck-manager/deckLoading.ts`; room-link copy lives in `features/room/setupRoomLinkCopy.ts`.
- `App.tsx` — single React tree; fixed-position overlays as direct children, index.html toolbar
  slots rendered via `createPortal` into their existing mount points.
- `ToolbarButtons.tsx` — small toolbar-button components (Help, Hotkeys, Discord) rendered via
  portals into `#help-root`, `#hotkeys-root`, `#discord-root`.

**Deferred (Phase 6):** `index.html` still retains its hard-coded mount-point divs (`#deck-manager-root`,
`#connection-status`, etc.) which `App.tsx` targets with portals. When Phase 6 replaces the
whiteboard, restructure `index.html` down to a single `<div id="root">` and let `<App>` render the
entire toolbar/layout (board + dock via refs), dropping the portal indirection.
