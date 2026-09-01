import { supabase } from './supabase';
import * as ImageManipulator from 'expo-image-manipulator';
import { decode } from 'base64-arraybuffer';
import { Platform } from 'react-native';
import { DashboardData, AnalyticsData, AnalyticsPeriod, ScanType, ScanEligibilityResponse, AnalysisResult, ScanBodyResult, ScanFaceResult, ScanNutritionResult, SuperScanResult, BodyScoreHistoryItem, FaceScoreHistoryItem, NutritionHistoryItem, SuperScanHistoryItem, PremiumPotentialHistoryPoint, PremiumPotentialInputs, Scan, GamificationData, AccountTier } from '@/types';
import { hasPremiumAccess } from '@/utils/subscription';
import type { CoachPersonaKey } from '@/shared/coachPersonas';
import { resolveGamification } from '@/constants/gamification';
import { STORAGE_BUCKET_NAME } from '@/constants/scan';
import {
  PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS,
} from '@/constants/premiumFields';
import {
  buildAnalyzeScanRequest,
  buildCanonicalScanImagePath,
  buildCheckAndRecordScanRequest,
  SCAN_IMAGE_MAX_BYTES,
} from '@/shared/scanContract';
import {
  getAnalysisResultScanType,
} from '@/utils/analysisNormalization';
import { resolveFaceGlowScore } from '@/utils/faceGlow';
import { logOperationalError } from '@/utils/observability';
import {
  extractMissingColumnFromPgrstError,
  isPostgrestSchemaCacheMissError,
} from '@/utils/postgrestErrors';
import {
  AuthenticatedStorageSessionError,
  uploadAuthenticatedStorageObject,
} from '@/services/authenticatedStorage';
import { tryGetRuntimeConfig, getSupabaseFunctionUrl } from './runtimeConfig';

// Lecture NON-throwing au niveau module : si la config est indisponible on
// retombe sur '' (les flux qui construisent des URLs storage ne sont pas
// atteignables tant que `StartupConfigGate` bloque le démarrage). Évite un
// throw à l'import qui crasherait le lancement (cf. rejet App Store 1.0.0(6)).
const runtimeConfigResult = tryGetRuntimeConfig();
const SUPABASE_URL = runtimeConfigResult.ok
  ? runtimeConfigResult.config.supabaseUrl
  : '';
const GAMIFICATION_ASSET_BUCKET_NAME = 'gamification-assets';

// Types d'erreurs pour une meilleure gestion
export type ApiErrorType =
  | 'NETWORK'
  | 'TIMEOUT'
  | 'DATABASE'
  | 'VALIDATION'
  | 'AUTH'
  | 'ANALYSIS'
  | 'TYPE_MISMATCH'
  | 'UPLOAD'
  | 'EDGE_FUNCTION'
  | 'PROVIDER'
  | 'UNKNOWN';

export class ApiError extends Error {
  type: ApiErrorType;
  originalError?: unknown;
  context?: Record<string, unknown>;
  code?: string;
  status?: number;
  requestId?: string;

  constructor(
    message: string,
    type: ApiErrorType,
    originalError?: unknown,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'ApiError';
    this.type = type;
    this.originalError = originalError;
    this.context = context;
  }

  static isNetworkError(error: unknown): boolean {
    if (error instanceof Error) {
      return (
        error.message.includes('Network request failed') ||
        error.message.includes('fetch failed') ||
        error.message.includes('network request timed out') ||
        error.name === 'TypeError'
      );
    }
    return false;
  }

  static isTimeoutError(error: unknown): boolean {
    if (error instanceof ApiError) {
      return error.type === 'TIMEOUT';
    }

    if (error instanceof Error) {
      return (
        error.name === 'AbortError' ||
        error.message.toLowerCase().includes('timed out')
      );
    }

    return false;
  }

  static isDatabaseError(error: unknown): boolean {
    if (error && typeof error === 'object' && 'code' in error) {
      const code = (error as { code: string }).code;
      return code.startsWith('PGRST') || code.startsWith('42');
    }
    return false;
  }
}

// Type de retour pour createScanWithAnalysis
export interface ScanWithAnalysisResult {
  scan: any;
  analysisSucceeded: boolean;
  analysisError?: ApiError;
}

interface PremiumPotentialRpcRow {
  scan_type: ScanType;
  current_scan: Scan | null;
  historical_average_30d: number | string | null;
  scan_count_total: number | string;
  recent_score_history?: unknown;
}

interface GamificationRpcRow {
  scan_count?: number | string | null;
  mascot_stage?: number | string | null;
  mascot_filename?: string | null;
  mascot_image_url?: string | null;
}

interface SupabaseErrorLike {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

interface FunctionErrorPayload {
  success?: boolean;
  error?: string;
  code?: string;
  request_id?: string;
}

interface StorageUploadErrorLike {
  message?: string;
  error?: string;
  statusCode?: number;
  status?: number;
}

interface InvokeAuthedFunctionOptions {
  timeoutMs?: number;
  context?: Record<string, unknown>;
}

export type ScanEligibilityBatchData = Partial<
  Record<ScanType, ScanEligibilityResponse>
>;

export type ScanEligibilityBatchErrors = Partial<Record<ScanType, ApiError>>;

export interface ScanEligibilityBatchResult {
  data: ScanEligibilityBatchData;
  errors: ScanEligibilityBatchErrors;
  requestId?: string;
}

interface ScanEligibilityBatchFunctionResponse {
  success?: boolean;
  eligibility?: Record<string, ScanEligibilityResponse>;
  errors?: Record<string, unknown>;
  request_id?: string;
}

const missingGamificationRpcWarnings = new Set<string>();
const ANALYZE_SCAN_IMAGE_RETRY_DELAY_MS = 1_000;
const APP_SCAN_TYPES = new Set<ScanType>(['body', 'health', 'nutrition', 'super']);

function toSupabaseErrorLike(error: unknown): SupabaseErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as SupabaseErrorLike;
}

function isMissingGamificationStateRpcError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  if (supabaseError.code !== 'PGRST202') {
    return false;
  }

  const haystack = [
    supabaseError.message,
    supabaseError.details,
    supabaseError.hint,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

  return haystack.includes('get_user_gamification_state');
}

function warnMissingGamificationStateRpc(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const warningId = JSON.stringify({
    code: supabaseError.code ?? 'UNKNOWN',
    message: supabaseError.message ?? '',
    details: supabaseError.details ?? '',
  });

  if (missingGamificationRpcWarnings.has(warningId)) {
    return;
  }

  missingGamificationRpcWarnings.add(warningId);
  logOperationalError(
    '[API] Gamification RPC unavailable, falling back to default state',
    supabaseError,
    { code: supabaseError.code ?? 'UNKNOWN' },
  );
}

function parsePremiumPotentialHistory(
  payload: unknown,
): PremiumPotentialHistoryPoint[] {
  const rawPoints =
    typeof payload === 'string'
      ? (() => {
          try {
            return JSON.parse(payload);
          } catch {
            return [];
          }
        })()
      : payload;

  if (!Array.isArray(rawPoints)) {
    return [];
  }

  return rawPoints
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const date =
        typeof (item as { date?: unknown }).date === 'string'
          ? (item as { date: string }).date
          : null;
      const rawScore = (item as { score?: unknown }).score;
      const score =
        typeof rawScore === 'number'
          ? rawScore
          : typeof rawScore === 'string'
            ? Number(rawScore)
            : NaN;

      if (!date || Number.isNaN(score)) {
        return null;
      }

      return { date, score };
    })
    .filter((item): item is PremiumPotentialHistoryPoint => item !== null);
}

function getGamificationAssetUrl(filename: string) {
  return `${SUPABASE_URL}/storage/v1/object/public/${GAMIFICATION_ASSET_BUCKET_NAME}/${filename}`;
}

