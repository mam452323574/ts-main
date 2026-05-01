import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';

describe('result translations', () => {
  beforeAll(async () => {
    await loadLocalesForTests();
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it.each([
    ['fr', 'Élevée', 'Élevé', 'Débloquez tous vos résultats', '••••••', 'Débloquer', 'Chargement'],
    ['en', 'High', 'High', 'Unlock all your results', '••••••', 'Unlock', 'Loading'],
    ['de', 'Hoch', 'Hoch', 'Alle Ergebnisse freischalten', '••••••', 'Freischalten', 'Lädt'],
    ['it', 'Alta', 'Alto', 'Sblocca tutti i risultati', '••••••', 'Sblocca', 'Caricamento'],
    ['es', 'Alta', 'Alto', 'Desbloquea todos tus resultados', '••••••', 'Desbloquear', 'Cargando'],
    ['pt', 'Alta', 'Alto', 'Desbloqueie seus resultados', '••••••', 'Desbloquear', 'A carregar'],
  ])(
    'merges the result glossary entries for %s',
    (locale, severityHigh, glycemicHigh, paywallTitle, blurredText, unlockText, loadingLabel) => {
      i18n.locale = locale;

      expect(i18n.t('qualitative_levels.severity.high')).toBe(severityHigh);
      expect(i18n.t('qualitative_levels.glycemic_index.high')).toBe(glycemicHigh);
      expect(i18n.t('common.results.paywall_title')).toBe(paywallTitle);
      expect(i18n.t('metric_card.premium_label')).toBe('PREMIUM');
      expect(i18n.t('metric_card.blurred_text')).toBe(blurredText);
      expect(i18n.t('metric_card.loading_label')).toBe(loadingLabel);
      expect(i18n.t('condition_card.unlock')).toBe(unlockText);
    },
  );

  it.each(SUPPORTED_LOCALES)(
    'uses the result overrides as authoritative namespaces for %s',
    (locale) => {
      i18n.locale = locale;

      expect(String(i18n.t('common.results.trajectory_preview.title'))).toBeTruthy();
      expect(String(i18n.t('share_story.header.title'))).toBeTruthy();
      expect(String(i18n.t('metric_card.loading_value'))).toBeTruthy();
      expect(String(i18n.t('condition_card.loading.explanation'))).toBeTruthy();
      expect(String(i18n.t('common.results.trajectory_preview.locked_headline'))).toContain(
        '[missing',
      );
      expect(String(i18n.t('common.results.trajectory_preview.badge_unlocked'))).toContain(
        '[missing',
      );
      expect(String(i18n.t('common.results.trajectory_preview.day_10'))).toContain(
        '[missing',
      );
      expect(String(i18n.t('common.results.trajectory_preview.day_20'))).toContain(
        '[missing',
      );
    },
  );
});
