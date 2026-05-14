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
  readJsonBody,
} from '../_shared/phase2Utils.ts';
import { isCoachPersonaKey } from '../../../shared/coachPersonas.ts';

const DEFAULT_ENTRIES_LIMIT = 10;
const MAX_ENTRIES_LIMIT = 20;
const RECENT_SCAN_ROWS_LIMIT = 64;

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
  return query
    .eq('status', 'ready')
    .not('title', 'is', null)
    .not('body', 'is', null)
    .neq('title', '')
    .neq('body', '');
}

async function fetchCoachEntries(client: any, userId: string, limit: number) {
  const { data, error } = await client
    .from('coach_entries')
    .select('*')
    .eq('user_id', userId)
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
      .select('*')
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

    const [
      entries,
      quota,
      recentScanRows,
      latestReadyEntry,
      historySummary,
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
    ]);

    return jsonResponse(req, {
      success: true,
      entries,
      quota,
      recent_scans: recentScanRows,
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
