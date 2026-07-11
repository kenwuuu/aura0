# design-sync notes — Aura Components

**First high-fidelity sync COMPLETE (2026-07-10).**
Project: **"Aura Components"** `24b1b395-dcc8-4851-b62f-e056169dbe52`
(https://claude.ai/design/p/24b1b395-dcc8-4851-b62f-e056169dbe52).
14 components, all with authored previews graded good; render check clean.

## Target-project constraints (still apply)

- This repo syncs to **"Aura Components"** (pinned in config.json). Do NOT sync into:
  - "Manabase Design System" (`8a8b6154-…`) — the separate hand-authored @dsCard
    gallery (human spec reference). Kept alongside on purpose.
  - "Magic the Gathering web app" (`941c34ad-…`) — a REGULAR project (immutable),
    never a target.
- Run from the redesign worktree / a branch that HAS the Manabase styling
  (`feature/redesign` or later). `staging`/`master` may still carry the old look.

## Build recipe — this is an APP repo, not a component library

- **Package shape, synth-entry mode.** No `dist/`, no exports map. The bundle is
  built from a **custom narrow entry** `.design-sync/entry.ts` (re-exports only the
  14 scoped `shared/ui` files + `toast` from sonner) passed via `--entry`. Without
  it the converter would `export *` from EVERY src file and drag in yjs/webrtc/main.ts.
- **Component list** = the 14 pins in `cfg.componentSrcMap`. Sub-parts (DialogContent,
  SelectItem, …) ride in the bundle for composition but get no card.
- **Props**: no shipped `.d.ts`, so `loadDts` finds nothing → props stub to
  `{[key]:unknown}`. Every component's real API is hand-written in `cfg.dtsPropsFor`
  (flows into both `.d.ts` and `.prompt.md`). **Keep these in sync if the source props change.**
- **CSS — the main risk.** Tailwind v4 utilities can't be compiled by esbuild, so
  `.design-sync/build-css.mjs` pre-compiles `.design-sync/tailwind-entry.css`
  (tailwindcss + tw-animate-css + tokens.css + the @theme blocks copied from
  src/style.css, scanning the 14 components + previews) into
  `.design-sync/.cache/ds-tailwind.css`, which `cfg.cssEntry` points at.
  **RE-SYNC: run `node .design-sync/build-css.mjs` BEFORE the converter/driver**
  whenever tokens.css, the components, or previews change. Uses the repo's own
  `@tailwindcss/node` + `@tailwindcss/oxide` (installed as @tailwindcss/vite deps).
- **Fonts** self-hosted via `cfg.extraFonts=[".design-sync/fonts.css"]` — 6 @font-face
  (Space Grotesk 300/400/500/600 + Space Mono 400/700, latin woff2 from @fontsource).
- **Group** = "shared" (from `shared/ui/`). Fine; could be nicer with docsMap category
  stubs if ever desired (would change every component path → re-anchors).

## Preview authoring conventions (for re-sync / new components)

- Import components from **`'aura'`** (→ `window.AuraUI` via story-imports). lucide-react
  imports bundle normally.
- **Dark-only**: wrap every preview's content in a `Surface` div with
  `background: var(--bg)` + padding — the converter's preview-card frame is a fixed
  WHITE `body{background:#fff}` (can't fork emit.mjs), so components on it look broken
  otherwise. (Designs the agent builds DO get a dark body from `_ds_bundle.css`.)
- **Overlays** (Dialog, Select, DropdownMenu, Popover, Tooltip): render `defaultOpen`
  with a fixed full-bleed `var(--bg)` backdrop; set `cfg.overrides.<Name> =
  {cardMode:"single", viewport:"WxH"}`. Dialog uses viewport ≥640 wide so shadcn's
  `sm:` footer goes horizontal.
- **Paint-order gotcha (cost a debugging cycle):** a `position:fixed` backdrop paints
  ON TOP of static siblings, so an in-flow trigger is hidden behind it. For Tooltip
  (where the trigger must show) the trigger's container needs `position:relative`.
  For the other overlays the hidden trigger is fine (we want the open content, which
  is portalled to <body> and paints last).
- **Toaster**: `toast` is re-exported from the entry so `import {Toaster, toast} from
  'aura'` share one sonner instance; fire `toast(..., {duration: Infinity})` in a
  useEffect so the toasts persist for the screenshot.

## Known render warns (benign — check against this list on re-sync)

- `[RENDER_THIN]` on **FloatingPanel** and **Toaster**: "rendered height 0px". Both are
  full-bleed `position:fixed` compositions — 0 measured flow height is expected; the
  screenshots render fine. Not a defect.

## Re-sync risks (what can silently go stale)

- **CSS not recompiled**: if tokens.css / components / previews change and you skip
  `build-css.mjs`, the shipped CSS is stale (old utilities/tokens). Always recompile first.
- **dtsPropsFor drift**: hand-written props won't track source prop changes — re-check
  when a component's real props change.
- **@theme blocks**: `tailwind-entry.css` embeds a COPY of src/style.css's `@theme` /
  `@theme inline` blocks. If those change in the app, update tailwind-entry.css too.
- **fonts**: `.design-sync/fonts.css` url()s point at @fontsource woff2 paths — if the
  weights/subsets loaded by the app change, update it.
- **conventions.md**: names real tokens/utilities/components; re-validate against the
  build if the token set or component list changes (radius has NO `var(--radius-*)`
  token — @theme inline inlines it; only the `rounded-*` utilities exist).

## Repo quirks

- Pre-commit (husky + lint-staged) runs `scripts/check-no-hex.mjs` on `src/**` —
  `.design-sync/` and `ds-bundle/` are unaffected (tokens.css hex is fine to reference).
- `npm ci` (package-lock.json). Node 23 works. No .nvmrc.
- Playwright chromium installed for the render check (repo pin 1.56.1).
