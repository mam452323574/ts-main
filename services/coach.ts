import { Buffer } from 'buffer';

import { supabase } from './supabase';
import {
  getConfiguredSupabaseProjectLabel,
  invokeAuthedEdgeFunction,
} from './edgeFunctions';

import {
  DEFAULT_COACH_PERSONA_KEY,
  isCoachPersonaKey,
} from '@/shared/coachPersonas';
import {
  getCoachPromptScanQuota,
  isCoachPromptType,
  normalizeCoachPromptType,
} from '@/shared/coachPromptTypes';
import { isCoachResponseVersion } from '@/shared/coachContent';
import { parseCoachStructuredContent } from '@/shared/coachContentParser';
import { getDefaultCoachDisclaimer } from '@/shared/coachCopy';
import { resolveLocalizedText } from '@/utils/analysisTextLocalization';
import {
  getAnalysisResultScanType,
  tryNormalizeAnalysisResult,
} from '@/utils/analysisNormalization';
import {
  isRenderableCoachEntry,
  type RenderableCoachEntry,
} from '@/utils/coachHistory';
import { logOperationalError } from '@/utils/observability';
import type {
  AnalysisResult,
  CoachComparisonToPrevious,
  CoachEntry,
  CoachGenerateResponse,
  CoachGuidancePayload,
  CoachGuidanceResult,
  CoachKeyMetrics,
  CoachMetricDelta,
  CoachMetricInterpretationHint,
  CoachPersonaKey,
  CoachPromptType,
  CoachQuotaStatus,
  CoachRelevantFlag,
  CoachResponseVersion,
  CoachScanDigest,
  CoachScanRichContext,
  CoachStructuredContent,
  CoachTrendMetric,
  CoachTrendSummary,
  ScanType,
  SuperScanResult,
} from '@/types';

const COACH_FUNCTION_NAME = 'coach-generate-response';
const COACH_QUOTA_STATUS_FUNCTION_NAME = 'coach-quota-status';
export const COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE =
  'coach_webhook_not_configured';
export const INVALID_COACH_RESPONSE_ERROR_CODE = 'invalid_coach_response';
export const COACH_NO_USABLE_SCAN_ERROR_CODE = 'coach_no_usable_scan';
export const COACH_QUOTA_EXHAUSTED_ERROR_CODE = 'coach_quota_exhausted';
export const COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE =
  'coach_quota_status_unavailable';
// Raised from 24 to 32 so prompt types like trend_review (needing 10 recent
// + 12 prior) and risk_watch (needing 4 super scans + up to 10 prior) have
// enough source material after type filtering.
const RECENT_COACH_SCAN_LIMIT = 32;
const COACH_TREND_SAMPLE_COUNT = 3;

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

interface CoachScanRow {
  id?: unknown;
  scan_type?: unknown;
  analysis_result?: unknown;
  analyzed_at?: unknown;
  created_at?: unknown;
}

export interface CoachSourceScan {
  id: string;
  scan_type: ScanType;
  captured_at: string;
  normalized: CoachNormalizedAnalysisResult;
  key_metrics: CoachKeyMetrics;
  raw_fallback_fields: Record<string, unknown> | null;
  digest: CoachScanDigest;
}

export type CoachNormalizedAnalysisResult = AnalysisResult | SuperScanResult;

type CoachMetricDirection = CoachMetricDelta['direction'];

interface CoachMetricSpec {
  metric: string;
  interpretationHint: CoachMetricInterpretationHint;
  tolerance: number;
}

interface CoachHistoryPageRpcRow {
  id?: unknown;
  created_at?: unknown;
  generated_at?: unknown;
}

interface CoachHistorySummaryRpcRow {
  total_count?: unknown;
  latest_entry_at?: unknown;
}

export class CoachServiceError extends Error {
  code?: string;
  status?: number;
  details?: unknown;
  requestId?: string;
  functionName?: string;

  constructor(
    message: string,
    options: {
      code?: string;
      status?: number;
      details?: unknown;
      requestId?: string;
      functionName?: string;
    } = {},
  ) {
    super(message);
    this.name = 'CoachServiceError';
    this.code = options.code;
    this.status = options.status;
    this.details = options.details;
    this.requestId = options.requestId;
    this.functionName = options.functionName;
  }
}

export interface CoachServiceErrorDebugInfo {
  message: string;
  code: string | null;
  status: number | null;
  requestId: string | null;
  functionName: string | null;
  details: unknown;
}

export interface CoachEntryFailureDebugInfo extends CoachServiceErrorDebugInfo {
  webhookStatus: number | null;
  provider: string | null;
  source: string | null;
  fallbackUsed: boolean | null;
  responseBodyPresent: boolean | null;
}

export type CoachFailureKind =
  | 'provider_unavailable'
  | 'provider_request_failed'
  | 'invalid_provider_response'
  | 'generic';

export interface CoachHistoryCursor {
  sortAt: string;
  createdAt: string;
  id: string;
}

export interface CoachHistoryPage {
  items: RenderableCoachEntry[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface CoachHistorySummary {
  total_count: number;
  latest_entry_at: string | null;
}

function shouldDebugCoachService() {
  return typeof __DEV__ !== 'undefined' && __DEV__ && process.env.NODE_ENV !== 'test';
}

export function getCoachServiceErrorDebugInfo(error: unknown): CoachServiceErrorDebugInfo {
  if (error instanceof CoachServiceError) {
    return {
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
      requestId: error.requestId ?? null,
      functionName: error.functionName ?? null,
      details: error.details ?? null,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      code: null,
      status: null,
      requestId: null,
      functionName: null,
      details: null,
    };
  }

  return {
    message: 'unknown',
    code: null,
    status: null,
    requestId: null,
    functionName: null,
    details: error ?? null,
  };
}

export function isCoachProviderUnavailableError(error: unknown) {
  return (
    error instanceof CoachServiceError &&
    error.code === COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE
  );
}

export function isCoachProviderUnavailableEntry(
  entry: Pick<CoachEntry, 'error_code' | 'status'> | null | undefined,
) {
  return (
    entry?.status === 'error' &&
    entry.error_code === COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE
  );
}

function isCoachProviderRequestFailureCode(code?: string | null) {
  return !!code &&
    (code === 'coach_webhook_failed' ||
      code === 'coach_webhook_unreachable' ||
      (code.startsWith('coach_webhook_') &&
        code !== COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE));
}

function resolveCoachFailureKindFromCode(
  code?: string | null,
  status?: number | null,
): CoachFailureKind {
  if (code === COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE) {
    return 'provider_unavailable';
  }

  if (code === INVALID_COACH_RESPONSE_ERROR_CODE) {
    return 'invalid_provider_response';
  }

  if (isCoachProviderRequestFailureCode(code) || status === 502 || status === 503) {
    return 'provider_request_failed';
  }

  return 'generic';
}

export function resolveCoachFailureKindFromError(error: unknown): CoachFailureKind {
  const debugInfo = getCoachServiceErrorDebugInfo(error);
  return resolveCoachFailureKindFromCode(debugInfo.code, debugInfo.status);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function readOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : null;
}

function readOptionalInteger(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }

  return null;
}

function readNullableInteger(value: unknown) {
  return value === null || value === undefined ? null : readOptionalInteger(value);
}

function readCoachAccountTier(value: unknown): CoachQuotaStatus['account_tier'] {
  return value === 'premium' || value === 'admin' ? value : 'free';
}

export function parseCoachQuotaStatus(payload: unknown): CoachQuotaStatus | null {
  if (!isRecord(payload)) {
    return null;
  }

  const unlimited = readOptionalBoolean(payload.unlimited) === true;
  const usedCount = readOptionalInteger(payload.used_count);
  const limit = readNullableInteger(payload.limit);
  const available = readNullableInteger(payload.available);
  const windowSeconds = readOptionalInteger(payload.window_seconds);
  const asOf = readOptionalString(payload.as_of);

  if (
    usedCount === null ||
    windowSeconds === null ||
    !asOf ||
    (!unlimited && (limit === null || available === null))
  ) {
    return null;
  }

  return {
    account_tier: readCoachAccountTier(payload.account_tier),
    limit: unlimited ? null : Math.max(0, limit ?? 0),
    used_count: Math.max(0, usedCount),
    available: unlimited ? null : Math.max(0, available ?? 0),
    next_recharge_at: readOptionalString(payload.next_recharge_at),
    unlimited,
    window_seconds: Math.max(1, windowSeconds),
    as_of: asOf,
  };
}

function parseCoachQuotaStatusFromErrorDetails(
  details: unknown,
): CoachQuotaStatus | null {
  if (!isRecord(details)) {
    return null;
  }

  return parseCoachQuotaStatus({
    account_tier: details.quota_account_tier,
    limit: details.quota_limit,
    used_count: details.quota_used_count,
    available: details.quota_available,
    next_recharge_at: details.quota_next_recharge_at,
    unlimited: details.quota_unlimited,
    window_seconds: details.quota_window_seconds,
    as_of: details.quota_as_of,
  });
}

function parseCoachQuotaStatusResponse(payload: unknown): CoachQuotaStatus {
  if (!isRecord(payload) || payload.success !== true) {
    throw createCoachServiceError('Coach quota returned an invalid payload', {
      code: COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
      status: 502,
      details: payload,
    });
  }

  const quota = parseCoachQuotaStatus(payload.quota);
  if (!quota) {
    throw createCoachServiceError('Coach quota is missing from the response', {
      code: COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE,
      status: 502,
      details: payload,
    });
  }

  return quota;
}

export function isCoachQuotaExhaustedError(error: unknown) {
  return (
    error instanceof CoachServiceError &&
    error.code === COACH_QUOTA_EXHAUSTED_ERROR_CODE
  );
}

export function getCoachQuotaFromError(error: unknown): CoachQuotaStatus | null {
  if (!(error instanceof CoachServiceError)) {
    return null;
  }

  return parseCoachQuotaStatusFromErrorDetails(error.details);
}

export function getCoachEntryFailureDebugInfo(
  entry:
    | Pick<CoachEntry, 'status' | 'error_code' | 'response_payload_json'>
    | null
    | undefined,
): CoachEntryFailureDebugInfo | null {
  if (entry?.status !== 'error') {
    return null;
  }

  const responsePayload = isRecord(entry.response_payload_json)
    ? entry.response_payload_json
    : null;
  const webhookStatus = readOptionalNumber(responsePayload?.webhook_status);
  const errorCode =
    readOptionalString(entry.error_code) ??
    readOptionalString(responsePayload?.error_code);

  return {
    message:
      readOptionalString(responsePayload?.error) ??
      readOptionalString(responsePayload?.message) ??
      errorCode ??
      'coach_entry_error',
    code: errorCode ?? null,
    status: webhookStatus ?? null,
    requestId:
      readOptionalString(responsePayload?.request_id) ??
      readOptionalString(responsePayload?.requestId),
    functionName: COACH_FUNCTION_NAME,
    details: responsePayload,
    webhookStatus: webhookStatus ?? null,
    provider: readOptionalString(responsePayload?.provider),
    source: readOptionalString(responsePayload?.source),
    fallbackUsed: readOptionalBoolean(responsePayload?.fallback),
    responseBodyPresent: readOptionalBoolean(responsePayload?.response_body_present),
  };
}

export function resolveCoachFailureKindFromEntry(
  entry:
    | Pick<CoachEntry, 'status' | 'error_code' | 'response_payload_json'>
    | null
    | undefined,
): CoachFailureKind {
  const debugInfo = getCoachEntryFailureDebugInfo(entry);
  return resolveCoachFailureKindFromCode(debugInfo?.code, debugInfo?.status);
}

function normalizeCoachLocale(locale?: string | null) {
  const normalizedLocale = readOptionalString(locale)?.slice(0, 2).toLowerCase();
  return normalizedLocale && normalizedLocale.length > 0 ? normalizedLocale : null;
}

function readCoachPersonaKey(value: unknown): CoachPersonaKey {
  return isCoachPersonaKey(value) ? value : DEFAULT_COACH_PERSONA_KEY;
}

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function buildSupabaseErrorHaystack(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);

