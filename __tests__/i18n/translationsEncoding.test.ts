import { DEFAULT_LOCALE } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

const CP1252_FOLLOWER_CLASS =
  '[\\u0080-\\u00FF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]';
const MOJIBAKE_PATTERN = new RegExp(
  `(?:\\u00C3(?=${CP1252_FOLLOWER_CLASS})|\\u00C2(?=${CP1252_FOLLOWER_CLASS}|\\s)|\\u00C5(?=${CP1252_FOLLOWER_CLASS})|\\u00E2(?=${CP1252_FOLLOWER_CLASS})|\\u00F0(?=${CP1252_FOLLOWER_CLASS})|\\uFFFD)`,
  'u',
);

function collectStringEntries(
  value: unknown,
  path: string[] = [],
): Array<{ path: string; value: string }> {
  if (typeof value === 'string') {
    return [{ path: path.join('.'), value }];
  }

  if (!value || typeof value !== 'object') {
    return [];
  }

  return Object.entries(value).flatMap(([key, nestedValue]) =>
    collectStringEntries(nestedValue, [...path, key]),
  );
}

describe('translations encoding', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it('contains no mojibake sequences in locale strings', () => {
    const translationEntries = collectStringEntries(i18n.translations);
    const suspiciousEntries = translationEntries
      .filter((entry) => MOJIBAKE_PATTERN.test(entry.value))
      .slice(0, 20);

    expect(suspiciousEntries).toEqual([]);
  });

  it('preserves the key French labels with correct accents', () => {
    i18n.locale = 'fr';

    expect(i18n.t('components.super_scan.status_available')).toBe('Prêt à scanner');
    expect(i18n.t('settings.title')).toBe('Paramètres');
    expect(i18n.t('languages.fr')).toBe('Français');
    expect(i18n.t('privacy.title')).toBe('Politique de Confidentialité');
    expect(i18n.t('settings.danger_zone_desc')).toContain('supprimé');
    expect(i18n.t('settings.danger_zone_desc')).toContain('arrière');
    expect(i18n.t('analytics.health_score')).toBe('Score Santé');
    expect(i18n.t('analytics.health_score_subtitle')).toBe('Évolution de votre score global');
    expect(i18n.t('analytics.physical_evolution')).toBe('Évolution Physique');
    expect(i18n.t('analytics.face_score_subtitle')).toBe('Évolution de votre score visage');
  });
});
