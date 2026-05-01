import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;

function collectLeafPaths(source: unknown, prefix = ''): string[] {
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return [];
  }

  return Object.entries(source as Record<string, unknown>).flatMap(([key, value]) => {
    const nextPath = prefix ? `${prefix}.${key}` : key;

    if (typeof value === 'string') {
      return [nextPath];
    }

    return collectLeafPaths(value, nextPath);
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

function buildRuntimeParams(template: string) {
  const defaultValues: Record<string, string | number> = {
    action: 'Moderation',
    available: 2,
    cooldown: '6 hours',
    count: 3,
    current: 4,
    date: '12 Apr 2026',
    dislikes: 1,
    duration: '7 days',
    effective: 12,
    end: 10,
    likes: 8,
    limit: 10,
    max: 280,
    persona: 'Coach',
    price: '$9.99',
    provider: 'google',
    raw: 15,
    remaining: 6,
    seconds: 42,
    segundos: 42,
    stage: 2,
    start: 1,
    store: 'App Store',
    time: '6 hours',
    total: 12,
    unit: 'days',
  };
  const runtimeParams: Record<string, string | number> = { ...defaultValues };
  const placeholderPattern = /{{([^}]+)}}|%\{([^}]+)\}/g;
  let match: RegExpExecArray | null;

  while ((match = placeholderPattern.exec(template)) !== null) {
    const key = match[1] ?? match[2];

    if (!(key in runtimeParams)) {
      runtimeParams[key] = `${key}-value`;
    }
  }

  return runtimeParams;
}

describe('Base translation catalog completeness', () => {
  let canonicalPaths: string[] = [];

  beforeAll(async () => {
    await loadLocalesForTests();
    const enTree = (i18n.translations as Record<string, Record<string, unknown>>).en;
    canonicalPaths = collectLeafPaths(enTree).sort();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)('keeps %s aligned with the canonical runtime catalog', (locale) => {
    const localeTree = (i18n.translations as Record<string, Record<string, unknown>>)[locale];
    const localePaths = collectLeafPaths(localeTree).sort();

    expect(localePaths).toEqual(canonicalPaths);
  });

  it.each(locales)('resolves every canonical key at runtime for %s', (locale) => {
    i18n.locale = locale;
    const localeTree = (i18n.translations as Record<string, Record<string, unknown>>)[locale];

    for (const key of canonicalPaths) {
      const rawValue = String(getNestedValue(localeTree, key) ?? '');
      const resolved = String(i18n.t(key, buildRuntimeParams(rawValue)));

      expect(resolved).toBeTruthy();
      expect(resolved).not.toContain('[missing');
      expect(resolved).not.toContain('translation missing');
      expect(resolved).not.toContain(key);
    }
  });
});
