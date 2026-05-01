import fs from 'fs';
import path from 'path';

import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;
const SOURCE_DIRECTORIES = ['app', 'components', 'contexts', 'hooks', 'screens'];
const KEY_PATTERN = /\b(?:i18n\.)?t\(\s*['"]([^'"]+)['"]/g;

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

function collectSourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }

    return [fullPath];
  });
}

function collectLiteralTranslationKeys(): string[] {
  const sourceRoot = process.cwd();
  const keys = new Set<string>();

  SOURCE_DIRECTORIES.flatMap((relativeDirectory) =>
    collectSourceFiles(path.join(sourceRoot, relativeDirectory)),
  ).forEach((filePath) => {
    const source = fs.readFileSync(filePath, 'utf8');

    let match: RegExpExecArray | null;
    while ((match = KEY_PATTERN.exec(source)) !== null) {
      keys.add(match[1]);
    }
  });

  return Array.from(keys).sort();
}

describe('Literal translation key coverage', () => {
  let canonicalKeySet = new Set<string>();
  let usedLiteralKeys: string[] = [];

  beforeAll(async () => {
    await loadLocalesForTests();
    const enTree = (i18n.translations as Record<string, Record<string, unknown>>).en;
    canonicalKeySet = new Set(collectLeafPaths(enTree));
    usedLiteralKeys = collectLiteralTranslationKeys();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it('keeps every literal translation key used by the codebase in the canonical catalog', () => {
    const missingKeys = usedLiteralKeys.filter((key) => !canonicalKeySet.has(key));

    expect(missingKeys).toEqual([]);
  });

  it.each(locales)('resolves every literal translation key at runtime for %s', (locale) => {
    i18n.locale = locale;
    const localeTree = (i18n.translations as Record<string, Record<string, unknown>>)[locale];

    for (const key of usedLiteralKeys) {
      const rawValue = String(getNestedValue(localeTree, key) ?? '');
      const resolved = String(i18n.t(key, buildRuntimeParams(rawValue)));

      expect(resolved).toBeTruthy();
      expect(resolved).not.toContain('[missing');
      expect(resolved).not.toContain('translation missing');
      expect(resolved).not.toContain(key);
    }
  });
});
