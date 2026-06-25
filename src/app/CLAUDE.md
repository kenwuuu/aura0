Top-level application composition.

- `main.ts` — entry point; Sentry/PostHog init, then `bootstrapGame()` + single `createRoot(<App/>)`.
- `bootstrap.ts` — `bootstrapGame()`: wires the imperative game singletons (`Y.Doc`, networking,
  `Player`, `GameResourcesDock`, services) in dependency order, populates Zustand stores, and returns
  a `GameContext` for `App.tsx`. Deck domain logic lives in `features/deck-manager/deckLoading.ts`.
- `App.tsx` — single React tree; toolbar + battlefield + overlays as direct children, no portals.
- `ToolbarButtons.tsx` — toolbar button components (Help, Hotkeys, Discord).
- `WelcomeModal.tsx`, `AnnouncementModal.tsx`, `HelpModal.tsx`, `PatchNotesModal.tsx` — app-shell
  modals mounted at the app root.
- `stores/` — Zustand stores (`gameInstanceStore`, `hotkeyStore`, `playerStore`, `uiStore`). These
  import from features/infrastructure so live here, not in `shared/`.
- `content/` — markdown source for help, announcement, and patch-note modals.
