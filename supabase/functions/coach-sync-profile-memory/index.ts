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

async function listReadyCoachEntriesForReplay(client: any, userId: string) {
  const { data, error } = await client
    .from('coach_entries')
    .select('id, user_id, content_json, generated_at, created_at')
    .eq('user_id', userId)
    .eq('status', 'ready')
    .not('content_json', 'is', null)
    .order('generated_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

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
    const readyEntries = await listReadyCoachEntriesForReplay(client, user.id);
    let appliedCount = 0;

    for (const entry of readyEntries) {
      const result = await applyCoachProfileUpdatesForEntry(client, {
        id: typeof entry.id === 'string' ? entry.id : '',
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
