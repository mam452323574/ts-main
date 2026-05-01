export const SCAN_IMAGE_BUCKET = 'scan-images';

// Borne serveur sur la taille de l'image téléchargée depuis Storage avant
// envoi au webhook IA. Cohérent avec le `file_size_limit` du bucket
// (10 MB) — cf. supabase/migrations/20260407120000_phase1_hardening.sql.
export const SCAN_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

// Magic bytes JPEG (FF D8 FF). Validation de contenu côté Edge Function
// pour bloquer les uploads polyglots ou non-image avec Content-Type forgé.
export const JPEG_MAGIC_BYTES = [0xff, 0xd8, 0xff] as const;

export function hasJpegMagicBytes(bytes: Uint8Array | ArrayBuffer): boolean {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return (
    view.length >= 3 &&
    view[0] === JPEG_MAGIC_BYTES[0] &&
    view[1] === JPEG_MAGIC_BYTES[1] &&
    view[2] === JPEG_MAGIC_BYTES[2]
  );
}

export const APP_SCAN_TYPES = ['health', 'body', 'nutrition', 'super'] as const;
export type AppScanType = (typeof APP_SCAN_TYPES)[number];

export const SUPPORTED_SCAN_ANALYSIS_LANGUAGES = [
  'fr',
  'en',
  'es',
  'de',
  'it',
  'pt',
] as const;
export type ScanAnalysisLanguage =
  (typeof SUPPORTED_SCAN_ANALYSIS_LANGUAGES)[number];

export const DEFAULT_SCAN_ANALYSIS_LANGUAGE: ScanAnalysisLanguage = 'fr';

export const SCAN_ANALYSIS_OUTPUT_LANGUAGE_BY_CODE = {
  fr: 'French',
  en: 'English',
  es: 'Spanish',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
} as const satisfies Record<ScanAnalysisLanguage, string>;

export const SUPER_PROVIDER_SCAN_TYPES = [
  'fat_distribution_scan_v2',
  'super_health_v2',
] as const;
export type SuperProviderScanType = (typeof SUPER_PROVIDER_SCAN_TYPES)[number];
export type ProviderScanType =
  | 'face'
  | 'body'
  | 'nutrition'
  | SuperProviderScanType;

export const PROVIDER_SCAN_TYPE_BY_APP_SCAN_TYPE = {
  health: 'face',
  body: 'body',
  nutrition: 'nutrition',
  super: 'fat_distribution_scan_v2',
} as const;

export const CHECK_AND_RECORD_SCAN_REQUEST_KEYS = [
  'scan_type',
  'check_only',
] as const;

export const LEGACY_CHECK_AND_RECORD_SCAN_REQUEST_KEYS = [
  'scanType',
  'checkOnly',
] as const;

export const ANALYZE_SCAN_REQUEST_KEYS = [
  'scan_id',
  'scan_type',
  'language',
] as const;

export const DELETE_SCAN_REQUEST_KEYS = ['scan_id'] as const;

export function isAppScanType(value: unknown): value is AppScanType {
  return typeof value === 'string' && APP_SCAN_TYPES.includes(value as AppScanType);
}

export function getProviderScanType(scanType: AppScanType): ProviderScanType {
  return PROVIDER_SCAN_TYPE_BY_APP_SCAN_TYPE[scanType];
}

export function isSupportedScanAnalysisLanguage(
  value: unknown,
): value is ScanAnalysisLanguage {
  return (
    typeof value === 'string' &&
    SUPPORTED_SCAN_ANALYSIS_LANGUAGES.includes(
      value as ScanAnalysisLanguage,
    )
  );
}

export function normalizeScanAnalysisLanguage(
  value: unknown,
): ScanAnalysisLanguage {
  if (typeof value !== 'string') {
    return DEFAULT_SCAN_ANALYSIS_LANGUAGE;
  }

  const [baseLocale] = value.trim().toLowerCase().split(/[-_]/);
  return isSupportedScanAnalysisLanguage(baseLocale)
    ? baseLocale
    : DEFAULT_SCAN_ANALYSIS_LANGUAGE;
}

export function resolveScanAnalysisLanguageContract(value: unknown) {
  const language = normalizeScanAnalysisLanguage(value);

  return {
    language,
    locale: language,
    outputLanguage: SCAN_ANALYSIS_OUTPUT_LANGUAGE_BY_CODE[language],
  };
}

export function buildCanonicalScanImagePath(userId: string, scanId: string) {
  return `${userId}/scans/${scanId}.jpg`;
}

export function buildCheckAndRecordScanRequest(
  scanType: AppScanType,
  options: { checkOnly?: boolean } = {},
) {
  return {
    scan_type: scanType,
    ...(options.checkOnly ? { check_only: true } : {}),
  };
}

export function buildAnalyzeScanRequest(
  scanId: string,
  scanType: AppScanType,
  language?: string,
) {
  const normalizedLanguage = normalizeScanAnalysisLanguage(language);

  return {
    scan_id: scanId,
    scan_type: scanType,
    language: normalizedLanguage,
  };
}
