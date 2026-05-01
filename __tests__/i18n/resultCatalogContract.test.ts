import {
  RESULT_CATALOG_CONTRACTS,
  getContractTranslationPath,
} from '@/constants/resultCatalogContract';
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;

function getNestedValue(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

function collectLeafPaths(source: Record<string, unknown>, prefix: string): string[] {
  return Object.entries(source).flatMap(([key, value]) => {
    const nextPath = `${prefix}.${key}`;

    if (typeof value === 'string') {
      return [nextPath];
    }

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return collectLeafPaths(value as Record<string, unknown>, nextPath);
    }

    return [];
  });
}

describe('result catalog contract alignment', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)('keeps %s aligned with the closed result contract', (locale) => {
    const localeTree = (i18n.translations as Record<string, Record<string, unknown>>)[
      locale
    ] as Record<string, unknown>;

    RESULT_CATALOG_CONTRACTS.forEach((contract) => {
      const namespaceTree = (getNestedValue(localeTree, contract.namespace) ??
        {}) as Record<string, unknown>;
      const actualPaths = collectLeafPaths(namespaceTree, contract.namespace).sort();
      const expectedPaths = contract.canonical
        .map((key) => getContractTranslationPath(contract, key))
        .sort();

      expect(actualPaths).toEqual(expectedPaths);
    });
  });

  it.each(locales)('resolves every closed contract key at runtime for %s', (locale) => {
    i18n.locale = locale;

    RESULT_CATALOG_CONTRACTS.forEach((contract) => {
      contract.canonical.forEach((key) => {
        const path = getContractTranslationPath(contract, key);
        const resolved = String(i18n.t(path));

        expect(resolved).toBeTruthy();
        expect(resolved).not.toContain('[missing');
        expect(resolved).not.toContain('translation missing');
        expect(resolved).not.toContain('__result_translation_missing__');
      });
    });
  });
});
