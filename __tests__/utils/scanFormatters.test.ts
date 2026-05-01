import {
  formatAge,
  formatBMI,
  formatCalories,
  formatCm,
  formatGrams,
  formatPercentage,
  formatScore10,
  formatScore100,
} from '@/utils/scanFormatters';

describe('scan formatters', () => {
  it('formats locale-aware decimals for european locales', () => {
    expect(formatBMI(22.5, { locale: 'fr' })).toBe('22,5');
    expect(formatCm(81.2, { locale: 'fr' })).toBe('81,2 cm');
  });

  it('keeps ratios stable for score-based metrics', () => {
    expect(formatScore10(7, { locale: 'es' })).toBe('7/10');
    expect(formatScore100(84, { locale: 'de' })).toBe('84/100');
  });

  it('formats percentages, calories, age and grams with readable fallbacks', () => {
    expect(formatPercentage(63, { locale: 'pt' })).toBe('63%');
    expect(formatCalories(410, { locale: 'en' })).toBe('410');
    expect(formatAge(27, { locale: 'en', suffix: 'yrs' })).toBe('27 yrs');
    expect(formatGrams(22, { locale: 'it' })).toBe('22 g');
  });

  it('returns stable placeholder strings when data is missing', () => {
    expect(formatBMI(null, { locale: 'en' })).toBe('-');
    expect(formatScore10(undefined, { locale: 'en' })).toBe('-/10');
  });
});
