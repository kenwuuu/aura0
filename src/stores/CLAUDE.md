Zustand stores for global UI state: `gameInstanceStore`, `hotkeyStore`, `playerStore`, `uiStore`.
Game-state mutations belong in Yjs (via Player/Whiteboard); these stores are for UI-only concerns like modal open/close and hotkey context.
