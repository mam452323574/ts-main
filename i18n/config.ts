export const SUPPORTED_LOCALES = ['fr', 'en', 'de', 'it', 'es', 'pt'] as const;

export type LocaleCode = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: LocaleCode = 'fr';
export const USER_DEFAULT_LOCALE: LocaleCode = 'en';
export const LANGUAGE_STORAGE_KEY = 'user_language';

export const LOCALE_METADATA = {
  fr: {
    code: 'fr',
    flag: '🇫🇷',
    label: 'Français',
  },
  en: {
    code: 'en',
    flag: '🇬🇧',
    label: 'English',
  },
  de: {
    code: 'de',
    flag: '🇩🇪',
    label: 'Deutsch',
  },
  it: {
    code: 'it',
    flag: '🇮🇹',
    label: 'Italiano',
  },
  es: {
    code: 'es',
    flag: '🇪🇸',
    label: 'Español',
  },
  pt: {
    code: 'pt',
    flag: '🇵🇹',
    label: 'Português',
  },
} as const satisfies Record<
  LocaleCode,
  {
    code: LocaleCode;
    flag: string;
    label: string;
  }
>;

export const LOCALE_OPTIONS = SUPPORTED_LOCALES.map(
  (locale) => LOCALE_METADATA[locale],
);

export function isSupportedLocale(value: unknown): value is LocaleCode {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  );
}

export function normalizeLocaleCode(
  value?: string | null,
  fallback: LocaleCode = DEFAULT_LOCALE,
): LocaleCode {
  if (!value || typeof value !== 'string') {
    return fallback;
  }

  const shortCode = value.trim().slice(0, 2).toLowerCase();
  return isSupportedLocale(shortCode) ? shortCode : fallback;
}
