import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import { getCoachQuotaStatus } from '../_shared/coachQuota.ts';
import {
  createServiceRoleClient,
  requireAuthenticatedUser,
} from '../_shared/phase2Auth.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import {
  createRequestId,
  logPhase2Error,
} from '../_shared/phase2Observability.ts';
import {
  assertNoUnknownKeys,
  isRecord,
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import { isCoachPersonaKey } from '../../../shared/coachPersonas.ts';
import {
  resolveTierFromProfile,
  sanitizeScanForTier,
  type ScanResultTier,
} from '../_shared/scanResultSanitizer.ts';

// N-D of COACH_SECURITY_AUDIT_2026_05: rate limit. The UI calls this endpoint
// ~1× per Coach screen open; defaults are generous (30/min, 600/h, 2000/day)
// to absorb fast swipe / pull-to-refresh without blocking real users.
const COACH_SNAPSHOT_RATE_LIMIT_PER_MINUTE = 30;
const COACH_SNAPSHOT_RATE_LIMIT_PER_HOUR = 600;
const COACH_SNAPSHOT_RATE_LIMIT_PER_DAY = 2000;
const COACH_SNAPSHOT_RATE_LIMIT_ERROR_CODE = 'coach_snapshot_rate_limit_exceeded';

async function enforceCoachSnapshotRateLimit(client: any, userId: string) {
  const { data, error } = await client.rpc('record_coach_snapshot_attempt', {
    p_user_id: userId,
    p_per_minute: COACH_SNAPSHOT_RATE_LIMIT_PER_MINUTE,
    p_per_hour: COACH_SNAPSHOT_RATE_LIMIT_PER_HOUR,
    p_per_day: COACH_SNAPSHOT_RATE_LIMIT_PER_DAY,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach snapshot rate limit check',
      fallbackCode: 'coach_snapshot_rate_limit_check_failed',
      fallbackMessage: 'Failed to evaluate coach snapshot quota',
      relationName: 'coach_snapshot_attempts',
    });
  }

  if (isRecord(data) && data.allowed === false) {
    const windowExceeded =
      typeof data.window_exceeded === 'string' ? data.window_exceeded : 'unknown';
    throw new Phase2HttpError(
      429,
      COACH_SNAPSHOT_RATE_LIMIT_ERROR_CODE,
      `Coach snapshot rate limit exceeded for window: ${windowExceeded}`,
      { window_exceeded: windowExceeded },
    );
  }
}

const DEFAULT_ENTRIES_LIMIT = 10;
const MAX_ENTRIES_LIMIT = 20;
const RECENT_SCAN_ROWS_LIMIT = 64;

// C-05 of COACH_SECURITY_AUDIT_2026_05: explicit column list so we never leak
// internal fields (request_payload_json, response_payload_json, cache_key,
// input_hash, error_code) to authenticated clients. Mirrors the surface of
// get_coach_history_page_v2 plus the few extra fields the snapshot UI uses
// (e.g. user_id, updated_at).
const COACH_ENTRY_PUBLIC_COLUMNS = [
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

function readOptionalString(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : null;
}

function normalizeLocale(value: unknown) {
  const rawLocale = readOptionalString(value);
  if (!rawLocale) {
    return null;
  }

  const normalizedLocale = rawLocale.slice(0, 2).toLowerCase();
  return /^[a-z]{2}$/.test(normalizedLocale) ? normalizedLocale : null;
}

function normalizeEntriesLimit(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ENTRIES_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(value), 1), MAX_ENTRIES_LIMIT);
}

function parseSnapshotRequest(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Phase2HttpError(400, 'invalid_payload', 'Request body must be an object');
  }

  const requestBody = payload as Record<string, unknown>;
  assertNoUnknownKeys(
    requestBody,
    ['persona_key', 'personaKey', 'locale', 'exclude_entry_id', 'excludeEntryId', 'entries_limit', 'entriesLimit'],
    'Coach snapshot request',
  );

  const rawPersonaKey = requestBody.persona_key ?? requestBody.personaKey;
  const personaKey = readOptionalString(rawPersonaKey);
  if (personaKey && !isCoachPersonaKey(personaKey)) {
    throw new Phase2HttpError(400, 'invalid_persona_key', 'persona_key is invalid');
  }

  return {
    personaKey,
    locale: normalizeLocale(requestBody.locale),
    excludeEntryId: readOptionalString(
      requestBody.exclude_entry_id ?? requestBody.excludeEntryId,
    ),
    entriesLimit: normalizeEntriesLimit(
      requestBody.entries_limit ?? requestBody.entriesLimit,
    ),
  };
}

function applyReadyEntryFilters(query: any) {
  // F-01 (audit 2026-05-27): soft-deleted coach entries must not surface on
  // the Coach idle screen. This helper feeds both fetchLatestReadyEntry and
  // fetchHistorySummary, so anchoring the filter here covers both consumers in
  // one place. fetchCoachEntries does not go through this helper and applies
  // the same filter inline.
  return query
    .is('deleted_at', null)
    .eq('status', 'ready')
    .not('title', 'is', null)
    .not('body', 'is', null)
    .neq('title', '')
    .neq('body', '');
}

