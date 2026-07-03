/**
 * consent.ts — cookie consent gate for the landing page.
 *
 * Uses vanilla-cookieconsent v3 (loaded as `window.CookieConsent` from the CDN in
 * index.html — the same version the rest of the app references) and gates Google
 * Analytics through Consent Mode v2. gtag storage defaults to `denied` in
 * index.html. Behavior depends on the CONSENT_DIALOG_ENABLED flag:
 *   - flag OFF (current): no dialog, so we default collection ON — grant analytics.
 *   - flag ON: run the dialog and grant/deny per the visitor's choice (opt-in).
 * Translations are reused from /config/cookie_consent_modal/translations/*.json.
 */

type CookieConsentApi = {
  run: (config: unknown) => void;
  acceptedCategory: (category: string) => boolean;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    CookieConsent?: CookieConsentApi;
  }
}

import { CONSENT_DIALOG_ENABLED } from './flags';

const TRANSLATIONS_BASE = '/config/cookie_consent_modal/translations';

/** Push the current category choices into Google Consent Mode. */
function syncGoogleConsent(cc: CookieConsentApi): void {
  const analytics = cc.acceptedCategory('analytics') ? 'granted' : 'denied';
  const marketing = cc.acceptedCategory('marketing') ? 'granted' : 'denied';
  window.gtag?.('consent', 'update', {
    analytics_storage: analytics,
    ad_storage: marketing,
    ad_user_data: marketing,
    ad_personalization: marketing,
  });
}

export function initConsent(): void {
  // Feature-flagged off until we're ready to launch the consent UI. While off,
  // there's no dialog to ask, so we default data collection ON: grant analytics
  // (the Consent Mode default in index.html is `denied`, so this flip is what
  // actually turns collection on). Ad storage stays denied — we run no ads.
  // When the flag is enabled later, this branch is skipped and the dialog gates
  // consent as a proper opt-in (starting from the denied default).
  if (!CONSENT_DIALOG_ENABLED) {
    window.gtag?.('consent', 'update', { analytics_storage: 'granted' });
    return;
  }

  const cc = window.CookieConsent;
  if (!cc) {
    // CDN blocked or still loading — fail safe: analytics stays denied (the
    // Consent Mode default from index.html), so nothing is tracked.
    console.warn('[consent] CookieConsent not available; analytics stays denied.');
    return;
  }

  cc.run({
    guiOptions: {
      consentModal: {
        layout: 'cloud inline',
        position: 'bottom right',
        equalWeightButtons: false,
        flipButtons: false,
      },
      preferencesModal: {
        layout: 'box',
        position: 'right',
        equalWeightButtons: false,
        flipButtons: true,
      },
    },
    categories: {
      necessary: { readOnly: true },
      functionality: {},
      analytics: { enabled: true },
      marketing: {},
    },
    language: {
      default: 'en',
      autoDetect: 'browser',
      translations: {
        de: `${TRANSLATIONS_BASE}/de.json`,
        en: `${TRANSLATIONS_BASE}/en.json`,
        es: `${TRANSLATIONS_BASE}/es.json`,
        fr: `${TRANSLATIONS_BASE}/fr.json`,
        it: `${TRANSLATIONS_BASE}/it.json`,
        ja: `${TRANSLATIONS_BASE}/ja.json`,
      },
    },
    // Fired on first consent and whenever the visitor changes their choice.
    onConsent: () => syncGoogleConsent(cc),
    onChange: () => syncGoogleConsent(cc),
  });
}
