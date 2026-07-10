# design-sync notes — pre-seeded 2026-07-10 before first run

Handoff from the session that did the Manabase redesign (PRs #33→#34→#35→#37→#38).
No sync has run yet; the user deferred the first high-fidelity run. These are
repo facts to save the first run its discovery cycles.

## Target-project constraints (decided with the user)

- **Create a NEW project.** Two projects already exist on this account — do NOT
  sync into either:
  - "Manabase Design System" (`8a8b6154-7db5-4bc8-a53a-d68903e3bec6`) — a
    hand-authored @dsCard card gallery (human spec reference). User decided to
    KEEP it alongside the synced project. Its name is TAKEN — pick a
    non-colliding name (e.g. "Aura Components" / "Manabase Components").
  - "Magic the Gathering web app" (`941c34ad-…`) — a REGULAR project (not
    design-system type, immutable); holds the original design source. Never a
    target.

## Branch / worktree — IMPORTANT

- The redesigned component styling lives on the **stacked PR branches**, not on
  `staging`/`master` yet (merge order #33→#34→#35→#37→#38). Running the sync
  from `staging` would bundle the OLD look. Run from the redesign worktree
  (`.claude/worktrees/redesign`, branch `redesign/5-gallery` or later) — or
  wait until the stack merges.

## Shape & scope

- **No Storybook anywhere** (no `.storybook/`, no `*.stories.*`) → package shape.
- This is an **app repo, not a component-library package**: no library `dist/`,
  no exports map. Components must be bundled from source. Scope suggestion
  (agreed with user): `src/shared/ui/*.tsx` (shadcn set: button, dialog,
  dropdown-menu, popover, select, checkbox, input, tooltip, scroll-area,
  slider, alert, sonner) + `HudIconButton.tsx` + `FloatingPanel.tsx`. Exclude
  `useDraggablePanel.ts` (hook) and feature components.
- Path alias `@/` → `src/` (vite + tsconfig) — the esbuild bundle step needs
  the alias configured. `cn()` lives at `@/shared/utils/utils`.
- Radix (`@radix-ui/*`), `class-variance-authority`, `lucide-react`, `sonner`
  are the runtime deps of these components.

## Styling pipeline — the main conversion risk

- **Tailwind v4, CSS-first. There is NO tailwind.config.js.** Theme lives in
  CSS: `src/tokens.css` (all primitives + shadcn slot derivation; single
  source of truth) and the `@theme` / `@theme inline` blocks in `src/style.css`
  (font vars + `--color-*` / `--radius-*` mappings that make utilities like
  `bg-surface`, `border-line-2`, `text-dim`, `rounded-md=4px` exist).
- `src/style.css` ALSO contains ~900 lines of app-global chrome CSS (toolbar,
  piles, hand…) that does NOT belong in a component bundle. For `styles.css` /
  `_ds_bundle.css`, build a dedicated entry: `@import "tailwindcss";` +
  `@import "./tokens.css";` + a copy of style.css's `@theme` blocks, run
  through Tailwind v4 (only `@tailwindcss/vite` is installed; `npx
  @tailwindcss/cli` may need adding) scanning just the scoped component
  sources.
- `tw-animate-css` is imported for shadcn open/close animations
  (`animate-in`/`animate-out`).
- **Fonts are self-hosted via @fontsource and imported in `src/app/main.ts`
  (JS imports, not CSS)** — Space Grotesk 300/400/500/600 + Space Mono 400/700.
  The DS `styles.css` closure needs its own font strategy (fontsource css
  files copied into `fonts/`, or the Google Fonts pattern used in the
  hand-made gallery cards).

## Wrapping / setup facts (conventions-header material)

- **No provider is required.** Components need: `tokens.css` loaded, the app is
  **dark-only** (`<html class="dark">` exists but values don't fork on it),
  near-black `--bg` background, and `font-family: var(--font-sans)`.
  Previews on a white background will look broken — always render on
  `var(--bg)`.
- `sonner.tsx` exports a `<Toaster>` that must be mounted to show toasts.
- **Most of the conventions header already exists**: distill from
  `docs/styling.md` (three-tier convention, no-hex rule, utility vocabulary,
  radius scale 2/4/6/8, glow-as-elevation, mono tabular numbers) and
  `design_handoff_manabase/README.md` §01–§06 (exact component specs).

## Repo quirks

- Pre-commit (husky + lint-staged) runs `vitest related` AND
  `scripts/check-no-hex.mjs` (rejects hex/rgba in `src/**` outside
  tokens.css — `.design-sync/`, `ds-bundle/` are unaffected).
- Kill any dev server on :5173 before Playwright work — a stale HMR server
  silently serves old bundles (long-standing repo gotcha).
- `npm ci` (package-lock.json). Node: no .nvmrc; system node 23 works.
- Playwright `reducedMotion` doesn't work in this env — use explicit settle
  waits before screenshots.
