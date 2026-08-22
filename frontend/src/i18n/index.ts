import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import vi from './locales/vi.json';

/** Languages offered in Settings. Must stay in sync with the `language`
 *  allow-list in `src-tauri/src/commands/settings.rs` — the backend rejects
 *  any value not in that list. */
export const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'vi', label: 'Tiếng Việt' },
] as const;

export const DEFAULT_LANGUAGE = 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    vi: { translation: vi },
  },
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  // React escapes interpolated values already; letting i18next escape too would
  // double-encode apostrophes and quotes in clip content.
  interpolation: { escapeValue: false },
});

/** Apply a language coming from saved settings. Unknown or missing values fall
 *  back to English rather than leaving the UI on whatever was loaded last. */
export function setLanguage(lang: string | undefined | null): void {
  const next = LANGUAGES.some((l) => l.value === lang) ? (lang as string) : DEFAULT_LANGUAGE;
  if (i18n.language !== next) void i18n.changeLanguage(next);
}

export default i18n;
