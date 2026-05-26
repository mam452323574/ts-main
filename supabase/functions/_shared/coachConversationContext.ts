import { readCoachProfileMemory } from './coachProfileMemory.ts';
import { logPhase2Error } from './phase2Observability.ts';
import { isRecord, readOptionalString } from './phase2Utils.ts';
import {
  classifyMetricChange,
  getMetricsPrefixForScanType,
  orderMetricKeys,
  PRIORITY_METRIC_KEYS_BY_TYPE,
  TRENDED_METRICS_BY_TYPE,
  type MetricDirection,
} from '../../../shared/coachMetrics.ts';

// ----- DIGEST METRICS TYPES (per scan_type) -----
//
// scan_metrics columns are prefixed (face_, body_, nutrition_, super_). In the
// digest we strip the prefix so the LLM sees e.g. `metrics.skin_clarity_score`
// (not `metrics.face_skin_clarity_score`). All fields are optional — only the
// non-null columns are projected per scan.

export interface CoachFaceDigestMetrics {
  skin_clarity_score?: number;
  under_eye_shadow_score?: number;
  under_eye_volume_score?: number;
  eye_openness_score?: number;
  complexion_redness_score?: number;
  pore_visibility_score?: number;
  skin_evenness_score?: number;
  skin_radiance_score?: number;
  lip_dryness_score?: number;
  forehead_smoothness_score?: number;
  t_zone_oiliness_score?: number;
  hydration_level?: number;
  collagen_level?: number;
  [key: string]: unknown;
}

export interface CoachBodyDigestMetrics {
  muscle_definition_score?: number;
  midsection_definition_score?: number;
  shoulder_alignment_score?: number;
  recovery_readiness_score?: number;
  upper_body_definition_score?: number;
  lower_body_definition_score?: number;
  arm_definition_score?: number;
  v_taper_score?: number;
  tension_indicator_score?: number;
  posture_score?: number;
  symmetry_score?: number;
  body_fat_percentage?: number;
  [key: string]: unknown;
}

export interface CoachNutritionDigestMetrics {
  fiber_grams_estimate?: number;
  sugar_grams_estimate?: number;
  carbs_grams?: number;
  fat_grams?: number;
  processing_level_score?: number;
  hydration_contribution_score?: number;
  sodium_level_score?: number;
  meal_balance_score?: number;
  inflammation_index_score?: number;
  color_diversity_score?: number;
  vegetable_portion_ratio?: number;
  protein_visibility_score?: number;
  whole_grain_indicator_score?: number;
  meal_freshness_score?: number;
  meal_type_key?: string;
  portion_size_key?: string;
  cuisine_type_key?: string;
  meat_type_key?: string;
  cooking_method_key?: string;
  [key: string]: unknown;
}

export interface CoachSuperDigestMetrics {
  global_risk_score?: number;
  [key: string]: unknown;
}

export type CoachDigestMetrics =
  | CoachFaceDigestMetrics
  | CoachBodyDigestMetrics
  | CoachNutritionDigestMetrics
  | CoachSuperDigestMetrics;

export interface CoachDigestComparison {
  scan_id: string;
  captured_at: string;
  delta_overall?: number;
}

export interface CoachRecentScanDigestEntry {
  scan_id?: string;
  scan_type: string;
  captured_at: string;
  overall_score?: number;
  summary?: string;
  top_findings?: string[];
  metrics?: CoachDigestMetrics;
  comparison_to_previous?: CoachDigestComparison;
}

export interface CoachScanSummary {
  total: number;
  last_7d: number;
  last_30d: number;
  first_at: string | null;
  last_at: string | null;
  by_type: Record<string, number>;
}

export interface CoachTrendEntry {
  current: number;
  previous: number;
  delta: number;
  direction: MetricDirection;
  samples: number;
}

export type CoachTrendsByMetric = Record<string, CoachTrendEntry>;

export interface CoachUserContext {
  inferred_persona?: Record<string, unknown>;
  recent_scan_digest?: CoachRecentScanDigestEntry[];
  scan_summary?: CoachScanSummary;
  trends?: CoachTrendsByMetric;
}

// ----- CONSTANTS -----

const COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT = 5;
const COACH_CONVERSATION_DIGEST_FETCH_LIMIT = 10;
const SUMMARY_MAX_LENGTH = 400;
const FINDING_MAX_LENGTH = 160;
const FINDINGS_MAX_COUNT = 4;
const TRUNCATION_SUFFIX = '…';
const USER_CONTEXT_CACHE_TTL_MS = 30 * 60 * 1000;

// ----- HELPERS (string / number) -----

function clampString(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - TRUNCATION_SUFFIX.length) + TRUNCATION_SUFFIX;
}

function readBoundedScore(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 100) return undefined;
  return value;
}

function pickOverallScore(analysisResult: Record<string, unknown>): number | undefined {
  const direct =
    readBoundedScore(analysisResult.overall_score) ??
    readBoundedScore(analysisResult.score);
  if (direct !== undefined) return direct;
  const nestedSummary = analysisResult.summary;
  if (isRecord(nestedSummary)) {
    return readBoundedScore(nestedSummary.score);
  }
  return undefined;
}

function pickSummary(analysisResult: Record<string, unknown>): string | undefined {
  const candidates: unknown[] = [
    analysisResult.analysis_summary,
    analysisResult.summary,
    analysisResult.summary_text,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const clamped = clampString(candidate, SUMMARY_MAX_LENGTH);
    if (clamped) return clamped;
  }
  return undefined;
}

function pickTopFindings(analysisResult: Record<string, unknown>): string[] | undefined {
  const sources: unknown[] = [
    analysisResult.findings,
    analysisResult.recommendations,
    analysisResult.top_issues,
  ];
  for (const source of sources) {
    if (!Array.isArray(source)) continue;
    const items: string[] = [];
    for (const candidate of source) {
      const clamped = clampString(candidate, FINDING_MAX_LENGTH);
      if (clamped) items.push(clamped);
      if (items.length >= FINDINGS_MAX_COUNT) break;
    }
    if (items.length > 0) return items;
  }
  return undefined;
}

function readCapturedAt(row: Record<string, unknown>): string | null {
  return (
    readOptionalString(row.analyzed_at) ??
    readOptionalString(row.created_at)
  );
}

// ----- scan_metrics row reading -----

/**
 * PostgREST embedded relations can show up as either an object (1-to-1
 * detected via UNIQUE index) or a single-element array (1-to-many fallback).
 * Tolerate both, return null if neither shape applies.
 */
function readScanMetricsRow(row: unknown): Record<string, unknown> | null {
  if (row === null || row === undefined) return null;
  if (Array.isArray(row)) {
    if (row.length === 0) return null;
    return isRecord(row[0]) ? row[0] : null;
  }
  if (isRecord(row)) return row;
  return null;
}

/**
 * Extract the non-null metric columns matching the scan_type, strip the
 * prefix, and return them in a deterministic order (priority keys first).
 *
 * Returns `undefined` if no usable metric is present.
 */
function buildDigestMetricsForType(
  scanType: string,
  scanMetricsRow: Record<string, unknown> | null,
): CoachDigestMetrics | undefined {
  if (!scanMetricsRow) return undefined;
  const prefix = getMetricsPrefixForScanType(scanType);
  if (!prefix) return undefined;

  const raw: Record<string, unknown> = {};
  for (const [columnName, value] of Object.entries(scanMetricsRow)) {
    if (value === null || value === undefined) continue;
    if (!columnName.startsWith(prefix)) continue;
    const stripped = columnName.slice(prefix.length);
    if (!stripped) continue;
    raw[stripped] = value;
  }

  if (Object.keys(raw).length === 0) return undefined;

  const orderedKeys = orderMetricKeys(scanType, Object.keys(raw));
  const result: Record<string, unknown> = {};
  for (const key of orderedKeys) {
    result[key] = raw[key];
  }
  return result as CoachDigestMetrics;
}

// ----- Row -> DigestEntry mapping -----

interface ScanRowWithMetrics {
  id?: unknown;
  scan_type?: unknown;
  analysis_result?: unknown;
  analyzed_at?: unknown;
  created_at?: unknown;
  scan_metrics?: unknown;
}

