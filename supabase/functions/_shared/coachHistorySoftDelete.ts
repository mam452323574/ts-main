// PROMPT 6 — soft-delete RPC bridges for the unified Coach history UX.
//
// Each helper proxies a SECURITY DEFINER RPC declared in
// 20260527120100_add_coach_history_soft_delete_rpcs.sql. They are intentionally
// thin: input validation is enforced by the calling Edge Function (UUID
// regex + JWT-derived user_id) and the RPC itself checks ownership via the
// (id, user_id) predicate.

import { createPhase2DatabaseError, Phase2HttpError } from './phase2Errors.ts';
import { isRecord, readOptionalBoolean, readOptionalString } from './phase2Utils.ts';

export interface CoachHistorySoftDeleteResult {
  success: boolean;
  updated: boolean;
}

export interface CoachEntryRestoreResult extends CoachHistorySoftDeleteResult {
  /**
   * Set when the restore was refused because another live entry already owns
   * the same (user_id, cache_key) tuple. The conflicting entry id is exposed
   * so the UI can surface a "regenerate" affordance instead.
   */
  code?: 'coach_entry_restore_cache_key_conflict' | null;
  blocked_by?: string | null;
}

function normaliseResult(data: unknown, contextLabel: string): CoachHistorySoftDeleteResult {
  if (!isRecord(data)) {
    throw new Phase2HttpError(
      502,
      'coach_history_soft_delete_invalid_response',
      `${contextLabel} returned an invalid payload`,
    );
  }
  return {
    success: readOptionalBoolean(data.success) === true,
    updated: readOptionalBoolean(data.updated) === true,
  };
}

function normaliseRestoreResult(data: unknown, contextLabel: string): CoachEntryRestoreResult {
  const base = normaliseResult(data, contextLabel);
  if (!isRecord(data)) return base;
  return {
    ...base,
    code:
      (readOptionalString(data.code) as
        | CoachEntryRestoreResult['code']
        | undefined) ?? null,
    blocked_by: readOptionalString(data.blocked_by) ?? null,
  };
}

export async function deleteCoachEntry(
  client: any,
  options: { entryId: string; userId: string },
): Promise<CoachHistorySoftDeleteResult> {
  const { data, error } = await client.rpc('delete_coach_entry', {
    p_entry_id: options.entryId,
    p_user_id: options.userId,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach entry soft-delete',
      fallbackCode: 'coach_entry_delete_failed',
      fallbackMessage: 'Failed to delete coach entry',
      relationName: 'coach_entries',
      rpcName: 'delete_coach_entry',
    });
  }

  return normaliseResult(data, 'Coach entry soft-delete');
}

export async function restoreCoachEntry(
  client: any,
  options: { entryId: string; userId: string },
): Promise<CoachEntryRestoreResult> {
  const { data, error } = await client.rpc('restore_coach_entry', {
    p_entry_id: options.entryId,
    p_user_id: options.userId,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach entry restore',
      fallbackCode: 'coach_entry_restore_failed',
      fallbackMessage: 'Failed to restore coach entry',
      relationName: 'coach_entries',
      rpcName: 'restore_coach_entry',
    });
  }

  return normaliseRestoreResult(data, 'Coach entry restore');
}

export async function deleteCoachConversation(
  client: any,
  options: { conversationId: string; userId: string },
): Promise<CoachHistorySoftDeleteResult> {
  const { data, error } = await client.rpc('delete_coach_conversation', {
    p_conversation_id: options.conversationId,
    p_user_id: options.userId,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation soft-delete',
      fallbackCode: 'coach_conversation_delete_failed',
      fallbackMessage: 'Failed to delete coach conversation',
      relationName: 'coach_conversations',
      rpcName: 'delete_coach_conversation',
    });
  }

  return normaliseResult(data, 'Coach conversation soft-delete');
}

export async function restoreCoachConversation(
  client: any,
  options: { conversationId: string; userId: string },
): Promise<CoachHistorySoftDeleteResult> {
  const { data, error } = await client.rpc('restore_coach_conversation', {
    p_conversation_id: options.conversationId,
    p_user_id: options.userId,
  });

  if (error) {
    throw createPhase2DatabaseError(error, {
      contextLabel: 'Coach conversation restore',
      fallbackCode: 'coach_conversation_restore_failed',
      fallbackMessage: 'Failed to restore coach conversation',
      relationName: 'coach_conversations',
      rpcName: 'restore_coach_conversation',
    });
  }

  return normaliseResult(data, 'Coach conversation restore');
}
