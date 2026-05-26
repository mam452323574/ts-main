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
  normalizeCoachQuestionKey,
  normalizeCoachQuestionText,
  resolveCoachQuestionHints,
  resolveCoachQuestionSelection,
} from '@/shared/coachQuestions';
import {
  FREE_QUESTION_PROMPT_TYPE,
  getCoachPromptScanQuota,
  LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE,
  normalizeCoachGenerationPromptType,
  resolveVisibleCoachPromptType,
} from '@/shared/coachPromptTypes';
import { normalizeCoachScanIntentPayload } from '@/shared/scanCoachIntent';
import { isCoachResponseVersion } from '@/shared/coachContent';
import {
  mergeCoachStructuredContentWithBodyFallback,
  parseCoachStructuredContent,
} from '@/shared/coachContentParser';
import { getDefaultCoachDisclaimer } from '@/shared/coachCopy';
import { normalizePersistedInferredPersona } from '@/shared/coachProfileMemory';
import { resolveLocalizedText } from '@/utils/analysisTextLocalization';
import {
  tryNormalizeAnalysisResult,
} from '@/utils/analysisNormalization';
import {
  isRenderableCoachEntry,
  type RenderableCoachEntry,
} from '@/utils/coachHistory';
import { logExpectedFailure, logOperationalError } from '@/utils/observability';
import {
  sanitizeUntrustedAiText,
  sanitizeUntrustedAiTextArray,
} from '@/utils/sanitizeUntrustedAiText';
import type {
  AnalysisResult,
  CoachComparisonToPrevious,
  CoachDataReliability,
  CoachDataReliabilityComponents,
  CoachDormancyRiskLevel,
  CoachEngagementLevel,
  CoachEntry,
  CoachGenerateResponse,
  CoachGenerationPromptType,
  CoachGoalInference,
  CoachGuidancePayload,
  CoachGuidanceResult,
  CoachScanIntentPayload,
  CoachInferredMetricSignal,
  CoachInferredPersona,
  CoachInferredPersonaField,
  CoachKeyMetrics,
  CoachLifestyleArchetypeKey,
  CoachLifestyleSignature,
  CoachMetricDelta,
  CoachMetricInterpretationHint,
  CoachNutritionProfile,
  CoachPersonaKey,
  CoachPreferredTimeOfDay,
  CoachPrimaryGoalKey,
  CoachQuestionKey,
  CoachQuotaBucketKey,
  CoachQuotaBucketStatus,
  CoachQuotaStatus,
  CoachRecommendations,
  CoachRecommendationTone,
  CoachRelevantFlag,
  CoachResponseVersion,
  CoachRiskLevel,
  CoachRiskSignals,
  CoachScanDigest,
  CoachScanFrequencyLabel,
  CoachScanRichContext,
  CoachStructuredContent,
  CoachTemporalPatterns,
  CoachTrajectoryDirection,
  CoachTrajectoryEntry,
  CoachTrajectoryMap,
  CoachTrendMetric,
  CoachTrendSummary,
  CoachWeekdayWeekendBalance,
  FatDistributionScanResult,
  InferredPersonaConfidence,
  PersistedInferredPersona,
  ScanAnalysisMeta,
  ScanCoachIntent,
  ScanType,
  SuperScanResult,
} from '@/types';

const COACH_FUNCTION_NAME = 'coach-generate-response';
const COACH_QUOTA_STATUS_FUNCTION_NAME = 'coach-quota-status';
const COACH_SCREEN_SNAPSHOT_FUNCTION_NAME = 'coach-screen-snapshot';
const COACH_SYNC_PROFILE_MEMORY_FUNCTION_NAME = 'coach-sync-profile-memory';
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
const COACH_LOW_CONFIDENCE_THRESHOLD = 60;
const COACH_LOW_IMAGE_QUALITY_THRESHOLD = 55;
const COACH_PARTIAL_METRIC_COVERAGE_THRESHOLD = 70;

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

export type CoachNormalizedAnalysisResult =
  | AnalysisResult
  | SuperScanResult
  | FatDistributionScanResult;

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
  providerFailureKind: string | null;
  providerFailureStage: string | null;
  providerNodeType: string | null;
  providerNodeName: string | null;
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

interface CoachSyncProfileMemoryResponse {
  success?: unknown;
  applied_count?: unknown;
  profile_memory?: unknown;
}

interface CoachScreenSnapshotResponse {
  success?: unknown;
  entries?: unknown;
  quota?: unknown;
  recent_scans?: unknown;
  latest_ready_entry?: unknown;
  history_summary?: unknown;
  request_id?: unknown;
}

export interface CoachScreenSnapshot {
  entries: CoachEntry[];
  quota: CoachQuotaStatus;
  recentScans: CoachSourceScan[];
  latestReadyEntry: RenderableCoachEntry | null;
  historySummary: CoachHistorySummary;
  requestId?: string;
}

// C-05 of COACH_SECURITY_AUDIT_2026_05: explicit column list mirroring the
// surface of get_coach_history_page_v2 + the few extra fields client code
// reads on direct table reads (user_id, updated_at). Never read the internal
// columns (request_payload_json, response_payload_json, cache_key, input_hash,
// error_code) from the client — they are exposed only to service_role in the
// Edge Functions.
const COACH_ENTRY_PUBLIC_COLUMNS_SELECT = [
  'id',
  'user_id',
  'status',
  'title',
  'body',
  'disclaimer',
  'persona_key',
  'prompt_type',
  'question_key',
  'question_text',
  'response_version',
  'content_json',
  'cta_label',
  'cta_route',
  'source',
  'locale',
  'created_at',
  'updated_at',
  'generated_at',
  'expires_at',
].join(', ');

// N-G of COACH_SECURITY_AUDIT_2026_05: tighten the dev-only gate so debug
// logs do not slip into release builds that ship with __DEV__=true (e.g. an
// Xcode/Android Studio debug variant installed on a real device). We require
// both __DEV__ === true AND NODE_ENV === 'development'.
export function shouldDebugCoachService() {
  if (typeof __DEV__ === 'undefined' || !__DEV__) return false;
  if (process.env.NODE_ENV === 'test') return false;
  return process.env.NODE_ENV === 'development';
}

// N-G of COACH_SECURITY_AUDIT_2026_05: strip provider-topology fields from
// CoachServiceError details before logging. The "what failed" stays loggable
// (message, code, status, requestId) but n8n node names, provider names, and
// any raw provider response payload are redacted so a side-loaded debug build
// cannot leak backend topology to an attacker.
const COACH_DEBUG_REDACTED_DETAIL_KEYS = new Set([
  'provider_name',
  'provider_node_name',
  'provider_node_type',
  'provider_failure_stage',
  'provider_failure_kind',
  'provider_response',
  'provider_response_text',
  'webhook_url',
  'webhook_endpoint',
]);

function redactCoachDebugDetails(value: unknown): unknown {
  if (!isRecord(value)) return value ?? null;
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    out[key] = COACH_DEBUG_REDACTED_DETAIL_KEYS.has(key) ? '<redacted>' : val;
  }
  return out;
}

export function sanitizeCoachServiceErrorDebugInfo(
  info: CoachServiceErrorDebugInfo,
): CoachServiceErrorDebugInfo {
  return {
    ...info,
    details: redactCoachDebugDetails(info.details),
    providerFailureKind: info.providerFailureKind ? '<redacted>' : null,
    providerFailureStage: info.providerFailureStage ? '<redacted>' : null,
    providerNodeType: info.providerNodeType ? '<redacted>' : null,
    providerNodeName: info.providerNodeName ? '<redacted>' : null,
  };
}

