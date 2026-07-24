Top-level application composition — the shell, not the game. Entry point and bootstrap wiring,
the single React tree and the chrome mounted in it (toolbar, root-level modals), the Zustand
stores that cross feature boundaries, and the markdown backing those modals.

No domain logic. If it knows a rule of the game it belongs in a feature — deck loading lives in
`features/deck-manager/`, not in `bootstrap.ts`, even though bootstrap calls it.

**Stores live here rather than `shared/`** because they import from `features/` and
`infrastructure/`, and `shared/` must stay a leaf. A store depending on neither belongs there
instead.

`App.tsx` mounts the shell as direct children. Portals exist (card preview, mobile token tray)
but each escapes to `<body>` for a specific reason — a clean z-index comparison against Radix's
dialog portal, or covering the whole screen — not as the default way to add a surface.

Toolbar responsive collapse (the "⋯ More" overflow below `sm`) is **CSS-first** — see the
"Toolbar responsive collapse" block in `src/style.css`, not the component.
