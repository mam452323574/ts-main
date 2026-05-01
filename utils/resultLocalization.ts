type Translator = (scope: string, options?: Record<string, unknown>) => string;

export type QualitativeLevelCategory =
  | 'face_shape'
  | 'body_type'
  | 'muscle_mass'
  | 'ingredient_quality'
  | 'glycemic_index'
  | 'severity';

const missingResultTranslationWarnings = new Set<string>();

type NamespaceFallbackConfig = {
  translationKey: string;
  defaultText: string;
};

const NAMESPACE_FALLBACKS: Record<string, NamespaceFallbackConfig> = {
  'qualitative_levels.face_shape': {
    translationKey: 'qualitative_levels.face_shape.unknown',
    defaultText: 'Unknown',
  },
  'qualitative_levels.body_type': {
    translationKey: 'qualitative_levels.body_type.unknown',
    defaultText: 'Unknown',
  },
  'qualitative_levels.muscle_mass': {
    translationKey: 'qualitative_levels.muscle_mass.unknown',
    defaultText: 'Unknown',
  },
  'qualitative_levels.ingredient_quality': {
    translationKey: 'qualitative_levels.ingredient_quality.unknown',
    defaultText: 'Unknown',
  },
  'qualitative_levels.glycemic_index': {
    translationKey: 'qualitative_levels.glycemic_index.unknown',
    defaultText: 'Unknown',
  },
  'qualitative_levels.severity': {
    translationKey: 'qualitative_levels.severity.unknown',
    defaultText: 'Unknown',
  },
  verdicts: {
    translationKey: 'verdicts.unknown',
    defaultText: 'Unknown',
  },
  'scan.nutrition.vitamins': {
    translationKey: 'scan.nutrition.vitamins.unknown',
    defaultText: 'Unknown',
  },
  'scan.super.summaries': {
    translationKey: 'scan.super.summaries.unknown',
    defaultText: 'Summary unavailable',
  },
  'scan.super.disclaimers': {
    translationKey: 'scan.super.disclaimers.unknown',
    defaultText: 'Informational result only.',
  },
  'scan.super.conditions': {
    translationKey: 'scan.super.conditions.unknown',
    defaultText: 'Finding unavailable',
  },
  'scan.super.categories': {
    translationKey: 'scan.super.categories.unknown',
    defaultText: 'Other',
  },
  'scan.super.explanations': {
    translationKey: 'scan.super.explanations.unknown',
    defaultText: 'Details unavailable.',
  },
  'scan.super.advice': {
    translationKey: 'scan.super.advice.unknown',
    defaultText: 'Advice unavailable.',
  },
};

export function normalizeResultCatalogKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]+/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function humanizeResultCatalogKey(key: string) {
  const spaced = key.replace(/_/g, ' ').trim();
  if (!spaced) {
    return '';
  }

  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function shouldWarnMissingResultTranslation() {
  if (process.env.NODE_ENV === 'test') {
    return false;
  }

  if (typeof __DEV__ !== 'undefined') {
    return __DEV__;
  }

  return process.env.NODE_ENV !== 'production';
}

function warnMissingResultTranslation(translationKey: string, fallbackKey: string) {
  if (!shouldWarnMissingResultTranslation()) {
    return;
  }

  const warningId = `${translationKey}->${fallbackKey}`;
  if (missingResultTranslationWarnings.has(warningId)) {
    return;
  }

  missingResultTranslationWarnings.add(warningId);
  console.warn(
    `[results] Missing translation for "${translationKey}". Falling back to "${fallbackKey}".`
  );
}

function isMissingTranslationResult(
  translated: string | null | undefined,
  translationKey: string
) {
  if (typeof translated !== 'string') {
    return true;
  }

  const trimmed = translated.trim();
  if (!trimmed || trimmed === translationKey) {
    return true;
  }

  return (
    trimmed.includes('translation missing') ||
    /^\[missing\s+"[^"]+"\s+translation\]$/i.test(trimmed)
  );
}

function translateNamespacedKey(
  translationKey: string,
  t: Translator,
  fallback: string
) {
  const translated = t(translationKey);

  if (isMissingTranslationResult(translated, translationKey)) {
    return fallback;
  }

  return translated;
}

function resolveNamespaceFallback(
  namespace: string,
  t: Translator,
  emptyFallback: string
) {
  const fallbackConfig = NAMESPACE_FALLBACKS[namespace];
  if (!fallbackConfig) {
    return emptyFallback;
  }

  return translateNamespacedKey(
    fallbackConfig.translationKey,
    t,
    fallbackConfig.defaultText
  );
}

function localizeNormalizedCatalogKey(
  namespace: string,
  key: string,
  t: Translator,
  emptyFallback = ''
) {
  if (!key) {
    return emptyFallback;
  }

  const translationKey = `${namespace}.${key}`;
  const translated = t(translationKey);

  if (!isMissingTranslationResult(translated, translationKey)) {
    return translated;
  }

  const fallbackConfig = NAMESPACE_FALLBACKS[namespace];
  if (fallbackConfig && fallbackConfig.translationKey !== translationKey) {
    warnMissingResultTranslation(translationKey, fallbackConfig.translationKey);
  }

  return resolveNamespaceFallback(namespace, t, emptyFallback);
}

function localizeCatalogKey(
  namespace: string,
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!trimmedValue) {
    return emptyFallback;
  }

  return localizeNormalizedCatalogKey(
    namespace,
    normalizeResultCatalogKey(trimmedValue),
    t,
    emptyFallback
  );
}