function resolveGamificationData(
  payload: GamificationRpcRow | null | undefined,
): GamificationData {
  const gamification = resolveGamification(payload?.scan_count, {
    mascotStage: payload?.mascot_stage,
    mascotFilename: payload?.mascot_filename,
    mascotImageUrl: payload?.mascot_image_url,
  });

  return {
    ...gamification,
    mascotImageUrl:
      gamification.mascotImageUrl ||
      getGamificationAssetUrl(gamification.mascotFilename),
  };
}

function describeScanMetricsWriteError(error: unknown) {
  const supabaseError = toSupabaseErrorLike(error);
  const code = supabaseError.code ?? 'UNKNOWN';
  const message = supabaseError.message ?? 'Unknown scan_metrics write error';

  if (code === 'PGRST204') {
    return {
      category: 'schema_mismatch',
      code,
      message,
      likelyCause:
        'scan_metrics schema cache is missing the new Premium Potential columns on the active Supabase project.',
      action:
        'Apply the premium potential migration on the linked Supabase project and reload the PostgREST schema cache before retrying.',
    };
  }

  if (code === '42P10') {
    return {
      category: 'missing_unique_constraint',
      code,
      message,
      likelyCause:
        'scan_metrics(scan_id) is not backed by a unique or exclusion constraint on the active Supabase project.',
      action:
        'Create the unique index or constraint on scan_metrics(scan_id) from the premium potential migration, then retry the upsert.',
    };
  }

  if (
    code === '42501' ||
    message.toLowerCase().includes('row-level security') ||
    message.toLowerCase().includes('permission denied')
  ) {
    return {
      category: 'rls_or_permissions',
      code,
      message,
      likelyCause:
        'The authenticated client is missing UPDATE permission on scan_metrics or an RLS policy blocks the upsert.',
      action:
        'Verify the scan_metrics UPDATE policy introduced by the premium potential migration and confirm the client writes as the owning user.',
    };
  }

  return {
    category: 'unknown_database_error',
    code,
    message,
    likelyCause: 'Unexpected database error while upserting scan_metrics.',
    action: 'Inspect the PostgREST error details and the active database schema before retrying.',
  };
}

async function getAuthenticatedSessionOrThrow() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new ApiError('api_errors.unauthorized', 'AUTH');
  }

  return session;
}

function readFunctionErrorPayload(value: unknown): FunctionErrorPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  return {
    success:
      typeof payload.success === 'boolean' ? payload.success : undefined,
    error: typeof payload.error === 'string' ? payload.error : undefined,
    code: typeof payload.code === 'string' ? payload.code : undefined,
    request_id:
      typeof payload.request_id === 'string' ? payload.request_id : undefined,
  };
}

function isValidationErrorCode(code?: string) {
  return Boolean(
    code &&
      (code.startsWith('invalid_') ||
        code === 'payload_too_large' ||
        code === 'text_too_long')
  );
}

const ANALYZE_SCAN_PROVIDER_ERROR_CODES = new Set([
  'scan_webhook_not_configured',
  'analysis_provider_failed',
  'analysis_failed',
  'invalid_analysis_response',
]);

const ANALYZE_SCAN_UPLOAD_ERROR_CODES = new Set([
  'scan_image_not_found',
  'invalid_scan_image_type',
]);

const ANALYZE_SCAN_EDGE_FUNCTION_ERROR_CODES = new Set([
  'scan_not_found',
  'scan_persistence_failed',
  'scan_refund_failed',
]);

export function isConnectivityApiError(error: unknown): error is ApiError {
  if (error instanceof ApiError) {
    return error.type === 'NETWORK' || error.type === 'TIMEOUT';
  }

  return ApiError.isNetworkError(error) || ApiError.isTimeoutError(error);
}

function resolveAnalyzeScanApiErrorType(
  status: number,
  code?: string,
): ApiErrorType {
  if (code && ANALYZE_SCAN_PROVIDER_ERROR_CODES.has(code)) {
    return 'PROVIDER';
  }

  if (code && ANALYZE_SCAN_UPLOAD_ERROR_CODES.has(code)) {
    return 'UPLOAD';
  }

  if (code && ANALYZE_SCAN_EDGE_FUNCTION_ERROR_CODES.has(code)) {
    return 'EDGE_FUNCTION';
  }

  if (status === 502 || status === 503) {
    return 'PROVIDER';
  }

  if (status >= 500) {
    return 'EDGE_FUNCTION';
  }

  return 'UNKNOWN';
}

function resolveFunctionApiErrorType(
  functionName: string,
  status: number,
  code?: string,
): ApiErrorType {
  if (code === 'analysis_type_mismatch' || code === 'scan_type_mismatch') {
    return 'TYPE_MISMATCH';
  }

  if (
    status === 401 ||
    code === 'missing_authorization' ||
    code === 'invalid_authorization' ||
    code === 'invalid_authentication'
  ) {
    return 'AUTH';
  }

  if (status === 400 || status === 422 || isValidationErrorCode(code)) {
    return 'VALIDATION';
  }

  if (functionName === 'check-and-record-scan' && status >= 500) {
    return 'DATABASE';
  }

  if (functionName === 'analyze-scan') {
    return resolveAnalyzeScanApiErrorType(status, code);
  }

  return 'UNKNOWN';
}

function createFunctionApiError(
  functionName: string,
  status: number,
  payload: FunctionErrorPayload,
) {
  const apiError = new ApiError(
    payload.error || `${functionName} failed (${status})`,
    resolveFunctionApiErrorType(functionName, status, payload.code),
    undefined,
    {
      functionName,
      status,
      code: payload.code,
      stage:
        functionName === 'check-and-record-scan'
          ? 'eligibility'
          : functionName === 'analyze-scan'
            ? 'analysis'
            : 'function',
    },
  );
  apiError.code = payload.code;
  apiError.status = status;
  apiError.requestId = payload.request_id;
  return apiError;
}

function normalizeOptionalCount(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, value)
    : undefined;
}

function normalizeOptionalTimestampMs(value: number | string | undefined) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeScanEligibilityResponse(data: ScanEligibilityResponse) {
  if (typeof data.server_now_ms === 'number' && Number.isFinite(data.server_now_ms)) {
    data.server_clock_offset_ms = data.server_now_ms - Date.now();
  }

  const normalizedUsed = normalizeOptionalCount(data.used);
  if (data.current_count === undefined && normalizedUsed !== undefined) {
    data.current_count = normalizedUsed;
  }

  const normalizedAvailable = normalizeOptionalCount(data.available);
  if (data.remaining === undefined && normalizedAvailable !== undefined) {
    data.remaining = normalizedAvailable;
  }

  if (
    data.remaining === undefined &&
    typeof data.limit === 'number' &&
    typeof data.current_count === 'number'
  ) {
    data.remaining = Math.max(0, data.limit - data.current_count);
  }

  if (
    data.current_count === undefined &&
    typeof data.limit === 'number' &&
    typeof data.remaining === 'number'
  ) {
    data.current_count = Math.max(0, data.limit - data.remaining);
  }

  if (data.used === undefined && typeof data.current_count === 'number') {
    data.used = Math.max(0, data.current_count);
  }

  if (data.available === undefined && typeof data.remaining === 'number') {
    data.available = Math.max(0, data.remaining);
  }

  const normalizedNextRechargeAt = normalizeOptionalTimestampMs(data.nextRechargeAt);
  if (data.next_recharge_at === undefined && normalizedNextRechargeAt !== undefined) {
    data.next_recharge_at = normalizedNextRechargeAt;
  }

  if (data.next_recharge_at === undefined) {
    const normalizedNextAvailableDate = normalizeOptionalTimestampMs(
      data.next_available_date,
    );
    if (normalizedNextAvailableDate !== undefined) {
      data.next_recharge_at = normalizedNextAvailableDate;
    }
  }

  if (
    data.next_available_date === undefined &&
    !data.allowed &&
    typeof data.next_recharge_at === 'number'
  ) {
    data.next_available_date = data.next_recharge_at;
  }

  if (
    data.welcome_credits === undefined &&
    typeof data.remaining_welcome_credits === 'number'
  ) {
    data.welcome_credits = Math.max(0, data.remaining_welcome_credits);
  }

  return data;
}

