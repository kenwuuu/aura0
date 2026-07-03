/**
 * flags.ts — landing-page feature flags. Single swap point.
 *
 * Flip a flag's default to `true`, or set the matching `VITE_*` env var, to turn
 * a feature on per-environment without touching call sites.
 */

/**
 * Whether the cookie-consent dialog is shown.
 *
 * OFF (default) until we're ready to launch consent UI: the dialog never renders.
 * With no dialog to ask, collection defaults ON — `initConsent()` grants analytics
 * (see consent.ts), so we don't ship a half-finished banner but still get data.
 *
 * Enable by setting `VITE_CONSENT_DIALOG_ENABLED=true` (or default it to `true`
 * here). When on, `initConsent()` runs the dialog and grants gtag consent per the
 * visitor's choice (opt-in, from the denied default).
 */
export const CONSENT_DIALOG_ENABLED =
  import.meta.env.VITE_CONSENT_DIALOG_ENABLED === 'true';