function joinLocalizedList(values: string[], locale?: string | null) {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    return new Intl.ListFormat(locale ?? 'en', {
      style: 'short',
      type: 'conjunction',
    }).format(values);
  }

  return values.join(', ');
}

export function localizeQualitativeLevel(
  category: QualitativeLevelCategory,
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey(`qualitative_levels.${category}`, rawValue, t, emptyFallback);
}

export function localizeVerdict(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('verdicts', rawValue, t, emptyFallback);
}

export function localizeNutritionVitaminKeys(
  rawValues: string[] | null | undefined,
  t: Translator,
  options: {
    locale?: string | null;
    emptyFallback?: string;
  } = {}
) {
  if (!Array.isArray(rawValues) || rawValues.length === 0) {
    return options.emptyFallback ?? '';
  }

  const translatedValues = Array.from(
    new Set(
      rawValues
        .map((value) => normalizeResultCatalogKey(value))
        .filter((value) => value.length > 0)
        .map((key) =>
          localizeNormalizedCatalogKey(
            'scan.nutrition.vitamins',
            key,
            t,
            options.emptyFallback ?? ''
          )
        )
        .filter((value) => value.length > 0)
    )
  );

  if (translatedValues.length === 0) {
    return options.emptyFallback ?? '';
  }

  return joinLocalizedList(translatedValues, options.locale);
}

export function localizeSuperScanSummaryKey(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('scan.super.summaries', rawValue, t, emptyFallback);
}

export function localizeSuperScanDisclaimerKey(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('scan.super.disclaimers', rawValue, t, emptyFallback);
}

export function localizeSuperScanConditionLabel(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  const trimmedValue = typeof rawValue === 'string' ? rawValue.trim() : '';
  if (!trimmedValue) {
    return emptyFallback;
  }

  const normalizedKey = normalizeResultCatalogKey(trimmedValue);
  const translationKey = `scan.super.conditions.${normalizedKey}.label`;
  const translated = t(translationKey);

  if (!isMissingTranslationResult(translated, translationKey)) {
    return translated;
  }

  warnMissingResultTranslation(translationKey, 'scan.super.conditions.unknown.label');
  return translateNamespacedKey(
    'scan.super.conditions.unknown.label',
    t,
    'Unknown finding'
  );
}

export function localizeSuperScanCategoryKey(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('scan.super.categories', rawValue, t, emptyFallback);
}

export function localizeSuperScanExplanationKey(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('scan.super.explanations', rawValue, t, emptyFallback);
}

export function localizeSuperScanAdviceKey(
  rawValue: string | null | undefined,
  t: Translator,
  emptyFallback = ''
) {
  return localizeCatalogKey('scan.super.advice', rawValue, t, emptyFallback);
}
