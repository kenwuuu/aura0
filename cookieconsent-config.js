import 'https://cdn.jsdelivr.net/gh/orestbida/cookieconsent@3.1.0/dist/cookieconsent.umd.js';


CookieConsent.run({
    guiOptions: {
        consentModal: {
            layout: "box",
            position: "bottom right",
            equalWeightButtons: true,
            flipButtons: false
        },
        preferencesModal: {
            layout: "box",
            position: "right",
            equalWeightButtons: true,
            flipButtons: false
        }
    },
    categories: {
        necessary: {
            readOnly: true
        },
        functionality: {
            enabled: true
        },
        analytics: {},
        marketing: {}
    },
    language: {
        default: "en",
        autoDetect: "browser",
        translations: {
            'de': './config/cookie_consent_modal/translations/de.json',
            'en': './config/cookie_consent_modal/translations/en.json',
            'es': './config/cookie_consent_modal/translations/es.json',
            'fr': './config/cookie_consent_modal/translations/fr.json',
            'it': './config/cookie_consent_modal/translations/it.json',
            'ja': './config/cookie_consent_modal/translations/ja.json',
        }
    }
});