function isScanTypeKey(value: string): value is ScanType {
  return APP_SCAN_TYPES.has(value as ScanType);
}

function buildBatchEligibilityError(scanType: ScanType, payload: unknown) {
  const errorPayload =
    payload && typeof payload === 'object' && !Array.isArray(payload)
      ? (payload as {
          error?: unknown;
          message?: unknown;
          code?: unknown;
          status?: unknown;
          request_id?: unknown;
        })
      : {};
  const apiError = new ApiError(
    typeof errorPayload.error === 'string'
      ? errorPayload.error
      : typeof errorPayload.message === 'string'
        ? errorPayload.message
        : 'Scan eligibility unavailable',
    'EDGE_FUNCTION',
    payload,
    {
      scanType,
      stage: 'eligibility',
    },
  );

  apiError.code =
    typeof errorPayload.code === 'string'
      ? errorPayload.code
      : 'scan_eligibility_failed';
  apiError.status =
    typeof errorPayload.status === 'number' ? errorPayload.status : 500;
  apiError.requestId =
    typeof errorPayload.request_id === 'string'
      ? errorPayload.request_id
      : undefined;

  return apiError;
}

async function invokeAuthedFunction<TResponse>(
  functionName: string,
  payload: Record<string, unknown>,
  options: InvokeAuthedFunctionOptions = {},
) {
  const session = await getAuthenticatedSessionOrThrow();
  let response: Response;
  const controller =
    typeof options.timeoutMs === 'number' ? new AbortController() : null;
  const timeoutId =
    controller && typeof options.timeoutMs === 'number'
      ? setTimeout(() => controller.abort(), options.timeoutMs)
      : null;

  try {
    response = await fetch(getSupabaseFunctionUrl(functionName), {
      method: 'POST',
      headers: {
        Accept: 'application/json; charset=utf-8',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(payload),
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }

    const timedOut =
      ApiError.isTimeoutError(error) || controller?.signal.aborted === true;
    const apiError = new ApiError(
      timedOut
        ? `${functionName} timed out after ${options.timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : 'Network request failed',
      timedOut
        ? 'TIMEOUT'
        : ApiError.isNetworkError(error)
          ? 'NETWORK'
          : 'UNKNOWN',
      error,
      {
        functionName,
        timeout_ms: options.timeoutMs,
        ...options.context,
      },
    );
    if (timedOut) {
      apiError.code = 'request_timeout';
    }
    throw apiError;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  const rawResponseBody = await response.json().catch(() => ({}));
  const responseBody = readFunctionErrorPayload(rawResponseBody);
  if (!response.ok) {
    throw createFunctionApiError(functionName, response.status, responseBody);
  }

  return rawResponseBody as TResponse;
}

function toStorageUploadErrorLike(error: unknown): StorageUploadErrorLike {
  if (!error || typeof error !== 'object') {
    return {};
  }

  return error as StorageUploadErrorLike;
}

function createUploadApiError(
  error: unknown,
  context: Record<string, unknown>,
) {
  const uploadError = toStorageUploadErrorLike(error);
  const apiError = new ApiError(
    uploadError.message || 'Scan image upload failed',
    'UPLOAD',
    error,
    context,
  );
  if (typeof uploadError.error === 'string' && uploadError.error.length > 0) {
    apiError.code = uploadError.error;
  }
  if (typeof uploadError.statusCode === 'number') {
    apiError.status = uploadError.statusCode;
  } else if (typeof uploadError.status === 'number') {
    apiError.status = uploadError.status;
  }
  return apiError;
}

function shouldRetryAnalyzeScanAfterUploadError(error: unknown) {
  return (
    error instanceof ApiError &&
    error.type === 'UPLOAD' &&
    error.code === 'scan_image_not_found'
  );
}

// S-06 — `analyze-scan` peut retourner 409 scan_analysis_in_progress quand
// une autre invocation (retry concurrent ou client précédent qui a timeout)
// est déjà en train d'analyser le même scan_id. Le client passe alors en
// mode polling jusqu'à la complétion (status='analyzed' renvoyé par le
// fallback idempotent) ou jusqu'à expiration de la fenêtre.
const ANALYZE_SCAN_IN_PROGRESS_POLL_DELAY_MS = 1_500;
const ANALYZE_SCAN_IN_PROGRESS_MAX_POLLS = 30; // 30 × 1.5 s = 45 s max

// Timeout client par scan_type. Doit rester > timeout Edge→n8n (100s côté
// supabase/functions/analyze-scan/index.ts) pour qu'un dépassement côté n8n
// produise une 502 propre plutôt qu'un AbortController opaque côté client.
export const ANALYZE_SCAN_TIMEOUT_MS_BY_SCAN_TYPE: Record<ScanType, number> = {
  body: 120_000,
  health: 120_000,
  nutrition: 120_000,
  super: 120_000,
};

function isAnalyzeScanInProgressError(error: unknown): error is ApiError {
  return (
    error instanceof ApiError &&
    error.code === 'scan_analysis_in_progress'
  );
}

async function waitForDelay(delayMs: number) {
  await new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function rollbackReservedScanAfterUploadFailure(scanId: string, scanType: ScanType) {
  try {
    await invokeAuthedFunction('cancel-scan-reservation', {
      scan_id: scanId,
      scan_type: scanType,
    });
  } catch (error) {
    logOperationalError('[API] Failed to rollback reserved scan after upload error', error, {
      scan_id: scanId,
      scan_type: scanType,
    });
  }
}

/**
 * Périodes Analytics réservées aux comptes Premium / Admin.
 * Aligné avec `PERIODS` dans `screens/AnalyticsScreen.tsx` (les options marquées
 * `premium: true`). Toute modification ici DOIT être synchronisée avec l'UI
 * pour ne pas casser l'expérience d'un compte premium légitime.
 */
const PREMIUM_ANALYTICS_PERIODS: ReadonlySet<AnalyticsPeriod> = new Set<AnalyticsPeriod>([
  '3months',
  '1year',
]);

/**
 * Listes des champs Analytics réservés aux comptes Premium — dérivées de la
 * source unique `PREMIUM_LOCKED_ANALYTICS_METRIC_MAP` dans
 * `constants/premiumFields.ts`. Cela garantit que la liste UI (onglets de
 * sélection dans `AnalyticsScreen`) et la sanitation backend ci-dessous restent
 * cohérentes sans dérive possible.
 *
 * Les noms sont en camelCase car ils correspondent au shape des items renvoyés
 * par `getAnalytics`, pas aux colonnes brutes de `scan_metrics`.
 */
const ANALYTICS_PREMIUM_BODY_FIELDS = PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.body;
const ANALYTICS_PREMIUM_FACE_FIELDS = PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.health;
const ANALYTICS_PREMIUM_NUTRITION_FIELDS = PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS.nutrition;

/**
 * Lit le tier du user pour décider de l'accès aux analytics premium.
 * Fail-closed : toute erreur de lecture dégrade vers 'free' (plus restrictif).
 * Exporté pour les tests uniquement.
 */
export async function loadAccountTierForAnalytics(userId: string): Promise<AccountTier> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('account_tier')
      .eq('id', userId)
      .maybeSingle();
    if (error || !data) {
      return 'free';
    }
    const tier = (data as { account_tier?: unknown }).account_tier;
    if (tier === 'premium' || tier === 'admin' || tier === 'free') {
      return tier;
    }
    return 'free';
  } catch {
    return 'free';
  }
}

/**
 * Strip / zero out des métriques premium dans la réponse Analytics pour
 * un compte non-premium. Garde les scores globaux (faceScore, bodyScore,
 * nutritionScore, caloriesEstimate) qui restent gratuits.
 *
 * La liste des champs à zéroïser provient de la source unique
 * `PREMIUM_LOCKED_ANALYTICS_HISTORY_FIELDS` pour garantir la cohérence avec
 * le gating UI dans `AnalyticsScreen`. Exporté pour les tests.
 */
export function sanitizeAnalyticsForFreeTier(data: AnalyticsData): AnalyticsData {
  const zeroFields = <T>(item: T, fields: ReadonlyArray<string>): T => {
    const next = { ...(item as unknown as Record<string, unknown>) };
    for (const field of fields) {
      if (field in next) {
        next[field] = 0;
      }
    }
    return next as unknown as T;
  };

  return {
    ...data,
    bodyScoreHistory: data.bodyScoreHistory.map((item) =>
      zeroFields(item, ANALYTICS_PREMIUM_BODY_FIELDS),
    ),
    faceScoreHistory: data.faceScoreHistory.map((item) =>
      zeroFields(item, ANALYTICS_PREMIUM_FACE_FIELDS),
    ),
    nutritionHistory: data.nutritionHistory.map((item) =>
      zeroFields(item, ANALYTICS_PREMIUM_NUTRITION_FIELDS),
    ),
    // Super scan est entièrement premium : vider plutôt que zéroïser, sinon
    // un downgrade premium→gratuit afficherait une ligne plate à 0.
    superScanHistory: [],
  };
}

export class ApiService {
  static async getDashboard(): Promise<DashboardData> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('api_errors.unauthorized');
    }

    const userId = user.id;

    const [
      { data: globalScoreData, error: viewError },
      { data: gamificationPayload, error: gamificationError },
    ] = await Promise.all([
      supabase
        .from('user_current_global_score')
        .select('global_score')
        .eq('user_id', userId)
        .maybeSingle(),
      supabase
        .rpc('get_user_gamification_state')
        .maybeSingle(),
    ]);

    if (viewError) {
      logOperationalError('[API] Failed to fetch global score', viewError, {
        user_id: userId,
      });
    }

    if (gamificationError) {
      if (isMissingGamificationStateRpcError(gamificationError)) {
        warnMissingGamificationStateRpc(gamificationError);
      } else {
        logOperationalError('[API] Failed to fetch gamification state', gamificationError, {
          user_id: userId,
        });
      }
    }

    return {
      healthScore: globalScoreData?.global_score || 0,
      calories: {
        current: 0,
        goal: 2000,
      },
      bodyfat: 0,
      gamification: resolveGamificationData(
        gamificationError ? null : (gamificationPayload as GamificationRpcRow | null),
      ),
    };
  }

  static async getAnalytics(period: AnalyticsPeriod): Promise<AnalyticsData> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new Error('api_errors.unauthorized');
    }

    // Defense-in-depth premium gating.
    // NOTE: ce filtrage tier vit côté client par défaut car aucune Edge Function
    // dédiée n'expose les analytics. Un client modifié peut toujours appeler
    // directement `scan_metrics` via supabase-js et lire les colonnes premium
    // (RLS Postgres ne permet pas un filtrage colonne-par-colonne facilement).
    // Le vrai fix backend est documenté dans REPORT_PREMIUM_LOGIC.md : à terme,
    // créer une RPC `get_analytics_trends(period)` qui agrège et filtre selon
    // `user_profiles.account_tier`, puis retirer le SELECT direct ci-dessous.
    const accountTier = await loadAccountTierForAnalytics(user.id);
    const isPremium = hasPremiumAccess(accountTier);

    if (!isPremium && PREMIUM_ANALYTICS_PERIODS.has(period)) {
      throw new ApiError(
        'analytics.premium_period_locked',
        'AUTH',
        null,
        { period, account_tier: accountTier },
      );
    }

    // Map period to days
    const periodToDays: Record<string, number> = {
      '7days': 7,
      '30days': 30,
      '3months': 90,
      '1year': 365,
    };
    const days = periodToDays[period] || 30;

    // Calculer la date de début en LOCAL (évite le décalage UTC)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const localStartDateStr = `${startDate.getFullYear()}-${pad(startDate.getMonth() + 1)}-${pad(startDate.getDate())}`;

    // Exécuter les deux requêtes en PARALLÈLE avec colonnes spécifiques + limit
    const [healthResult, metricsResult] = await Promise.all([
      // Requête 1: health_scores (legacy)
      supabase
        .from('health_scores')
        .select('date, score, calories_current, calories_goal, bodyfat, muscle')
        .eq('user_id', user.id)
        .gte('date', localStartDateStr)
        .order('date', { ascending: true })
        .limit(1000),

      // Requête 2: scan_metrics (nouvelles données)
      supabase
        .from('scan_metrics')
        .select(
          'recorded_at, scan_type, body_score, body_fat_percentage, body_strength_index, body_posture_score, body_symmetry_score, body_metabolic_age, face_score, skin_quality_score, face_symmetry_percentage, face_energy_score, face_hydration_level, face_collagen_level, plate_health_score, calories_estimate, protein_grams, nutrition_carbs_grams, nutrition_fat_grams, nutrition_satiety_index, global_risk_score'
        )
        .eq('user_id', user.id)
        .gte('recorded_at', localStartDateStr)
        .order('recorded_at', { ascending: true })
        .limit(1000),
    ]);

    const { data: healthScores, error } = healthResult;
    if (error) throw error;

    const { data: scanMetrics, error: metricsError } = metricsResult;
    // Si la table n'existe pas encore, on continue sans erreur
    if (metricsError) {
      logOperationalError('[API] Failed to fetch scan_metrics', metricsError, {
        user_id: user.id,
      });
    }

    const metrics = scanMetrics || [];

    // Helper to group by date and compute average
    const aggregateDailyData = <T extends Record<string, any>>(
      data: any[],
      type: string,
      mapFn: (m: any) => T,
      valueKeys: { [key in keyof T]?: string }
    ): T[] => {
      const filtered = data.filter((m: any) => m.scan_type === type);
      const grouped: Record<string, any[]> = {};

      filtered.forEach((m: any) => {
        const date = m.recorded_at.split('T')[0];
        if (!grouped[date]) grouped[date] = [];
        grouped[date].push(m);
      });

      return Object.entries(grouped).map(([date, items]) => {
        // Obtenir la structure base via la fonction de mapping sur le premier element (pour recup les autres champs statiques si besoin)
        const base = mapFn(items[0]);
        (base as any).date = date; // Force la date

        // Calculer la moyenne pour chaque cle define dans valueKeys
        for (const key in valueKeys) {
          const keyName = key as keyof T;
          const sourceName = valueKeys[keyName] as string;

          // Check if all items have this field as null, to ignore
          const isValid = items.some(i => i[sourceName] !== null && i[sourceName] !== undefined);
          if (isValid) {
            const sum = items.reduce((acc, curr) => acc + (curr[sourceName] || 0), 0);
            (base as any)[keyName] = Math.round(sum / items.length);
          }
        }
        return base;
      }).sort((a, b) => new Date((a as any).date).getTime() - new Date((b as any).date).getTime());
    };

    // Mapper les anciennes données (legacy)
    const calorieHistory = (healthScores || []).map((h: any) => ({
      date: h.date,
      consumed: h.calories_current,
      goal: h.calories_goal,
    }));

    const bodyCompositionHistory = (healthScores || []).map((h: any) => ({
      date: h.date,
      bodyfat: h.bodyfat,
      muscle: h.muscle,
    }));

    // Mapper les nouvelles données depuis scan_metrics avec agregation journaliere
    const bodyScoreHistory: BodyScoreHistoryItem[] = aggregateDailyData<BodyScoreHistoryItem>(
      metrics,
      'body',
      (m: any) => ({
        date: m.recorded_at.split('T')[0],
        bodyScore: m.body_score,
        bodyFatPercentage: m.body_fat_percentage || 0,
        strengthIndex: m.body_strength_index || 0,
        postureScore: m.body_posture_score || 0,
        bodySymmetry: m.body_symmetry_score || 0,
        metabolicAge: m.body_metabolic_age || 0,
      }),
      {
        bodyScore: 'body_score',
        bodyFatPercentage: 'body_fat_percentage',
        strengthIndex: 'body_strength_index',
        postureScore: 'body_posture_score',
        bodySymmetry: 'body_symmetry_score',
        metabolicAge: 'body_metabolic_age',
      }
    ).filter(x => x.bodyScore !== null && x.bodyScore !== undefined);

    const faceScoreHistory: FaceScoreHistoryItem[] = aggregateDailyData<FaceScoreHistoryItem>(
      metrics,
      'face',
      (m: any) => ({
        date: m.recorded_at.split('T')[0],
        faceScore: m.face_score,
        skinQualityScore: m.skin_quality_score || 0,
        symmetryPercentage: m.face_symmetry_percentage || 0,
        energyScore: m.face_energy_score || 0,
        hydrationLevel: m.face_hydration_level || 0,
        collagenLevel: m.face_collagen_level || 0,
      }),
      {
        faceScore: 'face_score',
        skinQualityScore: 'skin_quality_score',
        symmetryPercentage: 'face_symmetry_percentage',
        energyScore: 'face_energy_score',
        hydrationLevel: 'face_hydration_level',
        collagenLevel: 'face_collagen_level',
      }
    ).filter(x => x.faceScore !== null && x.faceScore !== undefined);

    const nutritionHistory: NutritionHistoryItem[] = aggregateDailyData<NutritionHistoryItem>(
      metrics,
      'nutrition',
      (m: any) => ({
        date: m.recorded_at.split('T')[0],
        caloriesEstimate: m.calories_estimate,
        proteinGrams: m.protein_grams || 0,
        carbsGrams: m.nutrition_carbs_grams || 0,
        fatGrams: m.nutrition_fat_grams || 0,
        satietyIndex: m.nutrition_satiety_index || 0,
        nutritionScore: m.plate_health_score || 0,
      }),
      {
        caloriesEstimate: 'calories_estimate',
        proteinGrams: 'protein_grams',
        carbsGrams: 'nutrition_carbs_grams',
        fatGrams: 'nutrition_fat_grams',
        satietyIndex: 'nutrition_satiety_index',
        nutritionScore: 'plate_health_score',
      }
    ).filter(x => x.caloriesEstimate !== null && x.caloriesEstimate !== undefined);

    const superScanHistory: SuperScanHistoryItem[] = aggregateDailyData<SuperScanHistoryItem>(
      metrics,
      'super',
      (m: any) => ({
        date: m.recorded_at.split('T')[0],
        globalRiskScore: m.global_risk_score,
      }),
      { globalRiskScore: 'global_risk_score' }
    ).filter(x => x.globalRiskScore !== null && x.globalRiskScore !== undefined);

    // Dans Analytics, le Score Santé = Score Visage uniquement
    // (Le Dashboard/Home conserve le Global Score = moyenne Face+Body)
    const healthScoreHistory = faceScoreHistory.map(item => ({
      date: item.date,
      value: item.faceScore,
    }));

    const aggregated: AnalyticsData = {
      period,
      healthScoreHistory, // Contient maintenant le Global Score unifié
      calorieHistory, // Legacy, non utilisé
      bodyCompositionHistory, // Legacy, non utilisé
      bodyScoreHistory,
      faceScoreHistory,
      nutritionHistory,
      superScanHistory,
    };

    return isPremium ? aggregated : sanitizeAnalyticsForFreeTier(aggregated);
  }

  /**
   * Sauvegarde les métriques clés d'un scan dans la table scan_metrics
   * pour l'historique et les graphiques d'évolution
   */
  static async saveMetricsToHistory(
    scanId: string,
    scanType: ScanType,
    analysisResult: AnalysisResult | SuperScanResult,
    recordedAt?: string | null
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      logOperationalError(
        '[API] saveMetricsToHistory skipped: user not authenticated',
        null,
        { scan_id: scanId },
      );
      return;
    }

    try {
      // Préparer les données selon le type de scan
      const metricsData: any = {
        user_id: user.id,
        scan_id: scanId,
        recorded_at: recordedAt ?? new Date().toISOString(),
      };

      // Mapper le scan_type au type d'analyse
      const resultType = getAnalysisResultScanType(analysisResult);

      const roundOrNull = (value: unknown): number | null => {
        if (value === null || value === undefined) return null;
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.round(parsed) : null;
      };
      const pickEnumOrNull = (
        value: unknown,
        allowed: readonly string[],
      ): string | null => {
        if (typeof value !== 'string') return null;
        const lowered = value.trim().toLowerCase();
        return allowed.includes(lowered) ? lowered : null;
      };

      if (resultType === 'body') {
        const bodyResult = analysisResult as ScanBodyResult;
        metricsData.scan_type = 'body';
        metricsData.body_score = Math.round(Number(bodyResult.body_score) || 0);
        metricsData.body_fat_percentage = Math.round(Number(bodyResult.body_fat_percentage) || 0);
        metricsData.waist_estimation_cm = Math.round(Number(bodyResult.waist_estimation_cm) || 0);
        metricsData.body_posture_score = Math.round(Number(bodyResult.posture_score) || 0);
        metricsData.body_symmetry_score = Math.round(Number(bodyResult.body_symmetry) || 0);
        metricsData.body_metabolic_age = Math.round(Number(bodyResult.metabolic_age) || 0);
        metricsData.body_strength_index = Math.round(Number(bodyResult.strength_index) || 0);
        metricsData.body_muscle_definition_score = roundOrNull(bodyResult.muscle_definition_score);
        metricsData.body_midsection_definition_score = roundOrNull(bodyResult.midsection_definition_score);
        metricsData.body_shoulder_alignment_score = roundOrNull(bodyResult.shoulder_alignment_score);
        metricsData.body_recovery_readiness_score = roundOrNull(bodyResult.recovery_readiness_score);
        metricsData.body_upper_body_definition_score = roundOrNull(bodyResult.upper_body_definition_score);
        metricsData.body_lower_body_definition_score = roundOrNull(bodyResult.lower_body_definition_score);
        metricsData.body_arm_definition_score = roundOrNull(bodyResult.arm_definition_score);
        metricsData.body_v_taper_score = roundOrNull(bodyResult.v_taper_score);
        metricsData.body_tension_indicator_score = roundOrNull(bodyResult.body_tension_indicator_score);
        metricsData.body_perceived_sex_key = pickEnumOrNull(bodyResult.perceived_sex_key, [
          'male_presenting',
          'female_presenting',
          'neutral_or_unclear',
        ]);
        metricsData.body_perceived_age_range_key = pickEnumOrNull(bodyResult.perceived_age_range_key, [
          'under_18',
          '18_24',
          '25_34',
          '35_44',
          '45_54',
          '55_64',
          '65_plus',
        ]);
        metricsData.body_estimated_height_range_key = pickEnumOrNull(bodyResult.estimated_height_range_key, [
          'under_150cm',
          '150_160cm',
          '160_170cm',
          '170_180cm',
          '180_190cm',
          '190_plus',
        ]);
        metricsData.body_estimated_weight_range_key = pickEnumOrNull(bodyResult.estimated_weight_range_key, [
          'under_50kg',
          '50_60kg',
          '60_70kg',
          '70_80kg',
          '80_90kg',
          '90_100kg',
          '100_plus',
        ]);
        metricsData.body_frame_key = pickEnumOrNull(bodyResult.body_frame_key, [
          'small',
          'medium',
          'large',
        ]);
        metricsData.body_perceived_fitness_level_key = pickEnumOrNull(bodyResult.perceived_fitness_level_key, [
          'sedentary',
          'lightly_active',
          'moderately_active',
          'very_active',
          'athletic',
        ]);
      } else if (resultType === 'face') {
        const faceResult = analysisResult as ScanFaceResult;
        metricsData.scan_type = 'face';
        metricsData.face_score = Math.round(Number(faceResult.face_score) || 0);
        metricsData.skin_quality_score = Math.round(Number(faceResult.skin_quality_score) || 0);
        metricsData.fatigue_level = Math.round(Number(faceResult.fatigue_level) || 0);
        metricsData.face_symmetry_percentage = Math.round(Number(faceResult.symmetry_percentage) || 0);
        metricsData.face_hydration_level = Math.round(Number(faceResult.hydration_level) || 0);
        metricsData.face_collagen_level = Math.round(Number(faceResult.collagen_level) || 0);
        const energyScore = resolveFaceGlowScore(faceResult);
        metricsData.face_energy_score = energyScore != null ? Math.round(Number(energyScore)) : null;
        metricsData.face_skin_clarity_score = roundOrNull(faceResult.skin_clarity_score);
        metricsData.face_under_eye_shadow_score = roundOrNull(faceResult.under_eye_shadow_score);
        metricsData.face_under_eye_volume_score = roundOrNull(faceResult.under_eye_volume_score);
        metricsData.face_eye_openness_score = roundOrNull(faceResult.eye_openness_score);
        metricsData.face_complexion_redness_score = roundOrNull(faceResult.complexion_redness_score);
        metricsData.face_pore_visibility_score = roundOrNull(faceResult.pore_visibility_score);
        metricsData.face_skin_evenness_score = roundOrNull(faceResult.skin_evenness_score);
        metricsData.face_skin_radiance_score = roundOrNull(faceResult.skin_radiance_score);
        metricsData.face_lip_dryness_score = roundOrNull(faceResult.lip_dryness_score);
        metricsData.face_forehead_smoothness_score = roundOrNull(faceResult.forehead_smoothness_score);
        metricsData.face_t_zone_oiliness_score = roundOrNull(faceResult.t_zone_oiliness_score);
        metricsData.face_perceived_sex_key = pickEnumOrNull(faceResult.perceived_sex_key, [
          'male_presenting',
          'female_presenting',
          'neutral_or_unclear',
        ]);
        metricsData.face_perceived_age_range_key = pickEnumOrNull(faceResult.perceived_age_range_key, [
          'under_18',
          '18_24',
          '25_34',
          '35_44',
          '45_54',
          '55_64',
          '65_plus',
        ]);
        metricsData.face_perceived_stress_level = roundOrNull(faceResult.perceived_stress_level);
        metricsData.face_perceived_sleep_quality = roundOrNull(faceResult.perceived_sleep_quality);
      } else if (resultType === 'nutrition') {
        const nutritionResult = analysisResult as ScanNutritionResult;
        metricsData.scan_type = 'nutrition';
        metricsData.plate_health_score = Math.round(Number(nutritionResult.plate_health_score) || 0);
        metricsData.calories_estimate = Math.round(Number(nutritionResult.calories_estimate) || 0);
        metricsData.protein_grams = Math.round(Number(nutritionResult.protein_grams) || 0);
        metricsData.nutrition_carbs_grams = Math.round(Number(nutritionResult.carbs_grams) || 0);
        metricsData.nutrition_fat_grams = Math.round(Number(nutritionResult.fat_grams) || 0);
        metricsData.nutrition_satiety_index = Math.round(Number(nutritionResult.satiety_index) || 0);
        metricsData.nutrition_fiber_grams_estimate = roundOrNull(nutritionResult.fiber_grams_estimate);
        metricsData.nutrition_sugar_grams_estimate = roundOrNull(nutritionResult.sugar_grams_estimate);
        metricsData.nutrition_processing_level_score = roundOrNull(nutritionResult.processing_level_score);
        metricsData.nutrition_hydration_contribution_score = roundOrNull(nutritionResult.hydration_contribution_score);
        metricsData.nutrition_sodium_level_score = roundOrNull(nutritionResult.sodium_level_score);
        metricsData.nutrition_meal_balance_score = roundOrNull(nutritionResult.meal_balance_score);
        metricsData.nutrition_inflammation_index_score = roundOrNull(nutritionResult.inflammation_index_score);
        metricsData.nutrition_meal_type_key = pickEnumOrNull(nutritionResult.meal_type_key, [
          'breakfast',
          'lunch',
          'dinner',
          'snack',
          'dessert',
          'other',
        ]);
        metricsData.nutrition_portion_size_key = pickEnumOrNull(nutritionResult.portion_size_key, [
          'small',
          'medium',
          'large',
          'oversized',
        ]);
        metricsData.nutrition_color_diversity_score = roundOrNull(nutritionResult.color_diversity_score);
        metricsData.nutrition_vegetable_portion_ratio = roundOrNull(nutritionResult.vegetable_portion_ratio);
        metricsData.nutrition_protein_visibility_score = roundOrNull(nutritionResult.protein_visibility_score);
        metricsData.nutrition_whole_grain_indicator_score = roundOrNull(nutritionResult.whole_grain_indicator_score);
        metricsData.nutrition_meal_freshness_score = roundOrNull(nutritionResult.meal_freshness_score);
        metricsData.nutrition_cuisine_type_key = pickEnumOrNull(nutritionResult.cuisine_type_key, [
          'mediterranean',
          'asian',
          'western',
          'middle_eastern',
          'latin',
          'african',
          'mixed',
          'other',
        ]);
        metricsData.nutrition_meat_type_key = pickEnumOrNull(nutritionResult.meat_type_key, [
          'red_meat',
          'poultry',
          'fish',
          'seafood',
          'plant_protein',
          'dairy',
          'none',
        ]);
        metricsData.nutrition_cooking_method_key = pickEnumOrNull(nutritionResult.cooking_method_key, [
          'fried',
          'baked',
          'grilled',
          'raw',
          'steamed',
          'boiled',
          'sauteed',
          'other',
        ]);
        metricsData.nutrition_meal_dietary_pattern_key = pickEnumOrNull(nutritionResult.meal_dietary_pattern_key, [
          'omnivore',
          'vegetarian_compatible',
          'vegan_compatible',
          'pescetarian_compatible',
          'keto_compatible',
          'mediterranean_compatible',
          'unclear',
        ]);
        const allergenAllowed = [
          'gluten_likely',
          'dairy_likely',
          'nuts_likely',
          'shellfish_likely',
          'eggs_likely',
          'soy_likely',
          'seafood_likely',
        ];
        metricsData.nutrition_allergen_visibility_keys = Array.isArray(nutritionResult.allergen_visibility_keys)
          ? Array.from(
              new Set(
                nutritionResult.allergen_visibility_keys
                  .map((v) => pickEnumOrNull(v, allergenAllowed))
                  .filter((v): v is string => v !== null),
              ),
            )
          : [];
      } else if (resultType === 'super_health_v2') {
        const superResult = analysisResult as SuperScanResult;
        metricsData.scan_type = 'super';
        metricsData.global_risk_score = Math.round(Number(superResult.global_risk_score) || 0);
      } else if (resultType === 'fat_distribution_scan_v2') {
        // MVP bypass: do not invent a legacy super score for the new Super Scan format.
        console.info('[API] saveMetricsToHistory bypassed unsupported super scan metrics', {
          scanId,
          requested_scan_type: scanType,
          analysis_scan_type: resultType,
        });
        return;
      } else {
        logOperationalError(
          '[API] saveMetricsToHistory skipped: unknown scan type',
          null,
          {
            requested_scan_type: scanType,
            analysis_scan_type: resultType,
          },
        );
        return;
      }

      const { error } = await supabase
        .from('scan_metrics')
        .upsert(metricsData, { onConflict: 'scan_id' });

      if (error) {
        // PostgREST schema cache may be stale right after a migration adds a
        // column. Retry once without the unknown column rather than dropping
        // the entire metrics row, then log the degraded write so the schema
        // cache can be refreshed.
        if (isPostgrestSchemaCacheMissError(error)) {
          const missingColumn = extractMissingColumnFromPgrstError(error);
          if (missingColumn && missingColumn in metricsData) {
            const { [missingColumn]: _omit, ...fallbackPayload } = metricsData;
            const { error: retryError } = await supabase
              .from('scan_metrics')
              .upsert(fallbackPayload, { onConflict: 'scan_id' });
            if (!retryError) {
              logOperationalError(
                '[API] saveMetricsToHistory degraded: dropped unknown column',
                error,
                {
                  scan_id: scanId,
                  requested_scan_type: scanType,
                  analysis_scan_type: resultType,
                  dropped_column: missingColumn,
                },
              );
              return;
            }
          }
        }

        // Ne pas faire échouer le scan si l'insertion des métriques échoue
        logOperationalError('[API] saveMetricsToHistory failed', error, {
          scan_id: scanId,
          requested_scan_type: scanType,
          analysis_scan_type: resultType,
        });
      }
    } catch (error) {
      logOperationalError('[API] saveMetricsToHistory crashed', error, {
        scan_id: scanId,
        scan_type: scanType,
      });
    }
  }

  static async getPremiumPotentialData(
    scanType: ScanType,
    scanId: string | null = null
  ): Promise<PremiumPotentialInputs> {
    const { data, error } = await supabase
      .rpc('get_premium_potential_data', {
        p_scan_type: scanType,
        p_scan_id: scanId,
      })
      .maybeSingle();

    if (error) {
      throw error;
    }

    const row = data as PremiumPotentialRpcRow | null;

    if (!row) {
      return {
        scanType,
        currentScan: null,
        historicalAverage30d: null,
        scanCountTotal: 0,
        recentScoreHistory: [],
      };
    }

    if (
      scanType === 'super' &&
      getAnalysisResultScanType(row.current_scan?.analysis_result) === 'fat_distribution_scan_v2'
    ) {
      return {
        scanType: row.scan_type,
        currentScan: row.current_scan ?? null,
        historicalAverage30d: null,
        scanCountTotal: Number(row.scan_count_total ?? 0),
        recentScoreHistory: [],
      };
    }

    return {
      scanType: row.scan_type,
      currentScan: row.current_scan ?? null,
      historicalAverage30d:
        row.historical_average_30d === null ? null : Number(row.historical_average_30d),
      scanCountTotal: Number(row.scan_count_total ?? 0),
      recentScoreHistory: parsePremiumPotentialHistory(row.recent_score_history),
    };
  }

  static async getRecipes() {
    const { data, error } = await supabase
      .from('recipes')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async getExercises() {
    const { data, error } = await supabase
      .from('exercises')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  }

  static async checkScanEligibility(scanType: ScanType): Promise<ScanEligibilityResponse> {
    const data = await invokeAuthedFunction<ScanEligibilityResponse>(
      'check-and-record-scan',
      buildCheckAndRecordScanRequest(scanType),
    );

    return normalizeScanEligibilityResponse(data);
  }

  static async checkScanEligibilityOnly(scanType: ScanType): Promise<ScanEligibilityResponse> {
    const data = await invokeAuthedFunction<ScanEligibilityResponse>(
      'check-and-record-scan',
      buildCheckAndRecordScanRequest(scanType, { checkOnly: true }),
    );

    return normalizeScanEligibilityResponse(data);
  }

  static async checkScanEligibilityBatch(
    scanTypes?: ScanType[],
  ): Promise<ScanEligibilityBatchResult> {
    const response =
      await invokeAuthedFunction<ScanEligibilityBatchFunctionResponse>(
        'check-scan-eligibility-batch',
        Array.isArray(scanTypes) && scanTypes.length > 0
          ? { scan_types: scanTypes }
          : {},
      );

    if (!response || response.success !== true) {
      throw new ApiError(
        'Scan eligibility batch returned an invalid payload',
        'EDGE_FUNCTION',
        response,
        {
          functionName: 'check-scan-eligibility-batch',
          stage: 'eligibility',
        },
      );
    }

    const data: ScanEligibilityBatchData = {};
    const errors: ScanEligibilityBatchErrors = {};

    Object.entries(response.eligibility ?? {}).forEach(([scanType, eligibility]) => {
      if (!isScanTypeKey(scanType) || !eligibility) {
        return;
      }

      data[scanType] = normalizeScanEligibilityResponse({
        ...eligibility,
        scanType: eligibility.scanType ?? scanType,
      });
    });

    Object.entries(response.errors ?? {}).forEach(([scanType, errorPayload]) => {
      if (!isScanTypeKey(scanType)) {
        return;
      }

      errors[scanType] = buildBatchEligibilityError(scanType, errorPayload);
    });

    return {
      data,
      errors,
      requestId: response.request_id,
    };
  }

  static async getNextAvailableScanDate(scanType: ScanType): Promise<number | null> {
    try {
      const result = await this.checkScanEligibilityOnly(scanType);
      return result.next_available_date || null;
    } catch (error) {
      logOperationalError('[API] Failed to get next available scan date', error, {
        scan_type: scanType,
      });
      return null;
    }
  }

  static async createScan(imageUri: string, scanType: ScanType) {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      throw new ApiError('api_errors.unauthorized', 'AUTH', undefined, {
        scanType,
        stage: 'reservation',
      });
    }

    const eligibility = await this.checkScanEligibility(scanType);
    const hasWelcomeCredits = (eligibility.welcome_credits || 0) > 0;
    const canScan = eligibility.allowed || hasWelcomeCredits;
    if (!canScan) {
      throw new ApiError(
        eligibility.message || 'Scan non autorisé',
        'VALIDATION',
        undefined,
        {
          scanType,
          stage: 'reservation',
          code: eligibility.code,
          request_id: eligibility.request_id,
        },
      );
    }

    if (!eligibility.scan_id) {
      throw new ApiError(
        'Scan reservation did not return a scan_id',
        'DATABASE',
        undefined,
        {
          scanType,
          stage: 'reservation',
        },
      );
    }

    // Utiliser ImageManipulator pour normaliser et obtenir le base64
    // Fonctionne avec tous les types d'URIs (file://, content://, etc.)

    let base64 = '';

    if (Platform.OS === 'web') {
      try {

        base64 = await new Promise((resolve, reject) => {
          const img = new Image();
          img.crossOrigin = 'Anonymous'; // Tentative de gestion CORS si besoin

          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.width;
              canvas.height = img.height;

              const ctx = canvas.getContext('2d');
              if (!ctx) {
                reject(new Error('Could not get canvas context'));
                return;
              }

              // Dessiner l'image sur le canvas (convertit implicitement en pixels bruts)
              ctx.drawImage(img, 0, 0);

              // Exporter en JPEG avec qualité 0.95
              const dataUrl = canvas.toDataURL('image/jpeg', 0.95);

              // Extraire le base64 pur
              const base64Data = dataUrl.split(',')[1];
              resolve(base64Data);
            } catch (err) {
              reject(err);
            }
          };

          img.onerror = (err) => {
            logOperationalError('[API] Failed to load image for processing', err, {
              scan_type: scanType,
            });
            reject(new Error('Failed to load image for processing'));
          };

          img.src = imageUri;
        });
      } catch (error) {
        logOperationalError('[API] Web image processing failed', error, {
          scan_type: scanType,
        });
        throw new Error('api_errors.image_processing_failed');
      }
    } else {
      // Logic native existante
      try {
        const manipulatedImage = await ImageManipulator.manipulateAsync(
          imageUri,
          [], // Pas de transformation, juste normalisation
          {
            compress: 0.95, // Haute qualité pour l'analyse IA
            format: ImageManipulator.SaveFormat.JPEG,
            base64: true, // Retourne directement le base64
          }
        );

        if (!manipulatedImage.base64) {
          throw new Error('api_errors.server');
        }
        base64 = manipulatedImage.base64;
      } catch (error) {
        logOperationalError('[API] Native image processing failed', error, {
          scan_type: scanType,
        });
        throw error;
      }
    }

    const fileName = buildCanonicalScanImagePath(user.id, eligibility.scan_id);

    // P2-I Phase 2 — limite partagée post-compression (10 MiB) pour empêcher
    // l'envoi d'une image gigantesque qui DoS la bande passante de l'utilisateur
    // ou qui sature le bucket. compression 0.95 conservée pour la qualité IA.
    const decodedBuffer = decode(base64);
    if (decodedBuffer.byteLength > SCAN_IMAGE_MAX_BYTES) {
      await rollbackReservedScanAfterUploadFailure(eligibility.scan_id, scanType);
      throw new Error('api_errors.image_too_large');
    }

    // Upload avec ArrayBuffer décodé depuis base64
    let uploadError: unknown = null;
    try {
      const uploadResult = await uploadAuthenticatedStorageObject({
        bucket: STORAGE_BUCKET_NAME,
        path: fileName,
        fileBody: decodedBuffer,
        ownerUserId: user.id,
        context: 'scan image upload',
        fileOptions: {
          contentType: 'image/jpeg',
          upsert: false,
        },
      });
      uploadError = uploadResult.error;
    } catch (error) {
      await rollbackReservedScanAfterUploadFailure(eligibility.scan_id, scanType);
      if (error instanceof AuthenticatedStorageSessionError) {
        throw new ApiError('api_errors.unauthorized', 'AUTH', error, {
          scanType,
          scan_id: eligibility.scan_id,
          image_path: fileName,
          bucket: STORAGE_BUCKET_NAME,
          stage: 'upload-session',
          code: error.code,
        });
      }

      throw error;
    }

    if (uploadError) {
      await rollbackReservedScanAfterUploadFailure(eligibility.scan_id, scanType);
      throw createUploadApiError(uploadError, {
        scanType,
        scan_id: eligibility.scan_id,
        image_path: fileName,
        bucket: STORAGE_BUCKET_NAME,
        stage: 'upload',
      });
    }

    return {
      id: eligibility.scan_id,
      user_id: user.id,
      scan_type: scanType,
      image_url: null,
      image_path: fileName,
      used_welcome_credit: eligibility.used_welcome_credit ?? false,
      created_at: new Date().toISOString(),
    };
  }

  static async analyzeScan(
    scanId: string,
    scanType: ScanType,
    language: string = 'fr',
    options: { timeoutMs?: number } = {},
  ) {
    if (!scanId || typeof scanId !== 'string') {
      throw new ApiError(
        'api_errors.validation',
        'VALIDATION',
        undefined,
        { scanId, scanType, stage: 'analysis' }
      );
    }

    // S-06 — polling sur 409 scan_analysis_in_progress. Une analyse parallèle
    // (retry concurrent ou client précédent qui a perdu sa connexion) tient
    // déjà le verrou côté Edge. On ré-essaie périodiquement jusqu'à ce que
    // l'analyse aboutisse côté serveur (réponse idempotente), ou que la
    // fenêtre expire (auquel cas on remonte une vraie erreur).
    let pollAttempts = 0;
    while (true) {
      try {
        const result = await invokeAuthedFunction<{ success: boolean; scan: Scan }>(
          'analyze-scan',
          buildAnalyzeScanRequest(scanId, scanType, language),
          {
            timeoutMs:
              options.timeoutMs ??
              ANALYZE_SCAN_TIMEOUT_MS_BY_SCAN_TYPE[scanType] ??
              70_000,
            context: {
              scanId,
              scanType,
              stage: 'analysis',
            },
          },
        );

        return result.scan;
      } catch (error) {
        if (isAnalyzeScanInProgressError(error)) {
          if (pollAttempts >= ANALYZE_SCAN_IN_PROGRESS_MAX_POLLS) {
            throw error;
          }
          pollAttempts += 1;
          await waitForDelay(ANALYZE_SCAN_IN_PROGRESS_POLL_DELAY_MS);
          continue;
        }

        if (error instanceof ApiError) {
          throw error;
        }

        const apiError = new ApiError(
          error instanceof Error ? error.message : 'Erreur inconnue lors de l\'analyse',
          ApiError.isTimeoutError(error)
            ? 'TIMEOUT'
            : ApiError.isNetworkError(error)
              ? 'NETWORK'
              : 'EDGE_FUNCTION',
          error,
          { scanId, scanType, stage: 'analysis' }
        );
        throw apiError;
      }
    }
  }

  static async createScanWithAnalysis(imageUri: string, scanType: ScanType, language: string): Promise<ScanWithAnalysisResult> {
    // Validation des paramètres
    if (!imageUri || typeof imageUri !== 'string') {
      throw new ApiError(
        'imageUri invalide ou manquante',
        'VALIDATION',
        undefined,
        { imageUri, scanType }
      );
    }

    // Étape 1: Créer le scan (crédit débité)
    const scan = await this.createScan(imageUri, scanType);

    try {
      let updateData: Scan;

      try {
        updateData = await this.analyzeScan(
          scan.id,
          scanType,
          language
        );
      } catch (error) {
        if (!shouldRetryAnalyzeScanAfterUploadError(error)) {
          throw error;
        }

        const resolvedError = error as ApiError;
        logOperationalError(
          '[API] Retrying scan analysis after storage lookup miss',
          resolvedError,
          {
            scan_id: scan.id,
            scan_type: scanType,
          },
        );
        await waitForDelay(ANALYZE_SCAN_IMAGE_RETRY_DELAY_MS);
        updateData = await this.analyzeScan(
          scan.id,
          scanType,
          language
        );
      }

      if (updateData?.analysis_result) {
        await this.saveMetricsToHistory(
          scan.id,
          scanType,
          updateData.analysis_result as AnalysisResult | SuperScanResult,
          updateData?.analyzed_at ?? null
        );
      }

      return {
        scan: updateData,
        analysisSucceeded: true,
      };
    } catch (error) {
      if (error instanceof ApiError) {
        return {
          scan,
          analysisSucceeded: false,
          analysisError: error,
        };
      }

      const apiError = new ApiError(
        error instanceof Error ? error.message : 'Erreur inconnue lors de l\'analyse',
        'UNKNOWN',
        error,
        { scanId: scan.id, scanType }
      );

      return {
        scan,
        analysisSucceeded: false,
        analysisError: apiError,
      };
    }
  }
}
