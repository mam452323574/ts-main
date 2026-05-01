import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;
const RESULT_CATALOG_PATHS = [
  'common.results',
  'common.metrics',
  'scan.face',
  'scan.body',
  'scan.nutrition',
  'scan.super',
  'verdicts',
  'qualitative_levels',
  'metric_card',
  'condition_card',
  'share_story',
] as const;

function collectLeafPaths(
  source: Record<string, unknown>,
  prefix = '',
): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      return [nextPath];
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return collectLeafPaths(value as Record<string, unknown>, nextPath);
    }

    return [];
  });
}

function getNestedValue(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function collectCatalogLeafPaths(locale: (typeof locales)[number]) {
  const localeTree = (
    i18n.translations as Record<string, Record<string, unknown>>
  )[locale] as Record<string, unknown>;

  return RESULT_CATALOG_PATHS.flatMap((path) =>
    collectLeafPaths(
      (getNestedValue(localeTree, path) ?? {}) as Record<string, unknown>,
      path,
    ),
  ).sort();
}

describe('result translation catalog completeness', () => {
  let canonicalPaths: string[] = [];
  const runtimeOptions = {
    label: 'Face score',
    score: '85/100',
    index: 1,
  };

  beforeAll(async () => {
    await loadLocalesForTests();
    canonicalPaths = collectCatalogLeafPaths('en');
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)('keeps %s aligned with the canonical result/share catalog', (locale) => {
    const localePaths = collectCatalogLeafPaths(locale);

    expect(localePaths).toEqual(canonicalPaths);
  });

  it.each(locales)(
    'resolves every canonical result/share key at runtime for %s',
    (locale) => {
      i18n.locale = locale;

      for (const key of canonicalPaths) {
        const resolved = String(i18n.t(key, runtimeOptions));

        expect(resolved).toBeTruthy();
        expect(resolved).not.toContain('[missing');
        expect(resolved).not.toContain('translation missing');
        expect(resolved).not.toContain('__result_translation_missing__');
        expect(resolved).not.toContain(key);
      }
    },
  );
});
