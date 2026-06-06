import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;
const COACH_FRIDGE_CATALOG_PATHS = [
  'coach',
  'fridge_scan',
  'fridge_scan_result',
  'home.fridge_scan',
] as const;
const CHEF_REBRAND_CATALOG_PATHS = [
  'fridge_scan',
  'fridge_scan_result',
  'home.fridge_scan',
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

function collectLeafValues(source: unknown): string[] {
  if (typeof source === 'string') {
    return [source];
  }

  if (source && typeof source === 'object' && !Array.isArray(source)) {
    return Object.values(source as Record<string, unknown>).flatMap((value) =>
      collectLeafValues(value),
    );
  }

  return [];
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

  return COACH_FRIDGE_CATALOG_PATHS.flatMap((path) =>
    collectLeafPaths(
      (getNestedValue(localeTree, path) ?? {}) as Record<string, unknown>,
      path,
    ),
  ).sort();
}

describe('Coach and fridge scan translation catalog completeness', () => {
  let canonicalPaths: string[] = [];
  const runtimeOptions = {
    count: 2,
    date: '12 Apr',
    remaining: 1,
    limit: 3,
    max: 800,
    time: '6 hours',
    available: 2,
    cooldown: '6 hours',
    duration: '6 hours',
    unit: 'hours',
    persona: 'Coach',
    // `coach.conversation_hero.title_with_coach` interpole `{{coachName}}`
    // dans les 6 locales. Sans ce param, i18n-js renvoie un placeholder
    // `[missing "{{coachName}}" value]` qui declenche le filet
    // `expect(...).not.toContain('[missing')` ci-dessous.
    coachName: 'Noah',
  };

  beforeAll(async () => {
    await loadLocalesForTests();
    canonicalPaths = collectCatalogLeafPaths('en');
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)(
    'keeps %s aligned with the canonical Coach/fridge catalog',
    (locale) => {
      const localePaths = collectCatalogLeafPaths(locale);

      expect(localePaths).toEqual(canonicalPaths);
    },
  );

  it.each(locales)(
    'resolves every canonical Coach/fridge key at runtime for %s',
    (locale) => {
      i18n.locale = locale;

      for (const key of canonicalPaths) {
        const resolved = String(i18n.t(key, runtimeOptions));

        expect(resolved).toBeTruthy();
        expect(resolved).not.toContain('[missing');
        expect(resolved).not.toContain('translation missing');
        expect(resolved).not.toContain(key);
      }
    },
  );

  it.each([
    ['fr', 'Retour aux résultats du scanner'],
    ['en', 'Back to scan results'],
    ['es', 'Volver a los resultados del escáner'],
    ['de', 'Zurück zu den Scanner-Ergebnissen'],
    ['it', 'Torna ai risultati dello scanner'],
    ['pt', 'Voltar aos resultados do scanner'],
  ] as const)('localizes the scanner result return action for %s', (locale, expected) => {
    i18n.locale = locale;

    expect(i18n.t('coach.action_bar.back_to_scan_results')).toBe(expected);
  });

  it.each(locales)(
    'keeps the visible Chef rebrand copy clean for %s',
    (locale) => {
      const localeTree = (
        i18n.translations as Record<string, Record<string, unknown>>
      )[locale] as Record<string, unknown>;
      const visibleChefCopy = CHEF_REBRAND_CATALOG_PATHS.flatMap((path) =>
        collectLeafValues(getNestedValue(localeTree, path)),
      ).join('\n');

      expect(visibleChefCopy).not.toMatch(
        /Scan Frigo|Scan frigo|scan frigo|Fridge Scan|fridge scan|Chef Frigo|Ton Chef|\bIA\b|\bAI\b/,
      );
    },
  );
});