  return [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();
}

function isMissingCoachRelationError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (
    errorCode === '42P01' ||
    errorCode === 'PGRST205' ||
    errorCode === 'PGRST202'
  ) {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);

  return (
    (haystack.includes('coach_entries') ||
      haystack.includes('user_growth_experiences') ||
      haystack.includes('relation')) &&
    haystack.includes('does not exist')
  );
}

function isMissingScansRelationError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  if (
    errorCode === '42P01' ||
    errorCode === 'PGRST204' ||
    errorCode === 'PGRST205'
  ) {
    return true;
  }

  const haystack = buildSupabaseErrorHaystack(error);

  return haystack.includes('scans') && haystack.includes('does not exist');
}

function isMissingSupabaseColumnError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';

  return (
    errorCode === '42703' ||
    errorCode === 'PGRST204' ||
    (buildSupabaseErrorHaystack(error).includes('column') &&
      buildSupabaseErrorHaystack(error).includes('does not exist'))
  );
}

function isSupabasePolicyDeniedError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const errorCode = supabaseError.code ?? '';
  const haystack = buildSupabaseErrorHaystack(error);

  return (
    errorCode === '42501' ||
    haystack.includes('permission denied') ||
    haystack.includes('row-level security')
  );
}

function createCoachServiceError(
  message: string,
  options: {
    code?: string;
    status?: number;
    details?: unknown;
    requestId?: string;
    functionName?: string;
  } = {},
) {
  return new CoachServiceError(message, options);
}

function createCoachEntriesUnavailableError(error: unknown) {
  return createCoachServiceError(
    `Coach data table "coach_entries" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'coach_entries_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createCoachScansUnavailableError(error: unknown) {
  return createCoachServiceError(
    `Coach scan source table "scans" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'coach_scans_unavailable',
      status: 503,
      details: error,
    },
  );
}

