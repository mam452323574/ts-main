type TranslateFn = (scope: string, options?: Record<string, unknown>) => string;

interface FormatOptions {
  locale?: string | null;
  t?: TranslateFn;
  suffix?: string;
}

export function parseSafeNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const normalized = value.replace(',', '.').trim();
    const parsed = parseFloat(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveLocale(options?: FormatOptions) {
  return options?.locale || 'en';
}

function formatNumber(
  value: number,
  options?: {
    locale?: string | null;
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
) {
  return new Intl.NumberFormat(resolveLocale(options), {
    minimumFractionDigits: options?.minimumFractionDigits ?? 0,
    maximumFractionDigits: options?.maximumFractionDigits ?? 1,
  }).format(value);
}

function formatMeasureValue(value: unknown, options?: FormatOptions) {
  const num = parseSafeNumber(value);
  if (num === null) {
    return null;
  }

  const isInteger = Number.isInteger(num);
  return formatNumber(num, {
    locale: options?.locale,
    minimumFractionDigits: 0,
    maximumFractionDigits: isInteger ? 0 : 1,
  });
}

export function safeGaugeScore(value: unknown): number {
  const num = parseSafeNumber(value);
  return num !== null ? num : 0;
}

export function formatScore10(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? `${formatted}/10` : '-/10';
}

export function formatScore100(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? `${formatted}/100` : '-/100';
}

export function formatPercentage(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? `${formatted}%` : '-%';
}

export function formatCm(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? `${formatted} cm` : '- cm';
}

export function formatCalories(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, {
    ...options,
    locale: resolveLocale(options),
  });
  return formatted !== null ? formatted : '-';
}

export function formatAge(value: unknown, suffixOrOptions: string | FormatOptions = ''): string {
  const options =
    typeof suffixOrOptions === 'string'
      ? ({ suffix: suffixOrOptions } satisfies FormatOptions)
      : suffixOrOptions;
  const formatted = formatMeasureValue(value, options);
  if (formatted === null) return '-';

  const suffix =
    options?.suffix ?? (options?.t ? String(options.t('common.years_short')) : '') ?? '';
  return suffix ? `${formatted} ${suffix}` : formatted;
}

export function formatBMI(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? formatted : '-';
}

export function formatGrams(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? `${formatted} g` : '- g';
}

export function formatPlainNumber(value: unknown, options?: FormatOptions): string {
  const formatted = formatMeasureValue(value, options);
  return formatted !== null ? formatted : '-';
}
