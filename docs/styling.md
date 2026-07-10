# Styling conventions

Aura's visual system is **Manabase** — HUD-inspired, dark-only: hairline borders,
translucent panels, purple energy, monospace tabular numbers, glow-as-elevation.
Spec: `design_handoff_manabase/README.md` (token values are final);
brief: `design_handoff_manabase/DESIGN_SYSTEM.md`.

## The three tiers

1. **Tokens — `src/tokens.css`.** The single source of truth and the **only place
   chrome hex/rgba literals may live**. Tokens feed the Tailwind theme
   (`@theme inline` in `src/style.css`) and the shadcn slots, so they are
   available three ways: as utilities (`bg-surface`, `border-line-2`,
   `text-dim`, `text-danger`), as shadcn semantics (`bg-popover`,
   `text-muted-foreground`), and as raw `var(--*)` in CSS.
2. **Component styling — Tailwind utilities in the `.tsx`.** The default for all
   new and reworked components. Use `cn()` for conditional classes and cva for
   variants (see `src/shared/ui/button.tsx`).
3. **Escape hatches.**
   - A colocated `*.module.css` when real CSS is genuinely better: keyframes,
     complex pseudo/child selectors, media-query blocks, third-party overrides.
   - Inline `style={{ }}` **only for dynamic runtime values** (rotation angles,
     drag positions, user-picked colors) — never for static appearance.

`src/style.css` is legacy-global CSS shrinking toward genuinely global concerns
only (reset, fonts, scrollbars, safe-area, third-party overrides). Don't add
component styles to it.

## Rules

- **No hex/rgba literals outside `src/tokens.css`.** New surfaces reference
  tokens. (Exemptions: user data colors like `token.backgroundColor`, mana
  identity via `--mana-*`, SVG data-URIs that can't read vars.)
- **Dark-only.** There is no light theme and never will be — don't fork values
  on `.dark`, don't add theme toggles.
- **Hairline over fill.** If a border will do, don't add a background. Panels
  are `--surface`/`--bg-2` with `--line`/`--line-2` hairlines.
- **Elevation = glow, not shadow.** Focus/active states use `--glow` /
  `--glow-strong`. Real shadows (`--shadow-sheet`) are reserved for surfaces
  that leave the plane: menus, dialogs, floating panels.
- **Numbers are mono + tabular.** Every game count (life, deck, discard, exile)
  uses `--font-mono` with `font-variant-numeric: tabular-nums` (`.mono-num`),
  so digits never shift as values tick. Labels: mono, uppercase, letterspaced.
- **Mana colors (`--mana-*`) are data, never chrome** — pips, filters, log tags
  only. Never on buttons or panels.
- **Motion:** micro-interactions 120–180ms with `--ease-hud`; save intensity for
  game events. Don't over-animate ambient UI.
- **Radius:** 2px chips · 4px controls/panels (default) · 6px medium · 8px large.
  Sharp, not soft.
- **Purple is the only brand energy.** `--accent-2` (blue) and `--accent-pink`
  are rare, deliberate exceptions.
- **Naming collision to know about:** the Manabase brand purple owns the
  `--accent` custom property. The *shadcn* semantic accent (hover wash on menu
  rows) is mapped to `--accent-soft` — so Tailwind's `bg-accent` gives you the
  wash, and `bg-primary`/`text-primary` give you solid purple.
- **Never rename DOM classes/ids/testids/aria-labels while restyling** — the
  e2e harness selects on them (`.pile-count`, `.deck-pile-viewer-grid`,
  role/name lookups like "Draw").

## Migration status

The reskin lands in stacked PRs (tokens/foundations → chrome → board → players).
Until a surface has migrated, its legacy hardcoded styles are expected; retoken
in place when you touch one — don't convert it between styling systems as a
drive-by.
