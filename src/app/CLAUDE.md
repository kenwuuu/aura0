Top-level application composition.

- `main.ts` — entry point; Sentry/PostHog init, then `bootstrapGame()` + single `createRoot(<App/>)`.
- `bootstrap.ts` — `bootstrapGame()`: wires the imperative game singletons (`Y.Doc`, networking,
  `Player`, services) in dependency order, populates Zustand stores, and returns
  a `GameContext` for `App.tsx`. Deck domain logic lives in `features/deck-manager/deckLoading.ts`.
- `App.tsx` — single React tree; toolbar + battlefield + overlays as direct children, no portals.
- `Toolbar.tsx` — the top menu bar. Composes deck import, Hotkeys/Help/Discord, connection
  status, and the room-link button; owns the responsive collapse into a "⋯ More" overflow menu
  below the `sm` breakpoint (CSS-first — see the "Toolbar responsive collapse" block in
  `src/style.css`).
- `AnnouncementModal.tsx`, `HelpModal.tsx`, `PatchNotesModal.tsx` — app-shell
  modals mounted at the app root. First-run guidance is no longer a modal — it's the
  onboarding tour (`features/onboarding/`), which replaced `WelcomeModal`.
- `stores/` — Zustand stores (`gameInstanceStore`, `hotkeyStore`, `playerStore`, `settingsStore`,
  `settingsModalStore`). These import from features/infrastructure so live here, not in `shared/`.
- `content/` — markdown source for help, announcement, and patch-note modals.
