Marketing landing page for first-time visitors — the **site root**, a separate
Vite entry fully isolated from the game app.

- Entry: `index.html` (served at `/`) → `landing-main.tsx` (mounts `<LandingPage>`
  into `#landing-root`). No Yjs, no networking, no `bootstrapGame()`. Registered as
  the `main` input in `vite.config.ts` (multipage build). The game app lives at
  `play.html` (the `play` input) → `/play.html`; "Play now" / CTAs link there via
  `PLAY_URL` in `links.ts`.
- Styling follows the **Manabase design system** (`design_handoff_manabase/`).
  Tokens are the single source of truth in `src/tokens.css` (global `:root` vars);
  `landing.css` imports Tailwind + the tokens, maps them into `@theme` (so
  `bg-bg`, `text-accent`, `border-line` read the vars), and defines the signature
  effect classes (`.mb-btn*`, `.mb-trace`, `.mb-card*`, `.mb-dotgrid`, `.mb-foil*`,
  keyframes). Component markup uses Tailwind for layout + `.mb-*` for effects.
  **Never hard-code hex — reference tokens.** Dark-mode only (no light theme).
- `accentTheme.ts` derives `--glow`/`--glow-strong` from the accent at runtime
  (the brief's themeable knob); `landing-main.tsx` calls `setAccent()` on boot.
- Analytics: `index.html` loads gtag (`G-75HGHP3J4M`) with **Google Consent Mode
  v2** defaulting all storage to `denied`. `consent.ts` runs vanilla-cookieconsent
  v3 (loaded as `window.CookieConsent` from the CDN — same version the app already
  references; reuses `/config/cookie_consent_modal/translations/*.json`) and flips
  gtag consent to `granted` per accepted category via `onConsent`/`onChange`.
  `landing-main.tsx` calls `initConsent()`, which is **feature-flagged off** via
  `CONSENT_DIALOG_ENABLED` in `flags.ts` (env: `VITE_CONSENT_DIALOG_ENABLED`).
  While off, no dialog renders and gtag stays denied; flip the flag to launch it.
  Note: cookieconsent's `hideFromBots`
  suppresses the banner when `navigator.webdriver` is true — mask it to test the
  modal under Playwright/headless.
- Motion is ported verbatim from the prototype: `MotionShowcase` (spellcast ripple
  `spawnAt` + floating combat `spawnCombat`), `PlayerPanel` (life `playTick`),
  `Cosmetics` (foil holo). Exact timings live in
  `scratchpad/motion-spec.md` extracted from the reference.
- Responsive-first: fluid `clamp()` type, grids that collapse 3→2→1, a mobile nav
  sheet, and `prefers-reduced-motion` handling in `landing.css`.