function createCoachEntriesSchemaMismatchError(error: unknown) {
  return createCoachServiceError(
    `Coach data on Supabase project "${getConfiguredSupabaseProjectLabel()}" is missing required columns for "coach_entries".`,
    {
      code: 'coach_entries_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createCoachScansSchemaMismatchError(error: unknown) {
  return createCoachServiceError(
    `Coach scan source data on Supabase project "${getConfiguredSupabaseProjectLabel()}" is missing required columns for "scans".`,
    {
      code: 'coach_scans_schema_mismatch',
      status: 503,
      details: error,
    },
  );
}

function createCoachEntriesPolicyDeniedError(error: unknown) {
  return createCoachServiceError(
    `Coach data access is denied by Supabase policies or grants for "coach_entries" on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'coach_entries_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createCoachScansPolicyDeniedError(error: unknown) {
  return createCoachServiceError(
    `Coach scan source access is denied by Supabase policies or grants for "scans" on project "${getConfiguredSupabaseProjectLabel()}".`,
    {
      code: 'coach_scans_policy_denied',
      status: 403,
      details: error,
    },
  );
}

function createCoachReadError(
  fallbackMessage: string,
  fallbackCode: string,
  error: unknown,
) {
  const supabaseError = toSupabaseErrorLike(error);

  return createCoachServiceError(
    typeof supabaseError.message === 'string' && supabaseError.message.length > 0
      ? supabaseError.message
      : fallbackMessage,
    {
      code: supabaseError.code ?? fallbackCode,
      status: 500,
      details: error,
    },
  );
}

function isMissingCoachHistoryFunctionError(error: unknown, functionName: string) {
  const supabaseError = toSupabaseErrorLike(error);
  const haystack = buildSupabaseErrorHaystack(error);

  return (
    supabaseError.code === 'PGRST202' &&
    haystack.includes(functionName.toLowerCase())
  );
}

function createCoachEntriesReadError(error: unknown) {
  if (isMissingCoachRelationError(error)) {
    return createCoachEntriesUnavailableError(error);
  }

  if (isMissingSupabaseColumnError(error)) {
    return createCoachEntriesSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createCoachEntriesPolicyDeniedError(error);
  }

  return createCoachReadError(
    'Failed to load coach entries.',
    'coach_entries_load_failed',
    error,
  );
}

function createCoachScansReadError(error: unknown) {
  if (isMissingScansRelationError(error)) {
    return createCoachScansUnavailableError(error);
  }

  if (isMissingSupabaseColumnError(error)) {
    return createCoachScansSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createCoachScansPolicyDeniedError(error);
  }

  return createCoachReadError(
    'Failed to load recent coach scans.',
    'coach_scans_load_failed',
    error,
  );
}

function createCoachHistoryPageReadError(error: unknown) {
  if (isMissingCoachHistoryFunctionError(error, 'get_coach_history_page')) {
    return createCoachServiceError(
      `Coach history pagination function "get_coach_history_page" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
      {
        code: 'coach_history_page_unavailable',
        status: 503,
        details: error,
      },
    );
  }

  if (isMissingCoachRelationError(error)) {
    return createCoachEntriesUnavailableError(error);
  }

  if (isMissingSupabaseColumnError(error)) {
    return createCoachEntriesSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createCoachEntriesPolicyDeniedError(error);
  }

  return createCoachReadError(
    'Failed to load coach history.',
    'coach_history_page_load_failed',
    error,
  );
}

function createCoachHistorySummaryReadError(error: unknown) {
  if (isMissingCoachHistoryFunctionError(error, 'get_coach_history_summary')) {
    return createCoachServiceError(
      `Coach history summary function "get_coach_history_summary" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
      {
        code: 'coach_history_summary_unavailable',
        status: 503,
        details: error,
      },
    );
  }

  if (isMissingCoachRelationError(error)) {
    return createCoachEntriesUnavailableError(error);
  }

  if (isMissingSupabaseColumnError(error)) {
    return createCoachEntriesSchemaMismatchError(error);
  }

  if (isSupabasePolicyDeniedError(error)) {
    return createCoachEntriesPolicyDeniedError(error);
  }

  return createCoachReadError(
    'Failed to load coach history summary.',
    'coach_history_summary_load_failed',
    error,
  );
}

async function invokeAuthedCoachFunction<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
) {
  return invokeAuthedEdgeFunction<TResponse, CoachServiceError>({
    scopeLabel: 'Coach',
    functionName,
    payload,
    createError: (message, options) =>
      createCoachServiceError(message, {
        code: options.code,
        status: options.status,
        details: options.details,
        requestId: options.requestId,
        functionName: options.functionName,
      }),
  });
}

const COACH_METRIC_SPECS: Record<ScanType, CoachMetricSpec[]> = {
  health: [
    { metric: 'face_score', interpretationHint: 'higher_is_better', tolerance: 2 },
    { metric: 'perceived_age', interpretationHint: 'lower_is_better', tolerance: 1 },
    {
      metric: 'skin_quality_score',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    {
      metric: 'symmetry_percentage',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    { metric: 'fatigue_level', interpretationHint: 'lower_is_better', tolerance: 2 },
    { metric: 'glow_index', interpretationHint: 'higher_is_better', tolerance: 2 },
    { metric: 'energy_score', interpretationHint: 'higher_is_better', tolerance: 2 },
    {
      metric: 'collagen_level',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    {
      metric: 'hydration_level',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    {
      metric: 'photogenic_score',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
  ],
  body: [
    { metric: 'body_score', interpretationHint: 'higher_is_better', tolerance: 2 },
    {
      metric: 'body_fat_percentage',
      interpretationHint: 'lower_is_better',
      tolerance: 2,
    },
    { metric: 'posture_score', interpretationHint: 'higher_is_better', tolerance: 2 },
    {
      metric: 'waist_estimation_cm',
      interpretationHint: 'lower_is_better',
      tolerance: 1,
    },
    { metric: 'strength_index', interpretationHint: 'higher_is_better', tolerance: 2 },
    { metric: 'body_symmetry', interpretationHint: 'higher_is_better', tolerance: 2 },
    { metric: 'bmi_estimate', interpretationHint: 'neutral_context', tolerance: 1 },
    { metric: 'metabolic_age', interpretationHint: 'lower_is_better', tolerance: 1 },
  ],
  nutrition: [
    {
      metric: 'plate_health_score',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    {
      metric: 'calories_estimate',
      interpretationHint: 'neutral_context',
      tolerance: 25,
    },
    { metric: 'protein_grams', interpretationHint: 'higher_is_better', tolerance: 3 },
    { metric: 'carbs_grams', interpretationHint: 'neutral_context', tolerance: 3 },
    { metric: 'fat_grams', interpretationHint: 'neutral_context', tolerance: 3 },
    { metric: 'satiety_index', interpretationHint: 'higher_is_better', tolerance: 2 },
  ],
  super: [
    {
      metric: 'global_risk_score',
      interpretationHint: 'lower_is_better',
      tolerance: 2,
    },
  ],
};

const PRIMARY_COACH_METRIC_BY_SCAN_TYPE: Record<ScanType, string> = {
  health: 'face_score',
  body: 'body_score',
  nutrition: 'plate_health_score',
  super: 'global_risk_score',
};

const SECONDARY_TREND_METRICS_BY_SCAN_TYPE: Record<ScanType, string[]> = {
  health: ['fatigue_level', 'hydration_level'],
  body: ['body_fat_percentage'],
  nutrition: ['calories_estimate', 'protein_grams'],
  super: ['global_risk_score'],
};

function normalizeLooseToken(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function roundMetricNumber(value: number) {
  return Math.round(value * 100) / 100;
}

function hasOwnKey<T extends object>(
  value: T,
  key: PropertyKey,
): key is keyof T {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function resolveFallbackText(value: unknown) {
  const directText = readOptionalString(value);
  if (directText) {
    return directText;
  }

  if (!isRecord(value)) {
    return null;
  }

  const localized = resolveLocalizedText(value as never, { fallback: '' }).trim();
  return localized.length > 0 ? localized : null;
}

function resolveFallbackTextList(value: unknown) {
  if (Array.isArray(value)) {
    return Array.from(
      new Set(
        value
          .map((item) => resolveFallbackText(item))
          .filter((item): item is string => !!item)
      )
    );
  }

  const text = resolveFallbackText(value);
  if (!text) {
    return [] as string[];
  }

  return Array.from(
    new Set(
      text
        .split(/[,;/&+]+|\bet\b|\band\b/gi)
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    )
  );
}

function shouldIncludeFallbackText(
  text: string | null,
  key: string | null | undefined,
) {
  if (!text) {
    return false;
  }

  if (!key || key === 'unknown') {
    return true;
  }

  return normalizeLooseToken(text) !== normalizeLooseToken(key);
}

function compactFallbackValue(value: unknown): unknown {
  if (value == null) {
    return null;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : null;
  }

  if (Array.isArray(value)) {
    const compactedItems = value
      .map((item) => compactFallbackValue(item))
      .filter((item) => {
        if (item == null) {
          return false;
        }

        if (Array.isArray(item)) {
          return item.length > 0;
        }

        if (isRecord(item)) {
          return Object.keys(item).length > 0;
        }

        return true;
      });

    return compactedItems.length > 0 ? compactedItems : null;
  }

  if (isRecord(value)) {
    const compactedEntries = Object.entries(value).reduce<Record<string, unknown>>(
      (accumulator, [key, nestedValue]) => {
        const compactedValue = compactFallbackValue(nestedValue);

        if (compactedValue == null) {
          return accumulator;
        }

        if (Array.isArray(compactedValue) && compactedValue.length === 0) {
          return accumulator;
        }

        if (isRecord(compactedValue) && Object.keys(compactedValue).length === 0) {
          return accumulator;
        }

        accumulator[key] = compactedValue;
        return accumulator;
      },
      {},
    );

    return Object.keys(compactedEntries).length > 0 ? compactedEntries : null;
  }

  return value;
}

function finalizeFallbackFields(fields: Record<string, unknown>) {
  const compactedFields = compactFallbackValue(fields);

  return isRecord(compactedFields) ? compactedFields : null;
}

function createCoachRichKeyMetrics(
  normalized: CoachNormalizedAnalysisResult,
): CoachKeyMetrics {
  switch (normalized.scan_type) {
    case 'face':
      return {
        face_score: normalized.face_score,
        perceived_age: normalized.perceived_age,
        skin_quality_score: normalized.skin_quality_score,
        symmetry_percentage: normalized.symmetry_percentage,
        fatigue_level: normalized.fatigue_level,
        glow_index: normalized.glow_index ?? null,
        energy_score: normalized.energy_score ?? null,
        face_shape_key: normalized.face_shape_key,
        collagen_level: normalized.collagen_level,
        hydration_level: normalized.hydration_level,
        photogenic_score: normalized.photogenic_score,
      };
    case 'body':
      return {
        body_score: normalized.body_score,
        body_fat_percentage: normalized.body_fat_percentage,
        muscle_mass_key: normalized.muscle_mass_key,
        body_type_key: normalized.body_type_key,
        posture_score: normalized.posture_score,
        waist_estimation_cm: normalized.waist_estimation_cm,
        strength_index: normalized.strength_index,
        body_symmetry: normalized.body_symmetry,
        bmi_estimate: normalized.bmi_estimate,
        metabolic_age: normalized.metabolic_age,
      };
    case 'nutrition':
      return {
        plate_health_score: normalized.plate_health_score,
        calories_estimate: normalized.calories_estimate,
        protein_grams: normalized.protein_grams,
        carbs_grams: normalized.carbs_grams,
        fat_grams: normalized.fat_grams,
        verdict_key: normalized.verdict_key,
        glycemic_index_key: normalized.glycemic_index_key,
        satiety_index: normalized.satiety_index,
        ingredient_quality_key: normalized.ingredient_quality_key,
        main_vitamin_keys: normalized.main_vitamin_keys,
      };
    case 'super_health_v2':
      return {
        global_risk_score: normalized.global_risk_score,
        urgency_flag: normalized.urgency_flag,
        summary_key: normalized.summary_key,
        disclaimer_key: normalized.disclaimer_key,
        detected_conditions: normalized.detected_conditions,
      };
    default:
      throw new Error('Unsupported coach analysis type');
  }
}

function createCoachDigestMetrics(
  normalized: CoachNormalizedAnalysisResult,
) {
  switch (normalized.scan_type) {
    case 'face':
      return {
        face_score: normalized.face_score,
        perceived_age: normalized.perceived_age,
        symmetry_percentage: normalized.symmetry_percentage,
        fatigue_level: normalized.fatigue_level,
        glow_index: normalized.glow_index,
        hydration_level: normalized.hydration_level,
      };
    case 'body':
      return {
        body_score: normalized.body_score,
        body_fat_percentage: normalized.body_fat_percentage,
        muscle_mass_key: normalized.muscle_mass_key,
        body_type_key: normalized.body_type_key,
        posture_score: normalized.posture_score,
        strength_index: normalized.strength_index,
      };
    case 'nutrition':
      return {
        plate_health_score: normalized.plate_health_score,
        calories_estimate: normalized.calories_estimate,
        protein_grams: normalized.protein_grams,
        carbs_grams: normalized.carbs_grams,
        fat_grams: normalized.fat_grams,
        verdict_key: normalized.verdict_key,
        glycemic_index_key: normalized.glycemic_index_key,
      };
    case 'super_health_v2':
      return {
        global_risk_score: normalized.global_risk_score,
        urgency_flag: normalized.urgency_flag,
        summary_key: normalized.summary_key,
        detected_conditions: normalized.detected_conditions
          .slice(0, 3)
          .map((condition) => ({
            condition_key: condition.condition_key,
            severity_key: condition.severity_key,
            probability: condition.probability,
          })),
      };
    default:
      return {};
  }
}

function createCoachRawFallbackFields(
  raw: Record<string, unknown> | null,
  normalized: CoachNormalizedAnalysisResult,
) {
  if (!raw) {
    return null;
  }

  switch (normalized.scan_type) {
    case 'face': {
      const faceShapeText = resolveFallbackText(
        raw.face_shape_fallback_text ?? raw.face_shape_i18n ?? raw.face_shape,
      );
      return finalizeFallbackFields({
        ...(shouldIncludeFallbackText(faceShapeText, normalized.face_shape_key)
          ? { face_shape_text: faceShapeText }
          : {}),
      });
    }
    case 'body': {
      const bodyTypeText = resolveFallbackText(
        raw.body_type_fallback_text ?? raw.body_type_i18n ?? raw.body_type,
      );
      const muscleMassText = resolveFallbackText(
        raw.muscle_mass_fallback_text ??
          raw.muscle_mass_label_i18n ??
          raw.muscle_mass_label,
      );
      return finalizeFallbackFields({
        ...(shouldIncludeFallbackText(bodyTypeText, normalized.body_type_key)
          ? { body_type_text: bodyTypeText }
          : {}),
        ...(shouldIncludeFallbackText(
          muscleMassText,
          normalized.muscle_mass_key,
        )
          ? { muscle_mass_text: muscleMassText }
          : {}),
      });
    }
    case 'nutrition': {
      const verdictText = resolveFallbackText(
        raw.verdict_fallback_text ?? raw.short_verdict_i18n ?? raw.short_verdict,
      );
      const glycemicIndexText = resolveFallbackText(
        raw.glycemic_index_label_i18n ?? raw.glycemic_index_label,
      );
      const ingredientQualityText = resolveFallbackText(
        raw.ingredient_quality_i18n ?? raw.ingredient_quality,
      );
      const mainVitaminsText = resolveFallbackTextList(
        raw.main_vitamins_fallback_text ??
          raw.main_vitamins_i18n ??
          raw.main_vitamins ??
          raw.main_vitamin_keys,
      );

      return finalizeFallbackFields({
        ...(shouldIncludeFallbackText(verdictText, normalized.verdict_key)
          ? { verdict_text: verdictText }
          : {}),
        ...(shouldIncludeFallbackText(
          glycemicIndexText,
          normalized.glycemic_index_key,
        )
          ? { glycemic_index_text: glycemicIndexText }
          : {}),
        ...(shouldIncludeFallbackText(
          ingredientQualityText,
          normalized.ingredient_quality_key,
        )
          ? { ingredient_quality_text: ingredientQualityText }
          : {}),
        ...(mainVitaminsText.length > 0
          ? { main_vitamins_text: mainVitaminsText }
          : {}),
      });
    }
    case 'super_health_v2': {
      const analysisSummaryText = resolveFallbackText(
        raw.analysis_summary_i18n ??
          raw.summary_fallback_text ??
          raw.analysis_summary,
      );
      const disclaimerText = resolveFallbackText(
        raw.disclaimer_text_i18n ??
          raw.disclaimer_fallback_text ??
          raw.disclaimer_text,
      );
      const rawConditions = Array.isArray(raw.detected_conditions)
        ? raw.detected_conditions.filter(isRecord)
        : [];
      const conditionTexts = rawConditions
        .map((condition, index) => {
          const normalizedCondition = normalized.detected_conditions[index];
          const conditionNameText = resolveFallbackText(
            condition.condition_name_i18n ?? condition.condition_name,
          );
          const categoryText = resolveFallbackText(
            condition.category_i18n ?? condition.category,
          );
          const explanationText = resolveFallbackText(
            condition.explanation_i18n ?? condition.explanation,
          );
          const adviceText = resolveFallbackText(
            condition.actionable_advice_i18n ?? condition.actionable_advice,
          );
          const fields = {
            ...(shouldIncludeFallbackText(
              conditionNameText,
              normalizedCondition?.condition_key,
            )
              ? { condition_name_text: conditionNameText }
              : {}),
            ...(shouldIncludeFallbackText(
              categoryText,
              normalizedCondition?.category_key,
            )
              ? { category_text: categoryText }
              : {}),
            ...(shouldIncludeFallbackText(
              explanationText,
              normalizedCondition?.explanation_key,
            )
              ? { explanation_text: explanationText }
              : {}),
            ...(shouldIncludeFallbackText(
              adviceText,
              normalizedCondition?.advice_key,
            )
              ? { advice_text: adviceText }
              : {}),
          };

          if (Object.keys(fields).length === 0) {
            return null;
          }

          return {
            ...(normalizedCondition
              ? { condition_key: normalizedCondition.condition_key }
              : {}),
            ...fields,
          };
        })
        .filter((item): item is Record<string, unknown> => !!item);

      return finalizeFallbackFields({
        ...(shouldIncludeFallbackText(
          analysisSummaryText,
          normalized.summary_key,
        )
          ? {
              analysis_summary_text: analysisSummaryText,
            }
          : {}),
        ...(shouldIncludeFallbackText(disclaimerText, normalized.disclaimer_key)
          ? {
              disclaimer_text: disclaimerText,
            }
          : {}),
        ...(conditionTexts.length > 0 ? { condition_texts: conditionTexts } : {}),
      });
    }
    default:
      return null;
  }
}

function readNumericMetricValue(
  keyMetrics: CoachKeyMetrics,
  metric: string,
) {
  if (!hasOwnKey(keyMetrics, metric)) {
    return null;
  }

  const value = keyMetrics[metric];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getMetricSpec(scanType: ScanType, metric: string) {
  return COACH_METRIC_SPECS[scanType].find((item) => item.metric === metric) ?? null;
}

function getMetricDirection(
  delta: number,
  tolerance: number,
): CoachMetricDirection {
  if (Math.abs(delta) <= tolerance) {
    return 'stable';
  }

  return delta > 0 ? 'up' : 'down';
}

function createMetricDelta(
  metric: string,
  currentValue: number,
  previousValue: number,
  spec: CoachMetricSpec,
): CoachMetricDelta {
  const delta = roundMetricNumber(currentValue - previousValue);

  return {
    metric,
    current_value: roundMetricNumber(currentValue),
    previous_value: roundMetricNumber(previousValue),
    delta,
    direction: getMetricDirection(delta, spec.tolerance),
    interpretation_hint: spec.interpretationHint,
  };
}

function createUnavailableComparison(): CoachComparisonToPrevious {
  return {
    available: false,
    compared_scan_id: null,
    metric_deltas: [],
  };
}

function buildComparisonToPrevious(
  currentScan: CoachSourceScan | null,
  previousScan: CoachSourceScan | null,
): CoachComparisonToPrevious {
  if (!currentScan || !previousScan) {
    return createUnavailableComparison();
  }

  const metricDeltas = COACH_METRIC_SPECS[currentScan.scan_type]
    .map((spec) => {
      const currentValue = readNumericMetricValue(currentScan.key_metrics, spec.metric);
      const previousValue = readNumericMetricValue(previousScan.key_metrics, spec.metric);

      if (currentValue === null || previousValue === null) {
        return null;
      }

      return createMetricDelta(spec.metric, currentValue, previousValue, spec);
    })
    .filter((item): item is CoachMetricDelta => !!item);

  if (metricDeltas.length === 0) {
    return createUnavailableComparison();
  }

  return {
    available: true,
    compared_scan_id: previousScan.id,
    metric_deltas: metricDeltas,
  };
}

function classifyMetricChange(
  metricDelta: Pick<CoachMetricDelta, 'direction' | 'interpretation_hint'> | null,
) {
  if (!metricDelta || metricDelta.direction === 'stable') {
    return 'stable';
  }

  if (metricDelta.interpretation_hint === 'neutral_context') {
    return 'contextual';
  }

  if (
    (metricDelta.interpretation_hint === 'higher_is_better' &&
      metricDelta.direction === 'up') ||
    (metricDelta.interpretation_hint === 'lower_is_better' &&
      metricDelta.direction === 'down')
  ) {
    return 'improvement';
  }

  return 'decline';
}

function hasNewSuperCondition(
  currentScan: CoachSourceScan,
  previousScan: CoachSourceScan | null,
) {
  if (
    currentScan.normalized.scan_type !== 'super_health_v2' ||
    previousScan?.normalized.scan_type !== 'super_health_v2'
  ) {
    return false;
  }

  const previousConditionKeys = new Set(
    previousScan.normalized.detected_conditions
      .map((condition) => condition.condition_key)
      .filter((conditionKey) => conditionKey !== 'unknown')
  );

  return currentScan.normalized.detected_conditions.some(
    (condition) =>
      condition.condition_key !== 'unknown' &&
      !previousConditionKeys.has(condition.condition_key),
  );
}

function buildCoachRelevantFlags(
  currentScan: CoachSourceScan,
  previousScan: CoachSourceScan | null,
  comparison: CoachComparisonToPrevious,
): CoachRelevantFlag[] {
  const flags = new Set<CoachRelevantFlag>();
  const primaryMetric = PRIMARY_COACH_METRIC_BY_SCAN_TYPE[currentScan.scan_type];
  const primaryMetricDelta =
    comparison.metric_deltas.find((item) => item.metric === primaryMetric) ?? null;
  const primaryMetricChange = classifyMetricChange(primaryMetricDelta);

  if (primaryMetricChange === 'improvement') {
    flags.add('has_recent_improvement');
  }

  if (primaryMetricChange === 'decline') {
    flags.add('has_recent_decline');
  }

  switch (currentScan.scan_type) {
    case 'health': {
      const hydrationLevel = readNumericMetricValue(
        currentScan.key_metrics,
        'hydration_level',
      );
      const fatigueLevel = readNumericMetricValue(
        currentScan.key_metrics,
        'fatigue_level',
      );

      if (hydrationLevel !== null && hydrationLevel < 40) {
        flags.add('low_hydration');
      }

      if (fatigueLevel !== null && fatigueLevel > 60) {
        flags.add('high_fatigue');
      }
      break;
    }
    case 'body': {
      const bodyFatPercentage = readNumericMetricValue(
        currentScan.key_metrics,
        'body_fat_percentage',
      );

      if (bodyFatPercentage !== null && bodyFatPercentage >= 30) {
        flags.add('high_body_fat');
      }
      break;
    }
    case 'nutrition': {
      const proteinGrams = readNumericMetricValue(
        currentScan.key_metrics,
        'protein_grams',
      );

      if (proteinGrams !== null && proteinGrams < 20) {
        flags.add('low_protein');
      }
      break;
    }
    case 'super': {
      const globalRiskScore = readNumericMetricValue(
        currentScan.key_metrics,
        'global_risk_score',
      );

      if (globalRiskScore !== null && globalRiskScore >= 70) {
        flags.add('high_risk_scan');
      }

      if (
        currentScan.normalized.scan_type === 'super_health_v2' &&
        currentScan.normalized.urgency_flag
      ) {
        flags.add('urgent_attention_flag');
      }

      if (hasNewSuperCondition(currentScan, previousScan)) {
        flags.add('new_condition_detected');
      }
      break;
    }
    default:
      break;
  }

  return Array.from(flags);
}

function createCoachScanRichContext(
  currentScan: CoachSourceScan,
  previousScan: CoachSourceScan | null,
): CoachScanRichContext {
  const comparison = buildComparisonToPrevious(currentScan, previousScan);

  return {
    scan_id: currentScan.id,
    scan_type: currentScan.scan_type,
    normalized_scan_type: currentScan.normalized.scan_type,
    captured_at: currentScan.captured_at,
    analysis_result_normalized: currentScan.normalized,
    key_metrics: currentScan.key_metrics,
    raw_fallback_fields: currentScan.raw_fallback_fields,
    coach_relevant_flags: buildCoachRelevantFlags(
      currentScan,
      previousScan,
      comparison,
    ),
  };
}

function findPreviousScanByType(
  scans: CoachSourceScan[],
  currentScan: CoachSourceScan,
) {
  const currentIndex = scans.findIndex((scan) => scan.id === currentScan.id);
  if (currentIndex < 0) {
    return null;
  }

  return (
    scans
      .slice(currentIndex + 1)
      .find((scan) => scan.scan_type === currentScan.scan_type) ?? null
  );
}

function buildRichContextByScanId(scans: CoachSourceScan[]) {
  return new Map(
    scans.map((scan) => [
      scan.id,
      createCoachScanRichContext(scan, findPreviousScanByType(scans, scan)),
    ])
  );
}

function createUnavailableTrendSummary(
  scanType: ScanType | null,
): CoachTrendSummary {
  return {
    available: false,
    scan_type: scanType,
    summary_flags: [],
    score_trend: null,
    metric_trends: [],
  };
}

function createTrendMetric(
  metric: string,
  scans: CoachSourceScan[],
  spec: CoachMetricSpec,
): CoachTrendMetric | null {
  if (scans.length < COACH_TREND_SAMPLE_COUNT) {
    return null;
  }

  const latestValue = readNumericMetricValue(scans[0].key_metrics, metric);
  const middleValue = readNumericMetricValue(scans[1].key_metrics, metric);
  const earliestValue = readNumericMetricValue(scans[2].key_metrics, metric);

  if (
    latestValue === null ||
    middleValue === null ||
    earliestValue === null
  ) {
    return null;
  }

  const latestDirection = getMetricDirection(
    roundMetricNumber(latestValue - middleValue),
    spec.tolerance,
  );
  const previousDirection = getMetricDirection(
    roundMetricNumber(middleValue - earliestValue),
    spec.tolerance,
  );

  if (latestDirection !== previousDirection) {
    return null;
  }

  const delta = roundMetricNumber(latestValue - earliestValue);

  return {
    metric,
    current_value: roundMetricNumber(latestValue),
    previous_value: roundMetricNumber(earliestValue),
    delta,
    direction: latestDirection,
    interpretation_hint: spec.interpretationHint,
    sample_count: COACH_TREND_SAMPLE_COUNT,
  };
}

function buildTrendSummaryFlag(
  metric: string,
  trendMetric: CoachTrendMetric,
  isPrimaryMetric: boolean,
) {
  const changeType = classifyMetricChange(trendMetric);

  if (isPrimaryMetric) {
    if (changeType === 'improvement') {
      return 'score_improving';
    }

    if (changeType === 'decline') {
      return 'score_declining';
    }

    if (changeType === 'stable') {
      return 'score_stable';
    }

    return 'score_context_shift';
  }

  switch (metric) {
    case 'fatigue_level':
      return trendMetric.direction === 'up'
        ? 'fatigue_increasing'
        : trendMetric.direction === 'down'
          ? 'fatigue_decreasing'
          : 'fatigue_stable';
    case 'hydration_level':
      return trendMetric.direction === 'up'
        ? 'hydration_increasing'
        : trendMetric.direction === 'down'
          ? 'hydration_decreasing'
          : 'hydration_stable';
    case 'body_fat_percentage':
      return trendMetric.direction === 'up'
        ? 'body_fat_increasing'
        : trendMetric.direction === 'down'
          ? 'body_fat_decreasing'
          : 'body_fat_stable';
    case 'calories_estimate':
      return trendMetric.direction === 'up'
        ? 'calories_increasing'
        : trendMetric.direction === 'down'
          ? 'calories_decreasing'
          : 'calories_stable';
    case 'protein_grams':
      return trendMetric.direction === 'up'
        ? 'protein_increasing'
        : trendMetric.direction === 'down'
          ? 'protein_decreasing'
          : 'protein_stable';
    case 'global_risk_score':
      return trendMetric.direction === 'up'
        ? 'risk_increasing'
        : trendMetric.direction === 'down'
          ? 'risk_decreasing'
          : 'risk_stable';
    default:
      return `${metric}_${trendMetric.direction}`;
  }
}

function buildTrendSummary(
  selectedScan: CoachSourceScan | null,
  scans: CoachSourceScan[],
): CoachTrendSummary {
  if (!selectedScan) {
    return createUnavailableTrendSummary(null);
  }

  const sameTypeScans = scans
    .filter((scan) => scan.scan_type === selectedScan.scan_type)
    .slice(0, COACH_TREND_SAMPLE_COUNT);

  if (sameTypeScans.length < COACH_TREND_SAMPLE_COUNT) {
    return createUnavailableTrendSummary(selectedScan.scan_type);
  }

  const primaryMetric = PRIMARY_COACH_METRIC_BY_SCAN_TYPE[selectedScan.scan_type];
  const primaryMetricSpec = getMetricSpec(selectedScan.scan_type, primaryMetric);
  const scoreTrend =
    primaryMetricSpec
      ? createTrendMetric(primaryMetric, sameTypeScans, primaryMetricSpec)
      : null;

  const metricTrends = SECONDARY_TREND_METRICS_BY_SCAN_TYPE[selectedScan.scan_type]
    .filter((metric) => metric !== primaryMetric)
    .map((metric) => {
      const metricSpec = getMetricSpec(selectedScan.scan_type, metric);
      return metricSpec ? createTrendMetric(metric, sameTypeScans, metricSpec) : null;
    })
    .filter((item): item is CoachTrendMetric => !!item);

  if (!scoreTrend && metricTrends.length === 0) {
    return createUnavailableTrendSummary(selectedScan.scan_type);
  }

  const summaryFlags = Array.from(
    new Set(
      [
        ...(scoreTrend
          ? [buildTrendSummaryFlag(primaryMetric, scoreTrend, true)]
          : []),
        ...metricTrends.map((item) =>
          buildTrendSummaryFlag(item.metric, item, false)
        ),
      ].filter((item): item is string => item.length > 0)
    )
  );

  return {
    available: true,
    scan_type: selectedScan.scan_type,
    summary_flags: summaryFlags,
    score_trend: scoreTrend,
    metric_trends: metricTrends,
  };
}

function buildLatestByTypeRichContexts(
  scans: CoachSourceScan[],
  richContextByScanId: Map<string, CoachScanRichContext>,
) {
  const latestHealthScan = findLatestScanByType(scans, 'health');
  const latestBodyScan = findLatestScanByType(scans, 'body');
  const latestNutritionScan = findLatestScanByType(scans, 'nutrition');
  const latestSuperScan = findLatestScanByType(scans, 'super');

  return {
    health: latestHealthScan
      ? richContextByScanId.get(latestHealthScan.id) ?? null
      : null,
    body: latestBodyScan
      ? richContextByScanId.get(latestBodyScan.id) ?? null
      : null,
    nutrition: latestNutritionScan
      ? richContextByScanId.get(latestNutritionScan.id) ?? null
      : null,
    super: latestSuperScan
      ? richContextByScanId.get(latestSuperScan.id) ?? null
      : null,
  };
}

function buildPriorScans(
  selectedScan: CoachSourceScan | null,
  scans: CoachSourceScan[],
  richContextByScanId: Map<string, CoachScanRichContext>,
  priorLimit: number,
) {
  if (!selectedScan) {
    return [] as CoachScanRichContext[];
  }

  const sameTypeScans = scans.filter(
    (scan) =>
      scan.id !== selectedScan.id && scan.scan_type === selectedScan.scan_type,
  );
  const otherScans = scans.filter(
    (scan) =>
      scan.id !== selectedScan.id && scan.scan_type !== selectedScan.scan_type,
  );

  return [...sameTypeScans, ...otherScans]
    .slice(0, Math.max(0, priorLimit))
    .map((scan) => richContextByScanId.get(scan.id) ?? null)
    .filter((item): item is CoachScanRichContext => !!item);
}

function parseCoachEntryRow(row: unknown): CoachEntry | null {
  if (!isRecord(row)) {
    return null;
  }

  const id = readRequiredString(row.id);
  const createdAt = readRequiredString(row.created_at);
  const title = readOptionalString(row.title);
  const body = readOptionalString(row.body);
  const rawPersonaKey = readOptionalString(row.persona_key);
  const hasValidPersona = isCoachPersonaKey(rawPersonaKey);
  const locale = readOptionalString(row.locale);
  const status =
    row.status === 'pending' || row.status === 'ready' || row.status === 'error'
      ? row.status
      : null;
  const requestPayloadJson = isRecord(row.request_payload_json)
    ? row.request_payload_json
    : null;
  const promptType =
    normalizeCoachPromptType(row.prompt_type) ??
    normalizeCoachPromptType(requestPayloadJson?.prompt_type);

  if (!id || !createdAt) {
    return null;
  }

  if ((status ?? 'ready') === 'ready' && (!title || !body)) {
    return null;
  }

  const responseVersion: CoachResponseVersion | null = isCoachResponseVersion(
    row.response_version,
  )
    ? row.response_version
    : row.response_version == null
      ? null
      : 1;
  const contentSource = isRecord(row.content_json)
    ? row.content_json
    : typeof row.content_json === 'string'
      ? safeParseJsonRecord(row.content_json)
      : null;
  const parsedContent = contentSource
    ? parseCoachStructuredContent(contentSource, {
        fallbackTitle: title,
      }).content
    : null;

  return {
    id,
    title: title ?? null,
    body: body ?? null,
    disclaimer:
      readOptionalString(row.disclaimer) ?? getDefaultCoachDisclaimer(locale),
    persona_key: readCoachPersonaKey(rawPersonaKey),
    has_valid_persona: hasValidPersona,
    prompt_type: promptType,
    response_version: responseVersion,
    content: parsedContent,
    cta_label: readOptionalString(row.cta_label),
    cta_route: readOptionalString(row.cta_route),
    created_at: createdAt,
    source: readOptionalString(row.source),
    locale,
    user_id: readOptionalString(row.user_id) ?? undefined,
    status,
    error_code: readOptionalString(row.error_code),
    cache_key: readOptionalString(row.cache_key),
    input_hash: readOptionalString(row.input_hash),
    request_payload_json: requestPayloadJson,
    response_payload_json: isRecord(row.response_payload_json)
      ? row.response_payload_json
      : null,
    expires_at: readOptionalString(row.expires_at),
    generated_at: readOptionalString(row.generated_at),
  };
}

function safeParseJsonRecord(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeCoachHistoryPageSize(limit = 10) {
  if (!Number.isFinite(limit)) {
    return 10;
  }

  return Math.min(Math.max(Math.trunc(limit), 1), 50);
}

function buildCoachHistorySortTimestamp(
  entry:
    | Pick<CoachEntry, 'generated_at' | 'created_at'>
    | Pick<CoachHistoryPageRpcRow, 'generated_at' | 'created_at'>,
) {
  return readOptionalString(entry.generated_at) ?? readOptionalString(entry.created_at);
}

function encodeCoachHistoryCursor(cursor: CoachHistoryCursor) {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64');
}

function decodeCoachHistoryCursor(cursor: string | null | undefined): CoachHistoryCursor | null {
  if (!cursor) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64').toString('utf8'));

    if (!isRecord(parsed)) {
      return null;
    }

    const sortAt = readRequiredString(parsed.sortAt);
    const createdAt = readRequiredString(parsed.createdAt);
    const id = readRequiredString(parsed.id);

    if (!sortAt || !createdAt || !id) {
      return null;
    }

    return {
      sortAt,
      createdAt,
      id,
    };
  } catch {
    return null;
  }
}

function createCoachHistoryCursorFromEntry(entry: CoachHistoryPageRpcRow | CoachEntry) {
  const sortAt = buildCoachHistorySortTimestamp(entry);
  const createdAt = readOptionalString(entry.created_at);
  const id = readOptionalString(entry.id);

  if (!sortAt || !createdAt || !id) {
    return null;
  }

  return encodeCoachHistoryCursor({
    sortAt,
    createdAt,
    id,
  });
}

function parseCoachHistoryPageRow(row: unknown): RenderableCoachEntry | null {
  const entry = parseCoachEntryRow(row);

  return isRenderableCoachEntry(entry) ? entry : null;
}

function parseCoachHistorySummaryRow(row: unknown): CoachHistorySummary {
  if (!isRecord(row)) {
    return {
      total_count: 0,
      latest_entry_at: null,
    };
  }

  return {
    total_count: Math.max(readOptionalInteger(row.total_count) ?? 0, 0),
    latest_entry_at: readOptionalString(row.latest_entry_at),
  };
}

function parseCoachGenerateResponse(
  payload: unknown,
  locale?: string | null,
): CoachGenerateResponse {
  if (!isRecord(payload) || payload.success !== true) {
    throw new CoachServiceError('Coach generation returned an invalid payload', {
      code: 'invalid_coach_response',
      status: 502,
      details: payload,
    });
  }

  const entryId = readRequiredString(payload.entry_id);
  if (!entryId) {
    throw new CoachServiceError('Coach response is missing entry_id', {
      code: 'invalid_coach_response',
      status: 502,
      details: payload,
    });
  }

  const title = readOptionalString(payload.title);
  const responseVersion: CoachResponseVersion = isCoachResponseVersion(
    payload.response_version,
  )
    ? payload.response_version
    : 1;
  const contentSource = isRecord(payload.content) ? payload.content : null;
  const parsedContent = contentSource
    ? parseCoachStructuredContent(contentSource, { fallbackTitle: title }).content
    : null;

  return {
    success: true,
    cached: payload.cached === true,
    entry_id: entryId,
    persona_key: readCoachPersonaKey(payload.persona_key),
    prompt_type: normalizeCoachPromptType(payload.prompt_type),
    response_version: parsedContent ? 2 : responseVersion,
    status:
      payload.status === 'pending' ||
      payload.status === 'ready' ||
      payload.status === 'error'
        ? payload.status
        : 'error',
    title,
    body: readOptionalString(payload.body),
    disclaimer:
      readOptionalString(payload.disclaimer) ?? getDefaultCoachDisclaimer(locale),
    cta_label: readOptionalString(payload.cta_label),
    cta_route: readOptionalString(payload.cta_route),
    content: parsedContent,
    source: readOptionalString(payload.source),
    expires_at: readOptionalString(payload.expires_at),
    response_payload_json: isRecord(payload.response_payload_json)
      ? payload.response_payload_json
      : {},
    quota: parseCoachQuotaStatus(payload.quota),
  };
}

function hasCoachEntryContent(
  entry: CoachEntry | null | undefined,
): entry is CoachEntry & { title: string; body: string } {
  return !!entry &&
    typeof entry.title === 'string' &&
    entry.title.trim().length > 0 &&
    typeof entry.body === 'string' &&
    entry.body.trim().length > 0;
}

export function parseCoachSourceScan(row: unknown): CoachSourceScan | null {
  const scanRow = row as CoachScanRow;
  const id = readRequiredString(scanRow.id);
  const scanType = scanRow.scan_type;
  const createdAt =
    readOptionalString(scanRow.analyzed_at) ??
    readOptionalString(scanRow.created_at);

  if (
    !id ||
    !createdAt ||
    (scanType !== 'health' &&
      scanType !== 'body' &&
      scanType !== 'nutrition' &&
      scanType !== 'super')
  ) {
    return null;
  }

  if (
    scanType === 'super' &&
    getAnalysisResultScanType(scanRow.analysis_result) === 'fat_distribution_scan_v2'
  ) {
    // MVP bypass: do not derive legacy Coach semantics from the new Super Scan format.
    return null;
  }

  const normalized = tryNormalizeAnalysisResult(scanRow.analysis_result, {
    expectedScanType: scanType,
  });
  if (!normalized) {
    return null;
  }

  if (normalized.scan_type === 'fat_distribution_scan_v2') {
    // MVP bypass: the new Super format is stored, but coach still consumes legacy semantics.
    return null;
  }

  const rawAnalysisResult = isRecord(scanRow.analysis_result)
    ? (scanRow.analysis_result as Record<string, unknown>)
    : null;
  const keyMetrics = createCoachRichKeyMetrics(normalized);

  return {
    id,
    scan_type: scanType,
    captured_at: createdAt,
    normalized,
    key_metrics: keyMetrics,
    raw_fallback_fields: createCoachRawFallbackFields(
      rawAnalysisResult,
      normalized,
    ),
    digest: {
      scan_id: id,
      scan_type: scanType,
      captured_at: createdAt,
      normalized_scan_type: normalized.scan_type,
      metrics: createCoachDigestMetrics(normalized),
    },
  };
}

function findLatestScanByType(scans: CoachSourceScan[], scanType: ScanType) {
  return scans.find((scan) => scan.scan_type === scanType) ?? null;
}

function resolveSelectedScanForPrompt(
  promptType: CoachPromptType,
  scans: CoachSourceScan[],
) {
  switch (promptType) {
    case 'nutrition_focus':
      return findLatestScanByType(scans, 'nutrition') ?? scans[0] ?? null;
    case 'body_focus':
      return findLatestScanByType(scans, 'body') ?? scans[0] ?? null;
    case 'face_focus':
      return findLatestScanByType(scans, 'health') ?? scans[0] ?? null;
    case 'hydration_focus':
      return (
        findLatestScanByType(scans, 'health') ??
        findLatestScanByType(scans, 'nutrition') ??
        scans[0] ??
        null
      );
    case 'sleep_coach':
      return (
        findLatestScanByType(scans, 'health') ??
        findLatestScanByType(scans, 'body') ??
        scans[0] ??
        null
      );
    case 'risk_watch':
      return findLatestScanByType(scans, 'super') ?? scans[0] ?? null;
    case 'recovery_plan':
    case 'trend_review':
    case 'weekly_plan':
    case 'latest_scan':
    default:
      return scans[0] ?? null;
  }
}

function selectRecentScansForPrompt(
  promptType: CoachPromptType,
  scans: CoachSourceScan[],
): CoachSourceScan[] {
  const quota = getCoachPromptScanQuota(promptType);
  const windowedScans =
    typeof quota.recentWindowDays === 'number'
      ? getScansWithinLastDays(scans, quota.recentWindowDays)
      : scans;

  if (!quota.typeFilter || quota.typeFilter.length === 0) {
    return windowedScans.slice(0, quota.recentLimit);
  }

  const preferredSet = new Set<string>(quota.typeFilter);
  const preferred: CoachSourceScan[] = [];
  const rest: CoachSourceScan[] = [];
  for (const scan of windowedScans) {
    if (preferredSet.has(scan.scan_type as string)) {
      preferred.push(scan);
    } else {
      rest.push(scan);
    }
  }

  const merged = [...preferred, ...rest];
  return merged.slice(0, quota.recentLimit);
}

function getScansWithinLastDays(scans: CoachSourceScan[], days: number) {
  const now = Date.now();
  const cutoffMs = now - days * 24 * 60 * 60 * 1000;

  return scans.filter((scan) => {
    const timestamp = Date.parse(scan.captured_at);
    return Number.isFinite(timestamp) && timestamp >= cutoffMs;
  });
}

export function buildCoachPayload(
  promptType: CoachPromptType,
  scans: CoachSourceScan[],
): CoachGuidancePayload {
  const quota = getCoachPromptScanQuota(promptType);
  const selectedScan = resolveSelectedScanForPrompt(promptType, scans);
  const selectedScanPrevious = selectedScan
    ? findPreviousScanByType(scans, selectedScan)
    : null;
  const scansWithinWeek = getScansWithinLastDays(scans, 7);
  const recentScans = selectRecentScansForPrompt(promptType, scans);
  const richContextByScanId = buildRichContextByScanId(scans);
  const latestByType = buildLatestByTypeRichContexts(scans, richContextByScanId);
  const byType =
    promptType === 'weekly_plan' || promptType === 'trend_review'
      ? {
          health: findLatestScanByType(scans, 'health')?.digest ?? null,
          body: findLatestScanByType(scans, 'body')?.digest ?? null,
          nutrition: findLatestScanByType(scans, 'nutrition')?.digest ?? null,
          super: findLatestScanByType(scans, 'super')?.digest ?? null,
        }
      : undefined;

  return {
    payload_version: 2,
    prompt_type: promptType,
    generated_at: new Date().toISOString(),
    scan_count_7d: scansWithinWeek.length,
    selected_scan: selectedScan?.digest ?? null,
    recent_scans: recentScans.map((scan) => scan.digest),
    latest_scan: selectedScan
      ? richContextByScanId.get(selectedScan.id) ?? null
      : null,
    prior_scans: buildPriorScans(
      selectedScan,
      scans,
      richContextByScanId,
      quota.priorLimit,
    ),
    latest_by_type: latestByType,
    comparison_to_previous: buildComparisonToPrevious(
      selectedScan,
      selectedScanPrevious,
    ),
    trend_summary: buildTrendSummary(selectedScan, scans),
    ...(byType ? { by_type: byType } : {}),
  };
}

function buildGuidanceResultFromEntry(
  entry: CoachEntry & { title: string; body: string },
  payload: CoachGuidancePayload,
  fallback: boolean,
): CoachGuidanceResult {
  return {
    success: true,
    cached: true,
    entry_id: entry.id,
    persona_key: entry.persona_key,
    prompt_type: entry.prompt_type ?? payload.prompt_type ?? null,
    response_version: entry.content ? 2 : (entry.response_version ?? 1),
    status: entry.status ?? 'ready',
    title: entry.title,
    body: entry.body,
    disclaimer: entry.disclaimer,
    cta_label: entry.cta_label,
    cta_route: entry.cta_route,
    content: entry.content ?? null,
    source: entry.source,
    expires_at: entry.expires_at ?? null,
    response_payload_json: entry.response_payload_json ?? {},
    quota: null,
    fallback,
    payload,
  };
}

function shouldFallbackToCachedCoachEntry(error: unknown) {
  if (!(error instanceof CoachServiceError)) {
    return true;
  }

  if (
    error.code === COACH_PROVIDER_NOT_CONFIGURED_ERROR_CODE ||
    error.code === 'invalid_coach_response' ||
    error.code === 'coach_entries_unavailable' ||
    error.code === 'coach_entries_schema_mismatch' ||
    error.code === 'coach_entries_policy_denied' ||
    error.code === 'coach_scans_unavailable' ||
    error.code === 'coach_scans_schema_mismatch' ||
    error.code === 'coach_scans_policy_denied' ||
    error.code === COACH_NO_USABLE_SCAN_ERROR_CODE ||
    error.code === COACH_QUOTA_EXHAUSTED_ERROR_CODE ||
    error.code === COACH_QUOTA_STATUS_UNAVAILABLE_ERROR_CODE
  ) {
    return false;
  }

  return (error.status ?? 500) >= 500;
}

export async function fetchCoachEntries(limit?: number): Promise<CoachEntry[]> {
  try {
    let query = supabase
      .from('coach_entries')
      .select('*')
      .order('updated_at', { ascending: false })
      .order('created_at', { ascending: false });

    if (typeof limit === 'number') {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) {
      const coachError = createCoachEntriesReadError(error);

      logOperationalError('[Coach] Failed to fetch coach entries', coachError, {
        limit: typeof limit === 'number' ? limit : 'all',
      });
      throw coachError;
    }

    return (Array.isArray(data) ? data : [])
      .map(parseCoachEntryRow)
      .filter((item): item is CoachEntry => item !== null);
  } catch (error) {
    if (error instanceof CoachServiceError) {
      throw error;
    }

    logOperationalError('[Coach] Unexpected coach entries failure', error, {
      limit: typeof limit === 'number' ? limit : 'all',
    });
    throw createCoachReadError(
      'Failed to load coach entries.',
      'coach_entries_load_failed',
      error,
    );
  }
}

export async function fetchCoachQuotaStatus(): Promise<CoachQuotaStatus> {
  return parseCoachQuotaStatusResponse(
    await invokeAuthedCoachFunction(COACH_QUOTA_STATUS_FUNCTION_NAME, {}),
  );
}

export async function fetchCoachHistoryPage(options: {
  limit?: number;
  cursor?: string | null;
  excludeEntryId?: string | null;
} = {}): Promise<CoachHistoryPage> {
  const limit = normalizeCoachHistoryPageSize(options.limit);
  const cursor = options.cursor ?? null;
  const excludeEntryId = options.excludeEntryId ?? null;
  const decodedCursor = decodeCoachHistoryCursor(cursor);

  if (cursor && !decodedCursor) {
    throw createCoachServiceError('Coach history cursor is invalid.', {
      code: 'coach_history_cursor_invalid',
      status: 400,
      details: {
        cursor,
      },
    });
  }

  try {
    const { data, error } = await supabase.rpc('get_coach_history_page', {
      p_limit: limit + 1,
      p_cursor_sort_at: decodedCursor?.sortAt ?? null,
      p_cursor_created_at: decodedCursor?.createdAt ?? null,
      p_cursor_id: decodedCursor?.id ?? null,
      p_exclude_entry_id: excludeEntryId,
    });

    if (error) {
      const coachError = createCoachHistoryPageReadError(error);

      logOperationalError('[Coach] Failed to fetch coach history page', coachError, {
        limit,
        has_cursor: !!decodedCursor,
        exclude_entry_id: excludeEntryId,
      });
      throw coachError;
    }

    const rawRows = Array.isArray(data) ? data : [];
    const hasMore = rawRows.length > limit;
    const pageRows = rawRows.slice(0, limit);
    const items = pageRows
      .map(parseCoachHistoryPageRow)
      .filter((item): item is RenderableCoachEntry => item !== null);
    const lastItem = pageRows[pageRows.length - 1] ?? null;

    return {
      items,
      has_more: hasMore,
      next_cursor: hasMore && lastItem ? createCoachHistoryCursorFromEntry(lastItem) : null,
    };
  } catch (error) {
    if (error instanceof CoachServiceError) {
      throw error;
    }

    logOperationalError('[Coach] Unexpected coach history page failure', error, {
      limit,
      has_cursor: !!decodedCursor,
      exclude_entry_id: excludeEntryId,
    });
    throw createCoachReadError(
      'Failed to load coach history.',
      'coach_history_page_load_failed',
      error,
    );
  }
}

export async function fetchCoachHistorySummary(options: {
  excludeEntryId?: string | null;
} = {}): Promise<CoachHistorySummary> {
  const excludeEntryId = options.excludeEntryId ?? null;

  try {
    const { data, error } = await supabase.rpc('get_coach_history_summary', {
      p_exclude_entry_id: excludeEntryId,
    });

    if (error) {
      const coachError = createCoachHistorySummaryReadError(error);

      logOperationalError('[Coach] Failed to fetch coach history summary', coachError, {
        exclude_entry_id: excludeEntryId,
      });
      throw coachError;
    }

    const rows = Array.isArray(data) ? data : [];
    return parseCoachHistorySummaryRow(rows[0] ?? null);
  } catch (error) {
    if (error instanceof CoachServiceError) {
      throw error;
    }

    logOperationalError('[Coach] Unexpected coach history summary failure', error, {
      exclude_entry_id: excludeEntryId,
    });
    throw createCoachReadError(
      'Failed to load coach history summary.',
      'coach_history_summary_load_failed',
      error,
    );
  }
}

export async function fetchLatestReadyCoachEntry(options: {
  personaKey?: CoachPersonaKey | null;
  promptType?: CoachPromptType | null;
  locale?: string;
} = {}) {
  const personaKey = options.personaKey ?? null;
  const promptType = isCoachPromptType(options.promptType)
    ? options.promptType
    : null;
  const normalizedLocale = normalizeCoachLocale(options.locale);

  try {
    let baseQuery = supabase
      .from('coach_entries')
      .select('*')
      .eq('status', 'ready')
      .not('title', 'is', null)
      .not('body', 'is', null)
      .neq('title', '')
      .neq('body', '');

    if (personaKey) {
      baseQuery = baseQuery.eq('persona_key', personaKey);
    }

    if (promptType) {
      baseQuery = baseQuery.eq('prompt_type', promptType);
    }

    const localeScopedQuery = normalizedLocale
      ? baseQuery.eq('locale', normalizedLocale)
      : baseQuery.is('locale', null);

    const { data, error } = await localeScopedQuery
      .order('generated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      const coachError = createCoachEntriesReadError(error);
      logOperationalError('[Coach] Failed to fetch latest ready coach entry', coachError, {
        persona_key: personaKey,
        prompt_type: promptType,
        locale: normalizedLocale,
      });
      throw coachError;
    }

    return parseCoachEntryRow(data);
  } catch (error) {
    if (error instanceof CoachServiceError) {
      throw error;
    }

    logOperationalError('[Coach] Unexpected latest ready entry failure', error, {
      persona_key: personaKey,
      prompt_type: promptType,
      locale: normalizedLocale,
    });
    throw createCoachReadError(
      'Failed to load latest coach guidance.',
      'coach_latest_entry_load_failed',
      error,
    );
  }
}

export async function fetchRecentCoachScans(
  limit = RECENT_COACH_SCAN_LIMIT,
) {
  const normalizedLimit =
    Number.isFinite(limit) && limit > 0
      ? Math.trunc(limit)
      : RECENT_COACH_SCAN_LIMIT;
  const pageSize = Math.max(normalizedLimit, RECENT_COACH_SCAN_LIMIT);
  const usableScans: CoachSourceScan[] = [];
  let offset = 0;

  try {
    while (usableScans.length < normalizedLimit) {
      const { data, error } = await supabase
        .from('scans')
        .select('id, scan_type, analysis_result, analyzed_at, created_at')
        .order('analyzed_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(offset, offset + pageSize - 1);

      if (error) {
        const coachError = createCoachScansReadError(error);

        logOperationalError('[Coach] Failed to fetch recent scans', coachError, {
          limit: normalizedLimit,
          offset,
        });
        throw coachError;
      }

      const rows = Array.isArray(data) ? data : [];
      for (const row of rows) {
        const parsedScan = parseCoachSourceScan(row);
        if (parsedScan) {
          usableScans.push(parsedScan);
        }

        if (usableScans.length >= normalizedLimit) {
          break;
        }
      }

      if (rows.length < pageSize) {
        break;
      }

      offset += pageSize;
    }

    return usableScans.slice(0, normalizedLimit);
  } catch (error) {
    if (error instanceof CoachServiceError) {
      throw error;
    }

    logOperationalError('[Coach] Unexpected recent scans failure', error, {
      limit,
    });
    throw createCoachReadError(
      'Failed to load recent coach scans.',
      'coach_scans_load_failed',
      error,
    );
  }
}

export async function generateCoachGuidance(options: {
  promptType: CoachPromptType;
  personaKey: CoachPersonaKey;
  locale?: string;
  forceRefresh?: boolean;
}): Promise<CoachGuidanceResult> {
  const personaKey = readCoachPersonaKey(options.personaKey);
  const normalizedLocale = normalizeCoachLocale(options.locale);
  let payload: CoachGuidancePayload | null = null;

  try {
    const scans = await fetchRecentCoachScans();
    if (scans.length === 0) {
      throw createCoachServiceError(
        'Coach requires at least one usable scan before generating guidance.',
        {
          code: COACH_NO_USABLE_SCAN_ERROR_CODE,
          status: 400,
          details: {
            prompt_type: options.promptType,
          },
        },
      );
    }

    const nextPayload = buildCoachPayload(options.promptType, scans);
    payload = nextPayload;

    const response = parseCoachGenerateResponse(
      await invokeAuthedCoachFunction<CoachGenerateResponse>(
        COACH_FUNCTION_NAME,
        {
          payload: nextPayload,
          persona_key: personaKey,
          ...(normalizedLocale ? { locale: normalizedLocale } : {}),
          ...(options.forceRefresh ? { force_refresh: true } : {}),
        },
      ),
      normalizedLocale,
    );

    return {
      ...response,
      prompt_type: response.prompt_type ?? options.promptType,
      response_version: response.content ? 2 : (response.response_version ?? 1),
      fallback: false,
      payload: nextPayload,
    };
  } catch (error) {
    const resolvedPayload =
      payload ?? buildCoachPayload(options.promptType, []);
    const shouldUseFallback = shouldFallbackToCachedCoachEntry(error);
    if (shouldDebugCoachService()) {
      const errorDebugInfo = getCoachServiceErrorDebugInfo(error);

      console.log('[Coach] generateCoachGuidance failed', {
        prompt_type: options.promptType,
        persona_key: personaKey,
        locale: normalizedLocale,
        will_fallback_to_cache: shouldUseFallback,
        ...errorDebugInfo,
      });
    }

    if (!shouldUseFallback) {
      throw error;
    }

    const fallbackEntry = await fetchLatestReadyCoachEntry({
      personaKey,
      locale: normalizedLocale ?? undefined,
    });
    if (hasCoachEntryContent(fallbackEntry)) {
      return buildGuidanceResultFromEntry(fallbackEntry, resolvedPayload, true);
    }

    throw error;
  }
}