async function fetchCoachEntries(client: any, userId: string, limit: number) {
  const { data, error } = await client
    .from('coach_entries')
    .select(COACH_ENTRY_PUBLIC_COLUMNS)
    .eq('user_id', userId)
    // F-01 (audit 2026-05-27): mirror the deleted_at filter from
    // applyReadyEntryFilters so the entries feeding the Coach idle list stay
    // consistent with the latestReadyEntry and historySummary selections.
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new Phase2HttpError(500, 'coach_entries_load_failed', 'Failed to load coach entries', error);
  }

  return Array.isArray(data) ? data : [];
}

async function fetchLatestReadyEntry(
  client: any,
  options: {
    userId: string;
    personaKey: string | null;
    locale: string | null;
  },
) {
  let query = applyReadyEntryFilters(
    client
      .from('coach_entries')
      .select(COACH_ENTRY_PUBLIC_COLUMNS)
      .eq('user_id', options.userId),
  );

  if (options.personaKey) {
    query = query.eq('persona_key', options.personaKey);
  }

  query = options.locale ? query.eq('locale', options.locale) : query.is('locale', null);

  const { data, error } = await query
    .order('generated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Phase2HttpError(
      500,
      'coach_latest_entry_load_failed',
      'Failed to load latest coach guidance',
      error,
    );
  }

  return data ?? null;
}

async function fetchRecentScanRows(client: any, userId: string) {
  const { data, error } = await client
    .from('scans')
    .select('id, scan_type, analysis_result, analyzed_at, created_at')
    .eq('user_id', userId)
    .order('analyzed_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(RECENT_SCAN_ROWS_LIMIT);

  if (error) {
    throw new Phase2HttpError(
      500,
      'coach_scans_load_failed',
      'Failed to load recent coach scans',
      error,
    );
  }

  return Array.isArray(data) ? data : [];
}

async function fetchAccountTier(
  client: any,
  userId: string,
): Promise<ScanResultTier> {
  const { data, error } = await client
    .from('user_profiles')
    .select('account_tier')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    // Fail-closed: degrade to `free` (most restrictive) rather than leaking
    // premium fields on a transient lookup failure.
    return 'free';
  }

  return resolveTierFromProfile(
    isRecord(data) ? (data as { account_tier?: unknown }).account_tier : null,
  );
}

async function fetchHistorySummary(
  client: any,
  options: {
    userId: string;
    excludeEntryId: string | null;
  },
) {
  let countQuery = applyReadyEntryFilters(
    client
      .from('coach_entries')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', options.userId),
  );
  let latestQuery = applyReadyEntryFilters(
    client
      .from('coach_entries')
      .select('generated_at, created_at')
      .eq('user_id', options.userId),
  );

  if (options.excludeEntryId) {
    countQuery = countQuery.neq('id', options.excludeEntryId);
    latestQuery = latestQuery.neq('id', options.excludeEntryId);
  }

  const [{ count, error: countError }, { data: latestEntry, error: latestError }] =
    await Promise.all([
      countQuery,
      latestQuery
        .order('generated_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  if (countError || latestError) {
    throw new Phase2HttpError(
      500,
      'coach_history_summary_load_failed',
      'Failed to load coach history summary',
      countError ?? latestError,
    );
  }

  return {
    total_count: count ?? 0,
    latest_entry_at:
      latestEntry?.generated_at ?? latestEntry?.created_at ?? null,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsError = validateCorsOrigin(req);
  if (corsError) {
    return corsError;
  }

  const requestId = createRequestId();

  try {
    if (req.method !== 'POST') {
      throw new Phase2HttpError(405, 'method_not_allowed', 'Method not allowed');
    }

    const request = parseSnapshotRequest(
      await readJsonBody(req, { maxBytes: 8 * 1024 }),
    );
    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);

    // N-D rate limit check, must run before the heavy parallel reads.
    await enforceCoachSnapshotRateLimit(client, user.id);

    const [
      entries,
      quota,
      recentScanRows,
      latestReadyEntry,
      historySummary,
      accountTier,
    ] = await Promise.all([
      fetchCoachEntries(client, user.id, request.entriesLimit),
      getCoachQuotaStatus(client, user.id),
      fetchRecentScanRows(client, user.id),
      fetchLatestReadyEntry(client, {
        userId: user.id,
        personaKey: request.personaKey,
        locale: request.locale,
      }),
      fetchHistorySummary(client, {
        userId: user.id,
        excludeEntryId: request.excludeEntryId,
      }),
      fetchAccountTier(client, user.id),
    ]);

    // Defense-in-depth: strip premium-locked fields from each scan returned
    // to a free account. The full payload remains in DB for premium analytics
    // and server-side coach context.
    const safeRecentScanRows = recentScanRows.map((row: unknown) =>
      isRecord(row) ? sanitizeScanForTier(row, accountTier) : row,
    );

    return jsonResponse(req, {
      success: true,
      entries,
      quota,
      recent_scans: safeRecentScanRows,
      latest_ready_entry: latestReadyEntry,
      history_summary: historySummary,
      request_id: requestId,
    });
  } catch (error) {
    logPhase2Error('[coach-screen-snapshot] Request failed', error, {
      request_id: requestId,
    });
    return jsonResponse(req, toPhase2ErrorPayload(error, { requestId }), {
      status: getPhase2ErrorStatus(error),
    });
  }
});
