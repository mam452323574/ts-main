import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const locales = SUPPORTED_LOCALES;

const leafChecks: Array<{
  key: string;
  options?: Record<string, string>;
}> = [
  { key: 'title' },
  { key: 'eyebrow.generic' },
  { key: 'eyebrow.estimated' },
  { key: 'eyebrow.loading' },
  { key: 'badge.locked' },
  { key: 'badge.unlocked' },
  { key: 'badge.loading' },
  { key: 'headline.locked.default' },
  { key: 'headline.locked.super' },
  {
    key: 'headline.unlocked.default',
    options: { label: 'Face score', score: '85/100' },
  },
  {
    key: 'headline.unlocked.super',
    options: { score: '42/100' },
  },
  { key: 'headline.loading' },
  { key: 'subtitle.locked' },
  { key: 'subtitle.unlocked.with_history' },
  { key: 'subtitle.unlocked.without_history' },
  { key: 'subtitle.loading' },
  { key: 'note' },
  { key: 'cta' },
  { key: 'checkpoints.today' },
  { key: 'checkpoints.day_15' },
  { key: 'checkpoints.day_30' },
];

function getNestedValue(source: unknown, path: string) {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, source);
}

describe('trajectory preview translations', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each(locales)('defines every trajectory preview leaf for %s', (locale) => {
    const localeTree = i18n.translations[locale] as Record<string, unknown>;
    const trajectoryTree = getNestedValue(
      localeTree,
      'common.results.trajectory_preview',
    ) as Record<string, unknown>;

    for (const check of leafChecks) {
      const fullKey = `common.results.trajectory_preview.${check.key}`;
      const rawValue = getNestedValue(localeTree, fullKey);

      expect(typeof rawValue).toBe('string');
      expect(String(rawValue)).toBeTruthy();
    }

    expect(trajectoryTree).not.toHaveProperty('locked_headline');
    expect(trajectoryTree).not.toHaveProperty('badge_unlocked');
    expect(trajectoryTree).not.toHaveProperty('day_10');
    expect(trajectoryTree).not.toHaveProperty('day_20');
  });

  it.each(locales)(
    'resolves runtime trajectory preview copy without fallback sentinels for %s',
    (locale) => {
      i18n.locale = locale;

      for (const check of leafChecks) {
        const fullKey = `common.results.trajectory_preview.${check.key}`;
        const resolved = String(i18n.t(fullKey, check.options));

        expect(resolved).toBeTruthy();
        expect(resolved).not.toContain('translation missing');
        expect(resolved).not.toContain('[missing');
        expect(resolved).not.toContain('__result_translation_missing__');
        expect(resolved).not.toContain(fullKey);
      }
    },
  );
});
