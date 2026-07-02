/**
 * flags.ts — landing-page feature flags. Single swap point.
 *
 * Flip a flag's default to `true`, or set the matching `VITE_*` env var, to turn
 * a feature on per-environment without touching call sites.
 */

/**
 * Whether the cookie-consent dialog is shown.
 *
 * OFF (default) until we're ready to launch consent UI: the dialog never renders
 * and gtag stays in its Consent Mode default (analytics `denied` → cookieless
 * pings only — see index.html), so we don't ship a half-finished banner.
 *
 * Enable by setting `VITE_CONSENT_DIALOG_ENABLED=true` (or default it to `true`
 * here). When on, `initConsent()` runs the dialog and grants gtag consent per the
 * visitor's choice.
 */
export const CONSENT_DIALOG_ENABLED =
  import.meta.env.VITE_CONSENT_DIALOG_ENABLED === 'true';
