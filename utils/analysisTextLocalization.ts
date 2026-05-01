import {
  LocalizedTextDescriptor,
  LocalizedTextMap,
  LocalizedTextValue,
  SupportedLocale,
} from '@/types';
import { SUPPORTED_LOCALES, normalizeLocaleCode } from '@/i18n/config';

export const SUPPORTED_ANALYSIS_LOCALES: SupportedLocale[] = [...SUPPORTED_LOCALES];

type LocalizedStringRecord = Partial<Record<SupportedLocale, string>> & Record<string, unknown>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getSupportedLocaleCandidate(value?: string | null) {
  if (!value || typeof value !== 'string') {
    return null;
  }

  const shortCode = normalizeLocaleCode(value, 'en');
  return SUPPORTED_ANALYSIS_LOCALES.includes(shortCode) ? shortCode : null;
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readDescriptorField(
  descriptor: Record<string, unknown>,
  key: keyof Pick<LocalizedTextDescriptor, 'text' | 'value' | 'default'>
) {
  return readString(descriptor[key]);
}

function getTranslationsRecord(value: LocalizedTextValue): LocalizedStringRecord {
  const directRecord = value as LocalizedStringRecord;
  const descriptor = value as Record<string, unknown>;

  if (isPlainObject(descriptor.translations)) {
    return descriptor.translations as LocalizedStringRecord;
  }

  return directRecord;
}

export function normalizeSupportedLocale(
  locale?: string | null,
  fallback: SupportedLocale = 'en'
) {
  return getSupportedLocaleCandidate(locale) ?? fallback;
}

export function resolveLocalizedText(
  value: LocalizedTextValue | null | undefined,
  options: {
    locale?: string | null;
    analysisLocale?: string | null;
    fallback?: string;
  } = {}
) {
  if (typeof value === 'string') {
    return value.trim() || options.fallback || '';
  }

  if (!isPlainObject(value)) {
    return options.fallback || '';
  }

  const requestedLocale = getSupportedLocaleCandidate(options.locale);
  const analysisLocale = getSupportedLocaleCandidate(options.analysisLocale);
  const descriptor = value as Record<string, unknown>;
  const embeddedLocale = getSupportedLocaleCandidate(
    typeof descriptor.locale === 'string' ? descriptor.locale : undefined
  );
  const translations = getTranslationsRecord(value as LocalizedTextDescriptor | LocalizedTextMap);
  const preferredLocales = [requestedLocale, analysisLocale, embeddedLocale, 'en', 'fr'].filter(
    (locale, index, list): locale is SupportedLocale => !!locale && list.indexOf(locale) === index
  );

  for (const locale of preferredLocales) {
    const localizedValue = readString(translations[locale]);
    if (localizedValue) {
      return localizedValue;
    }
  }

  const fallbackValue =
    readDescriptorField(descriptor, 'text') ??
    readDescriptorField(descriptor, 'value') ??
    readDescriptorField(descriptor, 'default');

  if (fallbackValue) {
    return fallbackValue;
  }

  for (const locale of SUPPORTED_ANALYSIS_LOCALES) {
    const localizedValue = readString(translations[locale]);
    if (localizedValue) {
      return localizedValue;
    }
  }

  return options.fallback || '';
}