function mapScanRowToDigest(row: unknown): CoachRecentScanDigestEntry | null {
  if (!isRecord(row)) return null;
  const typed = row as ScanRowWithMetrics;
  const scanType = readOptionalString(typed.scan_type);
  const capturedAt = readCapturedAt(typed as Record<string, unknown>);
  if (!scanType || !capturedAt) return null;

  const scanId = readOptionalString(typed.id);
  const entry: CoachRecentScanDigestEntry = {
    scan_type: scanType,
    captured_at: capturedAt,
  };
  if (scanId) entry.scan_id = scanId;

  const analysis = typed.analysis_result;
  if (isRecord(analysis)) {
    const overallScore = pickOverallScore(analysis);
    if (overallScore !== undefined) entry.overall_score = overallScore;
    const summary = pickSummary(analysis);
    if (summary) entry.summary = summary;
    const findings = pickTopFindings(analysis);
    if (findings) entry.top_findings = findings;
  }

  const metricsRow = readScanMetricsRow(typed.scan_metrics);
  const metrics = buildDigestMetricsForType(scanType, metricsRow);
  if (metrics) entry.metrics = metrics;

  return entry;
}

// ----- Public digest builder -----

export async function buildRecentScanDigest(
  client: any,
  userId: string,
  limit: number = COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT,
): Promise<CoachRecentScanDigestEntry[]> {
  const { data, error } = await client
    .from('scans')
    .select('id, scan_type, analysis_result, analyzed_at, created_at, scan_metrics(*)')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) return [];

  const digest: CoachRecentScanDigestEntry[] = [];
  for (const row of data) {
    const entry = mapScanRowToDigest(row);
    if (entry) digest.push(entry);
  }
  return digest;
}

// ----- Trends builder -----

/**
 * Compute a per-(scan_type, metric) trend from the scans we already fetched.
 * We need at least two scans of the same type to derive a direction; the
 * caller is expected to pass enough rows (we look at the 2 newest per type).
 *
 * Metrics considered:
 *   - overall_score (always exposed under "<scan_type>.overall_score")
 *   - the `TRENDED_METRICS_BY_TYPE[bucket]` list (subset of granular metrics)
 *
 * For lower-is-better metrics (inflammation, sodium, ...), the direction is
 * flipped inside `classifyMetricChange` via `LOWER_IS_BETTER_METRICS`.
 */
export function buildTrendsByType(
  entries: CoachRecentScanDigestEntry[],
): CoachTrendsByMetric {
  const byType = new Map<string, CoachRecentScanDigestEntry[]>();
  for (const entry of entries) {
    const list = byType.get(entry.scan_type);
    if (list) {
      list.push(entry);
    } else {
      byType.set(entry.scan_type, [entry]);
    }
  }

  const trends: CoachTrendsByMetric = {};

  for (const [scanType, list] of byType.entries()) {
    if (list.length < 2) continue;
    // entries are passed newest first by the digest builder.
    const current = list[0];
    const previous = list[1];

    if (
      typeof current.overall_score === 'number' &&
      typeof previous.overall_score === 'number'
    ) {
      const classified = classifyMetricChange(
        'overall_score',
        current.overall_score,
        previous.overall_score,
      );
      trends[`${scanType}.overall_score`] = {
        current: current.overall_score,
        previous: previous.overall_score,
        delta: classified.delta,
        direction: classified.direction,
        samples: list.length,
      };
    }

    const prefix = getMetricsPrefixForScanType(scanType);
    if (!prefix) continue;
    const bucket = prefix.replace(/_$/, '');
    const trackedMetrics = TRENDED_METRICS_BY_TYPE[bucket] ?? [];

    const currentMetrics = isRecord(current.metrics) ? current.metrics : null;
    const previousMetrics = isRecord(previous.metrics) ? previous.metrics : null;
    if (!currentMetrics || !previousMetrics) continue;

    for (const metricKey of trackedMetrics) {
      const cur = (currentMetrics as Record<string, unknown>)[metricKey];
      const prev = (previousMetrics as Record<string, unknown>)[metricKey];
      if (typeof cur !== 'number' || typeof prev !== 'number') continue;
      if (!Number.isFinite(cur) || !Number.isFinite(prev)) continue;
      const classified = classifyMetricChange(metricKey, cur, prev);
      trends[`${bucket}.${metricKey}`] = {
        current: cur,
        previous: prev,
        delta: classified.delta,
        direction: classified.direction,
        samples: list.length,
      };
    }
  }

  return trends;
}

