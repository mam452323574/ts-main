import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;

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

describe('premium translation completeness', () => {
  let canonicalPaths: string[] = [];

  beforeAll(async () => {
    await loadLocalesForTests();

    const englishPremiumTree = (
      (i18n.translations as Record<string, Record<string, unknown>>).en?.premium ??
      {}
    ) as Record<string, unknown>;

    canonicalPaths = collectLeafPaths(englishPremiumTree).sort();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)('keeps %s aligned with the canonical premium catalog', (locale) => {
    const localePremiumTree = (
      (i18n.translations as Record<string, Record<string, unknown>>)[locale]
        ?.premium ?? {}
    ) as Record<string, unknown>;
    const localePaths = collectLeafPaths(localePremiumTree).sort();

    expect(localePaths).toEqual(canonicalPaths);
  });

  it.each(locales)('resolves premium runtime copy for %s', (locale) => {
    i18n.locale = locale;

    for (const key of canonicalPaths.map((path) => `premium.${path}`)) {
      const resolved = String(
        i18n.t(key, {
          date: 'April 1, 2026',
          price: '€9.99',
          store: 'App Store',
        }),
      );

      expect(resolved).toBeTruthy();
      expect(resolved).not.toContain('[missing');
      expect(resolved).not.toContain('translation missing');
      expect(resolved).not.toContain(key);
    }
  });
});
