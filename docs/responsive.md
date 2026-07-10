# Responsive Layout Contract

The rules every surface follows on small screens. Written for the mobile-responsive
refactor (2026-07); feature passes that touch layout must conform to this page or
change it here first.

## One breakpoint

**Phone = viewport narrower than `sm` (640px).** That's the only layout breakpoint.

- CSS: `@media (max-width: 639px)` — the 639 is `sm − 1`, kept in sync **by hand**
  with `BREAKPOINTS.sm` in `src/shared/hooks/breakpoints.ts`. Change one → change both.
- JS: `usePhoneLayout()` from `@/shared/hooks` (defined in `useMediaQuery.ts`).

Tablet and landscape-phone inherit desktop layout; there is deliberately no `md`/`lg`
layout tier. Don't add per-component breakpoints.

## CSS-first for show/hide; JS only for structure

- **Pure visibility** (hide a button, swap a label): plain **unlayered** rules in a
  `@media (max-width: 639px)` block in `src/style.css`. Never Tailwind `sm:`/`hidden`
  utilities on elements that also carry legacy unlayered classes — utilities live in
  `@layer utilities` and lose the cascade to any unlayered rule (see the header
  comment in `src/app/Toolbar.tsx` for the full rationale). Precedent: the
  "Toolbar responsive collapse" block in `style.css`.
- **Structure or behavior** (different component tree, react-flow props, disabling
  drag, clamping a zoom value): branch in JS on `usePhoneLayout()`.

## Viewport units

Full-viewport heights are always the fallback pair, in this order:

```css
height: 100vh;   /* fallback: Safari <15.4, Chrome <108 */
height: 100dvh;  /* tracks visible viewport under mobile browser chrome */
```

Never a lone `100dvh`. Inline styles can't express the pair — use the
`.full-viewport-height` utility in `style.css` instead. No bare `100vw` for
"full width"; use `100%`.

## Safe-area insets

`index.html` sets `viewport-fit=cover` (without it every `env(safe-area-inset-*)`
is 0). Each screen edge has exactly one owner that absorbs its inset:

| Edge   | Owner                                    |
|--------|------------------------------------------|
| top    | `#toolbar` (padding-top)                  |
| bottom | floating hand (`FloatingHand.tsx`)        |
| left   | phone HUD toggle stack (top-left column)  |
| right  | relocated settings/zoom controls (phone)  |

Everything else positions relative to those surfaces and must not add its own inset.

## Phone screen map

```
┌──────────────────────────────┐
│ toolbar (collapsed, ⋯ More)  │  z 1000
├──────────────────────────────┤
│ ⚔  ← game-actions toggle     │  z 40 (HUD band)   ⚙ settings   ← top-right
│ ▤  ← action-log toggle       │                    ± zoom ctrls
│                              │
│           board              │  z 0–10
│                              │
├──────────────────────────────┤
│ hand: full-width, clamped    │  z 950
└──────────────────────────────┘
```

- HUD panels don't float or drag on phone; they expand out of their toggle button
  (button's top-left corner = panel's top-left corner) in a fixed top-left column.
- Settings button + react-flow zoom controls move to the top-right (desktop keeps
  bottom-left).
- The hand is edge-to-edge with its zoom clamped (`effectiveHandZoom`); **hand zoom
  flows only through the `zoomLevel` prop** — never restyle `.hand-card` size in CSS
  without going through that prop, or the JS-computed container height desyncs.
- Modals/dialogs (z 10000+) are unaffected by this map.

Z-bands (unchanged from desktop): board 0–10 · HUD 40 · hand 950 · toolbar 1000 ·
modals 10000+.

## Testing

- Responsive e2e specs set the viewport **per spec** with `page.setViewportSize`
  (see `tests/e2e/app/menu/toolbar_responsive.spec.ts`); shared constants live in
  the harness. The commented-out mobile projects in `playwright.config.ts` stay
  disabled — the desktop suite is tuned for 1920×1080.
- `npm run verify`'s smoke subset does **not** cover responsive layout; run the
  full `npm run test:e2e` after layout changes.
- Unit tests stub `matchMedia` (pattern: `src/shared/hooks/useMediaQuery.test.ts`).
