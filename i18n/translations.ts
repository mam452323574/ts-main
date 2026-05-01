import { I18n } from 'i18n-js';

import {
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES,
  type LocaleCode,
} from '@/i18n/config';
import { localeCatalogLoader } from '@/i18n/internal/catalogLoader';
import type { TranslationTree } from '@/i18n/internal/translationTree';

export const i18n = new I18n({});

i18n.defaultLocale = DEFAULT_LOCALE;
i18n.locale = DEFAULT_LOCALE;
i18n.enableFallback = true;

function getLoadedLocaleTree(locale: LocaleCode) {
  return (i18n.translations as Record<string, unknown>)[locale] as
    | TranslationTree
    | undefined;
}

async function hydrateLocale(locale: LocaleCode) {
  const loadedLocaleTree = getLoadedLocaleTree(locale);
  if (loadedLocaleTree) {
    return loadedLocaleTree;
  }

  const localeTree = await localeCatalogLoader.loadLocale(locale);
  (i18n.translations as Record<string, unknown>)[locale] = localeTree;
  return localeTree;
}

export async function ensureLocaleLoaded(locale: LocaleCode) {
  return hydrateLocale(locale);
}

export async function preloadLocale(locale: LocaleCode) {
  return hydrateLocale(locale);
}

export async function setI18nLocale(locale: LocaleCode) {
  await ensureLocaleLoaded(locale);
  i18n.locale = locale;
  return locale;
}

export async function loadLocalesForTests(
  locales: readonly LocaleCode[] = SUPPORTED_LOCALES,
) {
  await Promise.all(locales.map((locale) => ensureLocaleLoaded(locale)));
}
