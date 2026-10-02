import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import type { InterfaceLanguage } from '@kometio/shared-types';
import en from './locales/en.json';
import it from './locales/it.json';

// Module augmentation off `it` (not `en`) is deliberate: it's the language
// this team writes copy in first, so its key set is the one TypeScript
// should catch typos/omissions against — see resources below.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: {
      translation: typeof it;
    };
  }
}

// The page says which language it is in. `<html lang="en">` was fixed, so
// with the editor in Italian a screen reader read Italian with English
// pronunciation, and the browser hyphenated it by English rules.
i18next.on('languageChanged', (language) => {
  document.documentElement.lang = language;
});

// One entry per language the API knows (`INTERFACE_LANGUAGES`): a language
// added there and not here does not compile.
const resources: Record<InterfaceLanguage, { translation: typeof it }> = {
  it: { translation: it },
  en: { translation: en },
};

// No browser-language auto-detection: an explicit `lng` keeps the starting
// language deterministic (tests, first-time users) — the language
// selector in the account menu (app/account/ui-preferences.tsx) is how it
// actually changes, and what the person saved is applied once the editor opens.
void i18next.use(initReactI18next).init({
  lng: 'en',
  resources,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18next;
