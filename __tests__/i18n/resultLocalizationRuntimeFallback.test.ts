import { DEFAULT_LOCALE } from '@/i18n/config';
import { i18n, loadLocalesForTests } from '@/i18n/translations';
import {
  localizeNutritionVitaminKeys,
  localizeQualitativeLevel,
  localizeSuperScanAdviceKey,
  localizeSuperScanConditionLabel,
  localizeSuperScanDisclaimerKey,
  localizeSuperScanExplanationKey,
  localizeSuperScanSummaryKey,
  localizeVerdict,
} from '@/utils/resultLocalization';

describe('result localization runtime fallbacks', () => {
  beforeAll(async () => {
    await loadLocalesForTests(['fr']);
  });

  afterEach(() => {
    i18n.locale = DEFAULT_LOCALE;
  });

  it('uses controlled fallbacks when i18n-js returns [missing ...] sentinels', () => {
    i18n.locale = 'fr';
    const t = (scope: string, options?: Record<string, unknown>) =>
      String(i18n.t(scope, options));

    expect(t('verdicts.energisant_mais_gras')).toContain('[missing');
    expect(t('qualitative_levels.glycemic_index.slow_release')).toContain(
      '[missing'
    );
    expect(t('scan.nutrition.vitamins.niacine')).toContain('[missing');

    expect(localizeVerdict('energisant_mais_gras', t)).toBe(
      String(i18n.t('verdicts.unknown'))
    );
    expect(localizeQualitativeLevel('glycemic_index', 'slow_release', t)).toBe(
      String(i18n.t('qualitative_levels.glycemic_index.unknown'))
    );
    expect(localizeNutritionVitaminKeys(['niacine'], t, { locale: 'fr' })).toBe(
      String(i18n.t('scan.nutrition.vitamins.unknown'))
    );
    expect(localizeSuperScanSummaryKey('rare_summary', t)).toBe(
      String(i18n.t('scan.super.summaries.unknown'))
    );
    expect(localizeSuperScanDisclaimerKey('rare_disclaimer', t)).toBe(
      String(i18n.t('scan.super.disclaimers.unknown'))
    );
    expect(localizeSuperScanConditionLabel('rare_flag', t)).toBe(
      String(i18n.t('scan.super.conditions.unknown.label'))
    );
    expect(localizeSuperScanExplanationKey('rare_flag', t)).toBe(
      String(i18n.t('scan.super.explanations.unknown'))
    );
    expect(localizeSuperScanAdviceKey('rare_flag', t)).toBe(
      String(i18n.t('scan.super.advice.unknown'))
    );
  });
});
