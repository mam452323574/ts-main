import { normalizeContractToken } from '@/constants/resultCatalogContract';
import { FR_TRANSLATIONS } from '@/i18n/locales/fr';

const CP1252_FOLLOWER_CLASS =
  '[\\u0080-\\u00FF\\u20AC\\u201A\\u0192\\u201E\\u2026\\u2020\\u2021\\u02C6\\u2030\\u0160\\u2039\\u0152\\u017D\\u2018\\u2019\\u201C\\u201D\\u2022\\u2013\\u2014\\u02DC\\u2122\\u0161\\u203A\\u0153\\u017E\\u0178]';
const SUSPICIOUS_MOJIBAKE_PATTERN = new RegExp(
  `(?:\\u00C3(?=${CP1252_FOLLOWER_CLASS})|\\u00C2(?=${CP1252_FOLLOWER_CLASS}|\\s)|\\u00C5(?=${CP1252_FOLLOWER_CLASS})|\\u00E2(?=${CP1252_FOLLOWER_CLASS})|\\u00F0(?=${CP1252_FOLLOWER_CLASS})|\\uFFFD)`,
  'u',
);

describe('French locale encoding', () => {
  it('contains no mojibake signatures in the French catalog', () => {
    expect(JSON.stringify(FR_TRANSLATIONS)).not.toMatch(
      SUSPICIOUS_MOJIBAKE_PATTERN,
    );
  });

  it('keeps critical French labels correctly accented', () => {
    expect(FR_TRANSLATIONS.analytics.health_score).toBe('Score Santé');
    expect(FR_TRANSLATIONS.analytics.health_score_subtitle).toBe(
      'Évolution de votre score global',
    );
    expect(FR_TRANSLATIONS.settings.title).toBe('Paramètres');
    expect(FR_TRANSLATIONS.settings.section_preferences).toBe('Préférences');
    expect(FR_TRANSLATIONS.settings.admin_moderation).toBe(
      'Modération sociale',
    );
    expect(FR_TRANSLATIONS.coach.title).toBe('Ton coach');
    expect(FR_TRANSLATIONS.coach.history_title).toBe('Conseils précédents');
  });

  it('normalizes straight and curly apostrophes consistently', () => {
    expect(normalizeContractToken("l'heure")).toBe('lheure');
    expect(normalizeContractToken('l’heure')).toBe('lheure');
  });
});
