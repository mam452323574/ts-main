import {
  handleCorsPreflightRequest,
  jsonResponse,
  validateCorsOrigin,
} from '../_shared/cors.ts';
import {
  applyCoachProfileUpdatesForEntry,
  readCoachProfileMemory,
} from '../_shared/coachProfileMemory.ts';
import { createServiceRoleClient, requireAuthenticatedUser } from '../_shared/phase2Auth.ts';
import {
  createPhase2DatabaseError,
  getPhase2ErrorStatus,
  Phase2HttpError,
  toPhase2ErrorPayload,
} from '../_shared/phase2Errors.ts';
import { createRequestId, logPhase2Error } from '../_shared/phase2Observability.ts';
import { isRecord } from '../_shared/phase2Utils.ts';

// N-C of COACH_SECURITY_AUDIT_2026_05.
//
// - Rate limit: 2/min, 10/h, 30/day per user. Profile-memory sync is an
//   expensive operation (1+ SQL ops per ready coach entry) so the defaults
//   are stricter than the generation / snapshot endpoints.
// - LIMIT: cap the replay list at 50 entries per call. The ledger
//   (coach_profile_update_applications) makes per-row replay idempotent, so a
//   user with > 50 ready entries simply has to call sync twice (or wait —
//   normal generations also trigger an in-line apply).
// - Idempotence pre-read: filter out entries already in the ledger BEFORE
//   the per-row loop so we avoid the upsert+rollback dance entirely.
const COACH_PROFILE_SYNC_RATE_LIMIT_PER_MINUTE = 2;
const COACH_PROFILE_SYNC_RATE_LIMIT_PER_HOUR = 10;
const COACH_PROFILE_SYNC_RATE_LIMIT_PER_DAY = 30;
const COACH_PROFILE_SYNC_RATE_LIMIT_ERROR_CODE =
  'coach_profile_sync_rate_limit_exceeded';
const COACH_PROFILE_SYNC_REPLAY_LIMIT = 50;

async function enforceCoachProfileSyncRateLimit(client: any, userId: string) {
  const { data, error } = await client.rpc('record_coach_profile_sync_attempt', {
    p_user_id: userId,
    p_per_minute: COACH_PROFILE_SYNC_RATE_LIMIT_PER_MINUTE,
    p_per_hour: COACH_PROFILE_SYNC_RATE_LIMIT_PER_HOUR,
    p_per_day: COACH_PROFILE_SYNC_RATE_LIMIT_PER_DAY,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach profile sync rate limit check',
      fallbackCode: 'coach_profile_sync_rate_limit_check_failed',
      fallbackMessage: 'Failed to evaluate coach profile sync quota',
      relationName: 'coach_profile_sync_attempts',
    });
  }

  if (isRecord(data) && data.allowed === false) {
    const windowExceeded =
      typeof data.window_exceeded === 'string' ? data.window_exceeded : 'unknown';
    throw new Phase2HttpError(
      429,
      COACH_PROFILE_SYNC_RATE_LIMIT_ERROR_CODE,
      `Coach profile sync rate limit exceeded for window: ${windowExceeded}`,
      { window_exceeded: windowExceeded },
    );
  }
}

async function listReadyCoachEntriesForReplay(
  client: any,
  userId: string,
  limit: number,
) {
  // Most recent first so the LIMIT keeps the freshest signals when a user has
  // accumulated more than `limit` ready entries.
  const { data, error } = await client
    .from('coach_entries')
    .select('id, user_id, content_json, generated_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .not('content_json', 'is', null)
    .order('generated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(limit);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach profile memory replay list',
      fallbackCode: 'coach_profile_memory_replay_list_failed',
      fallbackMessage: 'Failed to list ready coach entries for profile memory replay',
      relationName: 'coach_entries',
    });
  }

  return Array.isArray(data) ? data : [];
}

async function listAlreadyAppliedCoachEntryIds(
  client: any,
  userId: string,
  candidateIds: string[],
): Promise<Set<string>> {
  if (candidateIds.length === 0) return new Set();

  const { data, error } = await client
    .from('coach_profile_update_applications')
    .select('coach_entry_id')
    .eq('user_id', userId)
    .in('coach_entry_id', candidateIds);

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach profile memory ledger pre-read',
      fallbackCode: 'coach_profile_memory_ledger_read_failed',
      fallbackMessage: 'Failed to read the coach profile memory application ledger',
      relationName: 'coach_profile_update_applications',
    });
  }

  const rows = Array.isArray(data) ? data : [];
  const applied = new Set<string>();
  for (const row of rows) {
    if (isRecord(row) && typeof row.coach_entry_id === 'string') {
      applied.add(row.coach_entry_id);
    }
  }
  return applied;
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

    const client = createServiceRoleClient();
    const user = await requireAuthenticatedUser(client, req);

    // N-C: rate limit before the heavy reads.
    await enforceCoachProfileSyncRateLimit(client, user.id);

    const readyEntries = await listReadyCoachEntriesForReplay(
      client,
      user.id,
      COACH_PROFILE_SYNC_REPLAY_LIMIT,
    );

    // N-C idempotence pre-read: skip entries already in the ledger so we
    // never call applyCoachProfileUpdatesForEntry (and its 2 SQL ops) for
    // rows that would no-op anyway.
    const candidateIds = readyEntries
      .map((entry) => (typeof entry.id === 'string' ? entry.id : ''))
      .filter((id): id is string => id.length > 0);
    const alreadyApplied = await listAlreadyAppliedCoachEntryIds(
      client,
      user.id,
      candidateIds,
    );

    let appliedCount = 0;

    for (const entry of readyEntries) {
      const entryId = typeof entry.id === 'string' ? entry.id : '';
      if (entryId && alreadyApplied.has(entryId)) {
        continue;
      }

      const result = await applyCoachProfileUpdatesForEntry(client, {
        id: entryId,
        user_id:
          typeof entry.user_id === 'string' && entry.user_id.trim().length > 0
            ? entry.user_id
            : user.id,
        content_json: isRecord(entry.content_json) ? entry.content_json : null,
      });

      if (result.applied) {
        appliedCount += 1;
      }
    }

    const profileMemory = await readCoachProfileMemory(client, user.id);

    return jsonResponse(
      req,
      {
        success: true,
        applied_count: appliedCount,
        profile_memory: profileMemory,
      },
      { status: 200 },
    );
  } catch (error) {
    logPhase2Error('[coach-sync-profile-memory] request failed', error, {
      request_id: requestId,
    });

    const phase2Error =
      error instanceof Phase2HttpError
        ? error
        : new Phase2HttpError(
            500,
            'coach_profile_memory_sync_failed',
            'Coach profile memory sync failed',
          );

    return jsonResponse(req, toPhase2ErrorPayload(phase2Error, requestId), {
      status: getPhase2ErrorStatus(phase2Error),
    });
  }
});