// ----- Scan summary (RPC wrapper) -----

function normalizeScanSummary(raw: unknown): CoachScanSummary | null {
  if (!isRecord(raw)) return null;
  const totalNum = typeof raw.total === 'number' ? raw.total : Number(raw.total);
  if (!Number.isFinite(totalNum)) return null;
  const last7dNum = typeof raw.last_7d === 'number' ? raw.last_7d : Number(raw.last_7d ?? 0);
  const last30dNum = typeof raw.last_30d === 'number' ? raw.last_30d : Number(raw.last_30d ?? 0);

  const byTypeRaw = isRecord(raw.by_type) ? raw.by_type : {};
  const byType: Record<string, number> = {};
  for (const [key, value] of Object.entries(byTypeRaw)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num) && num >= 0) {
      byType[key] = num;
    }
  }

  return {
    total: Math.max(0, Math.round(totalNum)),
    last_7d: Math.max(0, Math.round(Number.isFinite(last7dNum) ? last7dNum : 0)),
    last_30d: Math.max(0, Math.round(Number.isFinite(last30dNum) ? last30dNum : 0)),
    first_at: readOptionalString(raw.first_at) ?? null,
    last_at: readOptionalString(raw.last_at) ?? null,
    by_type: byType,
  };
}

async function fetchScanSummary(client: any, userId: string): Promise<CoachScanSummary | null> {
  const { data, error } = await client.rpc('get_user_scan_summary', {
    p_user_id: userId,
  });
  if (error) throw error;
  return normalizeScanSummary(data);
}

// ----- buildCoachUserContext -----

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

interface BuildCoachUserContextOptions {
  fetchLimit?: number;
  outputLimit?: number;
}

export async function buildCoachUserContext(
  client: any,
  userId: string,
  requestId: string,
  options: BuildCoachUserContextOptions = {},
): Promise<CoachUserContext | null> {
  const fetchLimit = Math.max(
    options.outputLimit ?? COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT,
    options.fetchLimit ?? COACH_CONVERSATION_DIGEST_FETCH_LIMIT,
  );
  const outputLimit = options.outputLimit ?? COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT;

  const [profileResult, digestResult, summaryResult] = await Promise.allSettled([
    readCoachProfileMemory(client, userId),
    buildRecentScanDigest(client, userId, fetchLimit),
    fetchScanSummary(client, userId),
  ]);

  const context: CoachUserContext = {};

  if (profileResult.status === 'fulfilled') {
    if (isNonEmptyRecord(profileResult.value)) {
      context.inferred_persona = profileResult.value;
    }
  } else {
    logPhase2Error(
      '[coach-send-message] user_context fetch degraded',
      profileResult.reason,
      { request_id: requestId, kind: 'profile' },
    );
  }

  let fullDigest: CoachRecentScanDigestEntry[] = [];
  if (digestResult.status === 'fulfilled') {
    fullDigest = digestResult.value;
    if (fullDigest.length > 0) {
      const trimmed = fullDigest.slice(0, outputLimit);
      context.recent_scan_digest = trimmed;
    }
  } else {
    logPhase2Error(
      '[coach-send-message] user_context fetch degraded',
      digestResult.reason,
      { request_id: requestId, kind: 'scans' },
    );
  }

  if (fullDigest.length >= 2) {
    const trends = buildTrendsByType(fullDigest);
    if (Object.keys(trends).length > 0) {
      context.trends = trends;
    }
  }

  if (summaryResult.status === 'fulfilled') {
    if (summaryResult.value && summaryResult.value.total > 0) {
      context.scan_summary = summaryResult.value;
    }
  } else {
    logPhase2Error(
      '[coach-send-message] user_context fetch degraded',
      summaryResult.reason,
      { request_id: requestId, kind: 'scan_summary' },
    );
  }

  if (Object.keys(context).length === 0) {
    return null;
  }

  return context;
}