export function getCoachServiceErrorDebugInfo(error: unknown): CoachServiceErrorDebugInfo {
  if (error instanceof CoachServiceError) {
    const detailsRecord = isRecord(error.details) ? error.details : null;
    return {
      message: error.message,
      code: error.code ?? null,
      status: error.status ?? null,
      requestId: error.requestId ?? null,
      functionName: error.functionName ?? null,
      details: error.details ?? null,
      providerFailureKind:
        readOptionalString(detailsRecord?.provider_failure_kind) ?? null,
      providerFailureStage:
        readOptionalString(detailsRecord?.provider_failure_stage) ?? null,
      providerNodeType:
        readOptionalString(detailsRecord?.provider_node_type) ?? null,
      providerNodeName:
        readOptionalString(detailsRecord?.provider_node_name) ?? null,
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
      providerFailureKind: null,
      providerFailureStage: null,
      providerNodeType: null,
      providerNodeName: null,
    };
  }

  return {
    message: 'unknown',
    code: null,
    status: null,
    requestId: null,
    functionName: null,
    details: error ?? null,
    providerFailureKind: null,
    providerFailureStage: null,
    providerNodeType: null,
    providerNodeName: null,
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

function isInvalidCoachProviderFailureKind(kind?: string | null) {
  return (
    kind === 'json_parse_failed' ||
    kind === 'agent_output_parse_failed' ||
    kind === 'invalid_provider_response'
  );
}

function resolveCoachFailureKindFromCode(
  code?: string | null,
  status?: number | null,
  providerFailureKind?: string | null,
): CoachFailureKind {
  if (isInvalidCoachProviderFailureKind(providerFailureKind)) {
    return 'invalid_provider_response';
  }

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
  return resolveCoachFailureKindFromCode(
    debugInfo.code,
    debugInfo.status,
    debugInfo.providerFailureKind,
  );
}

export function resolveCoachFailureKindFromDebugInfo(
  debugInfo:
    | Pick<
        CoachEntryFailureDebugInfo,
        'code' | 'status' | 'providerFailureKind'
      >
    | null
    | undefined,
): CoachFailureKind {
  return resolveCoachFailureKindFromCode(
    debugInfo?.code ?? null,
    debugInfo?.status ?? null,
    debugInfo?.providerFailureKind ?? null,
  );
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

function parseCoachQuotaBucket(
  value: unknown,
  unlimited: boolean,
  fallbackWindowSeconds: number,
): CoachQuotaBucketStatus | null {
  if (!isRecord(value)) {
    return null;
  }
  const limit = readNullableInteger(value.limit);
  const used = readOptionalInteger(value.used_count);
  const available = readNullableInteger(value.available);
  const windowSeconds = readOptionalInteger(value.window_seconds);
  if (
    used === null ||
    (!unlimited && (limit === null || available === null))
  ) {
    return null;
  }
  return {
    limit: unlimited || limit === null ? null : Math.max(0, limit),
    used_count: Math.max(0, used),
    available:
      unlimited || available === null ? null : Math.max(0, available),
    next_recharge_at: readOptionalString(value.next_recharge_at),
    window_seconds: Math.max(
      1,
      windowSeconds ?? fallbackWindowSeconds,
    ),
  };
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

  const normalizedTopLevel = {
    limit: unlimited ? null : Math.max(0, limit ?? 0),
    used_count: Math.max(0, usedCount),
    available: unlimited ? null : Math.max(0, available ?? 0),
    next_recharge_at: readOptionalString(payload.next_recharge_at),
    unlimited,
    window_seconds: Math.max(1, windowSeconds),
  };

  // Buckets are emitted by the post-2026-05-26 RPC. Older payloads (during the
  // rollout window) only carry the top-level pool — we synthesize a mirrored
  // bucket map so downstream code can treat both shapes uniformly without
  // having to special-case the legacy path.
  const bucketsRecord = isRecord(payload.buckets) ? payload.buckets : null;
  const generalBucket =
    parseCoachQuotaBucket(
      bucketsRecord?.general,
      unlimited,
      normalizedTopLevel.window_seconds,
    ) ?? {
      limit: normalizedTopLevel.limit,
      used_count: normalizedTopLevel.used_count,
      available: normalizedTopLevel.available,
      next_recharge_at: normalizedTopLevel.next_recharge_at,
      window_seconds: normalizedTopLevel.window_seconds,
    };
  const scanCtaBucket =
    parseCoachQuotaBucket(
      bucketsRecord?.scan_cta,
      unlimited,
      normalizedTopLevel.window_seconds,
    ) ?? {
      limit: normalizedTopLevel.limit,
      used_count: 0,
      // Without server-side buckets we cannot know the scan_cta state; assume
      // a fresh window so we do not pre-block the user. The server stays
      // authoritative — a 429 will surface as a structured error if blocked.
      available: normalizedTopLevel.limit,
      next_recharge_at: null,
      window_seconds: normalizedTopLevel.window_seconds,
    };

  return {
    account_tier: readCoachAccountTier(payload.account_tier),
    ...normalizedTopLevel,
    as_of: asOf,
    buckets: {
      general: generalBucket,
      scan_cta: scanCtaBucket,
    },
  };
}

// Maps the *origin* of a Coach request to its quota bucket. We never read
// this from the user — it is purely derived from the request shape, mirroring
// the server-side `coach_quota_bucket_for_source` SQL helper. A scan-CTA
// request is one where the caller carries a populated `scan_intent` payload.
export function coachQuotaSourceForRequest(input: {
  hasScanIntent?: boolean | null | undefined;
  promptType?: string | null | undefined;
}): CoachQuotaBucketKey {
  // promptType is purely informational here — it would be a fragile gate, so
  // we never branch on it. Kept in the signature so callers can audit the
  // decision in one place (and so we can add telemetry later without
  // churning call sites).
  return input.hasScanIntent === true ? 'scan_cta' : 'general';
}

// Returns the bucket sub-view for a given request source. Falls back to a
// synthesised bucket mirroring the top-level pool when the server snapshot
// predates the split — keeps the UI honest during rollout and against any
// future schema surprise. Returns `null` when the quota itself is missing.
export function selectCoachQuotaBucket(
  quota: CoachQuotaStatus | null | undefined,
  source: CoachQuotaBucketKey,
): CoachQuotaBucketStatus | null {
  if (!quota) {
    return null;
  }
  if (quota.buckets && quota.buckets[source]) {
    return quota.buckets[source];
  }
  // Conservative fallback: mirror top-level. For the scan_cta bucket on a
  // legacy payload we cannot know the real state, so we expose the same view
  // as general — the server stays authoritative on the 429.
  return {
    limit: quota.limit,
    used_count: quota.used_count,
    available: quota.available,
    next_recharge_at: quota.next_recharge_at,
    window_seconds: quota.window_seconds,
  };
}

// Pulls the bucket key the server told us was exhausted from an error
// payload. Returns null when the error is not a 429 or when the new
// quota_bucket detail is not present (pre-rollout error shape).
export function getCoachQuotaBucketKeyFromError(
  error: unknown,
): CoachQuotaBucketKey | null {
  if (!(error instanceof CoachServiceError)) {
    return null;
  }
  const details = error.details;
  if (!isRecord(details)) {
    return null;
  }
  if (details.quota_bucket === 'general' || details.quota_bucket === 'scan_cta') {
    return details.quota_bucket;
  }
  // Defense in depth: derive from quota_source if quota_bucket is missing.
  if (
    details.quota_source === 'coach_scan_cta_generation' ||
    details.quota_source === 'coach_scan_cta_cache'
  ) {
    return 'scan_cta';
  }
  if (
    details.quota_source === 'coach_generation' ||
    details.quota_source === 'coach_cache'
  ) {
    return 'general';
  }
  return null;
}

// Merges a quota payload that came back as part of a 429 (which is already
// projected onto the consumed bucket by the server) into a previously-known
// quota snapshot. Preserves the OTHER bucket so the UI does not flash an
// outdated state for a flow that was not touched by this error.
//
// The top-level fields follow the server's projection (i.e. the consumed
// bucket) so legacy consumers (and the alert "next request in X") keep
// reading the right cooldown without needing to know about buckets.
export function mergeCoachQuotaForBucket(
  previous: CoachQuotaStatus | null | undefined,
  fromError: CoachQuotaStatus,
  consumedBucket: CoachQuotaBucketKey,
): CoachQuotaStatus {
  const consumedBucketStatus: CoachQuotaBucketStatus = {
    limit: fromError.limit,
    used_count: fromError.used_count,
    available: fromError.available,
    next_recharge_at: fromError.next_recharge_at,
    window_seconds: fromError.window_seconds,
  };

  const otherBucketKey: CoachQuotaBucketKey =
    consumedBucket === 'general' ? 'scan_cta' : 'general';

  // Prefer the previous snapshot's view of the OTHER bucket — it is the most
  // recent server-known state for that flow. Fall back to the error's view
  // (which will have been synthesised by parseCoachQuotaStatus) if we have
  // nothing else.
  const otherBucketStatus: CoachQuotaBucketStatus =
    previous?.buckets?.[otherBucketKey] ??
    fromError.buckets?.[otherBucketKey] ?? {
      limit: fromError.limit,
      used_count: 0,
      available: fromError.limit,
      next_recharge_at: null,
      window_seconds: fromError.window_seconds,
    };

  return {
    ...fromError,
    buckets: {
      general:
        consumedBucket === 'general' ? consumedBucketStatus : otherBucketStatus,
      scan_cta:
        consumedBucket === 'scan_cta' ? consumedBucketStatus : otherBucketStatus,
    },
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
    providerFailureKind:
      readOptionalString(responsePayload?.provider_failure_kind) ?? null,
    providerFailureStage:
      readOptionalString(responsePayload?.provider_failure_stage) ?? null,
    providerNodeType:
      readOptionalString(responsePayload?.provider_node_type) ?? null,
    providerNodeName:
      readOptionalString(responsePayload?.provider_node_name) ?? null,
  };
}

export function resolveCoachFailureKindFromEntry(
  entry:
    | Pick<CoachEntry, 'status' | 'error_code' | 'response_payload_json'>
    | null
    | undefined,
): CoachFailureKind {
  const debugInfo = getCoachEntryFailureDebugInfo(entry);
  return resolveCoachFailureKindFromCode(
    debugInfo?.code,
    debugInfo?.status,
    debugInfo?.providerFailureKind,
  );
}

// Counterpart of COACH_ENTRY_PUBLIC_COLUMNS_SELECT: the public table read
// strips error_code / response_payload_json so the wire never carries n8n
// topology. This RPC re-exposes a curated subset (error code + parsed webhook
// status + provider_failure_kind) for the UI to render meaningful diagnostics
// on `status === 'error'` entries owned by the caller. Backed by
// supabase/migrations/20260605130000_add_get_coach_entry_error_summary.sql
// (SECURITY DEFINER, filtered by auth.uid()).
export interface CoachEntryErrorSummary {
  id: string;
  status: string;
  errorCode: string | null;
  webhookStatus: number | null;
  providerFailureKind: string | null;
  source: string | null;
  locale: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export async function fetchCoachEntryErrorSummary(
  entryId: string,
): Promise<CoachEntryErrorSummary | null> {
  const { data, error } = await supabase.rpc('get_coach_entry_error_summary', {
    p_entry_id: entryId,
  });

  if (error) {
    throw createCoachServiceError(
      'Failed to fetch coach entry error summary',
      {
        code: 'coach_entry_error_summary_unavailable',
        status: 502,
        details: error,
      },
    );
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!isRecord(row)) {
    return null;
  }

  const rowId = readOptionalString(row.id);
  const rowStatus = readOptionalString(row.status);
  if (!rowId || !rowStatus) {
    return null;
  }

  return {
    id: rowId,
    status: rowStatus,
    errorCode: readOptionalString(row.error_code),
    webhookStatus: readOptionalNumber(row.webhook_status),
    providerFailureKind: readOptionalString(row.provider_failure_kind),
    source: readOptionalString(row.source),
    locale: readOptionalString(row.locale),
    createdAt: readOptionalString(row.created_at),
    updatedAt: readOptionalString(row.updated_at),
  };
}

// Merge the RPC payload into the base debug info derived from the public
// columns. The RPC fields take precedence when present because the public
// projection deliberately leaves `code` / `webhookStatus` / `providerFailureKind`
// null. Other fields (provider, providerNodeName, providerNodeType) stay null
// — they remain backend-only by design (cf. C-05 of COACH_SECURITY_AUDIT_2026_05).
export function mergeCoachEntryFailureDebugInfo(
  base: CoachEntryFailureDebugInfo | null,
  summary: CoachEntryErrorSummary | null,
): CoachEntryFailureDebugInfo | null {
  if (!base) {
    return base;
  }
  if (!summary) {
    return base;
  }

  return {
    ...base,
    code: summary.errorCode ?? base.code,
    message:
      base.message && base.message !== 'coach_entry_error'
        ? base.message
        : (summary.errorCode ?? base.message),
    status: summary.webhookStatus ?? base.status,
    webhookStatus: summary.webhookStatus ?? base.webhookStatus,
    providerFailureKind:
      summary.providerFailureKind ?? base.providerFailureKind,
    source: summary.source ?? base.source,
  };
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
  // C-05 of COACH_SECURITY_AUDIT_2026_05: the frontend now calls v2 of the
  // history pagination RPC. Detect either name in error messages so the
  // missing-function detection still works during the rollout window where
  // v1 may have been removed but v2 not yet applied (or vice versa).
  if (
    isMissingCoachHistoryFunctionError(error, 'get_coach_history_page_v2') ||
    isMissingCoachHistoryFunctionError(error, 'get_coach_history_page')
  ) {
    return createCoachServiceError(
      `Coach history pagination function "get_coach_history_page_v2" is unavailable on Supabase project "${getConfiguredSupabaseProjectLabel()}".`,
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

// Skip-if-fresh cache for coach-sync-profile-memory.
// The Edge Function enforces strict per-user rate limits (2/min, 10/h, 30/j —
// cf. supabase/functions/coach-sync-profile-memory/index.ts:31-43). Every
// generateCoachGuidance() call invokes syncCoachProfileMemory(), so back-to-back
// regenerations saturate the limit and pollute logs with 429s even when the
// inferred profile has not changed. Cache the result for 60s scoped by user,
// and reset on signout/profile-update (see invalidateCoachProfileMemoryCache).
const COACH_PROFILE_MEMORY_CACHE_TTL_MS = 60_000;
let coachProfileMemoryCache: {
  userId: string;
  result: PersistedInferredPersona | null;
  expiresAt: number;
} | null = null;

export function invalidateCoachProfileMemoryCache() {
  coachProfileMemoryCache = null;
}

// 429 from coach-sync-profile-memory is intentional throttling (2/min, 10/h,
// 30/day per user — see supabase/functions/coach-sync-profile-memory/index.ts).
// The catch in generateCoachGuidance treats sync as fire-and-forget, so a
// rate-limit hit must not surface as ERROR — it's an expected, non-fatal signal.
function isCoachProfileSyncRateLimitError(error: unknown): boolean {
  if (!(error instanceof CoachServiceError)) return false;
  return (
    error.status === 429 ||
    error.code === 'coach_profile_sync_rate_limit_exceeded'
  );
}

async function syncCoachProfileMemory(): Promise<PersistedInferredPersona | null> {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData?.session?.user?.id ?? null;

  if (userId) {
    const now = Date.now();
    const cached = coachProfileMemoryCache;
    if (cached && cached.userId === userId && cached.expiresAt > now) {
      return cached.result;
    }
  }

  const response = await invokeAuthedCoachFunction<CoachSyncProfileMemoryResponse>(
    COACH_SYNC_PROFILE_MEMORY_FUNCTION_NAME,
    {},
  );

  const result = isRecord(response)
    ? normalizePersistedInferredPersona(response.profile_memory ?? null)
    : null;

  if (userId) {
    coachProfileMemoryCache = {
      userId,
      result,
      expiresAt: Date.now() + COACH_PROFILE_MEMORY_CACHE_TTL_MS,
    };
  }

  return result;
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
    {
      metric: 'skin_clarity_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'under_eye_shadow_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'under_eye_volume_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'eye_openness_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'complexion_redness_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'pore_visibility_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'skin_evenness_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'skin_radiance_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'lip_dryness_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'forehead_smoothness_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 't_zone_oiliness_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'perceived_stress_level',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'perceived_sleep_quality',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
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
    {
      metric: 'muscle_definition_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'midsection_definition_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'shoulder_alignment_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'recovery_readiness_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'upper_body_definition_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'lower_body_definition_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'arm_definition_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'v_taper_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'body_tension_indicator_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
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
    {
      metric: 'fiber_grams_estimate',
      interpretationHint: 'higher_is_better',
      tolerance: 2,
    },
    {
      metric: 'sugar_grams_estimate',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'processing_level_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'hydration_contribution_score',
      interpretationHint: 'higher_is_better',
      tolerance: 1,
    },
    {
      metric: 'sodium_level_score',
      interpretationHint: 'lower_is_better',
      tolerance: 1,
    },
    {
      metric: 'meal_balance_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'inflammation_index_score',
      interpretationHint: 'lower_is_better',
      tolerance: 3,
    },
    {
      metric: 'color_diversity_score',
      interpretationHint: 'higher_is_better',
      tolerance: 1,
    },
    {
      metric: 'vegetable_portion_ratio',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'protein_visibility_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'whole_grain_indicator_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
    {
      metric: 'meal_freshness_score',
      interpretationHint: 'higher_is_better',
      tolerance: 3,
    },
  ],
  super: [
    {
      metric: 'global_risk_score',
      interpretationHint: 'lower_is_better',
      tolerance: 2,
    },
    {
      metric: 'global_body_fat_estimate_percent',
      interpretationHint: 'lower_is_better',
      tolerance: 1,
    },
    {
      metric: 'global_facial_fat_estimate_percent',
      interpretationHint: 'lower_is_better',
      tolerance: 1,
    },
    {
      metric: 'global_water_retention_estimate_percent',
      interpretationHint: 'lower_is_better',
      tolerance: 1,
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
  health: [
    'fatigue_level',
    'skin_quality_score',
    'glow_index',
    'collagen_level',
    'hydration_level',
    'photogenic_score',
    'skin_clarity_score',
    'under_eye_shadow_score',
    'under_eye_volume_score',
    'eye_openness_score',
    'complexion_redness_score',
    'pore_visibility_score',
    'skin_evenness_score',
    'skin_radiance_score',
    'lip_dryness_score',
    'forehead_smoothness_score',
    't_zone_oiliness_score',
    'perceived_stress_level',
    'perceived_sleep_quality',
  ],
  body: [
    'body_fat_percentage',
    'posture_score',
    'strength_index',
    'body_symmetry',
    'metabolic_age',
    'muscle_definition_score',
    'midsection_definition_score',
    'shoulder_alignment_score',
    'recovery_readiness_score',
    'upper_body_definition_score',
    'lower_body_definition_score',
    'arm_definition_score',
    'v_taper_score',
    'body_tension_indicator_score',
  ],
  nutrition: [
    'calories_estimate',
    'protein_grams',
    'carbs_grams',
    'fat_grams',
    'satiety_index',
    'fiber_grams_estimate',
    'sugar_grams_estimate',
    'processing_level_score',
    'hydration_contribution_score',
    'meal_balance_score',
    'inflammation_index_score',
    'color_diversity_score',
    'vegetable_portion_ratio',
    'protein_visibility_score',
    'whole_grain_indicator_score',
    'meal_freshness_score',
  ],
  super: [
    'global_risk_score',
    'global_body_fat_estimate_percent',
    'global_facial_fat_estimate_percent',
    'global_water_retention_estimate_percent',
  ],
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
  // CO-01 (cf. SCANNER_COACH_AUDIT_2026_05.md §6) — tout texte libre IA
  // résolu ici est destiné à être réinjecté dans le prompt du coach LLM.
  // On sanitise contre la second-order prompt injection avant retour.
  const directText = readOptionalString(value);
  if (directText) {
    return sanitizeUntrustedAiText(directText);
  }

  if (!isRecord(value)) {
    return null;
  }

  const localized = resolveLocalizedText(value as never, { fallback: '' }).trim();
  if (localized.length === 0) {
    return null;
  }
  return sanitizeUntrustedAiText(localized);
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

function readAnalysisMetaFromNormalizedResult(
  normalized: CoachNormalizedAnalysisResult,
): ScanAnalysisMeta | null {
  if (!('analysis_meta' in normalized)) {
    return null;
  }

  const analysisMeta = normalized.analysis_meta;
  return analysisMeta ?? null;
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
        skin_clarity_score: normalized.skin_clarity_score ?? null,
        under_eye_shadow_score: normalized.under_eye_shadow_score ?? null,
        under_eye_volume_score: normalized.under_eye_volume_score ?? null,
        eye_openness_score: normalized.eye_openness_score ?? null,
        complexion_redness_score: normalized.complexion_redness_score ?? null,
        pore_visibility_score: normalized.pore_visibility_score ?? null,
        skin_evenness_score: normalized.skin_evenness_score ?? null,
        skin_radiance_score: normalized.skin_radiance_score ?? null,
        lip_dryness_score: normalized.lip_dryness_score ?? null,
        forehead_smoothness_score: normalized.forehead_smoothness_score ?? null,
        t_zone_oiliness_score: normalized.t_zone_oiliness_score ?? null,
        perceived_sex_key: normalized.perceived_sex_key ?? null,
        perceived_age_range_key: normalized.perceived_age_range_key ?? null,
        perceived_stress_level: normalized.perceived_stress_level ?? null,
        perceived_sleep_quality: normalized.perceived_sleep_quality ?? null,
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
        muscle_definition_score: normalized.muscle_definition_score ?? null,
        midsection_definition_score: normalized.midsection_definition_score ?? null,
        shoulder_alignment_score: normalized.shoulder_alignment_score ?? null,
        recovery_readiness_score: normalized.recovery_readiness_score ?? null,
        upper_body_definition_score: normalized.upper_body_definition_score ?? null,
        lower_body_definition_score: normalized.lower_body_definition_score ?? null,
        arm_definition_score: normalized.arm_definition_score ?? null,
        v_taper_score: normalized.v_taper_score ?? null,
        body_tension_indicator_score: normalized.body_tension_indicator_score ?? null,
        perceived_sex_key: normalized.perceived_sex_key ?? null,
        perceived_age_range_key: normalized.perceived_age_range_key ?? null,
        estimated_height_range_key: normalized.estimated_height_range_key ?? null,
        estimated_weight_range_key: normalized.estimated_weight_range_key ?? null,
        body_frame_key: normalized.body_frame_key ?? null,
        perceived_fitness_level_key: normalized.perceived_fitness_level_key ?? null,
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
        fiber_grams_estimate: normalized.fiber_grams_estimate ?? null,
        sugar_grams_estimate: normalized.sugar_grams_estimate ?? null,
        processing_level_score: normalized.processing_level_score ?? null,
        hydration_contribution_score: normalized.hydration_contribution_score ?? null,
        sodium_level_score: normalized.sodium_level_score ?? null,
        meal_balance_score: normalized.meal_balance_score ?? null,
        inflammation_index_score: normalized.inflammation_index_score ?? null,
        meal_type_key: normalized.meal_type_key ?? null,
        portion_size_key: normalized.portion_size_key ?? null,
        color_diversity_score: normalized.color_diversity_score ?? null,
        vegetable_portion_ratio: normalized.vegetable_portion_ratio ?? null,
        protein_visibility_score: normalized.protein_visibility_score ?? null,
        whole_grain_indicator_score: normalized.whole_grain_indicator_score ?? null,
        meal_freshness_score: normalized.meal_freshness_score ?? null,
        cuisine_type_key: normalized.cuisine_type_key ?? null,
        meat_type_key: normalized.meat_type_key ?? null,
        cooking_method_key: normalized.cooking_method_key ?? null,
        meal_dietary_pattern_key: normalized.meal_dietary_pattern_key ?? null,
        allergen_visibility_keys: Array.isArray(normalized.allergen_visibility_keys)
          ? normalized.allergen_visibility_keys
          : [],
      };
    case 'super_health_v2':
      return {
        global_risk_score: normalized.global_risk_score,
        urgency_flag: normalized.urgency_flag,
        summary_key: normalized.summary_key,
        disclaimer_key: normalized.disclaimer_key,
        detected_conditions: normalized.detected_conditions,
      };
    case 'fat_distribution_scan_v2':
      // CO-01 — `analysis_summary`, `dominant_storage_pattern`, `priority_zones`
      // sont des champs texte libre produits par l'IA scanner et réinjectés
      // dans le prompt du coach LLM via le digest. Sanitization défensive.
      return {
        global_body_fat_estimate_percent:
          normalized.global_body_fat_estimate_percent,
        global_facial_fat_estimate_percent:
          normalized.global_facial_fat_estimate_percent,
        global_water_retention_estimate_percent:
          normalized.global_water_retention_estimate_percent,
        analysis_summary:
          sanitizeUntrustedAiText(normalized.analysis_summary) ?? '',
        dominant_storage_pattern:
          sanitizeUntrustedAiText(normalized.dominant_storage_pattern) ?? '',
        priority_zones: sanitizeUntrustedAiTextArray(normalized.priority_zones, {
          maxItems: 20,
          maxLength: 200,
        }),
        area_count: Array.isArray(normalized.areas_analysis)
          ? normalized.areas_analysis.length
          : 0,
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
        skin_clarity_score: normalized.skin_clarity_score ?? null,
        under_eye_shadow_score: normalized.under_eye_shadow_score ?? null,
        skin_radiance_score: normalized.skin_radiance_score ?? null,
        lip_dryness_score: normalized.lip_dryness_score ?? null,
        perceived_sex_key: normalized.perceived_sex_key ?? null,
        perceived_age_range_key: normalized.perceived_age_range_key ?? null,
        perceived_stress_level: normalized.perceived_stress_level ?? null,
        perceived_sleep_quality: normalized.perceived_sleep_quality ?? null,
      };
    case 'body':
      return {
        body_score: normalized.body_score,
        body_fat_percentage: normalized.body_fat_percentage,
        muscle_mass_key: normalized.muscle_mass_key,
        body_type_key: normalized.body_type_key,
        posture_score: normalized.posture_score,
        strength_index: normalized.strength_index,
        muscle_definition_score: normalized.muscle_definition_score ?? null,
        v_taper_score: normalized.v_taper_score ?? null,
        perceived_sex_key: normalized.perceived_sex_key ?? null,
        perceived_age_range_key: normalized.perceived_age_range_key ?? null,
        estimated_height_range_key: normalized.estimated_height_range_key ?? null,
        estimated_weight_range_key: normalized.estimated_weight_range_key ?? null,
        body_frame_key: normalized.body_frame_key ?? null,
        perceived_fitness_level_key: normalized.perceived_fitness_level_key ?? null,
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
        fiber_grams_estimate: normalized.fiber_grams_estimate ?? null,
        sugar_grams_estimate: normalized.sugar_grams_estimate ?? null,
        processing_level_score: normalized.processing_level_score ?? null,
        meal_type_key: normalized.meal_type_key ?? null,
        color_diversity_score: normalized.color_diversity_score ?? null,
        vegetable_portion_ratio: normalized.vegetable_portion_ratio ?? null,
        cuisine_type_key: normalized.cuisine_type_key ?? null,
        cooking_method_key: normalized.cooking_method_key ?? null,
        meal_dietary_pattern_key: normalized.meal_dietary_pattern_key ?? null,
        allergen_visibility_keys: Array.isArray(normalized.allergen_visibility_keys)
          ? normalized.allergen_visibility_keys
          : [],
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
    case 'fat_distribution_scan_v2':
      // CO-01 — voir createCoachRichKeyMetrics (idem)
      return {
        global_body_fat_estimate_percent:
          normalized.global_body_fat_estimate_percent,
        global_facial_fat_estimate_percent:
          normalized.global_facial_fat_estimate_percent,
        global_water_retention_estimate_percent:
          normalized.global_water_retention_estimate_percent,
        dominant_storage_pattern:
          sanitizeUntrustedAiText(normalized.dominant_storage_pattern) ?? '',
        priority_zones: sanitizeUntrustedAiTextArray(normalized.priority_zones, {
          maxItems: 4,
          maxLength: 200,
        }),
        area_count: Array.isArray(normalized.areas_analysis)
          ? normalized.areas_analysis.length
          : 0,
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
    case 'fat_distribution_scan_v2': {
      const analysisSummaryText = resolveFallbackText(
        raw.analysis_summary_i18n ?? raw.analysis_summary,
      );
      const dominantStoragePatternText = resolveFallbackText(
        raw.dominant_storage_pattern_i18n ?? raw.dominant_storage_pattern,
      );
      const disclaimerText = resolveFallbackText(
        raw.disclaimer_text_i18n ?? raw.disclaimer_text,
      );
      const areaTexts = Array.isArray(raw.areas_analysis)
        ? raw.areas_analysis
            .filter(isRecord)
            .slice(0, 4)
            .map((area) =>
              finalizeFallbackFields({
                area_name: resolveFallbackText(area.area_name),
                dominant_type: resolveFallbackText(area.dominant_type),
                explanation: resolveFallbackText(area.explanation),
                actionable_advice: resolveFallbackText(area.actionable_advice),
              }),
            )
            .filter((item): item is Record<string, unknown> => !!item)
        : [];

      return finalizeFallbackFields({
        ...(analysisSummaryText
          ? { analysis_summary_text: analysisSummaryText }
          : {}),
        ...(dominantStoragePatternText
          ? { dominant_storage_pattern_text: dominantStoragePatternText }
          : {}),
        ...(disclaimerText ? { disclaimer_text: disclaimerText } : {}),
        ...(areaTexts.length > 0 ? { area_texts: areaTexts } : {}),
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
  const analysisMeta = readAnalysisMetaFromNormalizedResult(currentScan.normalized);
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

  if (
    analysisMeta?.confidence_score !== null &&
    analysisMeta?.confidence_score !== undefined &&
    analysisMeta.confidence_score < COACH_LOW_CONFIDENCE_THRESHOLD
  ) {
    flags.add('low_confidence_scan');
  }

  if (
    (analysisMeta?.image_quality_score !== null &&
      analysisMeta?.image_quality_score !== undefined &&
      analysisMeta.image_quality_score < COACH_LOW_IMAGE_QUALITY_THRESHOLD) ||
    analysisMeta?.limitation_flags.includes('blur') ||
    analysisMeta?.limitation_flags.includes('low_light') ||
    analysisMeta?.limitation_flags.includes('occlusion')
  ) {
    flags.add('image_quality_limited');
  }

  if (
    (analysisMeta?.metric_coverage_score !== null &&
      analysisMeta?.metric_coverage_score !== undefined &&
      analysisMeta.metric_coverage_score < COACH_PARTIAL_METRIC_COVERAGE_THRESHOLD) ||
    analysisMeta?.limitation_flags.includes('partial_subject') ||
    analysisMeta?.limitation_flags.includes('portion_uncertain')
  ) {
    flags.add('partial_metric_coverage');
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
      const skinClarityScore = readNumericMetricValue(
        currentScan.key_metrics,
        'skin_clarity_score',
      );
      const underEyeShadowScore = readNumericMetricValue(
        currentScan.key_metrics,
        'under_eye_shadow_score',
      );
      const underEyeVolumeScore = readNumericMetricValue(
        currentScan.key_metrics,
        'under_eye_volume_score',
      );
      const eyeOpennessScore = readNumericMetricValue(
        currentScan.key_metrics,
        'eye_openness_score',
      );
      const complexionRednessScore = readNumericMetricValue(
        currentScan.key_metrics,
        'complexion_redness_score',
      );

      if (hydrationLevel !== null && hydrationLevel < 40) {
        flags.add('low_hydration');
      }

      if (fatigueLevel !== null && fatigueLevel > 60) {
        flags.add('high_fatigue');
      }

      if (skinClarityScore !== null && skinClarityScore < 40) {
        flags.add('low_skin_clarity');
      }

      if (underEyeShadowScore !== null && underEyeShadowScore > 60) {
        flags.add('high_under_eye_shadow');
      }

      if (underEyeVolumeScore !== null && underEyeVolumeScore > 55) {
        flags.add('high_under_eye_volume');
      }

      if (eyeOpennessScore !== null && eyeOpennessScore < 40) {
        flags.add('low_eye_openness');
      }

      if (complexionRednessScore !== null && complexionRednessScore > 60) {
        flags.add('high_complexion_redness');
      }

      const poreVisibilityScore = readNumericMetricValue(
        currentScan.key_metrics,
        'pore_visibility_score',
      );
      const skinEvennessScore = readNumericMetricValue(
        currentScan.key_metrics,
        'skin_evenness_score',
      );
      const skinRadianceScore = readNumericMetricValue(
        currentScan.key_metrics,
        'skin_radiance_score',
      );
      const lipDrynessScore = readNumericMetricValue(
        currentScan.key_metrics,
        'lip_dryness_score',
      );

      if (poreVisibilityScore !== null && poreVisibilityScore > 60) {
        flags.add('high_pore_visibility');
      }

      if (skinEvennessScore !== null && skinEvennessScore < 40) {
        flags.add('low_skin_evenness');
      }

      if (skinRadianceScore !== null && skinRadianceScore < 40) {
        flags.add('low_skin_radiance');
      }

      if (lipDrynessScore !== null && lipDrynessScore > 60) {
        flags.add('high_lip_dryness');
      }

      const perceivedStressLevel = readNumericMetricValue(
        currentScan.key_metrics,
        'perceived_stress_level',
      );
      const perceivedSleepQuality = readNumericMetricValue(
        currentScan.key_metrics,
        'perceived_sleep_quality',
      );

      if (perceivedStressLevel !== null && perceivedStressLevel > 60) {
        flags.add('high_perceived_stress');
      }

      if (perceivedSleepQuality !== null && perceivedSleepQuality < 40) {
        flags.add('low_perceived_sleep_quality');
      }
      break;
    }
    case 'body': {
      const bodyFatPercentage = readNumericMetricValue(
        currentScan.key_metrics,
        'body_fat_percentage',
      );
      const muscleDefinitionScore = readNumericMetricValue(
        currentScan.key_metrics,
        'muscle_definition_score',
      );
      const midsectionDefinitionScore = readNumericMetricValue(
        currentScan.key_metrics,
        'midsection_definition_score',
      );
      const shoulderAlignmentScore = readNumericMetricValue(
        currentScan.key_metrics,
        'shoulder_alignment_score',
      );
      const recoveryReadinessScore = readNumericMetricValue(
        currentScan.key_metrics,
        'recovery_readiness_score',
      );

      if (bodyFatPercentage !== null && bodyFatPercentage >= 30) {
        flags.add('high_body_fat');
      }

      if (muscleDefinitionScore !== null && muscleDefinitionScore < 35) {
        flags.add('low_muscle_definition');
      }

      if (midsectionDefinitionScore !== null && midsectionDefinitionScore < 35) {
        flags.add('low_midsection_definition');
      }

      if (shoulderAlignmentScore !== null && shoulderAlignmentScore < 50) {
        flags.add('low_shoulder_alignment');
      }

      if (recoveryReadinessScore !== null && recoveryReadinessScore < 40) {
        flags.add('low_recovery_readiness');
      }

      const upperBodyDefinitionScore = readNumericMetricValue(
        currentScan.key_metrics,
        'upper_body_definition_score',
      );
      const lowerBodyDefinitionScore = readNumericMetricValue(
        currentScan.key_metrics,
        'lower_body_definition_score',
      );
      const armDefinitionScore = readNumericMetricValue(
        currentScan.key_metrics,
        'arm_definition_score',
      );
      const vTaperScore = readNumericMetricValue(
        currentScan.key_metrics,
        'v_taper_score',
      );
      const bodyTensionIndicatorScore = readNumericMetricValue(
        currentScan.key_metrics,
        'body_tension_indicator_score',
      );

      if (upperBodyDefinitionScore !== null && upperBodyDefinitionScore < 35) {
        flags.add('low_upper_body_definition');
      }

      if (lowerBodyDefinitionScore !== null && lowerBodyDefinitionScore < 35) {
        flags.add('low_lower_body_definition');
      }

      if (armDefinitionScore !== null && armDefinitionScore < 35) {
        flags.add('low_arm_definition');
      }

      if (vTaperScore !== null && vTaperScore < 40) {
        flags.add('low_v_taper');
      }

      if (bodyTensionIndicatorScore !== null && bodyTensionIndicatorScore > 60) {
        flags.add('high_body_tension');
      }
      break;
    }
    case 'nutrition': {
      const proteinGrams = readNumericMetricValue(
        currentScan.key_metrics,
        'protein_grams',
      );
      const fiberGramsEstimate = readNumericMetricValue(
        currentScan.key_metrics,
        'fiber_grams_estimate',
      );
      const sugarGramsEstimate = readNumericMetricValue(
        currentScan.key_metrics,
        'sugar_grams_estimate',
      );
      const sodiumLevelScore = readNumericMetricValue(
        currentScan.key_metrics,
        'sodium_level_score',
      );
      const processingLevelScore = readNumericMetricValue(
        currentScan.key_metrics,
        'processing_level_score',
      );
      const mealBalanceScore = readNumericMetricValue(
        currentScan.key_metrics,
        'meal_balance_score',
      );
      const inflammationIndexScore = readNumericMetricValue(
        currentScan.key_metrics,
        'inflammation_index_score',
      );

      if (proteinGrams !== null && proteinGrams < 20) {
        flags.add('low_protein');
      }

      if (fiberGramsEstimate !== null && fiberGramsEstimate < 8) {
        flags.add('low_fiber');
      }

      if (sugarGramsEstimate !== null && sugarGramsEstimate > 35) {
        flags.add('high_sugar_intake');
      }

      if (sodiumLevelScore !== null && sodiumLevelScore >= 7) {
        flags.add('high_sodium_intake');
      }

      if (processingLevelScore !== null && processingLevelScore > 65) {
        flags.add('high_processing_level');
      }

      if (mealBalanceScore !== null && mealBalanceScore < 40) {
        flags.add('low_meal_balance');
      }

      if (inflammationIndexScore !== null && inflammationIndexScore > 60) {
        flags.add('high_inflammation_index');
      }

      const colorDiversityScore = readNumericMetricValue(
        currentScan.key_metrics,
        'color_diversity_score',
      );
      const vegetablePortionRatio = readNumericMetricValue(
        currentScan.key_metrics,
        'vegetable_portion_ratio',
      );
      const proteinVisibilityScore = readNumericMetricValue(
        currentScan.key_metrics,
        'protein_visibility_score',
      );

      if (colorDiversityScore !== null && colorDiversityScore < 4) {
        flags.add('low_color_diversity');
      }

      if (vegetablePortionRatio !== null && vegetablePortionRatio < 30) {
        flags.add('low_vegetable_portion');
      }

      if (proteinVisibilityScore !== null && proteinVisibilityScore < 40) {
        flags.add('low_protein_visibility');
      }

      const allergenVisibilityKeys = (currentScan.key_metrics as unknown as Record<string, unknown>)
        ?.allergen_visibility_keys;
      if (
        Array.isArray(allergenVisibilityKeys) &&
        allergenVisibilityKeys.length > 0
      ) {
        flags.add('allergen_visible');
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

      if (currentScan.normalized.scan_type === 'fat_distribution_scan_v2') {
        const bodyFatEstimate = readNumericMetricValue(
          currentScan.key_metrics,
          'global_body_fat_estimate_percent',
        );
        const facialFatEstimate = readNumericMetricValue(
          currentScan.key_metrics,
          'global_facial_fat_estimate_percent',
        );
        const waterRetentionEstimate = readNumericMetricValue(
          currentScan.key_metrics,
          'global_water_retention_estimate_percent',
        );

        if (bodyFatEstimate !== null && bodyFatEstimate >= 30) {
          flags.add('high_body_fat');
        }

        if (facialFatEstimate !== null && facialFatEstimate >= 20) {
          flags.add('high_facial_fat');
        }

        if (waterRetentionEstimate !== null && waterRetentionEstimate >= 16) {
          flags.add('high_water_retention');
        }
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
    analysis_meta: readAnalysisMetaFromNormalizedResult(currentScan.normalized),
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

export function parseCoachEntryRow(row: unknown): CoachEntry | null {
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
    normalizeCoachGenerationPromptType(row.prompt_type) ??
    normalizeCoachGenerationPromptType(requestPayloadJson?.prompt_type);
  const requestQuestionKey = normalizeCoachQuestionKey(
    requestPayloadJson?.question_key,
  );
  const rawQuestionKey =
    normalizeCoachQuestionKey(row.question_key) ?? requestQuestionKey;
  const rawQuestionText =
    normalizeCoachQuestionText(row.question_text) ??
    normalizeCoachQuestionText(requestPayloadJson?.question_text);

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
  const mergedContent = mergeCoachStructuredContentWithBodyFallback(
    parsedContent,
    body,
    {
      fallbackTitle: title,
      locale,
    },
  );
  const resolvedQuestionSelection = promptType
    ? resolveCoachQuestionSelection({
        promptType,
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
        locale,
      })
    : {
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
      };

  return {
    id,
    title: title ?? null,
    body: body ?? null,
    disclaimer:
      readOptionalString(row.disclaimer) ?? getDefaultCoachDisclaimer(locale),
    persona_key: readCoachPersonaKey(rawPersonaKey),
    has_valid_persona: hasValidPersona,
    prompt_type: promptType,
    question_key: resolvedQuestionSelection.questionKey ?? null,
    question_text: resolvedQuestionSelection.questionText ?? null,
    response_version: responseVersion,
    content: mergedContent,
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

export function parseCoachHistorySummaryRow(row: unknown): CoachHistorySummary {
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
  const promptType = normalizeCoachGenerationPromptType(payload.prompt_type);
  const responseVersion: CoachResponseVersion = isCoachResponseVersion(
    payload.response_version,
  )
    ? payload.response_version
    : 1;
  const contentSource = isRecord(payload.content) ? payload.content : null;
  const parsedContent = contentSource
    ? parseCoachStructuredContent(contentSource, { fallbackTitle: title }).content
    : null;
  const body = readOptionalString(payload.body);
  const mergedContent = mergeCoachStructuredContentWithBodyFallback(
    parsedContent,
    body,
    {
      fallbackTitle: title,
      locale,
    },
  );
  const rawQuestionKey = normalizeCoachQuestionKey(payload.question_key);
  const rawQuestionText = normalizeCoachQuestionText(payload.question_text);
  const resolvedQuestionSelection = promptType
    ? resolveCoachQuestionSelection({
        promptType,
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
        locale,
      })
    : {
        questionKey: rawQuestionKey,
        questionText: rawQuestionText,
      };

  return {
    success: true,
    cached: payload.cached === true,
    entry_id: entryId,
    persona_key: readCoachPersonaKey(payload.persona_key),
    prompt_type: promptType,
    question_key: resolvedQuestionSelection.questionKey ?? null,
    question_text: resolvedQuestionSelection.questionText ?? null,
    response_version: mergedContent ? 2 : responseVersion,
    status:
      payload.status === 'pending' ||
      payload.status === 'ready' ||
      payload.status === 'error'
        ? payload.status
        : 'error',
    title,
    body,
    disclaimer:
      readOptionalString(payload.disclaimer) ?? getDefaultCoachDisclaimer(locale),
    cta_label: readOptionalString(payload.cta_label),
    cta_route: readOptionalString(payload.cta_route),
    content: mergedContent,
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

  const normalized = tryNormalizeAnalysisResult(scanRow.analysis_result, {
    expectedScanType: scanType,
  });
  if (!normalized) {
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

function normalizeSelectedCoachScanId(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= 120
    ? normalized
    : null;
}

function coachScanIdMatches(scan: CoachSourceScan, scanId: string) {
  return scan.id === scanId || scan.digest.scan_id === scanId;
}

function resolveSelectedScanForPrompt(
  promptType: CoachGenerationPromptType,
  scans: CoachSourceScan[],
  selectedScanId?: string | null,
) {
  const normalizedSelectedScanId = normalizeSelectedCoachScanId(selectedScanId);
  const selectedScan = normalizedSelectedScanId
    ? scans.find((scan) => coachScanIdMatches(scan, normalizedSelectedScanId)) ??
      null
    : null;
  if (selectedScan) {
    return selectedScan;
  }

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
    case 'free_question':
    case 'recovery_plan':
    case 'trend_review':
    case 'weekly_plan':
    case 'latest_scan':
    default:
      return scans[0] ?? null;
  }
}

function selectRecentScansForPrompt(
  promptType: CoachGenerationPromptType,
  scans: CoachSourceScan[],
  selectedScan?: CoachSourceScan | null,
): CoachSourceScan[] {
  const quota = getCoachPromptScanQuota(promptType);
  const windowedScans =
    typeof quota.recentWindowDays === 'number'
      ? getScansWithinLastDays(scans, quota.recentWindowDays)
      : scans;

  if (!quota.typeFilter || quota.typeFilter.length === 0) {
    const selectedFirst = selectedScan
      ? [
          selectedScan,
          ...windowedScans.filter((scan) => scan.id !== selectedScan.id),
        ]
      : windowedScans;
    return selectedFirst.slice(0, quota.recentLimit);
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
  const selectedFirst = selectedScan
    ? [selectedScan, ...merged.filter((scan) => scan.id !== selectedScan.id)]
    : merged;
  return selectedFirst.slice(0, quota.recentLimit);
}

function getScansWithinLastDays(scans: CoachSourceScan[], days: number) {
  const now = Date.now();
  const cutoffMs = now - days * 24 * 60 * 60 * 1000;

  return scans.filter((scan) => {
    const timestamp = Date.parse(scan.captured_at);
    return Number.isFinite(timestamp) && timestamp >= cutoffMs;
  });
}

const PERSONA_AGE_FALLBACK_THRESHOLDS: ReadonlyArray<[number, string]> = [
  [18, 'under_18'],
  [25, '18_24'],
  [35, '25_34'],
  [45, '35_44'],
  [55, '45_54'],
  [65, '55_64'],
];

function ageNumericToRangeKey(age: number): string | null {
  if (!Number.isFinite(age) || age < 0 || age > 130) return null;
  for (const [threshold, key] of PERSONA_AGE_FALLBACK_THRESHOLDS) {
    if (age < threshold) return key;
  }
  return '65_plus';
}

function readPersonaKeyMetric(
  metrics: CoachKeyMetrics,
  field: string,
): string | null {
  const value = (metrics as unknown as Record<string, unknown>)[field];
  if (typeof value !== 'string' || !value) return null;
  return value;
}

function readPersonaArrayMetric(
  metrics: CoachKeyMetrics,
  field: string,
): string[] {
  const value = (metrics as unknown as Record<string, unknown>)[field];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
}

function aggregateModeKey(values: ReadonlyArray<string | null>): {
  value: string | null;
  sample_count: number;
} {
  const counts = new Map<string, number>();
  let sample_count = 0;
  for (const value of values) {
    if (!value) continue;
    sample_count += 1;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  if (sample_count === 0) return { value: null, sample_count: 0 };

  let bestKey: string | null = null;
  let bestCount = -1;
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestKey = key;
      bestCount = count;
    }
  }
  return { value: bestKey, sample_count };
}

function confidenceFromSampleCount(count: number): InferredPersonaConfidence | null {
  if (count <= 0) return null;
  if (count <= 1) return 'low';
  if (count <= 4) return 'medium';
  return 'high';
}

function buildPersonaField<T extends string>(
  values: ReadonlyArray<T | null>,
): CoachInferredPersonaField<T> {
  const { value, sample_count } = aggregateModeKey(values);
  return {
    value: (value as T | null) ?? null,
    source: 'infere',
    confidence: confidenceFromSampleCount(sample_count),
    sample_count,
  };
}

function pickFaceAgeRangeKey(scan: CoachSourceScan): string | null {
  if (scan.normalized.scan_type !== 'face') return null;
  const rangeKey = readPersonaKeyMetric(
    scan.key_metrics,
    'perceived_age_range_key',
  );
  if (rangeKey) return rangeKey;

  const perceivedAge = readNumericMetricValue(scan.key_metrics, 'perceived_age');
  if (perceivedAge !== null) {
    return ageNumericToRangeKey(perceivedAge);
  }
  return null;
}

function pickBodyAgeRangeKey(scan: CoachSourceScan): string | null {
  if (scan.normalized.scan_type !== 'body') return null;
  return readPersonaKeyMetric(scan.key_metrics, 'perceived_age_range_key');
}

function deriveEngagementLevel(scanCount7d: number): CoachEngagementLevel {
  if (scanCount7d < 2) return 'low';
  if (scanCount7d < 5) return 'medium';
  return 'high';
}

function deriveOverallConfidence(scanCount: number): InferredPersonaConfidence {
  if (scanCount < 3) return 'low';
  if (scanCount < 8) return 'medium';
  return 'high';
}

function aggregateDietarySignals(scans: CoachSourceScan[]): string[] {
  const nutritionScans = scans.filter((scan) => scan.scan_type === 'nutrition');
  if (nutritionScans.length === 0) return [];

  const patternCounts = new Map<string, number>();
  for (const scan of nutritionScans) {
    const pattern = readPersonaKeyMetric(scan.key_metrics, 'meal_dietary_pattern_key');
    if (!pattern || pattern === 'unclear') continue;
    patternCounts.set(pattern, (patternCounts.get(pattern) ?? 0) + 1);
  }

  const minOccurrences = Math.max(2, Math.ceil(nutritionScans.length * 0.3));
  return Array.from(patternCounts.entries())
    .filter(([, count]) => count >= minOccurrences)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key);
}

function aggregateRecurringAllergenSignals(scans: CoachSourceScan[]): string[] {
  const nutritionScans = scans.filter((scan) => scan.scan_type === 'nutrition');
  if (nutritionScans.length === 0) return [];

  const counts = new Map<string, number>();
  for (const scan of nutritionScans) {
    const keys = readPersonaArrayMetric(scan.key_metrics, 'allergen_visibility_keys');
    for (const key of keys) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const minOccurrences = Math.max(2, Math.ceil(nutritionScans.length * 0.3));
  return Array.from(counts.entries())
    .filter(([, count]) => count >= minOccurrences)
    .sort(([, a], [, b]) => b - a)
    .map(([key]) => key);
}

function deriveDominantScanFocus(
  scans: CoachSourceScan[],
): CoachInferredPersonaField<ScanType> {
  if (scans.length === 0) {
    return { value: null, source: 'infere', confidence: null, sample_count: 0 };
  }

  const counts = new Map<ScanType, number>();
  for (const scan of scans) {
    counts.set(scan.scan_type, (counts.get(scan.scan_type) ?? 0) + 1);
  }

  let bestType: ScanType | null = null;
  let bestCount = -1;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      bestType = type;
      bestCount = count;
    }
  }

  return {
    value: bestType,
    source: 'infere',
    confidence: confidenceFromSampleCount(bestCount),
    sample_count: bestCount > 0 ? bestCount : 0,
  };
}

function computeMetricSignals(
  scans: CoachSourceScan[],
): {
  weak_metrics: CoachInferredMetricSignal[];
  strong_metrics: CoachInferredMetricSignal[];
} {
  const weak: CoachInferredMetricSignal[] = [];
  const strong: CoachInferredMetricSignal[] = [];

  for (const scanType of Object.keys(COACH_METRIC_SPECS) as ScanType[]) {
    const specs = COACH_METRIC_SPECS[scanType];
    const typeScans = scans.filter((scan) => scan.scan_type === scanType);
    if (typeScans.length < 2) continue;

    for (const spec of specs) {
      const values: number[] = [];
      for (const scan of typeScans) {
        const value = readNumericMetricValue(scan.key_metrics, spec.metric);
        if (value !== null) values.push(value);
      }
      if (values.length < 2) continue;

      const average = values.reduce((acc, v) => acc + v, 0) / values.length;
      const rounded = roundMetricNumber(average);
      const signal: CoachInferredMetricSignal = {
        metric: spec.metric,
        scan_type: scanType,
        average_value: rounded,
        sample_count: values.length,
        interpretation_hint: spec.interpretationHint,
      };

      if (spec.interpretationHint === 'higher_is_better') {
        if (average < 40) weak.push(signal);
        else if (average > 70) strong.push(signal);
      } else if (spec.interpretationHint === 'lower_is_better') {
        if (average > 60) weak.push(signal);
        else if (average < 30) strong.push(signal);
      }
    }
  }

  const sortByGap = (signal: CoachInferredMetricSignal): number => {
    return signal.interpretation_hint === 'higher_is_better'
      ? signal.average_value
      : 100 - signal.average_value;
  };

  weak.sort((a, b) => sortByGap(a) - sortByGap(b));
  strong.sort((a, b) => sortByGap(b) - sortByGap(a));

  return {
    weak_metrics: weak.slice(0, 6),
    strong_metrics: strong.slice(0, 6),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Data reliability — quantitative scoring of how much the coach should
//   weight the inferred persona. The overall percent is a weighted composite
//   of sample size, recency, consistency, image quality, and coverage.
// ────────────────────────────────────────────────────────────────────────────

function computeSampleSizePercent(count: number): number {
  if (count <= 0) return 0;
  if (count >= 20) return 100;
  if (count >= 10) return 75 + ((count - 10) / 10) * 25;
  if (count >= 5) return 50 + ((count - 5) / 5) * 25;
  if (count >= 3) return 30 + ((count - 3) / 2) * 20;
  if (count >= 1) return 10 + ((count - 1) / 2) * 20;
  return 0;
}

function computeRecencyPercent(daysAgo: number | null): number {
  if (daysAgo === null || !Number.isFinite(daysAgo)) return 0;
  if (daysAgo <= 0) return 100;
  if (daysAgo >= 90) return 10;
  if (daysAgo >= 30) return 10 + ((90 - daysAgo) / 60) * 30;
  if (daysAgo >= 7) return 40 + ((30 - daysAgo) / 23) * 40;
  return 80 + ((7 - daysAgo) / 7) * 20;
}

function computeConsistencyPercent(scans: CoachSourceScan[]): number {
  const fields = ['perceived_sex_key', 'perceived_age_range_key', 'body_frame_key'];
  let totalPercent = 0;
  let fieldsWithData = 0;

  for (const field of fields) {
    const distinct = new Set<string>();
    for (const scan of scans) {
      const value = readPersonaKeyMetric(scan.key_metrics, field);
      if (value) distinct.add(value);
    }
    if (distinct.size === 0) continue;
    fieldsWithData += 1;
    totalPercent += Math.max(20, 100 / distinct.size);
  }

  if (fieldsWithData === 0) return 50;
  return Math.round(totalPercent / fieldsWithData);
}

function computeImageQualityPercent(scans: CoachSourceScan[]): number {
  const scores: number[] = [];
  for (const scan of scans) {
    const meta = scan.normalized && 'analysis_meta' in scan.normalized
      ? scan.normalized.analysis_meta
      : null;
    const score = meta?.image_quality_score;
    if (typeof score === 'number' && Number.isFinite(score)) {
      scores.push(Math.max(0, Math.min(100, score)));
    }
  }
  if (scores.length === 0) return 50;
  return Math.round(scores.reduce((acc, v) => acc + v, 0) / scores.length);
}

function computeCoveragePercentFromFields(
  fields: ReadonlyArray<CoachInferredPersonaField<string>>,
): number {
  if (fields.length === 0) return 0;
  const filled = fields.filter((field) => field.value !== null).length;
  return Math.round((filled / fields.length) * 100);
}

function computeOverallReliabilityPercent(
  components: CoachDataReliabilityComponents,
): number {
  const weighted =
    0.30 * components.sample_size_percent +
    0.25 * components.recency_percent +
    0.20 * components.consistency_percent +
    0.15 * components.image_quality_percent +
    0.10 * components.coverage_percent;
  return Math.round(Math.max(0, Math.min(100, weighted)));
}

function detectReliabilityCaveats(
  scans: CoachSourceScan[],
  components: CoachDataReliabilityComponents,
  lastScanDaysAgo: number | null,
): string[] {
  const caveats: string[] = [];
  if (scans.length < 5) caveats.push('low_sample_size');
  if (lastScanDaysAgo !== null && lastScanDaysAgo > 30) caveats.push('stale_data_30d_plus');
  if (components.image_quality_percent < 50) caveats.push('image_quality_limited');

  const sexValues = new Set(
    scans
      .map((scan) => readPersonaKeyMetric(scan.key_metrics, 'perceived_sex_key'))
      .filter((v): v is string => !!v),
  );
  if (sexValues.size >= 2) caveats.push('inconsistent_sex_inference');

  const scanTypes = new Set(scans.map((scan) => scan.scan_type));
  if (scanTypes.size === 1) caveats.push('single_scan_type_only');

  if (components.coverage_percent < 40) caveats.push('low_persona_coverage');

  return caveats;
}

function buildDataReliability(
  scans: CoachSourceScan[],
  apparentFields: ReadonlyArray<CoachInferredPersonaField<string>>,
  lastScanDaysAgo: number | null,
): CoachDataReliability {
  const components: CoachDataReliabilityComponents = {
    sample_size_percent: Math.round(computeSampleSizePercent(scans.length)),
    recency_percent: Math.round(computeRecencyPercent(lastScanDaysAgo)),
    consistency_percent: computeConsistencyPercent(scans),
    image_quality_percent: computeImageQualityPercent(scans),
    coverage_percent: computeCoveragePercentFromFields(apparentFields),
  };
  return {
    overall_percent: computeOverallReliabilityPercent(components),
    components,
    caveats: detectReliabilityCaveats(scans, components, lastScanDaysAgo),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Temporal patterns — cadence, dormancy, time-of-day, streaks.
// ────────────────────────────────────────────────────────────────────────────

function bucketHourToTimeOfDay(
  hour: number,
): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour < 6) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'afternoon';
  if (hour < 22) return 'evening';
  return 'night';
}

function classifyScanFrequency(
  scansLast14d: number,
): CoachScanFrequencyLabel {
  if (scansLast14d === 0) return 'unknown';
  if (scansLast14d >= 7) return 'daily';
  if (scansLast14d >= 3) return 'regular';
  return 'sporadic';
}

function classifyDormancyRisk(
  lastScanDaysAgo: number | null,
): CoachDormancyRiskLevel {
  if (lastScanDaysAgo === null) return 'high';
  if (lastScanDaysAgo > 14) return 'high';
  if (lastScanDaysAgo > 7) return 'medium';
  return 'low';
}

function classifyWeekdayWeekendBalance(
  scans: CoachSourceScan[],
): CoachWeekdayWeekendBalance {
  if (scans.length < 3) return 'unknown';
  let weekday = 0;
  let weekend = 0;
  for (const scan of scans) {
    const date = new Date(scan.captured_at);
    if (!Number.isFinite(date.getTime())) continue;
    const day = date.getDay();
    if (day === 0 || day === 6) weekend += 1;
    else weekday += 1;
  }
  const total = weekday + weekend;
  if (total === 0) return 'unknown';
  const weekendShare = weekend / total;
  if (weekendShare >= 0.55) return 'weekend_heavy';
  if (weekendShare <= 0.20) return 'weekday_heavy';
  return 'balanced';
}

function pickPreferredTimeOfDay(
  scans: CoachSourceScan[],
): CoachPreferredTimeOfDay {
  if (scans.length < 3) return 'unknown';
  const counts = new Map<string, number>();
  let total = 0;
  for (const scan of scans) {
    const date = new Date(scan.captured_at);
    if (!Number.isFinite(date.getTime())) continue;
    const bucket = bucketHourToTimeOfDay(date.getHours());
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    total += 1;
  }
  if (total === 0) return 'unknown';
  let topBucket: string | null = null;
  let topCount = 0;
  for (const [bucket, count] of counts) {
    if (count > topCount) {
      topBucket = bucket;
      topCount = count;
    }
  }
  if (!topBucket) return 'unknown';
  return topCount / total >= 0.4 ? (topBucket as CoachPreferredTimeOfDay) : 'mixed';
}

function computeStreaks(scans: CoachSourceScan[]): {
  current_streak_days: number;
  longest_streak_days: number;
} {
  if (scans.length === 0) return { current_streak_days: 0, longest_streak_days: 0 };
  const dayKeys = Array.from(
    new Set(
      scans
        .map((scan) => new Date(scan.captured_at))
        .filter((d) => Number.isFinite(d.getTime()))
        .map((d) => d.toISOString().slice(0, 10)),
    ),
  ).sort();

  if (dayKeys.length === 0) return { current_streak_days: 0, longest_streak_days: 0 };

  let longest = 1;
  let running = 1;
  for (let i = 1; i < dayKeys.length; i += 1) {
    const prev = new Date(`${dayKeys[i - 1]}T00:00:00.000Z`).getTime();
    const cur = new Date(`${dayKeys[i]}T00:00:00.000Z`).getTime();
    const diffDays = Math.round((cur - prev) / 86400000);
    if (diffDays === 1) {
      running += 1;
      if (running > longest) longest = running;
    } else {
      running = 1;
    }
  }

  const lastDayKey = dayKeys[dayKeys.length - 1];
  const lastDayMs = new Date(`${lastDayKey}T00:00:00.000Z`).getTime();
  const todayMs = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z').getTime();
  const lastDiff = Math.round((todayMs - lastDayMs) / 86400000);
  const currentStreak = lastDiff <= 1 ? running : 0;

  return { current_streak_days: currentStreak, longest_streak_days: longest };
}

function computeLastScanDaysAgo(scans: CoachSourceScan[]): number | null {
  if (scans.length === 0) return null;
  const now = Date.now();
  let mostRecent = -Infinity;
  for (const scan of scans) {
    const ts = Date.parse(scan.captured_at);
    if (Number.isFinite(ts) && ts > mostRecent) mostRecent = ts;
  }
  if (!Number.isFinite(mostRecent)) return null;
  return Math.max(0, Math.floor((now - mostRecent) / 86400000));
}

function buildTemporalPatterns(
  scans: CoachSourceScan[],
  scanCount7d: number,
  lastScanDaysAgo: number | null,
): CoachTemporalPatterns {
  const scansLast30d = getScansWithinLastDays(scans, 30).length;
  const scansLast14d = getScansWithinLastDays(scans, 14).length;
  const { current_streak_days, longest_streak_days } = computeStreaks(scans);

  return {
    last_scan_days_ago: lastScanDaysAgo,
    scans_last_7d: scanCount7d,
    scans_last_30d: scansLast30d,
    scan_frequency_label: classifyScanFrequency(scansLast14d),
    preferred_time_of_day_key: pickPreferredTimeOfDay(scans),
    weekday_weekend_balance: classifyWeekdayWeekendBalance(scans),
    longest_streak_days,
    current_streak_days,
    dormancy_risk_level: classifyDormancyRisk(lastScanDaysAgo),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Goal inference + motivation indicators.
// ────────────────────────────────────────────────────────────────────────────

function scanTypeDistribution(
  scans: CoachSourceScan[],
): Map<ScanType, number> {
  const counts = new Map<ScanType, number>();
  for (const scan of scans) {
    counts.set(scan.scan_type, (counts.get(scan.scan_type) ?? 0) + 1);
  }
  return counts;
}

function dominantScanShare(
  scans: CoachSourceScan[],
  scanType: ScanType,
): number {
  if (scans.length === 0) return 0;
  const distribution = scanTypeDistribution(scans);
  return (distribution.get(scanType) ?? 0) / scans.length;
}

function averageMetricForType(
  scans: CoachSourceScan[],
  scanType: ScanType,
  metric: string,
): number | null {
  const values: number[] = [];
  for (const scan of scans) {
    if (scan.scan_type !== scanType) continue;
    const v = readNumericMetricValue(scan.key_metrics, metric);
    if (v !== null) values.push(v);
  }
  if (values.length === 0) return null;
  return values.reduce((acc, v) => acc + v, 0) / values.length;
}

function inferPrimaryGoal(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
  engagement: CoachEngagementLevel,
): CoachGoalInference {
  if (scans.length < 2) {
    return {
      primary_goal_key: 'unclear',
      confidence: null,
      motivation_indicators: [],
    };
  }

  const bodyShare = dominantScanShare(scans, 'body');
  const faceShare = dominantScanShare(scans, 'health');
  const nutritionShare = dominantScanShare(scans, 'nutrition');
  const superShare = dominantScanShare(scans, 'super');

  const motivationIndicators: string[] = [];
  if (faceShare >= 0.4) motivationIndicators.push('aesthetic_focus');
  if (bodyShare >= 0.4) motivationIndicators.push('body_composition_focus');
  if (nutritionShare >= 0.4) motivationIndicators.push('nutrition_tracking_focus');
  if (Math.max(bodyShare, faceShare, nutritionShare) < 0.5 && scans.length >= 4) {
    motivationIndicators.push('holistic_wellness');
  }
  const stressAvg = averageMetricForType(scans, 'health', 'perceived_stress_level');
  const sleepAvg = averageMetricForType(scans, 'health', 'perceived_sleep_quality');
  if ((stressAvg !== null && stressAvg > 60) || (sleepAvg !== null && sleepAvg < 40)) {
    motivationIndicators.push('recovery_focus');
  }
  if (engagement === 'high') motivationIndicators.push('consistency');

  let primaryGoal: CoachPrimaryGoalKey = 'unclear';
  if (bodyShare >= 0.4 && trajectories.body_fat_percentage.direction === 'improving') {
    primaryGoal = 'weight_loss';
  } else if (
    bodyShare >= 0.4 &&
    trajectories.muscle_definition_score.direction === 'improving'
  ) {
    primaryGoal = 'muscle_gain';
  } else if (faceShare >= 0.5) {
    primaryGoal = 'skin_health';
  } else if (
    (stressAvg !== null && stressAvg > 60) ||
    (sleepAvg !== null && sleepAvg < 40)
  ) {
    primaryGoal = 'sleep_recovery';
  } else if (
    superShare > 0 ||
    (bodyShare > 0.25 && nutritionShare > 0.25 && faceShare > 0.25)
  ) {
    primaryGoal = 'general_wellness';
  } else if (
    bodyShare >= 0.4 &&
    trajectories.muscle_definition_score.direction === 'improving' &&
    trajectories.body_score.direction === 'improving'
  ) {
    primaryGoal = 'sport_performance';
  }

  if (primaryGoal !== 'unclear' && motivationIndicators.length === 0) {
    motivationIndicators.push('goal_oriented');
  }

  return {
    primary_goal_key: primaryGoal,
    confidence: confidenceFromSampleCount(scans.length),
    motivation_indicators: Array.from(new Set(motivationIndicators)),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Lifestyle signature — archetype + aggregate stress/sleep/hydration/recovery.
// ────────────────────────────────────────────────────────────────────────────

function averageFromMetrics(
  scans: CoachSourceScan[],
  picks: ReadonlyArray<{ scan_type: ScanType; metric: string; scale?: number }>,
): number | null {
  const values: number[] = [];
  for (const { scan_type, metric, scale } of picks) {
    for (const scan of scans) {
      if (scan.scan_type !== scan_type) continue;
      const v = readNumericMetricValue(scan.key_metrics, metric);
      if (v !== null) values.push(scale ? v * scale : v);
    }
  }
  if (values.length === 0) return null;
  return Math.round(values.reduce((acc, v) => acc + v, 0) / values.length);
}

function classifyArchetype(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
  riskSignals: CoachRiskSignals,
  recoveryAggregate: number | null,
  stressAggregate: number | null,
  engagement: CoachEngagementLevel,
): CoachLifestyleArchetypeKey {
  if (scans.length < 3) return 'unclear';

  const fitnessLevels = scans
    .map((scan) => readPersonaKeyMetric(scan.key_metrics, 'perceived_fitness_level_key'))
    .filter((v): v is string => !!v);
  const isFit = fitnessLevels.some(
    (lvl) => lvl === 'very_active' || lvl === 'athletic',
  );

  const faceShare = dominantScanShare(scans, 'health');
  const bodyShare = dominantScanShare(scans, 'body');
  const balancedMix = Math.max(faceShare, bodyShare) < 0.6 && scans.length >= 5;

  const elevatedRisk =
    riskSignals.cardiovascular_risk_level_key === 'elevated' ||
    riskSignals.metabolic_risk_level_key === 'elevated' ||
    riskSignals.inflammation_risk_level_key === 'elevated';
  const chronicStress = stressAggregate !== null && stressAggregate > 60;
  const lowRecovery = recoveryAggregate !== null && recoveryAggregate < 40;

  if (elevatedRisk || chronicStress || lowRecovery) return 'health_recovery';
  if (isFit && bodyShare >= 0.3 && trajectories.body_score.direction !== 'declining') {
    return 'active_athlete';
  }
  if (balancedMix && engagement === 'high') return 'wellness_seeker';
  if (faceShare >= 0.5) return 'aesthetic_focused';
  if (engagement === 'low' || scans.length < 5) return 'casual_explorer';
  return 'unclear';
}

function buildLifestyleSignature(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
  riskSignals: CoachRiskSignals,
  engagement: CoachEngagementLevel,
): CoachLifestyleSignature {
  const stress = averageFromMetrics(scans, [
    { scan_type: 'health', metric: 'perceived_stress_level' },
  ]);
  const sleep = averageFromMetrics(scans, [
    { scan_type: 'health', metric: 'perceived_sleep_quality' },
  ]);
  const hydration = averageFromMetrics(scans, [
    { scan_type: 'health', metric: 'hydration_level' },
    { scan_type: 'nutrition', metric: 'hydration_contribution_score', scale: 10 },
  ]);

  const recoveryValues: number[] = [];
  for (const scan of scans) {
    if (scan.scan_type !== 'body') continue;
    const readiness = readNumericMetricValue(scan.key_metrics, 'recovery_readiness_score');
    if (readiness !== null) recoveryValues.push(readiness);
    const tension = readNumericMetricValue(scan.key_metrics, 'body_tension_indicator_score');
    if (tension !== null) recoveryValues.push(100 - tension);
  }
  const recovery =
    recoveryValues.length === 0
      ? null
      : Math.round(recoveryValues.reduce((acc, v) => acc + v, 0) / recoveryValues.length);

  return {
    archetype_key: classifyArchetype(
      scans,
      trajectories,
      riskSignals,
      recovery,
      stress,
      engagement,
    ),
    stress_indicator_aggregate: stress,
    sleep_indicator_aggregate: sleep,
    hydration_indicator_aggregate: hydration,
    recovery_indicator_aggregate: recovery,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Nutrition profile — preferences and intake averages.
// ────────────────────────────────────────────────────────────────────────────

function topKeysByFrequency(
  scans: CoachSourceScan[],
  field: string,
  limit: number,
): string[] {
  const nutritionScans = scans.filter((s) => s.scan_type === 'nutrition');
  if (nutritionScans.length === 0) return [];
  const counts = new Map<string, number>();
  for (const scan of nutritionScans) {
    const key = readPersonaKeyMetric(scan.key_metrics, field);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([key]) => key);
}

function buildMealTimingDistribution(
  scans: CoachSourceScan[],
): Record<string, number> {
  const distribution: Record<string, number> = {};
  for (const scan of scans) {
    if (scan.scan_type !== 'nutrition') continue;
    const key = readPersonaKeyMetric(scan.key_metrics, 'meal_type_key');
    if (!key) continue;
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return distribution;
}

function buildNutritionProfile(
  scans: CoachSourceScan[],
): CoachNutritionProfile {
  const nutritionScans = scans.filter((s) => s.scan_type === 'nutrition');
  const cuisinePrefs = topKeysByFrequency(scans, 'cuisine_type_key', 3);
  const cookingPrefs = topKeysByFrequency(scans, 'cooking_method_key', 2);
  const meatPrefs = topKeysByFrequency(scans, 'meat_type_key', 1);

  const colorAvg = averageMetricForType(scans, 'nutrition', 'color_diversity_score');
  const diversityScore =
    colorAvg !== null
      ? Math.min(100, Math.round(colorAvg * 10 + (cuisinePrefs.length >= 3 ? 20 : 0)))
      : null;

  const processingAvg = averageMetricForType(scans, 'nutrition', 'processing_level_score');
  const sugarAvg = averageMetricForType(scans, 'nutrition', 'sugar_grams_estimate');
  const fiberAvg = averageMetricForType(scans, 'nutrition', 'fiber_grams_estimate');
  const proteinAvg = averageMetricForType(scans, 'nutrition', 'protein_grams');

  const roundOptional = (value: number | null): number | null =>
    value === null ? null : Math.round(value);

  return {
    dietary_diversity_score: diversityScore,
    cuisine_preference_keys: cuisinePrefs,
    cooking_method_preference_keys: cookingPrefs,
    dominant_meat_type_key: meatPrefs[0] ?? null,
    meal_timing_distribution:
      nutritionScans.length === 0 ? {} : buildMealTimingDistribution(scans),
    processing_level_average: roundOptional(processingAvg),
    sugar_intake_average_grams: roundOptional(sugarAvg),
    fiber_intake_average_grams: roundOptional(fiberAvg),
    protein_intake_average_grams: roundOptional(proteinAvg),
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Trajectories — improving/stable/declining for 7 key metrics.
// ────────────────────────────────────────────────────────────────────────────

const TRAJECTORY_METRIC_DEFS: ReadonlyArray<{
  field: keyof CoachTrajectoryMap;
  metric: string;
  scan_type: ScanType;
  interpretationHint: CoachMetricInterpretationHint;
  significantDelta: number;
}> = [
  { field: 'body_score', metric: 'body_score', scan_type: 'body', interpretationHint: 'higher_is_better', significantDelta: 5 },
  { field: 'face_score', metric: 'face_score', scan_type: 'health', interpretationHint: 'higher_is_better', significantDelta: 5 },
  { field: 'plate_health_score', metric: 'plate_health_score', scan_type: 'nutrition', interpretationHint: 'higher_is_better', significantDelta: 5 },
  { field: 'body_fat_percentage', metric: 'body_fat_percentage', scan_type: 'body', interpretationHint: 'lower_is_better', significantDelta: 2 },
  { field: 'hydration_level', metric: 'hydration_level', scan_type: 'health', interpretationHint: 'higher_is_better', significantDelta: 8 },
  { field: 'fatigue_level', metric: 'fatigue_level', scan_type: 'health', interpretationHint: 'lower_is_better', significantDelta: 8 },
  { field: 'muscle_definition_score', metric: 'muscle_definition_score', scan_type: 'body', interpretationHint: 'higher_is_better', significantDelta: 5 },
];

function classifyMetricTrajectory(
  delta: number | null,
  hint: CoachMetricInterpretationHint,
  significantDelta: number,
): CoachTrajectoryDirection {
  if (delta === null || !Number.isFinite(delta)) return 'unknown';
  const tolerance = significantDelta / 2;
  if (Math.abs(delta) < tolerance) return 'stable';

  if (hint === 'higher_is_better') {
    return delta >= significantDelta ? 'improving' : 'declining';
  }
  if (hint === 'lower_is_better') {
    return delta <= -significantDelta ? 'improving' : 'declining';
  }
  return 'stable';
}

function buildTrajectoryEntry(
  scans: CoachSourceScan[],
  def: typeof TRAJECTORY_METRIC_DEFS[number],
): CoachTrajectoryEntry {
  const typeScans = scans.filter((s) => s.scan_type === def.scan_type);
  const sortedAsc = [...typeScans].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  const values: number[] = [];
  for (const scan of sortedAsc) {
    const v = readNumericMetricValue(scan.key_metrics, def.metric);
    if (v !== null) values.push(v);
  }
  if (values.length < 3) {
    return {
      metric: def.metric,
      scan_type: def.scan_type,
      direction: 'unknown',
      delta: null,
      sample_count: values.length,
    };
  }
  const delta = roundMetricNumber(values[values.length - 1] - values[0]);
  return {
    metric: def.metric,
    scan_type: def.scan_type,
    direction: classifyMetricTrajectory(delta, def.interpretationHint, def.significantDelta),
    delta,
    sample_count: values.length,
  };
}

function buildTrajectoryMap(scans: CoachSourceScan[]): CoachTrajectoryMap {
  const result = {} as Record<keyof CoachTrajectoryMap, CoachTrajectoryEntry>;
  for (const def of TRAJECTORY_METRIC_DEFS) {
    result[def.field] = buildTrajectoryEntry(scans, def);
  }
  return result as CoachTrajectoryMap;
}

// ────────────────────────────────────────────────────────────────────────────
//   Risk signals — cardiovascular / metabolic / inflammation.
// ────────────────────────────────────────────────────────────────────────────

function levelFromDriverCount(count: number, hasData: boolean): CoachRiskLevel {
  if (!hasData) return 'unknown';
  if (count === 0) return 'low';
  if (count <= 2) return 'moderate';
  return 'elevated';
}

function recurringMetricBreach(
  scans: CoachSourceScan[],
  scanType: ScanType,
  metric: string,
  threshold: number,
  comparator: 'gt' | 'lt',
  minOccurrences = 2,
  minRatio = 0.4,
): boolean {
  const typeScans = scans.filter((s) => s.scan_type === scanType);
  if (typeScans.length === 0) return false;
  let breaches = 0;
  let observed = 0;
  for (const scan of typeScans) {
    const v = readNumericMetricValue(scan.key_metrics, metric);
    if (v === null) continue;
    observed += 1;
    if (comparator === 'gt' ? v > threshold : v < threshold) breaches += 1;
  }
  if (observed === 0) return false;
  return breaches >= minOccurrences && breaches / observed >= minRatio;
}

function buildRiskSignals(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
): CoachRiskSignals {
  const hasNutrition = scans.some((s) => s.scan_type === 'nutrition');
  const hasBody = scans.some((s) => s.scan_type === 'body');
  const hasFace = scans.some((s) => s.scan_type === 'health');

  const cardiovascular: string[] = [];
  if (recurringMetricBreach(scans, 'nutrition', 'sugar_grams_estimate', 35, 'gt'))
    cardiovascular.push('recurring_high_sugar');
  if (recurringMetricBreach(scans, 'nutrition', 'processing_level_score', 65, 'gt'))
    cardiovascular.push('recurring_high_processing');
  if (recurringMetricBreach(scans, 'nutrition', 'sodium_level_score', 7, 'gt'))
    cardiovascular.push('recurring_high_sodium');
  const fitnessSedentary = scans.some((s) => {
    const lvl = readPersonaKeyMetric(s.key_metrics, 'perceived_fitness_level_key');
    return lvl === 'sedentary';
  });
  if (fitnessSedentary) cardiovascular.push('sedentary_inference');

  const metabolic: string[] = [];
  if (trajectories.body_fat_percentage.direction === 'declining')
    metabolic.push('high_body_fat_trajectory');
  if (recurringMetricBreach(scans, 'nutrition', 'protein_grams', 20, 'lt'))
    metabolic.push('low_protein_pattern');
  if (recurringMetricBreach(scans, 'nutrition', 'fiber_grams_estimate', 8, 'lt'))
    metabolic.push('low_fiber_pattern');

  const inflammation: string[] = [];
  if (recurringMetricBreach(scans, 'nutrition', 'inflammation_index_score', 60, 'gt'))
    inflammation.push('recurring_high_inflammation_index');
  if (recurringMetricBreach(scans, 'health', 'complexion_redness_score', 60, 'gt'))
    inflammation.push('recurring_high_complexion_redness');

  return {
    cardiovascular_risk_level_key: levelFromDriverCount(cardiovascular.length, hasNutrition || hasBody),
    cardiovascular_risk_drivers: cardiovascular,
    metabolic_risk_level_key: levelFromDriverCount(metabolic.length, hasBody || hasNutrition),
    metabolic_risk_drivers: metabolic,
    inflammation_risk_level_key: levelFromDriverCount(inflammation.length, hasNutrition || hasFace),
    inflammation_risk_drivers: inflammation,
  };
}

// ────────────────────────────────────────────────────────────────────────────
//   Anomalies — outlier tags.
// ────────────────────────────────────────────────────────────────────────────

function detectAnomalies(scans: CoachSourceScan[]): string[] {
  const anomalies: string[] = [];

  const faceScans = scans
    .filter((s) => s.scan_type === 'health')
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
  if (faceScans.length >= 3) {
    const latestFatigue = readNumericMetricValue(faceScans[0].key_metrics, 'fatigue_level');
    const prevFatigueValues: number[] = [];
    for (const scan of faceScans.slice(1)) {
      const v = readNumericMetricValue(scan.key_metrics, 'fatigue_level');
      if (v !== null) prevFatigueValues.push(v);
    }
    if (
      latestFatigue !== null &&
      latestFatigue > 80 &&
      prevFatigueValues.length >= 2 &&
      prevFatigueValues.reduce((a, b) => a + b, 0) / prevFatigueValues.length < 50
    ) {
      anomalies.push('severe_fatigue_spike_recent');
    }
  }

  for (const scan of scans) {
    if (scan.scan_type !== 'health') continue;
    const stress = readNumericMetricValue(scan.key_metrics, 'perceived_stress_level');
    if (stress !== null && stress > 80) {
      anomalies.push('extreme_stress_observation');
      break;
    }
  }

  const nutritionScans = scans
    .filter((s) => s.scan_type === 'nutrition')
    .sort((a, b) => Date.parse(b.captured_at) - Date.parse(a.captured_at));
  if (nutritionScans.length >= 4) {
    const latestCal = readNumericMetricValue(nutritionScans[0].key_metrics, 'calories_estimate');
    const prevCal: number[] = [];
    for (const scan of nutritionScans.slice(1)) {
      const v = readNumericMetricValue(scan.key_metrics, 'calories_estimate');
      if (v !== null) prevCal.push(v);
    }
    if (latestCal !== null && prevCal.length >= 3) {
      const avg = prevCal.reduce((a, b) => a + b, 0) / prevCal.length;
      if (avg > 0 && latestCal < avg * 0.6) anomalies.push('sudden_calorie_drop');
    }
  }

  const weightBands = new Set(
    scans
      .filter((s) => s.scan_type === 'body')
      .map((s) => readPersonaKeyMetric(s.key_metrics, 'estimated_weight_range_key'))
      .filter((v): v is string => !!v),
  );
  if (weightBands.size >= 2) anomalies.push('weight_band_shift_detected');

  if (nutritionScans.length >= 3) {
    const allergenCounts = new Map<string, number>();
    for (const scan of nutritionScans) {
      const allergens = readPersonaArrayMetric(scan.key_metrics, 'allergen_visibility_keys');
      for (const a of allergens) {
        allergenCounts.set(a, (allergenCounts.get(a) ?? 0) + 1);
      }
    }
    for (const [, count] of allergenCounts) {
      if (count / nutritionScans.length > 0.7) {
        anomalies.push('allergen_concentration_unusual');
        break;
      }
    }
  }

  const sexValues = new Set(
    scans
      .map((s) => readPersonaKeyMetric(s.key_metrics, 'perceived_sex_key'))
      .filter((v): v is string => !!v),
  );
  if (sexValues.size >= 2) anomalies.push('inconsistent_sex_inference');

  const sortedByTime = [...scans].sort(
    (a, b) => Date.parse(a.captured_at) - Date.parse(b.captured_at),
  );
  for (let i = 1; i < sortedByTime.length; i += 1) {
    const prev = Date.parse(sortedByTime[i - 1].captured_at);
    const cur = Date.parse(sortedByTime[i].captured_at);
    if (!Number.isFinite(prev) || !Number.isFinite(cur)) continue;
    if ((cur - prev) / 86400000 > 21) {
      anomalies.push('dormancy_period_detected');
      break;
    }
  }

  return anomalies.slice(0, 8);
}

// ────────────────────────────────────────────────────────────────────────────
//   Coach recommendations — emphasis / avoid / tone / next scan focus.
// ────────────────────────────────────────────────────────────────────────────

function pickRecommendedEmphasis(
  trajectories: CoachTrajectoryMap,
  riskSignals: CoachRiskSignals,
  lifestyle: CoachLifestyleSignature,
): string[] {
  const emphasis: string[] = [];

  if (lifestyle.hydration_indicator_aggregate !== null && lifestyle.hydration_indicator_aggregate < 50) {
    emphasis.push('hydration');
  }
  if (lifestyle.sleep_indicator_aggregate !== null && lifestyle.sleep_indicator_aggregate < 50) {
    emphasis.push('sleep');
  }
  if (riskSignals.metabolic_risk_drivers.includes('low_fiber_pattern')) {
    emphasis.push('nutrition_variety');
  }
  if (lifestyle.stress_indicator_aggregate !== null && lifestyle.stress_indicator_aggregate > 60) {
    emphasis.push('stress_recovery');
  }
  if (trajectories.body_score.direction === 'declining' && !emphasis.includes('nutrition_variety')) {
    emphasis.push('body_composition_focus');
  }
  if (trajectories.face_score.direction === 'declining' && !emphasis.includes('sleep')) {
    emphasis.push('skin_recovery');
  }

  return Array.from(new Set(emphasis)).slice(0, 3);
}

function pickTopicsToAvoid(
  engagement: CoachEngagementLevel,
  dietarySignals: string[],
  anomalies: string[],
): string[] {
  const topics: string[] = [];
  const restrictiveDiet = dietarySignals.some((s) =>
    ['vegan_compatible', 'keto_compatible'].includes(s),
  );
  if (engagement === 'low' && restrictiveDiet) topics.push('weight_loss_pressure');
  if (anomalies.includes('weight_band_shift_detected')) {
    if (!topics.includes('weight_loss_pressure')) topics.push('weight_loss_pressure');
  }
  if (anomalies.includes('severe_fatigue_spike_recent') && !topics.includes('intensity_increase')) {
    topics.push('intensity_increase');
  }
  return topics.slice(0, 2);
}

function pickRecommendedTone(
  trajectories: CoachTrajectoryMap,
  riskSignals: CoachRiskSignals,
  lifestyle: CoachLifestyleSignature,
  engagement: CoachEngagementLevel,
): CoachRecommendationTone {
  const trajectoryEntries = Object.values(trajectories);
  const improving = trajectoryEntries.filter((t) => t.direction === 'improving').length;
  const declining = trajectoryEntries.filter((t) => t.direction === 'declining').length;

  if (
    riskSignals.cardiovascular_risk_level_key === 'elevated' ||
    riskSignals.metabolic_risk_level_key === 'elevated'
  ) {
    return 'cautious';
  }

  if (improving >= 2 && declining === 0) return 'celebratory';

  if (
    declining >= 2 ||
    (lifestyle.stress_indicator_aggregate !== null && lifestyle.stress_indicator_aggregate > 60)
  ) {
    return 'supportive_gentle';
  }

  if (engagement === 'high' && declining === 0) return 'direct_motivating';

  return 'neutral_informative';
}

function pickNextScanFocus(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
): ScanType | null {
  if (scans.length === 0) return null;
  const recent = getScansWithinLastDays(scans, 7);
  const recentTypes = new Set(recent.map((s) => s.scan_type));
  const allTypes: ScanType[] = ['health', 'body', 'nutrition'];
  const missing = allTypes.filter((t) => !recentTypes.has(t));
  if (missing.length > 0) return missing[0];
  for (const t of allTypes) {
    const entry = (Object.values(trajectories) as CoachTrajectoryEntry[]).find(
      (e) => e.scan_type === t && e.direction === 'unknown',
    );
    if (entry) return t;
  }
  return null;
}

function buildCoachRecommendations(
  scans: CoachSourceScan[],
  trajectories: CoachTrajectoryMap,
  riskSignals: CoachRiskSignals,
  lifestyle: CoachLifestyleSignature,
  engagement: CoachEngagementLevel,
  dietarySignals: string[],
  anomalies: string[],
): CoachRecommendations {
  return {
    recommended_emphasis: pickRecommendedEmphasis(trajectories, riskSignals, lifestyle),
    topics_to_avoid: pickTopicsToAvoid(engagement, dietarySignals, anomalies),
    suggested_tone_key: pickRecommendedTone(trajectories, riskSignals, lifestyle, engagement),
    next_scan_focus_suggestion_key: pickNextScanFocus(scans, trajectories),
  };
}

// Hard cutoff: scans older than this many days are excluded from persona
// aggregations. They still contribute to temporal_patterns (streaks,
// dormancy detection) and scan_count_total, but not to apparent attributes,
// trajectories, risk signals, anomalies, or coach recommendations. Avoids
// letting a 4-month-old scan distort current persona inference.
const RECENT_SCANS_CUTOFF_DAYS = 90;

function filterScansWithinCutoff(
  scans: CoachSourceScan[],
  cutoffDays: number,
): CoachSourceScan[] {
  const cutoffMs = Date.now() - cutoffDays * 86400000;
  return scans.filter((scan) => {
    const ts = Date.parse(scan.captured_at);
    // Keep scans with invalid timestamps so they aren't silently dropped.
    return !Number.isFinite(ts) || ts >= cutoffMs;
  });
}

export function inferProfileFromScans(
  allScans: CoachSourceScan[],
  scanCount7d: number,
): CoachInferredPersona | null {
  if (allScans.length === 0) return null;

  const scans = filterScansWithinCutoff(allScans, RECENT_SCANS_CUTOFF_DAYS);
  const droppedAgedCount = allScans.length - scans.length;
  if (scans.length === 0) return null;

  const faceSexValues = scans
    .filter((scan) => scan.scan_type === 'health')
    .map((scan) => readPersonaKeyMetric(scan.key_metrics, 'perceived_sex_key'));
  const bodySexValues = scans
    .filter((scan) => scan.scan_type === 'body')
    .map((scan) => readPersonaKeyMetric(scan.key_metrics, 'perceived_sex_key'));
  const allSexValues = [...faceSexValues, ...bodySexValues];

  const faceAgeValues = scans
    .filter((scan) => scan.scan_type === 'health')
    .map(pickFaceAgeRangeKey);
  const bodyAgeValues = scans.map(pickBodyAgeRangeKey);
  const allAgeValues = [...faceAgeValues, ...bodyAgeValues];

  const bodyScans = scans.filter((scan) => scan.scan_type === 'body');
  const heightValues = bodyScans.map((scan) =>
    readPersonaKeyMetric(scan.key_metrics, 'estimated_height_range_key'),
  );
  const weightValues = bodyScans.map((scan) =>
    readPersonaKeyMetric(scan.key_metrics, 'estimated_weight_range_key'),
  );
  const frameValues = bodyScans.map((scan) =>
    readPersonaKeyMetric(scan.key_metrics, 'body_frame_key'),
  );
  const fitnessValues = bodyScans.map((scan) =>
    readPersonaKeyMetric(scan.key_metrics, 'perceived_fitness_level_key'),
  );

  const { weak_metrics, strong_metrics } = computeMetricSignals(scans);

  const apparentSex = buildPersonaField(allSexValues);
  const apparentAgeRange = buildPersonaField(allAgeValues);
  const apparentHeightRange = buildPersonaField(heightValues);
  const apparentWeightRange = buildPersonaField(weightValues);
  const apparentBodyFrame = buildPersonaField(frameValues);
  const apparentFitnessLevel = buildPersonaField(fitnessValues);

  const dietarySignals = aggregateDietarySignals(scans);
  const engagement = deriveEngagementLevel(scanCount7d);
  const lastScanDaysAgo = computeLastScanDaysAgo(allScans);

  const trajectories = buildTrajectoryMap(scans);
  const riskSignals = buildRiskSignals(scans, trajectories);
  const lifestyleSignature = buildLifestyleSignature(
    scans,
    trajectories,
    riskSignals,
    engagement,
  );
  const anomalies = detectAnomalies(scans);

  const apparentFields = [
    apparentSex,
    apparentAgeRange,
    apparentHeightRange,
    apparentWeightRange,
    apparentBodyFrame,
    apparentFitnessLevel,
  ];

  const dataReliability = buildDataReliability(
    scans,
    apparentFields,
    lastScanDaysAgo,
  );
  if (droppedAgedCount > 0) {
    dataReliability.caveats = Array.from(
      new Set([...dataReliability.caveats, 'aged_scans_excluded']),
    );
  }

  return {
    apparent_sex: apparentSex,
    apparent_age_range: apparentAgeRange,
    apparent_height_range: apparentHeightRange,
    apparent_weight_range: apparentWeightRange,
    apparent_body_frame: apparentBodyFrame,
    apparent_fitness_level: apparentFitnessLevel,
    dominant_scan_focus: deriveDominantScanFocus(scans),
    dietary_signals: dietarySignals,
    recurring_allergen_signals: aggregateRecurringAllergenSignals(scans),
    engagement_level: engagement,
    weak_metrics,
    strong_metrics,
    scan_count_total: allScans.length,
    inferred_confidence: deriveOverallConfidence(scans.length),
    data_reliability: dataReliability,
    temporal_patterns: buildTemporalPatterns(allScans, scanCount7d, lastScanDaysAgo),
    goal_inference: inferPrimaryGoal(scans, trajectories, engagement),
    lifestyle_signature: lifestyleSignature,
    nutrition_profile: buildNutritionProfile(scans),
    trajectories,
    risk_signals: riskSignals,
    anomalies,
    coach_recommendations: buildCoachRecommendations(
      scans,
      trajectories,
      riskSignals,
      lifestyleSignature,
      engagement,
      dietarySignals,
      anomalies,
    ),
  };
}

export function buildCoachPayload(
  promptType: CoachGenerationPromptType,
  scans: CoachSourceScan[],
  options: {
    coachProfileMemory?: PersistedInferredPersona | null;
    locale?: string | null;
    questionKey?: CoachQuestionKey | null;
    questionText?: string | null;
    selectedScanId?: string | null;
    scanIntent?: ScanCoachIntent | CoachScanIntentPayload | null;
  } = {},
): CoachGuidancePayload {
  const quota = getCoachPromptScanQuota(promptType);
  const visiblePromptType = resolveVisibleCoachPromptType(promptType);
  const requestedSelectedScanId =
    normalizeSelectedCoachScanId(options.selectedScanId);
  const scanIntentPayload =
    promptType === FREE_QUESTION_PROMPT_TYPE
      ? null
      : normalizeCoachScanIntentPayload(options.scanIntent);
  const selectedScan = resolveSelectedScanForPrompt(
    promptType,
    scans,
    requestedSelectedScanId,
  );
  const selectedScanPrevious = selectedScan
    ? findPreviousScanByType(scans, selectedScan)
    : null;
  const scansWithinWeek = getScansWithinLastDays(scans, 7);
  const recentScans = selectRecentScansForPrompt(
    promptType,
    scans,
    selectedScan,
  );
  const richContextByScanId = buildRichContextByScanId(scans);
  const latestByType = buildLatestByTypeRichContexts(scans, richContextByScanId);
  const byType =
    visiblePromptType === 'weekly_plan' || visiblePromptType === 'trend_review'
      ? {
          health: findLatestScanByType(scans, 'health')?.digest ?? null,
          body: findLatestScanByType(scans, 'body')?.digest ?? null,
          nutrition: findLatestScanByType(scans, 'nutrition')?.digest ?? null,
          super: findLatestScanByType(scans, 'super')?.digest ?? null,
        }
      : undefined;
  const questionSelection = resolveCoachQuestionSelection({
    promptType,
    questionKey: options.questionKey,
    questionText: options.questionText,
    locale: options.locale,
  });
  const questionHints = resolveCoachQuestionHints({
    promptType,
    questionKey: questionSelection.questionKey,
    questionText: questionSelection.questionText,
    locale: options.locale,
  });
  return {
    payload_version: 2,
    prompt_type: promptType,
    question_key: questionSelection.questionKey ?? null,
    question_text: questionSelection.questionText,
    question_hints: questionHints,
    generated_at: new Date().toISOString(),
    scan_count_7d: scansWithinWeek.length,
    ...(requestedSelectedScanId
      ? { selected_scan_id: requestedSelectedScanId }
      : {}),
    ...(scanIntentPayload ? { scan_intent: scanIntentPayload } : {}),
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
    inferred_persona: inferProfileFromScans(scans, scansWithinWeek.length),
    coach_profile_memory: normalizePersistedInferredPersona(
      options.coachProfileMemory ?? null,
    ),
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
    question_key: entry.question_key ?? payload.question_key ?? null,
    question_text: entry.question_text ?? payload.question_text ?? null,
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

function buildCoachGenerateRequestPayload(options: {
  payload: CoachGuidancePayload;
  personaKey: CoachPersonaKey;
  locale?: string | null;
  forceRefresh?: boolean;
}) {
  return {
    payload: options.payload,
    persona_key: options.personaKey,
    ...(options.locale ? { locale: options.locale } : {}),
    ...(options.forceRefresh ? { force_refresh: true as const } : {}),
  };
}

function buildLegacyCoachGenerateRequestPayload(
  requestPayload: ReturnType<typeof buildCoachGenerateRequestPayload>,
) {
  const {
    question_key: _questionKey,
    question_text: _questionText,
    question_hints: _questionHints,
    selected_scan_id: _selectedScanId,
    scan_intent: _scanIntent,
    ...legacyPayload
  } = requestPayload.payload;

  return {
    ...requestPayload,
    payload: legacyPayload,
  };
}

function buildLatestScanCompatibleCoachGenerateRequestPayload(
  requestPayload: ReturnType<typeof buildCoachGenerateRequestPayload>,
) {
  const legacyRequestPayload = buildLegacyCoachGenerateRequestPayload(
    requestPayload,
  );

  return {
    ...legacyRequestPayload,
    payload: {
      ...legacyRequestPayload.payload,
      prompt_type: 'latest_scan' as const,
    },
  };
}

function shouldRetryCoachGenerationWithLegacyPayload(
  error: unknown,
  requestPayload: ReturnType<typeof buildCoachGenerateRequestPayload>,
) {
  if (requestPayload.payload.prompt_type === FREE_QUESTION_PROMPT_TYPE) {
    return false;
  }

  return (
    error instanceof CoachServiceError &&
    error.functionName === COACH_FUNCTION_NAME &&
    error.status === 400 &&
    error.code === 'invalid_coach_payload' &&
    error.message === 'payload contains unsupported fields'
  );
}

function shouldRetryLatestScanIssueResolutionAsLatestScan(
  error: unknown,
  requestPayload: ReturnType<typeof buildCoachGenerateRequestPayload>,
) {
  return (
    requestPayload.payload.prompt_type ===
      LATEST_SCAN_ISSUE_RESOLUTION_PROMPT_TYPE &&
    error instanceof CoachServiceError &&
    error.functionName === COACH_FUNCTION_NAME &&
    error.status === 400 &&
    error.code === 'invalid_coach_payload' &&
    error.message === 'payload.prompt_type is not supported'
  );
}

function buildCoachGuidanceResult(
  response: CoachGenerateResponse,
  payload: CoachGuidancePayload,
  responsePayload: unknown,
): CoachGuidanceResult {
  const rawResponsePayload = isRecord(responsePayload) ? responsePayload : null;
  const shouldBackfillQuestionKey =
    !rawResponsePayload ||
    !Object.prototype.hasOwnProperty.call(rawResponsePayload, 'question_key') ||
    rawResponsePayload.question_key === null ||
    rawResponsePayload.question_key === undefined;
  const shouldBackfillQuestionText =
    !rawResponsePayload ||
    !Object.prototype.hasOwnProperty.call(rawResponsePayload, 'question_text') ||
    rawResponsePayload.question_text === null ||
    rawResponsePayload.question_text === undefined;

  return {
    ...response,
    prompt_type: response.prompt_type ?? payload.prompt_type,
    question_key: shouldBackfillQuestionKey
      ? payload.question_key ?? response.question_key ?? null
      : response.question_key ?? null,
    question_text: shouldBackfillQuestionText
      ? payload.question_text ?? response.question_text ?? null
      : response.question_text ?? null,
    response_version: response.content ? 2 : (response.response_version ?? 1),
    fallback: false,
    payload,
  };
}

function shouldFallbackToCachedCoachEntry(
  error: unknown,
  promptType?: CoachGenerationPromptType | null,
) {
  if (promptType === FREE_QUESTION_PROMPT_TYPE) {
    return false;
  }

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
    // C-05: explicit column list — no select('*') so internal columns never
    // leak to the client over the wire (see COACH_ENTRY_PUBLIC_COLUMNS_SELECT
    // above for the rationale).
    let query = supabase
      .from('coach_entries')
      .select(COACH_ENTRY_PUBLIC_COLUMNS_SELECT)
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
    // C-05 of COACH_SECURITY_AUDIT_2026_05: use the v2 RPC that omits the
    // internal columns (request_payload_json, response_payload_json, cache_key,
    // input_hash, error_code). Legacy entries had their prompt_type /
    // question_key / question_text backfilled in 20260520180300 so v2 does not
    // need to fall back to request_payload_json anymore.
    const { data, error } = await supabase.rpc('get_coach_history_page_v2', {
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

function parseCoachScreenSnapshotResponse(
  payload: unknown,
): CoachScreenSnapshot {
  if (!isRecord(payload) || payload.success !== true) {
    throw createCoachServiceError('Coach snapshot returned an invalid payload.', {
      code: 'coach_snapshot_invalid_response',
      status: 502,
      details: payload,
      functionName: COACH_SCREEN_SNAPSHOT_FUNCTION_NAME,
    });
  }

  const quota = parseCoachQuotaStatus(payload.quota);
  if (!quota) {
    throw createCoachServiceError('Coach snapshot is missing quota status.', {
      code: 'coach_snapshot_invalid_quota',
      status: 502,
      details: payload,
      functionName: COACH_SCREEN_SNAPSHOT_FUNCTION_NAME,
    });
  }

  const entries = Array.isArray(payload.entries)
    ? payload.entries
        .map(parseCoachEntryRow)
        .filter((item): item is CoachEntry => item !== null)
    : [];
  const recentScans = Array.isArray(payload.recent_scans)
    ? payload.recent_scans
        .map(parseCoachSourceScan)
        .filter((item): item is CoachSourceScan => item !== null)
        .slice(0, RECENT_COACH_SCAN_LIMIT)
    : [];
  const latestReadyEntry = parseCoachEntryRow(payload.latest_ready_entry);

  return {
    entries,
    quota,
    recentScans,
    latestReadyEntry: isRenderableCoachEntry(latestReadyEntry)
      ? latestReadyEntry
      : null,
    historySummary: parseCoachHistorySummaryRow(payload.history_summary),
    requestId: readOptionalString(payload.request_id) ?? undefined,
  };
}

export async function fetchCoachScreenSnapshot(options: {
  personaKey?: CoachPersonaKey | null;
  locale?: string | null;
  excludeEntryId?: string | null;
  entriesLimit?: number;
} = {}): Promise<CoachScreenSnapshot> {
  const personaKey = options.personaKey
    ? readCoachPersonaKey(options.personaKey)
    : null;
  const normalizedLocale = normalizeCoachLocale(options.locale);

  const payload = await invokeAuthedCoachFunction<CoachScreenSnapshotResponse>(
    COACH_SCREEN_SNAPSHOT_FUNCTION_NAME,
    {
      ...(personaKey ? { persona_key: personaKey } : {}),
      ...(normalizedLocale ? { locale: normalizedLocale } : {}),
      ...(options.excludeEntryId ? { exclude_entry_id: options.excludeEntryId } : {}),
      ...(typeof options.entriesLimit === 'number'
        ? { entries_limit: options.entriesLimit }
        : {}),
    },
  );

  return parseCoachScreenSnapshotResponse(payload);
}

export async function fetchLatestReadyCoachEntry(options: {
  personaKey?: CoachPersonaKey | null;
  promptType?: CoachGenerationPromptType | null;
  locale?: string;
} = {}) {
  const personaKey = options.personaKey ?? null;
  const promptType = normalizeCoachGenerationPromptType(options.promptType);
  const normalizedLocale = normalizeCoachLocale(options.locale);

  try {
    // C-05: same explicit column list as fetchCoachEntries — keep the public
    // surface coherent so no consumer accidentally relies on an internal field.
    let baseQuery = supabase
      .from('coach_entries')
      .select(COACH_ENTRY_PUBLIC_COLUMNS_SELECT)
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

function sortCoachScansByCapturedAtDesc(scans: CoachSourceScan[]) {
  return scans
    .map((scan, index) => ({ scan, index }))
    .sort((left, right) => {
      const leftTime = Date.parse(left.scan.captured_at);
      const rightTime = Date.parse(right.scan.captured_at);
      const timeDelta =
        (Number.isFinite(rightTime) ? rightTime : 0) -
        (Number.isFinite(leftTime) ? leftTime : 0);

      return timeDelta !== 0 ? timeDelta : left.index - right.index;
    })
    .map((item) => item.scan);
}

function mergeSelectedCoachScan(
  scans: CoachSourceScan[],
  selectedScan: CoachSourceScan | null,
) {
  if (!selectedScan) {
    return scans;
  }

  return sortCoachScansByCapturedAtDesc([
    selectedScan,
    ...scans.filter((scan) => scan.id !== selectedScan.id),
  ]);
}

async function fetchCoachScanById(scanId: string) {
  const { data, error } = await supabase
    .from('scans')
    .select('id, scan_type, analysis_result, analyzed_at, created_at')
    .eq('id', scanId)
    .maybeSingle();

  if (error) {
    throw createCoachScansReadError(error);
  }

  return parseCoachSourceScan(data);
}

async function fetchCoachScansForGeneration(selectedScanId?: string | null) {
  const scans = await fetchRecentCoachScans();
  const normalizedSelectedScanId = normalizeSelectedCoachScanId(selectedScanId);
  if (
    !normalizedSelectedScanId ||
    scans.some((scan) => coachScanIdMatches(scan, normalizedSelectedScanId))
  ) {
    return scans;
  }

  try {
    const selectedScan = await fetchCoachScanById(normalizedSelectedScanId);
    return mergeSelectedCoachScan(scans, selectedScan);
  } catch (error) {
    logOperationalError('[Coach] Failed to fetch selected scan context', error, {
      scan_id: normalizedSelectedScanId,
    });
    return scans;
  }
}

export async function generateCoachGuidance(options: {
  promptType: CoachGenerationPromptType;
  personaKey: CoachPersonaKey;
  locale?: string;
  forceRefresh?: boolean;
  coachProfileMemory?: PersistedInferredPersona | null;
  questionKey?: CoachQuestionKey | null;
  questionText?: string | null;
  scanId?: string | null;
  selectedScanId?: string | null;
  scanIntent?: ScanCoachIntent | CoachScanIntentPayload | null;
}): Promise<CoachGuidanceResult> {
  const personaKey = readCoachPersonaKey(options.personaKey);
  const normalizedLocale = normalizeCoachLocale(options.locale);
  const requestedSelectedScanId =
    normalizeSelectedCoachScanId(options.selectedScanId ?? options.scanId);
  let payload: CoachGuidancePayload | null = null;
  let resolvedCoachProfileMemory = normalizePersistedInferredPersona(
    options.coachProfileMemory ?? null,
  );

  try {
    try {
      const syncedCoachProfileMemory = await syncCoachProfileMemory();
      resolvedCoachProfileMemory = syncedCoachProfileMemory;
    } catch (error) {
      const logFn = isCoachProfileSyncRateLimitError(error)
        ? logExpectedFailure
        : logOperationalError;
      logFn('[Coach] Failed to sync coach profile memory', error);
    }

    const scans = await fetchCoachScansForGeneration(requestedSelectedScanId);
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

    const nextPayload = buildCoachPayload(options.promptType, scans, {
      coachProfileMemory: resolvedCoachProfileMemory,
      locale: normalizedLocale,
      questionKey: options.questionKey,
      questionText: options.questionText,
      selectedScanId: requestedSelectedScanId,
      scanIntent: options.scanIntent,
    });
    payload = nextPayload;

    const requestPayload = buildCoachGenerateRequestPayload({
      payload: nextPayload,
      personaKey,
      locale: normalizedLocale,
      forceRefresh: options.forceRefresh,
    });
    let responsePayload: CoachGenerateResponse;

    try {
      responsePayload = await invokeAuthedCoachFunction<CoachGenerateResponse>(
        COACH_FUNCTION_NAME,
        requestPayload,
      );
    } catch (error) {
      if (shouldRetryLatestScanIssueResolutionAsLatestScan(error, requestPayload)) {
        if (shouldDebugCoachService()) {
          console.log(
            '[Coach] retrying generation with latest_scan prompt compatibility',
            {
              prompt_type: options.promptType,
              fallback_prompt_type: 'latest_scan',
              persona_key: personaKey,
              locale: normalizedLocale,
              ...sanitizeCoachServiceErrorDebugInfo(getCoachServiceErrorDebugInfo(error)),
            },
          );
        }

        responsePayload = await invokeAuthedCoachFunction<CoachGenerateResponse>(
          COACH_FUNCTION_NAME,
          buildLatestScanCompatibleCoachGenerateRequestPayload(requestPayload),
        );
      } else {
        if (!shouldRetryCoachGenerationWithLegacyPayload(error, requestPayload)) {
          throw error;
        }

        if (shouldDebugCoachService()) {
          console.log('[Coach] retrying generation with legacy payload compatibility', {
            prompt_type: options.promptType,
            persona_key: personaKey,
            locale: normalizedLocale,
            ...sanitizeCoachServiceErrorDebugInfo(getCoachServiceErrorDebugInfo(error)),
          });
        }

        const legacyRequestPayload = buildLegacyCoachGenerateRequestPayload(
          requestPayload,
        );

        try {
          responsePayload = await invokeAuthedCoachFunction<CoachGenerateResponse>(
            COACH_FUNCTION_NAME,
            legacyRequestPayload,
          );
        } catch (legacyError) {
          if (
            !shouldRetryLatestScanIssueResolutionAsLatestScan(
              legacyError,
              legacyRequestPayload,
            )
          ) {
            throw legacyError;
          }

          if (shouldDebugCoachService()) {
            console.log(
              '[Coach] retrying generation with latest_scan prompt compatibility',
              {
                prompt_type: options.promptType,
                fallback_prompt_type: 'latest_scan',
                persona_key: personaKey,
                locale: normalizedLocale,
                ...sanitizeCoachServiceErrorDebugInfo(
                  getCoachServiceErrorDebugInfo(legacyError),
                ),
              },
            );
          }

          responsePayload = await invokeAuthedCoachFunction<CoachGenerateResponse>(
            COACH_FUNCTION_NAME,
            buildLatestScanCompatibleCoachGenerateRequestPayload(requestPayload),
          );
        }
      }
    }

    const response = parseCoachGenerateResponse(responsePayload, normalizedLocale);

    return buildCoachGuidanceResult(response, nextPayload, responsePayload);
  } catch (error) {
    const resolvedPayload =
      payload ??
      buildCoachPayload(options.promptType, [], {
        coachProfileMemory: resolvedCoachProfileMemory,
        locale: normalizedLocale,
        questionKey: options.questionKey,
        questionText: options.questionText,
        selectedScanId: requestedSelectedScanId,
        scanIntent: options.scanIntent,
      });
    const shouldUseFallback = shouldFallbackToCachedCoachEntry(
      error,
      options.promptType,
    );
    if (shouldDebugCoachService()) {
      const errorDebugInfo = sanitizeCoachServiceErrorDebugInfo(
        getCoachServiceErrorDebugInfo(error),
      );

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