// ----- Cached user_context (per conversation) -----

interface CachedUserContextRow {
  user_context_snapshot_json?: unknown;
  user_context_built_at?: unknown;
  user_context_built_for_scan_id?: unknown;
}

function isUserContextShape(value: unknown): value is CoachUserContext {
  // Cheap shape check — the snapshot was written by us, so trust it broadly,
  // but reject anything that's not an object.
  return isRecord(value);
}

export async function getCachedOrFreshUserContext(
  client: any,
  userId: string,
  conversationId: string,
  requestId: string,
  options: { ttlMs?: number } = {},
): Promise<CoachUserContext | null> {
  const ttlMs = options.ttlMs ?? USER_CONTEXT_CACHE_TTL_MS;

  // 1. Read cache + latest scan id in parallel.
  const [convResult, latestScanResult] = await Promise.allSettled([
    client
      .from('coach_conversations')
      .select('user_context_snapshot_json, user_context_built_at, user_context_built_for_scan_id')
      .eq('id', conversationId)
      .eq('user_id', userId)
      .maybeSingle(),
    client
      .from('scans')
      .select('id')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let cacheRow: CachedUserContextRow | null = null;
  if (convResult.status === 'fulfilled' && !convResult.value?.error) {
    const data = convResult.value?.data ?? null;
    if (isRecord(data)) cacheRow = data as CachedUserContextRow;
  } else if (convResult.status === 'rejected') {
    logPhase2Error(
      '[coach-send-message] user_context cache lookup degraded',
      convResult.reason,
      { request_id: requestId, kind: 'cache_lookup' },
    );
  }

  let latestScanId: string | null = null;
  if (latestScanResult.status === 'fulfilled' && !latestScanResult.value?.error) {
    const data = latestScanResult.value?.data ?? null;
    if (isRecord(data)) {
      latestScanId = readOptionalString(data.id);
    }
  }

  // 2. Decide cache hit.
  if (cacheRow) {
    const builtAt = readOptionalString(cacheRow.user_context_built_at);
    const builtFor = readOptionalString(cacheRow.user_context_built_for_scan_id);
    const snapshot = cacheRow.user_context_snapshot_json;

    if (builtAt && isUserContextShape(snapshot)) {
      const builtAtMs = Date.parse(builtAt);
      const ageMs = Number.isFinite(builtAtMs) ? Date.now() - builtAtMs : Infinity;
      const ttlOk = ageMs < ttlMs;
      const scanIdOk = builtFor === latestScanId; // both null also matches when user has no scans
      if (ttlOk && scanIdOk) {
        return snapshot;
      }
    }
  }

  // 3. Cache miss / stale → rebuild + persist (best-effort).
  const fresh = await buildCoachUserContext(client, userId, requestId);

  try {
    const patch: Record<string, unknown> = {
      user_context_snapshot_json: fresh,
      user_context_built_at: new Date().toISOString(),
      user_context_built_for_scan_id: latestScanId,
    };
    const { error: updateError } = await client
      .from('coach_conversations')
      .update(patch)
      .eq('id', conversationId)
      .eq('user_id', userId);
    if (updateError) {
      logPhase2Error(
        '[coach-send-message] user_context cache persist degraded',
        updateError,
        { request_id: requestId, kind: 'cache_persist' },
      );
    }
  } catch (cachePersistError) {
    logPhase2Error(
      '[coach-send-message] user_context cache persist degraded',
      cachePersistError,
      { request_id: requestId, kind: 'cache_persist' },
    );
  }

  return fresh;
}

// ----- Exports for tests -----

export const __internals = {
  COACH_CONVERSATION_DIGEST_DEFAULT_LIMIT,
  COACH_CONVERSATION_DIGEST_FETCH_LIMIT,
  SUMMARY_MAX_LENGTH,
  FINDING_MAX_LENGTH,
  FINDINGS_MAX_COUNT,
  USER_CONTEXT_CACHE_TTL_MS,
  buildDigestMetricsForType,
  buildTrendsByType,
  normalizeScanSummary,
  readScanMetricsRow,
  PRIORITY_METRIC_KEYS_BY_TYPE,
};
